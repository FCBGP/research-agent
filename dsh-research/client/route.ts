// client/route.ts — 右侧栏「TRIZ 发明原理」Tab 与 host 之间的数据契约。
//
// host 侧（src/plugin-triz-ui.ts）在 /api/research.triz.notes 挂 GET route，
// 返回 research_triz 工具写入的最近 N 条 TRIZ 分析 note（富化 40 原理明细）。
// 本文件只含 client 侧常量与解析函数；路径常量与 host 侧同名常量保持一致
// （host 是 Node 侧、client 走浏览器 bundle，两侧不共享模块图）。

/** Host 侧鉴权 GET route 的绝对路径（进 connection 鉴权栅栏）。 */
export const TRIZ_NOTES_PATH = '/api/research.triz.notes'

/** 浏览器侧 document-relative 形式（与 ui-deliverables 的 CHANGED_FILES_ROUTE 同款约定）。 */
export const TRIZ_NOTES_ROUTE = TRIZ_NOTES_PATH.slice(1)

/** 一条候选发明原理的展示视图（host 已从 40 原理表富化）。 */
export interface TrizPrincipleView {
  no: number
  name: string
  summary: string
  routingHint: string
}

/** 一条 TRIZ 分析 note 的展示视图。 */
export interface TrizNoteView {
  artifactId: string
  title: string
  problem: string
  /** curated-matrix | heuristic-fallback | unresolved */
  source: string
  /** tool（显式矛盾参数）/ extracted（文本规则提取）/ default（默认检测↔复杂度） */
  contradictionOrigin: string
  candidates: TrizPrincipleView[]
  hypotheses: string[]
  createdAt: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPrincipleView(value: unknown): value is TrizPrincipleView {
  return isRecord(value) && typeof value.no === 'number' && Number.isInteger(value.no)
    && typeof value.name === 'string' && typeof value.summary === 'string' && typeof value.routingHint === 'string'
}

/** 校验 host 返回的 notes 数组；不符形状的记录丢弃（展示端绝不被数据带崩）。 */
export function parseTrizNotes(value: unknown): TrizNoteView[] {
  if (!isRecord(value) || !Array.isArray(value.notes)) return []
  const notes: TrizNoteView[] = []
  for (const item of value.notes) {
    if (!isRecord(item)) continue
    const { artifactId, title, problem, source, hypotheses, contradictionOrigin } = item
    if (typeof artifactId !== 'string' || typeof title !== 'string' || typeof source !== 'string') continue
    const candidates = Array.isArray(item.candidates) ? item.candidates.filter(isPrincipleView) : []
    const lines = Array.isArray(hypotheses) ? hypotheses.filter((h): h is string => typeof h === 'string') : []
    notes.push({
      artifactId,
      title,
      problem: typeof problem === 'string' && problem.length > 0 ? problem : title,
      source,
      contradictionOrigin: typeof contradictionOrigin === 'string' ? contradictionOrigin : 'default',
      candidates,
      hypotheses: lines,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
    })
  }
  return notes
}

/** host 数据源三态的中文标签。 */
export const SOURCE_LABEL: Record<string, string> = {
  'curated-matrix': '命中精选矛盾矩阵',
  'heuristic-fallback': '启发式兜底',
  'unresolved': '参数未解析',
}

/** 矛盾来源三态的中文标签（sidebar 卡片来源标注用）。 */
export const CONTRADICTION_ORIGIN_LABEL: Record<string, string> = {
  'tool': '显式矛盾参数',
  'extracted': '文本规则提取',
  'default': '默认（检测↔复杂度）',
}
