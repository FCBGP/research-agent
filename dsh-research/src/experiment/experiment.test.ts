// 阶段 3 自检：统计口径 / 确定性模拟拓扑 / TopologyExecutor / 自动实验流水线 / FRR·VPP 适配器。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSeries, summarizeDetection, metricsFromResults } from './stats.ts';
import { RouteEngineSim, FrrTopology, VppTopology, mulberry32, topologyForEnv, isSimulatedEngine } from './topology.ts';
import type { Topology, TopologyInfo, TopologyConfig, ValidatorMode } from './topology.ts';
import { TopologyExecutor } from './executors.ts';
import { runAutomaticExperiment, runCampaign } from './runner.ts';
import { createMemory } from '../memory/index.ts';
import { ExperimentAgent } from '../agents/experiment.ts';

test('stats: 数值序列均值/样本标准差/95%CI', () => {
  const s = analyzeSeries([2, 4, 6]);
  assert.equal(s.n, 3);
  assert.equal(s.mean, 4);
  assert.equal(s.stddev, 2);
  assert.ok(s.ci95[0] < 4 && s.ci95[1] > 4);
  assert.equal(analyzeSeries([]).n, 0);
  assert.equal(analyzeSeries([5]).stddev, 0, 'n=1 时样本标准差为 0');
});

test('stats: 攻击×验证四口径抽取 + 检测/误报合成口径', () => {
  const results = [
    { data: { detection_rate: 0.95, false_positive_rate: 0.008, convergence_time: 52.3, verification_latency: 2.4 } },
    { data: { detection_rate: 0.97, false_positive_rate: 0.006, convergence_time: 55.1, verification_latency: 2.9 } },
    { data: { detection_rate: 0.96, false_positive_rate: 0.007, convergence_time: 53.7, verification_latency: 2.6 } },
  ];
  const stats = metricsFromResults(results);
  assert.ok(stats.detection_rate && stats.false_positive_rate && stats.convergence_time && stats.verification_latency);
  assert.ok(Math.abs(stats.detection_rate.mean - 0.96) < 0.011);

  const det = summarizeDetection(results.map((r) => ({ detectionRate: r.data.detection_rate, falsePositiveRate: r.data.false_positive_rate })));
  assert.equal(det.n, 3);
  assert.ok(det.effectiveScore > 0.9);
});

test('topology: 同 seed 可复现；注入产生方差且有界', () => {
  const a = new RouteEngineSim({ seed: 42, validator: 'rov', attack: 'prefix-hijack' });
  const b = new RouteEngineSim({ seed: 42, validator: 'rov', attack: 'prefix-hijack' });
  a.deploy(); b.deploy();
  assert.deepEqual(a.inject(), b.inject(), '同 seed 首次注入应完全一致');
  const rounds = Array.from({ length: 6 }, () => a.inject());
  for (const r of rounds) {
    assert.ok(r.detection_rate > 0.5 && r.detection_rate <= 1, 'ROV 检测率有界合理');
    assert.ok(r.false_positive_rate >= 0 && r.false_positive_rate <= 0.05);
    assert.ok(r.convergence_time > 0, '收敛时间 > 0');
    assert.ok(r.verification_latency > 0, '验证时延 > 0');
  }
});

test('topology: ROV 相比无验证显著提升检测率（同 seed 对照）', () => {
  const none = new RouteEngineSim({ seed: 1, validator: 'none', attack: 'prefix-hijack' });
  const rov = new RouteEngineSim({ seed: 1, validator: 'rov', attack: 'prefix-hijack' });
  none.deploy(); rov.deploy();
  const meanDet = (t: RouteEngineSim) => Array.from({ length: 5 }, () => t.inject().detection_rate).reduce((x, y) => x + y, 0) / 5;
  assert.ok(meanDet(rov) - meanDet(none) > 0.4, 'ROV 应显著高于无验证');
});

