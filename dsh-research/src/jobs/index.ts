// src/jobs/index.ts — 阶段 4b · 第 18 项：long-running jobs（长任务队列）。
//
// JobRunner 管理科研长任务队列：submit({kind, title, run}) 把任务入队并立即执行。
// run 为「执行体」，由调用方注入（research=autonomous.run，campaign=experiment.runAutomatic），
// 同时支持同步返回值与 Promise（同步/异步执行体）。
//
// 生命周期：pending → running → done | failed。
//   - 同步执行体：submit() 返回时即达终态（status ∈ {done, failed}）——「submit 后同步跑完即终态」；
//   - 异步执行体：promise 落定时终态。
// 完成/失败都会归档 ResearchMemory：
//   - episodic（情景记忆）：一条 job 记录（kind=note，outcome=status）
//   - artifact（产出记忆）：kind=result（成功） / kind=evidence-log（失败）
// get(id)/list() 只读稳定；cancel(id) 仅允许取消未开始（pending）的任务，已开始/未知返回 false。
import type { ResearchMemory } from '../memory/index.ts';

export type JobKind = 'research' | 'campaign';
export type JobStatus = 'pending' | 'running' | 'done' | 'failed';

export interface Job {
  id: string;
  kind: JobKind;
  title: string;
  status: JobStatus;
  progress: number;   // 0..1
  error?: string;
  createdAt: string;  // ISO
}

export interface JobInput {
  kind: JobKind;
  title: string;
  run: () => unknown | Promise<unknown>;  // 同步/异步执行体
}

let seq = 0;

export class JobRunner {
  private readonly memory: ResearchMemory;
  private readonly jobs = new Map<string, Job>();

  constructor(memory: ResearchMemory) {
    this.memory = memory;
  }

  submit(input: JobInput): Job {
    const job: Job = {
      id: `job-${(++seq).toString(36)}-${Date.now().toString(36)}`,
      kind: input.kind,
      title: input.title,
      status: 'pending',
      progress: 0,
      createdAt: new Date().toISOString(),
    };
    this.jobs.set(job.id, job);
    this.start(job, input.run);
    return job;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  list(): Job[] {
    return [...this.jobs.values()];
  }

  /** 仅未开始（pending）的任务可取消；返回 true 表示取消成功。 */
  cancel(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job || job.status !== 'pending') return false;
    this.fail(job, 'cancelled by user');
    return true;
  }

  private start(job: Job, run: () => unknown | Promise<unknown>): void {
    job.status = 'running';
    try {
      const result = run();
      if (isThenable(result)) {
        // 异步执行体：promise 落定时终态。
        void Promise.resolve(result).then(
          () => this.succeed(job),
          (err) => this.fail(job, toMessage(err)),
        );
      } else {
        // 同步执行体：submit 未返回时即终态。
        this.succeed(job);
      }
    } catch (err) {
      this.fail(job, toMessage(err));
    }
  }

  private succeed(job: Job): void {
    job.status = 'done';
    job.progress = 1;
    this.archive(job);
  }

  private fail(job: Job, error: string): void {
    job.status = 'failed';
    job.error = error;
    this.archive(job);
  }

  /** 完成/失败都归档 episodic + artifact（可追溯、可复盘）。 */
  private archive(job: Job): void {
    const ok = job.status === 'done';
    this.memory.episodic.record({
      kind: 'note',
      summary: `job ${job.id}（${job.kind}）「${job.title}」→ ${job.status}`,
      outcome: job.status,
      meta: { jobId: job.id, kind: job.kind, error: job.error },
    });
    this.memory.artifact.put({
      kind: ok ? 'result' : 'evidence-log',
      title: `job: ${job.id} ${job.title}`,
      body: ok
        ? `长任务 ${job.id}（${job.kind}）「${job.title}」完成。`
        : `长任务 ${job.id}（${job.kind}）「${job.title}」失败：${job.error ?? 'unknown error'}`,
      meta: { jobId: job.id, kind: job.kind, status: job.status },
    });
  }
}

function isThenable(v: unknown): v is PromiseLike<unknown> {
  return typeof v === 'object' && v !== null && typeof (v as { then?: unknown }).then === 'function';
}

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
