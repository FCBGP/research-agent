// src/triza/promotion.ts — 阶段 9 · TRIZa 闭环：证据阶梯 + 硬门 + 晋升决策（controller）。
//
// 论文对口（docs/2610.04555v1.pdf，§3.3–3.4 / §4.3 / 公式 4 / 附录 C.1）：
//   - 证据等级 l ∈ {0,1,2,3}：0=静态检查与单测；1=冻结划分上的成对重跑；
//     2=注册种子/家族/场景；3=独立锁定重跑或外部核验。
//   认证等级 Lcert(s) = max{l | s 通过等级 l 的全部校验与硬门}（公式 4）。
//   - 晋升门 Gl(s) = 1{ 每个注册硬门 gl,k(s) ≤ 0 }（公式 6 语义）：数据完整性 / 安全 /
//     可复现 / 资源四类硬门**任一不过 → 不得晋升**；**FI/Ideality 绝不覆盖 Gl(s)=0**。
//   - **指标提升是观察，晋升是被治理的决策**：即使指标提升，若相对增益低于冻结阈值
//     （或次次级硬门不过），不晋升但**保留完整负证据**（CICIoT 形式化 V2 正例）。
//   - 不同决策边界的证据**不打平合并**，各自标注 status & boundary（Table 2 证据阶梯。
// 本模块纯函数 / 可测；被 src/triza/index.ts 的 researchTriza 服务消费。
import { functionalInformation, type FiResult } from './functional-information.ts';
import type { FrozenContract } from './contract.ts';

/** 证据等级（l 越大要求越高；Lcert 记录已通过的最高等级）。 */
export interface EvidenceLevelSpec { level: 0 | 1 | 2 | 3; label: string; desc: string }

export const EVIDENCE_LEVELS: readonly EvidenceLevelSpec[] = [
  { level: 0, label: 'static', desc: '静态检查与单测通过' },
  { level: 1, label: 'paired_frozen_split', desc: '冻结数据划分上的同一协议成对重跑' },
  { level: 2, label: 'registered_seeds_families', desc: '注册种子 / 家族 / 场景' },
  { level: 3, label: 'locked_rerun', desc: '独立锁定的重跑或外部核验' },
] as const;

export function evidenceLabel(level: number): string {
  return EVIDENCE_LEVELS.find((e) => e.level === level)?.label ?? `L${level}`;
}

/** 一个硬门条目。 */
export interface HardGate { id: string; desc: string; pass: boolean }

/** 四类硬门 bundle（论文：data-integrity / safety / reproducibility / resource）。 */
export interface GateBundle {
  integrity: boolean;
  safety: boolean;
  reproducibility: boolean;
  resource: boolean;
}

export interface GateInput {
  integrity?: boolean;
  safety?: boolean;
  reproducibility?: boolean;
  resource?: boolean;
  /** 额外硬门（自定义）；与四类合并评估。 */
  extra?: HardGate[];
}

const GATE_DESCRIPTIONS: Record<keyof GateBundle, string> = {
  integrity: '数据完整性：fingerprint 与冻结协议一致、零 train-test 重叠',
  safety: '安全性：无泄漏/越权/危险操作（高风险动作需人工授权）',
  reproducibility: '可复现性：种子/环境/代码摘要可复核',
  resource: '资源：未超过冻结资源上限',
};

/** 晋升决策的全部输入。 */
export interface PromotionInput {
  contract: FrozenContract;
  contractFingerprint: string;
  candidateId: string;
  parentId?: string;
  principleNos: number[];
  gates: GateInput;
  /** 本次评估施加的证据等级（requirements of level l）。 */
  evidenceLevel: number;
  /** 候选已认证的最高等级 Lcert（公式 4），未认证为 -1。 */
  certifiedLevel?: number;
  /** 候选指标（冻结协议 κ 下测得）。 */
  metrics: Record<string, number>;
  /** 基线（incumbent）指标（同一 κ 下重跑）。 */
  baselineMetrics: Record<string, number>;
  /** 冻结参考总体 Bl：useful / harmful 配置值（同一 κ 下评估）。 */
  reference: { useful: number[]; harmful: number[] };
  cost?: number;
  lambdaC?: number;
  /** 高风险候选待人工授权（escalate 的触发条件之一）。 */
  requiresAuthorization?: boolean;
}

export interface PromotionDecision {
  candidateId: string;
  parentId?: string;
  contractFingerprint: string;
  /** Gl(s)：硬门全过才为 true。 */
  admissible: boolean;
  gateFailures: HardGate[];
  certification: { level: number; label: string };
  fi: FiResult;
  /** 相对主指标增益（%）。 */
  relativeGainPct: number;
  secondaryGateFailures: string[];
  /** 控制器结论：promote / revise / reject / escalate。 */
  promotion: 'promote' | 'revise' | 'reject' | 'escalate';
  reason: string;
  /** 证据阶梯口径（Table 2 风格）：不同决策边界不打平。 */
  evidenceLadder: string;
  /** 负证据是否被保留进 trace/artifact。 */
  negativeEvidenceRetained: boolean;
}

