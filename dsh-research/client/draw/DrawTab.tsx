/**
 * DrawTab.tsx — 右侧栏「科研绘图」面板 body（stage two）。
 *
 * 与「TRIZ 发明原理」面板同机制：打开即拉取 host 的 /api/research.draw.config，
 * 渲染可调参数（后端选择 / 比例 / 分辨率 / 画质 / 高级折叠 / 输出目录 / 1 张垫图）；
 * 提交 POST /api/research.draw.generate（provider + 参数 + 垫图 base64）→ 轮询
 * /api/research.draw.status?jobId= → 预览缩略图 + 输出路径；会话级历史卡片
 * 从 /api/research.draw.history?sessionId= 拉取（写 artifact 的 draw: note，重启后仍可列出）。
 *
 * 数据经 host connection 鉴权栅栏提供，浏览器端用相对路径 fetch（同源 cookie 认证）。
 * 本组件有意零额外运行时依赖：只用 react（useState/useEffect/useRef + JSX），样式走内联。
 */
import { Component, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  drawConfigUrl, drawDebugUrl, drawDeleteUrl, drawGenerateUrl, drawHistoryUrl, drawStatusUrl,
  parseDrawConfig, parseDrawHistory, parseDrawJob,
  type DrawConfigView, type DrawHistoryItem,
} from './route.ts'

/** 本 type's body 的合成 props：框架 shares（useTabInfo/sessionId）+ 无自定义注入面。 */
export type DrawTabProps = PropsRuntime<'sidebar.right.pane.tab'>

type ReadyState =
  | { phase: 'loading' }
  | { phase: 'disabled' }
  | { phase: 'error' }
  | { phase: 'ready'; cfg: DrawConfigView }

type RunState =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'running'; jobId: string; progress?: number; logTail: string[] }
  | { phase: 'done'; result: import('./route.ts').DrawResultView; artifactId?: string }
  | { phase: 'failed'; error: string; logTail: string[] }


// ---------------------------------------------------------------------------
// 白屏可见性（2026-10-21 用户反馈「点生成后白屏、不知道发生什么」）
//   1. postDebug() —— 浏览器端任何步骤/错误转发到后端 /api/research.draw.debug，
//      由 host 打印到 `dsh research` 终端 → CLI 可见；
//   2. 全局 error / unhandledrejection 兜底 —— 未捕获异常也上报 CLI；
//   3. DrawErrorBoundary —— 面板渲染抛错不白屏，就地显示错误 + 上报 CLI；
//   4. 日期格式化兜底 —— 无效日期不抛 RangeError（防渲染崩溃）。
// 极端兜底：白屏若仍复现，终端会看到 [dsh-research-draw] 开头的具体错误行。
// ---------------------------------------------------------------------------

function postDebug(level: 'log' | 'warn' | 'error', msg: string, meta?: unknown): void {
  try {
    void fetch(drawDebugUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level,
        msg,
        meta: meta === undefined ? undefined : (typeof meta === 'string' ? meta : JSON.stringify(meta)),
      }),
    })
  } catch { /* 上报失败静默，不影响面板 */ }
}

function formatDate(value: string): string {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? (value || '—') : d.toLocaleString()
}

// 全局兜底：浏览器里任何未捕获异常/未处理 rejection → 转发 CLI（只装一次）。
if (typeof window !== 'undefined' && !(window as { __dshDrawDebugInstalled?: boolean }).__dshDrawDebugInstalled) {
  ;(window as { __dshDrawDebugInstalled?: boolean }).__dshDrawDebugInstalled = true
  window.addEventListener('error', (e) => {
    const msg = `[uncaught] ${String(e.message ?? '')} @ ${String(e.filename ?? '')}:${e.lineno ?? ''}:${e.colno ?? ''}`
    postDebug('error', msg)
    console.error('[dsh-research-draw]', msg)
  })
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as unknown
    const msg = `[unhandledrejection] ${r instanceof Error ? (r.stack ?? r.message) : String(r)}`
    postDebug('error', msg)
    console.error('[dsh-research-draw]', msg)
  })
}

