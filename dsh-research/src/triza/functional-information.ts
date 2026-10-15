// src/triza/functional-information.ts — 阶段 9 · TRIZa 闭环：功能信息（FI）与 FI/Ideality。
//
// 论文对口（docs/2610.04555v1.pdf，§3.3，公式 2/3/5）：
//   IU,l(s) = −log2( (1 + Σ_{x∈Bl} 1[x ⪰U s]) / (1 + Nl) )        —— useful FI（位）
//   IH,l(s) = −log2( (1 + Σ_{x∈Bl} 1[x ⪰H s]) / (1 + Nl) )        —— harmful FI（位）
//   Jl(s)   = IU,l^LB(s) / ( max(ϵ, IH,l^UB(s)) + λC·Cpath(s) )   —— FI/Ideality（同秩打平用）
// 要点（口径，勿当权威转录）：
//   - useful / harmful **分开报告**：useful FI 的提升不能数值抵消 harmful FI 的增加。
//   - FI 衡量的是「相对冻结参考总体 Bl 有多稀有」，不是奖励稀有本身——差的候选可能是
//     稀有的但仍不合格（另有合格事件判定）。
//   - Jl 只用于**同认证等级 + 同复制状态**的候选间打平，绝不覆盖硬门。
//   - 保守比较：useful 用比例上界（IU^LB 变小、更保守），harmful 用比例下界（IH^UB 变大、更保守）。
// 本模块纯函数 / 可测；被 src/triza/promotion.ts 消费。

/** FI 计算的输入：候选值 + 参考总体（同一冻结协议 κ 下按证据等级 l 评估的配置值）。 */
export interface FiInput {
  /** 候选的 useful 表现值（higher-is-better：e.g. detection rate / macro-F1）。 */
  useful: number;
  /** 参考总体里各配置的 useful 表现值。 */
  referenceUseful: number[];
  /** 候选的 harmful 表现值（larger-is-worse：e.g. detector FPR）。 */
  harmful: number;
  /** 参考总体里各配置的 harmful 表现值。 */
  referenceHarmful: number[];
  /** artifact 成本（代际/计算/部署开销，论文记为 Cpath）。 */
  cost?: number;
  /** 成本权重 λC（论文报告口径里通常置 0，使成本不影响报告比较）。 */
  lambdaC?: number;
}

/** FI 结果：useful / harmful 的点估计与保守界 + 合成 Ideality。 */
export interface FiResult {
  n: number;
  /** 公式(2)：useful FI 点估计（位）。 */
  usefulFI: number;
  /** 保守 useful FI（比例上界，IU^LB，值更小）。 */
  usefulFI_LB: number;
  /** 公式(3)：harmful FI 点估计（位）。 */
  harmfulFI: number;
  /** 保守 harmful FI（比例下界，IH^UB，值更大）。 */
  harmfulFI_UB: number;
  /** 公式(5)：FI/Ideality（同秩打平指标；不决定认证、不覆盖硬门）。 */
  ideality: number;
  /** 参考总体里达到/超过候选 useful 的配置占比。 */
  usefulRatio: number;
  /** 参考总体里达到/超过候选 harmful 的配置占比。 */
  harmfulRatio: number;
}

const EPS = 1e-9;

/** 计数：参考总体里 value >= candidate 的个数（higher-is-better 的 useful 口径）。 */
export function countMatchOrExceed(values: number[], candidate: number): number {
  return values.reduce((acc, v) => acc + (v >= candidate ? 1 : 0), 0);
}

/** Wilson 比分区间某侧界（z=1.96 ≈ 95%）；side='upper' 给比例上界、'lower' 给比例下界。 */
export function wilsonProportionBound(successes: number, n: number, side: 'upper' | 'lower', z = 1.96): number {
  if (n <= 0) return side === 'upper' ? 1 : 0;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  const bound = side === 'upper' ? center + half : center - half;
  return Math.min(1, Math.max(0, bound));
}

/** 公式(2)/(3) 的通用位估计：-log2((1 + k)/(1 + N))，k=达标计数、N=总体大小。 */
export function bitsFromCount(k: number, n: number): number {
  if (n <= 0) return 0;
  const p = (1 + k) / (1 + n);
  if (p <= 0) return 0;
  return -Math.log2(p);
}

/** 计算 useful / harmful FI 与 FI/Ideality（含保守界）。 */
export function functionalInformation(input: FiInput): FiResult {
  const nU = input.referenceUseful.length;
  const nH = input.referenceHarmful.length;
  const kU = countMatchOrExceed(input.referenceUseful, input.useful);
  const kH = countMatchOrExceed(input.referenceHarmful, input.harmful);
  const usefulFI = bitsFromCount(kU, nU);
  const harmfulFI = bitsFromCount(kH, nH);
  // 保守界：useful 用比例上界（IU^LB 偏小 = 不夸大有用）；
  // harmful 用比例下界（IH^UB 偏大 = 不低估有害）。n=0 时退化到点估计。
  const pUB = nU > 0 ? wilsonProportionBound(kU, nU, 'upper') : 0;
  const pLB = nH > 0 ? wilsonProportionBound(kH, nH, 'lower') : 0;
  const usefulFI_LB = nU > 0 ? -Math.log2(Math.max(EPS, pUB)) : usefulFI;
  const harmfulFI_UB = nH > 0 ? -Math.log2(Math.max(EPS, pLB)) : harmfulFI;
  const lambda = input.lambdaC ?? 0;
  const costTerm = Math.max(0, input.cost ?? 0) * lambda;
  const denom = Math.max(EPS, harmfulFI_UB) + costTerm;
  const ideality = usefulFI_LB / denom;
  return {
    n: Math.min(nU, nH),
    usefulFI: r3(usefulFI),
    usefulFI_LB: r3(usefulFI_LB),
    harmfulFI: r3(harmfulFI),
    harmfulFI_UB: r3(harmfulFI_UB),
    ideality: r3(ideality),
    usefulRatio: r3(nU > 0 ? kU / nU : 0),
    harmfulRatio: r3(nH > 0 ? kH / nH : 0),
  };
}

function r3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
