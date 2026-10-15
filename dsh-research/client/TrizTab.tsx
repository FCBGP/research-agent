/**
 * TrizTab.tsx — 右侧栏「TRIZ 发明原理」面板 body（stage two）。
 *
 * 打开面板即向 host 的 /api/research.triz.notes 拉取 research_triz 工具写入的
 * 最近 TRIZ 分析 note，展示：问题表述、命中来源（精选矩阵/启发式/未解析）、
 * 命中的发明原理（编号+名称+路由适配提示）、以及推导出的机制假说（待核验）。
 *
 * 数据经 host connection 鉴权栅栏提供，浏览器端用相对路径 fetch（同源 cookie 认证）。
 * 本组件有意零额外运行时依赖：只用 react（useState/useEffect + JSX），样式走内联，
 * 全部 @deepseek-ai 依赖仅 type import（构建时被 esbuild 剥除），保证 bundle 最小。
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { CONTRADICTION_ORIGIN_LABEL, SOURCE_LABEL, TRIZ_NOTES_ROUTE, parseTrizNotes, type TrizNoteView } from './route.ts'

/** 本 type's body 的合成 props：框架 shares（useTabInfo/sessionId）+ 无自定义注入面。 */
export type TrizTabProps = PropsRuntime<'sidebar.right.pane.tab'>

/** 取数的即时状态。 */
type LoadState = { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; notes: TrizNoteView[] }

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
  empty: { color: 'var(--dsw-alias-label-tertiary, #6b7280)', fontSize: '11px', margin: 0 },
  errored: { color: 'var(--dsw-alias-state-error-primary, #dc2626)', fontSize: '11px', margin: 0 },
} as const

function sourceText(source: string): string {
  return SOURCE_LABEL[source] ?? source
}

/** 单条 TRIZ note：问题 + 来源徽标 + 候选原理 + 推导假说。 */
function TrizNoteCard({ note }: { note: TrizNoteView }): ReactNode {
  return (
    <section style={styles.card}>
      <h3 style={styles.cardTitle}>{note.problem}</h3>
      <span style={styles.badge}>{sourceText(note.source)}</span>
      <p style={styles.originLine}>矛盾来源：{CONTRADICTION_ORIGIN_LABEL[note.contradictionOrigin] ?? note.contradictionOrigin}</p>
      {note.candidates.length > 0 && (
        <ul style={styles.ul}>
          {note.candidates.map((c) => (
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
      )}
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

/**
 * 面板 body：挂载即拉取最近 TRIZ 分析，随后按即时状态渲染。
 * @param props - 框架 shares；本面板只用 useTabInfo（拿 tab 生命周期 signal 做取数取消）。
 */
export function TrizTab(props: TrizTabProps): ReactNode {
  const { useTabInfo } = props
  const tabInfo = typeof useTabInfo === 'function' ? useTabInfo() : undefined
  const signal = tabInfo?.tab?.signal
  const [state, setState] = useState<LoadState>({ phase: 'loading' })
  useEffect(() => {
    let alive = true
    const controller = new AbortController()
    const abort = (): void => { controller.abort() }
    signal?.addEventListener('abort', abort, { once: true })
    void (async () => {
      try {
        const response = await fetch(TRIZ_NOTES_ROUTE, { signal: controller.signal })
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
  }, [signal])
  return (
    <div style={styles.root}>
      <p style={styles.header}>TRIZ 发明原理说明</p>
      <p style={styles.hint}>
        展示本次研究过程中 research_triz 工具分析出的发明原理与推理链。
        所有推荐均为待核验假说（source=triz, confidence=0.5），须经 research_verify / research_campaign 验证后才成为结论。
      </p>
      {state.phase === 'loading' && <p style={styles.empty}>加载中…</p>}
      {state.phase === 'error' && <p style={styles.errored}>暂无 TRIZ 分析记录，或数据源暂不可用。</p>}
      {state.phase === 'ready' && (state.notes.length === 0
        ? <p style={styles.empty}>还没有 TRIZ 分析记录。可在研究会话中调用 research_triz 工具生成。</p>
        : state.notes.map((note) => <TrizNoteCard key={note.artifactId} note={note} />))}
    </div>
  )
}