/** 面板级错误边界：渲染抛错不白屏，就地显示错误并上报 CLI。 */
class DrawErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error): { error: Error } { return { error } }
  componentDidCatch(error: Error): void {
    postDebug('error', `[tab-render] ${error.message}\n${error.stack ?? ''}`)
    console.error('[dsh-research-draw] tab render error:', error)
  }
  render(): ReactNode {
    if (this.state.error) {
      return (
        <div style={{ padding: 12, color: '#dc2626', fontSize: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
          <p style={{ fontWeight: 600, margin: '0 0 6px' }}>科研绘图面板渲染出错（已上报 CLI/终端）</p>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, fontSize: 11 }}>{String(this.state.error.stack ?? this.state.error)}</pre>
          <button type="button" style={{ marginTop: 8 }} onClick={() => this.setState({ error: null })}>重试</button>
        </div>
      )
    }
    return this.props.children
  }
}

/** 轮询最大连续网络失败次数（防「生成中…」永久卡死）。 */
const MAX_POLL_RETRY = 6
const styles = {
  root: {
    boxSizing: 'border-box' as const,
    width: '100%',
    minWidth: 0,
    padding: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
    fontFamily: 'var(--ds-font-family, system-ui, sans-serif)',
    color: 'var(--dsw-alias-label-primary, #20242c)',
    fontSize: '12px',
    lineHeight: '1.5',
  },
  header: { fontSize: '13px', fontWeight: 600, margin: 0 },
  hint: { color: 'var(--dsw-alias-label-tertiary, #6b7280)', fontSize: '11px', margin: 0 },
  label: { display: 'flex', flexDirection: 'column' as const, gap: '4px', fontSize: '11px', color: 'var(--dsw-alias-label-secondary, #4b5563)' },
  segment: { display: 'flex', flexWrap: 'wrap' as const, gap: '4px' },
  segBtn: (active: boolean) => ({
    border: '0.5px solid var(--dsw-alias-border-l2, #e5e7eb)',
    borderRadius: '8px',
    padding: '2px 8px',
    fontSize: '11px',
    cursor: 'pointer' as const,
    background: active ? 'var(--dsw-alias-state-business-primary, #4f46e5)' : 'var(--dsw-alias-bg-layer-1, #ffffff)',
    color: active ? '#fff' : 'var(--dsw-alias-label-secondary, #4b5563)',
  }),
  input: {
    border: '0.5px solid var(--dsw-alias-border-l2, #e5e7eb)',
    borderRadius: '8px',
    padding: '5px 8px',
    fontSize: '12px',
    width: '100%',
    boxSizing: 'border-box' as const,
    background: 'var(--dsw-alias-bg-layer-1, #ffffff)',
    color: 'inherit',
  },
  textarea: {
    border: '0.5px solid var(--dsw-alias-border-l2, #e5e7eb)',
    borderRadius: '8px',
    padding: '6px 8px',
    fontSize: '12px',
    width: '100%',
    minHeight: '64px',
    boxSizing: 'border-box' as const,
    resize: 'vertical' as const,
    fontFamily: 'inherit',
    background: 'var(--dsw-alias-bg-layer-1, #ffffff)',
    color: 'inherit',
  },
  card: {
    border: '0.5px solid var(--dsw-alias-border-l2, #e5e7eb)',
    borderRadius: '10px',
    padding: '10px 12px',
    background: 'var(--dsw-alias-bg-layer-1, #ffffff)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  cardTitle: { fontWeight: 600, margin: 0, fontSize: '12px', lineHeight: '1.4' },
  button: (primary: boolean) => ({
    border: 'none',
    borderRadius: '8px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer' as const,
    background: primary ? 'var(--dsw-alias-state-business-primary, #4f46e5)' : 'var(--dsw-alias-interactive-bg-subtle, #eef2ff)',
    color: primary ? '#fff' : 'var(--dsw-alias-state-business-primary, #4f46e5)',
  }),
  img: { maxWidth: '100%', borderRadius: '8px', border: '0.5px solid var(--dsw-alias-border-l2, #e5e7eb)' },
  mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '10px', wordBreak: 'break-all' as const, margin: 0 },
  empty: { color: 'var(--dsw-alias-label-tertiary, #6b7280)', fontSize: '11px', margin: 0 },
  errored: { color: 'var(--dsw-alias-state-error-primary, #dc2626)', fontSize: '11px', margin: 0 },
  details: { borderTop: '0.5px solid var(--dsw-alias-border-l2, #e5e7eb)', paddingTop: '8px', display: 'flex', flexDirection: 'column' as const, gap: '6px' },
  progressBar: { height: '6px', borderRadius: '99px', background: 'var(--dsw-alias-interactive-bg-subtle, #eef2ff)', overflow: 'hidden' as const },
  progressFill: (width: string) => ({ height: '100%', borderRadius: '99px', background: 'var(--dsw-alias-state-business-primary, #4f46e5)', width }),
} as const

