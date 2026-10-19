// Research Memory 五类 + 门面持久化的自检（纯内存/临时目录，不依赖 dsh）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemory, persistMemory, loadMemoryInto } from './index.ts';
import { ArtifactStore } from '../core/artifact-store.ts';

test('semantic: 关键词召回按相关度排序', () => {
  const m = createMemory();
  m.semantic.put({ subject: 'RPKI', predicate: 'validates', object: 'origin AS', sourceClaims: ['c-1'], confidence: 0.95, verified: true });
  m.semantic.put({ subject: 'BGPsec', predicate: 'signs', object: 'AS_PATH', sourceClaims: ['c-2'], confidence: 0.9, verified: true });
  const hits = m.semantic.query('origin validation');
  assert.ok(hits.some((f) => f.subject === 'RPKI'), 'should recall RPKI fact');
  assert.equal(hits.length >= 1, true);
});

test('episodic: 按 claim 追溯与最近 N 条', () => {
  const m = createMemory();
  m.episodic.record({ kind: 'search', summary: '检索 RPKI 文献', claimId: 'c-1' });
  m.episodic.record({ kind: 'experiment', summary: 'FRR 注入实验', claimId: 'c-1' });
  m.episodic.record({ kind: 'note', summary: '随手笔记' });
  assert.equal(m.episodic.forClaim('c-1').length, 2);
  assert.equal(m.episodic.recent(1)[0].summary, '随手笔记');
});

test('hypothesis: 生命周期 proposed→active→supported', () => {
  const m = createMemory();
  const h = m.hypothesis.propose('ROA 无法验证 AS_PATH 行为', 'c-1');
  m.hypothesis.activate(h.id);
  m.hypothesis.recordVerdict(h.id, 'verified', { confidence: 0.92 });
  const after = m.hypothesis.byClaim('c-1')[0];
  assert.equal(after.status, 'supported');
  assert.equal(after.history.length, 1);
  assert.ok(m.hypothesis.active().length >= 0);
});

test('evidence: 台账 + 未核验召回', () => {
  const m = createMemory();
  m.evidence.add('c-1', { source: 'RFC 8481', evidence: 'ROA 限定来源 AS', confidence: 0.9, verified: true });
  m.evidence.add('c-1', { source: 'survey', evidence: '部署覆盖率待核', confidence: 0.5, verified: false });
  assert.equal(m.evidence.forClaim('c-1').length, 2);
  assert.equal(m.evidence.unverified().length, 1);
});

test('artifact: 检索式回忆', () => {
  const m = createMemory();
  m.artifact.put({ kind: 'report', title: 'RPKI 部署报告', body: 'detection_rate=0.97', claimId: 'c-1', meta: {} });
  assert.equal(m.artifact.recall('detection_rate').length, 1);
  assert.equal(m.artifact.byKind('report').length, 1);
  assert.equal(m.artifact.forClaim('c-1').length, 1);
});

test('facade: persist → load 往返一致', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-research-mem-'));
  const m1 = createMemory();
  m1.semantic.put({ subject: 'RPKI', predicate: 'validates', object: 'origin', sourceClaims: ['c-1'], confidence: 1, verified: true });
  m1.episodic.record({ kind: 'search', summary: '检索' });
  m1.evidence.add('c-1', { source: 'RFC', evidence: 'x', confidence: 0.8, verified: true });
  const h = m1.hypothesis.propose('H', 'c-1');
  m1.hypothesis.recordVerdict(h.id, 'verified', { confidence: 0.9 });
  m1.artifact.put({ kind: 'result', title: 'T', body: 'b', claimId: 'c-1', meta: {} });

  const file = persistMemory(m1, dir);
  assert.ok(file.endsWith('research-memory.json'));

  const m2 = createMemory();
  loadMemoryInto(m2, dir);
  assert.equal(m2.semantic.all().length, 1);
  assert.equal(m2.episodic.all().length, 1);
  assert.equal(m2.evidence.all().length, 1);
  assert.equal(m2.hypothesis.all().length, 1);
  assert.equal(m2.hypothesis.all()[0].status, 'supported');
  assert.equal(m2.artifact.recall().length, 1);
});

test('createMemory(store)：注入外部 ArtifactStore 时，memory.artifact 与该 store 共享（统一 TRIZ note 持久化通道）', () => {
  const shared = new ArtifactStore();
  const m = createMemory(shared);
  // memory.artifact 写入（persistMemory 序列化的唯一 artifact 源）
  m.artifact.put({ kind: 'note', title: 'triz: 会话记录', body: '[原理23 Feedback] 反馈回路', meta: { source: 'curated-matrix', auto: true, sessionId: 's1' } });
  // core.artifacts（research_triz 工具 / triz-auto 写入点）也应能看到同一记录
  assert.equal(shared.list().length, 1);
  assert.equal(shared.list()[0].title, 'triz: 会话记录');
  // 反向：经外部 store 写入 → memory.artifact 召回可见
  shared.put({ kind: 'result', title: 'R', body: 'b', meta: {} });
  assert.equal(m.artifact.recall().length, 2);
});
