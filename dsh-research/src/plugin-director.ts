// @basil/dsh-research/director — host 平面插件 2/5：研究 DAG 调度（ResearchDirector）。
//
// 阶段 5·B1 从 src/plugin.ts 抽出：搬走「researchDirector」ctx.provide 段。
// 消费 research-core 提供的 researchMemory / researchAgents（inject 声明 + ctx.get 读取，
// 见 cordis.patch.yml「host 行顺序 = 依赖顺序」）；缺依赖时告警跳过，不提供半吊子服务。
import type { Context } from '@deepseek-ai/cordis';
import { ResearchDirector } from './research-director/director.ts';
import type { ResearchAgents } from './agents/index.ts';
import type { ResearchMemory } from './memory/index.ts';

export const name = 'dsh-research-director';

/** 依赖 research-core（provides researchMemory / researchAgents）；未提供时本插件不激活。 */
export const inject = ['researchMemory', 'researchAgents'];

export function apply(ctx: Context): void {
  const memory = ctx.get('researchMemory') as ResearchMemory | undefined;
  const agents = ctx.get('researchAgents') as ResearchAgents | undefined;
  if (!memory || !agents) {
    ctx.logger?.(name).warn('%s: 缺少 researchMemory / researchAgents（research-core 未挂载？），跳过 researchDirector', name);
    return;
  }
  const director = new ResearchDirector(memory, agents);
  ctx.provide('researchDirector', director);
  ctx.logger?.(name).info('%s: researchDirector mounted (consumes researchMemory/researchAgents)', name);
}
