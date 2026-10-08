// experiment-loop — 实验循环：对仍存疑的假设批量 plan → run → 分析，
// 结果写证据记忆并把 Executor 结果折入验证（experiment 是否 support）。
import type { ExperimentResult, ResearchClaim } from '../core/types.ts';
import type { ResearchMemory } from '../memory/index.ts';
import { ExperimentAgent, type Executor, type ExperimentPlan, type Statistics } from '../agents/experiment.ts';

export interface ExperimentOutcome {
  plan: ExperimentPlan;
  result: ExperimentResult;
  stats?: Statistics;
}

export function runExperimentLoop(
  memory: ResearchMemory,
  agent: ExperimentAgent,
  claims: ResearchClaim[],
  { repetitions = 1, executor }: { repetitions?: number; executor?: Executor } = {},
): ExperimentOutcome[] {
  const outcomes: ExperimentOutcome[] = [];
  for (const c of claims) {
    const plan = agent.plan({
      claimId: c.id,
      claimStatement: c.statement,
      env: 'frr',
      repetitions,
    });
    const results: ExperimentResult[] = [];
    for (let i = 0; i < repetitions; i += 1) {
      const r = executor ? executor.run(plan) : agent.run(plan);
      results.push(r);
    }
    const sample = results[0];
    memory.episodic.record({
      kind: 'experiment',
      summary: `${plan.configFingerprint}（${plan.scenario}）`,
      claimId: c.id,
      outcome: sample.outcome,
      source: plan.env,
    });
    for (const ev of c.evidence) memory.evidence.add(c.id, { source: ev.source, evidence: ev.evidence, confidence: ev.confidence, verified: ev.verified });
    outcomes.push({ plan, result: sample, stats: agent.analyze(results, plan.metrics[0]) });
  }
  return outcomes;
}
