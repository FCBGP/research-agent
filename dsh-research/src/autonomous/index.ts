// 阶段 4 · 第 17 项 — autonomous research loop：一键跑完整科研流水线。
//
//   topic → 任务 DAG → Director（检索/假设/实验/验证/写作）
//         → 真实实验战役（runCampaign，确定性模拟拓扑）
//         → 【实验矩阵】4 攻击 × 4 验证策略候选战役（runCampaign 逐格）
//         → 验证折入 claim → Writer 出论文 + 幻灯片（含矩阵小结）→ 归档
//
// 复用全部既有层（core/ memory/ agents/ director/ experiment/ writer/ roles/ model-router），
// 本文件只做「编排」，不引入新领域逻辑；纯函数、可测。
import type { ResearchGoal, ResearchTask, ResearchClaim, Verdict, ExperimentResult } from '../core/types.ts';
import { addEvidence, synthConfidence } from '../core/claim.ts';
import { runVerification } from '../core/verification.ts';
import { ResearchDirector } from '../research-director/director.ts';
import { createMemory, persistMemory, type ResearchMemory } from '../memory/index.ts';
import { createAgents, type ResearchAgents } from '../agents/index.ts';
import { runCampaign, type CampaignReport } from '../experiment/runner.ts';
import { createWriter, type ResearchWriter } from '../writer/index.ts';
import { TASK_ROLE } from '../roles/index.ts';
import { ModelRouter } from '../model-router/index.ts';
import type { ValidatorMode, AttackClass } from '../experiment/topology.ts';

export interface MatrixOptions {
  validators?: ValidatorMode[];   // 缺省 4 策略：none / rov / bgpsec / rov+bgpsec
  attacks?: AttackClass[];        // 缺省 4 攻击：prefix/subprefix-hijack / as-set-injection / path-manipulation
  repetitions?: number;           // 每格轮数（缺省 input.repetitions ?? 2）
}

export interface MatrixCell {
  attack: AttackClass;
  validator: ValidatorMode;
  detection: number;              // 检测率均值
  falsePositive: number;          // 误报率均值
  outcome: ExperimentResult['outcome'];
  verdict: Verdict;
}

export interface CampaignMatrix {
  attacks: AttackClass[];
  validators: ValidatorMode[];
  cells: MatrixCell[];
}

export interface AutonomousInput {
  topic: string;
  hypothesis?: string;          // 可选中心假设
  paperTitle?: string;
  env?: 'frr' | 'vpp' | 'sim';
  repetitions?: number;
  validator?: ValidatorMode;
  supportThreshold?: number;
  seed?: number;
  /** 实验矩阵：false 关闭；对象可裁剪攻击/验证策略集合与每格轮数（缺省 4×4）。 */
  matrix?: MatrixOptions | false;
  /** 可选：流水线结束后把五类记忆（含论文/幻灯片/矩阵 artifact）落盘到该目录。 */
  memoryDir?: string;
}

export interface AutonomousReport {
  goalId: string;
  topic: string;
  claimVerdicts: Record<string, Verdict>;
  artifacts: string[];
  paper: string;                // markdown 论文
  slides: string;               // marp 幻灯片
  campaign?: CampaignReport;
  matrix?: CampaignMatrix;      // 实验矩阵（每条战役各 attack×validator 的检测率/判定）
  episodes: number;
  summary: string;
}

