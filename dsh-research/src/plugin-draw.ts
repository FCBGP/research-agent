// @basil/dsh-research/draw — host 平面插件 10（右侧栏「科研绘图」面板 + research_draw 服务）。
//
// 定位（用户 2026-10-21 确认，AGENTS.md §2「勿动基础设施」）：**不做独立 preset / profile**，
// 绘图只在 Web 右侧栏以 tab 形态提供（与 TRIZ 面板同机制：host 数据源 + client bundle），
// 不新增 agent preset，不给其它 profile 增加管理负担。
//
// 本插件职责：
//   1. 提供 `researchDraw` 服务（submit / status / list / config）——research_draw /
//      research_draw_status 工具的 host 后端（仅 paper 预设 enableDraw=true 时注册工具）；
//   2. 在 connection 鉴权栅栏内挂 4 条 route 供右侧栏「科研绘图」tab 取数/提交/轮询：
//        POST /api/research.draw.generate   （provider + 参数 + 垫图 base64）→ { jobId }
//        GET  /api/research.draw.status?jobId= → { phase, progress?, logTail, result?, artifactId }
//        GET  /api/research.draw.config     → { enabled, providers, 比例/分辨率/画质表, 默认值, outputRoot, sizePolicy }
//        GET  /api/research.draw.history?sessionId= → 最近绘图记录（写 artifact 的 draw: note，重启后仍可按会话列出）
//   3. 双后端 provider 抽象：
//        local —— spawn 本机 mflux CLI（mflux-generate-qwen-2.1, Qwen-Image-2.1 模型，非驻留，
//                 现场加载 → 并发上限 1）；edit 垫图（1 张参考图，style 0.4 / content 0.7）。
//        api   —— POST {baseURL}/images/generations（OpenAI 兼容；Bearer；b64_json|url 双收）；
//                 任意比例先发精确 WxH、失败回退最近标准尺寸（sizePolicy 开关）。
//   4. 完成回调：输出 path + macOS sips -Z 1024 缩略图 base64（无 sips 回落整图）+ 写 artifact
//      （kind=note, title^='draw: ', meta.sessionId/params/outputPath）+ 会话持久化（复用阶段 10
//      ArtifactStore + persistMemory + 按 sessionId 过滤）。
//
// config.enabled=false 时只挂 config route（客户端据此空渲染），generate/status 不挂。
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import type { ArtifactStore, Artifact } from './core/artifact-store.ts';
import type { ResearchCoreService } from './plugin-core.ts';
import type { ResearchMemory } from './memory/index.ts';
import type { AspectRatio, DrawMode, Quality, Resolution, SizePolicy } from './draw/dimensions.ts';
import { ASPECT_RATIOS, DEFAULT_ASPECT, DEFAULT_QUALITY, DEFAULT_RESOLUTION, QUALITIES, QUALITY_STEPS, RESOLUTIONS, RESOLUTION_LONG_EDGE, sizeFor } from './draw/dimensions.ts';
import { drawOutputPath } from './draw/paths.ts';
import type { LocalConfig } from './draw/local.ts';
import { buildLocalArgs, defaultLocalConfig, parseMfluxProgress } from './draw/local.ts';
import type { ApiConfig } from './draw/api.ts';
import { base64ToBuffer, buildApiRequest, expandEnvVar, resolveApiResponseData } from './draw/api.ts';

export const name = 'dsh-research-draw';

/** client 侧数据契约路径（host 侧注册 + client/route.ts 常量保持一致）。 */
export const DRAW_GENERATE_PATH = '/api/research.draw.generate';
export const DRAW_STATUS_PATH = '/api/research.draw.status';
export const DRAW_CONFIG_PATH = '/api/research.draw.config';
export const DRAW_HISTORY_PATH = '/api/research.draw.history';
/** 客户端→CLI 报错/步骤上送（浏览器端白屏/异常也能在 `dsh research` 终端看到）。 */
export const DRAW_DEBUG_PATH = '/api/research.draw.debug';

// ---------------------------------------------------------------------------
// CLI 可见日志：`dsh research` 跑在终端里，白屏/失败也能在命令行看到发生了什么。
// 2026-10-21 用户反馈「点生成后白屏、不知道发生什么」→ 补全部 draw 事件到 stdout。
// ---------------------------------------------------------------------------
const LOG_TAG = '[dsh-research-draw]';
function cliLog(...parts: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log(LOG_TAG, ...parts);
}
function cliWarn(...parts: unknown[]): void {
  // eslint-disable-next-line no-console
  console.warn(LOG_TAG, ...parts);
}
function cliError(...parts: unknown[]): void {
  // eslint-disable-next-line no-console
  console.error(LOG_TAG, ...parts);
}
function safeString(value: unknown): string {
  try { return JSON.stringify(value ?? null); } catch { return String(value); }
}

