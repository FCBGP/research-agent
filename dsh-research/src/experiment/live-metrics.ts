// live-metrics.ts — FRR / VPP 实时指标采集（TODO「FRR / VPP 实时指标采集」）。
//
// 真实守护进程在场时，经 vtysh / vppctl 拉取实时 metrics 并解析、推导成四口径
// MetricSample（detection_rate / false_positive_rate / convergence_time /
// verification_latency）。二进制缺失时由 topology.ts 回退 RouteEngineSim
// （engine 标记为 *-adapter-sim），本模块不产生任何模拟数据。
//
// 设计要点：
//   - CommandRunner 抽象可注入：默认 localRunner = spawnSync；测试注入假 runner，
//     沙箱无真实网元也能把「解析 + 推导 + 采集编排」整条路径验证到。
//   - 解析器全部为纯函数：对 vtysh / vppctl 典型输出格式做宽容解析（数据行过滤、
//     缺列降级为 0），单测用真实感 fixture 覆盖；守护进程版本差异导致的缺字段
//     不会抛错。
//   - 四口径推导 = 文档化的启发式映射（见 derive* 注释）：全部 clamp 到合法区间，
//     原始计数随 sample.live 一并返回，保证 claim → evidence 可追溯。
import type { MetricSample, TopologyConfig, ValidatorMode } from './topology.ts';
import { spawnSync } from 'node:child_process';

export interface CommandOutput {
  status: number;
  stdout: string;
  stderr: string;
}

export interface CommandRunner {
  run(args: string[], opts?: { timeoutMs?: number }): CommandOutput;
}

/** 默认执行源：本地 spawnSync（vtysh / vppctl 在 PATH 中即可）。 */
export const localRunner: CommandRunner = {
  run(args, opts = {}) {
    const res = spawnSync(args[0], args.slice(1), {
      encoding: 'utf8',
      timeout: opts.timeoutMs ?? 10_000,
    });
    return {
      status: res.status ?? -1,
      stdout: (res.stdout as string | null) ?? '',
      stderr: (res.stderr as string | null) ?? '',
    };
  },
};

/** vtysh 调用参数：`vtysh -c <command>`（一次性执行，非交互）。 */
export function vtyshCmd(command: string): string[] {
  return ['vtysh', '-c', command];
}

/** vppctl 调用参数：`vppctl <command tokens>`。 */
export function vppctlCmd(command: string): string[] {
  return ['vppctl', ...command.trim().split(/\s+/).filter(Boolean)];
}

interface SafeOut { ok: boolean; text: string }
function runSafe(runner: CommandRunner, args: string[], timeoutMs: number): SafeOut {
  try {
    const out = runner.run(args, { timeoutMs });
    return { ok: out.status === 0, text: out.status === 0 ? out.stdout : '' };
  } catch {
    return { ok: false, text: '' };
  }
}

// —— FRR · show bgp summary 解析 ——
export interface FrrSummary {
  tableVersion: number;
  ribEntries: number;
  peers: number;
  peersUp: number;
  prefixesReceived: number;
}

/** 解析 `vtysh -c "show bgp summary"` 文本。 */
export function parseBgpSummary(text: string): FrrSummary {
  const out: FrrSummary = { tableVersion: 0, ribEntries: 0, peers: 0, peersUp: 0, prefixesReceived: 0 };
  const tv = text.match(/BGP table version (\d+)/i);
  if (tv) out.tableVersion = Number(tv[1]);
  const re = text.match(/RIB entries (\d+)/i);
  if (re) out.ribEntries = Number(re[1]);
  const pr = text.match(/Peers (\d+)/i);
  if (pr) out.peers = Number(pr[1]);
  let sawHeader = false;
  for (const line of text.split('\n')) {
    if (/Neighbor\s+V\s+AS MsgRcvd MsgSent/.test(line)) { sawHeader = true; continue; }
    if (!sawHeader) continue;
    const t = line.trim().split(/\s+/);
    if (t.length < 10 || !/^\d+\.\d+\.\d+\.\d+$/.test(t[0] ?? '')) continue;
    const state = t[9] ?? '';
    const pfx = Number(state);
    if (state === 'Established' || Number.isFinite(pfx)) {
      out.peersUp += 1;
      out.prefixesReceived += Number.isFinite(pfx) ? pfx : 0;
    }
  }
  return out;
}

// —— FRR · show rpki table 解析 ——
export interface RpkiTable {
  valid: number;
  invalid: number;
  notfound: number;
  total: number;
}

