// runner.ts — 自动实验流水线（TODO 阶段 3 · 第 12 项）：
//
//   deploy → run(×repetitions) → collect → analyze → verify → archive
//
// 收敛四口径统计（stats.ts）并把实验结果折入 claim 验证（support/refute → verdict），
// 全部写入 ResearchMemory（episodic + artifact），返回结构化 CampaignReport。
import type { ExperimentResult, Verdict } from '../core/types.ts';
import type { ExperimentPlan } from '../agents/experiment.ts';
import type { ResearchMemory } from '../memory/index.ts';
import type { Executor } from '../agents/experiment.ts';
import { newClaim, addEvidence } from '../core/claim.ts';
import { runVerification } from '../core/verification.ts';
import { TopologyExecutor } from './executors.ts';
import { topologyForEnv, type TopologyConfig, type ValidatorMode, type AttackClass } from './topology.ts';
import { summarizeDetection, metricsFromResults, type DetectionStats, type SeriesStats } from './stats.ts';

export interface CampaignOptions {
  claim: { id: string; statement: string };
  plan: ExperimentPlan;
  executor?: Executor;                 // 默认 TopologyExecutor(RouteEngineSim)
  topologyConfig?: TopologyConfig;     // 透传给默认拓扑（validator/seed/asCount…）
  validator?: ValidatorMode;
  supportThreshold?: number;
  evidenceConfidence?: number;         // 写回 claim 的实验证据置信度（默认 0.8）
  memory?: ResearchMemory;             // 提供时写入 episodic + artifact 归档
}

export interface CampaignReport {
  plan: ExperimentPlan;
  results: ExperimentResult[];
  stats: Record<string, SeriesStats>;  // 四口径批量统计
  detection: DetectionStats;           // 检测/误报合成口径
  outcome: ExperimentResult['outcome'];
  verdict: Verdict;
  rationale: string;
  artifacts: string[];                 // 归档的 artifact id
}