/** 需要 host 服务：connection（route 注册）；researchCore/researchMemory 经 ctx.get 惰性读取。 */
export const inject = ['connection'];

/** 参考图 base64 上限（默认 20MB，防超大 payload）。 */
export const MAX_REF_BODY_BYTES = 20 * 1024 * 1024;

// ---------------------------------------------------------------------------
// 配置与请求/视图类型
// ---------------------------------------------------------------------------

export interface DrawPluginConfig {
  enabled?: boolean;
  local?: LocalConfig;
  api?: ApiConfig;
  /** 输出根目录（默认 ~/Downloads/outputs；固定再追加 images/ 子目录）。 */
  outputRoot?: string;
  sizePolicy?: SizePolicy;
  /** 并发上限（local 现场加载模型 → 默认 1，勿轻易调高）。 */
  maxConcurrency?: number;
  /** 缩略图最长边（sips -Z；默认 1024）。 */
  thumbMax?: number;
  maxRefBytes?: number;
}

export interface DrawRequest {
  prompt: string;
  provider?: 'local' | 'api';
  mode?: DrawMode;
  aspect?: AspectRatio | string;
  resolution?: Resolution | string;
  quality?: Quality | string;
  steps?: number;
  seed?: number;
  width?: number;
  height?: number;
  negativePrompt?: string;
  guidance?: number;
  quantize?: number;
  outputDir?: string;
  // api 侧可覆盖
  apiBaseURL?: string;
  apiKey?: string;
  apiModel?: string;
  sizePolicy?: SizePolicy;
  // edit（仅 local）
  imageData?: string;
  imageName?: string;
  editPreset?: 'style' | 'content';
  editStrength?: number;
}

/** 从请求里剥掉敏感/大字段的持久化视图（imageData / apiKey 不进 artifact）。 */
function sanitizeRequest(r: DrawRequest): Record<string, unknown> {
  const { prompt, provider, mode, aspect, resolution, quality, steps, seed, width, height, negativePrompt, guidance, quantize, outputDir, apiBaseURL, apiModel, sizePolicy, editPreset, editStrength } = r;
  return {
    prompt: prompt.slice(0, 120),
    provider, mode, aspect, resolution, quality,
    steps, seed, width, height, negativePrompt: negativePrompt?.slice(0, 120),
    guidance, quantize, outputDir, apiBaseURL, apiModel, sizePolicy,
    editPreset, editStrength,
  };
}

export interface DrawJobResult {
  outputPath: string;
  thumbnailBase64?: string;
  width: number;
  height: number;
  provider: 'local' | 'api';
  model: string;
  mode: DrawMode;
  size: string;
  steps: number;
  seed: number;
}

export interface DrawJobView {
  id: string;
  createdAt: string;
  phase: 'queued' | 'running' | 'succeeded' | 'failed';
  progress?: number;
  logTail: string[];
  error?: string;
  result?: DrawJobResult;
  artifactId?: string;
  sessionId?: string;
  request: Record<string, unknown>;
}

export interface DrawConfigView {
  enabled: boolean;
  providers: Array<'local' | 'api'>;
  aspects: readonly AspectRatio[];
  resolutions: readonly Resolution[];
  qualities: readonly Quality[];
  qualitySteps: Record<Quality, number>;
  resolutionLongEdge: Record<Resolution, number>;
  defaults: {
    aspect: AspectRatio;
    resolution: Resolution;
    quality: Quality;
    provider: 'local' | 'api';
    steps: number;
    seed: number;
    width: number;
    height: number;
    outputRoot: string;
    editPresets: { style: { label: string; strength: number }; content: { label: string; strength: number } };
  };
  outputRoot: string;
  sizePolicy: SizePolicy;
  local: { bin: string; model: string; defaultSteps: number; defaultSeed: number };
  api: { baseURL: string; modelId: string; keyProvided: boolean };
  thumbMax: number;
  maxRefBytes: number;
}

export interface DrawService {
  submit(request: DrawRequest, sessionId?: string): DrawJobView;
  status(jobId: string): DrawJobView | undefined;
  list(): DrawJobView[];
  config(): DrawConfigView;
}

// ---------------------------------------------------------------------------
// 运行依赖注入（测试可 mock spawn/fetch/fs；默认 node 内置）
// ---------------------------------------------------------------------------

