// @basil/dsh-research/operations — host 平面插件 5/5：运维类服务聚合
// （policy / autonomous / jobs / scheduler / self-improve / real-subagent seam）。
//
// 阶段 5·B1 从 src/plugin.ts 抽出：搬走「researchPolicy / researchAutonomous /
// researchJobs / researchScheduler / researchSelfImprove / researchSubagents」六个
// ctx.provide 段；构造逻辑原样保留（语义零变化）。
// 消费 research-core 的 researchMemory / researchAgents + research-writer 的
// researchWriter（autonomous.run 依赖）；inject 同时声明 researchExperiment —
// 保证本插件的行序依赖（cordis.patch.yml「host 行顺序 = 依赖顺序」：本行在
// research-operations 最后一个挂载），body 不直接消费 experiment 值（工具层在
// preset 平面的 research-tools 行消费）。
import type { Context } from '@deepseek-ai/cordis';
import { runAutonomousResearch, type AutonomousInput, type AutonomousReport } from './autonomous/index.ts';
import { PolicyService, type PolicyOptions } from './policy/index.ts';
import { JobRunner } from './jobs/index.ts';
import { ResearchScheduler } from './scheduler/index.ts';
import { SelfImprover } from './self-improve/index.ts';
import { RealSubagentAgent } from './real-subagent/index.ts';
import { ModelRouter } from './model-router/index.ts';
import { createDshSubagentSeam } from './real-subagent/seam.ts';
import type { ResearchWriter } from './writer/index.ts';
import type { ResearchAgents } from './agents/index.ts';
import type { ResearchMemory } from './memory/index.ts';

export const name = 'dsh-research-operations';

/** 依赖 research-core（memory/agents）+ research-writer（writer）+ research-experiment
 * （行序保证）；缺任一服务时本插件不激活。 */
export const inject = ['researchMemory', 'researchAgents', 'researchWriter', 'researchExperiment'];

export interface PluginOperationsConfig {
  tools?: { enabled?: boolean };
  policy?: PolicyOptions;
  subagents?: { enabled?: boolean; provider?: string };
}

export function apply(ctx: Context, config: PluginOperationsConfig = {}): void {
  const memory = ctx.get('researchMemory') as ResearchMemory | undefined;
  const agents = ctx.get('researchAgents') as ResearchAgents | undefined;
  const writer = ctx.get('researchWriter') as ResearchWriter | undefined;
  if (!memory || !agents || !writer) {
    ctx.logger?.(name).warn('%s: 缺少 researchMemory / researchAgents / researchWriter（research-core / research-writer 未挂载？），跳过 research-operations', name);
    return;
  }

  const policy = new PolicyService(config.policy);
  const autonomous = {
    run: (input: AutonomousInput): AutonomousReport =>
      runAutonomousResearch(input, { memory, agents, writer }),
  };
  const jobs = new JobRunner(memory);
  const scheduler = new ResearchScheduler({
    memory,
    runner: (input: AutonomousInput): AutonomousReport => autonomous.run(input),
  });
  const selfImprove = new SelfImprover(memory);
  // real subagent：`ctx.subagents` 经公开 seam 读取（createDshSubagentSeam 走
  // ctx.reflect.get，无需声明 inject）；subagents.enabled=false 时禁用 seam → 本地回退。
  const modelRouter = new ModelRouter();
  const realSubagent = new RealSubagentAgent({
    memory,
    agents,
    model: modelRouter,
    policy,
    seam: config.subagents?.enabled === false ? undefined : createDshSubagentSeam(ctx, config.subagents?.provider ?? 'spawn'),
  });

  ctx.provide('researchPolicy', policy);
  ctx.provide('researchAutonomous', autonomous);
  ctx.provide('researchJobs', jobs);
  ctx.provide('researchScheduler', scheduler);
  ctx.provide('researchSelfImprove', selfImprove);
  ctx.provide('researchSubagents', realSubagent);
  ctx.logger?.(name).info('%s: policy + autonomous + jobs + scheduler + selfImprove + subagents mounted', name);
}
