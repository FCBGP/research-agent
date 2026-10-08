// src/self-improve/index.ts — 阶段 4b · 第 20 项：self-improvement（自省闭环）。
//
// SelfImprover 从 ResearchMemory 五类记忆里做「复盘式自省」：
//   - 快照（snapshot）：episodes / artifacts / hypotheses / evidence（含未核验）/ jobs / scheduled
//   - 观察（observations）：按类型分桶计数
//   - 建议（recommendations）：按优先级给出可执行改进动作
//   - summary：一段可读自省摘要（固定包含「改进建议」字样）
//   自省本身也会归档一条 episodic（反思留痕、可追溯）。
//
// 纪律：先把快照定格，再归档反思——保证「冷启动自省 snapshot.episodes === 0」。
import type { ResearchMemory } from '../memory/index.ts';
import type { EpisodeKind } from '../memory/types.ts';

export interface ReflectionObservation {
  kind: string;         // 观察维度：episodic|artifact|hypothesis|evidence|job|schedule|unverified
  count: number;
  detail?: string;
}

export interface ReflectionRecommendation {
  priority: 'high' | 'medium' | 'low';
  action: string;
}

export interface ReflectionSnapshot {
  episodes: number;     // 情景事件总数
  artifacts: number;    // 产出档案总数
  claims: number;       // 领域 claim 数（由 episodic decision 估算）
  hypotheses: number;   // 假设池大小
  evidence: number;     // 证据台账条目
  unverified: number;   // 未点亮核验灯的证据
  jobs: number;         // 长任务数（episodic meta.jobId）
  scheduled: number;    // 调度触发次数（episodic meta.scheduleId）
}

export interface ReflectionReport {
  at: string;
  summary: string;                     // 必须含「改进建议」
  snapshot: ReflectionSnapshot;
  observations: ReflectionObservation[];
  recommendations: ReflectionRecommendation[];
}

export class SelfImprover {
  private readonly memory: ResearchMemory;

  constructor(memory: ResearchMemory) {
    this.memory = memory;
  }

  reflect(): ReflectionReport {
    const at = new Date().toISOString();
    const episodes = this.memory.episodic.all();
    const artifacts = this.memory.artifact.store_.list();
    const hypotheses = this.memory.hypothesis.all();
    const evidence = this.memory.evidence.all();
    const unverified = evidence.filter((e) => !e.verified).length;
    const jobs = episodes.filter((e) => e.meta?.jobId !== undefined).length;
    const scheduled = episodes.filter((e) => e.meta?.scheduleId !== undefined).length;

    // 1) 快照（先定格，再归档反思，保证冷启动为 0）
    const snapshot: ReflectionSnapshot = {
      episodes: episodes.length,
      artifacts: artifacts.length,
      claims: episodes.filter((e) => e.kind === 'decision').length,
      hypotheses: hypotheses.length,
      evidence: evidence.length,
      unverified,
      jobs,
      scheduled,
    };

    // 2) 观察（按维度分桶）
    const observations: ReflectionObservation[] = [];
    for (const kind of ['search', 'read', 'hypothesis', 'experiment', 'verify', 'decision', 'note'] as EpisodeKind[]) {
      const n = episodes.filter((e) => e.kind === kind).length;
      if (n > 0) observations.push({ kind: `episodic:${kind}`, count: n });
    }
    observations.push(
      { kind: 'episodic', count: episodes.length },
      { kind: 'artifact', count: artifacts.length },
      { kind: 'hypothesis', count: hypotheses.length },
      { kind: 'evidence', count: evidence.length },
      { kind: 'unverified', count: unverified },
      { kind: 'job', count: jobs },
      { kind: 'schedule', count: scheduled },
    );

    // 3) 建议（按优先级 + 可执行动作）
    const recommendations: ReflectionRecommendation[] = [];
    if (unverified > 0) {
      recommendations.push({
        priority: 'high',
        action: `核验 ${unverified} 条未点亮核验灯的证据：为每条关联 claim 跑 research_verify 并 markVerified。`,
      });
    }
    if (evidence.length > 0 && snapshot.claims === 0) {
      recommendations.push({
        priority: 'high',
        action: '存在证据但无领域 claim 决策：用 research_record 把证据折叠为以 claim 为中心的结论。',
      });
    }
    if (jobs > 0) {
      recommendations.push({
        priority: 'medium',
        action: `复盘 ${jobs} 个长任务：把失败任务（cancel/异常）提取为反例与后续改进，成功任务沉淀为可复用 pipeline。`,
      });
    }
    if (scheduled > 0) {
      recommendations.push({
        priority: 'medium',
        action: `审视 ${scheduled} 次调度触发：周期性任务收敛为 research_campaign 自动战役，避免重复劳动。`,
      });
    }
    if (episodes.length === 0 && artifacts.length === 0) {
      recommendations.push({
        priority: 'high',
        action: '冷启动：先跑一轮 research_autonomous 建立第一条 claim → 实验 → 论文证据链，再定期 reflect 复盘。',
      });
    }
    if (recommendations.length === 0) {
      recommendations.push({
        priority: 'low',
        action: '保持「claim → 实验 → 反证 → 归档」闭环与健康节奏，定期 reflect 持续改进。',
      });
    }

    // 4) 摘要（含「改进建议」字样）
    const recText = recommendations.map((r) => `[${r.priority}] ${r.action}`).join('；');
    const summary =
      `自省 @ ${at}：累计 ${episodes.length} 条情景事件、${artifacts.length} 条产出、` +
      `${hypotheses.length} 条假设、${evidence.length} 条证据（${unverified} 条未核验）、` +
      `${jobs} 个长任务、${scheduled} 次调度。` +
      `改进建议：${recText || '暂无可执行项'}。`;

    // 5) 反思留痕（归档在快照之后 → 冷启动 snapshot.episodes 仍为 0）
    this.memory.episodic.record({
      kind: 'note',
      summary: `自省：产出 ${recommendations.length} 条改进建议`,
      outcome: 'reflected',
      meta: { kind: 'reflection', recommendations: recommendations.length },
    });

    return { at, summary, snapshot, observations, recommendations };
  }
}
