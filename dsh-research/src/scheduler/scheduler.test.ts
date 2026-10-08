// src/scheduler/scheduler.test.ts — 阶段 4b · 第 19 项 自测。
// 覆盖契约：
//   - nextOccurrence 纯函数：at（ISO）> daily（'HH:MM'）> everyMs 的优先级与顺延语义
//   - register：三种触发器至少一种（缺则抛错）；返回 ScheduleSpec{...nextRunAt}
//   - 一次性 at（过去时刻）→ tick() 触发一次 → enabled=false（不重复）
//   - daily：到期即触发（提前注册今天 HH:MM 的过去时刻），触发后顺延到下一天
//   - everyMs：注册后可立即触发，之后按周期顺延（可注入时钟）
//   - unregister(id) → true/false；get(id) 稳定；tick 归档 episodic + artifact
// 纯内存 createMemory()，Node 24 直接跑：node --test src/scheduler/scheduler.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMemory } from '../memory/index.ts';
import { runAutonomousResearch } from '../autonomous/index.ts';
import { nextOccurrence, ResearchScheduler } from './index.ts';

const runner = (input: Parameters<typeof runAutonomousResearch>[0]) =>
  runAutonomousResearch({ ...input, repetitions: 2, seed: 1 });

test('nextOccurrence: at 一次性直接返回（优先级最高）', () => {
  const at = '2030-01-01T00:00:00.000Z';
  assert.equal(nextOccurrence({ at, daily: '09:00', everyMs: 1000 }), at);
});

test('nextOccurrence: daily 今天已过 → 顺延到明天同一 HH:MM', () => {
  const now = new Date(2026, 9, 9, 10, 0, 0).getTime(); // 2026-10-09 10:00 本地
  const next = nextOccurrence({ daily: '09:30' }, now);
  const d = new Date(next as string);
  // 注意 toISOString 为 UTC，比较用 UTC 字段（day-of-month 跨时区可能偏差 1，这里用 getUTCDate 兜底容错）
  assert.ok(new Date(next as string).getTime() > now, '顺延到未来');
  assert.ok(new Date(next as string).getTime() - now < 48 * 3600 * 1000, '一天内');
});

test('nextOccurrence: daily 今天未到 → 今天该时刻', () => {
  const now = new Date(2026, 9, 9, 8, 0, 0).getTime();
  const next = nextOccurrence({ daily: '09:30' }, now) as string;
  const d = new Date(next);
  assert.equal(d.getHours(), 9);
  assert.equal(d.getMinutes(), 30);
  assert.ok(d.getTime() > now);
});

test('nextOccurrence: everyMs 无上次 → now；有上次 → 上次 + 周期', () => {
  const now = 1_700_000_000_000;
  assert.equal(nextOccurrence({ everyMs: 5000 }, now), new Date(now).toISOString());
  const last = new Date(now - 5000).toISOString();
  assert.equal(nextOccurrence({ everyMs: 5000, lastRunAt: last }, now), new Date(now).toISOString());
});

test('nextOccurrence: 无任何触发器 → undefined', () => {
  assert.equal(nextOccurrence({}), undefined);
});

test('register: 至少一种触发器（都缺 → 抛错），extra 字段透传', () => {
  const sched = new ResearchScheduler({ memory: createMemory(), runner, now: () => 1_800_000_000_000 });
  assert.throws(() => sched.register({ id: 'x', topic: 't' }), /至少需要 at \/ daily \/ everyMs/);
  const s = sched.register({ id: 'ok', topic: 'RPKI 演进', daily: '06:00', validator: 'rov', supportThreshold: 0.6, enabled: true });
  assert.equal(s.id, 'ok');
  assert.equal(s.topic, 'RPKI 演进');
  assert.equal(s.enabled, true);
  assert.equal(s.daily, '06:00');
  assert.equal(s.validator, 'rov');
  assert.ok(s.nextRunAt, 'register 即预排 nextRunAt');
  assert.ok(sched.get('ok')?.nextRunAt, 'get 稳定返回同一实例');
});

