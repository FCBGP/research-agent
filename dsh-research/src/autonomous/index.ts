// 阶段 4 · 第 17 项 — autonomous research loop：一键跑完整科研流水线。
//
//   topic → 任务 DAG → Director（检索/假设/实验/验证/写作）
//         → 真实实验战役（runCampaign，确定性模拟拓扑）
//         → 验证折入 claim → Writer 出论文 + 幻灯片 → 归档
//
// 复用全部既有层（core/ memory/ agents/ director/ experiment/ writer/ roles/ model-router），
// 本文件只做「编排」，不引入新领域逻辑；纯函数、可测。
import type { ResearchGoal, ResearchTask, ResearchClaim, Verdict, ExperimentResult } from '../core/types.ts';
import { addEvidence, synthConfidence } from '../core/claim.ts';
import { runVerification } from '../core/verification.ts';
import { ResearchDirector } from '../research-director/director.ts';
import { createMemory, type ResearchMemory } from '../memory/index.ts';
import { createAgents, type ResearchAgents } from '../agents/index.ts';
import { runCampaign, type CampaignReport } from '../experiment/runner.ts';
import { createWriter, type ResearchWriter } from '../writer/index.ts';
import { TASK_ROLE } from '../roles/index.ts';
import { ModelRouter } from '../model-router/index.ts';
import type { ValidatorMode } from '../experiment/topology.ts';

export interface AutonomousInput {
  topic: string;
  hypothesis?: string;          // 可选中心假设
  paperTitle?: string;
  env?: 'frr' | 'vpp' | 'sim';
  repetitions?: number;
  validator?: ValidatorMode;
  supportThreshold?: number;
  seed?: number;
}

export interface AutonomousReport {
  goalId: string;
  topic: string;
  claimVerdicts: Record<string, Verdict>;
  artifacts: string[];
  paper: string;                // markdown 论文
  slides: string;               // marp 幻灯片
  campaign?: CampaignReport;
  episodes: number;
  summary: string;
}

/** 由 topic 构建研究目标与任务 DAG：read → hypothesis → experiment → verify → write。 */
export function buildGoal(topic: string, hypothesis?: string): ResearchGoal {
  const h = hypothesis ?? `研究「${topic}」的安全缺口，并评估 ROV/BGPsec 机制对其的缓解效果`;
  const tasks: ResearchTask[] = [
    { id: 't1', goal: 'g-auto', title: `${topic} 文献与背景调研`, kind: 'read', produceClaims: ['c-lit'], consumesClaims: [], gain: 0.3, status: 'ready' },
    { id: 't2', goal: 'g-auto', title: h, kind: 'hypothesis', produceClaims: ['c-h'], consumesClaims: ['c-lit'], gain: 0.5, status: 'blocked' },
    { id: 't3', goal: 'g-auto', title: `${h} 实验验证`, kind: 'experiment', produceClaims: [], consumesClaims: ['c-h'], gain: 0.6, status: 'blocked' },
    { id: 't4', goal: 'g-auto', title: `${h} 验证闭环`, kind: 'verify', produceClaims: [], consumesClaims: ['c-h'], gain: 0.4, status: 'blocked' },
    { id: 't5', goal: 'g-auto', title: `${topic} 论文写作`, kind: 'write', produceClaims: [], consumesClaims: ['c-h'], gain: 0.2, status: 'blocked' },
  ];
  return { id: 'g-auto', hypothesis: h, tasks, claims: [], experiments: [], results: [], verification: [], counterexamples: [], status: 'active' };
}

