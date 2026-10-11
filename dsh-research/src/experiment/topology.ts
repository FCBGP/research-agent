// topology.ts — 实验执行环境（TODO 阶段 3 · 第 11 项）：可控网络拓扑抽象。
//
//   RouteEngineSim : 确定性路由引擎模拟器（本沙箱的默认、可测、可重复执行源）。
//                    实现 ROV / BGPsec 状态下的「检测率 / 误报率 / 收敛时间 /
//                    验证时延」四口径模型；同 seed 结果可复现，重复注入产生方差。
//   FrrTopology    : 真实 FRR（bgpd + zebra）适配器：探测二进制、渲染 frr.conf /
//                    RPKI-RTR 配置并（在可用时）管理守护进程生命周期；守护进程在场时
//                    inject() 走 vtysh 实时采集（live-metrics.ts：show bgp summary /
//                    show rpki table / show bgp … json → 四口径 + 原始计数）；二进制
//                    缺失时回退 RouteEngineSim 采集（fallbackToSim，engine 标记清楚）。
//   VppTopology    : 真实 VPP 适配器：探测二进制、渲染 startup.conf；在场时 inject()
//                    走 vppctl 实时采集（show ip fib / show rpki）— 同 FRR 语义。
import { existsSync } from 'node:fs';
import { spawnSync, spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FrrLiveMetrics, VppLiveMetrics, localRunner, type CommandRunner } from './live-metrics.ts';

export type ValidatorMode = 'none' | 'rov' | 'bgpsec' | 'rov+bgpsec' | 'aspa' | 'rov+aspa';
export type AttackClass = 'prefix-hijack' | 'subprefix-hijack' | 'as-set-injection' | 'path-manipulation' | 'authorized-leak';

export interface TopologyConfig {
  seed?: number;
  validator?: ValidatorMode;
  attack?: AttackClass;
  asCount?: number;      // 参与者 AS 总数（默认 40）
  saturated?: boolean;   // 全互联/反射器拓扑（收敛更快）
  /** ROA 覆盖占比（0..1）：目标前缀被 ROA 覆盖的比例（V4 NotFound/覆盖前提；默认 1 = 全覆盖）。 */
  coverage?: number;
  /** BGPsec 部署占比（0..1）：路径沿途 AS 部署 BGPsec 的比例（V5 部分部署前提；默认 1 = 全部署）。 */
  deployment?: number;
  /** 路径跳数：BGPsec 签名链完整概率 = deployment^pathLen（默认按 asCount 派生 ≈ 中位 AS path 长）。 */
  pathLen?: number;
}

export interface TopologyInfo {
  engine: string;
  available: boolean;
  validator: ValidatorMode;
  attack: AttackClass;
}

/** 一轮注入后采集到的四口径样例。 */
export interface MetricSample {
  detection_rate: number;
  false_positive_rate: number;
  convergence_time: number;      // ms
  verification_latency: number;  // ms
  /** 实时采集原始计数（仅真实守护进程；sim 无此字段）——保证 claim→evidence 可追溯。 */
  live?: Record<string, number>;
  /** 本轮生效的 ROA 覆盖占比（仅在 <1 时出现）——V4 条件性量化追溯。 */
  coverage?: number;
  /** 本轮生效的 BGPsec 部署占比（仅在 <1 时出现）——V5 条件性量化追溯。 */
  deployment?: number;
  /** BGPsec 签名链完整概率 deployment^pathLen（仅在 deployment<1 时出现）。 */
  chainIntact?: number;
}

export interface Topology {
  readonly info: TopologyInfo;
  deploy(cfg?: TopologyConfig): void;
  teardown(): void;
  /** 注入一次攻击事件并采集一轮指标。 */
  inject(): MetricSample;
}

