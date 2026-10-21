// preset 平面插件自测（阶段 5·B2）：用内存假 ctx（提供 get()/tools/logger）驱动
// plugin-tools.ts 的 apply()，验证：
//   (1) inject ['tools']（插件声明依赖 dsh-tools 的 ctx.tools）
//   (2) ctx.get(researchCore/…) 消费 host 平面 5 插件提供的 12 个服务
//   (3) 15 个 research_* 工具全部原样注册（含 research_triz / research_triza）；返回的 disposer 能全部卸载
//   (4) 任一 host 核心服务缺失 → 优雅跳过（不注册半吊子工具）
//   (5) config.tools.enabled=false → 跳过注册
//   (6) research_verify / research_record 经 ctx.get 装配的 runtime 可真实执行
// 只依赖本包源码与 node:test，Node 24 直接跑：node --test src/plugin-tools.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apply, name, inject } from './plugin-tools.ts';
import { LocalCorpusSource } from './agents/literature.ts';
import { SEED_CORPUS } from './agents/corpus.ts';
import { PRODUCT_NAME, COMMAND, PROFILE_FLAG, DOMAIN_SCOPE, DOMAIN_EXECUTORS, DOMAIN_KEYWORDS, GLOSSARY, describeDomain, scopeList, executorList } from './domain/index.ts';
import { newClaim, addEvidence, addCounterEvidence, synthConfidence } from './core/claim.ts';
import { createTrizService } from './triz/index.ts';
import { createTrizaService } from './triza/index.ts';
import { runVerification } from './core/verification.ts';
import { ArtifactStore } from './core/artifact-store.ts';

interface FakeCtx {
  provided: Map<string, unknown>;
  get(name: string): unknown;
  tools: { registered: unknown[]; unregistered: unknown[]; register(def: unknown): () => void };
  logs: string[];
  logger(_n: string): { info(...a: unknown[]): void; warn(...a: unknown[]): void };
}