test('topology: ROV 检测率随 ROA 覆盖占比衰减（V4 NotFound/覆盖前提参数化）', () => {
  // V4 前置：ROV 只对「有覆盖 ROA 的目标前缀」生效；NotFound 默认放行 → 检测率在
  // 「全覆盖全效」与「无验证基线」间按 coverage 线性插值。默认 coverage=1 时数值不变。
  const meanDet = (cov: number) => {
    const t = new RouteEngineSim({ seed: 7, validator: 'rov', attack: 'prefix-hijack', coverage: cov });
    return Array.from({ length: 8 }, () => t.inject().detection_rate).reduce((a, b) => a + b, 0) / 8;
  };
  const dFull = meanDet(1);
  const dHalf = meanDet(0.5);
  const dNone = meanDet(0);
  assert.ok(dFull > 0.7, `全覆盖 ROV 应高效（实测 ${dFull.toFixed(3)}）`);
  assert.ok(dHalf > 0.3 && dHalf < 0.6, `50% 覆盖应中等（实测 ${dHalf.toFixed(3)}）`);
  assert.ok(dNone < 0.15, `0 覆盖应回退无验证基线（实测 ${dNone.toFixed(3)}）`);
  assert.ok(dFull > dHalf && dHalf > dNone, '检测率应随覆盖单调衰减');
  // 实测锚点：NIST ROA 覆盖 ≈91.4% → 应低于全覆盖、仍高于半覆盖。
  const dMeasured = meanDet(0.914);
  assert.ok(dMeasured < dFull && dMeasured > dHalf, `实测覆盖 91.4% 应在全覆盖与半覆盖之间（实测 ${dMeasured.toFixed(3)}）`);
});

test('topology: BGPsec 检测率随部署占比按链完整度衰减（V5 部分部署前提参数化）', () => {
  // V5 前置：BGPsec 签名链仅沿途全部署时完整（链完整概率 = deployment^pathLen，pathLen=4）；
  // 非 BGPsec 节点剥离属性回退纯 BGP → 检测率按链完整度插值。默认 deployment=1 时数值不变。
  const meanDet = (dep: number) => {
    const t = new RouteEngineSim({ seed: 7, validator: 'bgpsec', attack: 'path-manipulation', deployment: dep });
    return Array.from({ length: 8 }, () => t.inject().detection_rate).reduce((a, b) => a + b, 0) / 8;
  };
  const dFull = meanDet(1);
  const d75 = meanDet(0.75);
  const dZero = meanDet(0);
  assert.ok(dFull > 0.85, `全部署 BGPsec 应高效（实测 ${dFull.toFixed(3)}）`);
  assert.ok(d75 < 0.5, `75% 部署应显著降级（dep^4≈0.32 链完整，实测 ${d75.toFixed(3)}）`);
  assert.ok(dZero < 0.15, `0 部署应回退无验证基线（实测 ${dZero.toFixed(3)}）`);
  assert.ok(dFull > d75 && d75 > dZero, '检测率应随部署单调衰减');
  // 采样带 provenance：非全值时 sample 出现 coverage/deployment/chainIntact 字段。
  const t = new RouteEngineSim({ seed: 7, validator: 'bgpsec', attack: 'path-manipulation', deployment: 0.5 });
  const s = t.inject();
  assert.equal(s.deployment, 0.5);
  assert.equal(typeof s.chainIntact, 'number');
  assert.ok(s.chainIntact! < 0.25, `dep^4 链完整应 ≤0.0625 附近（实测 ${s.chainIntact}）`);
  const full = new RouteEngineSim({ seed: 7, validator: 'bgpsec', attack: 'path-manipulation' }).inject();
  assert.equal(full.coverage, undefined, '全值时不写冗余 provenance 字段');
  assert.equal(full.deployment, undefined);
});

test('topology: coverage/deployment 参数化同 seed 可复现、收敛时延等口径有界', () => {
  const a = new RouteEngineSim({ seed: 42, validator: 'rov+bgpsec', attack: 'prefix-hijack', coverage: 0.914, deployment: 0.75 });
  const b = new RouteEngineSim({ seed: 42, validator: 'rov+bgpsec', attack: 'prefix-hijack', coverage: 0.914, deployment: 0.75 });
  a.deploy(); b.deploy();
  assert.deepEqual(a.inject(), b.inject(), 'coverage/deployment 参数化下同 seed 首次注入仍完全一致');
  for (const mm of [a.inject(), b.inject()]) {
    assert.ok(mm.detection_rate >= 0 && mm.detection_rate <= 1);
    assert.ok(mm.false_positive_rate >= 0 && mm.false_positive_rate <= 0.05);
    assert.ok(mm.convergence_time > 0);
    assert.ok(mm.verification_latency > 0);
    assert.equal(mm.coverage, 0.914);
    assert.equal(mm.deployment, 0.75);
  }
});

