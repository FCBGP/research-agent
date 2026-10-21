// src/draw/dimensions.test.ts — 科研绘图尺寸/比例/分辨率/画质纯函数自测。
// 覆盖：各比例×分辨率 32 对齐、宽高覆盖、越界 clamp、api 标准尺寸回退、朝向、默认值。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ASPECT_RATIOS, DEFAULT_ASPECT, DEFAULT_QUALITY, DEFAULT_RESOLUTION, QUALITIES, QUALITY_STEPS,
  RESOLUTION_LONG_EDGE, RESOLUTIONS, align32, aspectOrientation, baseSize, nearestStandardSize,
  parseAspect, sizeFor,
} from './dimensions.ts';

test('draw/dimensions: 各比例 × 各分辨率 → local 32 倍数对齐 + 长边=分辨率档', () => {
  for (const aspect of ASPECT_RATIOS) {
    for (const res of RESOLUTIONS) {
      const s = sizeFor(aspect, res);
      assert.equal(s.width % 32, 0, `${aspect}/${res} width 32 对齐`);
      assert.equal(s.height % 32, 0, `${aspect}/${res} height 32 对齐`);
      assert.equal(Math.max(s.width, s.height), RESOLUTION_LONG_EDGE[res], `${aspect}/${res} 长边=分辨率长边`);
      assert.equal(s.aspect, aspect);
      assert.equal(s.apiSize, `${s.width}x${s.height}`);
    }
  }
});

test('draw/dimensions: 默认参数 16:9 / 2K / high 且朝向 landscape', () => {
  const s = sizeFor();
  assert.equal(s.aspect, DEFAULT_ASPECT, '默认 16:9');
  assert.equal(Math.max(s.width, s.height), RESOLUTION_LONG_EDGE[DEFAULT_RESOLUTION], '默认 2K 长边 2048');
  assert.equal(s.orientation, 'landscape');
  // 画质步数口径：低20·中30·高50，默认 高=50
  assert.equal(QUALITY_STEPS.low, 20);
  assert.equal(QUALITY_STEPS.medium, 30);
  assert.equal(QUALITY_STEPS.high, 50);
  assert.equal(QUALITY_STEPS[DEFAULT_QUALITY], 50);
  assert.deepEqual([...QUALITIES], ['low', 'medium', 'high']);
});

test('draw/dimensions: 宽高覆盖优先（local 再 32 对齐），未提供侧仍按比例', () => {
  // 1024 宽 → local 对齐 1024；高按 16:9 = 576
  const s = sizeFor('16:9', '2K', { width: 1024 });
  assert.equal(s.width, 1024);
  assert.equal(s.height, 576, '1024/16*9=576 且 576 是 32 的倍数');
  assert.equal(s.height % 32, 0);
  // 双覆盖都生效
  const s2 = sizeFor('1:1', '4K', { width: 800, height: 608 });
  assert.equal(s2.width, 800);
  assert.equal(s2.height, 608, '608 是 32 的倍数');
});

test('draw/dimensions: 越界覆盖被 clamp（下限 256 / 上限 4096）', () => {
  const s = sizeFor('16:9', '1K', { width: 64, height: 10000 });
  assert.equal(s.width, 256, '宽度 clamp 到下限 256（256 = 32 对齐）');
  assert.equal(s.height, 4096, '高度 clamp 到上限 4096');
});

test('draw/dimensions: api 模式 —— standard-only 直接取最近标准档，exact-then-fallback 先精确后兜底', () => {
  // 21:10 无标准档 → standard-only 应落入标准档表
  const s = sizeFor('21:10', '4K', undefined, 'api', 'standard-only');
  assert.ok(nearestStandardSize(s.width, s.height).split('x').every((n) => Number.isInteger(+n)), 'apiFallback 为标准尺寸字符串');
  assert.equal(s.apiSize, s.apiFallback, 'standard-only 时 apiSize = 最近标准档');
  // exact-then-fallback：apiSize = 精确 WxH，apiFallback = 最近标准档
  const e = sizeFor('21:10', '2K', undefined, 'api', 'exact-then-fallback');
  assert.equal(e.apiSize, `${e.width}x${e.height}`, 'exact-then-fallback 先发精确尺寸');
  assert.notEqual(e.apiSize, e.apiFallback, '21:10 无标准档 → 兜底档不同');
});

test('draw/dimensions: nearestStandardSize 在标准表内且 16:9 → 1792x1024', () => {
  const near = nearestStandardSize(2048, 1152);
  assert.ok(near.includes('x'), '标准档字符串');
  assert.deepEqual(parseAspect(near), [1792, 1024], '16:9 附近最近标准档');
});

test('draw/dimensions: parseAspect / aspectOrientation / baseSize / align32', () => {
  assert.deepEqual(parseAspect('16:9'), [16, 9]);
  assert.deepEqual(parseAspect('9:16'), [9, 16]);
  assert.deepEqual(parseAspect('1:1'), [1, 1]);
  assert.equal(parseAspect('abc'), null);
  assert.equal(parseAspect('0:10'), null, '0 比例非法');
  assert.equal(aspectOrientation('16:9'), 'landscape');
  assert.equal(aspectOrientation('9:16'), 'portrait');
  assert.equal(aspectOrientation('1:1'), 'square');
  assert.equal(aspectOrientation('garbage'), 'landscape', '非法回落 landscape');
  const b = baseSize('16:9', 1024);
  assert.deepEqual([b.width, b.height], [1024, 576]);
  assert.equal(align32(100), 96, '100 → 96');
  assert.equal(align32(110), 96);
  assert.equal(align32(120), 128);
  assert.equal(align32(10), 32, '下限 32');
});
