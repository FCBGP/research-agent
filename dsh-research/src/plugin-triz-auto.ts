// @basil/dsh-research/triz-auto — host 平面插件 9（每个最终回答自动生成 TRIZ 解释）。
//
// 需求（用户，2026-10-14）：不只 research_triz 工具 / 一键流水线在「文件产出」时才做
// TRIZ 映射——**每次研究给出的每个最终回答都要解释它对应了哪些 TRIZ 发明原理**，
// 不额外调用任何工具、不侵入 agent-loop / session 内部，且解释会进右侧栏
// 「TRIZ 发明原理」面板（stage 8.5 数据源 /api/research.triz.notes）。
//
// 实现：在根上下文订阅公开的 session/event 事件总线（与 harness 会话同一条线）：
//   - user/message    ：缓存该会话最近一条用户文本（作为矛盾分析的「问题」输入）
//   - assistant/message：缓存该会话最近一条助手文本（一轮内多 step 会逐次覆盖，
//                        轮结束时不构成最终答案的短文本自然被覆盖/被阈值过滤）
//   - turn/end        ：一轮结束 → 缓存中的助手文本即**最终答案**；用
//                        researchTriz.mapResult（缺省矛盾 = 改善 detection ↔ 恶化
//                        complexity）把「问题 + 答案」映射为 1~5 条发明原理，写入
//                        researchCore.artifacts（kind=note、title^='triz: ' artifact）
//                        + researchMemory.episodic 情景记忆 → 右侧栏面板自动可见，
//                        且每轮至多写 1 条（turn/end 后清空该会话答案缓存，天然去重）。
//
// 口径与纪律（对齐 Research Agent Policy）：
//   - 只消费公开 seam，不改 harness 基础设施；researchCore / researchMemory /
//     researchTriz 均经 ctx.get 惰性读取，缺失时安全跳过（非 research 组装不受影响）。
//   - 映射条目一律是**待核验 Hypothesis（source=triz, confidence=0.5）**，面板如实标注，
//     绝不当作已验证事实——它是研究取证的灵感层。
//   - 本插件对 research 族所有 profile（research / paper / experiment / engineering /
//     reviewer）会话生效——这正是「研究时默认就调用 TRIZ」的语义。
import type { Context } from '@deepseek-ai/cordis';
import type { ArtifactStore } from './core/artifact-store.ts';
import type { ResearchCoreService } from './plugin-core.ts';
import type { ResearchMemory } from './memory/index.ts';
import type { ResearchTrizService } from './triz/index.ts';
import { toTrizMappingLine } from './triz/result-map.ts';
import type { TrizResultMapping } from './triz/result-map.ts';

export const name = 'dsh-research-triz-auto';

/** 一条助手消息被视为「最终答案」的最小正文长度（去空白后，字符数）。 */
export const MIN_FINAL_ANSWER_LENGTH = 40;

/** 问题文本注入 mapResult 的最大长度（避免把整段历史当问题）。 */
const MAX_PROBLEM_LEN = 200;
/** 结果文本注入特征词打分的最大长度（控制成本，足够覆盖结论部分即可）。 */
const MAX_RESULT_LEN = 6000;

/** 消息内容块（LLM message content 数组元素）。 */
interface MessageBlockLike {
  type?: string;
  text?: string;
}

/**
 * 从一条 session 消息事件 data 里提取文本：兼容两种形状——
 *   assistant/message：{ turn, step, message: { role, content, source }, … }
 *   user/message      ：{ role, content, source }（无 .message 包裹）
 * 只收 type==='text' 的文本块（tool-call / reasoning 不计入答案正文）。
 */
export function extractMessageText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const inner = (data as { message?: unknown }).message ?? data;
  const content = (inner as { content?: unknown }).content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        const block = b as MessageBlockLike;
        if (typeof b === 'string') return b;
        return block && block.type === 'text' && typeof block.text === 'string' ? block.text : '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (typeof content === 'string') return content;
  return '';
}

/** 判定一条提取出的助手文本是否够格当「最终答案」（有实质正文）。 */
export function isFinalAnswerText(text: string): boolean {
  const compact = (text ?? '').replace(/\s+/g, '');
  return compact.length >= MIN_FINAL_ANSWER_LENGTH;
}

/** 事件处理器所需的懒依赖集合（ctx.get 惰性读取）。 */
export interface TrizAutoDeps {
  triz?: Pick<ResearchTrizService, 'mapResult'>;
  core?: { artifacts?: Pick<ArtifactStore, 'put'>; domain?: ResearchCoreService['domain'] };
  memory?: { episodic?: { record(partial: { kind: string; summary: string; outcome: string }): unknown } };
  logger?: { info(...a: unknown[]): void; warn(...a: unknown[]): void };
}

