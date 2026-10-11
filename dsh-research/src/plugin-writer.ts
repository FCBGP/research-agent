// @basil/dsh-research/writer — host 平面插件 4/5：论文 / 幻灯片产出服务（researchWriter）。
//
// 阶段 5·B1 从 src/plugin.ts 抽出：搬走「researchWriter」ctx.provide 段。
// createWriter() 是纯函数式门面（paper + slides），零上游依赖，不消费其它 research 服务；
// 独立成行（cordis.patch.yml 中位于 research-experiment 之后、research-operations 之前）。
import type { Context } from '@deepseek-ai/cordis';
import { createWriter, type ResearchWriter } from './writer/index.ts';

export const name = 'dsh-research-writer';

/** 注册到 `ctx` 的论文/幻灯片产出服务（与 src/plugin.ts 的 researchWriter 同款）。 */
export type ResearchWriterService = ResearchWriter;

export function apply(ctx: Context): void {
  const writer = createWriter();
  ctx.provide('researchWriter', writer);
  ctx.logger?.(name).info('%s: researchWriter mounted (paper + slides)', name);
}