const DEFAULT_MATRIX_VALIDATORS: ValidatorMode[] = ['none', 'rov', 'bgpsec', 'rov+bgpsec'];
const DEFAULT_MATRIX_ATTACKS: AttackClass[] = ['prefix-hijack', 'subprefix-hijack', 'as-set-injection', 'path-manipulation'];

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

  // 2.5) 实验矩阵：把「主假设 + 备选机制」在 4 攻击 × 4 验证策略网格上系统对照
  //      （input.matrix === false 关闭；缺省跑全网格），逐格战役全部归档进 memory。
  const matrixResult = runCampaignMatrix(memory, agents.experiment, primary, input);
  const matrix = matrixResult?.matrix;

  // 3) 全量验证扫描（写入 hypothesis/artifact 记忆）
  directive('verify', TASK_ROLE['verify']);
  const claimVerdicts: Record<string, Verdict> = {};
  for (const c of goal.claims) {
    const v = runVerification(c);
    claimVerdicts[c.id] = c.verificationStatus === 'pending' ? v.verdict : c.verificationStatus;
    if (c.verificationStatus === 'pending') c.verificationStatus = v.verdict;
  }

  // 4) 写作：论文 + 幻灯片（论文含实验矩阵小结）
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
    experimentMatrix: matrix ? {
      attacks: matrix.attacks,
      validators: matrix.validators,
      cells: matrix.cells.map((c) => ({ attack: c.attack, validator: c.validator, detection: c.detection, falsePositive: c.falsePositive, outcome: c.outcome, verdict: c.verdict })),
    } : undefined,
  };
  const paper = writer.paper(paperInput);
  const slides = writer.slides(paperInput);
  directive('review', TASK_ROLE['verify']);
  const paperInv = memory.artifact.put({ kind: 'report', title: paper.title, body: paper.markdown, meta: { kind: 'paper' } });
  const slideInv = memory.artifact.put({ kind: 'report', title: `${paper.title} · slides`, body: slides.markdown, meta: { kind: 'slides' } });

  const artifacts = [...run.artifacts, ...(campaign?.artifacts ?? []), paperInv.id, slideInv.id, ...(matrixResult ? [matrixResult.artifactId] : [])];

  // 5) 落盘（可选）：显式 memoryDir 优先；否则运行时 memory 自带 persist（plugin-core
  //    配置 memory.dir 时挂上）→ 五类记忆 + 论文/幻灯片/矩阵 artifact 持久化归档。
  const mem = memory as ResearchMemory & { persist?(dir?: string): string | undefined };
  if (input.memoryDir) persistMemory(memory, input.memoryDir);
  else if (typeof mem.persist === 'function') mem.persist?.();

  return {
    goalId: goal.id,
    topic: input.topic,
    claimVerdicts,
    artifacts,
    paper: paper.markdown,
    slides: slides.markdown,
    campaign,
    matrix,
    episodes: memory.episodic.all().length,
    summary: `「${input.topic}」共 ${goal.claims.length} 条 claim` +
      `（${Object.values(claimVerdicts).filter((v) => v === 'verified').length} 已核验）` +
      `、${paper.stats.experiments} 项战役` +
      `（其中实验矩阵 ${matrix?.cells.length ?? 0} 格）、${artifacts.length} 个 artifact；论文与幻灯片已生成。`,
  };
}

export interface CampaignMatrixResult {
  matrix: CampaignMatrix;
  artifactId: string;   // 归档的矩阵结果 artifact id（进 report.artifacts 可追溯）
}

/** 运行实验矩阵：attack × validator 网格上逐格跑一场独立战役，聚合检测率与判定。 */
export function runCampaignMatrix(
  memory: ResearchMemory,
  agent: Parameters<typeof runCampaign>[1],
  primary: ResearchClaim | undefined,
  input: AutonomousInput & { matrix?: MatrixOptions | false },
): CampaignMatrixResult | undefined {
  if (input.matrix === false) return undefined;
  if (!primary) return undefined;
  const attacks = input.matrix?.attacks ?? DEFAULT_MATRIX_ATTACKS;
  const validators = input.matrix?.validators ?? DEFAULT_MATRIX_VALIDATORS;
  const reps = input.matrix?.repetitions ?? input.repetitions ?? 2;
  const cells: MatrixCell[] = [];
  for (const attack of attacks) {
    for (const validator of validators) {
      const c = runCampaign(memory, agent, {
        claim: { id: primary.id, statement: primary.statement },
        env: input.env ?? 'sim',
        repetitions: reps,
        validator,
        attackClass: attack,
        supportThreshold: input.supportThreshold,
        seed: input.seed,
      });
      cells.push({
        attack,
        validator,
        detection: c.detection.mean,
        falsePositive: c.detection.falsePositive.mean,
        outcome: c.outcome,
        verdict: c.verdict,
      });
    }
  }
  const matrix: CampaignMatrix = { attacks, validators, cells };
  memory.episodic.record({
    kind: 'experiment',
    summary: `实验矩阵 ${attacks.join('+')} × ${validators.join('+')} = ${cells.length} 格（claim ${primary.id}）`,
    claimId: primary.id,
    outcome: cells.some((c) => c.outcome === 'support') ? 'support' : cells.some((c) => c.outcome === 'refute') ? 'refute' : 'inconclusive',
    source: 'campaign-matrix',
  });
  const art = memory.artifact.put({
    kind: 'result',
    title: `experiment matrix: ${primary.id}`,
    body: JSON.stringify(matrix),
    claimId: primary.id,
    meta: { kind: 'matrix', attacks, validators, cells: cells.length },
  });
  return { matrix, artifactId: art.id };
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
