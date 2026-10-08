// ExperimentAgent — 面向 claim 的实验设计/执行/统计。
//
// 定位：plan() 把 claim 转成可复现实验（env + scenario + steps + 配置指纹）；
// run() 委托 Executor 执行（阶段 3 接 FRR/VPP 真实执行器；当前提供
// StubExecutor 占位，明确标记 simulated）；analyze() 对多次重复的数值
// 指标给出均值/标准差（检测率、收敛时间、验证时延等）。
import type { ExperimentResult, ResearchClaim } from '../core/types.ts';

export type Env = 'frr' | 'vpp' | 'sim';

export interface ExperimentPlan {
  id: string;
  claimId: string;
  env: Env;
  scenario: string;
  steps: string[];
  configFingerprint: string;
  metrics: string[];
  repetitions: number;
}

export interface PlanInput {
  claimId: string;
  claimStatement: string;
  env?: Env;
  scenario?: string;
  repetitions?: number;
}

/** Executor 契约：阶段 3 用 FRR/VPP 真实执行器实现，替换 Stub。 */
export interface Executor {
  run(plan: ExperimentPlan): ExperimentResult | Promise<ExperimentResult>;
}

/** 占位执行器：不真正连网元，返回 explicitly simulated 的结果。 */
export class StubExecutor implements Executor {
  run(plan: ExperimentPlan): ExperimentResult {
    return {
      experiment: plan.configFingerprint,
      claim: plan.claimId,
      outcome: 'inconclusive',
      data: { simulated: true, steps: plan.steps.length, env: plan.env },
      archivedAt: new Date().toISOString(),
    };
  }
}

let seq = 0;

export class ExperimentAgent {
  private executor: Executor;
  constructor(executor?: Executor) {
    this.executor = executor ?? new StubExecutor();
  }

  plan(input: PlanInput): ExperimentPlan {
    seq += 1;
    const env = input.env ?? 'sim';
    const scenario = input.scenario ?? inferScenario(input.claimStatement);
    const repetitions = input.repetitions ?? 1;
    const steps = buildSteps(env, scenario);
    return {
      id: `exp-${seq}`,
      claimId: input.claimId,
      env,
      scenario,
      steps,
      configFingerprint: finger(`${env}::${scenario}::${input.claimStatement}`),
      metrics: metricsFor(env),
      repetitions,
    };
  }

  run(plan: ExperimentPlan): ExperimentResult {
    return this.executor.run(plan);
  }

  /** 多次重复的数值指标统计（均值/标准差），供 analyze→验证→报告使用。 */
  analyze(results: ExperimentResult[], metric?: string): Statistics {
    const series = results.map((r) => r.data).filter((d) => d && typeof d === 'object');
    const keys = new Set<string>();
    for (const d of series) for (const k of Object.keys(d)) keys.add(k);
    const stats: Record<string, number> = {};
    for (const k of keys) {
      const nums = series.map((d) => d[k]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      if (nums.length === 0) continue;
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
      stats[k] = round2(mean);
      stats[`${k}_stddev`] = round2(Math.sqrt(variance));
    }
    return {
      n: results.length,
      metrics: stats,
      primary: metric ? stats[metric] : undefined,
    };
  }
}

export interface Statistics {
  n: number;
  metrics: Record<string, number>;
  primary?: number;
}

function metricsFor(env: Env): string[] {
  return env === 'vpp'
    ? ['verification_latency', 'drop_rate']
    : env === 'frr'
      ? ['detection_rate', 'convergence_time']
      : ['simulated_ok'];
}

function inferScenario(claim: string): string {
  const t = claim.toLowerCase();
  if (t.includes('hijack') || t.includes('劫持')) return 'route-hijack';
  if (t.includes('as_set') || t.includes('asset')) return 'as-set-injection';
  if (t.includes('bgpsec') || t.includes('path')) return 'bgpsec-path-verify';
  return 'generic-scenario';
}

function buildSteps(env: Env, scenario: string): string[] {
  const common = [
    `deploy-${env}`,
    `load-scenario-${scenario}`,
    env === 'sim' ? 'simulate' : 'inject-traffic',
    'collect-metrics',
    'teardown',
  ];
  return common;
}

function finger(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return `fp-${Math.abs(h)}`;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
