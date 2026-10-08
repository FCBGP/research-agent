// 运行时插件自测：用内存假 ctx 驱动 apply()，验证
//   (1) researchCore 服务挂载（claim → verify → artifact 闭环）
//   (2) research_verify / research_record 工具注册
//   (3) 返回的 disposer 能正确卸载工具
// 本测试不依赖 dsh 运行时，Node 24 直接跑：node --test src/plugin.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apply, name } from './plugin.ts';
import type { ResearchCoreService } from './plugin.ts';
import { ArtifactStore } from './core/artifact-store.ts';

interface FakeCtx {
  provided: Map<string, unknown>;
  tools: { registered: unknown[]; unregistered: unknown[]; register(def: unknown): () => void };
  logs: string[];
  logger(_n: string): { info(...a: unknown[]): void; warn(...a: unknown[]): void };
}

function makeCtx(): FakeCtx {
  const ctx = {
    provided: new Map<string, unknown>(),
    registeredTools: [] as unknown[],
    unregisteredTools: [] as unknown[],
    logs: [] as string[],
  };
  (ctx as unknown as { provide(name: string, value: unknown): () => void }).provide = (n, v) => {
    ctx.provided.set(n, v);
    return () => ctx.provided.delete(n);
  };
  (ctx as unknown as { tools: unknown }).tools = {
    register: (def: unknown) => {
      ctx.registeredTools.push(def);
      return () => {
        const i = ctx.registeredTools.indexOf(def);
        if (i >= 0) ctx.registeredTools.splice(i, 1);
        ctx.unregisteredTools.push(def);
      };
    },
  };
  (ctx as unknown as { logger: unknown }).logger = (_n: string) => ({
    info: (...a: unknown[]) => ctx.logs.push(`INFO ${a.join(' ')}`),
    warn: (...a: unknown[]) => ctx.logs.push(`WARN ${a.join(' ')}`),
  });
  return ctx as unknown as FakeCtx;
}

test('plugin: 挂载 researchCore 并跑通 BGP claim→verify→artifact', () => {
  const ctx = makeCtx();
  const dispose = apply(ctx as never);
  assert.equal(name, 'dsh-research');

  // service 已提供
  const core = ctx.provided.get('researchCore') as ResearchCoreService;
  assert.ok(core, 'researchCore should be provided');
  assert.ok(core.artifacts instanceof ArtifactStore);

  // BGP 冒烟：claim → 证据 → 验证 → 归档
  let claim = core.claims.create({
    statement: '劫持者无法通过只伪造 AS_PATH 被邻域视为合法源，除非同时具备传播路径',
    type: 'Hypothesis',
    source: 'BGP-RPKI 文献',
  });
  claim = core.claims.addEvidence(claim, { source: 'RFC 8481', evidence: 'ROA 限定合法来源 AS', confidence: 0.9 });
  claim = core.claims.addCounter(claim, { source: '白皮书', evidence: '部分部署场景 PDB 覆盖不全', confidence: 0.3 });
  const report = core.verify.claim(claim, { experiment: 'sim', claim: claim.id, outcome: 'support', data: {}, archivedAt: new Date().toISOString() });
  assert.equal(report.verdict, 'verified', JSON.stringify(report));
  assert.ok(report.checks.some((c) => c.startsWith('evidence:')));
  assert.ok(report.checks.some((c) => c.startsWith('counter:')));
  assert.ok(report.checks.some((c) => c.startsWith('experiment:')));

  // 归档可追溯
  const art = core.artifacts.put({ kind: 'result', title: 'BGP 冒烟', body: report.rationale, claimId: claim.id, meta: {} });
  assert.equal(core.artifacts.trace(claim.id).length, 1);
  assert.equal(core.artifacts.get(art.id)?.kind, 'result');

  // 工具已注册
  const toolNames = ctx.registeredTools.map((t: { name: string }) => t.name);
  assert.deepEqual(toolNames.sort(), ['research_record', 'research_verify']);

  // dispose 后工具卸载
  dispose();
  assert.equal(ctx.registeredTools.length, 0);
  assert.equal(ctx.unregisteredTools.length, 2);
});
