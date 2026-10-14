// @basil/dsh-research/triz-ui — host 平面插件 8（右侧栏「TRIZ 发明原理」面板的数据源）。
//
// 阶段 8·B：用户在 Web UI 右侧栏要「一栏来解释最终结果用了 TRIZ 的什么发明原理」。
// 本插件不进 Research Loop，只为浏览器半边提供只读数据：在 connection 鉴权栅栏内
// 挂一条 GET route /api/research.triz.notes，从 researchCore.artifacts 过滤出
// research_triz 工具写入的 note（meta.source ∈ 三态、title 以 'triz: ' 开头），
// 按 createdAt 降序取最近 N 条，并回填 40 原理明细（no/name/summary/routingHint）
// 与逐行假说文本给 client（client/index.ts + client/TrizTab.tsx）渲染。
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

/** 一次返回最多多少条 TRIZ 分析 note（最近 N 条）。 */
export const MAX_TRIZ_NOTES = 10

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
  candidates: TrizPrincipleView[]
  hypotheses: string[]
  createdAt: string
}

const PRINCIPLE_BY_NO = new Map<number, { no: number; name: string; summary: string; routingHint: string }>(
  TRIZ_PRINCIPLES.map((p) => [p.no, p]),
)

/** 判定一个 artifact 是否为 research_triz 工具写入的 TRIZ 分析 note。 */
export function isTrizArtifact(a: Artifact): boolean {
  return a.kind === 'note' && !a.archived && typeof a.meta?.source === 'string'
    && (TRIZ_SOURCES as readonly string[]).includes(a.meta.source as string)
    && a.title.startsWith('triz: ')
}

/** 把一条 TRIZ note 富化成 client 展示视图（原理明细回填 + 逐行假说拆分）。 */
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
  return {
    artifactId: a.id,
    title: a.title,
    problem: a.title.replace(/^triz:\s*/, ''),
    source: a.meta.source as string,
    candidates,
    hypotheses,
    createdAt: a.createdAt,
  }
}

/** 收集最近 N 条 TRIZ note（按 createdAt 降序；researchCore 缺失时安全返回空）。 */
export function collectTrizNotes(ctx: Context): TrizNoteView[] {
  const core = ctx.get?.('researchCore') as ResearchCoreService | undefined
  if (!core?.artifacts) return []
  return core.artifacts.list()
    .filter(isTrizArtifact)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_TRIZ_NOTES)
    .map(toTrizNoteView)
}

/** host 插件 body：挂一条只读 GET route 供右侧栏面板取数。 */
export function apply(ctx: Context): (() => Promise<void>) | undefined {
  const dispose = ctx.connection.fetch.register({
    path: TRIZ_NOTES_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: () => Promise.resolve(Response.json(
      { notes: collectTrizNotes(ctx) },
      { headers: { 'cache-control': 'no-store' } },
    )),
  })
  ctx.logger?.(name).info('%s: %s mounted（右侧栏 TRIZ 原理面板数据源）', name, TRIZ_NOTES_PATH)
  return dispose
}