export interface DrawRuntimeDeps {
  spawn: typeof spawn;
  fetch?: typeof fetch;
  mkdirSync: typeof mkdirSync;
  writeFileSync: typeof writeFileSync;
  readFileSync: typeof readFileSync;
  existsSync: typeof existsSync;
  /** macOS 缩略图命令（无 → 回落整图）；测试可注入假命令。 */
  makeThumb?: (src: string, dst: string) => void;
}

export function defaultDeps(): DrawRuntimeDeps {
  return {
    spawn,
    fetch: typeof fetch === 'function' ? fetch : undefined,
    mkdirSync,
    writeFileSync,
    readFileSync,
    existsSync,
    makeThumb: (src, dst) => {
      // macOS 专用：sips -Z 1024 生成缩略图（失败静默 → 回落整图由调用方兜底）
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
        execFileSync('sips', ['-Z', '1024', src, '--out', dst]);
      } catch {
        /* 非 mac / sips 缺失 → 回落整图 */
      }
    },
  };
}

interface RunningLocal {
  proc: ChildProcessWithoutNullStreams;
  abort: () => void;
}

// ---------------------------------------------------------------------------
// Job 管理器：内存 job 表 + 并发上限（默认 1）+ 可终止
// ---------------------------------------------------------------------------

interface InternalJob {
  id: string;
  createdAt: string;
  sessionId?: string;
  request: DrawRequest;
  phase: 'queued' | 'running' | 'succeeded' | 'failed';
  progress?: number;
  log: string[];
  error?: string;
  result?: DrawJobResult;
  artifactId?: string;
}

interface DrawManagerDeps {
  ctx: Context;
  config: DrawPluginConfig;
  runtime: DrawRuntimeDeps;
  core?: ResearchCoreService;
  memory?: ResearchMemory & { persist?(dir?: string): string | undefined };
  onComplete?(job: InternalJob): void;
}

/**
 * 核心 job 执行器。独立成类便于单测（构造注入 deps；serve 循环逐个跑队列）。
 */
export class DrawJobManager {
  private jobs = new Map<string, InternalJob>();
  private queue: string[] = [];
  private active: RunningLocal | null = null;
  private activeFetchAbort: AbortController | null = null;
  private seq = 0;
  /** 最近完成（含失败）jobId 列表，供侧边栏历史（最多 50）。 */
  private recent: string[] = [];
  private running = false;
  readonly deps: DrawManagerDeps;
  private disposed = false;

  constructor(deps: DrawManagerDeps) {
    this.deps = deps;
  }

  submit(request: DrawRequest, sessionId?: string): DrawJobView {
    this.seq += 1;
    const id = `draw-${Date.now().toString(36)}-${this.seq}`;
    const job: InternalJob = {
      id,
      createdAt: new Date().toISOString(),
      sessionId,
      request,
      phase: 'queued',
      log: [`[${new Date().toLocaleTimeString()}] queued: ${request.provider ?? 'local'} · ${request.mode ?? 'txt2img'}`],
    };
    this.jobs.set(id, job);
    this.queue.push(id);
    cliLog('submit job=', id, 'provider=', request.provider ?? 'local', 'mode=', request.mode ?? 'txt2img',
      'prompt=', JSON.stringify((request.prompt ?? '').slice(0, 60)), 'session=', sessionId ?? '∅');
    if (!this.running && !this.disposed) {
      this.running = true;
      void this.serve();
    }
    return this.toView(job);
  }

  status(jobId: string): DrawJobView | undefined {
    const job = this.jobs.get(jobId);
    return job ? this.toView(job) : undefined;
  }

  list(): DrawJobView[] {
    return this.recent.map((id) => this.jobs.get(id)).filter((j): j is InternalJob => !!j).map((j) => this.toView(j));
  }

  private toView(job: InternalJob): DrawJobView {
    return {
      id: job.id,
      createdAt: job.createdAt,
      phase: job.phase,
      progress: job.progress,
      logTail: job.log.slice(-40),
      error: job.error,
      result: job.result,
      artifactId: job.artifactId,
      sessionId: job.sessionId,
      request: sanitizeRequest(job.request),
    };
  }

  config(): DrawConfigView {
    return buildConfigView(this.deps.config);
  }

  /** 终止所有活动执行（local 杀进程 / api abort）并清空队列。 */
  dispose(): void {
    this.disposed = true;
    if (this.active) {
      try { this.active.abort(); } catch { /* ignore */ }
    }
    this.activeFetchAbort?.abort();
    this.active = null;
    this.activeFetchAbort = null;
    this.queue = [];
  }

