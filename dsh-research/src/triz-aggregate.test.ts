// triz-aggregate.test.ts — 客户端「本轮 TRIZ 总览卡」聚合逻辑自测（阶段 12，2026-10-26）。
//
// 在 None（Node 24 strip-only）下直接 import client/route.ts（纯函数、无 DOM 依赖），
// 覆盖这份决定「侧边栏怎么分组展示」的核心逻辑：
//   (1) 手动 research_triz 调用（无 step）→ 逐条单卡
//   (2) triz-auto 有 step 的自动 note → 按「轮」聚合：roundId 优先，旧数据回落
//       createdAt+sessionId+step 相邻性启发式（2026-10-21 批量快照同毫秒多轮混存）
//   (3) 原理合集去重、最终结论取最终答案步、内部控制问题标 problemInternal
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregateTrizRounds, isInternalProblemText, type TrizNoteView, type TrizPrincipleView } from '../client/route.ts';

function note(overrides: Partial<TrizNoteView> & { step?: number | undefined }): TrizNoteView {
  return {
    artifactId: `art-${Math.random().toString(36).slice(2, 8)}`,
    title: 'triz: x',
    problem: 'x',
    source: 'curated-matrix',
    contradictionOrigin: 'default',
    candidates: [],
    hypotheses: [],
    createdAt: '2026-10-26T00:00:00.000Z',
    ...overrides,
  } as TrizNoteView;
}

function p(no: number): TrizPrincipleView {
  return { no, name: `P${no}`, summary: `s${no}`, routingHint: `h${no}` };
}

test('aggregateTrizRounds：手动 note（无 step）逐条单卡；自动 note 按轮聚合', () => {
  const manual = note({ problem: '手动矛盾分析', candidates: [p(1)] });
  const r1 = note({ problem: '问题A', step: 1, final: false, candidates: [p(23)], hypotheses: ['h1'], roundId: 'round-a', sessionId: 'sess' });
  const r2 = note({ problem: '问题A', step: 2, final: true, candidates: [p(2)], hypotheses: ['h2'], roundId: 'round-a', sessionId: 'sess' });
  const { manual: m, rounds } = aggregateTrizRounds([manual, r1, r2]);
  assert.equal(m.length, 1, '手动 note 保持单卡');
  assert.equal(m[0].problem, '手动矛盾分析');
  assert.equal(rounds.length, 1, '同轮多步聚合为一张');
  assert.equal(rounds[0].stepCount, 2);
  assert.equal(rounds[0].finalStep, 2);
  // 原理合集去重 + 最终结论取最终答案步
  assert.deepEqual(rounds[0].candidates.map((c) => c.no), [23, 2], '全步骤原理合集（去重，按出现序）');
  assert.deepEqual(rounds[0].hypotheses, ['h2'], '最终结论 = 最终答案步的说明');
});

test('aggregateTrizRounds：旧数据无 roundId → 回落 createdAt+sessionId+step 相邻性启发式', () => {
  // 同 createdAt + 同会话，但 step 不连续（跨子轮/被阈值过滤）→ 应拆成多轮
  const a = note({ step: 71, final: false, candidates: [p(23)], problem: 'A', createdAt: '2026-10-21T08:38:28.958Z', sessionId: 'sess' });
  const b = note({ step: 72, final: true, candidates: [p(2)], problem: 'A', createdAt: '2026-10-21T08:38:28.958Z', sessionId: 'sess' });
  const c = note({ step: 4, final: true, candidates: [p(13)], problem: 'B', createdAt: '2026-10-21T08:38:28.958Z', sessionId: 'sess' });
  const { rounds } = aggregateTrizRounds([a, b, c]);
  assert.equal(rounds.length, 2, '相邻步 [71,72] 一轮、步 4（跳变）另一轮');
  const steps = rounds.map((r) => r.detail.map((d) => d.step));
  assert.deepEqual(steps, [[71, 72], [4]]);
  assert.equal(rounds[1].problem, 'B');
});

test('aggregateTrizRounds：roundId 优先于启发式（显式同轮即使步号跳变也不拆）', () => {
  const a = note({ step: 3, final: false, candidates: [p(1)], roundId: 'round-x', sessionId: 'sess', createdAt: '2026-10-26T00:00:00.000Z' });
  const b = note({ step: 5, final: true, candidates: [p(2)], roundId: 'round-x', sessionId: 'sess', createdAt: '2026-10-26T00:00:00.000Z' });
  const { rounds } = aggregateTrizRounds([a, b]);
  assert.equal(rounds.length, 1, '显式 roundId 同轮（步号 3→5 跳变仍不拆）');
  assert.equal(rounds[0].stepCount, 2);
});

test('aggregateTrizRounds：内部控制问题标 problemInternal；真实问题不误判', () => {
  const internal = note({ problem: 'This is an automatically generated check', step: 1, final: true, candidates: [p(1)], roundId: 'round-i', sessionId: 'sess' });
  const real = note({ problem: '分析 RPKI+BGPsec 的安全能力边界', step: 1, final: true, candidates: [p(1)], roundId: 'round-r', sessionId: 'sess' });
  const { rounds } = aggregateTrizRounds([internal, real]);
  const byProblem = Object.fromEntries(rounds.map((r) => [r.roundKey, r.problemInternal]));
  assert.equal(byProblem['round-i'], true, '自动生成检查 → 内部问题');
  assert.equal(byProblem['round-r'], false, '真实任务问题不误判');
  assert.equal(isInternalProblemText('<goal_complete> Objective: 调研'), true);
  assert.equal(isInternalProblemText('Time sampled while preparing turn 1'), true);
  assert.equal(isInternalProblemText('销售回款到账后，启动业财对账RPA程序。'), false);
});

test('aggregateTrizRounds：rounds 按 createdAt 降序，手动单卡独立排序', () => {
  const older = note({ problem: 'O', step: 1, final: true, candidates: [p(1)], roundId: 'round-old', sessionId: 'sess', createdAt: '2026-10-20T00:00:00.000Z' });
  const newer = note({ problem: 'N', step: 1, final: true, candidates: [p(2)], roundId: 'round-new', sessionId: 'sess', createdAt: '2026-10-22T00:00:00.000Z' });
  const manualOlder = note({ problem: '手动旧', candidates: [p(3)], createdAt: '2026-10-19T00:00:00.000Z' });
  const { manual, rounds } = aggregateTrizRounds([older, newer, manualOlder]);
  assert.deepEqual(rounds.map((r) => r.problem), ['N', 'O'], '轮总览按 createdAt 降序（最上=最近）');
  assert.deepEqual(manual.map((n) => n.problem), ['手动旧']);
});
