// stats.ts — 实验重复统计（TODO 阶段 3 · 第 13 项）。
//
// 四项统计口径统一在这里收敛：
//   detection_rate / false_positive_rate / convergence_time / verification_latency
// 提供均值/样本标准差/95%CI；并给出「检测 vs 误报」合成口径 effectiveScore。
import type { ExperimentResult } from '../core/types.ts';

export interface SeriesStats {
  n: number;
  mean: number;          // 4 位小数
  stddev: number;        // 样本标准差（n-1）；n<=1 为 0
  ci95: [number, number]; // 正态近似 95% 置信区间（n<2 时退化为 [mean, mean]）
}

export const EXPERIMENT_METRICS = [
  'detection_rate',
  'false_positive_rate',
  'convergence_time',
  'verification_latency',
] as const;
export type ExperimentMetric = (typeof EXPERIMENT_METRICS)[number];

/** 数值序列统计：均值 / 样本标准差 / 95%CI。 */
export function analyzeSeries(values: number[]): SeriesStats {
  const n = values.length;
  if (n === 0) return { n: 0, mean: 0, stddev: 0, ci95: [0, 0] };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = n < 2 ? 0 : values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const stddev = Math.sqrt(variance);
  const half = n < 2 ? 0 : 1.96 * (stddev / Math.sqrt(n));
  return { n, mean: r4(mean), stddev: r4(stddev), ci95: [r4(Math.max(0, mean - half)), r4(mean + half)] };
}

export interface DetectionRow {
  detectionRate: number;
  falsePositiveRate: number;
}

/** 检测/误报批量统计。effectiveScore = detection.mean - fp.mean，越大越优。 */
export interface DetectionStats extends SeriesStats {
  falsePositive: SeriesStats;
  effectiveScore: number;
}

export function summarizeDetection(rows: DetectionRow[]): DetectionStats {
  const det = analyzeSeries(rows.map((r) => r.detectionRate));
  const fp = analyzeSeries(rows.map((r) => r.falsePositiveRate));
  return {
    ...det,
    falsePositive: fp,
    effectiveScore: r4(det.mean - fp.mean),
  };
}

/** 从一组实验结果里抽取四口径数值指标统计（只保留数值字段，缺失的口径跳过）。 */
export function metricsFromResults(results: Array<Pick<ExperimentResult, 'data'>>): Record<string, SeriesStats> {
  const out: Record<string, SeriesStats> = {};
  for (const m of EXPERIMENT_METRICS) {
    const vals = results
      .map((r) => r.data[m])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (vals.length > 0) out[m] = analyzeSeries(vals);
  }
  return out;
}

function r4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