test('mulberry32: 确定性 PRNG 序列', () => {
  const r1 = mulberry32(9); const r2 = mulberry32(9);
  assert.deepEqual(Array.from({ length: 4 }, () => r1()), Array.from({ length: 4 }, () => r2()));
});

test('TopologyExecutor: run 返回四口径结果；重复轮次产生方差且 outcome 判定正确', () => {
  const ex = new TopologyExecutor({
    topology: new RouteEngineSim({ seed: 3, validator: 'rov', attack: 'prefix-hijack' }),
    supportThreshold: 0.6,
  });
  const plan = new ExperimentAgent().plan({ claimId: 'c-e', claimStatement: 'ROV 检测前缀劫持', env: 'frr', repetitions: 3 });
  const results = [0, 1, 2].map(() => ex.run(plan));
  ex.teardown();
  const stats = metricsFromResults(results);
  assert.equal(results.length, 3);
  assert.ok(results.every((r) => r.outcome === 'support'), 'ROV+threshold 0.6 全部 support');
  assert.ok(stats.detection_rate && stats.detection_rate.stddev > 0, '重复注入产生方差');
  for (const r of results) {
    assert.ok(Number.isFinite(r.data.detection_rate));
    assert.ok(Number.isFinite(r.data.false_positive_rate));
    assert.ok(Number.isFinite(r.data.convergence_time));
    assert.ok(Number.isFinite(r.data.verification_latency));
    assert.equal(r.data.simulated, true);
    assert.equal(r.claim, plan.claimId);
  }
});

test('runner: 自动实验 deploy→run→collect→analyze→verify→archive 全链路', () => {
  const memory = createMemory();
  const agents = new ExperimentAgent();
  const claimId = 'c-campaign';
  const plan = agents.plan({ claimId, claimStatement: 'ROV 可显著提升劫持检测', env: 'frr', repetitions: 3 });

  const report = runAutomaticExperiment({
    claim: { id: claimId, statement: 'ROV 可显著提升劫持检测' },
    plan,
    memory,
    validator: 'rov',
    supportThreshold: 0.6,
    topologyConfig: { seed: 1, asCount: 48 },
  });

  assert.equal(report.plan.claimId, claimId);
  assert.equal(report.results.length, 3);
  assert.ok(report.detection.mean > 0.6, 'ROV 检测率均值应超过阈值');
  assert.ok(report.stats.convergence_time && report.stats.verification_latency, '四口径统计齐全');
  assert.equal(report.outcome, 'support');
  assert.equal(report.verdict, 'verified', '证据已核验且实验支持 → verified');
  assert.equal(report.artifacts.length, 2, '实验档案 + verdict 两个 artifact');
  assert.equal(memory.episodic.ofKind('experiment').length, 1, '实验记入情景记忆');
  assert.equal(memory.artifact.forClaim(claimId).length, 2, '按 claim 可追溯归档');
});

test('FRR/VPP 适配器: 无二进制时回退到 sim 且渲染真实配置', () => {
  const frr = new FrrTopology({ available: false });
  assert.equal(frr.info.engine, 'frr-adapter-sim');
  const conf = frr.renderFrrConfig({ validator: 'rov', seed: 5 });
  assert.ok(conf.includes('router bgp 65000'));
  assert.ok(conf.includes('rpki rtr 192.0.2.1 port 8282'));
  assert.ok(conf.includes('rpki validate'));
  const sample = frr.inject();
  assert.ok(sample.detection_rate > 0, '回退 sim 能产出指标');

  const vpp = new VppTopology({ available: false });
  assert.equal(vpp.info.engine, 'vpp-adapter-sim');
  const vconf = vpp.renderVppConfig({ validator: 'rov+bgpsec' });
  assert.ok(vconf.includes('validator rov+bgpsec'));
  assert.ok(vpp.inject().convergence_time > 0);

  // available 且无回退时抛明确错误
  assert.throws(() => new VppTopology({ available: false, fallbackToSim: false }), /VPP 不可用/);
});

