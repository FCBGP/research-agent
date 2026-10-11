// live-metrics.test.ts — FRR / VPP 实时指标采集（TODO「FRR / VPP 实时指标采集」）。
//
// 沙箱无真实 FRR/VPP 守护进程 → 用可注入 CommandRunner（假 runner）把
// 「vtysh/vppctl 解析 → 字符串/JSON 输出 → 四口径推导」整条 live 路径验证到；
// 回退 sim 分支保持既有行为（engine=*-adapter-sim / 无 live 字段）不回归。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBgpSummary,
  parseRpkiTable,
  parseBgpJson,
  parseShowIpFib,
  parseVppRpki,
  measureConvergence,
  deriveFrMetrics,
  deriveVppMetrics,
  FrrLiveMetrics,
  VppLiveMetrics,
  vtyshCmd,
  vppctlCmd,
  type CommandRunner,
  type FrrSnapshot,
  type VppSnapshot,
} from './live-metrics.ts';
import { FrrTopology, VppTopology } from './topology.ts';
import { TopologyExecutor } from './executors.ts';
import { ExperimentAgent } from '../agents/experiment.ts';

// —— 真实感输出 fixture（FRR vtysh / VPP vppctl 典型格式） ——

const FRR_SUMMARY = `BGP router identifier 10.0.0.1, local AS number 65000
BGP table version 289
RIB entries 1520, using 290 KiB of memory
Peers 4, using 84 KiB of memory

Neighbor        V         AS MsgRcvd MsgSent   TblVer  InQ OutQ  Up/Down State/PfxRcd
10.0.0.2        4      65001     420     421     289     0    0 01:23:45        380
10.0.0.3        4      65002     418     419     288     0    0 01:21:07        372
10.0.0.4        4      65003     419     420     289     0    0 01:22:30        375
10.0.0.5        4      65004       0       1       0     0    0 00:00:12       Idle
`;

const FRR_RPKI = `Connected to group rpki at 192.0.2.1 port 8282

                                         Neighbor
Prefix                                      ASN    Origin    Record   Trust Anchor  Validation State
192.0.2.0/24                                65001 0         i       0              Valid
198.51.100.0/24                             65002 0         i       1              Invalid
198.51.100.0/25                             65002 0         i       1              Invalid
203.0.113.0/24                              65003 0         i       0              notfound
198.51.99.0/24                              65004 0         i       0              Valid
2001:db8::/32                               65005 0         i       0              Valid
`;

const FRR_BGP_JSON = JSON.stringify({
  routerId: '10.0.0.1',
  routerAs: 65000,
  bgpTableVersion: 289,
  routes: {
    '192.0.2.0/24': [{ valid: true, bestpath: true, prefix: '192.0.2.0/24', paths: { aspath: '65001', origin: 'IGP', rpkiStatus: 'Valid' } }],
    '198.51.100.0/24': [{ valid: false, prefix: '198.51.100.0/24', paths: { aspath: '65002 65099', origin: 'IGP', rpkiStatus: 'Invalid' } }],
    '198.51.100.0/25': [{ valid: false, prefix: '198.51.100.0/25', paths: { aspath: '65002 65099', origin: 'IGP', rpkiStatus: 'Invalid' } }],
    '203.0.113.0/24': [{ valid: true, prefix: '203.0.113.0/24', paths: { aspath: '65003', origin: 'IGP', rpkiStatus: 'NotFound' } }],
    '198.51.99.0/24': [{ valid: true, bestpath: true, prefix: '198.51.99.0/24', paths: { aspath: '65004', origin: 'IGP', rpkiStatus: 'Valid' } }],
  },
});

const VPP_FIB = `ipv4-VRF:0, fib_index:0, flow hash: src dst sport dport proto
[0] 0.0.0.0/0 fib:0 via: 192.0.2.1 weight:1
[1] 203.0.113.0/24 fib:0 via: 10.0.0.2 weight:1
[2] 198.51.100.0/24 fib:0 via: 10.0.0.3 weight:1
[3] 192.0.2.0/24 fib:0 via: 10.0.0.2 weight:1
`;

