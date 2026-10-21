// src/draw/plugin-draw.test.ts — host 插件（科研绘图）核心 job 执行器自测。
//
// 用注入的假 deps（spawn/fetch/fs）驱动 DrawJobManager，验证端到端：
//   (1) local txt2img：spawn 参数（--model/--prompt/--steps/--width/--height/--output）+ 进度解析 → succeeded
//   (2) local edit：--image-path / --image-strength（style 0.4 默认；content 0.7）落盘参考图
//   (3) api b64_json：POST /images/generations → 落盘解码 buffer
//   (4) api url：先拿 data[0].url 再下载 → 落盘
//   (5) api 精确尺寸被 400 拒 → 按 sizePolicy 回退最近标准档重试一次
//   (6) local 成功退出但无产物 → failed
//   (7) 完成回调写 artifact（draw: note，meta.sessionId/outputPath）+ memory.persist
//   (8) collectDrawHistory 按 sessionId 过滤 + isDrawArtifact / drawHistoryView
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DrawJobManager, collectDrawHistory, isDrawArtifact, type DrawRuntimeDeps, type DrawRequest } from '../plugin-draw.ts';
import type { Artifact } from '../core/artifact-store.ts';
import { ArtifactStore } from '../core/artifact-store.ts';

const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
const IMAGE_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9]);
const OUT_RE = /images\/image-\d{14}(?:-\d+)?\.png$/;

class FakeProc {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;
  private listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  on(ev: string, fn: (...args: unknown[]) => void): this {
    (this.listeners[ev] ??= []).push(fn);
    return this;
  }
  emit(ev: string, ...args: unknown[]): void {
    for (const fn of this.listeners[ev] ?? []) fn(...args);
  }
  kill(): void { this.killed = true; }
}

interface ManagerHarness {
  manager: DrawJobManager;
  artifacts: ArtifactStore;
  calls: { spawn: Array<{ bin: string; args: string[] }>; fetch: Array<{ url: string; body: string }>; writes: string[] };
  persistCount: number;
  refs: string[];
}

function makeHarness(opts: {
  spawnImpl?: (bin: string, args: string[]) => FakeProc;
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  exists?: (p: string) => boolean;
  core?: boolean;
  memory?: boolean;
  config?: Record<string, unknown>;
} = {}): ManagerHarness {
  const artifacts = new ArtifactStore();
  const calls = { spawn: [] as { bin: string; args: string[] }[], fetch: [] as { url: string; body: string }[], writes: [] as string[] };
  const persistCount = { value: 0 as number };
  const refs: string[] = [];
  const mkdir: string[] = [];

  const fakeExists = (p: string): boolean => {
    if (opts.exists) return opts.exists(p);
    return OUT_RE.test(p); // 产物文件视为存在
  };

  const spawnImpl = opts.spawnImpl ?? ((bin: string, args: string[]) => {
    const proc = new FakeProc();
    queueMicrotask(() => {
      proc.stderr.emit('data', '  50%|████████ | 25/50 [00:30<00:30]');
      proc.stderr.emit('data', '  100%|██████████ | 50/50 [01:00<00:00]');
      proc.emit('close', 0);
    });
    return proc;
  });

  const fetchImpl = opts.fetchImpl ?? (async () => new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }), { status: 200 }));

  const runtime: DrawRuntimeDeps = {
    spawn: ((bin: string, args: string[]) => {
      calls.spawn.push({ bin, args });
      return spawnImpl(bin, args);
    }) as never,
    fetch: ((url: string, init?: RequestInit) => {
      calls.fetch.push({ url, body: (init?.body as string) ?? '' });
      return fetchImpl(url, init);
    }) as never,
    mkdirSync: ((p: string) => { mkdir.push(p); }) as never,
    writeFileSync: ((p: string, b: string | Buffer) => { calls.writes.push(p); }) as never,
    readFileSync: ((p: string) => IMAGE_BYTES) as never,
    existsSync: fakeExists as never,
  };

  const core = opts.core === false ? undefined : { artifacts };
  const memory = opts.memory === false ? undefined : {
    episodic: { record: () => undefined, recent: () => [] },
    persist: () => { persistCount.value += 1; return undefined; },
  };

  const manager = new DrawJobManager({
    ctx: {} as never,
    config: { outputRoot: tmpdir(), ...(opts.config ?? {}) } as never,
    runtime,
    core: core as never,
    memory: memory as never,
    onComplete: (job) => {
      if (job.result?.outputPath && OUT_RE.test(job.result.outputPath)) refs.push(job.result.outputPath);
    },
  });

  return { manager, artifacts, calls, persistCount, refs };
}