test('runner: 显式 attack 透传，不被 inferAttack(plan.scenario) 覆盖（art-11）', () => {
  const memory = createMemory();
  const agents = new ExperimentAgent();
  const claimId = 'c-attack-passthrough';
  // scenario=route-hijack → inferAttack 会推断 prefix-hijack（与显式攻击相悖）。
  const statement = 'ROV 能显著提升劫持（hijack）检测';
  const plan = agents.plan({ claimId, claimStatement: statement, env: 'frr', repetitions: 4 });

  const report = runAutomaticExperiment({
    claim: { id: claimId, statement },
    plan,
    memory,
    validator: 'rov',
    supportThreshold: 0.55,
    topologyConfig: { seed: 1, attack: 'as-set-injection', asCount: 48 },
  });

  // 显式 attackClass 应如实透传并写入每次结果，而非 inferAttack 的 prefix-hijack。
  assert.equal(report.results.length, 4);
  assert.ok(report.results.every((r) => r.data.attackClass === 'as-set-injection'),
    '    报告的 attackClass 全部为显式传入值');
  // 检测率应落在 as-set-injection(rov) ≈ 0.56–0.68 带内，而非 prefix-hijack(rov) ≈ 0.76–0.84。
  assert.ok(report.detection.mean > 0.5, 'as-set-injection(rov) 检测率下限');
  assert.ok(report.detection.mean < 0.72,
    `    低于 prefix-hijack(rov) 检测带（got ${report.detection.mean}），证明显式攻击类已生效`);
});

test('runner: runCampaign 的 attackClass 同样显式透传（research_campaign 全链路）', () => {
  const memory = createMemory();
  const agents = new ExperimentAgent();
  const claimId = 'c-campaign-attack';
  // scenario=bgpsec-path-verify → inferAttack 会推断 path-manipulation（与显式攻击相悖）。
  const report = runCampaign(memory, agents, {
    claim: { id: claimId, statement: 'ROV 防止 BGP 路径被篡改（path）' },
    env: 'frr',
    repetitions: 3,
    validator: 'rov',
    attackClass: 'as-set-injection',
    seed: 2,
  });

  assert.equal(report.plan.claimId, claimId);
  assert.equal(report.results.length, 3);
  assert.ok(report.results.every((r) => r.data.attackClass === 'as-set-injection'),
    '    research_campaign 的 attackClass 如实穿透到每次结果');
  assert.ok(report.detection.mean > 0.5 && report.detection.mean < 0.72,
    `    检测率落在 as-set-injection(rov) 带内（got ${report.detection.mean}）`);
});

// —— TODO「真实网元验证」：simulated 随 engine 派生 + env 真正路由拓扑执行源 ——

function fakeTopology(engine: string): Topology {
  const info: TopologyInfo = { engine, available: engine === 'frr' || engine === 'vpp', validator: 'rov', attack: 'prefix-hijack' };
  return {
    get info() { return info; },
    deploy(cfg?: TopologyConfig) { if (cfg?.validator) info.validator = cfg.validator; if (cfg?.attack) info.attack = cfg.attack; },
    teardown() {},
    inject() { return { detection_rate: 0.8, false_positive_rate: 0.02, convergence_time: 40, verification_latency: 1.5 }; },
  };
}

test('isSimulatedEngine: route-engine-sim / *-adapter-sim = 模拟；frr / vpp = 真实', () => {
  assert.equal(isSimulatedEngine('route-engine-sim'), true);
  assert.equal(isSimulatedEngine('frr-adapter-sim'), true);
  assert.equal(isSimulatedEngine('vpp-adapter-sim'), true);
  assert.equal(isSimulatedEngine('frr'), false, '真实 FRR 守护进程为 live 数据');
  assert.equal(isSimulatedEngine('vpp'), false, '真实 VPP 守护进程为 live 数据');
});

