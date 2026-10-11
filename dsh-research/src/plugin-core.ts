// @basil/dsh-research/core — host 平面插件 1/5：研究核心数据模型 + 五类记忆 + 三角色 agent。
//
// 阶段 5·B1 从 src/plugin.ts 抽出：搬走「researchCore / researchMemory / researchAgents」
// 三个 ctx.provide 段；researchCore 接口与实现、memory/agents 构造逻辑原样保留（语义零变化）。
// 依赖顺序最先（provides researchCore/Memory/Agents，被 research-director / research-experiment /
// research-operations 消费，见 cordis.patch.yml「host 行顺序 = 依赖顺序」）。
//
// config 承接原 dsh-research-core 行的记忆配置：memory.dir 开启记忆 JSON 落盘
// （默认全内存）；agents.enabled 保留原配置字段（与 src/plugin.ts 一致，不改行为）。
import type { Context } from '@deepseek-ai/cordis';
import { ArtifactStore } from './core/artifact-store.ts';
import { addCounterEvidence, addEvidence, newClaim, synthConfidence } from './core/claim.ts';
import { selectNext, unlock } from './core/dag.ts';
import { runVerification } from './core/verification.ts';
import type { ExperimentResult, ResearchClaim, ResearchTask } from './core/types.ts';
import { createMemory, loadMemoryInto, persistMemory, type ResearchMemory } from './memory/index.ts';
import { createAgents, type ResearchAgents } from './agents/index.ts';
import { PRODUCT_NAME, COMMAND, PROFILE_FLAG, DOMAIN_SCOPE, DOMAIN_EXECUTORS, DOMAIN_KEYWORDS, GLOSSARY, describeDomain, scopeList, executorList } from './domain/index.ts';

export const name = 'dsh-research-core';

/** 注册到 `ctx` 的研究核心服务：claim / verify / plan / artifact（与 src/plugin.ts 同款）。 */
export interface ResearchCoreService {
  claims: {
    create(input: { statement: string; type?: ResearchClaim['type']; source: string }): ResearchClaim;
    addEvidence(claim: ResearchClaim, evidence: { source: string; evidence: string; confidence: number; verified?: boolean }): ResearchClaim;
    addCounter(claim: ResearchClaim, counter: { source: string; evidence: string; confidence: number }): ResearchClaim;
    confidence(claim: ResearchClaim): number;
  };
  verify: {
    claim(claim: ResearchClaim, experiment?: ExperimentResult): { verdict: ResearchClaim['verificationStatus']; rationale: string; checks: string[] };
  };
  plan: {
    selectNext(tasks: ResearchTask[]): ResearchTask | undefined;
    unlock(tasks: ResearchTask[], finished: ResearchTask[]): ResearchTask[];
  };
  artifacts: ArtifactStore;
  /** 内置领域词汇：dsh-routing-research 命名 + 领域词表（research_* 工具可消费）。 */
  domain: ResearchDomain;
}

/** 内置领域词汇（来自 src/domain/vocabulary.ts）：dsh-routing-research 命名 + 领域词表单一口径。 */
export interface ResearchDomain {
  productName: string;
  command: string;
  profileFlag: string;
  naming: string;
  scope: readonly string[];
  executors: readonly string[];
  keywords: readonly string[];
  glossary: readonly { term: string; aliases: string[]; kind: string; def: string }[];
  scopeList(): string;
  executorList(): string;
  describe(): string;
}

export interface PluginCoreConfig {
  memory?: { dir?: string };
  agents?: { enabled?: boolean };
}

export function apply(ctx: Context, config: PluginCoreConfig = {}): void {
  const artifacts = new ArtifactStore();

  const domain: ResearchDomain = {
    productName: PRODUCT_NAME,
    command: COMMAND,
    profileFlag: PROFILE_FLAG,
    naming: `${PRODUCT_NAME} —— 域间路由安全研究 Agent（操作命令 ${COMMAND}，即 ${PROFILE_FLAG}）`,
    scope: DOMAIN_SCOPE,
    executors: DOMAIN_EXECUTORS,
    keywords: DOMAIN_KEYWORDS,
    glossary: GLOSSARY,
    scopeList,
    executorList,
    describe: describeDomain,
  };

  const researchCore: ResearchCoreService = {
    claims: {
      create: ({ statement, type = 'Hypothesis', source }) =>
        newClaim({ statement, type, source }),
      addEvidence: (claim, evidence) =>
        addEvidence(claim, { ...evidence, verified: evidence.verified ?? evidence.confidence >= 0.7 }),
      addCounter: (claim, counter) => addCounterEvidence(claim, counter),
      confidence: synthConfidence,
    },
    verify: {
      claim: (claim, experiment) => runVerification(claim, experiment),
    },
    plan: { selectNext, unlock },
    artifacts,
    domain,
  };

  const memory = createMemory();
  const agents = createAgents({ memory });

  if (config.memory?.dir) loadMemoryInto(memory, config.memory.dir);

  // 持久化归档：memory.dir 配置时给 memory 挂 persist()，research_autonomous 等
  // 流水线跑完即落盘五类记忆 + 论文/幻灯片/矩阵 artifact（AGENTS.md §10 可追溯、可归档）。
  const memoryDir = config.memory?.dir;
  const mem = memory as ResearchMemory & { persist(dir?: string): string | undefined };
  mem.persist = (dir?: string) => {
    const target = dir ?? memoryDir;
    return target ? persistMemory(memory, target) : undefined;
  };

  ctx.provide('researchCore', researchCore);
  ctx.provide('researchMemory', mem);
  ctx.provide('researchAgents', agents);
  ctx.logger?.(name).info('%s: researchCore + researchMemory + researchAgents mounted%s', name, memoryDir ? ` (memory.dir=${memoryDir})` : '');
}