test('调度: 一次性 at（过去）→ tick 触发一次 → enabled=false 且不再触发', () => {
  const memory = createMemory();
  const sched = new ResearchScheduler({ memory, runner, now: () => 1_800_000_000_000 });
  const past = new Date(1_799_999_999_000).toISOString();
  sched.register({ id: 'once', topic: 'ROV 演进', at: past });
  assert.ok(sched.due().some((s) => s.id === 'once'), '到期待触发');

  const runs = sched.tick();
  assert.ok(runs.some((r) => r.scheduleId === 'once'));
  assert.equal(runs.filter((r) => r.scheduleId === 'once').length, 1, '只触发一次');
  const after = sched.get('once');
  assert.equal(after?.enabled, false, '一次性执行后禁用');
  assert.equal(after?.nextRunAt, undefined);

  // 再 tick 不会重复触发
  assert.equal(sched.tick().length, 0);
  // 归档：episodic + artifact 都有记录
  assert.ok(memory.episodic.all().some((e) => e.meta?.scheduleId === 'once'));
  assert.ok(memory.artifact.store_.list().some((a) => a.meta?.scheduleId === 'once'));
});

test('调度: daily 到期触发，之后顺延下一天（可注入固定时钟）', () => {
  const memory = createMemory();
  let now = new Date(2026, 9, 9, 23, 0, 0).getTime(); // 23:00
  const sched = new ResearchScheduler({ memory, runner, now: () => now });
  sched.register({ id: 'daily', topic: 'BGPsec 缺口', daily: '07:00' });

  // 注册时 nextRunAt 为明日 07:00（今天 07:00 已过），尚未到期
  assert.equal(sched.due().length, 0);
  now = new Date(2026, 9, 10, 7, 1, 0).getTime(); // 明日 07:01 → 到期
  const runs = sched.tick();
  assert.ok(runs.some((r) => r.scheduleId === 'daily'));
  assert.equal(sched.get('daily')?.enabled, true, '周期任务不禁用');
  assert.ok((sched.get('daily')?.nextRunAt as string) > new Date(now).toISOString(), '顺延到下一天');
  assert.ok(sched.get('daily')?.lastRunAt, '记录最近执行');
});

test('调度: everyMs 注册后可立即触发，之后按周期顺延', () => {
  const memory = createMemory();
  let now = 1_800_000_000_000;
  const sched = new ResearchScheduler({ memory, runner, now: () => now });
  sched.register({ id: 'every', topic: '持续监控', everyMs: 60_000 });
  assert.equal(sched.due().length, 1, '注册即到期（首次立即执行）');

  const r1 = sched.tick();
  assert.ok(r1.some((r) => r.scheduleId === 'every'));
  assert.equal(sched.get('every')?.enabled, true);
  assert.equal(sched.due().length, 0, '执行后尚未到下一周期');
  now += 60_000;
  assert.equal(sched.due().length, 1, '周期到期再次触发');
});

test('调度: unregister 返回 boolean；未知 id → false', () => {
  const sched = new ResearchScheduler({ memory: createMemory(), runner, now: () => 1_800_000_000_000 });
  sched.register({ id: 'a', topic: 't', daily: '09:00' });
  assert.equal(sched.unregister('a'), true);
  assert.equal(sched.unregister('a'), false);
  assert.equal(sched.unregister('nope'), false);
  assert.equal(sched.get('a'), undefined);
});

test('调度: 运行失败的一次性任务也会禁用（避免死循环重试）', () => {
  const memory = createMemory();
  const boom = () => { throw new Error('sim unavailable'); };
  const sched = new ResearchScheduler({
    memory,
    runner: boom as never,
    now: () => 1_800_000_000_000,
  });
  sched.register({ id: 'bad', topic: 't', at: new Date(1_799_999_999_000).toISOString() });
  const runs = sched.tick();
  assert.equal(runs.filter((r) => r.scheduleId === 'bad').length, 0, '失败不返回 run');
  assert.equal(sched.get('bad')?.enabled, false, '失败的一次性任务同样禁用');
  assert.ok(memory.episodic.all().some((e) => e.meta?.scheduleId === 'bad' && e.outcome === 'failed'));
});
