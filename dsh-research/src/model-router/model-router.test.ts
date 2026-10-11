// Model Router 自测：默认路由 + 角色覆盖解析。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ModelRouter, DEFAULT_MODEL_ROUTE } from './index.ts';

test('model-router: 默认全部走 local-interval-dsv4/dsv4flash', () => {
  const router = new ModelRouter();
  for (const role of ['director', 'literature', 'reviewer', 'experimenter', 'writer'] as const) {
    assert.deepEqual(router.route(role), DEFAULT_MODEL_ROUTE);
  }
});

test('model-router: 角色级覆盖优先于默认', () => {
  const router = new ModelRouter({ routes: { reviewer: { provider: 'deepseek-official', model: 'dsv4' } } });
  assert.deepEqual(router.route('reviewer'), { provider: 'deepseek-official', model: 'dsv4' });
  assert.deepEqual(router.route('writer'), DEFAULT_MODEL_ROUTE);
});

test('model-router: roleModels 提供每角色模型后缀', () => {
  const router = new ModelRouter({ roleModels: { experimenter: 'dsv4long' } });
  assert.equal(router.route('experimenter').model, 'dsv4long');
  assert.ok(router.describe('experimenter').includes('dsv4long'));
});

test('model-router: setRole 持久覆盖并优先于默认', () => {
  const router = new ModelRouter();
  assert.deepEqual(router.route('reviewer'), DEFAULT_MODEL_ROUTE);
  router.setRole('reviewer', { provider: 'deepseek-official', model: 'dsv4' });
  assert.deepEqual(router.route('reviewer'), { provider: 'deepseek-official', model: 'dsv4' });
  assert.ok(router.describe('reviewer').includes('deepseek-official/dsv4'));
});
