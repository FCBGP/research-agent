// BGP 冒烟：claim → experiment → verdict → artifact 的 MVP 流水线。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newClaim, addEvidence, addCounterEvidence, synthConfidence } from './claim.ts';
import { selectNext, unlock } from './dag.ts';
import { runVerification } from './verification.ts';
import { ArtifactStore } from './artifact-store.ts';
import type { ResearchTask } from './types.ts';

test('DAG: 依赖满足后按信息增益解锁下一步', () => {
  let tasks: ResearchTask[] = [
    { id: 't-read', goal: 'g1', title: '读 RPKI/ASPA 文献', kind: 'read', produceClaims: ['c-1'], consumesClaims: [], gain: 0.6, status: 'ready' },
    { id: 't-exp', goal: 'g1', title: 'FRR 模拟注入 AS_SET', kind: 'experiment', produceClaims: ['c-2'], consumesClaims: ['c-1', 'c-x'], gain: 0.8, status: 'blocked' },
    { id: 't-verify', goal: 'g1', title: '验证 claim', kind: 'verify', produceClaims: [], consumesClaims: ['c-2'], gain: 0.2, status: 'blocked' },
  ];
  // c-1 尚未产出 → t-exp 仍 blocked；唯一 ready 且满足的是 t-read
  assert.equal(selectNext(tasks)?.id, 't-read');

  tasks = unlock(tasks, [{ ...tasks[0], status: 'done' }]);
  assert.equal(tasks[1].status, 'blocked'); // 依赖 c-x 未满足
  const claimOfExp = newClaim({ statement: 'AS_SET 非拒绝路径可绕过源验证', type: 'Hypothesis', source: 'bgp-smoke' });
  tasks = unlock(tasks, [{ ...tasks[0], status: 'done' }, { ...tasks[1], id: 't-exp', produceClaims: ['c-2', 'c-x'], status: 'done' }]);
  assert.equal(tasks[2].status, 'ready'); // c-2 已产出 → t-verify 解锁
  assert.equal(selectNext(tasks)?.id, 't-verify');
  void claimOfExp;
});

test('BGP 冒烟: claim → experiment → verdict → artifact', () => {
  let c = newClaim({ statement: 'AS_SET 非拒绝路径可绕过源验证', type: 'Hypothesis', source: 'bgp-smoke' });
  c = addEvidence(c, { source: 'RFC/文献', evidence: 'RPKI 仅验证 ORIGIN，不验证 AS_PATH 中的 AS_SET', confidence: 0.85, verified: true, relatedClaims: [] });
  c = addCounterEvidence(c, { evidence: '部分部署了 ASPA', source: 'survey', againstClaim: c.id, confidence: 0.3 });

  const exp = { experiment: 'frr-as-set-injection', claim: c.id, outcome: 'support' as const, data: { carried: true }, archivedAt: new Date().toISOString() };
  const v = runVerification(c, exp);
  assert.equal(v.verdict, 'verified');
  assert.ok(v.rationale.includes('实验支持'));

  const store = new ArtifactStore();
  store.put({ kind: 'experiment', title: 'frr-as-set-injection', body: JSON.stringify(exp.data), claimId: c.id, meta: {} });
  store.put({ kind: 'result', title: 'verdict', body: v.verdict, claimId: c.id, meta: { rationale: v.rationale } });
  assert.equal(store.trace(c.id).length, 2);
  store.archive(store.trace(c.id)[0].id);
  assert.equal(store.trace(c.id).length, 1); // 归档后不再计入活跃追溯
  assert.ok(synthConfidence(c) >= 0.7);
});
