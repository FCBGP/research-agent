// 运行时插件自测（阶段 5·B 末步改写）：`src/plugin.ts` 已降级为 re-export，巨型单文件
// 插件拆为 6 个职责单一插件。本测试改为「按依赖顺序挂载 host 平面 5 插件
// (core/director/experiment/writer/operations) + preset 平面 tools 插件」的组合形态，验证：
//   (1) 12 个 research 服务（researchCore / researchMemory / researchAgents /
//       researchDirector / researchExperiment / researchWriter / researchPolicy /
//       researchAutonomous / researchJobs / researchScheduler / researchSelfImprove /
//       researchSubagents）全部挂载
//   (2) research_verify / research_record / … 13 个 research_* 工具注册（tools 插件返回
//       disposer，能全部卸载）
//   (3) 各阶段服务端到端冒烟（BGP claim→verify→artifact / director DAG / campaign /
//       writer+policy+autonomous / jobs+scheduler+selfImprove / subagents 本地回退）
// 只依赖本包源码与 node:test，Node 24 直接跑：node --test src/plugin.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apply as applyCore, name as coreName } from './plugin-core.ts';
import { apply as applyDirector, name as directorName } from './plugin-director.ts';
import { apply as applyExperiment, name as experimentName } from './plugin-experiment.ts';
import { apply as applyWriter, name as writerName } from './plugin-writer.ts';
import { apply as applyOperations, name as operationsName } from './plugin-operations.ts';
import { apply as applyTools, name as toolsName, type ResearchCoreService } from './plugin-tools.ts';
import { ArtifactStore } from './core/artifact-store.ts';

interface FakeCtx {
  provided: Map<string, unknown>;
  get(name: string): unknown;
  tools: { registered: unknown[]; unregistered: unknown[]; register(def: unknown): () => void };
  logs: string[];
  logger(_n: string): { info(...a: unknown[]): void; warn(...a: unknown[]): void };
}

