// src/draw/overlay.test.ts — 两阶段混合（方案 C）纯函数自测。
//
// parseOverlayLines / normalizeOverlayLabel(s) / buildOverlayScript /
// buildOverlayCommand / parseOverlayDims 全部无 IO，直接断言。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildOverlayCommand,
  buildOverlayScript,
  normalizeOverlayLabel,
  normalizeOverlayLabels,
  parseOverlayDims,
  parseOverlayLines,
  type OverlayLabel,
} from './overlay.ts';

test('overlay: parseOverlayLines — 纯文本缺省底部居中 + 自动样式', () => {
  const labels = parseOverlayLines('BGP 域间路由\nAS65000\n');
  assert.equal(labels.length, 2);
  assert.deepEqual(labels[0], { text: 'BGP 域间路由' });
  assert.deepEqual(labels[1], { text: 'AS65000' });
});

test('overlay: parseOverlayLines — 位置/字号/颜色/加粗/无描边后缀段', () => {
  const labels = parseOverlayLines([
    '自治系统 AS65000|20,15|@40|#ffcc00|b',
    'eBGP|left|top|n',
    'iBGP|50%,80%|@24|white',
  ].join('\n'));
  assert.equal(labels.length, 3);
  assert.deepEqual(labels[0], { text: '自治系统 AS65000', x: '20', y: '15', size: 40, color: '#ffcc00', weight: 'bold' });
  assert.deepEqual(labels[1], { text: 'eBGP', x: 'left', y: 'top', stroke: false });
  assert.deepEqual(labels[2], { text: 'iBGP', x: '50%', y: '80%', size: 24, color: 'white' });
});

test('overlay: parseOverlayLines — 注释/空行/非法段忽略；单个数值段视为 x 像素', () => {
  const labels = parseOverlayLines('# 注释\n\n标题|120\n\n   \n# 忽略\n');
  assert.equal(labels.length, 1);
  assert.deepEqual(labels[0], { text: '标题', x: '120' });
});

test('overlay: normalizeOverlayLabel — 裁剪尺寸范围/剔空/保留缺省', () => {
  const clipped = normalizeOverlayLabel({ text: 'x', size: 9999 });
  assert.equal(clipped?.size, 300);
  const tiny = normalizeOverlayLabel({ text: 'y', size: 1 });
  assert.equal(tiny?.size, 10);
  const empty = normalizeOverlayLabel({ text: '   ' });
  assert.equal(empty, undefined);
  const anon = normalizeOverlayLabel({ text: '默认' } as OverlayLabel);
  assert.deepEqual(anon, { text: '默认' });
  const full = normalizeOverlayLabel({ text: 'Z', x: '10%', y: 'bottom', size: 40, color: '#fff', weight: 'bold', stroke: false } as OverlayLabel);
  assert.deepEqual(full, { text: 'Z', x: '10%', y: 'bottom', size: 40, color: '#fff', weight: 'bold', stroke: false });
});

test('overlay: normalizeOverlayLabels — 过滤无效项', () => {
  const out = normalizeOverlayLabels([{ text: '甲' }, { text: '  ' }, null as never, { text: '乙', size: 2 }]);
  assert.equal(out.length, 2);
  assert.equal(out[0].text, '甲');
  assert.equal(out[1].size, 10);
});

test('overlay: buildOverlayScript — 关键逻辑都在（字体族/描边/位置/IMG_DIMS）', () => {
  const s = buildOverlayScript();
  assert.ok(s.includes('/System/Library/Fonts/PingFang.ttc'), 'PingFang 字体族');
  assert.ok(s.includes('Arial Bold'), '粗体字体族');
  assert.ok(s.includes('stroke_width'), '描边存在');
  assert.ok(s.includes("'right'"), '位置锚点 right');
  assert.ok(s.includes("'bottom'"), '位置锚点 bottom');
  assert.ok(s.includes('%'), '百分比位置支持');
  assert.ok(s.includes('IMG_DIMS:%dx%d'), '宽高上报');
  assert.ok(s.includes('json.loads'), '标签经 JSON argv 传入');
});

test('overlay: buildOverlayCommand — spawn 参数：python3 -c script base out labelsJson', () => {
  const labels: OverlayLabel[] = [{ text: 'BGP 域间路由', x: '20', y: '15', size: 40 }];
  const cmd = buildOverlayCommand('python3', '/base/a.png', '/out/b.png', labels);
  assert.equal(cmd.bin, 'python3');
  assert.equal(cmd.args[0], '-c');
  assert.ok(cmd.args[1].includes('from PIL import'), 'script 含 PIL 逻辑');
  assert.equal(cmd.args[2], '/base/a.png');
  assert.equal(cmd.args[3], '/out/b.png');
  const parsed = JSON.parse(cmd.args[4]) as OverlayLabel[];
  assert.deepEqual(parsed, labels, 'labels JSON 可往返');
});

test('overlay: parseOverlayDims — stdout 宽高解析/容错', () => {
  assert.deepEqual(parseOverlayDims('IMG_DIMS:2048x1152\n'), { width: 2048, height: 1152 });
  assert.deepEqual(parseOverlayDims('pre\nIMG_DIMS:1024X768\npost'), { width: 1024, height: 768 });
  assert.equal(parseOverlayDims(''), null);
  assert.equal(parseOverlayDims('nothing here'), null);
  assert.equal(parseOverlayDims('IMG_DIMS:0x0'), null);
});