const VPP_RPKI = `rpki server: 192.0.2.1:8282 (connected)
Valid: 3
Invalid: 2
NotFound: 1
`;

/** 假 runner：按命令行匹配预先录好的输出；未命中 → status 1（模拟命令失败）。 */
function fakeRunner(responses: Record<string, { status?: number; stdout?: string }>): CommandRunner {
  return {
    run(args, _opts) {
      const r = responses[args.join(' ')] ?? { status: 1, stdout: '' };
      return { status: r.status ?? 0, stdout: r.stdout ?? '', stderr: '' };
    },
  };
}

function frrFakeRunner(): CommandRunner {
  return fakeRunner({
    [vtyshCmd('show bgp summary').join(' ')]: { status: 0, stdout: FRR_SUMMARY },
    [vtyshCmd('show rpki table').join(' ')]: { status: 0, stdout: FRR_RPKI },
    [vtyshCmd('show bgp ipv4 unicast json').join(' ')]: { status: 0, stdout: FRR_BGP_JSON },
  });
}

// —— 解析器（纯函数） ——

test('live: parseBgpSummary 从 show bgp summary 提取版本/条目/邻居/前缀', () => {
  const s = parseBgpSummary(FRR_SUMMARY);
  assert.equal(s.tableVersion, 289);
  assert.equal(s.ribEntries, 1520);
  assert.equal(s.peers, 4);
  assert.equal(s.peersUp, 3, 'Idle 邻居不计入 up');
  assert.equal(s.prefixesReceived, 380 + 372 + 375);
});

test('live: parseBgpSummary 空/坏输出降级为 0 不抛错', () => {
  assert.deepEqual(parseBgpSummary(''), { tableVersion: 0, ribEntries: 0, peers: 0, peersUp: 0, prefixesReceived: 0 });
  assert.equal(parseBgpSummary('garbage\nno header').peersUp, 0);
});

test('live: parseRpkiTable 统计 Valid/Invalid/NotFound 记录', () => {
  const r = parseRpkiTable(FRR_RPKI);
  assert.equal(r.valid, 3);
  assert.equal(r.invalid, 2);
  assert.equal(r.notfound, 1);
  assert.equal(r.total, 6);
  assert.deepEqual(parseRpkiTable(''), { valid: 0, invalid: 0, notfound: 0, total: 0 });
});

test('live: parseBgpJson 统计 RIB 路由与泄漏（rpkiStatus + valid）', () => {
  const r = parseBgpJson(FRR_BGP_JSON);
  assert.equal(r.total, 5);
  assert.equal(r.valid, 2, '192.0.2.0/24 + 198.51.99.0/24');
  assert.equal(r.invalid, 2, '198.51.100.0/24 + /25');
  assert.equal(r.notfound, 1, '203.0.113.0/24');
  assert.equal(r.acceptedValid, 2);
  assert.equal(r.acceptedInvalid, 0, 'Invalid 路由未被装入 RIB');
  assert.equal(r.acceptedNotFound, 1, 'NotFound 路由装入 RIB → 泄漏');
  assert.deepEqual(parseBgpJson('not json'), { total: 0, valid: 0, invalid: 0, notfound: 0, acceptedValid: 0, acceptedInvalid: 0, acceptedNotFound: 0 });
});

test('live: vpp show ip fib / show rpki 解析', () => {
  assert.equal(parseShowIpFib(VPP_FIB).total, 4);
  assert.equal(parseShowIpFib('').total, 0);
  const r = parseVppRpki(VPP_RPKI);
  assert.equal(r.valid, 3);
  assert.equal(r.invalid, 2);
  assert.equal(r.notfound, 1);
  assert.equal(r.total, 6);
  assert.deepEqual(parseVppRpki('no plugin output'), { valid: 0, invalid: 0, notfound: 0, total: 0 });
});

