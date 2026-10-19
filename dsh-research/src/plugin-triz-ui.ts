// @basil/dsh-research/triz-ui — host 平面插件 8（右侧栏「TRIZ 发明原理」面板的数据源）。
//
// 阶段 8·B：用户在 Web UI 右侧栏要「一栏来解释最终结果用了 TRIZ 的什么发明原理」。
// 本插件不进 Research Loop，只为浏览器半边提供只读数据：在 connection 鉴权栅栏内
// 挂一条 GET route /api/research.triz.notes，从 researchCore.artifacts 过滤出
// research_triz 工具 / triz-auto 写入的 note（meta.source ∈ 三态、title 以 'triz: ' 开头），
// 按 createdAt 降序取最近 N 条，并回填 40 原理明细（no/name/summary/routingHint）
// 与逐行假说文本给 client（client/index.ts + client/TrizTab.tsx）渲染。
//
// 阶段 10（2026-10-19）：会话级过滤 + 生成步序展示。
//   - route 读 ?sessionId= → collectTrizNotes 按 meta.sessionId 过滤：只显示当前会话的
//     auto note + 无 sessionId 的兼容 note（research_triz 手动调用，历史全局语义保留）。
//   - TrizNoteView 增加 step / final：中间生成结果（step 非末步）与最终答案区分展示，
//     配合 triz-auto 的「本轮实质 step 逐段映射」。
//
// 分层：数据仍只认 Research Agent Policy——面板展示的每条原理与假说都是待核验
// Hypothesis（source=triz, confidence=0.5），UI 文案也如实标注，不做事实断言。
import type { Context } from '@deepseek-ai/cordis'
import type { Artifact } from './core/artifact-store.ts'
import { TRIZ_PRINCIPLES } from './triz/data.ts'
import type { ResearchCoreService } from './plugin-tools.ts'

export const name = 'dsh-research-triz-ui'

/** Web 鉴权 GET route（进 connection 鉴权栅栏；浏览器侧相对路径 = 去掉前导 '/'）。 */
export const TRIZ_NOTES_PATH = '/api/research.triz.notes'

/** 一次返回最多多少条 TRIZ 分析 note（最近 N 条；阶段 10 扩大以容纳中间生成结果的逐段映射）。 */
export const MAX_TRIZ_NOTES = 30

/** research_triz 工具写入 meta.source 的三态（具 TRIZ 语义的判定集合）。 */
export const TRIZ_SOURCES: readonly string[] = ['curated-matrix', 'heuristic-fallback', 'unresolved']

/** 需要的 host 服务：connection（route 注册）；researchCore 经 ctx.get 惰性读取。 */
export const inject = ['connection']

/** 一条候选发明原理的展示视图。 */
export interface TrizPrincipleView {
  no: number
  name: string
  summary: string
  routingHint: string
}

/** 一条 TRIZ 分析 note 的展示视图（给 client 的 JSON 形状）。 */
export interface TrizNoteView {
  artifactId: string
  title: string
  problem: string
  source: string
  /** 矛盾来源：tool（显式参数）/ extracted（文本规则提取）/ default（默认检测↔复杂度）。 */
  contradictionOrigin: string
  candidates: TrizPrincipleView[]
  hypotheses: string[]
  createdAt: string
  /** 生成步序（triz-auto 逐段映射才有）；缺省供 research_triz 手动 note 兼容。 */
  step?: number
  /** 是否该轮最终答案（末步）；中间生成结果为 false / 缺省未标注。 */
  final?: boolean
}

const PRINCIPLE_BY_NO = new Map<number, { no: number; name: string; summary: string; routingHint: string }>(
  TRIZ_PRINCIPLES.map((p) => [p.no, p]),
)

/** 判定一个 artifact 是否为 research_triz 工具 / triz-auto 写入的 TRIZ 分析 note。 */
export function isTrizArtifact(a: Artifact): boolean {
  return a.kind === 'note' && !a.archived && typeof a.meta?.source === 'string'
    && (TRIZ_SOURCES as readonly string[]).includes(a.meta.source as string)
    && a.title.startsWith('triz: ')
}

/** 判定一条 TRIZ note 是否属于指定会话（无 sessionId 的兼容 note —— 手动调用/旧数据 —— 全会话可见）。 */
export function isTrizNoteForSession(a: Artifact, sessionId?: string): boolean {
  if (!sessionId) return true
  const noteSession = a.meta?.sessionId
  return typeof noteSession !== 'string' || noteSession === sessionId
}

/** 把一条 TRIZ note 富化成 client 展示视图（原理明细回填 + 逐行假说拆分 + 生成步序）。 */
export function toTrizNoteView(a: Artifact): TrizNoteView {
  const numbers = Array.isArray(a.meta?.candidates)
    ? a.meta.candidates.map((v) => typeof v === 'number' ? v : Number(v)).filter((n: number) => Number.isFinite(n))
    : []
  const candidates: TrizPrincipleView[] = []
  const seen = new Set<number>()
  for (const no of numbers) {
    if (seen.has(no)) continue
    seen.add(no)
    const p = PRINCIPLE_BY_NO.get(no)
    if (p) candidates.push({ no: p.no, name: p.name, summary: p.summary, routingHint: p.routingHint })
  }
  const hypotheses = a.body.split('\n').map((s) => s.trim()).filter((s) => s.length > 0)
  const step = typeof a.meta?.step === 'number' ? a.meta.step : undefined
  const final = typeof a.meta?.final === 'boolean' ? a.meta.final : undefined
  return {
    artifactId: a.id,
    title: a.title,
    problem: a.title.replace(/^triz:\s*/, ''),
    source: a.meta.source as string,
    // 旧 note 无 contradictionOrigin 字段 → 回落 'default'，展示端不会被兼容性破坏
    contradictionOrigin: (a.meta?.contradictionOrigin as string | undefined) ?? 'default',
    candidates,
    hypotheses,
    createdAt: a.createdAt,
    step,
    final,
  }
}

/** 收集某会话最近 N 条 TRIZ note（按 createdAt 降序；researchCore 缺失时安全返回空）。
 *  @param sessionId 会话 id；提供时只显示该会话的 note（含无 sessionId 的兼容 note）。 */
export function collectTrizNotes(ctx: Context, sessionId?: string): TrizNoteView[] {
  const core = ctx.get?.('researchCore') as ResearchCoreService | undefined
  if (!core?.artifacts) return []
  return core.artifacts.list()
    .filter((a) => isTrizArtifact(a) && isTrizNoteForSession(a, sessionId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_TRIZ_NOTES)
    .map(toTrizNoteView)
}

/** 从 GET 请求 URL 里解析 ?sessionId=（缺省 undefined → 兼容 note 全量 + 不过滤）。 */
export function sessionIdFromRequest(request: Request): string | undefined {
  try {
    const v = new URL(request.url).searchParams.get('sessionId')
    return typeof v === 'string' && v.length > 0 ? v : undefined
  } catch {
    return undefined
  }
}

/** host 插件 body：挂一条只读 GET route 供右侧栏面板取数。 */
export function apply(ctx: Context): (() => Promise<void>) | undefined {
  const dispose = ctx.connection.fetch.register({
    path: TRIZ_NOTES_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: (request: Request) => Promise.resolve(Response.json(
      { notes: collectTrizNotes(ctx, sessionIdFromRequest(request)) },
      { headers: { 'cache-control': 'no-store' } },
    )),
  })
  ctx.logger?.(name).info('%s: %s mounted（右侧栏 TRIZ 原理面板数据源，按会话过滤）', name, TRIZ_NOTES_PATH)
  return dispose
}