/** 等 job 进入终态。 */
async function settle(manager: DrawJobManager, jobId: string, tries = 60): Promise<void> {
  for (let i = 0; i < tries; i += 1) {
    const v = manager.status(jobId);
    if (v && (v.phase === 'succeeded' || v.phase === 'failed')) return;
    await new Promise((r) => setTimeout(r, 10));
  }
}

function baseReq(over: Partial<DrawRequest> = {}): DrawRequest {
  return { prompt: 'BGP 架构图（科研绘图）', aspect: '16:9', resolution: '2K', quality: 'high', provider: 'local', mode: 'txt2img', seed: 7, ...over };
}

test('draw/plugin: local txt2img 端到端 — spawn 参数、进度解析、succeeded、artifact + persist', async () => {
  const h = makeHarness({});
  const jobId = h.manager.submit(baseReq(), 'sess-1').id;
  await settle(h.manager, jobId);

  const view = h.manager.status(jobId)!;
  assert.equal(view.phase, 'succeeded', `phase=${view.phase} error=${view.error}`);
  assert.equal(view.progress, 1);
  assert.ok(view.result, 'result 存在');
  assert.ok(view.result!.outputPath && OUT_RE.test(view.result!.outputPath), `outputPath=${view.result!.outputPath}`);
  assert.equal(view.result!.provider, 'local');
  assert.equal(view.result!.seed, 7);
  assert.equal(view.result!.mode, 'txt2img');
  // 16:9 × 2K → 2048x1152 local 32 对齐
  assert.equal(view.result!.width, 2048);
  assert.equal(view.result!.height, 1152);
  assert.ok(view.artifactId, '有 artifactId');
  assert.equal(view.sessionId, 'sess-1');
  // spawn 参数含 --model / --prompt / --steps 50 / --seed 7 / --output
  assert.equal(h.calls.spawn.length, 1);
  const { bin, args } = h.calls.spawn[0];
  assert.ok(bin.includes('mflux-generate-qwen-2.1'), `bin=${bin}`);
  assert.ok(args.includes('--model') && args[args.indexOf('--model') + 1].includes('Qwen-Image-2.1'));
  assert.ok(args.includes('--prompt') && args[args.indexOf('--prompt') + 1].includes('BGP 架构图'));
  assert.ok(args.includes('--steps') && args[args.indexOf('--steps') + 1] === '50');
  assert.ok(args.includes('--seed') && args[args.indexOf('--seed') + 1] === '7');
  assert.ok(args.includes('--width') && args[args.indexOf('--width') + 1] === '2048');
  assert.ok(args.includes('--height') && args[args.indexOf('--height') + 1] === '1152');
  assert.ok(args.includes('--output'));
  // artifact 已写：kind=note / title^='draw: ' / meta.sessionId / outputPath
  const art = h.artifacts.get(view.artifactId!)!;
  assert.equal(art.kind, 'note');
  assert.ok(art.title.startsWith('draw: '));
  assert.equal(art.meta.sessionId, 'sess-1');
  assert.equal((art.meta.params as { prompt: string }).prompt.includes('BGP 架构图'), true);
  assert.equal(h.persistCount.value, 1, 'memory.persist 被调用');
});

test('draw/plugin: local edit 垫图 — --image-path / --image-strength style=0.4', async () => {
  const h = makeHarness({});
  const jobId = h.manager.submit(baseReq({ mode: 'edit', editPreset: 'style', imageData: PNG_B64, imageName: 'ref.png' }), 'sess-2').id;
  await settle(h.manager, jobId);

  const view = h.manager.status(jobId)!;
  assert.equal(view.phase, 'succeeded', `error=${view.error}`);
  assert.equal(view.result!.mode, 'edit');
  const { args } = h.calls.spawn[0];
  assert.ok(args.includes('--image-path'), 'edit 应带 --image-path');
  const idx = args.indexOf('--image-strength');
  assert.ok(idx >= 0 && args[idx + 1] === '0.4', `style 默认强度 0.4；got=${args[idx + 1]}`);
  // 参考图 base64 已写临时文件
  assert.ok(h.calls.writes.some((p) => p.includes('dsh-draw-ref-')), '参考图落盘临时文件');
});