test('TopologyExecutor: simulated 随引擎派生，不再硬编码 true', () => {
  const plan = new ExperimentAgent().plan({ claimId: 'c-sim', claimStatement: 'ROV 检测劫持', env: 'frr', repetitions: 1 });
  // 模拟引擎 → simulated=true
  const sim = new TopologyExecutor({ topology: fakeTopology('route-engine-sim') });
  assert.equal(sim.run(plan).data.simulated, true);
  sim.teardown();
  // 真实 FRR 引擎 → simulated=false
  const live = new TopologyExecutor({ topology: fakeTopology('frr') });
  assert.equal(live.run(plan).data.simulated, false);
  assert.equal(live.run(plan).data.engine, 'frr');
  live.teardown();
  // 回退 adapter-sim → 仍如实标记模拟
  const fb = new TopologyExecutor({ topology: fakeTopology('frr-adapter-sim') });
  assert.equal(fb.run(plan).data.simulated, true);
  fb.teardown();
});

test('topologyForEnv: sim→RouteEngineSim；frr/vpp→适配器（沙箱无二进制回退 adapter-sim）', () => {
  const sim = topologyForEnv('sim', { seed: 1 });
  assert.equal(sim.info.engine, 'route-engine-sim');
  const frr = topologyForEnv('frr', { seed: 1 });
  assert.equal(frr.info.engine, 'frr-adapter-sim', '沙箱无 bgpd → 回退并如实标记');
  const vpp = topologyForEnv('vpp', { seed: 1 });
  assert.equal(vpp.info.engine, 'vpp-adapter-sim', '沙箱无 vpp → 回退并如实标记');
});

test('FrrTopology: config 透传（seed/asCount/validator 进入回退执行源）', () => {
  const a = new FrrTopology({ available: false, config: { seed: 11, asCount: 64, validator: 'rov', attack: 'prefix-hijack' } });
  const b = new FrrTopology({ available: false, config: { seed: 11, asCount: 64, validator: 'rov', attack: 'prefix-hijack' } });
  assert.equal(a.info.validator, 'rov');
  assert.equal(a.info.attack, 'prefix-hijack');
  a.deploy(); b.deploy();
  assert.deepEqual(a.inject(), b.inject(), '同 config 同 seed → 回退 sim 序列一致，证明 seed 已透传');
  assert.ok(a.inject().convergence_time > 0);
});

test('runner: 默认执行器随 plan.env 路由（无显式 executor）', () => {
  const agents = new ExperimentAgent();
  // env=frr → 走 FrrTopology（沙箱回退 adapter-sim，simulated 如实标注）
  const frrReport = runAutomaticExperiment({
    claim: { id: 'c-env-frr', statement: 'ROV 检测劫持' },
    plan: agents.plan({ claimId: 'c-env-frr', claimStatement: 'ROV 检测劫持', env: 'frr', repetitions: 2 }),
    validator: 'rov', supportThreshold: 0.5, topologyConfig: { seed: 1 },
  });
  assert.equal(frrReport.results.length, 2);
  assert.ok(frrReport.results.every((r) => r.data.engine === 'frr-adapter-sim'),
    'env=frr 应路由到 FrrTopology（沙箱回退 adapter-sim）');
  assert.ok(frrReport.results.every((r) => r.data.simulated === true), '回退期 simulated=true');
  assert.ok(frrReport.results.every((r) => r.data.env === 'frr'), 'results 携带 env 溯源');
  assert.equal(frrReport.stats.detection_rate.mean > 0.5, true, '回退 sim 仍满足检测带');

  // env=sim → RouteEngineSim
  const simReport = runAutomaticExperiment({
    claim: { id: 'c-env-sim', statement: 'ROV 检测劫持' },
    plan: agents.plan({ claimId: 'c-env-sim', claimStatement: 'ROV 检测劫持', env: 'sim', repetitions: 1 }),
    validator: 'rov', supportThreshold: 0.5, topologyConfig: { seed: 1 },
  });
  assert.equal(simReport.results[0].data.engine, 'route-engine-sim');
  assert.equal(simReport.results[0].data.simulated, true);
  assert.equal(simReport.results[0].data.env, 'sim');

  // env=vpp → VppTopology 适配器（沙箱回退 adapter-sim）
  const vppReport = runAutomaticExperiment({
    claim: { id: 'c-env-vpp', statement: 'ROV 检测劫持' },
    plan: agents.plan({ claimId: 'c-env-vpp', claimStatement: 'ROV 检测劫持', env: 'vpp', repetitions: 1 }),
    validator: 'rov', supportThreshold: 0.5, topologyConfig: { seed: 1 },
  });
  assert.equal(vppReport.results[0].data.engine, 'vpp-adapter-sim');
  assert.equal(vppReport.results[0].data.simulated, true);
});