test('live: measureConvergence 稳态后返回等待耗时（假 runner 可快速收敛）', () => {
  const runner = frrFakeRunner();
  const t = measureConvergence(runner, 'frr', { pollMs: 0, minStable: 2, maxMs: 10_000 });
  assert.ok(t >= 0 && t <= 500, `稳态等待 ≤ 500ms（实测 ${t}）`);

  const vpp = vppctlCmd('show ip fib').join(' ');
  const runnerV = fakeRunner({ [vpp]: { status: 0, stdout: VPP_FIB } });
  const tv = measureConvergence(runnerV, 'vpp', { pollMs: 0, minStable: 2, maxMs: 10_000 });
  assert.ok(tv >= 0 && tv <= 500, `vpp 稳态等待 ≤ 500ms（实测 ${tv}）`);
});

// —— 四口径推导 ——

test('live: deriveFrMetrics(ROV) 威胁被拦截 → detection 高、fp 有限', () => {
  const s: FrrSnapshot = {
    summary: parseBgpSummary(FRR_SUMMARY),
    rpki: parseRpkiTable(FRR_RPKI),
    routes: parseBgpJson(FRR_BGP_JSON),
    convergenceMs: 142,
    queryMs: 3.2,
  };
  const sample = deriveFrMetrics(s, 'rov');
  assert.equal(sample.detection_rate, 0.667, 'flagged=3（Invalid2+notfound1），leaked=1（notfound 装入）→ 1 − 1/3');
  assert.equal(sample.false_positive_rate, 0.333, 'validKnown=3，blockedValid=3−2=1 → 1/3');
  assert.equal(sample.convergence_time, 142);
  assert.equal(sample.verification_latency, 3.2);
  assert.ok(sample.live && sample.live.rib_entries === 1520, '原始计数随 sample.live 返回（可追溯）');
  assert.ok(sample.live && sample.live.routes_accepted_notfound === 1);
});

test('live: deriveFrMetrics(validator=none) → 无验证机制 detection=0', () => {
  const s: FrrSnapshot = {
    summary: parseBgpSummary(FRR_SUMMARY),
    rpki: parseRpkiTable(FRR_RPKI),
    routes: parseBgpJson(FRR_BGP_JSON),
    convergenceMs: 90,
    queryMs: 1.5,
  };
  const sample = deriveFrMetrics(s, 'none');
  assert.equal(sample.detection_rate, 0);
  assert.equal(sample.false_positive_rate, 0.333);
});

test('live: deriveVppMetrics 插件在场 detection=1、无插件 validator=none=0', () => {
  const s: VppSnapshot = { fibTotal: 4, rpki: parseVppRpki(VPP_RPKI), convergenceMs: 88, queryMs: 2.1 };
  assert.equal(deriveVppMetrics(s, 'rov').detection_rate, 1);
  assert.equal(deriveVppMetrics(s, 'rov').false_positive_rate, 0);
  assert.equal(deriveVppMetrics(s, 'none').detection_rate, 0);
  const s0: VppSnapshot = { fibTotal: 4, rpki: { valid: 0, invalid: 0, notfound: 0, total: 0 }, convergenceMs: 88, queryMs: 2.1 };
  assert.equal(deriveVppMetrics(s0, 'rov').detection_rate, 0, '无 RPKI 状态可见 → 不声称检测');
});

// —— 实时采集器（假 runner 全链路） ——

test('live: FrrLiveMetrics.collect 经假 runner 全链路产出四口径 + 原始快照', () => {
  const m = new FrrLiveMetrics({ runner: frrFakeRunner(), config: { validator: 'rov', attack: 'prefix-hijack', seed: 7 } });
  const { sample, snapshot } = m.collect();
  assert.equal(sample.detection_rate, 0.667);
  assert.equal(sample.false_positive_rate, 0.333);
  assert.ok(sample.convergence_time > 0, '收敛时间实测 > 0');
  assert.ok(sample.verification_latency > 0);
  assert.equal(snapshot.rpki.invalid, 2);
  assert.equal(snapshot.summary.tableVersion, 289);
  assert.equal(m.lastSnapshot?.routes.acceptedNotFound, 1);
});

