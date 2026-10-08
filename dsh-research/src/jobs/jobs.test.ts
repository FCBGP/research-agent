// src/jobs/jobs.test.ts — 阶段 4b · 第 18 项 自测。
// 覆盖契约：
//   - submit 后同步执行体跑完即终态（status ∈ {done,failed}）、progress 终值 1
//   - 异步执行体 promise 落定终态（done / failed）
//   - get(id) 稳定返回同一 Job；未知 id → undefined
//   - list() 包含已提交任务（≥1）
//   - cancel 仅未开始（pending）可取消；已开始/未知 → false
//   - 完成/失败都归档 episodic + artifact
// 纯内存 createMemory()，Node 24 直接跑：node --test src/jobs/jobs.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMemory } from '../memory/index.ts';
import { JobRunner } from './index.ts';
import { createAgents } from '../agents/index.ts';
import { runCampaign } from '../experiment/runner.ts';
import { runAutonomousResearch } from '../autonomous/index.ts';

/** 让微任务/macrotask 队列落定（异步执行体终态判定用）。 */
const flush = () => new Promise<void>((resolve) => setImmediate(() => resolve()));

test('jobs: 同步执行体 submit 返回即终态（done + progress=1）', () => {
  const runner = new JobRunner(createMemory());
  let ran = 0;
  const job = runner.submit({ kind: 'research', title: 'lit-review', run: () => { ran += 1; return { ok: true }; } });
  assert.equal(ran, 1, '同步执行体立即执行一次');
  assert.equal(job.status, 'done', 'submit 后同步跑完即终态');
  assert.equal(job.progress, 1);
  assert.equal(job.kind, 'research');
  assert.match(job.id, /^job-/);
  assert.ok(job.createdAt, 'createdAt 为 ISO 时间');
});

test('jobs: 同步执行体抛错 → failed + error', () => {
  const runner = new JobRunner(createMemory());
  const job = runner.submit({ kind: 'campaign', title: 'boom', run: () => { throw new Error('sim down'); } });
  assert.equal(job.status, 'failed');
  assert.match(job.error ?? '', /sim down/);
  assert.equal(job.progress, 0, '失败不置 progress=1');
});

test('jobs: 异步执行体 promise 落定后终态（done）', async () => {
  const runner = new JobRunner(createMemory());
  const job = runner.submit({
    kind: 'research',
    title: 'async-done',
    run: async () => { await flush(); return { ok: true }; },
  });
  assert.equal(job.status, 'running', '异步执行体尚未落定前为 running');
  await flush();
  assert.equal(job.status, 'done');
  assert.equal(job.progress, 1);
});

test('jobs: 异步执行体 reject → failed + error', async () => {
  const runner = new JobRunner(createMemory());
  const job = runner.submit({
    kind: 'campaign',
    title: 'async-boom',
    run: async () => { await flush(); throw new Error('async fail'); },
  });
  await flush();
  await flush();
  assert.equal(job.status, 'failed');
  assert.match(job.error ?? '', /async fail/);
});

test('jobs: get(id) 稳定返回同一 Job，未知 id → undefined', () => {
  const runner = new JobRunner(createMemory());
  const job = runner.submit({ kind: 'research', title: 'stable', run: () => null });
  const again = runner.get(job.id);
  assert.equal(again, job, 'get 返回同一对象引用');
  assert.deepEqual({ ...again }, { ...job }, '字段稳定一致');
  assert.equal(runner.get('job-does-not-exist'), undefined);
});

test('jobs: list() 包含已提交任务（≥1）且保序', () => {
  const runner = new JobRunner(createMemory());
  runner.submit({ kind: 'research', title: 'a', run: () => null });
  runner.submit({ kind: 'campaign', title: 'b', run: () => null });
  const list = runner.list();
  assert.ok(list.length >= 1, 'list ≥ 1');
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((j) => j.title), ['a', 'b'], '按提交序');
  assert.deepEqual(list.map((j) => j.status), ['done', 'done']);
});

