// src/triza/audit.ts — 阶段 9 · TRIZa 闭环：控制器策略审计（Campaign08 风格）。
//
// 论文对口（docs/2610.04555v1.pdf，§4.3 / Figure 2B / Table 6）：
//   Campaign08 汇总 2,040 个嵌套控制器决策；测试的是**控制器**而非检测器——
//   promotion F1 / recall（提升召回正确晋升）/ specificity（正确拒绝不应晋升的候选）。
//   策略对比：safety-first V2（全局 FI/Ideality 否决）→ 特异性 0.998 但召回跌至 0.257、
//   promotion F1 0.409；balanced V2（useful/harmful 分开两通道）→ 召回 0.686、F1 0.811、
//   特异性仍 0.989。
//   口径纪律：嵌套决策**不当作独立统计重复**，只报告描述性聚合、不给未加依据的 p 值。
//   本模块输入可以是「控制器对每条的晋升/拒绝」+「地面真值期望」，输出两种策略的聚合。
import type { PromotionDecision } from './promotion.ts';

/** 一条被审计的控制器决策（嵌套决策之一）。 */
export interface AuditDecisionRow {
  id: string;
  /** 地面真值：该候选应否晋升（由人工/后续核验裁决）。 */
  expected: 'promote' | 'reject';
  /** 控制器的实际结论。 */
  controller: PromotionDecision['promotion'];
  /** useful/harmful 证据（供两种策略重放）。 */
  useful: number;
  harmful: number;
}

export interface ControllerAudit {
  n: number;
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  trueNegative: number;
  promotionF1: number;
  recall: number;
  specificity: number;
  /** 描述性聚合：嵌套决策不当作独立统计重复，故不给 p 值。 */
  note: string;
}

/**
 * 把一条控制器结论映射为二元「是否晋升」（revise/escalate 视为未晋升——区别于「拒绝」）。
 * safetyVeto=true 时：harmful 超过阈值即全局否决（safety-first V2 语义）。
 */
function toBinary(row: AuditDecisionRow, safetyVeto: boolean, vetoHarmThreshold: number): boolean {
  if (safetyVeto && row.harmful >= vetoHarmThreshold) return false;
  return row.controller === 'promote';
}

/** 对一组嵌套决策做描述性聚合（Campaign08 风格），返回二分类绩效。 */
export function auditController(
  rows: AuditDecisionRow[],
  opts: { safetyVeto?: boolean; vetoHarmThreshold?: number } = {},
): ControllerAudit {
  const safetyVeto = opts.safetyVeto ?? false;
  const vetoHarmThreshold = opts.vetoHarmThreshold ?? 0.02;
  let tp = 0; let fp = 0; let fn = 0; let tn = 0;
  for (const r of rows) {
    const promoted = toBinary(r, safetyVeto, vetoHarmThreshold);
    if (promoted && r.expected === 'promote') tp++;
    else if (promoted && r.expected === 'reject') fp++;
    else if (!promoted && r.expected === 'promote') fn++;
    else tn++;
  }
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const specificity = tn + fp > 0 ? tn / (tn + fp) : 0;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return {
    n: rows.length,
    truePositive: tp,
    falsePositive: fp,
    falseNegative: fn,
    trueNegative: tn,
    promotionF1: r3(f1),
    recall: r3(recall),
    specificity: r3(specificity),
    note: 'descriptive aggregate of nested decisions; not independent statistical replicates (no p-values)',
  };
}

/** 同组决策在两种策略（balanced vs safety-first）下的审计对比（Figure 2B 风格）。 */
export function auditPolicies(
  rows: AuditDecisionRow[],
  opts: { vetoHarmThreshold?: number } = {},
): { balanced: ControllerAudit; safetyFirst: ControllerAudit } {
  return {
    balanced: auditController(rows, { safetyVeto: false }),
    safetyFirst: auditController(rows, { safetyVeto: true, vetoHarmThreshold: opts.vetoHarmThreshold }),
  };
}

function r3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
