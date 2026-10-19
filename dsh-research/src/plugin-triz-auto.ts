// @basil/dsh-research/triz-auto — host 平面插件 9（对本轮生成内容自动生成 TRIZ 解释）。
//
// 需求（用户，2026-10-14；阶段 10 扩展）：不只 research_triz 工具 / 一键流水线在
// 「文件产出」时才做 TRIZ 映射——**每次研究给出的生成内容都要解释它对应了哪些 TRIZ
// 发明原理**，不额外调用任何工具、不侵入 agent-loop / session 内部，且解释会进右侧栏
// 「TRIZ 发明原理」面板（stage 8.5 数据源 /api/research.triz.notes）。
//
// 阶段 10（2026-10-19）两个扩展：
//   1) 会话级持久化：write 时给 note 打 meta.sessionId + meta.step/meta.final；turn/end
//      批量映射完调用 deps.persist()（researchMemory.persist，统一 ArtifactStore 后的
//      memory.artifact == core.artifacts）→ TRIZ 记录随五类记忆落盘，重启后经
//      loadMemoryInto 还原、侧边栏按 sessionId 过滤恢复（与会话历史可追溯）。
//   2) 中间生成结果逐段应用：论文 docs/2610.04555v1.pdf（TRIZa）只对「每个演化候选」
//      声明矛盾+原理（§3.1/3.2），并未覆盖对话 agent 循环里的每条中间 assistant 消息；
//      故本插件把「只在 turn/end 映射最终答案」扩展为「映射本轮所有实质中间 step」——
//      同一 step 流式多帧只覆盖缓存不重复写，turn/end 时按 step 顺序逐一映射（最后一步
//      = final）。短文本（< MIN_FINAL_ANSWER_LENGTH）仍被阈值过滤（与最终答案口径一致）。
//
// 实现：在根上下文订阅公开的 session/event 事件总线（与 harness 会话同一条线）：
//   - user/message    ：缓存该会话最近一条用户文本（矛盾分析「问题」输入），并重置
//                        本轮 step 缓存（新轮开始）
//   - assistant/message：按 step 缓存该会话本条助手文本（同一步多帧覆盖、不重复）；
//                        interrupted 的半截帧不缓存
//   - turn/end        ：一轮结束 → 按 step 顺序对每条有实质正文的助手文本用
//                        researchTriz.mapResult（缺省矛盾 = 改善 detection ↔ 恶化
//                        complexity）映射为 1~5 条发明原理，写入 researchCore.artifacts
//                        （kind=note、title^='triz: '、meta.sessionId/step/final）
//                        + researchMemory.episodic → 右侧栏「TRIZ 发明原理」面板可见，
//                        随后调 deps.persist() 落盘（重启恢复）。
//
// 口径与纪律（对齐 Research Agent Policy）：
//   - 只消费公开 seam，不改 harness 基础设施；researchCore / researchMemory / researchTriz
//     均经 ctx.get 惰性读取，缺失时安全跳过（非 research 组装不受影响）。
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

/** 一条助手消息被视为「有实质内容」（可作最终答案 / 实质中间 step）的最小正文长度（去空白后，字符数）。 */
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

