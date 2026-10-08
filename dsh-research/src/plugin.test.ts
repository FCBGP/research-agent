// 运行时插件自测：用内存假 ctx 驱动 apply()，验证
//   (1) researchCore / researchMemory / researchAgents / researchDirector 服务挂载
//   (2) research_verify / research_record / research_search / research_review / research_experiment 工具注册
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

const TOOL_NAMES = ['research_verify', 'research_record', 'research_search', 'research_review', 'research_experiment'];

test('plugin: 挂载 researchCore 并跑通 BGP claim→verify→artifact', () => {
  const ctx = makeCtx();
  const dispose = apply(ctx as never);
  assert.equal(name, 'dsh-research');

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

  const art = core.artifacts.put({ kind: 'result', title: 'BGP 冒烟', body: report.rationale, claimId: claim.id, meta: {} });
  assert.equal(core.artifacts.trace(claim.id).length, 1);
  assert.equal(core.artifacts.get(art.id)?.kind, 'result');

  // 工具已注册（阶段 2 共 5 个）
  const toolNames = ctx.registeredTools.map((t: { name: string }) => t.name);
  assert.deepEqual(toolNames.sort(), [...TOOL_NAMES].sort());

  // dispose 后工具卸载
  dispose();
  assert.equal(ctx.registeredTools.length, 0);
  assert.equal(ctx.unregisteredTools.length, 5);
});

test('plugin: 阶段 2 服务挂载（memory + agents + director）', () => {
  const ctx = makeCtx();
  const dispose = apply(ctx as never);

  const runtime = ctx.provided.get('researchDirector') as DirectorLike | undefined;
  assert.ok(ctx.provided.has('researchMemory'), 'researchMemory provided');
  assert.ok(ctx.provided.has('researchAgents'), 'researchAgents provided');
  assert.ok(runtime, 'researchDirector provided');

  // director 能跑 BGP DAG 冒烟
  const goal = {
    id: 'g1',
    hypothesis: 'ROV 提升劫持检测',
    tasks: [
      { id: 't-read', goal: 'g1', title: 'RPKI 文献', kind: 'read', produceClaims: ['c-1'], consumesClaims: [], gain: 0.6, status: 'ready' as const },
      { id: 't-verify', goal: 'g1', title: '验证', kind: 'verify', produceClaims: [], consumesClaims: ['c-1'], gain: 0.3, status: 'blocked' as const },
    ],
    claims: [], experiments: [], results: [], verification: [], counterexamples: [], status: 'active' as const,
  };
  const rep = runtime!.run(goal, {});
  assert.equal(rep.iterations, 2, '两个任务都执行');
  apiChecks(ctx);
  dispose();
});

interface DirectorLike {
  run(goal: { id: string; hypothesis: string; tasks: Array<{ id: string; status: string }> }, opts: Record<string, never>): { iterations: number };
}

function apiChecks(ctx: FakeCtx): void {
  const mem = ctx.provided.get('researchMemory') as ResearchMemoryLike;
  const agents = ctx.provided.get('researchAgents') as ResearchAgentsLike;
  assert.ok(mem?.semantic && mem?.episodic && mem?.artifact && mem?.hypothesis && mem?.evidence, '五类记忆齐全');
  assert.ok(agents?.literature && agents?.reviewer && agents?.experiment, '三个角色 agent 齐全');
  const hits = agents.literature.search('RPKI origin validation', 2);
  assert.ok(hits.length > 0, '本地语料可检索');
  assert.equal(mem.episodic.recent(1)[0].summary.startsWith('检索'), true, '检索已记入情景记忆');
}

interface ResearchMemoryLike { semantic: unknown; episodic: { recent(n: number): Array<{ summary: string }> }; artifact: unknown; hypothesis: unknown; evidence: unknown }
interface ResearchAgentsLike { literature: { search(q: string, k?: number): Array<unknown> }; reviewer: unknown; experiment: unknown }