/** 假 ctx 同时支持 provide（host 插件写服务）与 get（下游 host/tools 插件读服务）。 */
function makeCtx(): FakeCtx {
  const provided = new Map<string, unknown>();
  const ctx = {
    provided,
    get: (n: string) => provided.get(n),
    registeredTools: [] as unknown[],
    unregisteredTools: [] as unknown[],
    logs: [] as string[],
  };
  (ctx as unknown as { provide(n: string, v: unknown): () => void }).provide = (n, v) => {
    provided.set(n, v);
    return () => provided.delete(n);
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

const TOOL_NAMES = ['research_verify', 'research_record', 'research_search', 'research_review', 'research_experiment', 'research_campaign', 'research_paper', 'research_slides', 'research_autonomous', 'research_policy', 'research_job', 'research_schedule', 'research_reflect'];

/** 按依赖顺序挂载 host 平面 5 插件 + preset 平面 tools 插件。 */
function mountStack(
  ctx: FakeCtx,
  experimentConfig?: { defaults?: Parameters<typeof applyExperiment>[1]['defaults'] },
): { disposers: Array<() => void>; disposeTools: () => void } {
  const disposers: Array<() => void> = [];
  const push = (d: unknown): void => {
    if (typeof d === 'function') disposers.push(d as () => void);
  };
  push(applyCore(ctx as never, { agents: { enabled: true } }));
  push(applyDirector(ctx as never));
  push(applyExperiment(ctx as never, experimentConfig ?? {}));
  push(applyWriter(ctx as never));
  push(applyOperations(ctx as never));
  push(applyTools(ctx as never));
  // 只有 tools 插件返回 disposer（host 5 插件 apply 返回 void）
  const disposeTools = disposers[disposers.length - 1];
  return { disposers, disposeTools };
}

function registeredNames(ctx: FakeCtx): string[] {
  return ctx.registeredTools.map((t) => (t as { name: string }).name);
}

test('plugin: host 5 插件 + tools 组合挂载，BGP claim→verify→artifact，13 工具注册且可卸载', () => {
  assert.equal(coreName, 'dsh-research-core');
  assert.equal(directorName, 'dsh-research-director');
  assert.equal(experimentName, 'dsh-research-experiment');
  assert.equal(writerName, 'dsh-research-writer');
  assert.equal(operationsName, 'dsh-research-operations');
  assert.equal(toolsName, 'dsh-research-tools');

  const ctx = makeCtx();
  const { disposeTools } = mountStack(ctx);

  const core = ctx.provided.get('researchCore') as ResearchCoreService;
  assert.ok(core, 'researchCore should be provided');
  assert.ok(core.artifacts instanceof ArtifactStore);
  // 命名定型 + 内置领域词汇：researchCore.domain 必须暴露 dsh-routing-research 与领域词表
  assert.equal(core.domain.productName, 'dsh-routing-research', 'researchCore.domain 定型名');
  assert.equal(core.domain.command, 'dsh research', '操作命令不变');
  assert.ok(core.domain.scope.includes('BGP') && core.domain.scope.includes('RPKI'), '领域范围内置');
  assert.ok(core.domain.keywords.length >= 15, '领域关键词内置');
  assert.ok(core.domain.describe().includes('dsh-routing-research'), '领域自我介绍含定型名');

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

  // tools 插件注册全部 13 个工具
  assert.deepEqual(registeredNames(ctx).sort(), [...TOOL_NAMES].sort());

  // dispose 后工具卸载
  disposeTools();
  assert.equal(ctx.registeredTools.length, 0);
  assert.equal(ctx.unregisteredTools.length, TOOL_NAMES.length);
});

test('plugin: 阶段 2 服务挂载（memory + agents + director）', () => {
  const ctx = makeCtx();
  mountStack(ctx);

  const runtime = ctx.provided.get('researchDirector') as DirectorLike | undefined;
  assert.ok(ctx.provided.has('researchMemory'), 'researchMemory provided');
  assert.ok(ctx.provided.has('researchAgents'), 'researchAgents provided');
  assert.ok(runtime, 'researchDirector provided');
  assert.ok(ctx.provided.has('researchExperiment'), 'researchExperiment provided');

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

test('plugin: 阶段 3 research_campaign 自动实验服务全链路', () => {
  const ctx = makeCtx();
  mountStack(ctx);

  const exp = ctx.provided.get('researchExperiment') as {
    runAutomatic(input: { claim: string; repetitions?: number; validator?: string; supportThreshold?: number }): {
      plan: { claimId: string; env: string; scenario: string };
      outcome: string;
      verdict: string;
      artifacts: string[];
      detection: { mean: number; falsePositive: { mean: number } };
    };
  };
  assert.ok(exp, 'researchExperiment provided');

  const report = exp.runAutomatic({ claim: 'ROV 显著提升劫持检测', repetitions: 2, validator: 'rov', supportThreshold: 0.6 });
  assert.ok(report.plan.claimId, 'campaign 生成 claim id');
  assert.equal(report.outcome, 'support');
  assert.equal(report.verdict, 'verified', '证据核验 + 实验支持 → verified');
  assert.equal(report.artifacts.length, 2, '实验档案 + verdict 归档');
  assert.ok(report.detection.mean > 0.6);
  assert.ok(report.detection.falsePositive.mean < 0.1);

  const mem = ctx.provided.get('researchMemory') as ResearchMemoryLike & { episodic: { ofKind(k: string): unknown[] }; artifact: { forClaim(c: string): unknown[] } };
  assert.equal(mem.episodic.ofKind('experiment').length, 1, 'campaign 记入情景记忆');
  assert.ok(mem.artifact.forClaim(report.plan.claimId).length >= 2, '按 claim 可追溯归档');

  assert.ok(registeredNames(ctx).includes('research_campaign'), 'research_campaign 工具已注册');
});

test('plugin-experiment: config.defaults 合并到 runAutomatic（默认打底、显式输入优先）', () => {
  const ctx = makeCtx();
  mountStack(ctx, {
    defaults: { env: 'sim', validator: 'rov+bgpsec', attackClass: 'as-set-injection', repetitions: 2 },
  });

  const exp = ctx.provided.get('researchExperiment') as {
    runAutomatic(input: { claim: string; env?: string; validator?: string; attackClass?: string }): {
      plan: { claimId: string; env: string };
      outcome: string;
      verdict: string;
    };
  };
  assert.ok(exp, 'researchExperiment provided');

  // 不传 env/validator/attackClass → 应用 experimentspecific overlay 的 defaults
  const r1 = exp.runAutomatic({ claim: '恶意 ASPP 情形的检测率' });
  assert.equal(r1.plan.env, 'sim', 'defaults.env 生效');
  assert.equal(r1.verdict, 'verified', 'defaults validator/attackClass 下实验可复现出 verified');

  // 显式输入覆盖 defaults（输入优先）
  const r2 = exp.runAutomatic({ claim: '显式输入覆盖默认值', env: 'frr' });
  assert.equal(r2.plan.env, 'frr', '显式 env 覆盖 defaults.env');
});

test('plugin: 阶段 3.6/4a 服务挂载（writer/policy/autonomous）+ 新工具端到端', async () => {
  const ctx = makeCtx();
  mountStack(ctx);

  assert.ok(ctx.provided.has('researchWriter'), 'researchWriter provided');
  assert.ok(ctx.provided.has('researchPolicy'), 'researchPolicy provided');
  assert.ok(ctx.provided.has('researchAutonomous'), 'researchAutonomous provided');

  const policy = ctx.provided.get('researchPolicy') as { view(): { enabled: boolean; rules: unknown[]; prompt: string } };
  const view = policy.view();
  assert.equal(view.enabled, true);
  assert.equal(view.rules.length, 10, '默认 10 条纪律');
  assert.ok(view.prompt.includes('Research Agent Policy'));

  const names = registeredNames(ctx);
  for (const n of ['research_paper', 'research_slides', 'research_autonomous', 'research_policy']) {
    assert.ok(names.includes(n), `工具 ${n} 缺失`);
  }

  // research_policy 工具可执行
  const policyDef = ctx.registeredTools.find((t: { name: string }) => t.name === 'research_policy') as { execute(a: unknown): Promise<unknown> };
  const policyOut = await policyDef.execute({});
  assert.ok((policyOut as { enabled: boolean }).enabled === true);
  assert.equal((policyOut as { rules: unknown[] }).rules.length, 10);

  // research_autonomous 工具可执行（确定性流水线 → 论文/幻灯片/verdict）
  const autoDef = ctx.registeredTools.find((t: { name: string }) => t.name === 'research_autonomous') as { execute(a: unknown): Promise<unknown> };
  const autoOut = await autoDef.execute({ topic: 'RPKI+BGPsec 安全缺口', hypothesis: 'ROV 提升 prefix 劫持检测率（hijack）', validator: 'rov', supportThreshold: 0.6, repetitions: 2, seed: 1 });
  const auto = autoOut as { goalId: string; paper: string; slides: string; claimVerdicts: Record<string, string>; campaign?: { verdict: string }; summary: string; artifacts?: string[] };
  assert.ok(auto.goalId);
  assert.ok(auto.paper.includes('## 1. 背景与研究问题'));
  assert.ok(auto.slides.split(/\n---\n/).length >= 8);
  assert.equal(auto.campaign?.verdict, 'verified');
  assert.ok((auto.artifacts ?? []).length > 0);
  assert.ok(auto.summary.includes('已核验'));
});

test('plugin: 阶段 4b 服务挂载（jobs/scheduler/selfImprove）+ 三工具端到端', async () => {
  const ctx = makeCtx();
  mountStack(ctx);
  assert.ok(ctx.provided.has('researchJobs'), 'researchJobs provided');
  assert.ok(ctx.provided.has('researchScheduler'), 'researchScheduler provided');
  assert.ok(ctx.provided.has('researchSelfImprove'), 'researchSelfImprove provided');

  const names = registeredNames(ctx);
  for (const n of ['research_job', 'research_schedule', 'research_reflect']) {
    assert.ok(names.includes(n), `工具 ${n} 缺失`);
  }

  // research_reflect：冷启动自省 → 观察/建议
  const reflDef = ctx.registeredTools.find((t: { name: string }) => t.name === 'research_reflect') as { execute(a: unknown): Promise<unknown> };
  const refl = await reflDef.execute({}) as { summary: string; snapshot: { episodes: number; artifacts: number } };
  assert.ok(refl.summary.includes('改进建议'));
  assert.equal(refl.snapshot.episodes, 0);

  // research_job：submit 一个 campaign 任务（异步队列立即执行）→ get 轮询状态
  const jobDef = ctx.registeredTools.find((t: { name: string }) => t.name === 'research_job') as { execute(a: unknown): Promise<unknown> };
  const sub = await jobDef.execute({ action: 'submit', kind: 'campaign', claim: 'ROV 提升劫持检测', validator: 'rov', supportThreshold: 0.6, repetitions: 2 }) as { job?: { id: string; status: string } };
  assert.ok(sub.job?.id);
  assert.ok(['done', 'failed'].includes(sub.job?.status ?? ''), '同步执行体跑完即终态');
  const got = await jobDef.execute({ action: 'get', jobId: sub.job!.id }) as { job?: { status: string } };
  assert.ok(['done', 'failed'].includes(got.job?.status ?? ''), 'job 有终态');
  const list = await jobDef.execute({ action: 'list' }) as { jobs: unknown[] };
  assert.ok(list.jobs.length >= 1);

  // research_schedule：注册一次性到期调度 → tick 触发一次
  const schedDef = ctx.registeredTools.find((t: { name: string }) => t.name === 'research_schedule') as { execute(a: unknown): Promise<unknown> };
  const past = new Date(Date.now() - 1000).toISOString();
  await schedDef.execute({ action: 'register', scheduleId: 's1', topic: 'RPKI 演进', at: past });
  const ticks = await schedDef.execute({ action: 'tick' }) as { runs: Array<{ scheduleId: string }> };
  assert.ok(ticks.runs.some((r) => r.scheduleId === 's1'), '一次性调度触发');
});

test('plugin: 阶段 4c researchSubagents 服务挂载 + 本地回退（假 ctx 无 seam）', async () => {
  const ctx = makeCtx();
  mountStack(ctx);
  assert.ok(ctx.provided.has('researchSubagents'), 'researchSubagents provided');

  const svc = ctx.provided.get('researchSubagents') as {
    runtimeStatus(): { available: boolean; provider: string };
    run(input: { role: string; task: string }): Promise<{ delegator: string; ok: boolean; output: string }>;
  };
  const st = svc.runtimeStatus();
  assert.equal(st.available, false, '假 ctx 无 dsh subagents seam → 不可用');
  assert.equal(st.provider, 'spawn', 'provider 为配置名（未注册时仍如实暴露，不隐藏）');

  const turn = await svc.run({ role: 'literature', task: 'RPKI+BGPsec 安全边界' });
  assert.equal(turn.delegator, 'local', 'seam 不可用 → 本地回退');
  assert.equal(turn.ok, false);
  assert.ok(turn.output.includes('本地回退'));
});

test('plugin: src/plugin.ts 已降级为 re-export → 默认入口 = plugin-core（main 指向 plugin-core）', async () => {
  const mod = await import('./plugin.ts');
  // 直接 re-export plugin-core（= package.json main / exports["."] 指向的入口）
  assert.equal(mod.name, coreName, 'plugin.ts 直接 re-export plugin-core 的 name');
  assert.equal(mod.apply, applyCore, 'plugin.ts 直接 re-export plugin-core 的 apply');
  // 其余 5 个分片经具名 namespace 导出（运行时走子路径挂载）
  assert.equal(mod.director.name, directorName);
  assert.equal(typeof mod.director.apply, 'function');
  assert.equal(mod.experiment.name, experimentName);
  assert.equal(mod.writer.name, writerName);
  assert.equal(mod.operations.name, operationsName);
  assert.equal(mod.tools.name, toolsName);
  assert.equal(typeof mod.tools.apply, 'function');
});