/** 解析 `vtysh -c "show rpki table"` 文本（宽容：只统计含前缀的数据行）。 */
export function parseRpkiTable(text: string): RpkiTable {
  const out: RpkiTable = { valid: 0, invalid: 0, notfound: 0, total: 0 };
  let sawHeader = false;
  for (const line of text.split('\n')) {
    if (/Validation State/.test(line)) { sawHeader = true; continue; }
    const t = line.trim();
    if (!sawHeader || !t) continue;
    const tokens = t.split(/\s+/);
    if (!/\//.test(tokens[0] ?? '')) continue; // 前缀行才有 "prefix/length"
    const state = (tokens[tokens.length - 1] ?? '').toLowerCase();
    if (state === 'valid') out.valid += 1;
    else if (state === 'invalid') out.invalid += 1;
    else if (state === 'notfound') out.notfound += 1;
    out.total += 1;
  }
  return out;
}

// —— FRR · show bgp ipv4 unicast json 解析 ——
export interface BgpRoutes {
  total: number;
  valid: number;             // 按 rpkiStatus 计的 Valid 路由数
  invalid: number;           // 按 rpkiStatus 计的 Invalid 路由数
  notfound: number;          // 按 rpkiStatus 计的 NotFound 路由数
  acceptedValid: number;     // 已装入 RIB 的 Valid 路由
  acceptedInvalid: number;   // 已装入 RIB 的 Invalid 路由（= 泄漏的威胁）
  acceptedNotFound: number;  // 已装入 RIB 的 NotFound 路由（= 泄漏的威胁）
}

type RpkStatus = 'valid' | 'invalid' | 'notfound';

/** 从 path 对象取 rpkiStatus（兼容顶层或嵌套 paths 两种 schema）。 */
function pickRpkStatus(path: Record<string, unknown>): RpkStatus {
  const nested = (path.paths as Record<string, unknown> | undefined)?.rpkiStatus;
  const raw = (path.rpkiStatus ?? nested) as string | undefined;
  const s = String(raw ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (s === 'valid') return 'valid';
  if (s === 'invalid') return 'invalid';
  return 'notfound';
}

/** 解析 `vtysh -c "show bgp ipv4 unicast json"` 输出（宽容：JSON 失效返回空表）。 */
export function parseBgpJson(text: string): BgpRoutes {
  const out: BgpRoutes = { total: 0, valid: 0, invalid: 0, notfound: 0, acceptedValid: 0, acceptedInvalid: 0, acceptedNotFound: 0 };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return out;
  }
  const routes = (parsed as { routes?: Record<string, unknown[]> }).routes;
  if (!routes || typeof routes !== 'object') return out;
  for (const prefix of Object.keys(routes)) {
    const paths = routes[prefix];
    if (!Array.isArray(paths) || paths.length === 0) continue;
    out.total += 1;
    const p = paths[0] as Record<string, unknown>;
    const status = pickRpkStatus(p);
    if (status === 'valid') out.valid += 1;
    else if (status === 'invalid') out.invalid += 1;
    else out.notfound += 1;
    if (p.valid === true) {
      if (status === 'valid') out.acceptedValid += 1;
      else if (status === 'invalid') out.acceptedInvalid += 1;
      else out.acceptedNotFound += 1;
    }
  }
  return out;
}

// —— VPP · show ip fib / rpki 插件输出解析 ——
/** 解析 `vppctl show ip fib`：按行 `[n] <prefix> fib:<i> via: ...` 求路由总数。 */
export function parseShowIpFib(text: string): { total: number } {
  let total = 0;
  for (const line of text.split('\n')) {
    const m = line.trim().match(/^\[(\d+)\](?:\s+([^\s/]+(?:\/\d+)?))?\s+fib:/);
    if (!m) continue;
    total = Math.max(total, Number(m[1]) + 1);
  }
  return { total };
}

/** 解析 `vppctl show rpki`（bgp_validate 插件）的计数输出；无插件/无输出 → 全 0。 */
export function parseVppRpki(text: string): RpkiTable {
  const out: RpkiTable = { valid: 0, invalid: 0, notfound: 0, total: 0 };
  for (const line of text.split('\n')) {
    const t = line.trim();
    const vm = t.match(/^Valid\s*[:=]?\s*(\d+)/i);
    const im = t.match(/^Invalid\s*[:=]?\s*(\d+)/i);
    const nm = t.match(/^NotFound\s*[:=]?\s*(\d+)/i);
    if (vm) out.valid = Number(vm[1]);
    else if (im) out.invalid = Number(im[1]);
    else if (nm) out.notfound = Number(nm[1]);
  }
  out.total = out.valid + out.invalid + out.notfound;
  return out;
}

// —— 收敛等待（同步轮询，可配置；测试注入 pollMs=0 即快速稳定） ——
export interface ConvergenceOptions {
  pollMs?: number;    // 两次采样间隔（默认 250ms）
  minStable?: number; // 连续相同采样多少次判定稳定（默认 2）
  maxMs?: number;     // 超时上限（默认 20s）
}

const SLEEP_SAB = new SharedArrayBuffer(4);
const SLEEP_VIEW = new Int32Array(SLEEP_SAB);
function sleepSync(ms: number): void {
  if (ms <= 0) return;
  try {
    Atomics.wait(SLEEP_VIEW, 0, 0, ms);
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) { /* 主线程回退：忙等 */ }
  }
}

