// src/triza/contract.ts — 阶段 9 · TRIZa 闭环：冻结评估契约（frozen evaluation protocol κ）。
//
// 论文对口（docs/2610.04555v1.pdf，§3.1 / §C.1）：一段**有效对比**必须先绑定——
//   数据集版本 / 划分 / 预处理 / feature-fit 范围 / 候选预算 / 种子 / 主次指标 /
//   useful·harmful 合格事件 / 资源上限 / 缺失值行为 / 停止规则。
// **协议指纹** = 这些字段的规范化序列化的 SHA-256；改任一绑定字段 → 产生**新协议**
// （silently 扩展旧结果是不被允许的）。FI / Ideality / 提升阈值都只在同一指纹下可比。
//
// 本模块纯函数 / 可测；被 src/triza/index.ts 的 researchTriza 服务消费。
import { createHash } from 'node:crypto';

/** useful 合格事件：候选在 metric 上须达到的「有用」标准（threshold 方向见 operator）。 */
export interface UsefulEvent {
  metric: string;
  operator: 'gte' | 'gt';
  threshold: number;
}

/** harmful 合格事件：候选在 metric 上不得超过的「有害」上限（越界触发硬门）。 */
export interface HarmfulEvent {
  metric: string;
  operator: 'lte' | 'lt';
  threshold: number;
}

/** 冻结协议 κ 的绑定字段（所有字段共同构成协议，改任何一项 → 新指纹）。 */
export interface FrozenProtocol {
  datasetVersion?: string;
  split: string;
  preprocessing: string;
  /** training-only feature fit：防泄漏的绑定（train/test 不共享 fit）。 */
  featureFitScope: 'train-only' | 'none';
  seeds: number[];
  candidateBudget: number;
  primaryMetric: string;
  secondaryMetrics: string[];
  usefulEvents: UsefulEvent[];
  harmfulEvents: HarmfulEvent[];
  resourceCeilings: Record<string, number>;
  missingData: 'drop' | 'error' | 'impute';
  stoppingRule: string;
}

/** 冻结晋升阈值：即使指标提升，低于这些阈值的候选也不得晋升（promotion ≠ 指标观察）。 */
export interface PromotionGates {
  /** 主指标相对提升百分比下限（如 CICIoT 形式化 V2 的 3.2277%）。 */
  relativeGainPct: number;
  /** 次级硬门槛（如 detector-FPR 降低 ≥ 0.005）。 */
  secondary: { metric: string; operator: 'gte' | 'lte'; threshold: number }[];
}

/** 一份完整冻结契约。 */
export interface FrozenContract {
  claimId: string;
  task: string;
  problem: string;
  contradiction: { improving: string; worsening: string };
  protocol: FrozenProtocol;
  promotionGates: PromotionGates;
  protocolVersion: number;
  frozenAt: string;
}

/** freezeContract 的最小输入（其余字段填默认值）。 */
export interface FreezeContractInput {
  claimId?: string;
  task?: string;
  problem: string;
  improving: string;
  worsening: string;
  datasetVersion?: string;
  split?: string;
  preprocessing?: string;
  featureFitScope?: FrozenProtocol['featureFitScope'];
  seeds?: number[];
  candidateBudget?: number;
  primaryMetric?: string;
  secondaryMetrics?: string[];
  usefulEvents?: UsefulEvent[];
  harmfulEvents?: HarmfulEvent[];
  resourceCeilings?: Record<string, number>;
  missingData?: FrozenProtocol['missingData'];
  stoppingRule?: string;
  relativeGainPct?: number;
  secondaryGates?: PromotionGates['secondary'];
  protocolVersion?: number;
}

const PROTOCOL_VERSION = 1;

