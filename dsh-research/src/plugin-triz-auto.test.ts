// plugin-triz-auto.test.ts — @basil/dsh-research/triz-auto host 插件自测。
//
// 验证四层：
//   (1) extractMessageText —— 从 user/assistant 消息 data 里提取文本块（兼容两种形状）
//   (2) isFinalAnswerText —— 短文本 / 纯工具调用不算最终答案
//   (3) recordAnswerMapping —— 默认矛盾（detection ↔ complexity）把「问题+答案」映射为
//       1~5 条发明原理并写 researchCore.artifacts 的 triz note + episodic；依赖缺失 /
//       无命中安全跳过；每轮去重由调用侧（createAutoTrizMiddleware）保证
//   (4) createAutoTrizMiddleware —— 事件驱动的会话缓存 + turn/end 落盘语义：
//       user/message 缓存问题 → assistant/message 缓存答案 → turn/end 恰好写一条 note，
//       清空答案缓存后下一轮不重复写
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ArtifactStore } from './core/artifact-store.ts';
import { createTrizService } from './triz/index.ts';
import { createAutoTrizMiddleware, extractMessageText, isFinalAnswerText, recordAnswerMapping, MIN_FINAL_ANSWER_LENGTH } from './plugin-triz-auto.ts';
import type { TrizAutoDeps } from './plugin-triz-auto.ts';
import { isTrizArtifact } from './plugin-triz-ui.ts';

function makeDeps(): { deps: TrizAutoDeps; artifacts: ArtifactStore; episodes: unknown[] } {
  const artifacts = new ArtifactStore();
  const episodes: unknown[] = [];
  const deps: TrizAutoDeps = {
    triz: createTrizService(),
    core: { artifacts },
    memory: { episodic: { record: (e) => { episodes.push(e); return e; } } },
    logger: { info: () => {}, warn: () => {} },
  };
  return { deps, artifacts, episodes };
}

test('extractMessageText：兼容 assistant 包裹与 user 裸消息两种形状，只收 text 块', () => {
  const assistantData = {
    turn: 1, step: 2,
    message: { role: 'assistant', content: [{ type: 'text', text: 'ROV 校验来源前缀。' }, { type: 'reasoning', text: 'hidden chain' }] },
    stream: [],
  };
  assert.equal(extractMessageText(assistantData), 'ROV 校验来源前缀。');
  const userData = { role: 'user', content: [{ type: 'text', text: '分析 RPKI 对劫持的缓解' }] };
  assert.equal(extractMessageText(userData), '分析 RPKI 对劫持的缓解');
  assert.equal(extractMessageText({ role: 'assistant', content: [{ type: 'tool-call', name: 'x' }] }), '');
  assert.equal(extractMessageText(undefined), '');
  assert.equal(extractMessageText({ role: 'user', content: 'plain string' }), 'plain string');
});

test('isFinalAnswerText：要有实质正文（去空白后 >= 阈值）；短句/空串不算', () => {
  assert.equal(isFinalAnswerText('x'.repeat(MIN_FINAL_ANSWER_LENGTH)), true);
  assert.equal(isFinalAnswerText('   ' + 'x'.repeat(MIN_FINAL_ANSWER_LENGTH) + '\n'), true);
  assert.equal(isFinalAnswerText('x'.repeat(MIN_FINAL_ANSWER_LENGTH - 1)), false);
  assert.equal(isFinalAnswerText(''), false);
  assert.equal(isFinalAnswerText('   '), false);
});

test('recordAnswerMapping：默认矛盾把「问题+最终答案」映射为 ≥1 条原理并落 artifact', () => {
  const { deps, artifacts, episodes } = makeDeps();
  const mapping = recordAnswerMapping(deps, '如何提升 RPKI 劫持检测率而不增加复杂度', 'ROV 逐前缀校验宣告来源，反馈给传播决策；BGPsec 验证路径完整性。'.repeat(4));
  assert.ok(mapping, '应产出映射');
  assert.ok(mapping.entries.length >= 1 && mapping.entries.length <= 5, `1~5 条，实际 ${mapping.entries.length}`);
  assert.ok(mapping.entries.some((e) => e.kind === 'didactic'), 'didactic 矛盾分析正演始终在场');
  const note = artifacts.list().find((a) => a.kind === 'note' && a.title.startsWith('triz: '));
  assert.ok(note, '应写入 triz note artifact');
  assert.equal(isTrizArtifact(note!), true, '面板 isTrizArtifact 判定应命中');
  assert.equal(note!.meta.auto, true, '标记为自动生成');
  assert.equal((note!.meta.mapping as number), mapping.entries.length);
  assert.deepEqual(note!.meta.candidates, mapping.entries.map((e) => e.principleNo),
    'meta.candidates = 全量条目编号（didactic+retrospective 一致，卡片与正文条数对齐）');
  assert.equal(note!.meta.contradictionOrigin, mapping.contradictionOrigin, '矛盾来源一并落 note');
  assert.equal(episodes.length, 1);
  assert.equal((episodes[0] as { kind: string }).kind, 'triz');
});

test('recordAnswerMapping：researchTriz / researchCore 缺失、或答案太短时安全跳过', () => {
  const { deps, artifacts } = makeDeps();
  assert.equal(recordAnswerMapping({ ...deps, triz: undefined }, '问题', '答案'.repeat(50)), undefined);
  assert.equal(recordAnswerMapping({ ...deps, core: { artifacts: undefined } }, '问题', '答案'.repeat(50)), undefined);
  assert.equal(recordAnswerMapping(deps, '问题', '短'), undefined, '非最终答案不映射');
  assert.equal(artifacts.list().length, 0, '三种跳过都不应落 artifact');
});