// —— 确定性随机数（mulberry32）：同 seed 同序列，重复实验可复现 ——
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randBetween(rng: () => number, lo: number, hi: number): number {
  return lo + rng() * (hi - lo);
}
function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
function r3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
function r2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** 攻击类 × 验证器 → 检测率区间 [下,上]（确定性先验 + 每次注入抖动）。 */
const EFFECT: Record<AttackClass, Record<ValidatorMode, [number, number]>> = {
  'prefix-hijack': { none: [0.08, 0.12], rov: [0.76, 0.84], bgpsec: [0.90, 0.95], 'rov+bgpsec': [0.95, 0.98], aspa: [0.32, 0.44], 'rov+aspa': [0.80, 0.88] },
  'subprefix-hijack': { none: [0.05, 0.10], rov: [0.50, 0.62], bgpsec: [0.84, 0.90], 'rov+bgpsec': [0.90, 0.95], aspa: [0.28, 0.40], 'rov+aspa': [0.56, 0.68] },
  'as-set-injection': { none: [0.09, 0.14], rov: [0.56, 0.66], bgpsec: [0.80, 0.88], 'rov+bgpsec': [0.86, 0.93], aspa: [0.38, 0.50], 'rov+aspa': [0.62, 0.72] },
  'path-manipulation': { none: [0.07, 0.12], rov: [0.28, 0.40], bgpsec: [0.92, 0.97], 'rov+bgpsec': [0.94, 0.98], aspa: [0.60, 0.72], 'rov+aspa': [0.64, 0.76] },
  'authorized-leak': { none: [0.03, 0.07], rov: [0.04, 0.08], bgpsec: [0.09, 0.15], 'rov+bgpsec': [0.11, 0.17], aspa: [0.82, 0.92], 'rov+aspa': [0.86, 0.95] },
};

// 各验证策略的基础误报率区间（ROV 因 ROA 粒度歧义略高，BGPsec 较低；
// ASPA 依赖完整/正确的 provider-auth 记录，缺失/过期时合法路径可能被误标 → 略高于 bgpsec）。
const FP_BASE: Record<ValidatorMode, [number, number]> = {
  none: [0.002, 0.004],
  rov: [0.015, 0.025],
  bgpsec: [0.004, 0.008],
  'rov+bgpsec': [0.006, 0.010],
  aspa: [0.008, 0.014],
  'rov+aspa': [0.018, 0.028],
};

// 验证时延基座（ms）：rov 走 ROA 检索，bgpsec 走签名验证，aspa 走 ASPA 对象检索，
// 叠加时串行成本更高。
const LATENCY_BASE: Record<ValidatorMode, [number, number]> = {
  none: [0.02, 0.10],
  rov: [1.0, 2.2],
  bgpsec: [0.6, 1.8],
  'rov+bgpsec': [1.8, 3.6],
  aspa: [0.9, 1.9],
  'rov+aspa': [1.8, 3.2],
};

export class RouteEngineSim implements Topology {
  readonly info: TopologyInfo;
  private cfg: Required<TopologyConfig>;
  private rng: () => number;

  constructor(cfg: TopologyConfig = {}) {
    this.cfg = normalize(cfg);
    this.info = { engine: 'route-engine-sim', available: true, validator: this.cfg.validator, attack: this.cfg.attack };
    this.rng = mulberry32(this.cfg.seed);
  }

  deploy(cfg: TopologyConfig = {}): void {
    this.cfg = normalize({ ...this.cfg, ...cfg });
    this.info.validator = this.cfg.validator;
    this.info.attack = this.cfg.attack;
    this.rng = mulberry32(this.cfg.seed); // 复位：部署后注入序列可复现
  }

  teardown(): void {
    this.rng = mulberry32(this.cfg.seed);
  }

