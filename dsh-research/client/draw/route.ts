// client/draw/route.ts — 右侧栏「科研绘图」Tab 与 host 之间的数据契约。
//
// host 侧（src/plugin-draw.ts）在 connection 鉴权栅栏内挂 4 条 route：
//   POST /api/research.draw.generate    （provider + 参数 + 垫图 base64）→ { jobId, phase }
//   GET  /api/research.draw.status?jobId= → { phase, progress?, logTail, result?, artifactId }
//   GET  /api/research.draw.config      → { enabled, providers, 比例/分辨率/画质表, 默认值, ... }
//   GET  /api/research.draw.history?sessionId= → { items: 最近绘图记录 }
// 本文件只含 client 侧常量与解析函数；路径常量与 host 侧同名常量保持一致
// （host 是 Node 侧、client 走浏览器 bundle，两侧不共享模块图）。

/** Host 侧鉴权 route 的绝对路径（进 connection 鉴权栅栏）。 */
export const DRAW_GENERATE_PATH = '/api/research.draw.generate'
export const DRAW_STATUS_PATH = '/api/research.draw.status'
export const DRAW_CONFIG_PATH = '/api/research.draw.config'
export const DRAW_HISTORY_PATH = '/api/research.draw.history'
export const DRAW_DEBUG_PATH = '/api/research.draw.debug'

/** 浏览器侧 document-relative 形式（与 ui-deliverables 的 CHANGED_FILES_ROUTE 同款约定）。 */
export const DRAW_GENERATE_ROUTE = DRAW_GENERATE_PATH.slice(1)
export const DRAW_STATUS_ROUTE = DRAW_STATUS_PATH.slice(1)
export const DRAW_CONFIG_ROUTE = DRAW_CONFIG_PATH.slice(1)
export const DRAW_HISTORY_ROUTE = DRAW_HISTORY_PATH.slice(1)
export const DRAW_DEBUG_ROUTE = DRAW_DEBUG_PATH.slice(1)

/** 会话维度：传入 sessionId 时 URL 带上（history / generate 记录按会话过滤/注解）。 */
export function drawUrl(route: string, sessionId?: string, extra?: Record<string, string>): string {
  const params = new URLSearchParams()
  if (sessionId) params.set('sessionId', sessionId)
  if (extra) for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v)
  const qs = params.toString()
  return qs ? `${route}?${qs}` : route
}

export function drawGenerateUrl(sessionId?: string): string {
  return drawUrl(DRAW_GENERATE_ROUTE, sessionId)
}
export function drawStatusUrl(jobId: string): string {
  return drawUrl(DRAW_STATUS_ROUTE, undefined, { jobId })
}
export function drawConfigUrl(): string {
  return DRAW_CONFIG_ROUTE
}
export function drawHistoryUrl(sessionId?: string): string {
  return drawUrl(DRAW_HISTORY_ROUTE, sessionId)
}
export function drawDebugUrl(): string {
  return DRAW_DEBUG_ROUTE
}

// ---------------------------------------------------------------------------
// 配置视图（/api/research.draw.config 返回形状）
// ---------------------------------------------------------------------------

export interface DrawConfigView {
  enabled: boolean
  providers: Array<'local' | 'api'>
  aspects: string[]
  resolutions: string[]
  qualities: string[]
  qualitySteps: Record<string, number>
  resolutionLongEdge: Record<string, number>
  defaults: {
    aspect: string
    resolution: string
    quality: string
    provider: 'local' | 'api'
    steps: number
    seed: number
    width: number
    height: number
    outputRoot: string
    editPresets: { style: { label: string; strength: number }; content: { label: string; strength: number } }
  }
  outputRoot: string
  sizePolicy: 'exact-then-fallback' | 'standard-only'
  local: { bin: string; model: string; defaultSteps: number; defaultSeed: number }
  api: { baseURL: string; modelId: string; keyProvided: boolean }
  thumbMax: number
  maxRefBytes: number
}