function makeGuestCtx(provided: Record<string, unknown>): FakeCtx {
  const map = new Map<string, unknown>(Object.entries(provided));
  const ctx = {
    provided: map,
    get: (n: string) => map.get(n),
    registeredTools: [] as unknown[],
    unregisteredTools: [] as unknown[],
    logs: [] as string[],
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

const TOOL_NAMES = ['research_verify', 'research_record', 'research_search', 'research_review', 'research_experiment', 'research_campaign', 'research_paper', 'research_slides', 'research_autonomous', 'research_policy', 'research_job', 'research_schedule', 'research_reflect', 'research_triz', 'research_triza'];

/** host 平面 12 个服务的齐全 stub（researchCore 用真实 core 模块，可跑执行冒烟）。 */
function hostServices(): Record<string, unknown> {
  const artifacts = new ArtifactStore();
  const researchCore = {
    claims: {
      create: (input: { statement: string; type?: string; source: string }) =>
        newClaim({ statement: input.statement, type: input.type ?? 'Hypothesis', source: input.source }),
      addEvidence: (claim: never, ev: never) => addEvidence(claim as never, ev as never),
      addCounter: (claim: never, ce: never) => addCounterEvidence(claim as never, ce as never),
      confidence: (claim: never) => synthConfidence(claim as never),
    },
    verify: { claim: (claim: never, exp?: never) => runVerification(claim as never, exp as never) },
    plan: { selectNext: () => undefined, unlock: (tasks: never[]) => tasks as never },
    artifacts,
    domain: {
      productName: PRODUCT_NAME,
      command: COMMAND,
      profileFlag: PROFILE_FLAG,
      naming: `${PRODUCT_NAME} —— 域间路由安全研究 Agent（操作命令 ${COMMAND}，即 ${PROFILE_FLAG}）`,
      scope: DOMAIN_SCOPE,
      executors: DOMAIN_EXECUTORS,
      keywords: DOMAIN_KEYWORDS,
      glossary: GLOSSARY,
      scopeList,
      executorList,
      describe: describeDomain,
    },
  };
  const memory = {
    semantic: {},
    episodic: { record: () => undefined, recent: () => [] },
    artifact: { put: () => undefined },
    hypothesis: {},
    evidence: {},
  };
  return {
    researchCore,
    researchMemory: memory,
    researchAgents: { literature: { search: () => [] }, reviewer: {}, experiment: {} },
    researchDirector: { run: () => ({ iterations: 0 }) },
    researchExperiment: { runAutomatic: () => ({}) },
    researchWriter: {},
    researchPolicy: {},
    researchAutonomous: { run: () => ({}) },
    researchJobs: {},
    researchScheduler: {},
    researchSelfImprove: {},
    researchSubagents: {},
    researchTriz: createTrizService(),
    researchTriza: createTrizaService(),
  };
}

function registeredNames(ctx: FakeCtx): string[] {
  return ctx.registeredTools.map((t) => (t as { name: string }).name);
}

test('plugin-tools: inject 声明依赖 ctx.tools，host 服务齐全时注册全部 15 个工具（含 research_triz / research_triza）且可卸载', () => {
  assert.equal(name, 'dsh-research-tools');
  assert.deepEqual([...inject], ['tools'], '必须 inject ["tools"] 才能读 ctx.tools');

  const ctx = makeGuestCtx(hostServices());
  const dispose = apply(ctx as never);

  assert.equal(typeof dispose, 'function', '应返回 disposer');
  assert.deepEqual(registeredNames(ctx).sort(), [...TOOL_NAMES].sort(), '15 个 research_* 全部注册');

  // 卸载后 15 个全部注销
  dispose!();
  assert.equal(ctx.registeredTools.length, 0);
  assert.equal(ctx.unregisteredTools.length, TOOL_NAMES.length);
});

test('plugin-tools: 任一 host 核心服务缺失 → 跳过注册（不产生半吊子工具）', () => {
  const services = hostServices();
  delete services['researchWriter'];
  const ctx = makeGuestCtx(services);
  const dispose = apply(ctx as never);

  assert.equal(dispose, undefined, '缺服务时不应返回 disposer');
  assert.equal(ctx.registeredTools.length, 0, '不应注册任何工具');
  assert.ok(ctx.logs.some((l) => l.startsWith('WARN')), '应告警提示 host 服务未就绪');
});

test('plugin-tools: config.tools.enabled=false → 跳过注册（服务仍由 host 提供，不受影响）', () => {
  const ctx = makeGuestCtx(hostServices());
  const dispose = apply(ctx as never, { tools: { enabled: false } });

  assert.equal(dispose, undefined);
  assert.equal(ctx.registeredTools.length, 0, 'enabled=false 不应注册工具');
  assert.ok(ctx.logs.some((l) => l.includes('enabled=false')), '应记录跳过原因');
});


test('plugin-tools: config.tools.only 白名单裁剪 — 只注册列出的 research_* 工具，其余跳过', () => {
  const ctx = makeGuestCtx(hostServices());
  const only = ['research_paper', 'research_slides', 'research_verify'];
  const dispose = apply(ctx as never, { tools: { only } });

  assert.equal(typeof dispose, 'function', '应返回 disposer');
  assert.deepEqual(registeredNames(ctx).sort(), [...only].sort(), '只注册白名单内的工具');
  assert.ok(ctx.logs.some((l) => l.includes('tools.only')), '应记录裁剪日志');

  // 卸载后白名单内工具全部注销
  dispose!();
  assert.equal(ctx.registeredTools.length, 0);
  assert.equal(ctx.unregisteredTools.length, only.length);
});

test('plugin-tools: config.tools.only 传空数组 → 等同缺省（注册全部 15 个）', () => {
  const ctx = makeGuestCtx(hostServices());
  const dispose = apply(ctx as never, { tools: { only: [] } });

  assert.deepEqual(registeredNames(ctx).sort(), [...TOOL_NAMES].sort(), '空白名单 = 注册全部');
  dispose!();
  assert.equal(ctx.registeredTools.length, 0);
});

/** 语料版 host services：literature.search 用真实 LocalCorpusSource(SEED_CORPUS)。 */
function hostServicesWithCorpus(): Record<string, unknown> {
  const services = hostServices();
  const corpus = new LocalCorpusSource(SEED_CORPUS);
  (services['researchAgents'] as { literature: { search: () => [] } }).literature = {
    search: (q: string, k?: number) => corpus.search(q, k),
  };
  return services;
}

test('plugin-tools: research_search 缺省 query 用内置领域词汇兜底（seeded），显式 query 不 seed', async () => {
  const ctx = makeGuestCtx(hostServicesWithCorpus());
  const dispose = apply(ctx as never);

  const defs = ctx.registeredTools as Array<{ name: string; execute(args: unknown): Promise<unknown> }>;
  const search = defs.find((d) => d.name === 'research_search')!;

  // 无 query → 内置领域词汇（dsh-routing-research DOMAIN_KEYWORDS）兜底，命中种子语料
  const seeded = await search.execute({}) as { hits: Array<{ title: string }>; seeded: boolean };
  assert.equal(seeded.seeded, true, '缺省 query 应标记 seeded=true');
  assert.ok(seeded.hits.length > 0, '领域词汇兜底应命中语料');
  assert.ok(seeded.hits.some((h) => /rpki|rov|bgp/i.test(h.title)), '兜底命中应覆盖 RPKI/ROV/BGP 关键词');

  // 显式 query → 不走兜底
  const explicit = await search.execute({ query: 'BGPsec 部分部署' }) as { hits: unknown[]; seeded: boolean };
  assert.equal(explicit.seeded, false, '显式 query 不应 seed');

  dispose!();
  assert.equal(ctx.registeredTools.length, 0);
});

test('plugin-tools: research_verify / research_record 经 ctx.get 装配的 core/runtime 真实执行', async () => {
  const ctx = makeGuestCtx(hostServices());
  const dispose = apply(ctx as never);

  const byName = new Map(registeredNames(ctx).map((n) => [n, n]));
  assert.equal(byName.size, TOOL_NAMES.length);

  const defs = ctx.registeredTools as Array<{ name: string; execute(args: unknown): Promise<unknown> }>;
  const findTool = (n: string) => defs.find((d) => d.name === n)!;

  // research_verify：claim → 证据 → 验证闭环
  const verifyOut = await findTool('research_verify').execute({ claim: 'ROV 提升劫持检测', evidence: ['ROA 限定合法来源 AS'], source: 'test' });
  const v = verifyOut as { verdict: string; rationale: string; checks: string[] };
  assert.ok(['verified', 'disputed', 'rejected'].includes(v.verdict), `verdict=${v.verdict}`);
  assert.ok(Array.isArray(v.checks) && v.checks.length > 0, 'checks 非空');

  // research_record：artifact 落库
  const recOut = await findTool('research_record').execute({ kind: 'note', title: 'BGP 冒烟', body: 'ROV 检测' });
  const r = recOut as { id: string; kind: string; title: string };
  assert.ok(r.id, 'artifact id 存在');
  assert.equal(r.kind, 'note');
  assert.equal(r.title, 'BGP 冒烟');

  dispose!();
  assert.equal(ctx.registeredTools.length, 0);
});

// ---------------------------------------------------------------------------
// 阶段 11 · 科研绘图工具（research_draw / research_draw_status）
// 规则：enableDraw=true 即注册（注册与解析解耦——researchDraw 依赖 connection，
// preset 组合阶段可能尚未就绪）；执行时经 ctx.get('researchDraw') 惰性解析，
// 未就绪返回 phase:failed 明确错误；默认（不传 enableDraw）不注册 draw 工具。
// ---------------------------------------------------------------------------

/** 假 draw 服务：submit 立即返回已 succeeded 的 job；status 按 id 查。 */
function fakeDrawService(): Record<string, unknown> {
  const jobs = new Map<string, unknown>();
  let seq = 0;
  const submit = (req: Record<string, unknown>, sessionId?: string) => {
    seq += 1;
    const id = `draw-fake-${seq}`;
    const view = {
      id,
      sessionId,
      phase: 'succeeded' as const,
      progress: 1,
      logTail: [],
      request: req,
      result: {
        outputPath: `/o/images/image-2026102100000${seq}.png`,
        thumbnailBase64: `data:image/png;base64,thumb${seq}`,
        width: 2048, height: 1152,
        provider: 'local', model: 'local/Qwen-Image-2.1 (mflux)',
        mode: 'txt2img', size: '2048x1152', steps: 50, seed: 7,
      },
      artifactId: `art-draw-${seq}`,
    };
    jobs.set(id, view);
    return view;
  };
  return {
    submit,
    status: (id: string) => jobs.get(id),
    list: () => [...jobs.values()],
    config: () => ({ enabled: true }),
  };
}

function hostServicesWithDraw(): Record<string, unknown> {
  const services = hostServices();
  services['researchDraw'] = fakeDrawService();
  return services;
}

test('plugin-tools: enableDraw=true + researchDraw 服务在 → 注册 research_draw / research_draw_status', () => {
  const ctx = makeGuestCtx(hostServicesWithDraw());
  const dispose = apply(ctx as never, { enableDraw: true });

  const names = registeredNames(ctx).sort();
  assert.equal(names.length, TOOL_NAMES.length + 2, '15 基础 + 2 draw');
  assert.ok(names.includes('research_draw'), '应含 research_draw');
  assert.ok(names.includes('research_draw_status'), '应含 research_draw_status');
  // 日志原样保留 %d 占位与实参：分母应为 17（15 基础 + 2 draw）
  assert.ok(ctx.logs.some((l) => l.includes('dsh-research-tools') && l.includes('17')), `注册计数日志=${ctx.logs.join(' | ')}`);

  dispose!();
  assert.equal(ctx.registeredTools.length, 0, '卸载后 draw 工具注销');
});

test('plugin-tools: 默认（不传 enableDraw）→ 不注册 research_draw（15 个）', () => {
  const ctx = makeGuestCtx(hostServicesWithDraw());
  const dispose = apply(ctx as never, {});

  const names = registeredNames(ctx);
  assert.equal(names.length, TOOL_NAMES.length, '默认 15 个');
  assert.ok(!names.includes('research_draw'), '不应注册 research_draw');
  dispose!();
});

test('plugin-tools: enableDraw=true 但 researchDraw 服务缺失 → 仍注册 draw 工具，execute 惰性解析失败返回明确错误', async () => {
  const ctx = makeGuestCtx(hostServices());
  const dispose = apply(ctx as never, { enableDraw: true });

  const names = registeredNames(ctx);
  assert.equal(names.length, TOOL_NAMES.length + 2, 'enableDraw=true → 注册 15 基础 + 2 draw（即使服务当时未就绪）');
  assert.ok(names.includes('research_draw'), '应含 research_draw');

  const defs = ctx.registeredTools as Array<{ name: string; execute(args: Record<string, unknown>): Promise<unknown> }>;
  const draw = defs.find((d) => d.name === 'research_draw')!;
  const out = await draw.execute({ prompt: 'BGP 架构图' }) as Record<string, unknown>;
  assert.equal(out.phase, 'failed');
  assert.ok(String(out.error).includes('researchDraw 服务未就绪'), `明确错误=${out.error}`);
  dispose!();
});

test('plugin-tools: research_draw.execute 对已完结 job 秒回结果（不进入轮询 sleep）+ research_draw_status 轮询', async () => {
  const ctx = makeGuestCtx(hostServicesWithDraw());
  const dispose = apply(ctx as never, { enableDraw: true });

  const defs = ctx.registeredTools as Array<{ name: string; execute(args: Record<string, unknown>): Promise<unknown> }>;
  const draw = defs.find((d) => d.name === 'research_draw')!;
  const drawStatus = defs.find((d) => d.name === 'research_draw_status')!;

  // research_draw：prompt 必填；提交后已 succeeded → 直接返回完整结果（无轮询等待）
  const started = Date.now();
  const out = await draw.execute({ prompt: 'BGP 架构图', provider: 'local', aspect: '16:9', resolution: '2K', quality: 'high', seed: 7 }) as Record<string, unknown>;
  const elapsed = Date.now() - started;
  assert.equal(out.jobId, 'draw-fake-1');
  assert.equal(out.phase, 'succeeded');
  assert.equal(out.outputPath, '/o/images/image-20261021000001.png');
  assert.equal(out.provider, 'local');
  assert.ok(elapsed < 2000, `已完结 job 不应轮询：elapsed=${elapsed}ms`);

  // research_draw_status：查 jobId → 进度/result/artifactId/logTail
  const st = await drawStatus.execute({ jobId: 'draw-fake-1' }) as Record<string, unknown>;
  assert.equal(st.phase, 'succeeded');
  assert.equal(st.artifactId, 'art-draw-1');
  assert.ok(Array.isArray(st.logTail), 'logTail 数组');

  // 未知名 job → failed
  const miss = await drawStatus.execute({ jobId: 'nope' }) as Record<string, unknown>;
  assert.equal(miss.phase, 'failed');
  assert.equal(miss.error, 'job not found');

  dispose!();
});