  private async serve(): Promise<void> {
    while (!this.disposed && this.queue.length > 0) {
      const id = this.queue.shift()!;
      const job = this.jobs.get(id);
      if (!job) continue;
      try {
        await this.run(job);
      } catch (err) {
        job.phase = 'failed';
        job.error = String((err as Error)?.message ?? err);
        this.appendLog(job, `[error] ${job.error}`);
        cliError('job=', id, '[failed]', job.error);
      } finally {
        if (!this.recent.includes(id)) {
          this.recent.push(id);
          if (this.recent.length > 50) this.recent.shift();
        }
      }
    }
    this.running = false;
  }

  private appendLog(job: InternalJob, line: string): void {
    job.log.push(line);
    if (job.log.length > 120) job.log = job.log.slice(-120);
  }

  private async run(job: InternalJob): Promise<void> {
    const { config, core, memory } = this.deps;
    const request = job.request;
    const provider = request.provider === 'api' ? 'api' : 'local';
    job.phase = 'running';
    this.appendLog(job, `[run] ${provider} mode=${request.mode ?? 'txt2img'}`);

    const quality = (QUALITIES as readonly string[]).includes(request.quality ?? '') ? request.quality as Quality : DEFAULT_QUALITY;
    const resolution = (RESOLUTIONS as readonly string[]).includes(request.resolution ?? '') ? request.resolution as Resolution : DEFAULT_RESOLUTION;
    const aspect = request.aspect ?? DEFAULT_ASPECT;
    const size = sizeFor(aspect, resolution, { width: request.width, height: request.height }, provider, request.sizePolicy ?? config.sizePolicy);
    const steps = request.steps ?? QUALITY_STEPS[quality];
    const seed = request.seed ?? config.local?.defaultSeed ?? 42;
    const outputRoot = request.outputDir ?? config.outputRoot ?? defaultLocalConfig().outputRoot!;
    const outputPath = drawOutputPath(outputRoot);
    this.appendLog(job, `[size] ${size.width}x${size.height} (${aspect}, ${resolution}, quality=${quality}, steps=${steps}, seed=${seed})`);
    cliLog('job=', job.id, '[start]', provider, 'mode=', request.mode ?? 'txt2img',
      `${size.width}x${size.height}`, `steps=${steps}`, `seed=${seed}`, 'session=', job.sessionId ?? '∅', '→', outputPath);
    if (request.sizePolicy !== 'standard-only' && provider === 'api') {
      this.appendLog(job, `[size] api 兜底档=${size.apiFallback}（${size.apiSize} 失败时回退）`);
    }

    const providerKind = provider;

    // 输出目录
    try {
      this.deps.runtime.mkdirSync(dirname(outputPath), { recursive: true });
    } catch (err) {
      throw new Error(`无法创建输出目录: ${String((err as Error)?.message ?? err)}`);
    }

    let result: DrawJobResult;
    if (providerKind === 'local') {
      result = await this.runLocal(job, request, quality, size.width, size.height, steps, seed, outputPath);
    } else {
      result = await this.runApi(job, request, quality, size, steps, seed, outputPath);
    }

    job.result = result;
    job.progress = 1;
    job.phase = 'succeeded';
    this.appendLog(job, `[done] ${result.outputPath} ${result.width}x${result.height}`);
    cliLog('job=', job.id, '[done]', result.outputPath, `${result.width}x${result.height}`, 'provider=', result.provider, 'steps=', result.steps);

    // 记录 artifact + 情景记忆 + 会话持久化（复用阶段 10）
    if (core?.artifacts) {
      const body = [
        `# ${request.prompt.slice(0, 200)}`,
        '',
        `- provider: ${result.provider} / ${result.model}`,
        `- mode: ${result.mode} | size: ${result.width}x${result.height} | steps: ${result.steps} | seed: ${result.seed}`,
        `- output: ${result.outputPath}`,
      ].join('\n');
      const artifact: Artifact = core.artifacts.put({
        kind: 'note',
        title: `draw: ${request.prompt.slice(0, 40)}`,
        body,
        meta: {
          sessionId: job.sessionId,
          params: sanitizeRequest(request),
          outputPath: result.outputPath,
          provider: result.provider,
          model: result.model,
          width: result.width,
          height: result.height,
          size: result.size,
          steps: result.steps,
          seed: result.seed,
          mode: result.mode,
        },
      });
      job.artifactId = artifact.id;
      this.appendLog(job, `[artifact] ${artifact.id}`);
    }
    if (memory) {
      memory.episodic?.record?.({
        kind: 'draw',
        summary: `draw: ${request.prompt.slice(0, 40)} → ${result.outputPath}`,
        outcome: 'succeeded',
      });
      memory.persist?.();
    }
    this.deps.onComplete?.(job);
  }

