// src/triz/triz.test.ts — TRIZ 分析引擎自测（Node 24 直接跑：node --test src/triz/triz.test.ts）。
// 覆盖：知识基完整性（40 原理/39 参数、编号唯一）、参数解析（中英别名）、矛盾矩阵命中与
// 启发式兜底与未解析、分离/进化视角、假说生成、IFR 建模、createTrizService 端到端。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  TRIZ_PRINCIPLES,
  TRIZ_PARAMETERS,
  TRIZ_CURATED_MATRIX,
  ROUTING_PARAMETER_ALIASES,
} from './data.ts';
import {
  resolveParameter,
  principlesFor,
  separationFor,
  evolutionFor,
  toHypotheses,
  idealityFraming,
  createTrizService,
  extractContradiction,
} from './index.ts';

test('triz: 知识基完整——40 原理与 39 参数，编号唯一且连续', () => {
  assert.equal(TRIZ_PRINCIPLES.length, 40, '40 条发明原理');
  assert.equal(TRIZ_PARAMETERS.length, 39, '39 个技术参数');
  assert.equal(new Set(TRIZ_PRINCIPLES.map((p) => p.no)).size, 40, '原理编号唯一');
  assert.equal(new Set(TRIZ_PARAMETERS.map((p) => p.no)).size, 39, '参数编号唯一');
  for (const p of TRIZ_PRINCIPLES) {
    assert.ok(p.name.length > 0 && p.routingHint.length > 0, `原理 ${p.no} 有名称与路由提示`);
  }
  // 精选矩阵的编号都在有效范围内
  for (const cell of TRIZ_CURATED_MATRIX) {
    assert.ok(cell.improve >= 1 && cell.improve <= 39, 'improve 参数编号合法');
    assert.ok(cell.worsen >= 1 && cell.worsen <= 39, 'worsen 参数编号合法');
    for (const n of cell.principles) assert.ok(n >= 1 && n <= 40, `原理 ${n} 合法`);
  }
});

test('triz: resolveParameter 解析中英别名与规范名', () => {
  assert.equal(resolveParameter('Hostilityhold')?.no, undefined);
  assert.equal(resolveParameter('收敛')?.no, 25, '中文别名');
  assert.equal(resolveParameter('convergence')?.no, 25, '英文别名');
  assert.equal(resolveParameter('Security')?.no, 30, '大小写不敏感');
  assert.equal(resolveParameter('Reliability')?.no, 27, '规范名精确匹配');
  assert.equal(resolveParameter('延迟')?.no, 25, '离散别名');
  assert.equal(resolveParameter(undefined), undefined, 'undefined → undefined');
  assert.equal(resolveParameter(''), undefined, '空串 → undefined');
});

test('triz: 矛盾矩阵命中 → curated-matrix，且候选为合法原理', () => {
  const ip = resolveParameter('reliability');
  const wp = resolveParameter('收敛');
  const { principles, source } = principlesFor(ip, wp);
  assert.equal(source, 'curated-matrix', '命中 (27 Reliability, 25 Loss of time)');
  assert.deepEqual(principles, [11, 10, 23], '适配推荐：事先缓冲/预操作/反馈');
  const { candidates } = createTrizService().analyzeProblem({
    problem: '提高 RPKI 验证可靠性而不显著拖慢收敛',
    improving: 'reliability', worsening: '收敛',
  });
  assert.equal(candidates.length, 3);
  assert.equal(candidates[0].no, 11);
  assert.ok(candidates.every((c) => c.routingHint.length > 0), '每个候选都有路由提示');
});

test('triz: 未收录参数对 → heuristic-fallback（来源如实标注）', () => {
  const ip = resolveParameter('吞吐');
  const wp = resolveParameter('stability'); // 13 号不在精选矩阵
  const { principles, source } = principlesFor(ip, wp);
  assert.equal(source, 'heuristic-fallback');
  assert.ok(principles.length > 0);
});

test('triz: 参数未解析 → unresolved + 启动原理集', () => {
  const { source, candidates } = createTrizService().analyzeProblem({ problem: '背景模糊的问题', worsening: 'zzz' });
  assert.equal(source, 'unresolved');
  assert.ok(candidates.length > 0, '仍有启动候选');
  assert.deepEqual(createTrizService().analyzeProblem({ problem: 'x' }).contradiction, { improving: undefined, worsening: undefined });
});

test('triz: 分离/进化视角按矛盾主题给出', () => {
  const sep = separationFor(resolveParameter('检测'), resolveParameter('延迟'));
  assert.ok(sep.some((s) => s.type === '时间'), '时间/速度矛盾 → 时间分离');
  const evo = evolutionFor(undefined, resolveParameter('复杂度'));
  assert.ok(evo.some((e) => e.law.includes('超系统')), '复杂度 → 向超系统迁移');
});