export function runAutomaticExperiment(opts: CampaignOptions): CampaignReport {
  // 无显式 executor 时，按 plan.env 选拓扑执行源（TODO「真实网元验证」）：
  //   sim → RouteEngineSim；frr/vpp → 真实守护进程适配器（缺失回退 adapter-sim，
  //   引擎如实标记 *-adapter-sim / simulated=true）。此前 env 只是计划元数据，
  //   executor 恒用 RouteEngineSim，即使目标机装好 FRR 也不会接管 —— 已修复。
  const executor = opts.executor ?? new TopologyExecutor({
    topology: topologyForEnv(opts.plan.env ?? 'sim', opts.topologyConfig),
    validator: opts.validator,
    // attackClass 必须显式透传：否则 TopologyExecutor 默认用 inferAttack(plan.scenario)
    // 重算攻击类，会覆盖调用方显式指定的 attackClass（art-11 缺陷）。
    attack: opts.topologyConfig?.attack,
    supportThreshold: opts.supportThreshold,
  });

  // deploy + run × repetitions（TopologyExecutor 首次 run 即 deploy，之后每次 run 注入一轮）
  const results: ExperimentResult[] = [];
  try {
    for (let i = 0; i < (opts.plan.repetitions ?? 1); i += 1) results.push(executor.run(opts.plan));
  } finally {
    if (executor instanceof TopologyExecutor) executor.teardown();
  }

  // collect → analyze
  const stats = metricsFromResults(results);
  const rows = results
    .map((r) => ({
      detectionRate: r.data.detection_rate as number,
      falsePositiveRate: r.data.false_positive_rate as number,
    }))
    .filter((r) => Number.isFinite(r.detectionRate) && Number.isFinite(r.falsePositiveRate));
  const detection = summarizeDetection(rows);
  const agg = results[0];
  const outcome: ExperimentResult['outcome'] = detection.mean >= (opts.supportThreshold ?? 0.8)
    ? 'support' : detection.mean <= 0.4 ? 'refute' : 'inconclusive';
  const aggregate: ExperimentResult = {
    experiment: opts.plan.configFingerprint,
    claim: opts.plan.claimId,
    outcome,
    data: {
      engine: agg?.data.engine,
      env: opts.plan.env,
      simulated: agg?.data.simulated,
      det_mean: detection.mean,
      fp_mean: detection.falsePositive.mean,
      sample_size: results.length,
    },
    archivedAt: new Date().toISOString(),
  };

  // verify：证据 + 实验 → verdict
  const claim = newClaim({ statement: opts.claim.statement, type: 'Hypothesis', source: 'experiment' });
  const withEvidence = addEvidence(claim, {
    source: `experiment:${opts.plan.configFingerprint}`,
    evidence: `重复 ${results.length} 轮，detection=${detection.mean}，false_positive=${detection.falsePositive.mean}`,
    confidence: opts.evidenceConfidence ?? 0.8,
    verified: outcome === 'support',
  });
  const report = runVerification(withEvidence, aggregate);

  // archive（可选 memory）
  const artifacts: string[] = [];
  if (opts.memory) {
    opts.memory.episodic.record({
      kind: 'experiment',
      summary: `实验 ${opts.plan.configFingerprint}（${opts.plan.scenario} × ${results.length}）`,
      claimId: opts.plan.claimId,
      outcome: aggregate.outcome,
      source: String(aggregate.data.engine),
    });
    const expArt = opts.memory.artifact.put({
      kind: 'experiment',
      title: `campaign: ${opts.plan.configFingerprint}`,
      body: JSON.stringify({ results, stats: snapshot(stats), detection }),
      claimId: opts.plan.claimId,
      meta: { env: opts.plan.env, outcome: aggregate.outcome, n: results.length, engine: aggregate.data.engine },
    });
    const verdictArt = opts.memory.artifact.put({
      kind: 'result',
      title: `campaign verdict: ${opts.claim.id}`,
      body: report.rationale,
      claimId: opts.plan.claimId,
      meta: { verdict: report.verdict, outcome: aggregate.outcome },
    });
    artifacts.push(expArt.id, verdictArt.id);
  }

  return { plan: opts.plan, results, stats, detection, outcome, verdict: report.verdict, rationale: report.rationale, artifacts };
}

function snapshot(stats: Record<string, SeriesStats>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(stats)) out[k] = { mean: v.mean, stddev: v.stddev, ci95: v.ci95 };
  return out;
}

// —— 面向插件/调度的便捷入口：由 claim 文本 + 执行参数直接发起一场战役 ——
export interface CampaignSpec {
  claim: { id: string; statement: string };
  env?: 'frr' | 'vpp' | 'sim';
  repetitions?: number;
  validator?: ValidatorMode;
  attackClass?: AttackClass;
  asCount?: number;
  seed?: number;
  supportThreshold?: number;
  executor?: Executor;
}

export function runCampaign(
  memory: ResearchMemory,
  agent: Pick<ExperimentAgentLike, 'plan'>,
  spec: CampaignSpec,
): CampaignReport {
  const plan = agent.plan({
    claimId: spec.claim.id,
    claimStatement: spec.claim.statement,
    env: spec.env ?? 'frr',
    repetitions: spec.repetitions ?? 3,
  });
  return runAutomaticExperiment({
    claim: spec.claim,
    plan,
    memory,
    executor: spec.executor,
    validator: spec.validator,
    supportThreshold: spec.supportThreshold,
    topologyConfig: { seed: spec.seed ?? 1, attack: spec.attackClass, asCount: spec.asCount },
  });
}

// plan 入参形状（避免强依赖 ExperimentAgent 类，保持薄耦合）。
export interface ExperimentAgentLike {
  plan(input: { claimId: string; claimStatement: string; env?: string; repetitions?: number }): ExperimentPlan;
}