  /** local：spawn mflux CLI（非驻留；每 job 现场加载模型）。 */
  private async runLocal(
    job: InternalJob,
    request: DrawRequest,
    quality: Quality,
    width: number,
    height: number,
    steps: number,
    seed: number,
    outputPath: string,
  ): Promise<DrawJobResult> {
    const cfg: LocalConfig = { ...defaultLocalConfig(), ...this.deps.config.local };
    const bin = cfg.bin!;
    const model = cfg.model!;
    let imagePath: string | undefined;
    if (request.mode === 'edit' && request.imageData) {
      imagePath = await this.writeRefImage(request, job);
      this.appendLog(job, `[edit] 参考图已落盘 ${imagePath}`);
    }
    const imageStrength = request.editStrength ?? (request.editPreset === 'content' ? 0.7 : 0.4);
    const args = buildLocalArgs(cfg, {
      prompt: request.prompt,
      mode: request.mode === 'edit' ? 'edit' : 'txt2img',
      quality,
      steps,
      seed,
      width,
      height,
      outputPath,
      negativePrompt: request.negativePrompt,
      guidance: request.guidance,
      quantize: request.quantize,
      imagePath,
      imageStrength: request.mode === 'edit' ? imageStrength : undefined,
    });
    this.appendLog(job, `[cmd] ${bin} ${args.join(' ')}`);

    const result = await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
      let proc: ChildProcessWithoutNullStreams;
      try {
        proc = this.deps.runtime.spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (err) {
        reject(new Error(`spawn 失败（${bin} 不在 PATH？）: ${String((err as Error)?.message ?? err)}`));
        return;
      }
      this.active = { proc, abort: () => { try { proc.kill('SIGTERM'); } catch { /* ignore */ } } };
      let out = '';
      const collect = (chunk: Buffer | string): void => {
        const text = typeof chunk === 'string' ? chunk : chunk.toString();
        out += text;
        for (const line of text.split('\n')) {
          const trimmed = line.trim();
          if (trimmed) {
            this.appendLog(job, trimmed.slice(0, 200));
            const p = parseMfluxProgress(line);
            if (p !== null) job.progress = Math.min(0.95, Math.max(job.progress ?? 0, p * 0.9));
          }
        }
      };
      proc.stdout.on('data', collect);
      proc.stderr.on('data', collect);
      proc.on('error', (err) => { this.active = null; reject(new Error(`mflux 启动失败: ${String(err.message)}`)); });
      proc.on('close', (code) => { this.active = null; resolve({ code, output: out }); });
    });