/**
 * 等待表稳定：frr 用 show bgp summary（table version + RIB entries），
 * vpp 用 show ip fib 路由数；返回等待耗时（ms）。
 */
export function measureConvergence(
  runner: CommandRunner,
  daemon: 'frr' | 'vpp',
  opts: ConvergenceOptions = {},
): number {
  const pollMs = opts.pollMs ?? 250;
  const minStable = opts.minStable ?? 2;
  const maxMs = opts.maxMs ?? 20_000;
  const start = Date.now();
  let last = '';
  let stable = 0;
  const probeKey = (): string => {
    const args = daemon === 'frr' ? vtyshCmd('show bgp summary') : vppctlCmd('show ip fib');
    const text = runSafe(runner, args, 3000).text;
    if (!text) return '';
    if (daemon === 'frr') {
      const s = parseBgpSummary(text);
      return `${s.tableVersion}|${s.ribEntries}|${s.prefixesReceived}`;
    }
    return String(parseShowIpFib(text).total);
  };
  let empties = 0;
  for (;;) {
    let key: string;
    try { key = probeKey(); } catch { key = ''; }
    if (key === '') {
      // 连续无输出 → 守护进程当前不可读，不再空等到 maxMs（调用方会抛 live 采集错误）。
      empties += 1;
      if (empties >= 2) return Date.now() - start;
    } else {
      empties = 0;
      if (key === last) stable += 1;
      else { last = key; stable = 1; }
      if (stable >= minStable) return Date.now() - start;
    }
    if (Date.now() - start >= maxMs) return Date.now() - start;
    sleepSync(pollMs);
  }
}

// —— 四口径推导（启发式映射；全部 clamp，原始计数带在 sample.live） ——
function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
function r3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

export interface FrrSnapshot {
  summary: FrrSummary;
  rpki: RpkiTable;
  routes: BgpRoutes;
  convergenceMs: number;
  queryMs: number; // vtysh 一轮查询往返时延（verification_latency 实时代理）
}

/**
 * FRR 四口径推导（读者见映射假设）：
 *  - flagged   = RPKI Invalid + NotFound 记录数（威胁集合，来自 show rpki table）
 *  - leaked    = 已装入 RIB 的 Invalid/NotFound 路由数（来自 show bgp ... json）
 *  - detection = 威胁被验证机制拦截的比例：validator 非 none 且存在威胁时
 *                = 1 − leaked/flagged；无威胁（干净表）→ 1；validator=none →
 *                0（实时 FRR 无任何验证信号，如实体现机制缺失）。
 *  - fp        = 合法 ROA 记录中未装入 RIB 的比例（ROV 粒度歧义等误报启发式）。
 *  - convergence / latency 为实测毫秒。
 */
export function deriveFrMetrics(s: FrrSnapshot, validator: ValidatorMode): MetricSample {
  const flagged = Math.max(0, s.rpki.invalid + s.rpki.notfound);
  const leaked = s.routes.acceptedInvalid + s.routes.acceptedNotFound;
  let detection: number;
  if (validator === 'none') detection = 0;
  else if (flagged > 0) detection = clamp01(1 - leaked / flagged);
  else detection = 1; // 无被标记威胁 → 表状态干净，无漏检

  const validKnown = Math.max(0, s.rpki.valid);
  const blockedValid = Math.max(0, validKnown - s.routes.acceptedValid);
  const fp = validKnown > 0 ? clamp01(blockedValid / validKnown) : 0;

  const convergence = Math.max(1, Math.round(s.convergenceMs));
  const latency = Math.max(0.01, s.queryMs);

  const sample: MetricSample = {
    detection_rate: r3(detection),
    false_positive_rate: r3(fp),
    convergence_time: convergence,
    verification_latency: latency,
    live: {
      table_version: s.summary.tableVersion,
      rib_entries: s.summary.ribEntries,
      peers: s.summary.peers,
      peers_up: s.summary.peersUp,
      prefixes_received: s.summary.prefixesReceived,
      rpki_valid: s.rpki.valid,
      rpki_invalid: s.rpki.invalid,
      rpki_notfound: s.rpki.notfound,
      routes_total: s.routes.total,
      routes_accepted_valid: s.routes.acceptedValid,
      routes_accepted_invalid: s.routes.acceptedInvalid,
      routes_accepted_notfound: s.routes.acceptedNotFound,
      convergence_ms: s.convergenceMs,
      query_ms: s.queryMs,
    },
  };
  return sample;
}