test('runner: research_campaign env=frr 复测路径生成引擎正确的 campaign（TODO 真实网元验证）', () => {
  const memory = createMemory();
  const agents = new ExperimentAgent();
  // 与关系报告同一个 4 攻击 × 4 策略细胞：as-set-injection × rov（sim-grid 参照 ≈0.597）。
  const report = runCampaign(memory, agents, {
    claim: { id: 'c-frr-live', statement: 'ROV 检测 as-set 注入（复测）' },
    env: 'frr',
    repetitions: 4,
    validator: 'rov',
    attackClass: 'as-set-injection',
    seed: 7,
    supportThreshold: 0.5, // as-set-injection(rov) ≈0.597 ≥ 0.5 → support（与既有 attack 透传测试同口径）
  });
  assert.equal(report.plan.env, 'frr');
  assert.ok(report.results.every((r) => r.data.engine === 'frr-adapter-sim'), '沙箱无 bgpd → frr-adapter-sim');
  assert.ok(report.results.every((r) => r.data.simulated === true), '回退期如实标记模拟');
  assert.ok(report.results.every((r) => r.data.env === 'frr'));
  assert.ok(report.detection.mean > 0.5 && report.detection.mean < 0.72,
    'as-set-injection(rov) 带内（sim-grid 参照 ≈0.597）');
  assert.equal(report.verdict, 'verified', '复测 campaign 仍产出 verdict');
  // 目标机装好 FRR（bgpd+RTR+BGPsec）后，同一路径 engine 会切到 frr、simulated=false ——
  // 由 frr-grid.mjs（--require-live）复测时断言。
});

// —— ASPA / RFC 9319：路径政策场景（TODO「ASPA 对 V10 授权泄密/原主作恶的增量收益」） ——
function meanDet(topo: RouteEngineSim, n = 8): number {
  return Array.from({ length: n }, () => topo.inject().detection_rate).reduce((a, b) => a + b, 0) / n;
}

test('ASPA: 对 authorized-leak 高检测，而 ROV/BGPsec 机制性失效（V10 增量收益）', () => {
  // V10「原主作恶/授权泄密」：origin 持有合法 ROA（ROV 放行），路径被授权 AS 泄给非
  // 合法上游（破坏 valley-free/provider 政策）→ ROV（origin-only）与 BGPsec（只认证、
  // 不校验政策）都无法识别；ASPA（RFC 9319 路径政策校验 customer→provider 跳）是
  // 对此场景的专用机制，应显著高于前两者。
  const rov = new RouteEngineSim({ seed: 7, validator: 'rov', attack: 'authorized-leak' });
  const bgpsec = new RouteEngineSim({ seed: 7, validator: 'bgpsec', attack: 'authorized-leak' });
  const aspa = new RouteEngineSim({ seed: 7, validator: 'aspa', attack: 'authorized-leak' });
  const rovAs = new RouteEngineSim({ seed: 7, validator: 'rov+aspa', attack: 'authorized-leak' });
  const dRov = meanDet(rov);
  const dBgpsec = meanDet(bgpsec);
  const dAspa = meanDet(aspa);
  const dRovAs = meanDet(rovAs);
  assert.ok(dRov < 0.2, `ROV 对授权泄密基本失效（实测 ${dRov.toFixed(3)}）`);
  assert.ok(dBgpsec < 0.3, `BGPsec 只认证不校验政策 → 对授权泄密仍低（实测 ${dBgpsec.toFixed(3)}）`);
  assert.ok(dAspa > 0.8, `ASPA 应高检测授权泄密（实测 ${dAspa.toFixed(3)}）`);
  assert.ok(dRovAs > 0.8, `ROV+ASPA 联合仍高（实测 ${dRovAs.toFixed(3)}）`);
  // 增量收益：ASPA 相对 ROV / BGPsec 的机制缺口，应 ≥ 0.5。
  assert.ok(dAspa - dRov > 0.5, `ASPA−ROV 增量 ≥ 0.5（实测 ${(dAspa - dRov).toFixed(3)}）`);
  assert.ok(dAspa - dBgpsec > 0.4, `ASPA−BGPsec 增量 ≥ 0.4（实测 ${(dAspa - dBgpsec).toFixed(3)}）`);
});