/** 兜底配置（host 拉取失败 / 未启用时用于空渲染或降级展示）。 */
export function fallbackDrawConfig(): DrawConfigView {
  return {
    enabled: false,
    providers: [],
    aspects: ['16:9', '21:10', '21:9', '16:10', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16'],
    resolutions: ['1K', '2K', '4K'],
    qualities: ['low', 'medium', 'high'],
    qualitySteps: { low: 20, medium: 30, high: 50 },
    resolutionLongEdge: { '1K': 1024, '2K': 2048, '4K': 4096 },
    defaults: {
      aspect: '16:9', resolution: '2K', quality: 'high', provider: 'local',
      steps: 50, seed: 42, width: 0, height: 0, outputRoot: '~/Downloads/outputs',
      editPresets: { style: { label: '风格参考', strength: 0.4 }, content: { label: '内容参考', strength: 0.7 } },
    },
    outputRoot: '~/Downloads/outputs',
    sizePolicy: 'exact-then-fallback',
    local: { bin: 'mflux-generate-qwen-2.1', model: '~/llm/models/Qwen-Image-2.1', defaultSteps: 50, defaultSeed: 42 },
    api: { baseURL: '', modelId: '', keyProvided: false },
    thumbMax: 1024,
    maxRefBytes: 20 * 1024 * 1024,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 宽松校验 host 返回的配置；不符形状的字段回落默认。 */
export function parseDrawConfig(value: unknown): DrawConfigView {
  const d = fallbackDrawConfig()
  if (!isRecord(value)) return d
  const enabled = typeof value.enabled === 'boolean' ? value.enabled : d.enabled
  const defaults = isRecord(value.defaults) ? value.defaults : {}
  return {
    enabled,
    providers: Array.isArray(value.providers) ? value.providers.filter((x): x is 'local' | 'api' => x === 'local' || x === 'api') : d.providers,
    aspects: Array.isArray(value.aspects) ? value.aspects.map(String) : d.aspects,
    resolutions: Array.isArray(value.resolutions) ? value.resolutions.map(String) : d.resolutions,
    qualities: Array.isArray(value.qualities) ? value.qualities.map(String) : d.qualities,
    qualitySteps: isRecord(value.qualitySteps) ? Object.fromEntries(Object.entries(value.qualitySteps).map(([k, v]) => [k, Number(v) || 0])) : d.qualitySteps,
    resolutionLongEdge: isRecord(value.resolutionLongEdge) ? Object.fromEntries(Object.entries(value.resolutionLongEdge).map(([k, v]) => [k, Number(v) || 0])) : d.resolutionLongEdge,
    defaults: {
      aspect: typeof defaults.aspect === 'string' ? defaults.aspect : d.defaults.aspect,
      resolution: typeof defaults.resolution === 'string' ? defaults.resolution : d.defaults.resolution,
      quality: typeof defaults.quality === 'string' ? defaults.quality : d.defaults.quality,
      provider: defaults.provider === 'api' ? 'api' : 'local',
      steps: typeof defaults.steps === 'number' ? defaults.steps : d.defaults.steps,
      seed: typeof defaults.seed === 'number' ? defaults.seed : d.defaults.seed,
      width: typeof defaults.width === 'number' ? defaults.width : d.defaults.width,
      height: typeof defaults.height === 'number' ? defaults.height : d.defaults.height,
      outputRoot: typeof defaults.outputRoot === 'string' ? defaults.outputRoot : d.defaults.outputRoot,
      editPresets: {
        style: { label: '风格参考', strength: 0.4 },
        content: { label: '内容参考', strength: 0.7 },
      },
    },
    outputRoot: typeof value.outputRoot === 'string' ? value.outputRoot : d.outputRoot,
    sizePolicy: value.sizePolicy === 'standard-only' ? 'standard-only' : 'exact-then-fallback',
    local: {
      bin: isRecord(value.local) && typeof value.local.bin === 'string' ? value.local.bin : d.local.bin,
      model: isRecord(value.local) && typeof value.local.model === 'string' ? value.local.model : d.local.model,
      defaultSteps: isRecord(value.local) && typeof value.local.defaultSteps === 'number' ? value.local.defaultSteps : d.local.defaultSteps,
      defaultSeed: isRecord(value.local) && typeof value.local.defaultSeed === 'number' ? value.local.defaultSeed : d.local.defaultSeed,
    },
    api: {
      baseURL: isRecord(value.api) && typeof value.api.baseURL === 'string' ? value.api.baseURL : d.api.baseURL,
      modelId: isRecord(value.api) && typeof value.api.modelId === 'string' ? value.api.modelId : d.api.modelId,
      keyProvided: isRecord(value.api) && typeof value.api.keyProvided === 'boolean' ? value.api.keyProvided : d.api.keyProvided,
    },
    thumbMax: typeof value.thumbMax === 'number' ? value.thumbMax : d.thumbMax,
    maxRefBytes: typeof value.maxRefBytes === 'number' ? value.maxRefBytes : d.maxRefBytes,
  }
}

// ---------------------------------------------------------------------------
// 状态视图（/api/research.draw.status 返回形状）+ 解析
// ---------------------------------------------------------------------------

export interface DrawResultView {
  outputPath: string
  thumbnailBase64?: string
  width: number
  height: number
  provider: string
  model: string
  mode: string
  size: string
  steps: number
  seed: number
}

export interface DrawJobView {
  id: string
  createdAt: string
  phase: 'queued' | 'running' | 'succeeded' | 'failed'
  progress?: number
  logTail: string[]
  error?: string
  result?: DrawResultView
  artifactId?: string
}

/** 宽松校验 host 返回的 job 视图；不符形状的字段丢弃。 */
export function parseDrawJob(value: unknown): DrawJobView | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null
  const phase = value.phase === 'succeeded' || value.phase === 'failed' || value.phase === 'running' ? value.phase : 'queued'
  const result = isRecord(value.result) ? value.result as Record<string, unknown> : undefined
  let parsedResult: DrawResultView | undefined
  if (result && typeof result.outputPath === 'string') {
    parsedResult = {
      outputPath: result.outputPath,
      thumbnailBase64: typeof result.thumbnailBase64 === 'string' ? result.thumbnailBase64 : undefined,
      width: typeof result.width === 'number' ? result.width : 0,
      height: typeof result.height === 'number' ? result.height : 0,
      provider: typeof result.provider === 'string' ? result.provider : '',
      model: typeof result.model === 'string' ? result.model : '',
      mode: typeof result.mode === 'string' ? result.mode : 'txt2img',
      size: typeof result.size === 'string' ? result.size : '',
      steps: typeof result.steps === 'number' ? result.steps : 0,
      seed: typeof result.seed === 'number' ? result.seed : 0,
    }
  }
  return {
    id: value.id,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
    phase,
    progress: typeof value.progress === 'number' ? value.progress : undefined,
    logTail: Array.isArray(value.logTail) ? value.logTail.filter((x): x is string => typeof x === 'string') : [],
    error: typeof value.error === 'string' ? value.error : undefined,
    result: parsedResult,
    artifactId: typeof value.artifactId === 'string' ? value.artifactId : undefined,
  }
}

// ---------------------------------------------------------------------------
// 历史视图（/api/research.draw.history 返回形状）+ 解析
// ---------------------------------------------------------------------------

export interface DrawHistoryItem {
  artifactId: string
  title: string
  createdAt: string
  outputPath?: string
  prompt?: string
  provider?: string
  model?: string
  size?: string
  mode?: string
}

export function parseDrawHistory(value: unknown): DrawHistoryItem[] {
  if (!isRecord(value) || !Array.isArray(value.items)) return []
  const out: DrawHistoryItem[] = []
  for (const item of value.items) {
    if (!isRecord(item) || typeof item.artifactId !== 'string') continue
    out.push({
      artifactId: item.artifactId,
      title: typeof item.title === 'string' ? item.title : '',
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
      outputPath: typeof item.outputPath === 'string' ? item.outputPath : undefined,
      prompt: typeof item.prompt === 'string' ? item.prompt : undefined,
      provider: typeof item.provider === 'string' ? item.provider : undefined,
      model: typeof item.model === 'string' ? item.model : undefined,
      size: typeof item.size === 'string' ? item.size : undefined,
      mode: typeof item.mode === 'string' ? item.mode : undefined,
    })
  }
  return out
}