/** 一键流水线（注入 memory/agents/writer；缺省时自建）。 */
export function runAutonomousResearch(
  input: AutonomousInput,
  deps: { memory?: ResearchMemory; agents?: ResearchAgents; writer?: ResearchWriter; router?: ModelRouter } = {},
): AutonomousReport {
  const memory = deps.memory ?? createMemory();
  const agents = deps.agents ?? createAgents({ memory });
  const writer = deps.writer ?? createWriter();
  const router = deps.router ?? new ModelRouter();

  const directive = (phase: string, role: string) => {
    const route = router.route(role as Parameters<ModelRouter['route']>[0]);
    memory.episodic.record({ kind: 'decision', summary: `phase:${phase} role:${role}`, meta: { model: `${route.provider}/${route.model}` } });
  };

  // 1) DAG 调度（Director）
  const goal = buildGoal(input.topic, input.hypothesis);
  directive('plan', 'director');
  const director = new ResearchDirector(memory, agents);
  const run = director.run(goal, { withExperiment: true });
  directive('director', 'director');

  // 2) 真实实验战役（确定性模拟拓扑）
  let campaign: CampaignReport | undefined;
  const hypos = goal.claims.filter((c) => c.type === 'Hypothesis');
  const primary = hypos[0];
  if (primary) {
    directive('experiment', TASK_ROLE['experiment']);
    campaign = runCampaign(memory, agents.experiment, {
      claim: { id: primary.id, statement: primary.statement },
      env: input.env ?? 'sim',
      repetitions: input.repetitions ?? 3,
      validator: input.validator,
      supportThreshold: input.supportThreshold,
      seed: input.seed,
    });
    // 把实验证据与战役 verdict 折入主假设 claim
    const withExp = addEvidence(primary, {
      source: `experiment:${campaign.plan.configFingerprint}`,
      evidence: `campaign ${campaign.plan.repetitions} 轮：detection=${campaign.detection.mean}，fp=${campaign.detection.falsePositive.mean}`,
      confidence: 0.85,
      verified: campaign.outcome === 'support',
    });
    const agg: ExperimentResult = {
      experiment: campaign.plan.configFingerprint,
      claim: primary.id,
      outcome: campaign.outcome,
      data: { det_mean: campaign.detection.mean, fp_mean: campaign.detection.falsePositive.mean, n: campaign.results.length },
      archivedAt: new Date().toISOString(),
    };
    const v = runVerification(withExp, agg);
    primary.verificationStatus = v.verdict;
    primary.verdictRationale = v.rationale;
    primary.evidence = withExp.evidence;
    primary.confidence = synthConfidence(withExp);
    memo(primary, v.verdict, v.rationale, memory);
  }

  // 3) 全量验证扫描（写入 hypothesis/artifact 记忆）
  directive('verify', TASK_ROLE['verify']);
  const claimVerdicts: Record<string, Verdict> = {};
  for (const c of goal.claims) {
    const v = runVerification(c);
    claimVerdicts[c.id] = c.verificationStatus === 'pending' ? v.verdict : c.verificationStatus;
    if (c.verificationStatus === 'pending') c.verificationStatus = v.verdict;
  }

  // 4) 写作：论文 + 幻灯片
  directive('write', TASK_ROLE['write']);
  const paperInput = {
    title: input.paperTitle ?? `研究：${input.topic}`,
    researchQuestion: input.topic,
    hypothesis: goal.hypothesis,
    contextNotes: goal.claims.filter((c) => c.type === 'Fact').map((c) => c.statement),
    claims: goal.claims.map((c) => ({
      id: c.id, statement: c.statement, type: c.type, confidence: c.confidence,
      verificationStatus: c.verificationStatus, source: c.source,
      evidence: c.evidence, counterEvidence: c.counterEvidence,
    })),
    experiments: experimentsFor(goal, campaign),
  };
  const paper = writer.paper(paperInput);
  const slides = writer.slides(paperInput);
  directive('review', TASK_ROLE['verify']);
  const paperInv = memory.artifact.put({ kind: 'report', title: paper.title, body: paper.markdown, meta: { kind: 'paper' } });
  const slideInv = memory.artifact.put({ kind: 'report', title: `${paper.title} · slides`, body: slides.markdown, meta: { kind: 'slides' } });

  const artifacts = [...run.artifacts, ...(campaign?.artifacts ?? []), paperInv.id, slideInv.id];
  return {
    goalId: goal.id,
    topic: input.topic,
    claimVerdicts,
    artifacts,
    paper: paper.markdown,
    slides: slides.markdown,
    campaign,
    episodes: memory.episodic.all().length,
    summary: `「${input.topic}」共 ${goal.claims.length} 条 claim` +
      `（${Object.values(claimVerdicts).filter((v) => v === 'verified').length} 已核验）` +
      `、${paper.stats.experiments} 项实验、${artifacts.length} 个 artifact；论文与幻灯片已生成。`,
  };
}

function experimentsFor(goal: ResearchGoal, campaign?: CampaignReport): Array<{
  claimId: string; configFingerprint: string; scenario: string;
  outcome: ExperimentResult['outcome']; verdict?: Verdict; stats?: Record<string, number>; engine?: string;
}> {
  const out: Array<{
    claimId: string; configFingerprint: string; scenario: string;
    outcome: ExperimentResult['outcome']; verdict?: Verdict; stats?: Record<string, number>; engine?: string;
  }> = goal.experiments.map((e) => ({ claimId: e.claim, configFingerprint: e.experiment, scenario: 'route-hijack', outcome: e.outcome }));
  if (campaign) {
    out.push({
      claimId: campaign.plan.claimId,
      configFingerprint: campaign.plan.configFingerprint,
      scenario: campaign.plan.scenario,
      outcome: campaign.outcome,
      verdict: campaign.verdict,
      engine: String(campaign.results[0]?.data.engine ?? 'route-engine-sim'),
      stats: {
        detection_rate: campaign.detection.mean,
        false_positive_rate: campaign.detection.falsePositive.mean,
        convergence_time: campaign.stats.convergence_time?.mean,
        verification_latency: campaign.stats.verification_latency?.mean,
      },
    });
  }
  return out;
}

function memo(c: ResearchClaim, verdict: Verdict, rationale: string, memory: ResearchMemory): void {
  memory.episodic.record({ kind: 'verify', summary: `${c.id} → ${verdict}`, claimId: c.id, outcome: verdict, meta: { rationale } });
  memory.artifact.put({ kind: 'result', title: `verdict: ${c.id}`, body: rationale, claimId: c.id, meta: { verdict } });
}