  inject(): MetricSample {
    const v = this.cfg.validator;
    const a = this.cfg.attack;
    const cov = clamp01(this.cfg.coverage);      // V4：ROA 覆盖占比（NotFound/覆盖前提）
    const dep = clamp01(this.cfg.deployment);    // V5：BGPsec 部署占比（部分部署前提）
    const hops = Math.max(1, Math.round(this.cfg.pathLen));

    // 单次「全效 + 抖动」抽取（确定性：同 seed 同序列）。
    const drawEffect = (mode: ValidatorMode): number => {
      const [elo, ehi] = EFFECT[a][mode];
      return clamp01(randBetween(this.rng, elo, ehi) + randBetween(this.rng, -0.02, 0.02));
    };

    let detection = drawEffect(v);

    // V4 覆盖前提：ROV(rov/rov+bgpsec) 只对「有覆盖 ROA 的目标前缀」生效；NotFound
    // （无覆盖 ROA）默认放行 → 检测回退「无验证基线」。coverage=1（默认）时退化为
    // 原 EFFECT[rov] 语义、不额外抽取 RNG，保证既有网格数值逐位不变。
    if ((v === 'rov' || v === 'rov+bgpsec') && cov < 1) {
      detection = cov * detection + (1 - cov) * drawEffect('none');
    }
    // V5 部分部署前提：BGPsec(bgpsec/rov+bgpsec) 签名链仅沿途全部署时完整（RFC 8205：
    // 非 BGPsec 节点剥离 BGPsec 属性回退纯 BGP）。链完整概率 = deployment^pathLen，
    // 检测率在「BGPsec 全效」与「无验证基线」间按链完整概率插值。deployment=1（默认）
    // 时退化为原 EFFECT[bgpsec] 语义、不额外抽取 RNG。
    if ((v === 'bgpsec' || v === 'rov+bgpsec') && dep < 1) {
      const chainIntact = Math.pow(dep, hops);
      detection = chainIntact * detection + (1 - chainIntact) * drawEffect('none');
    }
    detection = clamp01(detection);

    const [flo, fhi] = FP_BASE[v];
    const fp = clamp01(randBetween(this.rng, flo, fhi));
    const base = (1.1 + randBetween(this.rng, 0.5, 1.3)) * this.cfg.asCount * (this.cfg.saturated ? 0.55 : 1);
    const convergence = r2(base + randBetween(this.rng, -0.2, 0.2) * this.cfg.asCount);
    const [llo, lhi] = LATENCY_BASE[v];
    const latency = r2(randBetween(this.rng, llo, lhi));
    const sample: MetricSample = {
      detection_rate: r3(detection),
      false_positive_rate: r3(fp),
      convergence_time: convergence,
      verification_latency: latency,
    };
    if (cov < 1) sample.coverage = r3(cov);
    if (dep < 1) {
      sample.deployment = r3(dep);
      sample.chainIntact = r3(Math.pow(dep, hops));
    }
    return sample;
  }
}

function normalize(cfg: TopologyConfig): Required<TopologyConfig> {
  return {
    seed: cfg.seed ?? 7,
    validator: cfg.validator ?? 'none',
    attack: cfg.attack ?? 'prefix-hijack',
    asCount: cfg.asCount ?? 40,
    saturated: cfg.saturated ?? false,
    coverage: cfg.coverage ?? 1,
    deployment: cfg.deployment ?? 1,
    pathLen: cfg.pathLen ?? Math.max(2, Math.round((cfg.asCount ?? 40) / 10)),
  };
}

// —— 真实守护进程适配器（FRR / VPP） ——
export class TopologyUnavailableError extends Error {
  readonly daemon: 'frr' | 'vpp';
  readonly missing: string[];
  constructor(daemon: 'frr' | 'vpp', missing: string[]) {
    super(`${daemon.toUpperCase()} 不可用：缺少 ${missing.join(', ')}。本沙箱无真实网元，请：
  1) 安装 FRR/VPP 后重试，接口会接管真实守护进程；或
  2) 使用 fallbackToSim=true，指标由 RouteEngineSim 确定性模拟（engine 标记为 adapter-sim）。`);
    this.daemon = daemon;
    this.missing = missing;
  }
}

function findBinary(names: string[]): { missing: string[]; found: string | undefined } {
  const missing: string[] = [];
  let found: string | undefined;
  for (const n of names) {
    if (existsSync(`/usr/bin/${n}`) || existsSync(`/usr/local/bin/${n}`) || existsSync(`/opt/homebrew/bin/${n}`)) {
      found = found ?? n;
    } else {
      const hit = spawnSync('which', [n], { encoding: 'utf8' });
      if (hit.status === 0 && hit.stdout.trim()) found = found ?? n;
      else missing.push(n);
    }
  }
  return { missing, found };
}

/** FRR 适配器：渲染真实 frr.conf + RPKI-RTR 配置；守护进程可用时管理生命周期。 */
export class FrrTopology implements Topology {
  readonly info: TopologyInfo;
  private cfg: Required<TopologyConfig>;
  private sim: RouteEngineSim | null = null;
  private children: ChildProcess[] = [];
  private workdir: string | null = null;
  private runner: CommandRunner;