/** 四类硬门 + 自定义拷贝 → HardGate[]（含失败的项）。 */
export function collectGates(gates: GateInput): HardGate[] {
  const bundle: GateBundle = {
    integrity: gates.integrity ?? false,
    safety: gates.safety ?? false,
    reproducibility: gates.reproducibility ?? false,
    resource: gates.resource ?? false,
  };
  const list: HardGate[] = (Object.keys(GATE_DESCRIPTIONS) as Array<keyof GateBundle>).map((k) => ({
    id: k,
    desc: GATE_DESCRIPTIONS[k],
    pass: bundle[k],
  }));
  for (const g of gates.extra ?? []) list.push(g);
  return list;
}

/**
 * 控制器晋升决策（论文 Stage 4）：
 *   1. 硬门：任一 failed → admissible=false（FI 不覆盖），高风险 → escalate，否则 reject；
 *   2. 认证等级 < 施加等级 → revise（证据不足，先补证据）；
 *   3. 主指标相对增益 < 冻结阈值 或 次级门槛不过 → reject（负证据保留）；
 *   4. 全过 → promote（此时 FI/Ideality 仅在同秩打平中使用，本决策不因理想度翻转硬门）。
 */
export function decidePromotion(input: PromotionInput): PromotionDecision {
  const gatesList = collectGates(input.gates);
  const gateFailures = gatesList.filter((g) => !g.pass);
  const anyGateFailed = gateFailures.length > 0;

  const certified = Math.max(-1, input.certifiedLevel ?? -1);
  const fi = functionalInformation({
    useful: input.metrics[input.contract.protocol.primaryMetric] ?? 0,
    referenceUseful: input.reference.useful,
    harmful: input.metrics['false_positive_rate'] ?? 0,
    referenceHarmful: input.reference.harmful,
    cost: input.cost,
    lambdaC: input.lambdaC,
  });

  const primary = input.contract.protocol.primaryMetric;
  const base = input.baselineMetrics[primary];
  const cand = input.metrics[primary];
  const relativeGainPct = base > 0 ? ((cand - base) / base) * 100 : cand > 0 ? 100 : 0;

  // 次级硬门槛（如 FPR 降低 ≥ 阈值 / 某项 ≤ 上限）
  const secondaryGateFailures: string[] = [];
  for (const g of input.contract.promotionGates.secondary) {
    const v = input.metrics[g.metric];
    if (typeof v !== 'number') { secondaryGateFailures.push(`${g.metric}: 缺失`); continue; }
    if (g.operator === 'gte' && v < g.threshold) secondaryGateFailures.push(`${g.metric}(${v}) < 阈值(${g.threshold})`);
    if (g.operator === 'lte' && v > g.threshold) secondaryGateFailures.push(`${g.metric}(${v}) > 上限(${g.threshold})`);
  }

  // 证据阶梯 status & boundary（Table 2 风格：不打平不同决策边界）
  const evidenceLadder = input.evidenceLevel >= certified
    ? `applied@L${input.evidenceLevel}; certified=${certified >= 0 ? `L${certified}` : 'uncertified'}`
    : `applied@L${input.evidenceLevel}`;

  let promotion: PromotionDecision['promotion'];
  let reason: string;

  if (anyGateFailed) {
    promotion = input.requiresAuthorization ? 'escalate' : 'reject';
    reason = `硬门未过（${gateFailures.map((g) => g.id).join(', ')}）：指标提升是观察，硬门不过不得晋升；FI 无法覆盖 Gl(s)=0。${input.requiresAuthorization ? ' 高风险动作需人工授权，已升级' : ''}`;
  } else if (certified < input.evidenceLevel) {
    promotion = 'revise';
    reason = `硬门全过，但认证等级(L${certified})低于本次施加的证据等级(L${input.evidenceLevel})：证据不足，先补证据再评`;
  } else if (relativeGainPct < input.contract.promotionGates.relativeGainPct || secondaryGateFailures.length > 0) {
    promotion = 'reject';
    reason = `硬门与认证通过，但未过冻结晋升阈值（相对增益 ${relativeGainPct.toFixed(2)}% < ${input.contract.promotionGates.relativeGainPct}%${secondaryGateFailures.length ? `；次级门槛：${secondaryGateFailures.join('; ')}` : ''}）：完整证据保留，记录为负证据`;
  } else {
    promotion = 'promote';
    reason = `硬门全过 + 认证(L${certified})足够 + 相对增益 ${relativeGainPct.toFixed(2)}% ≥ ${input.contract.promotionGates.relativeGainPct}% + 次级门槛通过 → 晋升为现任`;
  }

  return {
    candidateId: input.candidateId,
    parentId: input.parentId,
    contractFingerprint: input.contractFingerprint,
    admissible: !anyGateFailed,
    gateFailures,
    certification: { level: certified, label: certified >= 0 ? evidenceLabel(certified) : 'uncertified' },
    fi,
    relativeGainPct: r2(relativeGainPct),
    secondaryGateFailures,
    promotion,
    reason,
    evidenceLadder,
    negativeEvidenceRetained: promotion !== 'promote',
  };
}

function r2(x: number): number {
  return Math.round(x * 100) / 100;
}
