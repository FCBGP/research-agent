/**
 * H-UNI 参数扫描不变量测试（确定性 / 注入纪律 / 聚合一致性 / 反例计数）。
 * H-UNI 叙事：分散仓库（多次异步写 + 部分失败步上限）vs 统一仓库（原子写，失败忽略）。
 * 全部为 C-level 确定性模拟结论，engine=sim，仅作方向性证据。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateScenario,
  runSweep,
  scenarioFingerprint,
  sweepToMarkdown,
  summaryVerdict,
  mixSeed,
  SWEEP_DIMS,
  SWEEP_RATIO_KEYS,
  type SweepGridCell,
  type SweepReport,
  type SweepCellResult,
} from './sweep.ts';
import { runScenario, evaluateV3Narrow } from './compare.ts';
import type { IntentScenario, IntentEvent } from './types.ts';

const TEST_CELLS: ReadonlyArray<SweepGridCell> = [
  { asCount: 8, eventCount: 8, scriptCount: 4 },
  { asCount: 8, eventCount: 16, scriptCount: 4 },
  { asCount: 16, eventCount: 8, scriptCount: 4 },
  { asCount: 16, eventCount: 16, scriptCount: 4 },
];
const TEST_SEED = 20261016;

function failingScriptCount(c: SweepCellResult): number {
  return new Set(c.counterexamples.map((x) => x.scriptIndex)).size;
}

test('generateScenario 确定性：同种子两次 → 同指纹（含 name 字段）', () => {
  const a = generateScenario(16, 24, 12345, 'det');
  const b = generateScenario(16, 24, 12345, 'det');
  assert.equal(scenarioFingerprint(a), scenarioFingerprint(b));
  assert.equal(a.events.length, 24);
  // 不同种子必须产生不同指纹（否则扫描格内无多样性）
  const c = generateScenario(16, 24, 12346, 'det');
  assert.notEqual(scenarioFingerprint(a), scenarioFingerprint(c));
});

test('事件自身绝不携带 failAfterWrite；子种子互异', () => {
  for (const asCount of [8, 16, 32]) {
    for (const es of [8, 16]) {
      const sc = generateScenario(asCount, es, mixSeed(7, asCount, es));
      for (const ev of sc.events) assert.ok(!('failAfterWrite' in ev), `event carries failAfterWrite: ${JSON.stringify(ev)}`);
    }
  }
});

test('failurePlan 注入纪律：仅 splitPrefix/revokeAll 索引、值恒 1、键=事件索引', () => {
  for (const cell of TEST_CELLS) {
    for (let s = 0; s < cell.scriptCount; s++) {
      const sc: IntentScenario = generateScenario(cell.asCount, cell.eventCount, mixSeed(TEST_SEED, cell.asCount, cell.eventCount, s));
      const keys = Object.keys(sc.failurePlan).map(Number);
      for (const k of keys) {
        assert.equal(sc.failurePlan[k], 1, `failurePlan[${k}] != 1`);
        const ev: IntentEvent = sc.events[k];
        assert.ok(
          ev.kind === 'splitPrefix' || ev.kind === 'revokeAll',
          `failurePlan 键 ${k} 指向非注入事件 ${ev.kind}`,
        );
      }
      // 全网格至少保证注入机制存活（不应出现永久零注入）
      // —— 这里先验证本脚本内部：非注入索引不得出现在 failurePlan
      for (let i = 0; i < sc.events.length; i++) {
        const kind = sc.events[i].kind;
        const injectableKind = kind === 'splitPrefix' || kind === 'revokeAll';
        if (!injectableKind) assert.ok(!(i in sc.failurePlan), `索引 ${i}(${kind}) 被注入`);
      }
    }
  }
});

test('全网格至少出现一次部分失败注入（机制存活）', () => {
  const report = runSweep(TEST_CELLS, TEST_SEED);
  let planned = 0;
  for (const c of report.cells) {
    for (const sc of c.scripts.map((s2) => generateScenario(c.asCount, c.eventCount, s2.seed))) {
      planned += Object.keys(sc.failurePlan).length;
    }
  }
  assert.ok(planned > 0, 'failurePlan 全网格为空——注入机制疑似失效');
});

test('runSweep 整体确定性：同 globalSeed 两次 → 同一报告', () => {
  const r1 = runSweep(TEST_CELLS, TEST_SEED);
  const r2 = runSweep(TEST_CELLS, TEST_SEED);
  assert.equal(JSON.stringify(r1), JSON.stringify(r2));
});

test('统一仓库永不漂移：driftSum.unified === 0 && 每脚本 driftUnified === 0', () => {
  const report = runSweep(TEST_CELLS, TEST_SEED);
  for (const c of report.cells) {
    assert.equal(c.driftSum.unified, 0, `AS${c.asCount}/E${c.eventCount} unified drift != 0`);
    for (const sc of c.scripts) assert.equal(sc.driftUnified, 0);
  }
});

test('计数不变量：perDimOk[dim] + 该维反例数 === scriptCount', () => {
  const report = runSweep(TEST_CELLS, TEST_SEED);
  for (const c of report.cells) {
    for (const dim of SWEEP_DIMS) {
      const cxCount = c.counterexamples.filter((x) => x.dim === dim).length;
      assert.equal(
        c.perDimOk[dim] + cxCount,
        c.scriptCount,
        `AS${c.asCount}/E${c.eventCount}/${dim}: ${c.perDimOk[dim]}+${cxCount} != ${c.scriptCount}`,
      );
    }
  }
});

test('supportedCount 计数一致：== scriptCount - 出现反例的脚本数', () => {
  const report = runSweep(TEST_CELLS, TEST_SEED);
  for (const c of report.cells) {
    assert.equal(c.supportedCount, c.scriptCount - failingScriptCount(c));
  }
});

test('supportedCount 在合法范围内', () => {
  const report = runSweep(TEST_CELLS, TEST_SEED);
  for (const c of report.cells) {
    assert.ok(c.supportedCount >= 0 && c.supportedCount <= c.scriptCount);
    assert.ok(c.perDimOk.noDrift >= 0 && c.perDimOk.noDrift <= c.scriptCount);
  }
});

test('聚合一致性：avgRatios/maxRatios/drift/coherent/compliant 均由脚本重算吻合', () => {
  const report = runSweep(TEST_CELLS, TEST_SEED);
  const round = (x: number): number => Math.round(x * 100) / 100;
  for (const c of report.cells) {
    for (const k of SWEEP_RATIO_KEYS) {
      const mean = c.scripts.reduce((sum, sc) => sum + sc.ratios[k], 0) / c.scriptCount;
      assert.equal(c.avgRatios[k], round(mean), `avg ${k}`);
      const max = Math.max(...c.scripts.map((sc) => sc.ratios[k]));
      assert.equal(c.maxRatios[k], round(max), `max ${k}`);
    }
    const sumDrift = (key: 'dispersed' | 'unified'): number =>
      c.scripts.reduce((sum, sc) => sum + (key === 'dispersed' ? sc.driftDispersed : sc.driftUnified), 0);
    assert.equal(c.driftSum.dispersed, sumDrift('dispersed'));
    assert.equal(c.driftSum.unified, sumDrift('unified'));
    const sumCoherent = (key: 'dispersed' | 'unified'): number =>
      c.scripts.reduce((sum, sc) => sum + (key === 'dispersed' ? sc.coherentDispersed : sc.coherentUnified), 0);
    assert.equal(c.coherentSum.dispersed, sumCoherent('dispersed'));
    assert.equal(c.coherentSum.unified, sumCoherent('unified'));
    const sumCompliant = (key: 'dispersed' | 'unified'): number =>
      c.scripts.reduce((sum, sc) => sum + (key === 'dispersed' ? sc.compliantDispersed : sc.compliantUnified), 0);
    assert.equal(c.compliantSum.dispersed, sumCompliant('dispersed'));
    assert.equal(c.compliantSum.unified, sumCompliant('unified'));
  }
});

test('全涉及流水线可跑通：runScenario + evaluateV3Narrow + runSweepCell 不抛', () => {
  const report = runSweep(TEST_CELLS, TEST_SEED);
  for (const c of report.cells) {
    for (const sc of c.scripts) {
      const f = sc.finding;
      assert.equal(typeof f.supported, 'boolean');
      for (const dim of SWEEP_DIMS) assert.equal(typeof f.ok[dim], 'boolean');
    }
  }
  // 直接路径
  const sc = generateScenario(16, 16, 42);
  const r = runScenario(sc);
  const f = evaluateV3Narrow(r);
  assert.equal(typeof f.supported, 'boolean');
});

test('报告渲染冒烟：Markdown 含标题与逐格表，summaryVerdict 非空含目录判定', () => {
  const report = runSweep(TEST_CELLS, TEST_SEED);
  const md = sweepToMarkdown(report);
  assert.match(md, /# H-UNI 参数扫描报告/);
  assert.match(md, /\| 格\(AS×E\)/);
  const verdict = summaryVerdict(report);
  assert.ok(verdict.length > 0);
  assert.match(verdict, /聚合/);
});

test('脚本引用一致性：allScripts 计数与逐格脚本数吻合（论证扫描规模）', () => {
  const report: SweepReport = runSweep(TEST_CELLS, TEST_SEED);
  const total = report.cells.reduce((sum, c) => sum + c.scriptCount, 0);
  const sumScripts = report.cells.reduce((sum, c) => sum + c.scripts.length, 0);
  assert.equal(total, sumScripts);
});