  constructor(opts: { available?: boolean; fallbackToSim?: boolean; config?: TopologyConfig; runner?: CommandRunner } = {}) {
    const probe = opts.available ?? (findBinary(['bgpd', 'vtysh']).found !== undefined);
    this.cfg = normalize(opts.config ?? {});
    this.runner = opts.runner ?? localRunner;
    this.info = {
      engine: probe ? 'frr' : 'frr-adapter-sim',
      available: probe,
      validator: this.cfg.validator,
      attack: this.cfg.attack,
    };
    if (!probe) {
      if (opts.fallbackToSim !== false) this.sim = new RouteEngineSim(this.cfg);
      else throw new TopologyUnavailableError('frr', findBinary(['bgpd', 'vtysh']).missing);
    }
  }

  /** 生成真实 FRR 配置文件（bgpd + RPKI-RTR 会话 + ROV/BGPsec/ASPA 校验）。 */
  renderFrrConfig(cfg: TopologyConfig = {}): string {
    const c = normalize({ ...this.cfg, ...cfg });
    this.cfg = c;
    const rpki = c.validator !== 'none' ? [
      '  rpki rtr 192.0.2.1 port 8282',
      '  rpki refresh-interval 600',
      '  !',
      '  address-family ipv4 unicast',
      '    network 192.0.2.0/24',
      '    rpki validate',
      '  exit-address-family',
    ].join('\n') : '  ! no RPKI validated origin (validator=none)';
    const bgpsec = c.validator === 'bgpsec' || c.validator === 'rov+bgpsec' ? '    bgp bestpath bgpsec-as-path' : '';
    // ASPA（RFC 9319）：声明合法上游集合，路径政策校验 customer→provider 跳；
    // ASPA 对象随 RPKI-RTR 同会话下发。真实 FRR 对 ASPA 的本地支持仍在演进——
    // 这里渲染成文档化策略行（真实网元部署时替换为对应平台的 ASPA 校验命令）。
    const aspa = c.validator === 'aspa' || c.validator === 'rov+aspa'
      ? '  ! ASPA path-policy verify (RFC 9319): customer→provider hops via ASPA records'
      : '';
    return [
      `hostname dsh-research-frr-${c.seed}`,
      'password zebra',
      `log file /tmp/dsh-frr-${c.seed}/frr.log`,
      '!',
      'router bgp 65000',
      '  bgp router-id 10.0.0.1',
      rpki,
      bgpsec,
      aspa,
      '!',
      'line vty',
      '!',
    ].join('\n');
  }

  deploy(cfg?: TopologyConfig): void {
    this.cfg = normalize({ ...this.cfg, ...cfg });
    this.info.validator = this.cfg.validator;
    this.info.attack = this.cfg.attack;
    if (!this.info.available) {
      if (this.sim) this.sim.deploy(this.cfg); // 回退到确定性模拟
      return;
    }
    // 真实守护进程：写入配置并拉起 zebra/bgpd（本沙箱无二进制，路径不被走到）。
    this.workdir = join(tmpdir(), `dsh-frr-${this.cfg.seed}`);
    this.teardown();
    const conf = this.renderFrrConfig(this.cfg);
    for (const daemon of ['zebra', 'bgpd']) {
      const bin = findBinary([daemon]).found;
      if (!bin) continue;
      this.children.push(spawn(bin, ['-f', join(this.workdir, 'frr.conf')]));
    }
  }

  teardown(): void {
    for (const c of this.children) c.kill('SIGTERM');
    this.children = [];
  }

  inject(): MetricSample {
    // 真实守护进程在场 → vtysh 实时采集四口径（parse + derive 见 live-metrics.ts）；
    // 采集失败且回退 sim 存在时降级（engine 仍如实标记 frr-adapter-sim），否则抛错。
    if (this.info.available) {
      try {
        return new FrrLiveMetrics({ runner: this.runner, config: this.cfg }).collect().sample;
      } catch (err) {
        if (this.sim) return this.sim.inject();
        throw new TopologyUnavailableError('frr', [`vtysh live metric collection failed: ${(err as Error).message}`]);
      }
    }
    if (this.sim) return this.sim.inject();
    throw new TopologyUnavailableError('frr', ['live metric collection requires bgpd running']);
  }
}

