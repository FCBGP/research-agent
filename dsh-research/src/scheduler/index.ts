// src/scheduler/index.ts — 阶段 4b · 第 19 项：research scheduler（周期/一次性科研调度）。
//
// ResearchScheduler 在 JobRunner（长任务队列）之上补「定时触发」：
//   三种触发器（至少一种）——
//     at     ：一次性 ISO 时刻，触发一次后 enabled=false（不重复）
//     daily  ：'HH:MM' 每日时刻，触发后顺延到下一天（周期）
//     everyMs：相对周期（毫秒），注册后立即可触发，之后每周期顺延
//   每次触发 = 执行注入的 runner（autonomous 一键流水线）→ 归档 episodic + artifact。
//   时钟可注入（now()），便于测试与 cron 复现。纯数据层，零外部依赖。
//
// 生命周期：register → nextRunAt 预排 → due()（到期未跑）→ tick() 执行并推进。
// 一次性任务 tick 后 enabled=false；周期任务自动推进 nextRunAt。
import type { ResearchMemory } from '../memory/index.ts';
import type { AutonomousInput, AutonomousReport } from '../autonomous/index.ts';

export interface ScheduleSpec {
  id: string;
  topic: string;
  hypothesis?: string;
  enabled: boolean;                // false 后不再触发
  daily?: string;                  // 'HH:MM'
  everyMs?: number;                // 周期毫秒
  at?: string;                     // ISO 一次性时刻
  validator?: string;
  supportThreshold?: number;
  lastRunAt?: string;              // 最近一次执行（ISO）
  nextRunAt?: string;              // 预排的下一次触发（ISO）
}

export interface ScheduledRun {
  scheduleId: string;
  at: string;                      // 本次实际执行时刻（ISO）
  report: AutonomousReport;
  nextRunAt?: string;
}

export interface SchedulerRegisterInput {
  id: string;
  topic: string;
  hypothesis?: string;
  daily?: string;
  everyMs?: number;
  at?: string;
  validator?: string;
  supportThreshold?: number;
  enabled?: boolean;
}

export interface ResearchSchedulerOptions {
  memory: ResearchMemory;
  runner: (input: AutonomousInput) => AutonomousReport;
  now?: () => number;              // 可注入时钟（默认 Date.now）
}

/** 纯函数：给定触发模式与上次执行时间，算出下一次 ISO 时刻（无触发 → undefined）。 */
export function nextOccurrence(
  opts: { at?: string; daily?: string; everyMs?: number; lastRunAt?: string },
  now = Date.now(),
): string | undefined {
  // 优先级：at（一次性）> daily（每日）> everyMs（周期）
  if (opts.at !== undefined) return opts.at;
  if (opts.daily !== undefined) return dailyNext(opts.daily, now);
  if (opts.everyMs !== undefined) {
    // 无上次执行 → 注册后立即可触发（nextRunAt=now）；否则 上次 + 周期
    if (!opts.lastRunAt) return new Date(now).toISOString();
    return new Date(new Date(opts.lastRunAt).getTime() + opts.everyMs).toISOString();
  }
  return undefined;
}

/** 'HH:MM' → 今日（或已过则明日）该时刻的 ISO。 */
function dailyNext(hhmm: string, now: number): string {
  const [h, m] = hhmm.split(':').map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    throw new Error(`daily 格式应为 'HH:MM'，收到 '${hhmm}'`);
  }
  const d = new Date(now);
  const candidate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0);
  if (candidate.getTime() <= now) candidate.setDate(candidate.getDate() + 1);
  return candidate.toISOString();
}

export class ResearchScheduler {
  private readonly memory: ResearchMemory;
  private readonly runner: (input: AutonomousInput) => AutonomousReport;
  private readonly now: () => number;
  private readonly schedules = new Map<string, ScheduleSpec>();

  constructor(opts: ResearchSchedulerOptions) {
    this.memory = opts.memory;
    this.runner = opts.runner;
    this.now = opts.now ?? (() => Date.now());
  }

