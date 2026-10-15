// src/triza/trace.ts — 阶段 9 · TRIZa 闭环：可追溯记录（traceability artifacts）。
//
// 论文对口（docs/2610.04555v1.pdf，§3.4 / Appendix A）：
//   - triz_context.json   —— 矛盾记录（contradiction / improving / worsening / principle set / sources）
//   - triz_strategy_plan.md —— 类型化变换计划（声明的变换、参数、禁止变更、所需证据）
//   - scores.jsonl        —— 追加式评估记录（parent/candidate、protocol ID、变换、种子、
//                            指标、FI 界、证据等级、门、决策）
//   - SHA256SUMS.txt      —— 逐文件字节摘要（文件身份与完整性）
// 每一条执行都落在「claim-linked」记录上；被拒绝的候选留在档案并标注原因。
// 本模块纯函数 / 可测；被 src/triza/index.ts 的 researchTriza 服务消费并落 artifact。
import { createHash } from 'node:crypto';
import type { FrozenContract } from './contract.ts';
import type { TypedTransformationDetail } from './typed.ts';
import type { PromotionDecision } from './promotion.ts';

/** triz_context.json 形状（R 记录：矛盾 + 原理集 + 来源标注）。 */
export interface TrizContextRecord {
  claimId: string;
  task: string;
  problem: string;
  contradiction: { improving: string; worsening: string };
  principles: { no: number; name: string }[];
  sources: string[];
  protocolFingerprint: string;
}

/** triz_strategy_plan.md 的段（声明变换、参数、禁止变更、所需证据）。 */
export interface StrategyPlanRecord {
  claimId: string;
  fingerprint: string;
  declaredTransformations: Array<{
    principleNo: number;
    opType: string;
    admissibleArgs: string[];
    prohibitedChanges: string[];
    evidenceObligations: string[];
  }>;
}

/** scores.jsonl 的一条追加记录（append-only）。 */
export interface ScoreLine {
  ts: string;
  parentId?: string;
  candidateId: string;
  claimId: string;
  protocolFingerprint: string;
  transformations: string[];
  seeds: number[];
  metrics: Record<string, number>;
  fi: { usefulFI: number; harmfulFI: number; usefulFI_LB: number; harmfulFI_UB: number; ideality: number };
  evidenceLevel: number;
  certification: { level: number; label: string };
  gates: Record<string, boolean>;
  promotion: PromotionDecision['promotion'];
  reason: string;
}

/** 一次闭环执行产出的追溯包（对应 A.1 文件集；落 artifact 时拼接为文本）。 */
export interface TraceBundle {
  trizContext: TrizContextRecord;
  strategyPlan: StrategyPlanRecord;
  /** 追加式评估记录：追加一条 scoreLine 的 JSON 文本。 */
  scoresJsonl: string;
  sha256sums: Record<string, string>;
}

/** 构造 triz_context.json 记录。 */
export function trizContextRecord(input: {
  contract: FrozenContract;
  principles: { no: number; name: string }[];
  sources?: string[];
}): TrizContextRecord {
  return {
    claimId: input.contract.claimId,
    task: input.contract.task,
    problem: input.contract.problem,
    contradiction: input.contract.contradiction,
    principles: input.principles,
    sources: input.sources && input.sources.length > 0 ? input.sources : ['curated TRIZ mapping (route-security adaptation, non-authoritative)'],
    protocolFingerprint: '', // 由调用方在 bundle 层回填（见 createTraceBundle）
  };
}

/** 构造 triz_strategy_plan.md 记录（仅声明变换，不含执行结果）。 */
export function strategyPlanRecord(input: {
  claimId: string;
  fingerprint: string;
  plans: TypedTransformationDetail[];
}): StrategyPlanRecord {
  return {
    claimId: input.claimId,
    fingerprint: input.fingerprint,
    declaredTransformations: input.plans.map((p) => ({
      principleNo: p.principleNo,
      opType: p.opType,
      admissibleArgs: p.admissibleArgs,
      prohibitedChanges: p.prohibitedChanges,
      evidenceObligations: p.evidenceObligations,
    })),
  };
}

/** scores.jsonl 追加一行（canonical JSON 文本 + 换行；append-only 语义由调用方保证）。 */
export function scoreLine(input: {
  contract: FrozenContract;
  decision: PromotionDecision;
  candidateId: string;
  parentId?: string;
  transformations: string[];
  seeds: number[];
}): string {
  const d = input.decision;
  const line: ScoreLine = {
    ts: new Date().toISOString(),
    parentId: input.parentId,
    candidateId: input.candidateId,
    claimId: input.contract.claimId,
    protocolFingerprint: input.contract && d.contractFingerprint,
    transformations: input.transformations,
    seeds: input.seeds,
    metrics: d.fi && d.relativeGainPct !== undefined ? { relative_gain_pct: d.relativeGainPct } : {},
    fi: d.fi,
    evidenceLevel: d.fi?.n ?? 0,
    certification: d.certification,
    gates: Object.fromEntries(d.gateFailures.map((g) => [g.id, g.pass])),
    promotion: d.promotion,
    reason: d.reason,
  };
  return `${JSON.stringify(line)}\n`;
}

/** 对若干记录求 SHA-256 摘要（SHA256SUMS.txt 语义：文件身份与完整性）。 */
export function sha256sums(records: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, body] of Object.entries(records)) {
    out[name] = createHash('sha256').update(body).digest('hex');
  }
  return out;
}

/** 一次性构造完整追溯包（triz_context + strategy_plan + scores 追加行 + 摘要）。 */
export function createTraceBundle(input: {
  contract: FrozenContract;
  fingerprint: string;
  principles: { no: number; name: string }[];
  plans: TypedTransformationDetail[];
  decision: PromotionDecision;
  candidateId: string;
  parentId?: string;
  seeds: number[];
  sources?: string[];
}): TraceBundle {
  const ctxRecord = trizContextRecord({ contract: input.contract, principles: input.principles, sources: input.sources });
  ctxRecord.protocolFingerprint = input.fingerprint;
  const plan = strategyPlanRecord({ claimId: input.contract.claimId, fingerprint: input.fingerprint, plans: input.plans });
  const scores = scoreLine({
    contract: input.contract,
    decision: input.decision,
    candidateId: input.candidateId,
    parentId: input.parentId,
    transformations: input.plans.map((p) => p.opType),
    seeds: input.seeds,
  });
  const records: Record<string, string> = {
    'triz_context.json': JSON.stringify(ctxRecord, null, 2),
    'triz_strategy_plan.md': renderStrategyPlanMd(plan),
    'scores.jsonl': scores,
  };
  return { trizContext: ctxRecord, strategyPlan: plan, scoresJsonl: scores, sha256sums: sha256sums(records) };
}

/** 把 strategy plan 渲染成 markdown（供归档可读）。 */
export function renderStrategyPlanMd(plan: StrategyPlanRecord): string {
  const lines = [
    `# TRIZ strategy plan — claim ${plan.claimId}`,
    '',
    `protocol fingerprint: ${plan.fingerprint}`,
    '',
    '## Declared typed transformations (before evaluation)',
    '',
  ];
  for (const t of plan.declaredTransformations) {
    lines.push(`### #${t.principleNo} — ${t.opType}`);
    lines.push(`- admissible args: ${t.admissibleArgs.join(', ')}`);
    lines.push(`- prohibited changes: ${t.prohibitedChanges.join('; ')}`);
    lines.push(`- evidence obligations: ${t.evidenceObligations.join('; ')}`);
    lines.push('');
  }
  return lines.join('\n');
}
