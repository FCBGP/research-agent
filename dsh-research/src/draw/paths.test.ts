// src/draw/paths.test.ts — 输出路径纯函数自测：固定格式 / 子目录 / HOME 展开 / 同秒序号。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DRAW_OUTPUT_EXT, DRAW_OUTPUT_PREFIX, DRAW_OUTPUT_SUBDIR, DRAW_TIMESTAMP_PATTERN, drawOutputName, drawOutputPath, expandHome } from './paths.ts';

test('draw/paths: drawOutputName 固定格式 image-YYYYMMDDHHmmSS.png（本地时区）', () => {
  const d = new Date(2026, 9, 21, 10, 5, 7); // 2026-10-21 10:05:07
  const name = drawOutputName(d);
  assert.match(name, DRAW_TIMESTAMP_PATTERN, '匹配固定时间戳格式');
  assert.equal(name, 'image-20261021100507.png');
  assert.ok(name.startsWith(DRAW_OUTPUT_PREFIX) && name.endsWith(DRAW_OUTPUT_EXT));
  // 月/日/时分秒补零
  const d2 = new Date(2026, 0, 3, 4, 5, 6);
  assert.equal(drawOutputName(d2), 'image-20260103040506.png');
});

test('draw/paths: 同秒冲突 → 追加序号', () => {
  const d = new Date(2026, 9, 21, 10, 5, 7);
  assert.equal(drawOutputName(d, 0), 'image-20261021100507.png');
  assert.equal(drawOutputName(d, 1), 'image-20261021100507-1.png');
  assert.equal(drawOutputName(d, 2), 'image-20261021100507-2.png');
});

test('draw/paths: drawOutputPath 固定追加 images/ 子目录 + 展开 ~/', () => {
  const d = new Date(2026, 9, 21, 10, 5, 7);
  const home = '/Users/basil';
  assert.equal(
    drawOutputPath('~/Downloads/outputs', d, home),
    '/Users/basil/Downloads/outputs/images/image-20261021100507.png',
  );
  // 无 ~ 前缀原样
  assert.equal(
    drawOutputPath('/data/out', d, home),
    '/data/out/images/image-20261021100507.png',
  );
  // 子目录常量
  assert.equal(DRAW_OUTPUT_SUBDIR, 'images');
});

test('draw/paths: expandHome 展开 ~ 与 ~/ prefix，其它原样', () => {
  assert.equal(expandHome('~', '/h'), '/h');
  assert.equal(expandHome('~/x/y', '/h'), '/h/x/y');
  assert.equal(expandHome('/abs', '/h'), '/abs');
  assert.equal(expandHome('rel', '/h'), 'rel');
});
