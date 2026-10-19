// plugin-triz-ui.test.ts — @basil/dsh-research/triz-ui host 插件自测。
//
// 验证三层：
//   (1) isTrizArtifact / toTrizNoteView —— TRIZ note 判定与 40 原理明细回填/假说拆分
//   (2) collectTrizNotes —— 只收最近 N 条（降序）、剔除非 TRIZ / archived
//   (3) apply —— connection.fetch.register 挂出 /api/research.triz.notes GET route，
//       且 route.fetch 返回 { notes } JSON（enrich 后数据供右侧栏面板渲染）
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection';
import { apply, collectTrizNotes, isTrizArtifact, isTrizNoteForSession, sessionIdFromRequest, toTrizNoteView, TRIZ_NOTES_PATH } from './plugin-triz-ui.ts';
import { ArtifactStore, type Artifact } from './core/artifact-store.ts';
import { TRIZ_PRINCIPLES } from './triz/data.ts';

interface FakeResearchCore {
  artifacts: ArtifactStore;
}

interface FakeCtx {
  provided: Map<string, unknown>;
  get(name: string): unknown;
  logger(_n: string): { info(...a: unknown[]): void; warn(...a: unknown[]): void };
  connection: {
    fetch: {
      register(route: ConnectionFetchRoute): () => Promise<void>;
      lastRoute?: ConnectionFetchRoute;
    };
  };
}

/** 造一个带 artifacts + connection 的假 ctx（与 plugin.test.ts 的 makeCtx 同风格）。 */
function makeCtx(seed: (artifacts: ArtifactStore) => void): { ctx: FakeCtx; artifacts: ArtifactStore } {
  const artifacts = new ArtifactStore();
  seed(artifacts);
  const fetchFace = {
    register(route: ConnectionFetchRoute): () => Promise<void> {
      fetchFace.lastRoute = route;
      return () => Promise.resolve();
    },
    lastRoute: undefined as ConnectionFetchRoute | undefined,
  };
  const provided = new Map<string, unknown>();
  const ctx = {
    provided,
    get: (n: string) => provided.get(n),
    logger: (_n: string) => ({ info: () => {}, warn: () => {} }),
    connection: { fetch: fetchFace },
  };
  provided.set('researchCore', { artifacts });
  return { ctx: ctx as unknown as FakeCtx, artifacts };
}

/** 一条典型的 research_triz 工具写入的 note。 */
function trizNote(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'art-triz-1',
    kind: 'note',
    title: 'triz: ROV 提升劫持检测率但收敛更慢',
    body: '[原理1 Segmentation] 分前缀粒度局部化验证\n[原理10 Preliminary action] 预计算验证结果',
    createdAt: '2026-10-14T00:00:00.000Z',
    meta: { source: 'curated-matrix', candidates: [1, 10] },
    archived: false,
    ...overrides,
  };
}

test('isTrizArtifact：只认 research_triz 写入的 note（kind=note + triz 三态 + title 前缀）', () => {
  assert.equal(isTrizArtifact(trizNote()), true);
  assert.equal(isTrizArtifact(trizNote({ kind: 'result' })), false);
  assert.equal(isTrizArtifact(trizNote({ archived: true })), false);
  assert.equal(isTrizArtifact(trizNote({ title: 'verify: something' })), false);
  assert.equal(isTrizArtifact(trizNote({ meta: { source: 'other', candidates: [1] } })), false);
});

