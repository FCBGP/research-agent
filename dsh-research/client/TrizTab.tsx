/**
 * TrizTab.tsx — 右侧栏「TRIZ 发明原理」面板 body（stage two）→ 阶段 12「本轮总览卡」。
 *
 * 打开面板即向 host 的 /api/research.triz.notes 拉取最近 TRIZ 分析 note，然后：
 *   - 手动 research_triz 调用（无 step）→ 逐条单卡；
 *   - triz-auto 自动 note（有 step）→ 按「轮」聚合成一张总览卡：问题 + 全步骤命中的
 *     原理合集（去重）+ 最终答案步结论，各步骤明细收进可折叠区块。
 * 用户（2026-10-26）选型「方案 3」：不再让同轮的多条 step 碎片卡并存，避免「为什么只
 * 显示两个步骤」的困惑。
 *
 * 数据经 host connection 鉴权栅栏提供，浏览器端用相对路径 fetch（同源 cookie 认证）。
 * 本组件有意零额外运行时依赖：只用 react（useState/useEffect + JSX），样式走内联，
 * 全部 @deepseek-ai 依赖仅 type import（构建时被 esbuild 剥除），保证 bundle 最小。
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  CONTRADICTION_ORIGIN_LABEL, SOURCE_LABEL,
  aggregateTrizRounds, isInternalProblemText, parseTrizNotes, trizNotesUrl,
  type TrizNoteView, type TrizRoundView,
} from './route.ts'

/** 本 type's body 的合成 props：框架 shares（useTabInfo/sessionId）+ 无自定义注入面。 */
export type TrizTabProps = PropsRuntime<'sidebar.right.pane.tab'>

/** 取数的即时状态。 */
type LoadState = { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; notes: TrizNoteView[] }

