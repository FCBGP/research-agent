// @basil/dsh-research/experiment — host 平面插件 3/5：自动实验战役服务（researchExperiment）。
//
// 阶段 5·B1 从 src/plugin.ts 抽出：搬走「researchExperiment」ctx.provide 段；runAutomatic
// 实现（runCampaign 装配）原样保留。消费 research-core 的 researchMemory / researchAgents
// （agents.experiment 生成计划）；缺依赖时告警跳过。
//
// 阶段 7·(--patch 链) 追加静态默认值面：`config.defaults` 承载「experiment-specific patch」
// 的默认实验参数（env / validator / attackClass / repetitions / asCount / supportThreshold），
// 使 profile overlay 能按场景（如 FC-BGP / ASPP）整行覆盖本插件行并钉死默认值；
// 每次 runAutomatic 的显式输入覆盖默认值（输入优先）。默认不设 defaults → 行为与阶段 6 完全一致。
import type { Context } from '@deepseek-ai/cordis';
import { runCampaign, type CampaignReport } from './experiment/runner.ts';
import type { ResearchAgents } from './agents/index.ts';
import type { ResearchMemory } from './memory/index.ts';

export const name = 'dsh-research-experiment';

/** runAutomatic 的入参形状（defaults 类型由此派生，字段全部可选）。 */
export interface RunAutomaticInput {
  claim: string;
  claimId?: string;
  env?: 'frr' | 'vpp' | 'sim';
  repetitions?: number;
  validator?: 'none' | 'rov' | 'bgpsec' | 'rov+bgpsec' | 'aspa' | 'rov+aspa';
  attackClass?: 'prefix-hijack' | 'subprefix-hijack' | 'as-set-injection' | 'path-manipulation' | 'authorized-leak';
  asCount?: number;
  supportThreshold?: number;
}

/** 注册到 `ctx` 的自动实验服务（与 src/plugin.ts 的 researchExperiment 同款）。 */
export interface ResearchExperimentService {
  runAutomatic(input: RunAutomaticInput): CampaignReport;
}

/** 插件配置：`defaults` = 静态覆盖的默认实验参数（experiment-specific overlay 用之）。 */
export interface PluginExperimentConfig {
  defaults?: Partial<Omit<RunAutomaticInput, 'claim' | 'claimId'>>;
}

export function apply(ctx: Context, config: PluginExperimentConfig = {}): void {
  const memory = ctx.get('researchMemory') as ResearchMemory | undefined;
  const agents = ctx.get('researchAgents') as ResearchAgents | undefined;
  if (!memory || !agents) {
    ctx.logger?.(name).warn('%s: 缺少 researchMemory / researchAgents（research-core 未挂载？），跳过 researchExperiment', name);
    return;
  }
  const experiment: ResearchExperimentService = {
    runAutomatic: (input) => {
      // 链层默认值：实验参数取 config.defaults 打底，显式输入覆盖（输入优先）。
      const merged = { ...config.defaults, ...input };
      const claimId = merged.claimId ?? `claim-${Date.now().toString(36)}`;
      return runCampaign(memory, agents.experiment, {
        claim: { id: claimId, statement: merged.claim },
        env: merged.env,
        repetitions: merged.repetitions,
        validator: merged.validator,
        attackClass: merged.attackClass,
        asCount: merged.asCount,
        supportThreshold: merged.supportThreshold,
      });
    },
  };
  ctx.provide('researchExperiment', experiment);
  ctx.logger?.(name).info('%s: researchExperiment mounted (consumes researchMemory/researchAgents)', name);
}
