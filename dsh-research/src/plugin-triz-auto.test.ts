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
import { createAutoTrizMiddleware, extractMessageText, isFinalAnswerText, isInternalUserText, nextRoundId, recordAnswerMapping, MIN_FINAL_ANSWER_LENGTH } from './plugin-triz-auto.ts';
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

test('recordAnswerMapping：noteMeta 携带会话 id + 生成步序（sessionId/step/final）落 note meta', () => {
  const { deps, artifacts } = makeDeps();
  const mapping = recordAnswerMapping(
    deps,
    '如何提升 RPKI 劫持检测率而不增加复杂度',
    'ROV 逐前缀校验宣告来源，反馈给传播决策；BGPsec 验证路径完整性。'.repeat(4),
    { sessionId: 'sess-1', step: 2, final: false },
  );
  assert.ok(mapping, '应产出映射');
  const note = artifacts.list().find((a) => a.kind === 'note' && a.title.startsWith('triz: '));
  assert.ok(note, '应写入 triz note');
  assert.equal(note!.meta.sessionId, 'sess-1', '会话级持久化维度的关键字');
  assert.equal(note!.meta.step, 2, '生成步序');
  assert.equal(note!.meta.final, false, '中间生成结果 final=false');
  // 缺省 noteMeta → 不写 sessionId/step（research_triz 手动 note 兼容），final 缺省为 false
  const { deps: d2, artifacts: a2 } = makeDeps();
  recordAnswerMapping(d2, '问题', '答案正文'.repeat(30));
  const bare = a2.list().find((x) => x.kind === 'note');
  assert.ok(bare, 'bare note');
  assert.equal(bare!.meta.sessionId, undefined);
  assert.equal(bare!.meta.step, undefined);
});