test('draw/plugin: local edit content=0.7', async () => {
  const h = makeHarness({});
  const jobId = h.manager.submit(baseReq({ mode: 'edit', editPreset: 'content', imageData: PNG_B64 }), 'sess-3').id;
  await settle(h.manager, jobId);
  const { args } = h.calls.spawn[0];
  const idx = args.indexOf('--image-strength');
  assert.equal(args[idx + 1], '0.7', 'content 默认强度 0.7');
});

test('draw/plugin: api b64_json — POST /images/generations → 落盘解码 buffer', async () => {
  const h = makeHarness({ config: { sizePolicy: 'standard-only' } });
  const jobId = h.manager.submit(baseReq({ provider: 'api', apiBaseURL: 'https://api.example.com/v1', apiKey: 'sk-x', apiModel: 'qwen-img' }), 'sess-4').id;
  await settle(h.manager, jobId);

  const view = h.manager.status(jobId)!;
  assert.equal(view.phase, 'succeeded', `error=${view.error}`);
  assert.equal(view.result!.provider, 'api');
  assert.equal(view.result!.model, 'api/qwen-img');
  assert.equal(h.calls.fetch.length, 1);
  const [call] = h.calls.fetch;
  assert.equal(call.url, 'https://api.example.com/v1/images/generations');
  const body = JSON.parse(call.body) as Record<string, unknown>;
  assert.equal(body.model, 'qwen-img');
  assert.equal(body.response_format, 'b64_json');
  // standard-only → size 直接用标准档（16:9 → 1792x1024）
  assert.equal(body.size, '1792x1024');
  assert.ok(h.calls.writes.some((p) => OUT_RE.test(p)), '已落盘产物');
});

test('draw/plugin: api url 模式 — 先取 data[0].url 再下载落盘', async () => {
  const h = makeHarness({
    fetchImpl: (async (url: string) => {
      if (url.includes('/images/generations')) {
        return new Response(JSON.stringify({ data: [{ url: 'https://cdn/x.png' }] }), { status: 200 });
      }
      return new Response(IMAGE_BYTES, { status: 200 });
    }) as never,
  });
  const jobId = h.manager.submit(baseReq({ provider: 'api', apiModel: 'm2', sizePolicy: 'standard-only' }), 'sess-5').id;
  await settle(h.manager, jobId);
  const view = h.manager.status(jobId)!;
  assert.equal(view.phase, 'succeeded', `error=${view.error}`);
  assert.equal(h.calls.fetch.length, 2, '一次 generations + 一次下载');
  assert.equal(h.calls.writes.length, 1, '下载 buffer 落盘');
});

test('draw/plugin: api 精确尺寸被 400 拒 → 回退最近标准档重试一次（exact-then-fallback）', async () => {
  let n = 0;
  const h = makeHarness({
    config: { sizePolicy: 'exact-then-fallback' },
    fetchImpl: (async () => {
      n += 1;
      if (n === 1) return new Response('bad size', { status: 400 });
      return new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }), { status: 200 });
    }) as never,
  });
  // 21:10 无标准档 → 第一发精确尺寸，400 后回退标准档
  const jobId = h.manager.submit(baseReq({ provider: 'api', aspect: '21:10', resolution: '2K', apiModel: 'm' }), 'sess-6').id;
  await settle(h.manager, jobId);
  const view = h.manager.status(jobId)!;
  assert.equal(view.phase, 'succeeded', `error=${view.error}`);
  assert.equal(h.calls.fetch.length, 2, '重试一次');
  const sizes = h.calls.fetch.map((c) => (JSON.parse(c.body) as { size: string }).size);
  assert.equal(sizes[0], '2048x975', '第一发 21:10 精确尺寸 2048x975');
  assert.notEqual(sizes[1], sizes[0], '第二发回退标准档');
  assert.ok(sizes[1].includes('x') && sizes[1].length > 0, `fallback=${sizes[1]}`);
});