/**
 * 把「问题 + 最终答案」映射到 TRIZ 发明原理并落 artifact + 情景记忆；
 * 返回映射结果（任一依赖缺失 / 无条目命中时返回 undefined，安全跳过）。
 * 纯函数 + 可测：不依赖 session 事件对象。
 */
export function recordAnswerMapping(
  deps: TrizAutoDeps,
  problem: string,
  resultText: string,
): TrizResultMapping | undefined {
  const triz = deps.triz;
  const artifacts = deps.core?.artifacts;
  if (!triz?.mapResult || !artifacts?.put) return undefined;
  const p = problem?.trim().slice(0, MAX_PROBLEM_LEN);
  const r = resultText?.trim().slice(0, MAX_RESULT_LEN);
  if (!p || !isFinalAnswerText(r ?? '')) return undefined;

  const mapping: TrizResultMapping = triz.mapResult({ problem: p, resultText: r });
  if (!mapping?.entries?.length) return undefined;

  artifacts.put({
    kind: 'note',
    title: `triz: ${p.slice(0, 40)}`,
    body: mapping.entries.map(toTrizMappingLine).join('\n'),
    meta: {
      source: mapping.source,
      candidates: mapping.entries.filter((e) => e.kind === 'didactic').map((e) => e.principleNo),
      mapping: mapping.entries.length,
      auto: true, // 区分「自动生成（每次回答）」与 research_triz 手动调用
    },
  });
  deps.memory?.episodic?.record({
    kind: 'triz',
    summary: `triz(auto): ${p.slice(0, 40)} → ${mapping.entries.length} 条原理映射`,
    outcome: mapping.source,
  });
  deps.logger?.info('%s: 回答 → %d 条 TRIZ 原理映射（右侧栏面板已更新）', name, mapping.entries.length);
  return mapping;
}

interface SessionEventLike {
  type: string;
  data?: unknown;
}

/**
 * 创建「每会话缓存 + 轮结束落盘」的事件处理器。独立成纯函数便于单测
 * （不依赖真实 cordis ctx，只依赖 ctx.on / ctx.get 两个最小能力）。
 */
export function createAutoTrizMiddleware(getDeps: () => TrizAutoDeps) {
  const problems = new Map<string, string>();
  const answers = new Map<string, { turn: number; text: string }>();

  return function onSessionEvent(session: { id?: unknown }, event: SessionEventLike): void {
    const sid = typeof session?.id === 'string' && session.id ? session.id : undefined;
    if (!sid) return;
    try {
      if (event.type === 'user/message') {
        const t = extractMessageText(event.data).trim();
        if (t) problems.set(sid, t);
        return;
      }
      if (event.type === 'assistant/message') {
        const d = event.data as { turn?: number; interrupted?: true };
        if (d?.interrupted === true) return; // 中断的半截答案不当作最终答案
        const t = extractMessageText(event.data).trim();
        if (t) answers.set(sid, { turn: d?.turn ?? -1, text: t });
        return;
      }
      if (event.type === 'turn/end') {
        const problem = problems.get(sid);
        const answer = answers.get(sid);
        if (problem && answer?.text) {
          recordAnswerMapping(getDeps(), problem, answer.text);
        }
        // 轮结束清空该会话答案缓存 → 每轮至多落 1 条，天然去重。
        answers.delete(sid);
        return;
      }
    } catch (err) {
      getDeps().logger?.warn('%s: %s 处理失败 %s', name, event?.type ?? '?', String((err as Error)?.message ?? err));
    }
  };
}

/** host 插件 body：订阅 session/event，自动把每个最终回答映射到 TRIZ。 */
export function apply(ctx: Context): void {
  const getDeps = (): TrizAutoDeps => {
    const core = ctx.get?.('researchCore') as ResearchCoreService | undefined;
    const memory = ctx.get?.('researchMemory') as ResearchMemory | undefined;
    const triz = ctx.get?.('researchTriz') as ResearchTrizService | undefined;
    return {
      triz,
      core: core ? { artifacts: core.artifacts, domain: core.domain } : undefined,
      memory,
      logger: ctx.logger?.(name),
    };
  };
  const onSessionEvent = createAutoTrizMiddleware(getDeps);
  ctx.on('session/event', onSessionEvent);
  ctx.logger?.(name).info('%s: 已挂载 —— 每个最终回答自动映射到 TRIZ 发明原理（右侧栏面板）', name);
}
