// src/draw/local.test.ts — local provider（mflux CLI）命令组装 + 进度解析自测。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLocalArgs, defaultLocalConfig, parseMfluxProgress } from './local.ts';

test('draw/local: txt2img 全参数断言（model/prompt/steps/seed/width/height/output）', () => {
  const cfg = { ...defaultLocalConfig(), model: '~/llm/models/Qwen-Image-2.1' };
  const args = buildLocalArgs(cfg, {
    prompt: '科研绘图：BGP 路由',
    mode: 'txt2img',
    quality: 'high',
    steps: 50,
    seed: 42,
    width: 2048,
    height: 1152,
    outputPath: '/out/images/image-20261021100507.png',
  });
  assert.equal(args[0], '--model');
  assert.match(args[1], /(^|\/)llm\/models\/Qwen-Image-2\.1$/, 'model ~ 展开到 HOME 且以 models/Qwen-Image-2.1 结尾');
  assert.deepEqual(args, [
    '--model', args[1],
    '--prompt', '科研绘图：BGP 路由',
    '--steps', '50',
    '--seed', '42',
    '--width', '2048',
    '--height', '1152',
    '--output', '/out/images/image-20261021100507.png',
  ]);
});

test('draw/local: 画质档决定默认 steps（不显式提供 steps）', () => {
  const args = buildLocalArgs(defaultLocalConfig(), {
    prompt: 'p', mode: 'txt2img', quality: 'low',
    width: 512, height: 512, outputPath: '/o.png',
  });
  const stepsIdx = args.indexOf('--steps');
  assert.equal(Number(args[stepsIdx + 1]), 20, 'low → 20 步');
});

test('draw/local: edit（垫图）追加 --image-path 与 --image-strength（content 0.7）', () => {
  const args = buildLocalArgs(defaultLocalConfig(), {
    prompt: '按图改稿', mode: 'edit', quality: 'high',
    width: 1024, height: 1024, outputPath: '/o.png',
    imagePath: '/tmp/ref.png', imageStrength: 0.7,
  });
  assert.ok(args.includes('--image-path'), '含 --image-path');
  assert.equal(args[args.indexOf('--image-path') + 1], '/tmp/ref.png');
  assert.ok(args.includes('--image-strength'), '含 --image-strength');
  assert.equal(args[args.indexOf('--image-strength') + 1], '0.7');
  // 强度 clamp [0.3, 1]
  const clamped = buildLocalArgs(defaultLocalConfig(), {
    prompt: 'p', mode: 'edit', quality: 'high', width: 512, height: 512,
    outputPath: '/o.png', imagePath: '/r.png', imageStrength: 2,
  });
  assert.equal(clamped[clamped.indexOf('--image-strength') + 1], '1');
});

test('draw/local: 可选负向 / guidance / quantize（提供才出现）', () => {
  const args = buildLocalArgs(defaultLocalConfig(), {
    prompt: 'p', mode: 'txt2img', quality: 'medium',
    width: 1024, height: 1024, outputPath: '/o.png',
    negativePrompt: '模糊 文字', guidance: 4.5, quantize: 8,
  });
  assert.ok(args.includes('--negative-prompt'));
  assert.equal(args[args.indexOf('--negative-prompt') + 1], '模糊 文字');
  assert.ok(args.includes('--guidance'));
  assert.equal(args[args.indexOf('--guidance') + 1], '4.5');
  assert.ok(args.includes('--quantize'));
  assert.equal(args[args.indexOf('--quantize') + 1], '8');
  // 未提供 → 不出现
  const plain = buildLocalArgs(defaultLocalConfig(), {
    prompt: 'p', mode: 'txt2img', quality: 'high', width: 512, height: 512, outputPath: '/o.png',
  });
  assert.ok(!plain.includes('--negative-prompt'));
  assert.ok(!plain.includes('--guidance'));
  assert.ok(!plain.includes('--quantize'));
});

test('draw/local: parseMfluxProgress 从 tqdm / Step 行解析 0..1', () => {
  assert.equal(parseMfluxProgress(' 50%|███ | 25/50 [01:20<01:20]'), 0.5);
  assert.equal(parseMfluxProgress('Step: 30/50'), 0.6);
  assert.equal(parseMfluxProgress('no progress here'), null);
  assert.equal(parseMfluxProgress('x/0 invalid'), null, '分母 0 无效');
  assert.equal(parseMfluxProgress('x/1000 huge'), null, '分母超上限无效');
  assert.equal(parseMfluxProgress('1/2000'), null, '分母 2000 > 120 无效');
  assert.equal(parseMfluxProgress('Step: 60/50'), null, '分子 > 分母 无效');
});