/** 写入 TRIZ note 的可选元信息：会话级持久化维度 + 生成步序。 */
export interface TrizNoteMeta {
  /** 所属会话 id（session/event 的 session.id）——侧边栏按会话过滤、重启恢复的键。 */
  sessionId?: string;
  /** 本生成内容在轮内的步号（step）；末步之外的就是「中间生成结果」。 */
  step?: number;
  /** 是否为该轮最终答案（turn/end 时最后一步）。 */
  final?: boolean;
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

/** 判定一条提取出的助手文本是否够格当「实质生成内容」（有实质正文：最终答案或实质中间 step）。 */
export function isFinalAnswerText(text: string): boolean {
  const compact = (text ?? '').replace(/\s+/g, '');
  return compact.length >= MIN_FINAL_ANSWER_LENGTH;
}

/** 事件处理器所需的懒依赖集合（ctx.get 惰性读取）。 */
export interface TrizAutoDeps {
  triz?: Pick<ResearchTrizService, 'mapResult'>;
  core?: { artifacts?: Pick<ArtifactStore, 'put'>; domain?: ResearchCoreService['domain'] };
  memory?: { episodic?: { record(partial: { kind: string; summary: string; outcome: string }): unknown } };
  /** 可选：映射写完后的落盘钩子（researchMemory.persist，统一 ArtifactStore 下覆盖 TRIZ note）。 */
  persist?: () => unknown;
  logger?: { info(...a: unknown[]): void; warn(...a: unknown[]): void };
}

/**
 * 把「问题 + 生成内容」映射到 TRIZ 发明原理并落 artifact + 情景记忆；
 * 返回映射结果（任一依赖缺失 / 无条目命中时返回 undefined，安全跳过）。
 * 纯函数 + 可测：不依赖 session 事件对象。
 * @param noteMeta 可选：会话 id + 生成步序（中间生成结果逐段应用），随 note 落盘。
 */
export function recordAnswerMapping(
  deps: TrizAutoDeps,
  problem: string,
  resultText: string,
  noteMeta?: TrizNoteMeta,
): TrizResultMapping | undefined {
  const triz = deps.triz;
  const artifacts = deps.core?.artifacts;
  if (!triz?.mapResult || !artifacts?.put) return undefined;
  const p = problem?.trim().slice(0, MAX_PROBLEM_LEN);
  const r = resultText?.trim().slice(0, MAX_RESULT_LEN);
  if (!p || !isFinalAnswerText(r ?? '')) return undefined;

  const mapping: TrizResultMapping = triz.mapResult({ problem: p, resultText: r });
  if (!mapping?.entries?.length) return undefined;

  const meta: Record<string, unknown> = {
    source: mapping.source,
    // 全量收录 didactic + retrospective（上限 5 由 result-map 控制）：右侧栏卡片徽标与正文条数一致
    candidates: mapping.entries.map((e) => e.principleNo),
    mapping: mapping.entries.length,
    auto: true, // 区分「自动生成（每次生成内容）」与 research_triz 手动调用
    contradictionOrigin: mapping.contradictionOrigin, // tool/extracted/default 如实标注
  };
  if (noteMeta?.sessionId !== undefined) meta.sessionId = noteMeta.sessionId; // 会话级持久化维度
  if (noteMeta?.step !== undefined) meta.step = noteMeta.step;                 // 生成步序
  meta.final = noteMeta?.final ?? false;                                       // 是否最终答案

  artifacts.put({
    kind: 'note',
    title: `triz: ${p.slice(0, 40)}`,
    body: mapping.entries.map(toTrizMappingLine).join('\n'),
    meta,
  });
  deps.memory?.episodic?.record({
    kind: 'triz',
    summary: `triz(auto): ${p.slice(0, 40)} → ${mapping.entries.length} 条原理映射`,
    outcome: mapping.source,
  });
  deps.logger?.info('%s: 生成内容 → %d 条 TRIZ 原理映射（右侧栏面板已更新）', name, mapping.entries.length);
  return mapping;
}

interface SessionEventLike {
  type: string;
  data?: unknown;
}

/**
 * 创建「每会话按 step 缓存 + 轮结束逐 step 落盘」的事件处理器。独立成纯函数便于单测
 * （不依赖真实 cordis ctx，只依赖 ctx.on / ctx.get 两个最小能力）。
 * 一轮 = user/message（重置 step 缓存）→ assistant/message（按 step 覆盖缓存）
 *      → turn/end（逐实质 step 映射 + 落盘 + 清缓存）。
 */
export function createAutoTrizMiddleware(getDeps: () => TrizAutoDeps) {
  const problems = new Map<string, string>();
  const answers = new Map<string, Map<number, string>>();

  return function onSessionEvent(session: { id?: unknown }, event: SessionEventLike): void {
    const sid = typeof session?.id === 'string' && session.id ? session.id : undefined;
    if (!sid) return;
    try {
      if (event.type === 'user/message') {
        const t = extractMessageText(event.data).trim();
        if (t) {
          problems.set(sid, t);
          answers.set(sid, new Map()); // 新轮开始：重置本会话 step 缓存
        }
        return;
      }
      if (event.type === 'assistant/message') {
        const d = event.data as { step?: number; interrupted?: true };
        if (d?.interrupted === true) return; // 中断的半截帧不缓存
        const t = extractMessageText(event.data).trim();
        if (t) {
          const slot = answers.get(sid) ?? new Map<number, string>();
          const step = typeof d?.step === 'number' && Number.isFinite(d.step) ? d.step : 0;
          slot.set(step, t); // 同一步流式多帧 → 覆盖，不重复写
          answers.set(sid, slot);
        }
        return;
      }
      if (event.type === 'turn/end') {
        const problem = problems.get(sid);
        const steps = answers.get(sid);
        if (problem && steps && steps.size > 0) {
          const nums = [...steps.keys()].sort((a, b) => a - b);
          const last = nums[nums.length - 1];
          for (const step of nums) {
            const text = steps.get(step)!;
            // 只映射有实质正文的 step（短文本被阈值过滤）；末步标记为 final。
            recordAnswerMapping(getDeps(), problem, text, { sessionId: sid, step, final: step === last });
          }
          // 一轮写完即落盘：统一 ArtifactStore 后 persist 覆盖 TRIZ note，
          // 重启后 loadMemoryInto 还原、侧边栏按 sessionId 恢复。
          getDeps().persist?.();
        }
        // 轮结束清空该会话 step 缓存 → 每轮只处理自己的 step，天然去重。
        answers.delete(sid);
        return;
      }
    } catch (err) {
      getDeps().logger?.warn('%s: %s 处理失败 %s', name, event?.type ?? '?', String((err as Error)?.message ?? err));
    }
  };
}

/** host 插件 body：订阅 session/event，自动把本轮生成内容（含实质中间 step）映射到 TRIZ。 */
export function apply(ctx: Context): void {
  const getDeps = (): TrizAutoDeps => {
    const core = ctx.get?.('researchCore') as ResearchCoreService | undefined;
    const memory = ctx.get?.('researchMemory') as (ResearchMemory & { persist?(dir?: string): string | undefined }) | undefined;
    const triz = ctx.get?.('researchTriz') as ResearchTrizService | undefined;
    return {
      triz,
      core: core ? { artifacts: core.artifacts, domain: core.domain } : undefined,
      memory,
      persist: typeof memory?.persist === 'function' ? () => memory.persist?.() : undefined,
      logger: ctx.logger?.(name),
    };
  };
  const onSessionEvent = createAutoTrizMiddleware(getDeps);
  ctx.on('session/event', onSessionEvent);
  ctx.logger?.(name).info('%s: 已挂载 —— 本轮生成内容（含实质中间 step）自动映射到 TRIZ 发明原理（右侧栏面板，落盘持久化）', name);
}