test('draw/plugin: local 成功退出但无产物 → failed', async () => {
  const h = makeHarness({ exists: () => false });
  const jobId = h.manager.submit(baseReq(), 'sess-7').id;
  await settle(h.manager, jobId);
  const view = h.manager.status(jobId)!;
  assert.equal(view.phase, 'failed');
  assert.ok(view.error && /未产生/.test(view.error), `error=${view.error}`);
});

test('draw/plugin: local 非零退出码 → failed + 日志尾', async () => {
  const h = makeHarness({
    spawnImpl: () => {
      const p = new FakeProc();
      queueMicrotask(() => { p.stderr.emit('data', 'CUDA out of memory'); p.emit('close', 1); });
      return p;
    },
  });
  const jobId = h.manager.submit(baseReq(), 'sess-8').id;
  await settle(h.manager, jobId);
  const view = h.manager.status(jobId)!;
  assert.equal(view.phase, 'failed');
  assert.ok(view.error && /退出码 1/.test(view.error), `error=${view.error}`);
});

test('draw/plugin: collectDrawHistory 按 sessionId 过滤 + isDrawArtifact / drawHistoryView', async () => {
  const artifacts = new ArtifactStore();
  const mk = (sessionId: string, prompt: string, i: number): Artifact => artifacts.put({
    kind: 'note',
    title: `draw: ${prompt.slice(0, 40)}`,
    body: prompt,
    meta: { sessionId, params: { prompt }, outputPath: `/o/images/image-${i}.png`, provider: 'local', model: 'x', size: '1024x1024', mode: 'txt2img' },
  });
  mk('s-a', '图A', 1);
  mk('s-b', '图B', 2);
  mk('s-a', '图C', 3);
  // 非 draw note 过滤
  artifacts.put({ kind: 'note', title: '别的笔记', body: 'x', meta: {} });

  const ctx = { get: (n: string) => (n === 'researchCore' ? { artifacts } : undefined) } as never;
  const onlyA = collectDrawHistory(ctx, 's-a');
  assert.equal(onlyA.length, 2, 's-a 会话两条');
  assert.ok(onlyA.every((v) => v.title.startsWith('draw: ')), 'title 前缀');
  assert.ok(onlyA.every((v) => v.outputPath && v.outputPath.includes('/images/')), 'outputPath');
  assert.equal(collectDrawHistory(ctx, 's-b').length, 1);
  assert.equal(collectDrawHistory(ctx, 's-nope').length, 0);
  assert.equal(collectDrawHistory(ctx, undefined).length, 3, '无 sessionId 全列');
  // 视图富化：collectDrawHistory 已返回视图，直接断言字段
  assert.ok(['图A', '图C'].includes(onlyA[0].prompt ?? ''), `prompt=${onlyA[0].prompt}`);
  assert.equal(onlyA[0].provider, 'local');
  assert.equal(onlyA[0].mode, 'txt2img');
  // isDrawArtifact 判定（用原始 artifact）
  const raw = artifacts.get(onlyA[0].artifactId)!;
  assert.ok(isDrawArtifact(raw), 'isDrawArtifact 判定');
});

test('draw/plugin: 完成时缩略图 base64 随 artifact meta 持久化（历史可预览）', async () => {
  const h = makeHarness({});
  const jobId = h.manager.submit(baseReq(), 'sess-thumb').id;
  await settle(h.manager, jobId);
  const view = h.manager.status(jobId)!;
  assert.equal(view.phase, 'succeeded', `error=${view.error}`);
  assert.ok(view.result!.thumbnailBase64, 'job result 有缩略图');
  const art = h.artifacts.get(view.artifactId!)!;
  assert.equal(typeof art.meta.thumbBase64, 'string', 'meta.thumbBase64 已持久化');
  assert.ok((art.meta.thumbBase64 as string).startsWith('data:image/png;base64,'), 'thumbBase64 为 data URL');
});