  register(input: SchedulerRegisterInput): ScheduleSpec {
    if (!input.daily && !input.everyMs && !input.at) {
      throw new Error(`register 至少需要 at / daily / everyMs 之一（id=${input.id}）`);
    }
    if (input.everyMs !== undefined && input.everyMs <= 0) {
      throw new Error(`everyMs 必须为正数（id=${input.id}）`);
    }
    const spec: ScheduleSpec = {
      id: input.id,
      topic: input.topic,
      hypothesis: input.hypothesis,
      enabled: input.enabled !== false,
      daily: input.daily,
      everyMs: input.everyMs,
      at: input.at,
      validator: input.validator,
      supportThreshold: input.supportThreshold,
    };
    spec.nextRunAt = nextOccurrence(spec, this.now());
    this.schedules.set(spec.id, spec);
    this.memory.episodic.record({
      kind: 'note',
      summary: `调度注册：${spec.id}「${spec.topic}」，nextRunAt=${spec.nextRunAt ?? 'n/a'}`,
      meta: { scheduleId: spec.id, trigger: spec.at ? 'at' : spec.daily ? 'daily' : 'everyMs' },
    });
    return spec;
  }

  get(id: string): ScheduleSpec | undefined {
    return this.schedules.get(id);
  }

  unregister(id: string): boolean {
    return this.schedules.delete(id);
  }

  list(): ScheduleSpec[] {
    return [...this.schedules.values()];
  }

  /** 到期（enabled 且 nextRunAt ≤ now）的调度。 */
  due(): ScheduleSpec[] {
    const nowMs = this.now();
    return [...this.schedules.values()].filter(
      (s) => s.enabled && s.nextRunAt !== undefined && new Date(s.nextRunAt as string).getTime() <= nowMs,
    );
  }

  /** 触发所有到期调度：执行 runner、推进/禁用、归档；返回本次运行列表。 */
  tick(): ScheduledRun[] {
    const runs: ScheduledRun[] = [];
    for (const spec of this.due()) {
      const at = new Date(this.now()).toISOString();
      let report: AutonomousReport;
      try {
        report = this.run(spec);
      } catch (err) {
        this.memory.episodic.record({
          kind: 'note',
          summary: `调度 ${spec.id}「${spec.topic}」执行失败：${toMessage(err)}`,
          outcome: 'failed',
          meta: { scheduleId: spec.id },
        });
        // 失败也推进状态，避免同一 tick 死循环重试：
        // 一次性任务禁用；周期任务顺延。
        if (spec.at !== undefined) {
          spec.enabled = false;
          spec.nextRunAt = undefined;
        } else {
          spec.nextRunAt = nextOccurrence(spec, this.now());
        }
        continue;
      }
      spec.lastRunAt = at;
      if (spec.at !== undefined) {
        // 一次性：执行一次后禁用。
        spec.enabled = false;
        spec.nextRunAt = undefined;
      } else {
        spec.nextRunAt = nextOccurrence(spec, this.now());
      }
      runs.push({ scheduleId: spec.id, at, report, nextRunAt: spec.nextRunAt });
    }
    return runs;
  }

  /** 执行一次调度：episodic 记录 + runner 编排 + artifact 归档。 */
  private run(spec: ScheduleSpec): AutonomousReport {
    this.memory.episodic.record({
      kind: 'decision',
      summary: `调度 ${spec.id} 开始执行「${spec.topic}」`,
      meta: { scheduleId: spec.id },
    });
    const report = this.runner({
      topic: spec.topic,
      hypothesis: spec.hypothesis,
      validator: spec.validator as AutonomousInput['validator'],
      supportThreshold: spec.supportThreshold,
    });
    this.memory.artifact.put({
      kind: 'report',
      title: `schedule: ${spec.id} ${spec.topic}`,
      body: report.summary,
      meta: { scheduleId: spec.id, verdict: report.campaign?.verdict },
    });
    this.memory.episodic.record({
      kind: 'note',
      summary: `调度 ${spec.id}「${spec.topic}」完成，verdict=${report.campaign?.verdict ?? 'n/a'}`,
      outcome: 'done',
      meta: { scheduleId: spec.id },
    });
    return report;
  }
}

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
