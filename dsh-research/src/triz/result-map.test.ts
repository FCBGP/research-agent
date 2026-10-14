// src/triz/result-map.test.ts — 「结果 → TRIZ 发明原理」映射自测。
// 覆盖：didactic 矛盾分析正演永远在场；retrospective 特征词打分补足至上限；
// 无命中不硬凑；中英别名匹配；条目唯一且类型/理由齐备；service.mapResult 端到端。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTrizService } from './index.ts';
import { mapResultToTriz, toTrizMappingLine, MAX_RESULT_MAPPING } from './result-map.ts';

const svc = createTrizService();
/** 缺省矛盾（detection ↔ complexity，命中精选矩阵 cell (28,36) → #23/2/24）。 */
function defaultAnalysis() {
  return svc.analyzeProblem({ problem: 'ROV 提升劫持检测率而不放大误报', improving: 'detection', worsening: 'complexity' });
}

test('result-map: 无结果文本 → 仅 didactic（矛盾分析正演在场，条数=候选数）', () => {
  const analysis = defaultAnalysis();
  const m = mapResultToTriz({ problem: analysis.problem, analysis, resultText: undefined });
  assert.equal(m.source, 'curated-matrix');
  assert.ok(m.entries.length >= 1, '至少 1 条');
  assert.deepEqual(m.entries.map((e) => e.kind), Array(m.entries.length).fill('didactic'), '空结果文本不产生 retrospective');
  assert.deepEqual(m.entries.length, analysis.candidates.length, 'didactic = 候选原理数');
  assert.ok(m.entries.every((e) => e.reason.includes('矛盾分析')), 'each didactic entry 带矛盾分析理由');
});

test('result-map: didactic 优先 + retrospective 按特征词补足，最多 MAX_RESULT_MAPPING 条且编号唯一', () => {
  const analysis = defaultAnalysis();
  // 特征词覆盖多个非 didactic 原理（分割/预操作/变害为利/自服务/合并…）
  const m = mapResultToTriz({
    problem: analysis.problem,
    analysis,
    resultText: '本研究采用分割与预操作，把既有攻击面变害为利，并引入自服务与合并机制',
  });
  assert.ok(m.entries.length > analysis.candidates.length, '特征词应补足 didactic 之外条目');
  assert.ok(m.entries.length <= MAX_RESULT_MAPPING, `不超过上限 ${MAX_RESULT_MAPPING}`);
  assert.ok(m.entries.some((e) => e.kind === 'retrospective'), '含 retrospective 反演条目');
  assert.equal(new Set(m.entries.map((e) => e.principleNo)).size, m.entries.length, '原理编号唯一不重复');
  for (const e of m.entries) {
    assert.ok(e.principleNo >= 1 && e.principleNo <= 40, '原理编号合法');
    assert.ok(e.principleName.length > 0);
    assert.ok(e.reason.length > 0);
  }
});

test('result-map: 中英别名都命中——英文规范名与中文别名均能反演', () => {
  const analysis = defaultAnalysis();
  const textEn = mapResultToTriz({ problem: 'x', analysis, resultText: 'use Segmentation and Preliminary action' });
  assert.ok(textEn.entries.some((e) => e.principleNo === 1 && e.kind === 'retrospective'), '英文 Segmentation → #1 反演');
  const textZh = mapResultToTriz({ problem: 'x', analysis, resultText: '采用分割与预操作手段' });
  assert.ok(textZh.entries.some((e) => e.principleNo === 1 && e.kind === 'retrospective'), '中文「分割」→ #1 反演');
  assert.ok(textZh.entries.some((e) => e.principleNo === 10 && e.kind === 'retrospective'), '中文「预操作」→ #10 反演');
});

test('result-map: 结果文本无特征词命中 → 不硬凑（仍只 didactic）', () => {
  const analysis = defaultAnalysis();
  const m = mapResultToTriz({ problem: 'x', analysis, resultText: 'qwerty123 无关内容 @@@' });
  assert.deepEqual(m.entries.map((e) => e.kind), Array(m.entries.length).fill('didactic'), '无命中不补 retrospective');
  assert.equal(m.entries.length, analysis.candidates.length);
});

test('result-map: contradiction 字段反映解析后的参数名', () => {
  const analysis = defaultAnalysis();
  const m = mapResultToTriz({ problem: 'x', analysis, resultText: '' });
  assert.equal(m.contradiction.improving, 'Measurement accuracy', 'detection → 参数 28 规范名');
  assert.equal(m.contradiction.worsening, 'Device complexity', 'complexity → 参数 36 规范名');
});

test('result-map: toTrizMappingLine 渲染一条可读行（[原理N Name] reason）', () => {
  const analysis = defaultAnalysis();
  const m = mapResultToTriz({ problem: 'x', analysis, resultText: '' });
  const line = toTrizMappingLine(m.entries[0]);
  assert.ok(/^\[原理\d+ .+\] /.test(line), `行格式：${line}`);
  assert.ok(line.includes(m.entries[0].reason));
});

test('result-map: service.mapResult 端到端——缺省矛盾 detection↔complexity、常量 override 生效', () => {
  const m = svc.mapResult({ problem: 'ROV 提升劫持检测率', resultText: '应用反馈并联动收敛' });
  assert.equal(m.source, 'curated-matrix');
  assert.equal(m.contradiction.improving, 'Measurement accuracy');
  assert.equal(m.contradiction.worsening, 'Device complexity');
  assert.ok(m.entries.length >= 1);
  // override 矛盾：想改善收敛（25）× 恶化复杂度 → (25,36) 不在精选矩阵 → heuristic-fallback
  const mo = svc.mapResult({ problem: 'x', improving: '收敛', worsening: '复杂度', resultText: '' });
  assert.equal(mo.source, 'heuristic-fallback');
  assert.ok(mo.entries.length > 0);
});