/** 缺省绑定：路由安全研究最常用的口径（一律可被输入覆盖）。 */
const DEFAULT_PROTOCOL = (): Omit<FrozenProtocol, 'split' | 'usefulEvents'> => ({
  preprocessing: 'none',
  featureFitScope: 'train-only',
  seeds: [42],
  candidateBudget: 10,
  primaryMetric: 'detection_rate',
  secondaryMetrics: ['false_positive_rate', 'convergence_time', 'verification_latency'],
  harmfulEvents: [{ metric: 'false_positive_rate', operator: 'lte', threshold: 0.02 }],
  resourceCeilings: {},
  missingData: 'error',
  stoppingRule: 'paired rerun under identical frozen fingerprint; promote only if every hard gate passes',
});

/** 构造一份冻结契约 + 其协议指纹（SHA-256 of canonical serialization）。 */
export function freezeContract(input: FreezeContractInput): { contract: FrozenContract; fingerprint: string } {
  const d = DEFAULT_PROTOCOL();
  const seeds = input.seeds && input.seeds.length > 0 ? [...input.seeds] : d.seeds;
  const split = input.split ?? 'frozen-stratified-holdout';
  const usefulEvents = input.usefulEvents && input.usefulEvents.length > 0
    ? input.usefulEvents
    : [{ metric: input.primaryMetric ?? d.primaryMetric, operator: 'gte' as const, threshold: 0.8 }];
  const secondaryMetrics = input.secondaryMetrics && input.secondaryMetrics.length > 0
    ? [...input.secondaryMetrics]
    : [...d.secondaryMetrics];
  const contract: FrozenContract = {
    claimId: input.claimId ?? `triza-${Date.now().toString(36)}`,
    task: input.task ?? 'inter-domain routing security mechanism evaluation',
    problem: input.problem,
    contradiction: { improving: input.improving, worsening: input.worsening },
    protocol: {
      datasetVersion: input.datasetVersion,
      split,
      preprocessing: input.preprocessing ?? d.preprocessing,
      featureFitScope: input.featureFitScope ?? d.featureFitScope,
      seeds,
      candidateBudget: input.candidateBudget ?? d.candidateBudget,
      primaryMetric: input.primaryMetric ?? d.primaryMetric,
      secondaryMetrics,
      usefulEvents,
      harmfulEvents: input.harmfulEvents && input.harmfulEvents.length > 0 ? input.harmfulEvents : d.harmfulEvents,
      resourceCeilings: input.resourceCeilings ?? d.resourceCeilings,
      missingData: input.missingData ?? d.missingData,
      stoppingRule: input.stoppingRule ?? d.stoppingRule,
    },
    promotionGates: {
      relativeGainPct: input.relativeGainPct ?? 3.0,
      secondary: input.secondaryGates ?? [],
    },
    protocolVersion: input.protocolVersion ?? PROTOCOL_VERSION,
    frozenAt: new Date().toISOString(),
  };
  return { contract, fingerprint: fingerprintContract(contract) };
}

/** 规范化序列化：对象按 key 字典序递归排序、数组保序、标量原样 → 稳定 JSON 串。 */
export function canonicalSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalSerialize(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** 协议指纹 = 规范化**评估协议绑定字段**序列化的 SHA-256（16 进制）。
 * 只绑定 protocol / promotionGates / protocolVersion（论文 §C.1：数据集版本、划分、预处理、
 * feature-fit、预算、种子、指标、useful/harmful 事件、资源上限、缺失值行为、停止规则 +
 * 晋升阈值）。claimId / task / contradiction / frozenAt 不参与——同一评估协议可被多个
 * claim 复用，改动任一绑定字段才产生新指纹。 */
export function fingerprintContract(contract: FrozenContract): string {
  const stable = {
    protocol: contract.protocol,
    promotionGates: contract.promotionGates,
    protocolVersion: contract.protocolVersion,
  };
  return createHash('sha256').update(canonicalSerialize(stable)).digest('hex');
}

/** 同一契约下两次序列化是否同指纹（防时间戳噪声干扰可比性判定）。 */
export function sameFingerprint(a: FrozenContract, b: FrozenContract): boolean {
  return fingerprintContract(a) === fingerprintContract(b);
}
