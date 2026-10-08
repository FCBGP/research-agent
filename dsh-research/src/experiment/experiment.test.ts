// 阶段 3 自检：统计口径 / 确定性模拟拓扑 / TopologyExecutor / 自动实验流水线 / FRR·VPP 适配器。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSeries, summarizeDetection, metricsFromResults } from './stats.ts';
import { RouteEngineSim, FrrTopology, VppTopology, mulberry32 } from './topology.ts';
import { TopologyExecutor } from './executors.ts';
import { runAutomaticExperiment } from './runner.ts';
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