test('live: VppLiveMetrics.collect 经假 runner 全链路产出四口径', () => {
  const runner = fakeRunner({
    [vppctlCmd('show ip fib').join(' ')]: { status: 0, stdout: VPP_FIB },
    [vppctlCmd('show rpki').join(' ')]: { status: 0, stdout: VPP_RPKI },
  });
  const m = new VppLiveMetrics({ runner, config: { validator: 'rov', attack: 'prefix-hijack', seed: 7 } });
  const { sample, snapshot } = m.collect();
  assert.equal(sample.detection_rate, 1, 'rpki 会话在场 + fib 无 Invalid → 全检测');
  assert.equal(snapshot.fibTotal, 4);
  assert.ok(sample.convergence_time > 0);
});

// —— 适配器接线：available=true → live；available=false → sim 回退（既有行为） ——

test('live: FrrTopology(available=true, 假 runner) → inject() 走 vtysh 实时采集', () => {
  const topo = new FrrTopology({ available: true, runner: frrFakeRunner(), config: { validator: 'rov', attack: 'prefix-hijack', seed: 7 } });
  assert.equal(topo.info.engine, 'frr');
  const sample = topo.inject();
  assert.equal(sample.detection_rate, 0.667);
  assert.ok(sample.live, 'live 采集的原始计数随 sample 返回');
  topo.teardown();
});

test('live: VppTopology(available=true, 假 runner) → inject() 走 vppctl 实时采集', () => {
  const runner = fakeRunner({
    [vppctlCmd('show ip fib').join(' ')]: { status: 0, stdout: VPP_FIB },
    [vppctlCmd('show rpki').join(' ')]: { status: 0, stdout: VPP_RPKI },
  });
  const topo = new VppTopology({ available: true, runner, config: { validator: 'rov', attack: 'prefix-hijack', seed: 7 } });
  assert.equal(topo.info.engine, 'vpp');
  assert.equal(topo.inject().detection_rate, 1);
  topo.teardown();
});

test('live: TopologyExecutor 接入 live 拓扑 → 结果携带 engine=frr / simulated=false / live 计数', () => {
  const ex = new TopologyExecutor({
    topology: new FrrTopology({ available: true, runner: frrFakeRunner(), config: { validator: 'rov', attack: 'prefix-hijack', seed: 7 } }),
    validator: 'rov',
    supportThreshold: 0.5,
  });
  const plan = new ExperimentAgent().plan({ claimId: 'c-live', claimStatement: 'ROV 检测前缀劫持', env: 'frr', repetitions: 1 });
  const result = ex.run(plan);
  ex.teardown();
  assert.equal(result.data.engine, 'frr');
  assert.equal(result.data.simulated, false, '真实守护进程数据 → simulated=false');
  assert.ok(result.data.live && result.data.live.rpki_invalid === 2, 'live 原始计数进入 result.data');
  assert.equal(result.outcome, 'support', 'detection=0.667 ≥ 0.5 → support');
});

test('live: FrrTopology(available=true) 命令全失败 → 无回退 sim 时抛明确错误', () => {
  const topo = new FrrTopology({ available: true, runner: fakeRunner({}), config: { validator: 'rov' } });
  assert.throws(() => topo.inject(), /vtysh live metric collection failed/);
  topo.teardown();
});

test('live: 既有回退不回归 —— available=false 仍走 sim，无 live 字段', () => {
  const frr = new FrrTopology({ available: false, config: { seed: 1, validator: 'rov' } });
  assert.equal(frr.info.engine, 'frr-adapter-sim');
  const sample = frr.inject();
  assert.ok(sample.detection_rate > 0);
  assert.equal(sample.live, undefined, 'sim 回退不携带 live 字段');
  frr.teardown();

  const vpp = new VppTopology({ available: false, config: { seed: 1, validator: 'rov' } });
  assert.equal(vpp.info.engine, 'vpp-adapter-sim');
  assert.ok(vpp.inject().convergence_time > 0);
  assert.equal(vpp.inject().live, undefined);
  vpp.teardown();
});