test('toTrizNoteView：回填 40 原理明细（no/name/summary/routingHint）并拆出逐行假说', () => {
  const note = trizNote();
  const view = toTrizNoteView(note);
  assert.equal(view.artifactId, note.id);
  assert.equal(view.problem, 'ROV 提升劫持检测率但收敛更慢');
  assert.equal(view.source, 'curated-matrix');
  assert.equal(view.contradictionOrigin, 'default', '旧 note 无 contradictionOrigin → 回落 default');
  assert.deepEqual(view.hypotheses, [
    '[原理1 Segmentation] 分前缀粒度局部化验证',
    '[原理10 Preliminary action] 预计算验证结果',
  ]);
  assert.equal(view.candidates.length, 2);
  const p1 = view.candidates[0];
  const src1 = TRIZ_PRINCIPLES.find((p) => p.no === 1)!;
  assert.deepEqual(p1, { no: 1, name: src1.name, summary: src1.summary, routingHint: src1.routingHint });
  // 新 note 带 contradictionOrigin → 透传给 client
  const withOrigin = trizNote({ meta: { source: 'curated-matrix', candidates: [13], contradictionOrigin: 'extracted' } });
  assert.equal(toTrizNoteView(withOrigin).contradictionOrigin, 'extracted');
});

test('collectTrizNotes：降序取最近 N 条、剔除非 TRIZ 与 archived', () => {
  const artifacts = new ArtifactStore();
  // createdAt 显式 seed：put 支持可选 createdAt（缺省=now），避免同毫秒时间戳碰撞导致的
  // sort 序不稳定（collectTrizNotes 按 createdAt 降序）。
  artifacts.put({ kind: 'note', title: 'triz: older', body: 'h', meta: { source: 'unresolved', candidates: [] }, createdAt: '2026-10-14T00:00:00.000Z' });
  const mid = artifacts.put({ kind: 'note', title: 'triz: mid', body: 'h2', meta: { source: 'heuristic-fallback', candidates: [4] }, createdAt: '2026-10-14T00:00:01.000Z' });
  artifacts.put({ kind: 'note', title: 'triz: newest', body: 'h3', meta: { source: 'curated-matrix', candidates: [1, 2, 3] }, createdAt: '2026-10-14T00:00:02.000Z' });
  artifacts.put({ kind: 'note', title: 'verify: not triz', body: 'x', meta: {} });
  artifacts.put({ kind: 'result', title: 'triz: not a note', body: 'x', meta: { source: 'curated-matrix', candidates: [] } });
  artifacts.archive(mid.id);
  const artifacts2 = artifacts;
  const ctx = { get: () => ({ artifacts: artifacts2 }) } as unknown as FakeCtx;
  const views = collectTrizNotes(ctx);
  assert.equal(views.length, 2, '只应有 newest + older（mid 被 archive、verify/result 被剔除）');
  assert.equal(views[0].problem, 'newest', '应按 createdAt 降序，newest 在前');
  assert.equal(views[1].problem, 'older');
});

test('collectTrizNotes：researchCore 缺失时安全返回空数组', () => {
  const ctx = { get: () => undefined } as unknown as FakeCtx;
  assert.deepEqual(collectTrizNotes(ctx), []);
});

