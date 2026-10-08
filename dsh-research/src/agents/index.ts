// ResearchAgents — 三个角色 agent 的组装门面（Literature / Reviewer / Experiment）。
import { LiteratureAgent, type LiteratureSource } from './literature.ts';
import { LocalCorpusSource } from './literature.ts';
import { SEED_CORPUS } from './corpus.ts';
import { ReviewerAgent } from './reviewer.ts';
import { ExperimentAgent, type Executor } from './experiment.ts';
import type { ResearchMemory } from '../memory/index.ts';

export interface AgentOptions {
  source?: LiteratureSource;
  executor?: Executor;
  memory?: ResearchMemory;
}

export interface ResearchAgents {
  literature: LiteratureAgent;
  reviewer: ReviewerAgent;
  experiment: ExperimentAgent;
}

/** 组装三个角色 agent；共享同一份 ResearchMemory 时检索/实验可自动记录情景。 */
export function createAgents(opts: AgentOptions = {}): ResearchAgents {
  const memory = opts.memory;
  const literature = new LiteratureAgent(
    opts.source ?? new LocalCorpusSource(SEED_CORPUS),
    memory?.episodic,
    memory?.semantic,
  );
  return {
    literature,
    reviewer: new ReviewerAgent(),
    experiment: new ExperimentAgent(opts.executor),
  };
}

export * from './literature.ts';
export * from './corpus.ts';
export * from './reviewer.ts';
export * from './experiment.ts';