test('draw/plugin: 历史视图带 thumbBase64 + fileExists；archive 后从列表消失（删除语义）', () => {
  const artifacts = new ArtifactStore();
  const mk = (sessionId: string, i: number, thumb?: string): Artifact => artifacts.put({
    kind: 'note',
    title: `draw: 图${i}`,
    body: 'x',
    meta: { sessionId, params: { prompt: `图${i}` }, outputPath: `/o/images/image-${i}.png`, provider: 'local', model: 'm', size: '1024x1024', mode: 'txt2img', thumbBase64: thumb ?? `data:image/png;base64,T${i}` },
  });
  const a1 = mk('s-x', 1);
  mk('s-x', 2);
  const ctx = { get: (n: string) => (n === 'researchCore' ? { artifacts } : undefined) } as never;

  // 假 existsSync：image-1 存在、其余缺失
  const check = (p: string): boolean => p.includes('image-1.png');
  const items = collectDrawHistory(ctx, 's-x', 50, check);
  assert.equal(items.length, 2);
  const i1 = items.find((v) => v.artifactId === a1.id)!;
  assert.equal(i1.fileExists, true, '存在文件标记 true');
  assert.equal(i1.thumbBase64, 'data:image/png;base64,T1', 'thumbBase64 透出');
  const missing = items.find((v) => v.artifactId !== a1.id)!;
  assert.equal(missing.fileExists, false, '缺失文件标记 false');

  // archiveDrawArtifact：删一条
  assert.equal(archiveDrawArtifact({ artifacts } as never, a1.id), true);
  assert.equal(archiveDrawArtifact({ artifacts } as never, 'art-nope'), false, '不存在返回 false');
  assert.equal(collectDrawHistory(ctx, 's-x').length, 1, 'archive 后列表过滤');
  // archiveDrawHistory：按会话清空
  assert.equal(archiveDrawHistory({ artifacts } as never, 's-x'), 1);
  assert.equal(collectDrawHistory(ctx, 's-x').length, 0, '清空后 0');
  // 非 draw note 不可被 archive 命中
  const plain = artifacts.put({ kind: 'note', title: '普通笔记', body: 'x', meta: {} });
  assert.equal(archiveDrawArtifact({ artifacts } as never, plain.id), false);
});

// ---------------------------------------------------------------------------
// apply() 路由挂载 —— 白屏可见性（2026-10-21）+ 历史管理（2026-10-21）：
//   6 条路由（config / debug / generate / status / history / delete）都注册；
//   debug route 收到浏览器端 error 上报时打印到 `dsh research` 终端；
//   delete route 支持 artifactId 删单条 / sessionId 清空会话。
// ---------------------------------------------------------------------------
import { apply, archiveDrawArtifact, archiveDrawHistory, DRAW_CONFIG_PATH, DRAW_DEBUG_PATH, DRAW_DELETE_PATH, DRAW_GENERATE_PATH, DRAW_HISTORY_PATH, DRAW_STATUS_PATH } from '../plugin-draw.ts';