const styles = {
  root: {
    boxSizing: 'border-box' as const,
    width: '100%',
    minWidth: 0,
    // 滚动修复：host 的 tabBody 是 height:100% + overflow:hidden 的 flex 容器，
    // 本根节点必须 flex:1 + minHeight:0 才能收缩，overflowY:auto 提供滚动（2026-10-21 用户反馈 TRIZ 面板不可滚动）。
    flex: '1 1 auto' as const,
    minHeight: 0 as const,
    overflowY: 'auto' as const,
    padding: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
    fontFamily: 'var(--ds-font-family, system-ui, sans-serif)',
    color: 'var(--dsw-alias-label-primary, #20242c)',
    fontSize: '12px',
    lineHeight: '1.5',
  },
  header: {
    fontSize: '13px',
    fontWeight: 600,
    margin: 0,
  },
  hint: {
    color: 'var(--dsw-alias-label-tertiary, #6b7280)',
    fontSize: '11px',
    margin: 0,
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
  cardTitle: {
    fontWeight: 600,
    margin: 0,
    fontSize: '12px',
    lineHeight: '1.4',
  },
  badge: {
    display: 'inline-flex',
    alignSelf: 'flex-start',
    borderRadius: '999px',
    padding: '1px 8px',
    fontSize: '10px',
    fontWeight: 500,
    background: 'var(--dsw-alias-interactive-bg-subtle, #eef2ff)',
    color: 'var(--dsw-alias-state-business-primary, #4f46e5)',
  },  originLine: {
    margin: 0,
    fontSize: '10px',
    color: 'var(--dsw-alias-label-tertiary, #6b7280)',
  },
  sectionLabel: {
    margin: '2px 0 0',
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--dsw-alias-label-secondary, #4b5563)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.03em',
  },
  principle: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    padding: '6px 8px',
    borderRadius: '8px',
    background: 'color-mix(in srgb, var(--dsw-static-neutral-00, #fff) 55%, transparent)',
  },
  principleHead: {
    display: 'flex',
    alignItems: 'center' as const,
    gap: '6px',
    fontWeight: 600,
    fontSize: '11px',
  },
  principleNo: {
    flex: 'none',
    minWidth: '18px',
    height: '18px',
    lineHeight: '18px',
    textAlign: 'center' as const,
    borderRadius: '6px',
    background: 'var(--dsw-alias-state-business-primary, #4f46e5)',
    color: '#fff',
    fontSize: '10px',
  },
  summary: { margin: 0, color: 'var(--dsw-alias-label-secondary, #4b5563)' },
  hintLine: { margin: 0, fontSize: '11px', color: 'var(--dsw-alias-label-tertiary, #6b7280)' },
  ul: { margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  details: {
    border: '0.5px solid var(--dsw-alias-border-l2, #e5e7eb)',
    borderRadius: '8px',
    padding: '6px 8px',
  },
  summaryText: {
    cursor: 'pointer' as const,
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--dsw-alias-state-business-primary, #4f46e5)',
    userSelect: 'none' as const,
  },
  detailBlock: { margin: '4px 0 0', paddingLeft: '4px', display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  empty: { color: 'var(--dsw-alias-label-tertiary, #6b7280)', fontSize: '11px', margin: 0 },
  errored: { color: 'var(--dsw-alias-state-error-primary, #dc2626)', fontSize: '11px', margin: 0 },
} as const

function sourceText(source: string): string {
  return SOURCE_LABEL[source] ?? source
}

/** 原理列表（轮总览卡的合集 / 单卡的候选）。 */
function PrincipleList({ candidates }: { candidates: TrizNoteView['candidates'] }): ReactNode {
  if (candidates.length === 0) return null
  return (
    <ul style={styles.ul}>
      {candidates.map((c) => (
        <li key={c.no} style={styles.principle}>
          <span style={styles.principleHead}>
            <b style={styles.principleNo}>{c.no}</b>
            <span>{c.name}</span>
          </span>
          <p style={styles.summary}>{c.summary}</p>
          <p style={styles.hintLine}>{c.routingHint}</p>
        </li>
      ))}
    </ul>
  )
}

/** 单条手动 research_triz note（无 step）。 */
function TrizNoteCard({ note }: { note: TrizNoteView }): ReactNode {
  return (
    <section style={styles.card}>
      <h3 style={styles.cardTitle}>{note.problem}</h3>
      <span style={styles.badge}>{sourceText(note.source)}</span>
      <p style={styles.originLine}>矛盾来源：{CONTRADICTION_ORIGIN_LABEL[note.contradictionOrigin] ?? note.contradictionOrigin}</p>
      <PrincipleList candidates={note.candidates} />
      {note.hypotheses.length > 0 && (
        <ul style={styles.ul}>
          {note.hypotheses.map((h, i) => (
            <li key={`${note.artifactId}-${i}`} style={styles.hintLine}>{h}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** 一张「本轮 TRIZ 总览卡」：问题 + 原理合集 + 最终结论 + 可折叠各步骤明细。 */
function TrizRoundCard({ round }: { round: TrizRoundView }): ReactNode {
  const title = round.problemInternal ? '（本轮问题为自动生成的内部检查消息，未捕获实质任务问题）' : round.problem
  return (
    <section style={styles.card}>
      <h3 style={styles.cardTitle}>{title}</h3>
      <span style={styles.badge}>{sourceText(round.source)}</span>
      <p style={styles.originLine}>
        这一轮共 {round.stepCount} 个实质生成步骤
        {typeof round.finalStep === 'number' && `（最终答案在第 ${round.finalStep} 步）`}
        ；矛盾来源：{CONTRADICTION_ORIGIN_LABEL[round.contradictionOrigin] ?? round.contradictionOrigin}
      </p>
      <p style={styles.sectionLabel}>原理合集（{round.candidates.length}）</p>
      <PrincipleList candidates={round.candidates} />
      {round.hypotheses.length > 0 && (
        <>
          <p style={styles.sectionLabel}>最终结论</p>
          <ul style={styles.ul}>
            {round.hypotheses.map((h, i) => (
              <li key={`${round.roundKey}-concl-${i}`} style={styles.hintLine}>{h}</li>
            ))}
          </ul>
        </>
      )}
      {round.detail.length > 1 && (
        <details style={styles.details}>
          <summary style={styles.summaryText}>展开各步骤明细（{round.detail.length}）</summary>
          <div style={styles.detailBlock}>
            {round.detail.map((d) => (
              <div key={`${round.roundKey}-step-${d.step}`}>
                <p style={styles.originLine}>
                  第 {d.step} 步{d.final ? '（最终答案）' : '（中间生成结果）'}
                  —— {sourceText(d.source)} / 矛盾来源：{CONTRADICTION_ORIGIN_LABEL[d.contradictionOrigin] ?? d.contradictionOrigin}
                  {d.candidates.length > 0 && ` / 原理：${d.candidates.map((c) => `#${c.no} ${c.name}`).join('、')}`}
                </p>
                {d.hypotheses.length > 0 && (
                  <ul style={styles.ul}>
                    {d.hypotheses.map((h, i) => (
                      <li key={`${round.roundKey}-step-${d.step}-${i}`} style={styles.hintLine}>{h}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  )
}

/**
 * 面板 body：挂载即拉取最近 TRIZ 分析，随后按即时状态渲染（轮总览卡 + 手动单卡）。
 * @param props - 框架 shares；本面板只用 useTabInfo（拿 tab 生命周期 signal 做取数取消）。
 */
export function TrizTab(props: TrizTabProps): ReactNode {
  const { useTabInfo } = props
  const tabInfo = typeof useTabInfo === 'function' ? useTabInfo() : undefined
  const signal = tabInfo?.tab?.signal
  // 会话标准注入：当前会话 id（ui-session 合并进 SessionStandardProps）——
  // 右侧栏面板是会话作用域，用它按会话过滤 TRIZ 记录（重启后随会话历史恢复）。
  const sessionId = (props as { sessionId?: string }).sessionId
  const [state, setState] = useState<LoadState>({ phase: 'loading' })
  useEffect(() => {
    let alive = true
    const controller = new AbortController()
    const abort = (): void => { controller.abort() }
    signal?.addEventListener('abort', abort, { once: true })
    void (async () => {
      try {
        const response = await fetch(trizNotesUrl(sessionId), { signal: controller.signal })
        if (!alive) return
        if (!response.ok) { setState({ phase: 'error' }); return }
        const notes = parseTrizNotes(await response.json())
        if (alive) setState({ phase: 'ready', notes })
      } catch {
        if (alive) setState({ phase: 'error' })
      }
    })()
    return () => {
      alive = false
      controller.abort()
      signal?.removeEventListener('abort', abort)
    }
  }, [signal, sessionId])
  const { manual, rounds } = state.phase === 'ready' ? aggregateTrizRounds(state.notes) : { manual: [] as TrizNoteView[], rounds: [] as TrizRoundView[] }
  const hasAny = state.phase === 'ready' && (manual.length > 0 || rounds.length > 0)
  return (
    <div style={styles.root}>
      <p style={styles.header}>TRIZ 发明原理说明</p>
      <p style={styles.hint}>
        同一次研究轮内的实质生成步骤会聚合成一张「本轮总览卡」（问题 + 原理合集 + 最终结论），
        可展开各步骤明细；短步骤 / 工具调用不单独生成 TRIZ 说明。推荐均为待核验假说
        （source=triz, confidence=0.5），须经 research_verify / research_campaign 验证后才成为结论。
      </p>
      {state.phase === 'loading' && <p style={styles.empty}>加载中…</p>}
      {state.phase === 'error' && <p style={styles.errored}>暂无 TRIZ 分析记录，或数据源暂不可用。</p>}
      {state.phase === 'ready' && !hasAny && (
        <p style={styles.empty}>还没有 TRIZ 分析记录。可在研究会话中调用 research_triz 工具生成。</p>
      )}
      {state.phase === 'ready' && rounds.map((round) => <TrizRoundCard key={round.roundKey} round={round} />)}
      {state.phase === 'ready' && manual.map((note) => <TrizNoteCard key={note.artifactId} note={note} />)}
    </div>
  )
}