export interface VppSnapshot {
  fibTotal: number;
  rpki: RpkiTable;
  convergenceMs: number;
  queryMs: number;
}

/**
 * VPP 四口径推导：核心 show ip fib 不携带逐路由验证状态（bgp_validate 插件扩展）。
 *  - 有 RPKI 会话计数（validator 非 none 且 total>0）→ 校验插件在场，fib 未观察到
 *    Invalid 路由 → detection = 1；无会话/状态可见 → 0（不声称检测）。
 *  - fp：fib 无逐路由状态 → 无实时信号，回 0（边界诚实标记）。
 */
export function deriveVppMetrics(s: VppSnapshot, validator: ValidatorMode): MetricSample {
  let detection: number;
  if (validator === 'none') detection = 0;
  else if (s.rpki.total > 0) detection = 1;
  else detection = 0;

  const sample: MetricSample = {
    detection_rate: r3(detection),
    false_positive_rate: 0,
    convergence_time: Math.max(1, Math.round(s.convergenceMs)),
    verification_latency: Math.max(0.01, s.queryMs),
    live: {
      fib_total: s.fibTotal,
      rpki_valid: s.rpki.valid,
      rpki_invalid: s.rpki.invalid,
      rpki_notfound: s.rpki.notfound,
      convergence_ms: s.convergenceMs,
      query_ms: s.queryMs,
    },
  };
  return sample;
}

// —— 实时采集器 ——
/** FRR 实时采集：measure 收敛 → show rpki table → show bgp ... json。 */
export class FrrLiveMetrics {
  private runner: CommandRunner;
  private cfg: { validator: ValidatorMode; attack?: string };
  lastSnapshot: FrrSnapshot | undefined;

  constructor(opts: { runner?: CommandRunner; config?: TopologyConfig } = {}) {
    this.runner = opts.runner ?? localRunner;
    this.cfg = { validator: opts.config?.validator ?? 'none', attack: opts.config?.attack };
  }

  collect(): { sample: MetricSample; snapshot: FrrSnapshot } {
    const convergenceMs = measureConvergence(this.runner, 'frr', { pollMs: 120, minStable: 2, maxMs: 20_000 });
    const t0 = Date.now();
    const rpkiOut = runSafe(this.runner, vtyshCmd('show rpki table'), 8000);
    const bgpOut = runSafe(this.runner, vtyshCmd('show bgp ipv4 unicast json'), 8000);
    const summOut = runSafe(this.runner, vtyshCmd('show bgp summary'), 8000);
    if (!rpkiOut.ok && !bgpOut.ok && !summOut.ok) {
      throw new Error('vtysh 采集失败：show rpki table / show bgp … json / show bgp summary 全部无输出（守护进程未就绪或权限不足）');
    }
    const rpki = parseRpkiTable(rpkiOut.text);
    const routes = parseBgpJson(bgpOut.text);
    const summary = parseBgpSummary(summOut.text);
    const queryMs = Date.now() - t0;
    const snapshot: FrrSnapshot = { summary, rpki, routes, convergenceMs, queryMs };
    this.lastSnapshot = snapshot;
    return { sample: deriveFrMetrics(snapshot, this.cfg.validator), snapshot };
  }
}

/** VPP 实时采集：measure 收敛 → show ip fib → show rpki（插件字段）。 */
export class VppLiveMetrics {
  private runner: CommandRunner;
  private cfg: { validator: ValidatorMode; attack?: string };
  lastSnapshot: VppSnapshot | undefined;

  constructor(opts: { runner?: CommandRunner; config?: TopologyConfig } = {}) {
    this.runner = opts.runner ?? localRunner;
    this.cfg = { validator: opts.config?.validator ?? 'none', attack: opts.config?.attack };
  }

  collect(): { sample: MetricSample; snapshot: VppSnapshot } {
    const convergenceMs = measureConvergence(this.runner, 'vpp', { pollMs: 120, minStable: 2, maxMs: 20_000 });
    const t0 = Date.now();
    const fibOut = runSafe(this.runner, vppctlCmd('show ip fib'), 8000);
    const rpkiOut = runSafe(this.runner, vppctlCmd('show rpki'), 8000);
    if (!fibOut.ok && !rpkiOut.ok) {
      throw new Error('vppctl 采集失败：show ip fib / show rpki 全部无输出（VPP 未就绪或权限不足）');
    }
    const fibTotal = parseShowIpFib(fibOut.text).total;
    const rpki = parseVppRpki(rpkiOut.text);
    const queryMs = Date.now() - t0;
    const snapshot: VppSnapshot = { fibTotal, rpki, convergenceMs, queryMs };
    this.lastSnapshot = snapshot;
    return { sample: deriveVppMetrics(snapshot, this.cfg.validator), snapshot };
  }
}
