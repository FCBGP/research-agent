// 角色注册表自测：五角色齐备、路由表覆盖任务 kind。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_REGISTRY, roleDef, TASK_ROLE } from './index.ts';

test('roles: 五个科研角色注册齐备且可查询', () => {
  assert.equal(ROLE_REGISTRY.length, 5);
  assert.equal(roleDef('writer').label, '写作');
  assert.equal(roleDef('nope').role, 'director', '未知角色回退 director');
});

test('roles: 任务 kind → 角色映射覆盖六种 task kind', () => {
  for (const kind of ['read', 'search', 'hypothesis', 'experiment', 'verify', 'write']) {
    assert.ok(TASK_ROLE[kind], `缺 ${kind}`);
  }
  assert.equal(TASK_ROLE['experiment'], 'experimenter');
  assert.equal(TASK_ROLE['verify'], 'reviewer');
});
