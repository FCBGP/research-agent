// 策略层自测：10 条纪律齐备、可增删、prompt 渲染开关正确。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RESEARCH_POLICY, PolicyService } from './index.ts';

test('policy: 默认 10 条全量，prompt 含全部纪律', () => {
  const svc = new PolicyService();
  assert.equal(RESEARCH_POLICY.length, 10);
  assert.equal(svc.rules().length, 10);
  const p = svc.buildPrompt();
  assert.ok(p.startsWith('# Research Agent Policy'));
  assert.ok(p.includes('p01'.length ? '- ' : ''));
  for (const r of RESEARCH_POLICY) assert.ok(p.includes(r.text), `缺 ${r.id}`);
});

test('policy: enabled=false 时 prompt 为空但仍可读规则', () => {
  const svc = new PolicyService({ enabled: false });
  assert.equal(svc.enabled, false);
  assert.equal(svc.buildPrompt(), '');
  assert.equal(svc.rules().length, 10);
});

test('policy: omit/extra 可增删纪律', () => {
  const svc = new PolicyService({ omit: ['p07'], extra: ['任何数值结果须给 n 与均值±CI。'] });
  const rules = svc.rules();
  assert.equal(rules.length, 10);
  assert.ok(!rules.some((r) => r.id === 'p07'));
  assert.ok(rules.some((r) => r.id === 'extra-1'));
  assert.ok(svc.buildPrompt().includes('任何数值结果须给 n 与均值±CI。'));
});
