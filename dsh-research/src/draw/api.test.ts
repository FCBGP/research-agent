// src/draw/api.test.ts — api provider（OpenAI 兼容 images API）请求组装 + 响应解析自测。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  base64ToBuffer, buildApiPayload, buildApiRequest, expandEnvVar, imagesGenerationsUrl,
  qualityApproxSteps, resolveApiResponseData, resolveImageBuffer,
} from './api.ts';

const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]).toString('base64');

test('draw/api: buildApiRequest —— URL / Bearer / 请求体（model, n, size, quality, b64_json, seed）', () => {
  const spec = buildApiRequest(
    { baseURL: 'https://api.example.com/v1', apiKey: 'sk-test', modelId: 'qwen-image-2.1' },
    { prompt: 'BGP 架构图', quality: 'high', size: '2048x1152', seed: 7, negativePrompt: '文字' },
  );
  assert.equal(spec.url, 'https://api.example.com/v1/images/generations');
  assert.equal(spec.headers['Authorization'], 'Bearer sk-test');
  assert.equal(spec.headers['Content-Type'], 'application/json');
  const body = spec.body as Record<string, unknown>;
  assert.equal(body.model, 'qwen-image-2.1');
  assert.equal(body.prompt, 'BGP 架构图');
  assert.equal(body.n, 1);
  assert.equal(body.size, '2048x1152');
  assert.equal(body.quality, 'high');
  assert.equal(body.response_format, 'b64_json');
  assert.equal(body.seed, 7);
  assert.equal(body.negative_prompt, '文字');
});

test('draw/api: buildApiRequest —— 已 /images/generations 结尾不再追加；空 key 无 Authorization', () => {
  const spec = buildApiRequest(
    { baseURL: 'https://x.com/images/generations', apiKey: '', modelId: 'm' },
    { prompt: 'p', quality: 'low', size: '1024x1024' },
  );
  assert.equal(spec.url, 'https://x.com/images/generations');
  assert.equal(spec.headers['Authorization'], undefined, '空 apiKey 不挂 Bearer');
  const body = spec.body as Record<string, unknown>;
  assert.equal(body.quality, 'low');
  assert.equal(body.seed, undefined, '未提供 seed 不出现');
});

test('draw/api: imagesGenerationsUrl 去尾斜杠 + 追加端点', () => {
  assert.equal(imagesGenerationsUrl('http://h/v1/'), 'http://h/v1/images/generations');
  assert.equal(imagesGenerationsUrl('http://h/v1/images/generations'), 'http://h/v1/images/generations');
});

test('draw/api: expandEnvVar 展开 ${VAR}，未定义保持原样', () => {
  const env = { MY_KEY: 'sekret' };
  assert.equal(expandEnvVar('${MY_KEY}', env), 'sekret');
  assert.equal(expandEnvVar('sk-${MY_KEY}', env), 'sk-sekret');
  assert.equal(expandEnvVar('${NOPE}', env), '${NOPE}', '未定义保持原样');
  assert.equal(expandEnvVar('plain', env), 'plain');
});

test('draw/api: resolveApiResponseData —— b64_json 与 url 双收；无 data 返回 null', () => {
  const byB64 = resolveApiResponseData({ data: [{ b64_json: PNG_B64 }] });
  assert.deepEqual(byB64, { kind: 'b64', data: PNG_B64, format: undefined });
  const byUrl = resolveApiResponseData({ data: [{ url: 'https://cdn/x.png' }] });
  assert.deepEqual(byUrl, { kind: 'url', url: 'https://cdn/x.png' });
  assert.equal(resolveApiResponseData({ data: [] }), null);
  assert.equal(resolveApiResponseData({}), null);
  assert.equal(resolveApiResponseData(null), null);
  assert.equal(resolveApiResponseData('x'), null);
});

test('draw/api: base64ToBuffer / resolveImageBuffer —— data:URI 前缀剥离 + 扩展名推断', () => {
  const buf = base64ToBuffer(`data:image/png;base64,${PNG_B64}`);
  assert.deepEqual([...buf], [...Buffer.from(PNG_B64, 'base64')], 'data: 前缀剥离');
  const png = resolveImageBuffer({ data: [{ b64_json: PNG_B64 }] });
  assert.ok(png && png.ext === 'png' && png.contentType === 'image/png', '默认 png');
  const jpg = resolveImageBuffer({ data: [{ b64_json: PNG_B64, format: 'jpeg' }] });
  assert.ok(jpg && jpg.ext === 'jpg' && jpg.contentType === 'image/jpeg', 'format=jpeg → jpg');
  assert.equal(resolveImageBuffer({ data: [{ url: 'https://x/y.png' }] }), null, 'url 模式不在此解析 buffer');
});

test('draw/api: qualityApproxSteps 与画质档一致（低20/中30/高50）', () => {
  assert.equal(qualityApproxSteps('low'), 20);
  assert.equal(qualityApproxSteps('medium'), 30);
  assert.equal(qualityApproxSteps('high'), 50);
});

test('draw/api: buildApiPayload 不含负向时不带 negative_prompt', () => {
  const payload = buildApiPayload({ prompt: 'p', quality: 'medium', size: '1024x1024' }, 'm');
  assert.equal(payload.negative_prompt, undefined);
});
