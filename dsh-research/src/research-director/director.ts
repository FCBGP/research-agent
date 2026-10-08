// ResearchDirector — 科研任务的调度中枢：ResearchGoal → 任务 DAG → 按角色
// 分派（检索/假设/实验/验证/写作）→ 记忆写入 → 产出归档。
//
// 纯领域调度（同步、有界迭代）：不碰 dsh 运行时，可测；插件把本类挂到
// ctx 的 researchCore.director / researchAgents.director 上供模型调用。
import type { ResearchGoal, ResearchClaim, ResearchTask, Verdict, ExperimentResult } from '../core/types.ts';
import { selectNext, unlock } from '../core/dag.ts';
import { newClaim, addEvidence } from '../core/claim.ts';
import { runVerification } from '../core/verification.ts';
import type { ResearchMemory } from '../memory/index.ts';
import type { ResearchAgents } from '../agents/index.ts';
import type { Episode } from '../memory/types.ts';

export interface RunOptions {
  maxIter?: number;          // 单轮调度上限（默认 20）
  withExperiment?: boolean;  // 是否让实验任务触发 StubExecutor
}

export interface RunReport {
  goalId: string;
  iterations: number;
  episodes: Episode[];
  claims: Map<string, Verdict>;
  artifacts: string[];
}

export class ResearchDirector {
  private memory: ResearchMemory;
  private agents: ResearchAgents;
  constructor(memory: ResearchMemory, agents: ResearchAgents) {
    this.memory = memory;
    this.agents = agents;
  }

  /** 跑一轮"计划→执行→验证→归档"：直到无 ready 任务或达迭代上限。 */
  run(goal: ResearchGoal, opts: RunOptions = {}): RunReport {
    const maxIter = opts.maxIter ?? 20;
    const report: RunReport = { goalId: goal.id, iterations: 0, episodes: [], claims: new Map(), artifacts: [] };
    const claimOf = new Map<string, ResearchClaim>();
    for (const c of goal.claims) claimOf.set(c.id, c);

    let iter = 0;
    while (iter < maxIter) {
      const task = selectNext(goal.tasks);
      if (!task) break;
      iter += 1;
      report.iterations = iter;

      const ctxTask = this.memory.episodic.record({
        kind: 'decision', summary: `执行任务 ${task.id}（${task.title}）`, claimId: task.produceClaims[0],
      });
      report.episodes.push(ctxTask);

      const produced: ResearchClaim[] = this.dispatch(task, goal, claimOf, opts);
      for (const c of produced) {
        claimOf.set(c.id, c);
        if (!goal.claims.some((x) => x.id === c.id)) goal.claims.push(c);
      }
      // 写回终态 + 解锁（调度执行成功即 done；实验/验证/写作任务按设计不返回 claim）
      goal.tasks = unlock(goal.tasks, [{ ...task, status: 'done' }]);
    }

    // 独立验证扫描：对未决 claim 跑一次验证闭环，产出 verbose 记录。
    for (const c of claimOf.values()) {
      const exp = goal.experiments.find((e) => e.claim === c.id);
      const v = runVerification(c, exp);
      report.claims.set(c.id, v.verdict);
      this.memory.episodic.record({ kind: 'verify', summary: `验证 ${c.id} → ${v.verdict}`, claimId: c.id, outcome: v.verdict });
      this.memory.artifact.put({ kind: 'result', title: `verdict: ${c.id}`, body: v.rationale, claimId: c.id, meta: { verdict: v.verdict } });
      report.artifacts.push(this.memory.artifact.recall(c.id)[0].id);
    }
    return report;
  }

  private dispatch(task: ResearchTask, goal: ResearchGoal, claimOf: Map<string, ResearchClaim>, opts: RunOptions): ResearchClaim[] {
    switch (task.kind) {
      case 'search':
      case 'read': {
        this.memory.episodic.record({ kind: 'read', summary: `阅读文献以支撑 ${task.id}`, claimId: task.produceClaims[0], source: 'literature' });
        // 检索命中沉淀为语义事实（若语料有相关文献）
        const hits = this.agents.literature.search(task.title, 3);
        const c = newClaim({ statement: `${task.title}（基于 ${hits.length} 条命中沉淀）`, type: 'Fact', source: 'literature' });
        for (const h of hits) {
          addEvidence(c, { source: h.paper.title, evidence: h.paper.abstract, confidence: 0.7, verified: true, relatedClaims: [] });
        }
        return [c];
      }
      case 'hypothesis': {
        const stmt = this.memory.hypothesis.propose(task.title, task.produceClaims[0]);
        this.memory.episodic.record({ kind: 'hypothesis', summary: `提出假设 ${stmt.statement}`, claimId: task.produceClaims[0] });
        return [newClaim({ statement: task.title, type: 'Hypothesis', source: 'director', dependencies: task.consumesClaims })];
      }
      case 'experiment': {
        if (!task.produceClaims[0]) return [];
        const stmt = claimOf.get(task.produceClaims[0])?.statement ?? task.title;
        const plan = this.agents.experiment.plan({ claimId: task.produceClaims[0], claimStatement: stmt, env: opts.withExperiment === false ? 'sim' : 'frr' });
        this.memory.episodic.record({ kind: 'experiment', summary: `实验 ${plan.configFingerprint}（${plan.scenario}）`, claimId: task.produceClaims[0], outcome: plan.env });
        const result = this.agents.experiment.run(plan);
        goal.experiments.push(result);
        this.memory.artifact.put({ kind: 'experiment', title: plan.configFingerprint, body: JSON.stringify(result.data), claimId: task.produceClaims[0], meta: { env: plan.env } });
        return [];
      }
      case 'verify': {
        // 验证任务：对本任务消费的 claim 跑验证闭环
        const produced: ResearchClaim[] = [];
        for (const cid of task.consumesClaims) {
          const c = claimOf.get(cid);
          if (!c) continue;
          const v = runVerification(c, goal.experiments.find((e) => e.claim === cid));
          this.memory.episodic.record({ kind: 'verify', summary: `${cid} → ${v.verdict}`, claimId: cid, outcome: v.verdict });
          this.memory.artifact.put({ kind: 'result', title: `${cid} verdict`, body: v.rationale, claimId: cid, meta: { verdict: v.verdict } });
        }
        return produced;
      }
      case 'write': {
        this.memory.artifact.put({ kind: 'report', title: task.title, body: `Goal ${goal.id} 的写作任务产出`, claimId: task.produceClaims[0], meta: { task: task.id } });
        return [];
      }
      default:
        return [];
    }
  }
}