test('triz: toHypotheses 生成结构化假说（type=Hypothesis，待核验）', () => {
  const svc = createTrizService();
  const analysis = svc.analyzeProblem({
    problem: '缓解恶意 AS_PATH 操纵',
    improving: 'security', worsening: '收敛',
  });
  const hs = svc.toHypotheses(analysis);
  assert.ok(hs.length >= 3, '候选原理条数');
  for (const h of hs) {
    assert.equal(h.type, 'Hypothesis');
    assert.equal(h.source, 'triz');
    assert.equal(h.confidence, 0.5);
    assert.ok(h.statement.includes(h.principleName));
    assert.ok(h.mechanism.includes(h.principleName));
    assert.ok(h.contradiction.length > 0);
    assert.ok(/^triz-\d+-\d+$/.test(h.id));
  }
});

test('triz: idealityFraming 输出 IFR/有害作用/资源/增益四件套', () => {
  const f = idealityFraming({ problem: 'prefix hijack' });
  assert.ok(f.ifr.includes('prefix hijack'));
  assert.ok(f.harms.length >= 4);
  assert.ok(f.resources.length >= 4);
  assert.ok(f.benefits.length >= 2);
});

test('triz: createTrizService 端到端 —— analyze→hypotheses 全程可跑', () => {
  const svc = createTrizService();
  const a = svc.analyzeProblem({ problem: 'ROV 提升劫持检测率但稍抬误报', improving: '检测', worsening: '可靠性' });
  assert.ok(a.candidates.length > 0);
  const hs = svc.toHypotheses(a);
  assert.ok(hs.length === a.candidates.length, '假说条数 = 候选条数');
});

test('triz: mapResult —— 结果→发明原理映射（缺省矛盾 + 结果文本反演）', () => {
  const svc = createTrizService();
  // 无文本/无矛盾：didactic 正演在场；缺省矛盾 detection↔complexity 命中精选矩阵
  const m = svc.mapResult({ problem: 'ROV 提升劫持检测率而不放大误报' });
  assert.equal(m.source, 'curated-matrix');
  assert.equal(m.contradictionOrigin, 'extracted', '从问题文本提取出「检测」改善侧');
  assert.equal(m.contradiction.improving, 'Measurement accuracy');
  assert.equal(m.contradiction.worsening, 'Device complexity');
  assert.ok(m.entries.length >= 1, '至少 1 条原理');
  assert.ok(m.entries.every((e) => e.kind === 'didactic'), '无结果文本只有 didactic');
  // 无任何可提取词 → 完全默认（origin=default）
  assert.equal(svc.mapResult({ problem: 'x' }).contradictionOrigin, 'default');
  // 结果文本特征词补足 → 出现 retrospective 且不超上限
  const m2 = svc.mapResult({ problem: 'x', improving: 'detection', worsening: 'complexity', resultText: '采用分割、抽取与预操作，并把攻击面变害为利' });
  assert.ok(m2.entries.length > m.entries.length, '特征词补足更多原理');
  assert.ok(m2.entries.some((e) => e.kind === 'retrospective'), '出现反演条目');
  assert.ok(m2.entries.length <= 5, '不超 5 条上限');
});

test('triz: extractContradiction 规则提取矛盾——命中精选矩阵优先、无命中返回空', () => {
  assert.deepEqual(extractContradiction('ROV 提升劫持检测率而不增加复杂度'), { improving: 'detection', worsening: 'complexity' }, '检测↔复杂度');
  assert.deepEqual(extractContradiction('提高可靠性而不显著拖慢收敛'), { improving: 'reliability', worsening: 'convergence' }, '可靠↔收敛 → (27,25)');
  assert.deepEqual(extractContradiction('增强抗劫持能力不增加延迟'), { improving: 'security', worsening: 'convergence' }, '抗劫持↔延迟 → (30,25)');
  assert.deepEqual(extractContradiction('提升吞吐而不增加消息开销'), { improving: 'throughput', worsening: 'overhead' }, '吞吐↔开销 → (39,22)');
  assert.equal(extractContradiction('自动化水平越高越好').improving, 'automation', '只有改善侧也能提取');
  assert.deepEqual(extractContradiction('系统复杂度会上升'), { worsening: 'complexity' }, '只有代价侧也能提取');
  assert.deepEqual(extractContradiction('没有特征的平淡问题'), {}, '无特征词 → 空（由 mapResult 回落默认）');
  assert.deepEqual(extractContradiction(''), {}, '空文本 → 空');
});