test('ASPA: authorized-leak 新攻击类同 seed 可复现、全部验证器下有界', () => {
  const a = new RouteEngineSim({ seed: 42, validator: 'aspa', attack: 'authorized-leak' });
  const b = new RouteEngineSim({ seed: 42, validator: 'aspa', attack: 'authorized-leak' });
  a.deploy(); b.deploy();
  assert.deepEqual(a.inject(), b.inject(), '同 seed 首次注入一致');
  for (const v of ['none', 'rov', 'bgpsec', 'rov+bgpsec', 'aspa', 'rov+aspa'] as const) {
    const t = new RouteEngineSim({ seed: 3, validator: v, attack: 'authorized-leak' });
    for (const s of Array.from({ length: 6 }, () => t.inject())) {
      assert.ok(s.detection_rate >= 0 && s.detection_rate <= 1);
      assert.ok(s.false_positive_rate >= 0 && s.false_positive_rate <= 0.05);
      assert.ok(s.convergence_time > 0);
      assert.ok(s.verification_latency > 0);
    }
  }
});

test('ASPA: FRR/VPP 渲染配置含 RFC 9319 路径政策行', () => {
  const frr = new FrrTopology({ available: false });
  const frrAs = frr.renderFrrConfig({ validator: 'aspa', seed: 5 });
  assert.ok(frrAs.includes('ASPA path-policy verify (RFC 9319)'), 'frr.conf 含 ASPA 政策行');
  assert.ok(frrAs.includes('rpki rtr 192.0.2.1 port 8282'), 'ASPA 对象随 RPKI-RTR 会话下发');
  const frrRov = frr.renderFrrConfig({ validator: 'rov', seed: 5 });
  assert.ok(!frrRov.includes('ASPA path-policy'), 'validator=rov 不渲染 ASPA 行');

  const vpp = new VppTopology({ available: false });
  assert.ok(vpp.renderVppConfig({ validator: 'rov+aspa' }).includes('aspa-policy verify (RFC 9319)'));
  assert.ok(!vpp.renderVppConfig({ validator: 'bgpsec' }).includes('aspa-policy verify'));
});

test('runner: authorized-leak campaign —— ASPA 侧 verified、ROV 对照侧不达阈值', () => {
  const memory = createMemory();
  const agents = new ExperimentAgent();
  const claim = { id: 'c-v10', statement: 'ASPA 对 授权泄密/原主作恶（V10）的增量收益' };
  const aspaReport = runCampaign(memory, agents, {
    claim,
    env: 'sim', repetitions: 8, validator: 'aspa', attackClass: 'authorized-leak', seed: 7, supportThreshold: 0.8,
  });
  assert.ok(aspaReport.results.every((r) => r.data.attackClass === 'authorized-leak'));
  assert.ok(aspaReport.results.every((r) => r.data.validator === 'aspa'));
  assert.ok(aspaReport.detection.mean > 0.8, `aspa 侧 detection=${aspaReport.detection.mean.toFixed(3)}`);
  assert.equal(aspaReport.outcome, 'support');
  assert.equal(aspaReport.verdict, 'verified', 'ASPA 高检测 → 实验支持 V10 增量收益');

  const rovReport = runCampaign(memory, agents, {
    claim: { id: 'c-v10-rov', statement: 'ROV 对照：授权泄密不可测' },
    env: 'sim', repetitions: 8, validator: 'rov', attackClass: 'authorized-leak', seed: 7, supportThreshold: 0.8,
  });
  assert.ok(rovReport.detection.mean < 0.2, `rov 对照侧 detection=${rovReport.detection.mean.toFixed(3)}（机制性失效）`);
  assert.equal(rovReport.outcome, 'refute', 'ROV 对照侧显著低于阈值 → refute');
});