/** 单行表单输入。 */
function Field({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <label style={styles.label}>
      <span>{label}</span>
      {children}
    </label>
  )
}

function Segments<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }): ReactNode {
  return (
    <div style={styles.segment}>
      {options.map((o) => (
        <button key={o} type="button" style={styles.segBtn(o === value)} onClick={() => onChange(o)}>{o}</button>
      ))}
    </div>
  )
}

/**
 * 面板 body：挂载即拉取配置与历史，渲染「生成器 + 会话级历史」。
 * @param props - 框架 shares；本面板只用 useTabInfo（tab 生命周期 signal 做取数取消）。
 */
export function DrawTab(props: DrawTabProps): ReactNode {
  const { useTabInfo } = props
  const tabInfo = typeof useTabInfo === 'function' ? useTabInfo() : undefined
  const signal = tabInfo?.tab?.signal
  // 会话标准注入：当前会话 id（ui-session 合并进 SessionStandardProps）——
  // 右侧栏面板是会话作用域，用它按会话过滤绘图历史（重启后随会话历史恢复）。
  const sessionId = (props as { sessionId?: string }).sessionId

  const [cfgState, setCfgState] = useState<ReadyState>({ phase: 'loading' })
  const [history, setHistory] = useState<import('./route.ts').DrawHistoryItem[]>([])
  const [run, setRun] = useState<RunState>({ phase: 'idle' })
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)

  // 表单状态
  const [prompt, setPrompt] = useState('')
  const [provider, setProvider] = useState<'local' | 'api'>('local')
  const [mode, setMode] = useState<'txt2img' | 'edit'>('txt2img')
  const [aspect, setAspect] = useState('16:9')
  const [resolution, setResolution] = useState('2K')
  const [quality, setQuality] = useState('high')
  const [steps, setSteps] = useState('')
  const [seed, setSeed] = useState('')
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [guidance, setGuidance] = useState('')
  const [quantize, setQuantize] = useState('')
  const [outputDir, setOutputDir] = useState('')
  // api 模式字段
  const [apiBaseURL, setApiBaseURL] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiModel, setApiModel] = useState('')
  // 垫图（v1 仅 local）
  const [refData, setRefData] = useState('')
  const [refName, setRefName] = useState('')
  const [editPreset, setEditPreset] = useState<'style' | 'content'>('style')
  const [editStrength, setEditStrength] = useState(0.4)

  const pollTimer = useRef<number | undefined>(undefined)
  const runningRef = useRef<{ jobId: string } | null>(null)

  // 拉取配置 + 历史（含 tab 失活取消）
  useEffect(() => {
    let alive = true
    const controller = new AbortController()
    const abort = (): void => { controller.abort() }
    signal?.addEventListener('abort', abort, { once: true })
    void (async () => {
      try {
        const configRes = await fetch(drawConfigUrl(), { signal: controller.signal })
        const cfg = parseDrawConfig(configRes.ok ? await configRes.json() : null)
        if (!alive) return
        if (!cfg.enabled) { setCfgState({ phase: 'disabled' }); return }
        setCfgState({ phase: 'ready', cfg })
        // 用 host 默认值初始化表单（仅一次）
        setAspect((prev) => prev === '16:9' ? cfg.defaults.aspect : prev)
        setResolution((prev) => prev === '2K' ? cfg.defaults.resolution : prev)
        setQuality((prev) => prev === 'high' ? cfg.defaults.quality : prev)
        setSteps(String(cfg.defaults.steps))
        setSeed(String(cfg.defaults.seed))
        setOutputDir(cfg.defaults.outputRoot)
        setEditStrength(cfg.defaults.editPresets.style.strength)
        if (cfg.api.baseURL) setApiBaseURL(cfg.api.baseURL)
        if (cfg.api.modelId) setApiModel(cfg.api.modelId)
      } catch {
        postDebug('error', '[config] 拉取科研绘图配置失败/数据源不可用')
        if (alive) setCfgState({ phase: 'error' })
      }
    })()
    return () => {
      alive = false
      controller.abort()
      signal?.removeEventListener('abort', abort)
    }
  }, [signal])

  // 会话历史拉取（挂载 + 每次成功后刷新）
  const loadHistory = (): void => {
    void (async () => {
      try {
        const res = await fetch(drawHistoryUrl(sessionId))
        if (!res.ok) return
        setHistory(parseDrawHistory(await res.json()))
      } catch { postDebug('error', '[history] 拉取绘图历史失败（静默）') }
    })()
  }
  useEffect(() => { loadHistory() }, [sessionId])

  // 删除单条绘图记录（本地图片文件已丢失时的清理；archive 到历史，重启不再列出）
  const deleteRecord = (artifactId: string): void => {
    void (async () => {
      try {
        const res = await fetch(drawDeleteUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ artifactId }),
        })
        if (!res.ok) { postDebug('warn', `[delete] 删除失败 ${res.status}`); return }
        postDebug('log', `[delete] 已删除记录 ${artifactId}`)
        setSelectedId((prev) => (prev === artifactId ? undefined : prev))
        loadHistory()
      } catch (err) {
        postDebug('error', `[delete] 异常: ${String((err as Error)?.message ?? err)}`)
      }
    })()
  }

  // 清空本会话全部绘图记录（仅移除记录与本地缩略图展示，不删图片文件本身）
  const clearSessionHistory = (): void => {
    if (!sessionId) return
    if (!window.confirm(`确定清除本会话全部 ${history.length} 条绘图记录？
仅移除记录，不会删除本地图片文件。`)) return
    void (async () => {
      try {
        const res = await fetch(drawDeleteUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        })
        if (!res.ok) { postDebug('warn', `[delete] 清空失败 ${res.status}`); return }
        postDebug('log', `[delete] 已清空会话 ${sessionId} 记录`)
        setSelectedId(undefined)
        loadHistory()
      } catch (err) {
        postDebug('error', `[delete-clear] 异常: ${String((err as Error)?.message ?? err)}`)
      }
    })()
  }

  // 从历史记录回填表单重新生成（提示词回填 + 回到生成器 + 回顶）
  // 注：edit 垫图原图未持久化，无法还原 → 统一按 txt2img 重新生成。
  const regenerate = (h: DrawHistoryItem): void => {
    if (h.prompt) setPrompt(h.prompt)
    if (h.provider === 'api') setProvider('api')
    const wasEdit = h.mode === 'edit'
    setMode('txt2img')
    setRun({ phase: 'idle' })
    setSelectedId(undefined)
    window.scrollTo?.({ top: 0, behavior: 'smooth' })
    postDebug('log', `[regen] 历史 ${h.artifactId} 提示词已回填${wasEdit ? '（原为 edit，垫图不可还原 → 按 txt2img）' : ''}，请确认后再次生成`)
  }

  // 轮询直到完成/失败（含白屏/卡死防御：状态不可解析或连续失败判失败，不上报 CLI 的每个 tick）
  const poll = (jobId: string): void => {
    runningRef.current = { jobId }
    let retryCount = 0
    const tick = async (): Promise<void> => {
      if (runningRef.current?.jobId !== jobId) return
      try {
        const res = await fetch(drawStatusUrl(jobId))
        if (!res.ok) return
        const raw = (await res.json()) as Record<string, unknown>
        const view = parseDrawJob(raw)
        if (!view || runningRef.current?.jobId !== jobId) {
          // 状态不可解析（如 job not found / 非预期 JSON）：不再无限轮询，直接判失败
          const msg = typeof raw?.error === 'string' && raw.error ? raw.error : 'job 状态解析失败'
          runningRef.current = null
          postDebug('error', `[status] job=${jobId} ${msg}`)
          setRun({ phase: 'failed', error: msg, logTail: [] })
          return
        }
        if (view.phase === 'succeeded' && view.result) {
          runningRef.current = null
          postDebug('log', `[done] job=${jobId} → ${view.result.outputPath}`)
          setRun({ phase: 'done', result: view.result, artifactId: view.artifactId })
          loadHistory()
          return
        }
        if (view.phase === 'failed') {
          runningRef.current = null
          postDebug('error', `[failed] job=${jobId} ${view.error ?? '生成失败'}`)
          setRun({ phase: 'failed', error: view.error ?? '生成失败', logTail: view.logTail })
          return
        }
        if (view.phase === 'queued' || view.phase === 'running') {
          retryCount = 0
          setRun({ phase: 'running', jobId, progress: view.progress, logTail: view.logTail })
          pollTimer.current = window.setTimeout(() => void tick(), 2500)
        }
      } catch (err) {
        // 拉取失败：短暂重试（连续失败超上限判失败，防永久卡死）
        retryCount += 1
        if (retryCount > MAX_POLL_RETRY) {
          runningRef.current = null
          const msg = `轮询失败 ${retryCount} 次：${String((err as Error)?.message ?? err)}`
          postDebug('error', `[status] job=${jobId} ${msg}`)
          setRun({ phase: 'failed', error: msg, logTail: [] })
          return
        }
        if (runningRef.current?.jobId === jobId) pollTimer.current = window.setTimeout(() => void tick(), 3000)
      }
    }
    void tick()
  }

  const canGenerate = cfgState.phase === 'ready' && prompt.trim().length > 0 && run.phase !== 'running' && run.phase !== 'submitting'

  const generate = (): void => {
    if (!canGenerate) return
    const cfg = cfgState.phase === 'ready' ? cfgState.cfg : undefined
    const body: Record<string, unknown> = {
      prompt,
      provider,
      mode,
      aspect,
      resolution,
      quality,
    }
    if (steps.trim()) body.steps = Number(steps)
    if (seed.trim()) body.seed = Math.floor(Number(seed))
    if (width.trim()) body.width = Number(width)
    if (height.trim()) body.height = Number(height)
    if (negativePrompt.trim()) body.negativePrompt = negativePrompt
    if (guidance.trim()) body.guidance = Number(guidance)
    if (quantize.trim()) body.quantize = Number(quantize)
    if (outputDir.trim()) body.outputDir = outputDir
    if (provider === 'api') {
      if (apiBaseURL.trim()) body.apiBaseURL = apiBaseURL
      if (apiKey.trim()) body.apiKey = apiKey
      if (apiModel.trim()) body.apiModel = apiModel
    }
    if (mode === 'edit') {
      if (!refData) return
      body.imageData = refData
      if (refName) body.imageName = refName
      body.editPreset = editPreset
      body.editStrength = editStrength
    }
    setRun({ phase: 'submitting' })
    postDebug('log', `[generate] 提交 provider=${provider} mode=${mode} ${aspect}/${resolution}/${quality} session=${sessionId ?? '∅'}`)
    void (async () => {
      try {
        const res = await fetch(drawGenerateUrl(sessionId), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const json = (await res.json()) as { jobId?: string; error?: string; phase?: string }
        if (!res.ok || !json.jobId) {
          const msg = json.error ?? `提交失败 (${res.status})`
          postDebug('error', `[generate] 提交被拒：${msg}`)
          setRun({ phase: 'failed', error: msg, logTail: [] })
          return
        }
        postDebug('log', `[generate] 已受理 job=${json.jobId}`)
        setRun({ phase: 'running', jobId: json.jobId, logTail: [] })
        poll(json.jobId)
      } catch (err) {
        postDebug('error', `[generate] 网络/解析异常: ${String((err as Error)?.message ?? err)}`)
        setRun({ phase: 'failed', error: String((err as Error)?.message ?? err), logTail: [] })
      }
    })()
  }

  const onPickRef = (file: File | undefined): void => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (): void => {
      const data = typeof reader.result === 'string' ? reader.result : ''
      setRefData(data)
      setRefName(file.name)
    }
    reader.readAsDataURL(file)
  }

  const cfg = cfgState.phase === 'ready' ? cfgState.cfg : undefined
  const useEdit = mode === 'edit' && provider === 'local'

  return (
    <DrawErrorBoundary>
    <div style={styles.root}>
      <p style={styles.header}>科研绘图</p>
      <p style={styles.hint}>
        生成/编辑科研配图：Qwen-Image-2.1（本机 mflux，非驻留）或 OpenAI 兼容 API。
        输出固定到 <code>images/image-YYYYMMDDHHmmSS.png</code>，记录随会话持久化、可用于 paper 报告配图（research_draw）。
      </p>
      {cfgState.phase === 'loading' && <p style={styles.empty}>加载中…</p>}
      {cfgState.phase === 'error' && <p style={styles.errored}>科研绘图数据源暂不可用，或未被启用。</p>}
      {cfgState.phase === 'disabled' && <p style={styles.empty}>科研绘图未启用（host research-draw config.enabled=false）。</p>}

      {cfg && (
        <>
          <Field label="提示词（科研绘图）">
            <textarea style={styles.textarea} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="例：科研绘图：BGP 劫持检测时序图，横轴时间，纵轴置信度，冷色调，标注 RPKI 事件" />
          </Field>

          <Field label="后端 / 模型">
            <Segments
              options={(['local', 'api'] as const)}
              value={provider}
              onChange={(v) => { setProvider(v); if (v === 'api') setMode('txt2img') }}
            />
          </Field>
          {provider === 'local' && (
            <p style={styles.hint}>local = 本机 mflux 调 {cfg.local.model}（非驻留、并发 1，支持 1 张垫图 edit）。</p>
          )}
          {provider === 'api' && (
            <div style={styles.details}>
              <Field label="API Base URL（OpenAI 兼容）">
                <input style={styles.input} value={apiBaseURL} onChange={(e) => setApiBaseURL(e.target.value)} placeholder="https://…/v1" />
              </Field>
              <Field label="API Key（支持 ${VAR} 环境变量引用）">
                <input style={styles.input} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={cfg.api.keyProvided ? '已配置（可留空）' : 'sk-… / ${MY_KEY}'} />
              </Field>
              <Field label="模型 id">
                <input style={styles.input} value={apiModel} onChange={(e) => setApiModel(e.target.value)} placeholder={cfg.api.modelId || 'qwen-image-2.1'} />
              </Field>
              <p style={styles.hint}>api 模式暂不支持垫图 v1；任意比例先发精确 WxH，失败回退最近标准档。</p>
            </div>
          )}

          {provider === 'local' && (
            <Field label="模式">
              <Segments
                options={(['txt2img', 'edit'] as const)}
                value={mode}
                onChange={(v) => setMode(v)}
              />
            </Field>
          )}

          {useEdit && (
            <div style={styles.details}>
              <Field label="参考图（1 张，v1 仅 local）">
                <input
                  type="file"
                  accept="image/*"
                  style={styles.input}
                  onChange={(e) => onPickRef(e.target.files?.[0])}
                />
              </Field>
              {refData && (
                <img style={styles.img} src={refData} alt="参考图预览" />
              )}
              {refData && (
                <button type="button" style={styles.button(false)} onClick={() => { setRefData(''); setRefName('') }}>
                  清除参考图
                </button>
              )}
              {refData && (
                <>
                  <Field label="参考语义">
                    <Segments
                      options={(['style', 'content'] as const)}
                      value={editPreset}
                      onChange={(v) => { setEditPreset(v); setEditStrength(v === 'style' ? (cfg.defaults.editPresets.style.strength ?? 0.4) : (cfg.defaults.editPresets.content.strength ?? 0.7)) }}
                    />
                  </Field>
                  <Field label={`强度：${Math.round(editStrength * 100)}%`}>
                    <input type="range" min={0.3} max={1} step={0.05} value={editStrength} onChange={(e) => setEditStrength(Number(e.target.value))} style={{ width: '100%' }} />
                  </Field>
                </>
              )}
              {!refData && <p style={styles.hint}>上传 1 张参考图以启用 edit（风格 0.4 / 内容 0.7）。</p>}
            </div>
          )}

          <Field label="比例（默认 16:9）">
            <Segments
              options={(cfg.aspects as readonly string[])}
              value={aspect}
              onChange={(v) => setAspect(v as string)}
            />
          </Field>
          <Field label="分辨率（长边，默认 2K）">
            <Segments
              options={(cfg.resolutions as readonly string[])}
              value={resolution}
              onChange={(v) => setResolution(v as string)}
            />
          </Field>
          <Field label="画质（步数：低20/中30/高50，默认 高）">
            <Segments
              options={(cfg.qualities as readonly string[])}
              value={quality}
              onChange={(v) => setQuality(v as string)}
            />
          </Field>

          <details>
            <summary style={{ fontSize: '11px', color: 'var(--dsw-alias-state-business-primary, #4f46e5)', cursor: 'pointer' }}>高级参数</summary>
            <div style={styles.details}>
              <Field label="推理步数（覆盖画质档）">
                <input style={styles.input} type="number" min={1} max={200} value={steps} onChange={(e) => setSteps(e.target.value)} />
              </Field>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
                <Field label="随机种子">
                  <input style={styles.input} type="number" value={seed} onChange={(e) => setSeed(e.target.value)} />
                </Field>
                <button type="button" style={styles.button(false)} onClick={() => setSeed(String(Math.floor(Math.random() * 1_000_000_000)))}>随机</button>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <Field label="宽覆盖">
                  <input style={styles.input} type="number" value={width} onChange={(e) => setWidth(e.target.value)} />
                </Field>
                <Field label="高覆盖">
                  <input style={styles.input} type="number" value={height} onChange={(e) => setHeight(e.target.value)} />
                </Field>
              </div>
              <Field label="负向提示">
                <input style={styles.input} value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} />
              </Field>
              <div style={{ display: 'flex', gap: '6px' }}>
                <Field label="guidance（可选）">
                  <input style={styles.input} type="number" value={guidance} onChange={(e) => setGuidance(e.target.value)} />
                </Field>
                <Field label="quantize（可选）">
                  <input style={styles.input} type="number" value={quantize} onChange={(e) => setQuantize(e.target.value)} />
                </Field>
              </div>
            </div>
          </details>

          <Field label="输出目录（固定追加 images/ 子目录）">
            <input style={styles.input} value={outputDir} onChange={(e) => setOutputDir(e.target.value)} placeholder={cfg.outputRoot} />
          </Field>

          <button type="button" style={styles.button(true)} disabled={!canGenerate || (useEdit && !refData)} onClick={generate}>
            {run.phase === 'submitting' ? '提交中…' : (run.phase === 'running' ? `生成中… ${run.progress ? Math.round(run.progress * 100) : ''}%` : '生成')}
          </button>

          {run.phase === 'running' && (
            <div style={styles.card}>
              <p style={styles.cardTitle}>生成中…</p>
              <div style={styles.progressBar}>
                <div style={styles.progressFill(`${Math.round((run.progress ?? 0) * 100)}%`)} />
              </div>
              <p style={styles.mono}>jobId: {run.jobId}</p>
              {(run.logTail ?? []).length > 0 && (
                <div style={styles.mono}>
                  {(run.logTail ?? []).slice(-4).map((l, i) => <p key={`${run.jobId}-${i}`} style={{ ...styles.mono, margin: 0, whiteSpace: 'pre-wrap' }}>{l}</p>)}
                </div>
              )}
            </div>
          )}
          {run.phase === 'done' && (
            <div style={styles.card}>
              <p style={styles.cardTitle}>完成</p>
              {run.result.thumbnailBase64 && <img style={styles.img} src={run.result.thumbnailBase64} alt="生成结果预览" />}
              <p style={styles.mono}>{run.result.outputPath}</p>
              <p style={styles.hint}>{run.result.size} · {run.result.model} · steps={run.result.steps} · seed={run.result.seed}</p>
            </div>
          )}
          {run.phase === 'failed' && (
            <div style={styles.card}>
              <p style={{ ...styles.cardTitle, color: 'var(--dsw-alias-state-error-primary, #dc2626)' }}>失败</p>
              <p style={styles.errored}>{run.error}</p>
              {(run.logTail ?? []).length > 0 && <div style={styles.mono}>{(run.logTail ?? []).slice(-4).map((l, i) => <p key={i} style={{ ...styles.mono, margin: 0 }}>{l}</p>)}</div>}
            </div>
          )}

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <p style={{ ...styles.cardTitle, margin: 0 }}>会话内历史（{history.length}）</p>
              {history.length > 0 && (
                <button type="button" style={styles.button(false)} onClick={clearSessionHistory}>清除历史</button>
              )}
            </div>
            {history.length === 0 && <p style={styles.empty}>还没有绘图记录（关闭后重启仍会保留，按会话过滤）。</p>}
            {history.map((h) => {
              const selected = selectedId === h.artifactId
              return (
                <section
                  key={h.artifactId}
                  style={{ ...styles.card, cursor: 'pointer', borderColor: selected ? 'var(--dsw-alias-state-business-primary, #4f46e5)' : 'var(--dsw-alias-border-l2, #e5e7eb)' }}
                  onClick={() => setSelectedId(selected ? undefined : h.artifactId)}
                >
                  <p style={styles.mono}>{h.title}</p>
                  {h.thumbBase64 && <img style={styles.img} src={h.thumbBase64} alt="历史预览" />}
                  {h.outputPath && <p style={styles.mono}>{h.outputPath}</p>}
                  <p style={styles.hint}>{h.size ?? ''}{h.model ? ` · ${h.model}` : ''} · {formatDate(h.createdAt)}</p>
                  {h.fileExists === false && (
                    <div style={{ borderTop: '0.5px solid var(--dsw-alias-border-l2, #e5e7eb)', paddingTop: '6px', display: 'flex', flexDirection: 'column' as const, gap: '6px' }}>
                      <p style={styles.errored}>本地图片文件已不存在 —— 可删除记录或重新生成</p>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button type="button" style={styles.button(false)} onClick={(e) => { e.stopPropagation(); deleteRecord(h.artifactId) }}>删除记录</button>
                        <button type="button" style={styles.button(false)} onClick={(e) => { e.stopPropagation(); regenerate(h) }}>重新生成</button>
                      </div>
                    </div>
                  )}
                  {selected && (
                    <div style={styles.details}>
                      {h.prompt && <p style={styles.mono}>提示词：{h.prompt}</p>}
                      <p style={styles.hint}>
                        {h.mode === 'edit' ? 'edit（垫图）' : 'txt2img'} · {h.size ?? ''}{h.provider ? ` · ${h.provider}` : ''}{h.model ? ` · ${h.model}` : ''}
                      </p>
                      <p style={styles.hint}>点击卡片可收起详情</p>
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        </>
      )}
    </div>
    </DrawErrorBoundary>
  )
}
