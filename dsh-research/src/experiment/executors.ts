// executors.ts — 把 Topology 接到既有 Executor 契约上的执行器（TODO 阶段 3 · 第 11 项）。
//
//   TopologyExecutor : 部署 → 注入攻击 → 采集四口径指标 → 依据 detection 阈值判定
//                      outcome（support / refute / inconclusive）。默认使用
//                      RouteEngineSim（确定性、可复现）；FRR/VPP 适配器可用时接管。
//                      data.simulated 不再硬编码，随拓扑 engine 派生（TODO「真实网元验证」）：
//                      frr / vpp = live 数据（false），route-engine-sim / *-adapter-sim = 模拟（true）。
//
//   StubExecutor 仍保留在 agents/experiment.ts 中作为「最轻量占位」；真正的阶段 3
//   实验使用 TopologyExecutor。engine/data.simulated 字段如实标记数据来源。
import type { Executor, ExperimentPlan } from '../agents/experiment.ts';
import type { ExperimentResult } from '../core/types.ts';
import { RouteEngineSim, isSimulatedEngine, type Topology, type TopologyConfig, type ValidatorMode, type AttackClass } from './topology.ts';

export interface TopologyExecutorOptions {
  topology?: Topology;
  validator?: ValidatorMode;
  attack?: AttackClass | ((plan: ExperimentPlan) => AttackClass);
  supportThreshold?: number;  // detection_rate >= 该值 → support（默认 0.8）
  refuteThreshold?: number;   // detection_rate <= 该值 → refute（默认 0.4）
}

export class TopologyExecutor implements Executor {
  private topo: Topology;
  private opts: Required<TopologyExecutorOptions>;
  private deployed = false;

  constructor(opts: TopologyExecutorOptions = {}) {
    this.topo = opts.topology ?? new RouteEngineSim();
    this.opts = {
      topology: this.topo,
      validator: opts.validator ?? 'rov',
      attack: opts.attack ?? inferAttack,
      supportThreshold: opts.supportThreshold ?? 0.8,
      refuteThreshold: opts.refuteThreshold ?? 0.4,
    };
  }

  /** 部署拓扑（幂等：同一执行器多轮 run 只部署一次）。 */
  deploy(plan: ExperimentPlan): void {
    if (this.deployed) return;
    const cfg = this.configFor(plan);
    this.topo.deploy(cfg);
    this.deployed = true;
  }

  teardown(): void {
    this.topo.teardown();
    this.deployed = false;
  }

  run(plan: ExperimentPlan): ExperimentResult {
    this.deploy(plan);
    const attack = typeof this.opts.attack === 'function' ? this.opts.attack(plan) : this.opts.attack;
    const sample = this.topo.inject();
    const outcome =
      sample.detection_rate >= this.opts.supportThreshold ? 'support' as const
      : sample.detection_rate <= this.opts.refuteThreshold ? 'refute' as const
      : 'inconclusive' as const;
    return {
      experiment: plan.configFingerprint,
      claim: plan.claimId,
      outcome,
      data: {
        engine: this.topo.info.engine,
        engineKind: 'topology-executor',
        validator: this.topo.info.validator,
        attackClass: attack,
        steps: plan.steps.length,
        env: plan.env,
        simulated: isSimulatedEngine(this.topo.info.engine), // 随 engine 改写（不复用硬编码 true）
        ...sample,
      },
      archivedAt: new Date().toISOString(),
    };
  }

  private configFor(plan: ExperimentPlan): TopologyConfig {
    const attack = typeof this.opts.attack === 'function' ? this.opts.attack(plan) : this.opts.attack;
    return { validator: this.opts.validator, attack };
  }
}

/** 从实验计划场景推断攻击类。 */
export function inferAttack(plan: ExperimentPlan): AttackClass {
  const s = plan.scenario.toLowerCase();
  if (s.includes('hijack')) return 'prefix-hijack';
  if (s.includes('as_set') || s.includes('asset') || s.includes('as-set')) return 'as-set-injection';
  if (s.includes('leak') || s.includes('泄密')) return 'authorized-leak';
  if (s.includes('bgpsec') || s.includes('path')) return 'path-manipulation';
  return 'prefix-hijack';
}

export * from './topology.ts';