test('createAutoTrizMiddleware：多个实质中间 step 逐段映射（step/final/sessionId 正确，末步 final=true）', () => {
  const { deps, artifacts } = makeDeps();
  const { ctx, emit } = makeEventCtx(deps);
  applyVia(ctx, deps);
  emit('s-sess', 'user/message', { role: 'user', content: [{ type: 'text', text: PROBLEM }] });
  // step 1/2 是实质中间生成结果；step 3 是该轮最终答案
  emit('s-sess', 'assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '先检索 RPKI 校验路径，对比 ROV 与 BGPsec 的前缀级来源验证开销。'.repeat(2) }] }, stream: [] });
  emit('s-sess', 'assistant/message', { turn: 1, step: 2, message: { role: 'assistant', content: [{ type: 'text', text: '中间结论：分离验证与传播控制面可降低端到端复杂度，反馈回路改进收敛。'.repeat(2) }] }, stream: [] });
  emit('s-sess', 'assistant/message', { turn: 1, step: 3, message: { role: 'assistant', content: [{ type: 'text', text: FINAL }] }, stream: [] });
  emit('s-sess', 'turn/end', { turn: 1, reason: 'complete' });
  const notes = artifacts.list().filter((a) => a.title.startsWith('triz: '));
  assert.equal(notes.length, 3, '每个实质 step 各落一条（中间生成结果逐段应用）');
  const byStep = new Map(notes.map((n) => [n.meta.step as number, n.meta]));
  assert.deepEqual([...byStep.keys()].sort((a, b) => a - b), [1, 2, 3], 'step 1/2/3 各一条');
  assert.equal(byStep.get(1)!.final, false, 'step1 = 中间生成结果');
  assert.equal(byStep.get(2)!.final, false, 'step2 = 中间生成结果');
  assert.equal(byStep.get(3)!.final, true, '末步 = 最终答案');
  for (const m of byStep.values()) assert.equal(m.sessionId, 's-sess', '全部打会话 id 以便重启后按会话恢复');
  assert.equal(notes.every((n) => n.meta.auto === true), true);
});

test('createAutoTrizMiddleware：同一步流式多帧只覆盖缓存，不重复写 note', () => {
  const { deps, artifacts } = makeDeps();
  const { ctx, emit } = makeEventCtx(deps);
  applyVia(ctx, deps);
  emit('s-dedup', 'user/message', { role: 'user', content: [{ type: 'text', text: PROBLEM }] });
  // step 1 多帧：中间帧“半截” → 末帧完整；同一步只保留末帧
  emit('s-dedup', 'assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: FINAL.slice(0, 60) }] }, stream: [{}] });
  emit('s-dedup', 'assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: FINAL }] }, stream: [{}] });
  emit('s-dedup', 'turn/end', { turn: 1, reason: 'complete' });
  const notes = artifacts.list().filter((a) => a.title.startsWith('triz: '));
  assert.equal(notes.length, 1, '同一步多帧只落一条（末帧覆盖）');
  assert.equal(notes[0].meta.step, 1);
  assert.equal(notes[0].meta.final, true);
});

test('createAutoTrizMiddleware：短中间 step 被阈值过滤，仍按实质 step 映射；turn/end 后调 persist()', () => {
  const { deps, artifacts, episodes } = makeDeps();
  const persisted: unknown[] = [];
  let persistCalls = 0;
  const depsWithPersist: TrizAutoDeps = { ...deps, persist: () => { persistCalls += 1; persisted.push('persist'); } };
  const { ctx, emit } = makeEventCtx(depsWithPersist);
  applyVia(ctx, depsWithPersist);
  emit('s-p', 'user/message', { role: 'user', content: [{ type: 'text', text: PROBLEM }] });
  emit('s-p', 'assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '先检索。' }] }, stream: [] });
  emit('s-p', 'assistant/message', { turn: 1, step: 2, message: { role: 'assistant', content: [{ type: 'text', text: FINAL }] }, stream: [] });
  emit('s-p', 'turn/end', { turn: 1, reason: 'complete' });
  const notes = artifacts.list().filter((a) => a.title.startsWith('triz: '));
  assert.equal(notes.length, 1, '短 step（“先检索。” < 阈值）被过滤，只有实质 step2 落一条');
  assert.equal(notes[0].meta.step, 2);
  assert.equal(notes[0].meta.final, true);
  assert.equal(persistCalls, 1, 'turn/end 批量映射后调 persist() 落盘（重启恢复）');
  assert.equal(episodes.filter((e) => (e as { kind: string }).kind === 'triz').length, 1, 'episodic 同步一条');
});

test('isInternalUserText：识别 harness 内部控制/检查消息；真实任务问题不误判', () => {
  assert.equal(isInternalUserText('This is an automatically generated check'), true);
  assert.equal(isInternalUserText('Time sampled while preparing turn 1, step 3...'), true);
  assert.equal(isInternalUserText('<goal_complete>\nObjective: \"调研\"...'), true);
  assert.equal(isInternalUserText('这是自动生成的检查消息，用于内部巡检。'), true);
  assert.equal(isInternalUserText('   '), true, '空文本视为内部（无可缓存内容）');
  assert.equal(isInternalUserText('分析 RPKI+BGPsec 的安全能力边界'), false, '真实任务问题不误判');
  assert.equal(isInternalUserText('以下文字帮我生成一张绘图prompt: 销售回款到账后，启动业财对账RPA程序。'), false);
});

test('nextRoundId：每次调用返回不同标识（轮聚合键单调不撞号）', () => {
  const a = nextRoundId();
  const b = nextRoundId();
  assert.notEqual(a, b, '两次调用应得到不同 roundId');
  assert.ok(a.startsWith('round-'), 'roundId 前缀 round- 便于排障');
});

test('createAutoTrizMiddleware：内部控制消息不设问题、不重置轮；本轮 note 带 roundId', () => {
  const { deps, artifacts } = makeDeps();
  const { ctx, emit } = makeEventCtx(deps);
  applyVia(ctx, deps);
  emit('s-round', 'user/message', { role: 'user', content: [{ type: 'text', text: PROBLEM }] });
  // 内部子轮（自动检查/采样）不该换轮、不该盖掉真实问题
  emit('s-round', 'user/message', { role: 'user', content: [{ type: 'text', text: 'This is an automatically generated check' }] });
  emit('s-round', 'assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '先检索。' }] }, stream: [] });
  emit('s-round', 'assistant/message', { turn: 2, step: 2, message: { role: 'assistant', content: [{ type: 'text', text: FINAL }] }, stream: [] });
  emit('s-round', 'turn/end', { turn: 2, reason: 'complete' });
  const notes = artifacts.list().filter((a) => a.title.startsWith('triz: '));
  assert.equal(notes.length, 1, '内部 user 消息不重置轮 → 只有一次轮结束，短 step1 被阈值过滤，落 1 条');
  assert.equal(notes[0].meta.step, 2);
  assert.equal(notes[0].meta.final, true);
  assert.ok(String(notes[0].title).includes(PROBLEM.slice(0, 10)), 'title 以最初真实任务开头，未被内部消息覆盖');
  assert.equal(typeof notes[0].meta.roundId, 'string', '本轮 note 带 roundId（客户端总览卡分组键）');
});

test('createAutoTrizMiddleware：新真实 user 消息开新轮 → 新 roundId，与上一轮不同', () => {
  const { deps, artifacts } = makeDeps();
  const { ctx, emit } = makeEventCtx(deps);
  applyVia(ctx, deps);
  emit('s-r2', 'user/message', { role: 'user', content: [{ type: 'text', text: PROBLEM }] });
  emit('s-r2', 'assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: FINAL }] }, stream: [] });
  emit('s-r2', 'turn/end', { turn: 1, reason: 'complete' });
  emit('s-r2', 'user/message', { role: 'user', content: [{ type: 'text', text: '下一步：反证 BGPsec 局限' }] });
  emit('s-r2', 'assistant/message', { turn: 2, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: 'BGPsec 验证 AS_PATH 抗路径操纵；局限在部署覆盖与机密性。'.repeat(4) }] }, stream: [] });
  emit('s-r2', 'turn/end', { turn: 2, reason: 'complete' });
  const notes = artifacts.list().filter((a) => a.title.startsWith('triz: '));
  assert.equal(notes.length, 2, '两轮各落一条');
  const [first, second] = notes;
  assert.equal(first.meta.final, true);
  assert.equal(second.meta.final, true);
  assert.equal(typeof first.meta.roundId, 'string');
  assert.equal(typeof second.meta.roundId, 'string');
  assert.notEqual(first.meta.roundId, second.meta.roundId, '不同轮 roundId 不同（总览卡不跨轮合并）');
  assert.ok(String(second.title).includes('反证'), '第二轮问题是新真实任务，非内部消息');
});
