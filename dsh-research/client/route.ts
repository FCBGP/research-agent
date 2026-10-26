// client/route.ts — 右侧栏「TRIZ 发明原理」Tab 与 host 之间的数据契约。
//
// host 侧（src/plugin-triz-ui.ts）在 /api/research.triz.notes 挂 GET route，
// 返回 research_triz 工具 / triz-auto 写入的最近 N 条 TRIZ 分析 note（富化 40 原理明细）。
// 阶段 10：取数带 sessionId（侧边栏按会话过滤）+ note 增加 step/final（生成步序展示）。
// 本文件只含 client 侧常量与解析函数；路径常量与 host 侧同名常量保持一致
// （host 是 Node 侧、client 走浏览器 bundle，两侧不共享模块图）。

/** Host 侧鉴权 GET route 的绝对路径（进 connection 鉴权栅栏）。 */
export const TRIZ_NOTES_PATH = '/api/research.triz.notes'

/** 浏览器侧 document-relative 形式（与 ui-deliverables 的 CHANGED_FILES_ROUTE 同款约定）。 */
export const TRIZ_NOTES_ROUTE = TRIZ_NOTES_PATH.slice(1)

/** 带会话维度的取数 URL：sessionId 提供时只拉取该会话的 TRIZ note（与 ui-deliverables 同款约定）。 */
export function trizNotesUrl(sessionId?: string): string {
  if (!sessionId) return TRIZ_NOTES_ROUTE
  return `${TRIZ_NOTES_ROUTE}?${new URLSearchParams({ sessionId }).toString()}`
}

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
  /** 生成步序（triz-auto 逐段映射才有）；research_triz 手动 note 缺省。 */
  step?: number
  /** 是否该轮最终答案（末步）；中间生成结果为 false / 缺省未标注。 */
  final?: boolean
  /** 本轮唯一标识（triz-auto 阶段 12 起写入）——客户端按它把同轮多步聚合成「本轮总览卡」。 */
  roundId?: string
  /** 所属会话 id（阶段 12 起透传）——客户端分组健壮性；缺省为无会话的手动 note。 */
  sessionId?: string
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
    const step = typeof item.step === 'number' && Number.isInteger(item.step) ? item.step : undefined
    const fin = typeof item.final === 'boolean' ? item.final : undefined
    const roundId = typeof item.roundId === 'string' && item.roundId.length > 0 ? item.roundId : undefined
    const sessionId = typeof item.sessionId === 'string' && item.sessionId.length > 0 ? item.sessionId : undefined
    notes.push({
      artifactId,
      title,
      problem: typeof problem === 'string' && problem.length > 0 ? problem : title,
      source,
      contradictionOrigin: typeof contradictionOrigin === 'string' ? contradictionOrigin : 'default',
      candidates,
      hypotheses: lines,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
      step,
      final: fin,
      roundId,
      sessionId,
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


/**
 * 阶段 12 · 「本轮 TRIZ 总览卡」聚合（2026-10-26，用户选型「方案 3：按轮聚合总览」）。
 *
 * 原状：triz-auto 对轮内每个实质中间 step 各写一条 note → 侧边栏出现多条「同问题、只有
 * 步数不同」的碎片卡（如仅显示 39/40 两步），用户困惑「为什么只解释最后两步」。
 * 现在按「轮」聚合成一张总览卡：问题 + 全部步骤命中的原理合集（去重）+ 最终答案步的结论，
 * 各步骤明细收进可折叠区块。手动 research_triz 调用（无 step）保持单卡。
 *
 * 轮的分组键：优先 host 新写入的 roundId；旧数据（无 roundId）回落
 * 「createdAt + sessionId + step 相邻性」启发式——同 createdAt 里 step 不连续（被阈值
 * 过滤/跨子轮）即拆开，兼容 2026-10-21 批量快照里同毫秒多轮混存的脏数据。
 */

/** 一条「轮内某实质步骤」的折叠明细。 */
export interface TrizRoundDetail {
  step: number
  final: boolean
  source: string
  contradictionOrigin: string
  candidates: TrizPrincipleView[]
  hypotheses: string[]
}

/** 聚合出的「本轮 TRIZ 总览卡」视图。 */
export interface TrizRoundView {
  roundKey: string
  problem: string
  /** 问题是否 harness 内部生成（自动检查/采样/goal_complete）→ 展示端给中性占位文案。 */
  problemInternal: boolean
  source: string
  contradictionOrigin: string
  createdAt: string
  /** 全步骤命中的原理合集（按出现顺序去重）。 */
  candidates: TrizPrincipleView[]
  /** 最终答案步的 TRIZ 说明（结论）。 */
  hypotheses: string[]
  stepCount: number
  finalStep?: number
  detail: TrizRoundDetail[]
}

/** 判定「问题」是否 harness 内部控制/检查消息（与 host isInternalUserText 匹配展示端口径）。 */
export function isInternalProblemText(text: string): boolean {
  const t = (text ?? '').trim().toLowerCase()
  if (!t) return true
  const markers = [
    'this is an automatically generated check',
    'time sampled while preparing',
    '<goal_complete>',
    '自动生成的检查',
    '自动生成检查',
  ]
  for (const m of markers) if (t.includes(m)) return true
  return false
}

/** 一条 note 的轮分组键：roundId 优先，旧数据回落 createdAt+sessionId（配套 step 相邻性拆分）。 */
function roundBucketKey(n: TrizNoteView): string {
  if (typeof n.roundId === 'string' && n.roundId) return `rid:${n.roundId}`
  return `legacy:${n.createdAt ?? ''}:${n.sessionId ?? ''}`
}

function toRoundView(sorted: TrizNoteView[]): TrizRoundView {
  // 最终答案步：取 final=true 的最后一条；都没有则取步序最大者（兼容整轮无 final 标注的旧数据）。
  const finalNote = [...sorted].reverse().find((n) => n.final === true) ?? sorted[sorted.length - 1]
  const seen = new Set<number>()
  const candidates: TrizPrincipleView[] = []
  for (const n of sorted) {
    for (const c of n.candidates ?? []) {
      if (seen.has(c.no)) continue
      seen.add(c.no)
      candidates.push(c)
    }
  }
  const detail: TrizRoundDetail[] = sorted.map((n) => ({
    step: typeof n.step === 'number' ? n.step : 0,
    final: n.final === true,
    source: n.source,
    contradictionOrigin: n.contradictionOrigin,
    candidates: n.candidates ?? [],
    hypotheses: n.hypotheses ?? [],
  }))
  const problem = finalNote?.problem ?? sorted[0]?.problem ?? ''
  return {
    roundKey: finalNote?.roundId ?? `round-${finalNote?.createdAt ?? ''}-${finalNote?.step ?? 0}`,
    problem,
    problemInternal: isInternalProblemText(problem),
    source: finalNote?.source ?? sorted[0]?.source ?? 'curated-matrix',
    contradictionOrigin: finalNote?.contradictionOrigin ?? 'default',
    createdAt: finalNote?.createdAt ?? sorted[0]?.createdAt ?? '',
    candidates,
    hypotheses: finalNote?.hypotheses ?? [],
    stepCount: sorted.length,
    finalStep: typeof finalNote?.step === 'number' ? finalNote.step : undefined,
    detail,
  }
}

/**
 * 把某会话的 TRIZ note 列表拆成「手动单卡 + 按轮聚合总览卡」。
 * @returns manual 无 step 的手动 research_triz 调用（逐条单卡）；
 *          rounds 有 step 的自动 note 按轮聚合（每轮一张，轮内步序升序）。
 */
export function aggregateTrizRounds(notes: TrizNoteView[]): { manual: TrizNoteView[]; rounds: TrizRoundView[] } {
  const manual: TrizNoteView[] = []
  const auto: TrizNoteView[] = []
  for (const n of notes) {
    if (typeof n.step === 'number') auto.push(n)
    else manual.push(n)
  }
  const buckets = new Map<string, TrizNoteView[]>()
  for (const n of auto) {
    const k = roundBucketKey(n)
    const b = buckets.get(k) ?? []
    b.push(n)
    buckets.set(k, b)
  }
  const rounds: TrizRoundView[] = []
  for (const group of buckets.values()) {
    const sorted = [...group].sort((a, b) => (a.step ?? 0) - (b.step ?? 0))
    if (typeof group[0].roundId === 'string' && group[0].roundId) {
      rounds.push(toRoundView(sorted)) // 有 roundId：整桶即一轮
    } else {
      // 无 roundId 的旧数据：同桶内按「step 相邻」再拆轮（被阈值过滤/跨子轮则不连续）
      let cur: TrizNoteView[] = [sorted[0]]
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1]
        const curN = sorted[i]
        const adjacent = typeof prev.step === 'number' && typeof curN.step === 'number' && prev.step + 1 === curN.step
        if (adjacent) cur.push(curN)
        else { rounds.push(toRoundView(cur)); cur = [curN] }
      }
      rounds.push(toRoundView(cur))
    }
  }
  rounds.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || (b.finalStep ?? 0) - (a.finalStep ?? 0))
  manual.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return { manual, rounds }
}