test('jobs: cancel 仅未开始（pending）可取消；已开始/未知返回 false', async () => {
  const runner = new JobRunner(createMemory());
  const doneJob = runner.submit({ kind: 'research', title: 'done-cancel', run: () => null });
  assert.equal(runner.cancel(doneJob.id), false, '已终态（done）不可取消');
  const runJob = runner.submit({ kind: 'campaign', title: 'running-cancel', run: async () => { await flush(); return {}; } });
  assert.equal(runner.cancel(runJob.id), false, '运行中（running）不可取消');
  await flush();
  assert.equal(runJob.status, 'done');
  assert.equal(runner.cancel('job-missing'), false, '未知 id 不可取消');
  // 注：submit 恒同步执行，pending 仅在 submit 内部瞬时存在、外部不可观察；
  // cancel 对 pending 的语义由 `status !== 'pending' → false` 守卫保证（仅未开始可取消）。
});

test('jobs: 完成/失败都归档 episodic + artifact', () => {
  const memory = createMemory();
  const runner = new JobRunner(memory);
  runner.submit({ kind: 'campaign', title: 'arch-done', run: () => ({ fine: true }) });
  runner.submit({ kind: 'research', title: 'arch-fail', run: () => { throw new Error('x'); } });

  const eps = memory.episodic.all();
  assert.ok(eps.length >= 2, '两条 job 都记入情景记忆');
  assert.ok(eps.some((e) => e.summary.includes('arch-done') && e.outcome === 'done'));
  assert.ok(eps.some((e) => e.summary.includes('arch-fail') && e.outcome === 'failed'));

  const arts = memory.artifact.recall('job:');
  assert.ok(arts.length >= 2, '两条 job 都归档产出');
  assert.ok(arts.some((a) => a.kind === 'result' && (a.title as string).includes('arch-done')));
  assert.ok(arts.some((a) => a.kind === 'evidence-log' && (a.title as string).includes('arch-fail')));
  assert.ok(arts.every((a) => (a.meta as { jobId?: string }).jobId), '归档含 jobId 溯源');
});

// —— research_job 端到端（runner 级镜像插件 submit 路径；插件 boot 依赖 task 19/20 落地后才能整测）——
test('jobs: research_job 端到端（campaign 执行体跑真实实验并归档）', () => {
  const memory = createMemory();
  const agents = createAgents({ memory });
  const runner = new JobRunner(memory);
  // 镜像插件 research_job submit(kind=campaign) → runtime.experiment.runAutomatic 的执行体。
  const job = runner.submit({
    kind: 'campaign',
    title: 'campaign: ROV 提升劫持检测',
    run: () => runCampaign(memory, agents.experiment, {
      claim: { id: `claim-e2e-${Date.now().toString(36)}`, statement: 'ROV 提升劫持检测' },
      repetitions: 2,
      validator: 'rov',
      supportThreshold: 0.6,
    }),
  });
  assert.equal(job.status, 'done', 'submit 后同步跑完即终态');
  assert.equal(job.progress, 1);
  assert.equal(runner.get(job.id), job, 'get 稳定返回同一 Job');
  assert.ok(runner.list().length >= 1, 'list ≥ 1');

  // job 归档：episodic（note/done）+ artifact（result）
  const eps = memory.episodic.all();
  assert.ok(eps.some((e) => e.summary.includes(job.id) && e.outcome === 'done'), 'job 完成记入情景记忆');
  assert.ok(eps.some((e) => e.kind === 'experiment'), '实验战役记入情景记忆');
  const jobArts = memory.artifact.recall('job:');
  assert.ok(jobArts.some((a) => a.kind === 'result' && (a.title as string).includes(job.id)), 'job 产出归档 result');
  assert.ok(memory.artifact.byKind('experiment').length >= 1, '实验战役归档 experiment 产出');
});

// —— research_job 端到端（research=一键流水线提交，同步完成并归档）——
test('jobs: research_job 端到端（research 执行体跑一键流水线）', () => {
  const memory = createMemory();
  const agents = createAgents({ memory });
  const runner = new JobRunner(memory);
  // 镜像插件 research_job submit(kind=research) → runtime.autonomous.run 的执行体。
  const job = runner.submit({
    kind: 'research',
    title: 'research: RPKI 演进',
    run: () => runAutonomousResearch({ topic: 'RPKI 演进', repetitions: 1, validator: 'rov', supportThreshold: 0.6 }, { memory, agents }),
  });
  assert.equal(job.status, 'done', 'submit 后同步跑完即终态（research 流水线）');
  assert.equal(job.progress, 1);
  const eps = memory.episodic.all();
  assert.ok(eps.some((e) => e.summary.includes(job.id) && e.outcome === 'done'), 'research job 完成记入情景记忆');
  assert.ok(memory.artifact.recall('job:').some((a) => (a.title as string).includes(job.id)), 'research job 产出归档');
});