test('apply：在 connection 鉴权栅栏挂 /api/research.triz.notes GET route，fetch 返回 { notes }', async () => {
  const { ctx } = makeCtx((storage) => {
    storage.put({ kind: 'note', title: 'triz: ROV 提升劫持检测率', body: '[原理13 Inversion] 验证推给宣告方', meta: { source: 'curated-matrix', candidates: [13] } });
  });
  const disposer = apply(ctx as never);
  assert.equal(typeof disposer, 'function', 'apply 应返回 route disposer');
  const route = ctx.connection.fetch.lastRoute!;
  assert.equal(route.path, TRIZ_NOTES_PATH);
  assert.deepEqual([...route.methods], ['GET']);
  assert.equal(route.requestBody, 'buffered');
  const response = await route.fetch(new Request(`http://localhost${route.path}`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const payload = (await response.json()) as { notes: Array<Record<string, unknown>> };
  assert.equal(payload.notes.length, 1);
  assert.equal(payload.notes[0].problem, 'ROV 提升劫持检测率');
  assert.equal((payload.notes[0].candidates as Array<Record<string, unknown>>)[0].no, 13);
  assert.equal(payload.notes[0].contradictionOrigin, 'default', 'route 负载携带矛盾来源（旧 note 回落 default）');
});

test('isTrizNoteForSession：auto note 按会话过滤；无 sessionId 的兼容 note 全会话可见', () => {
  const autoA = trizNote({ meta: { source: 'curated-matrix', candidates: [1], sessionId: 'sess-a' } });
  const autoB = trizNote({ id: 'art-2', meta: { source: 'curated-matrix', candidates: [2], sessionId: 'sess-b' } });
  const manual = trizNote({ id: 'art-3', meta: { source: 'unresolved', candidates: [] } });
  assert.equal(isTrizNoteForSession(autoA, 'sess-a'), true);
  assert.equal(isTrizNoteForSession(autoB, 'sess-a'), false, '他会话 auto note 过滤');
  assert.equal(isTrizNoteForSession(manual, 'sess-a'), true, '手动 note 无 sessionId → 兼容可见');
  assert.equal(isTrizNoteForSession(autoA, undefined), true, '无会话参数 → 不过滤');
});

test('collectTrizNotes：按 sessionId 过滤（只显示该会话 + 无 sessionId 兼容 note）', () => {
  const artifacts = new ArtifactStore();
  artifacts.put({ kind: 'note', title: 'triz: sess-a 的结论', body: 'h', meta: { source: 'curated-matrix', candidates: [1], sessionId: 'sess-a' }, createdAt: '2026-10-19T00:00:01.000Z' });
  artifacts.put({ kind: 'note', title: 'triz: sess-b 的结论', body: 'h2', meta: { source: 'heuristic-fallback', candidates: [4], sessionId: 'sess-b' }, createdAt: '2026-10-19T00:00:02.000Z' });
  artifacts.put({ kind: 'note', title: 'triz: 手动调用（无会话）', body: 'h3', meta: { source: 'unresolved', candidates: [] }, createdAt: '2026-10-19T00:00:03.000Z' });
  const ctx = { get: () => ({ artifacts }) } as unknown as FakeCtx;
  const views = collectTrizNotes(ctx, 'sess-a');
  assert.equal(views.length, 2, 'sess-a 只看到自己的 + 无 sessionId 的兼容 note');
  assert.deepEqual(new Set(views.map((v) => v.problem)), new Set(['sess-a 的结论', '手动调用（无会话）']));
  const onlyB = collectTrizNotes(ctx, 'sess-b');
  assert.deepEqual(new Set(onlyB.map((v) => v.problem)), new Set(['sess-b 的结论', '手动调用（无会话）']));
  const all = collectTrizNotes(ctx);
  assert.equal(all.length, 3, '无会话参数 → 全部可见（兼容旧行为）');
});

test('toTrizNoteView：透传生成步序 step/final（中间生成结果逐段映射的展示维度）', () => {
  const intermediate = trizNote({ meta: { source: 'curated-matrix', candidates: [2], sessionId: 'sess-a', step: 2, final: false } });
  const view = toTrizNoteView(intermediate);
  assert.equal(view.step, 2);
  assert.equal(view.final, false);
  const finalNote = trizNote({ meta: { source: 'curated-matrix', candidates: [3], sessionId: 'sess-a', step: 3, final: true } });
  const fin = toTrizNoteView(finalNote);
  assert.equal(fin.step, 3);
  assert.equal(fin.final, true);
  const manual = trizNote({ meta: { source: 'curated-matrix', candidates: [1] } });
  assert.equal(toTrizNoteView(manual).step, undefined, '手动 note 无 step');
  assert.equal(toTrizNoteView(manual).final, undefined);
});

test('sessionIdFromRequest：解析 ?sessionId=；缺省 / 非法 URL → undefined', () => {
  assert.equal(sessionIdFromRequest(new Request('http://localhost/api/research.triz.notes?sessionId=sess-1')), 'sess-1');
  assert.equal(sessionIdFromRequest(new Request('http://localhost/api/research.triz.notes')), undefined);
  assert.equal(sessionIdFromRequest(new Request('http://localhost/api/research.triz.notes?sessionId=')), undefined);
});