    if (result.code !== 0) {
      const tail = result.output.split('\n').filter((l) => l.trim()).slice(-6).join('\n');
      throw new Error(`mflux 退出码 ${String(result.code)}：${tail || '(无输出)'}`);
    }
    if (!this.deps.runtime.existsSync(outputPath)) {
      throw new Error(`mflux 成功退出但未产生产物: ${outputPath}`);
    }
    const thumb = this.thumbnailBase64(outputPath);
    return {
      outputPath,
      thumbnailBase64: thumb,
      width,
      height,
      provider: 'local',
      model: `local/Qwen-Image-2.1 (mflux)`,
      mode: request.mode === 'edit' ? 'edit' : 'txt2img',
      size: `${width}x${height}`,
      steps,
      seed,
    };
  }

  /** api：POST OpenAI 兼容 images/generations；b64_json|url 双收；精确尺寸失败回退标准档。 */
  private async runApi(
    job: InternalJob,
    request: DrawRequest,
    quality: Quality,
    size: ReturnType<typeof sizeFor>,
    steps: number,
    seed: number,
    outputPath: string,
  ): Promise<DrawJobResult> {
    const cfg: ApiConfig = { ...this.deps.config.api };
    if (request.apiBaseURL) cfg.baseURL = request.apiBaseURL;
    if (request.apiKey) cfg.apiKey = request.apiKey;
    if (request.apiModel) cfg.modelId = request.apiModel;
    const modelId = (cfg.modelId ?? '').trim() || 'qwen-image-2.1';
    const outputExt = outputPath.endsWith('.jpg') ? 'jpg' : 'png';

    let attemptSize = size.apiSize;
    let attempts = 0;
    const policy = request.sizePolicy ?? this.deps.config.sizePolicy ?? 'exact-then-fallback';
    // (attemptSize 已在 buildApiRequest 里写进 body；这里循环允许回退重试)
    while (true) {
      attempts += 1;
      const spec = buildApiRequest(cfg, {
        prompt: request.prompt,
        quality,
        size: attemptSize,
        seed,
        negativePrompt: request.negativePrompt,
      });
      this.appendLog(job, `[api] POST ${spec.url} size=${attemptSize}${spec.headers.Authorization ? ' (Bearer ****)' : ''}`);
      if (!this.deps.runtime.fetch) throw new Error('api provider 需要 fetch（Node ≥ 18）');
      const controller = new AbortController();
      this.activeFetchAbort = controller;
      let response: Response;
      try {
        response = await this.deps.runtime.fetch(spec.url, {
          method: 'POST',
          headers: spec.headers,
          body: JSON.stringify(spec.body),
          signal: controller.signal,
        });
      } finally {
        this.activeFetchAbort = null;
      }
      if (!response.ok) {
        const text = await response.text();
        const retryable = response.status === 400 || response.status === 422;
        // 精确尺寸失败 → 按 sizePolicy 回退最近标准档（只回退一次）
        const isExact = attemptSize === size.apiSize && size.apiSize !== size.apiFallback;
        if (policy === 'exact-then-fallback' && retryable && isExact && attempts < 2) {
          this.appendLog(job, `[api] ${response.status} 尺寸被拒 → 回退标准档 ${size.apiFallback}`);
          attemptSize = size.apiFallback;
          continue;
        }
        throw new Error(`api ${response.status}: ${(text || '').slice(0, 400)}`);
      }
      const json = (await response.json()) as unknown;
      const img = resolveApiResponseData(json);
      if (!img) throw new Error(`api 响应无图片数据: ${JSON.stringify(json).slice(0, 300)}`);
      if (img.kind === 'b64') {
        this.deps.runtime.writeFileSync(outputPath, base64ToBuffer(img.data));
      } else {
        // url 模式：下载到输出路径
        const res = await this.deps.runtime.fetch(img.url, { signal: new AbortController().signal });
        if (!res.ok) throw new Error(`下载 ${img.url} 失败: ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        this.deps.runtime.writeFileSync(outputPath, buf);
      }
      this.appendLog(job, `[api] 已落盘 ${outputPath}（${img.kind === 'b64' ? 'b64_json' : 'url'}）`);
      const thumb = this.thumbnailBase64(outputPath);
      return {
        outputPath,
        thumbnailBase64: thumb,
        width: size.width,
        height: size.height,
        provider: 'api',
        model: `api/${modelId}`,
        mode: 'txt2img',
        size: attemptSize,
        steps,
        seed,
      };
    }
  }

  /** 垫图 base64 → 临时文件（返回路径）；超限抛错。 */
  private writeRefImage(request: DrawRequest, job: InternalJob): Promise<string> {
    const data = request.imageData ?? '';
    const max = this.deps.config.maxRefBytes ?? MAX_REF_BODY_BYTES;
    if (data.length > max) return Promise.reject(new Error(`参考图超过 ${max} 字节，请压缩后上传`));
    const clean = data.replace(/^data:[^;]+;base64,/, '');
    const buf = Buffer.from(clean, 'base64');
    const ext = (request.imageName ?? '').toLowerCase().endsWith('.jpg') || (request.imageName ?? '').toLowerCase().endsWith('.jpeg') ? 'jpg' : 'png';
    const tmp = join(tmpdir(), `dsh-draw-ref-${job.id}-${Date.now()}.${ext}`);
    return new Promise((resolve, reject) => {
      try {
        this.deps.runtime.writeFileSync(tmp, buf);
        resolve(tmp);
      } catch (err) {
        reject(new Error(`写参考图失败: ${String((err as Error)?.message ?? err)}`));
      }
    });
  }

  /** macOS sips -Z 缩略图 → base64（无 sips/失败回落整图 base64）。 */
  private thumbnailBase64(path: string): string {
    try {
      const thumbPath = `${path}.thumb.png`;
      if (this.deps.runtime.makeThumb) {
        this.deps.runtime.makeThumb(path, thumbPath);
        if (this.deps.runtime.existsSync(thumbPath)) {
          const buf = this.deps.runtime.readFileSync(thumbPath);
          return `data:image/png;base64,${buf.toString('base64')}`;
        }
      }
    } catch { /* fallthrough */ }
    try {
      const buf = this.deps.runtime.readFileSync(path);
      return `data:image/png;base64,${buf.toString('base64')}`;
    } catch {
      return undefined as unknown as string;
    }
  }
}

/** 组装 /api/research.draw.config 的视图（供侧边栏渲染所有可调参数）。 */
export function buildConfigView(config: DrawPluginConfig): DrawConfigView {
  const lc = { ...defaultLocalConfig(), ...config.local };
  const ac = { ...(config.api ?? {}) };
  const enabled = config.enabled !== false;
  const defaults: DrawConfigView['defaults'] = {
    aspect: DEFAULT_ASPECT,
    resolution: DEFAULT_RESOLUTION,
    quality: DEFAULT_QUALITY,
    provider: 'local',
    steps: lc.defaultSteps ?? 50,
    seed: lc.defaultSeed ?? 42,
    width: 768,
    height: 1024,
    outputRoot: config.outputRoot ?? lc.outputRoot ?? '~/Downloads/outputs',
    editPresets: {
      style: { label: '风格参考', strength: 0.4 },
      content: { label: '内容参考', strength: 0.7 },
    },
  };
  return {
    enabled,
    providers: enabled ? ['local', 'api'] : [],
    aspects: ASPECT_RATIOS,
    resolutions: RESOLUTIONS,
    qualities: QUALITIES,
    qualitySteps: QUALITY_STEPS,
    resolutionLongEdge: RESOLUTION_LONG_EDGE,
    defaults,
    outputRoot: defaults.outputRoot,
    sizePolicy: config.sizePolicy ?? 'exact-then-fallback',
    local: { bin: lc.bin!, model: lc.model!, defaultSteps: lc.defaultSteps ?? 50, defaultSeed: lc.defaultSeed ?? 42 },
    api: { baseURL: ac.baseURL ?? '', modelId: ac.modelId ?? '', keyProvided: !!ac.apiKey },
    thumbMax: config.thumbMax ?? 1024,
    maxRefBytes: config.maxRefBytes ?? MAX_REF_BODY_BYTES,
  };
}

/** 解析 /api/research.draw.generate 的 POST body（宽松容错：非法字段取默认）。 */
export function parseDrawRequest(body: unknown): DrawRequest {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  if (typeof b.prompt !== 'string' || !b.prompt.trim()) throw new Error('prompt 不能为空');
  const request: DrawRequest = { prompt: b.prompt.slice(0, 4000) };
  if (b.provider === 'api' || b.provider === 'local') request.provider = b.provider;
  if (b.mode === 'edit' || b.mode === 'txt2img') request.mode = b.mode;
  if (typeof b.aspect === 'string' && b.aspect) request.aspect = b.aspect;
  if (typeof b.resolution === 'string' && b.resolution) request.resolution = b.resolution;
  if (typeof b.quality === 'string' && b.quality) request.quality = b.quality;
  for (const key of ['steps', 'width', 'height', 'guidance', 'quantize'] as const) {
    const v = b[key];
    if (typeof v === 'number' && Number.isFinite(v)) (request as Record<string, unknown>)[key] = v;
  }
  if (typeof b.seed === 'number') request.seed = Math.floor(b.seed);
  for (const key of ['negativePrompt', 'outputDir', 'apiBaseURL', 'apiKey', 'apiModel', 'imageData', 'imageName'] as const) {
    if (typeof b[key] === 'string') (request as Record<string, unknown>)[key] = b[key];
  }
  if (b.sizePolicy === 'exact-then-fallback' || b.sizePolicy === 'standard-only') request.sizePolicy = b.sizePolicy;
  if (b.editPreset === 'style' || b.editPreset === 'content') request.editPreset = b.editPreset;
  if (typeof b.editStrength === 'number' && Number.isFinite(b.editStrength)) request.editStrength = b.editStrength as number;
  return request;
}

/** 一条历史绘图记录（写 artifact 的 draw: note 的展示视图；重启后可持久化还原）。 */
export interface DrawHistoryView {
  artifactId: string;
  title: string;
  createdAt: string;
  outputPath?: string;
  prompt?: string;
  provider?: string;
  model?: string;
  size?: string;
  mode?: string;
}

/** 判定一个 artifact 是否为科研绘图完成记录（kind=note, title^='draw: '）。 */
export function isDrawArtifact(a: Artifact): boolean {
  return a.kind === 'note' && !a.archived && a.title.startsWith('draw: ');
}

/** 把一条 draw note 富化成历史展示视图。 */
export function drawHistoryView(a: Artifact): DrawHistoryView {
  const meta = a.meta ?? {};
  const params = typeof meta.params === 'object' && meta.params !== null ? meta.params as Record<string, unknown> : {};
  return {
    artifactId: a.id,
    title: a.title,
    createdAt: a.createdAt,
    outputPath: typeof meta.outputPath === 'string' ? meta.outputPath : undefined,
    prompt: typeof params.prompt === 'string' ? params.prompt : undefined,
    provider: typeof meta.provider === 'string' ? meta.provider : undefined,
    model: typeof meta.model === 'string' ? meta.model : undefined,
    size: typeof meta.size === 'string' ? meta.size : undefined,
    mode: typeof meta.mode === 'string' ? meta.mode : undefined,
  };
}

/** 收集某会话最近 N 条绘图记录（按 createdAt 降序；researchCore 缺失时安全返回空）。 */
export function collectDrawHistory(ctx: Context, sessionId?: string, limit = 50): DrawHistoryView[] {
  const core = ctx.get?.('researchCore') as ResearchCoreService | undefined;
  if (!core?.artifacts) return [];
  return core.artifacts.list()
    .filter((a) => isDrawArtifact(a) && (!sessionId || typeof a.meta?.sessionId !== 'string' || a.meta.sessionId === sessionId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map(drawHistoryView);
}

/** host 插件 body。 */
export function apply(ctx: Context, config: DrawPluginConfig = {}): (() => void) | undefined {
  const deps = defaultDeps();
  const core = ctx.get?.('researchCore') as ResearchCoreService | undefined;
  const memory = ctx.get?.('researchMemory') as (ResearchMemory & { persist?(dir?: string): string | undefined }) | undefined;
  const enabled = config.enabled !== false;
  const manager: DrawService & { dispose(): void } & DrawJobManager = new DrawJobManager({ ctx, config, runtime: deps, core, memory }) as never;

  const disposers: Array<() => void> = [];
  // config route 恒挂（enabled=false 时客户端据此空渲染）
  disposers.push(ctx.connection.fetch.register({
    path: DRAW_CONFIG_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: () => {
      cliLog('GET config');
      return Promise.resolve(Response.json(manager.config(), { headers: { 'cache-control': 'no-store' } }));
    },
  }) as unknown as () => void);
  // 客户端→CLI 上报路由（恒挂）：浏览器端 error/unhandledrejection/面板错误 → 打印到终端
  disposers.push(ctx.connection.fetch.register({
    path: DRAW_DEBUG_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: (request: Request) => Promise.resolve((async () => {
      let payload: { level?: string; msg?: string; meta?: unknown } = {};
      try {
        const text = await request.text();
        payload = JSON.parse(text || '{}') as { level?: string; msg?: string; meta?: unknown };
      } catch { /* 非法 body 忽略 */ }
      const level = payload.level === 'error' ? 'error' : payload.level === 'warn' ? 'warn' : 'log';
      const line = `${payload.msg ?? ''}${payload.meta !== undefined ? ` ${safeString(payload.meta)}` : ''}`;
      if (level === 'error') cliError('[client]', line);
      else if (level === 'warn') cliWarn('[client]', line);
      else cliLog('[client]', line);
      return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
    })()),
  }) as unknown as () => void);
  if (enabled) {
    disposers.push(ctx.connection.fetch.register({
      path: DRAW_GENERATE_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: (request: Request) => Promise.resolve((async () => {
        try {
          const text = await request.text();
          const parsed = parseDrawRequest(JSON.parse(text || '{}'));
          const sessionId = new URL(request.url).searchParams.get('sessionId') ?? undefined;
          const job = manager.submit(parsed, sessionId);
          return Response.json({ jobId: job.id, phase: job.phase }, { headers: { 'cache-control': 'no-store' } });
        } catch (err) {
          return Response.json({ error: String((err as Error)?.message ?? err) }, { status: 400, headers: { 'cache-control': 'no-store' } });
        }
      })()),
    }) as unknown as () => void);
    disposers.push(ctx.connection.fetch.register({
      path: DRAW_STATUS_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: (request: Request) => {
        const jobId = new URL(request.url).searchParams.get('jobId') ?? '';
        const job = manager.status(jobId);
        return Promise.resolve(Response.json(job ?? { error: 'job not found', phase: 'failed' }, { headers: { 'cache-control': 'no-store' } }));
      },
    }) as unknown as () => void);
    disposers.push(ctx.connection.fetch.register({
      path: DRAW_HISTORY_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: (request: Request) => {
        const sessionId = new URL(request.url).searchParams.get('sessionId') ?? undefined;
        const items = collectDrawHistory(ctx, sessionId ?? undefined);
        return Promise.resolve(Response.json({ items }, { headers: { 'cache-control': 'no-store' } }));
      },
    }) as unknown as () => void);
    ctx.provide('researchDraw', manager);
  }

  ctx.logger?.(name).info('%s: %s — 右侧栏科研绘图（enabled=%s; local=%s; %d routes）',
    name, enabled ? '挂载' : '禁用', String(enabled), defaultLocalConfig().bin, enabled ? 4 : 1);
  return () => { for (const d of disposers) d(); manager.dispose(); };
}