/** 造一个假 ctx：get 提供 researchTriz/researchCore/researchMemory，on 收集事件 handler。 */
function makeEventCtx(deps: TrizAutoDeps): { ctx: { get(n: string): unknown; on(_t: string, h: (s: unknown, e: unknown) => void): void; logger(_n: string): { info(...a: unknown[]): void; warn(...a: unknown[]): void } }; emit(sessionId: string, type: string, data: unknown): void } {
  let handler: ((s: unknown, e: unknown) => void) | undefined;
  const ctx = {
    get: (n: string) => {
      if (n === 'researchCore') return deps.core ? { artifacts: deps.core.artifacts, domain: {} } : undefined;
      if (n === 'researchMemory') return deps.memory;
      if (n === 'researchTriz') return deps.triz;
      return undefined;
    },
    on: (_t: string, h: (s: unknown, e: unknown) => void) => { handler = h; },
    logger: (_n: string) => ({ info: () => {}, warn: () => {} }),
  };
  return { ctx: ctx as never, emit: (sid, type, data) => handler?.({ id: sid }, { type, data }) };
}

const PROBLEM = '分析 RPKI+BGPsec 的安全能力边界';
const FINAL = ('ROV 通过 ROA 校验宣告来源，BGPsec 提供路径级完整性与来源验证，二者互补。').repeat(3);

test('createAutoTrizMiddleware：user→assistant→turn/end 恰好落一条 triz note，轮清空去重', () => {
  const { deps, artifacts } = makeDeps();
  const { ctx, emit } = makeEventCtx(deps);
  applyVia(ctx, deps);
  emit('s1', 'user/message', { role: 'user', content: [{ type: 'text', text: PROBLEM }] });
  emit('s1', 'assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '先检索。' }] }, stream: [] });
  emit('s1', 'assistant/message', { turn: 1, step: 2, message: { role: 'assistant', content: [{ type: 'text', text: FINAL }] }, stream: [] });
  emit('s1', 'turn/end', { turn: 1, reason: 'complete' });
  assert.equal(artifacts.list().filter((a) => a.title.startsWith('triz: ')).length, 1, '一轮只落 1 条');

  // 第二轮：新的 user 消息 + 新的最终答案 → 又落 1 条（不复用上一轮缓存的问题/答案）
  emit('s1', 'user/message', { role: 'user', content: [{ type: 'text', text: '下一步：反证 BGPsec 局限' }] });
  emit('s1', 'assistant/message', { turn: 2, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: 'BGPsec 验证 AS_PATH 抗路径操纵；局限在部署覆盖与机密性。'.repeat(4) }] }, stream: [] });
  emit('s1', 'turn/end', { turn: 2, reason: 'complete' });
  assert.equal(artifacts.list().filter((a) => a.title.startsWith('triz: ')).length, 2, '第二轮各落一条');
});

test('createAutoTrizMiddleware：中断的答案不当作最终答案；无 answer 时不落', () => {
  const { deps, artifacts } = makeDeps();
  const { ctx, emit } = makeEventCtx(deps);
  applyVia(ctx, deps);
  emit('s2', 'user/message', { role: 'user', content: [{ type: 'text', text: '问题' }] });
  emit('s2', 'assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '回答被打断的半截。'.repeat(3) }] }, stream: [], interrupted: true });
  emit('s2', 'turn/end', { turn: 1, reason: 'interrupted' });
  assert.equal(artifacts.list().length, 0, 'interrupted 答案不落');
});

/** 真实 apply 的简化复刻：用假 ctx 走 createAutoTrizMiddleware（不依赖真实 cordis）。 */
function applyVia(ctx: { get(n: string): unknown; on(_t: string, h: (s: unknown, e: unknown) => void): void; logger(_n: string): { info(...a: unknown[]): void; warn(...a: unknown[]): void } }, deps: TrizAutoDeps): void {
  const handler = createAutoTrizMiddleware(() => deps);
  ctx.on('session/event', handler);
}

test('recordAnswerMapping：矛盾从问题文本提取（不再固定 detection↔complexity），卡片全量收录反演条目', () => {
  const { deps, artifacts } = makeDeps();
  // 问题明确「可靠性 ↔ 收敛」→ 提取 (27,25) → 精选矩阵 [11,10,23]，而非永远 [23,2,24]
  const mapping = recordAnswerMapping(
    deps,
    '如何提高 RPKI 验证可靠性而不拖慢收敛',
    'BGPsec 提前预签名验证，反馈驱动收敛决策；冗余路径与旁路校验。'.repeat(3),
  );
  assert.ok(mapping, '应产出映射');
  assert.equal(mapping.contradictionOrigin, 'extracted', '矛盾来自文本规则提取');
  assert.equal(mapping.contradiction.improving, 'Reliability');
  assert.equal(mapping.contradiction.worsening, 'Loss of time');
  assert.ok(mapping.entries.some((e) => e.principleNo === 11 && e.kind === 'didactic'), 'didactic 为 (27,25) 命中的 #11');
  // 卡片全量收录：反演出的 #2（旁路）也进 candidates，而不仅是 didactic。
  // 注：(27,25) 精选矩阵 cell = [11,10,23]，#23 仍以 didactic 在场；本条验证「结果文本反演能补足卡片」。
  assert.ok(mapping.entries.some((e) => e.principleNo === 2 && e.kind === 'retrospective'), '结果文本「旁路」反演 #2 Taking out，随卡片全量收录');
  const note = artifacts.list().find((a) => a.kind === 'note' && a.title.startsWith('triz: '));
  assert.ok(note, '应写入 note');
  assert.deepEqual(note!.meta.candidates, mapping.entries.map((e) => e.principleNo), 'meta.candidates = 全量条目');
  assert.equal(note!.meta.contradictionOrigin, 'extracted');
});