/** VPP 适配器：渲染 startup.conf；守护进程可用时管理生命周期。 */
export class VppTopology implements Topology {
  readonly info: TopologyInfo;
  private cfg: Required<TopologyConfig>;
  private sim: RouteEngineSim | null = null;
  private child: ChildProcess | null = null;
  private runner: CommandRunner;

  constructor(opts: { available?: boolean; fallbackToSim?: boolean; config?: TopologyConfig; runner?: CommandRunner } = {}) {
    const probe = opts.available ?? (findBinary(['vpp', 'vppctl']).found !== undefined);
    this.cfg = normalize(opts.config ?? {});
    this.runner = opts.runner ?? localRunner;
    this.info = {
      engine: probe ? 'vpp' : 'vpp-adapter-sim',
      available: probe,
      validator: this.cfg.validator,
      attack: this.cfg.attack,
    };
    if (!probe) {
      if (opts.fallbackToSim !== false) this.sim = new RouteEngineSim(this.cfg);
      else throw new TopologyUnavailableError('vpp', findBinary(['vpp', 'vppctl']).missing);
    }
  }

  renderVppConfig(cfg: TopologyConfig = {}): string {
    const c = normalize({ ...this.cfg, ...cfg });
    this.cfg = c;
    const aspa = c.validator === 'aspa' || c.validator === 'rov+aspa'
      ? '    aspa-policy verify (RFC 9319)  # customer→provider path check'
      : '';
    return [
      `unix { nodaemon log /tmp/dsh-vpp-${c.seed}/vpp.log }`,
      'cpu { main-core 0 }',
      'dpdk { no-pci }',
      'plugins {',
      '  plugin default { disable }',
      '  plugin bgp_validate_enable.so { enable }',
      '}',
      aspa,
      `vpp { rpki-server 192.0.2.1:8282 validator ${c.validator} }`,
    ].join('\n');
  }

  deploy(cfg?: TopologyConfig): void {
    this.cfg = normalize({ ...this.cfg, ...cfg });
    this.info.validator = this.cfg.validator;
    this.info.attack = this.cfg.attack;
    if (!this.info.available) {
      if (this.sim) this.sim.deploy(this.cfg);
      return;
    }
    this.teardown();
    const bin = findBinary(['vpp']).found;
    if (bin) {
      this.child = spawn(bin, ['-c', this.renderVppConfig(this.cfg)]);
    }
  }

  teardown(): void {
    this.child?.kill('SIGTERM');
    this.child = null;
  }

  inject(): MetricSample {
    // 真实守护进程在场 → vppctl 实时采集四口径；失败时降级 sim / 抛错（同上语义）。
    if (this.info.available) {
      try {
        return new VppLiveMetrics({ runner: this.runner, config: this.cfg }).collect().sample;
      } catch (err) {
        if (this.sim) return this.sim.inject();
        throw new TopologyUnavailableError('vpp', [`vppctl live metric collection failed: ${(err as Error).message}`]);
      }
    }
    if (this.sim) return this.sim.inject();
    throw new TopologyUnavailableError('vpp', ['live metric collection requires vppctl']);
  }
}
// —— engine → simulated 判定 & env → 拓扑执行源工厂 ——
// simulated 必须随 engine 改写（TODO「真实网元验证」）：route-engine-sim / *-adapter-sim
// 为模拟数据（true）；真实 frr / vpp 守护进程接管时为 false（live 数据）。
export function isSimulatedEngine(engine: string): boolean {
  return engine === 'route-engine-sim' || engine.endsWith('-adapter-sim');
}

export type TopologyEnv = 'frr' | 'vpp' | 'sim';

/**
 * 按实验环境选择拓扑执行源（research_campaign env=… 的装配点）：
 *   'sim' → RouteEngineSim（确定性、可复现）；'frr'/'vpp' → 相应真实守护进程适配器
 *   （探测二进制，缺失时回退 adapter-sim 并如实标记 engine=*-adapter-sim / simulated=true）。
 * cfg 透传给执行源（seed/asCount 等），与 RouteEngineSim 直连语义对齐。
 */
export function topologyForEnv(env: TopologyEnv, cfg: TopologyConfig = {}): Topology {
  if (env === 'frr') return new FrrTopology({ config: cfg });
  if (env === 'vpp') return new VppTopology({ config: cfg });
  return new RouteEngineSim(cfg);
}
