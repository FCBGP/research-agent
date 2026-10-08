// topology.ts — 实验执行环境（TODO 阶段 3 · 第 11 项）：可控网络拓扑抽象。
//
//   RouteEngineSim : 确定性路由引擎模拟器（本沙箱的默认、可测、可重复执行源）。
//                    实现 ROV / BGPsec 状态下的「检测率 / 误报率 / 收敛时间 /
//                    验证时延」四口径模型；同 seed 结果可复现，重复注入产生方差。
//   FrrTopology    : 真实 FRR（bgpd + zebra）适配器：探测二进制、渲染 frr.conf /
//                    RPKI-RTR 配置并（在可用时）管理守护进程生命周期；二进制缺失时
//                    可回退到 RouteEngineSim 采集（fallbackToSim，engine 标记清楚）。
//   VppTopology    : 真实 VPP 适配器：探测二进制、渲染 startup.conf — 同 FRR 语义。
import { existsSync } from 'node:fs';
import { spawnSync, spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export type ValidatorMode = 'none' | 'rov' | 'bgpsec' | 'rov+bgpsec';
export type AttackClass = 'prefix-hijack' | 'subprefix-hijack' | 'as-set-injection' | 'path-manipulation';

export interface TopologyConfig {
  seed?: number;
  validator?: ValidatorMode;
  attack?: AttackClass;
  asCount?: number;      // 参与者 AS 总数（默认 40）
  saturated?: boolean;   // 全互联/反射器拓扑（收敛更快）
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
  'prefix-hijack': { none: [0.08, 0.12], rov: [0.76, 0.84], bgpsec: [0.90, 0.95], 'rov+bgpsec': [0.95, 0.98] },
  'subprefix-hijack': { none: [0.05, 0.10], rov: [0.50, 0.62], bgpsec: [0.84, 0.90], 'rov+bgpsec': [0.90, 0.95] },
  'as-set-injection': { none: [0.09, 0.14], rov: [0.56, 0.66], bgpsec: [0.80, 0.88], 'rov+bgpsec': [0.86, 0.93] },
  'path-manipulation': { none: [0.07, 0.12], rov: [0.28, 0.40], bgpsec: [0.92, 0.97], 'rov+bgpsec': [0.94, 0.98] },
};

// 各验证策略的基础误报率区间（ROV 因 ROA 粒度歧义略高，BGPsec 较低）。
const FP_BASE: Record<ValidatorMode, [number, number]> = {
  none: [0.002, 0.004],
  rov: [0.015, 0.025],
  bgpsec: [0.004, 0.008],
  'rov+bgpsec': [0.006, 0.010],
};

// 验证时延基座（ms）：rov 走 ROA 检索，bgpsec 走签名验证，叠加时串行成本更高。
const LATENCY_BASE: Record<ValidatorMode, [number, number]> = {
  none: [0.02, 0.10],
  rov: [1.0, 2.2],
  bgpsec: [0.6, 1.8],
  'rov+bgpsec': [1.8, 3.6],
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
    const [elo, ehi] = EFFECT[a][v];
    const detection = clamp01(randBetween(this.rng, elo, ehi) + randBetween(this.rng, -0.02, 0.02));
    const [flo, fhi] = FP_BASE[v];
    const fp = clamp01(randBetween(this.rng, flo, fhi));
    const base = (1.1 + randBetween(this.rng, 0.5, 1.3)) * this.cfg.asCount * (this.cfg.saturated ? 0.55 : 1);
    const convergence = r2(base + randBetween(this.rng, -0.2, 0.2) * this.cfg.asCount);
    const [llo, lhi] = LATENCY_BASE[v];
    const latency = r2(randBetween(this.rng, llo, lhi));
    return { detection_rate: r3(detection), false_positive_rate: r3(fp), convergence_time: convergence, verification_latency: latency };
  }
}

function normalize(cfg: TopologyConfig): Required<TopologyConfig> {
  return {
    seed: cfg.seed ?? 7,
    validator: cfg.validator ?? 'none',
    attack: cfg.attack ?? 'prefix-hijack',
    asCount: cfg.asCount ?? 40,
    saturated: cfg.saturated ?? false,
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

  constructor(opts: { available?: boolean; fallbackToSim?: boolean } = {}) {
    const probe = opts.available ?? (findBinary(['bgpd', 'vtysh']).found !== undefined);
    this.cfg = normalize({});
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

  /** 生成真实 FRR 配置文件（bgpd + RPKI-RTR 会话 + ROV/BGPsec 校验）。 */
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
    return [
      `hostname dsh-research-frr-${c.seed}`,
      'password zebra',
      `log file /tmp/dsh-frr-${c.seed}/frr.log`,
      '!',
      'router bgp 65000',
      '  bgp router-id 10.0.0.1',
      rpki,
      bgpsec,
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

  constructor(opts: { available?: boolean; fallbackToSim?: boolean } = {}) {
    const probe = opts.available ?? (findBinary(['vpp', 'vppctl']).found !== undefined);
    this.cfg = normalize({});
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
    return [
      `unix { nodaemon log /tmp/dsh-vpp-${c.seed}/vpp.log }`,
      'cpu { main-core 0 }',
      'dpdk { no-pci }',
      'plugins {',
      '  plugin default { disable }',
      '  plugin bgp_validate_enable.so { enable }',
      '}',
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
    if (this.sim) return this.sim.inject();
    throw new TopologyUnavailableError('vpp', ['live metric collection requires vppctl']);
  }
}