test('draw/plugin: apply() 挂 6 条路由 + debug 上报路由把客户端错误打到 CLI', async () => {
  const routes: Array<{ path: string; methods?: string[]; fetch: (r: Request) => Promise<Response> }> = [];
  const provided = new Map<string, unknown>();
  const ctx = {
    get: (n: string) => provided.get(n),
    provide: (n: string, v: unknown) => { provided.set(n, v); },
    logger: () => ({ info() {}, warn() {} }),
    connection: { fetch: { register: (r: { path: string; methods?: string[]; fetch: (req: Request) => Promise<Response> }) => { routes.push(r); return () => {}; } } },
  };
  const disposer = apply(ctx as never, { enabled: true });
  try {
    const paths = routes.map((r) => r.path);
    for (const p of [DRAW_CONFIG_PATH, DRAW_DEBUG_PATH, DRAW_GENERATE_PATH, DRAW_STATUS_PATH, DRAW_HISTORY_PATH, DRAW_DELETE_PATH]) {
      assert.ok(paths.includes(p), `路由已注册: ${p}`);
    }
    // service 提供
    assert.ok(provided.has('researchDraw'), 'researchDraw 服务已 provide');

    // debug 上报 → CLI 打印
    const debugRoute = routes.find((r) => r.path === DRAW_DEBUG_PATH)!;
    const errs: string[] = [];
    const origErr = console.error;
    console.error = (...a: unknown[]) => { errs.push(a.map(String).join(' ')); };
    let body: { ok?: boolean };
    try {
      const res = await debugRoute.fetch(new Request(`http://x${DRAW_DEBUG_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 'error', msg: 'tab boom', meta: 'stack line' }),
      }));
      body = await res.json() as { ok?: boolean };
    } finally {
      console.error = origErr;
    }
    assert.equal(body.ok, true, 'debug route 返回 {ok:true}');
    assert.ok(errs.length >= 1, 'console.error 被调用');
    assert.match(errs[0], /\[dsh-research-draw\]/);
    assert.ok(errs[0].includes('tab boom'), `CLI 含客户端错误内容: ${errs[0]}`);

    // config route GET 可用
    const cfgRoute = routes.find((r) => r.path === DRAW_CONFIG_PATH)!;
    const cfg = await (await cfgRoute.fetch(new Request(`http://x${DRAW_CONFIG_PATH}`, { method: 'GET' }))).json() as { enabled?: boolean };
    assert.equal(cfg.enabled, true);
  } finally {
    disposer?.();
  }
});

test('draw/plugin: DELETE route — artifactId 删单条 / sessionId 清空 / 缺参与不存在 4xx', async () => {
  const artifacts = new ArtifactStore();
  artifacts.put({ kind: 'note', title: 'draw: 甲', body: 'x', meta: { sessionId: 's-1', outputPath: '/o/1.png' } });
  artifacts.put({ kind: 'note', title: 'draw: 乙', body: 'x', meta: { sessionId: 's-1', outputPath: '/o/2.png' } });
  artifacts.put({ kind: 'note', title: '别的笔记', body: 'x', meta: {} });
  const routes: Array<{ path: string; methods?: string[]; fetch: (r: Request) => Promise<Response> }> = [];
  const provided = new Map<string, unknown>();
  const ctx = {
    get: (n: string) => provided.get(n),
    provide: (n: string, v: unknown) => { provided.set(n, v); },
    logger: () => ({ info() {}, warn() {} }),
    connection: { fetch: { register: (r: { path: string; methods?: string[]; fetch: (req: Request) => Promise<Response> }) => { routes.push(r); return () => {}; } } },
  };
  provided.set('researchCore', { artifacts });
  const disposer = apply(ctx as never, { enabled: true });
  try {
    const route = routes.find((r) => r.path === DRAW_DELETE_PATH)!;
    // 缺参 → 400
    let res = await route.fetch(new Request(`http://x${DRAW_DELETE_PATH}`, { method: 'POST', body: JSON.stringify({}) }));
    assert.equal(res.status, 400, '缺参 400');
    // artifactId 删单条
    res = await route.fetch(new Request(`http://x${DRAW_DELETE_PATH}`, { method: 'POST', body: JSON.stringify({ artifactId: 'art-1' }) }));
    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean; archived: number };
    assert.deepEqual(body, { ok: true, archived: 1 }, '单条删除 {ok,archived:1}');
    assert.equal(collectDrawHistory(ctx as never, undefined).length, 1, 'archive 后只剩一条 draw');
    // 不存在的 artifactId → 404
    res = await route.fetch(new Request(`http://x${DRAW_DELETE_PATH}`, { method: 'POST', body: JSON.stringify({ artifactId: 'art-nope' }) }));
    assert.equal(res.status, 404, '不存在 404');
    // sessionId 清空该会话
    res = await route.fetch(new Request(`http://x${DRAW_DELETE_PATH}`, { method: 'POST', body: JSON.stringify({ sessionId: 's-1' }) }));
    assert.equal(res.status, 200);
    const body2 = await res.json() as { ok: boolean; archived: number };
    assert.deepEqual(body2, { ok: true, archived: 1 }, '会话清空 {ok,archived:1}');
    assert.equal(collectDrawHistory(ctx as never, undefined).length, 0, '清空后无 draw 记录');
  } finally {
    disposer?.();
  }
});
