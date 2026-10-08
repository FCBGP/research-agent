// research-loop — 主科研循环驱动：接收 ResearchGoal，交给 Director 调度，
// 并对外暴露"一轮运行"的单调接口（供 plugin 挂到 researchCore.loop）。
import { ResearchDirector, type RunOptions, type RunReport } from '../research-director/director.ts';
import type { ResearchGoal } from '../core/types.ts';
import type { ResearchMemory } from '../memory/index.ts';
import type { ResearchAgents } from '../agents/index.ts';

export interface ResearchLoop {
  run(goal: ResearchGoal, opts?: RunOptions): RunReport;
}

export function createResearchLoop(memory: ResearchMemory, agents: ResearchAgents): ResearchLoop {
  const director = new ResearchDirector(memory, agents);
  return {
    run: (goal, opts) => director.run(goal, opts),
  };
}

export { ResearchDirector } from '../research-director/director.ts';
