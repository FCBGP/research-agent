// @basil/dsh-research/triz — host 平面插件 7（TRIZ 方法论服务）。
//
// 阶段 8·A：TRIZ（发明问题解决理论）作为**假说生成 / 机制设计方法**接入 Research Loop。
// 本插件只 provide 一个服务 `researchTriz`（analyzeProblem / idealityFraming /
// toHypotheses），真正的能力由 src/triz/（知识基 + 分析引擎）提供；消费方是
// src/plugin-tools.ts 的 research_triz 工具（preset 平面，只在 research/engineering
// 会话可见）与 skills/triz/SKILL.md（程序性工作流）。
//
// 定位与分层：TRIZ 是**方法论/程序性知识 → 服务+skill**，不是领域知识（领域知识走
// vocabulary.ts + WeKnora，见 AGENTS.md §7）。给出的一切原理推荐都是「灵感与假说」，
// 必须经 research_verify / research_campaign 核验后才能成为 claim（Research Agent Policy）。
import type { Context } from '@deepseek-ai/cordis';
import { createTrizService } from './triz/index.ts';

export const name = 'dsh-research-triz';

/**
 * 挂载 researchTriz 服务。依赖顺序：本插件不依赖其它 research-* 服务（TRIZ 知识基
 * 自带），但在 cordis.patch.yml 里放在 research-core 之后，便于 tools 插件一并消费。
 */
export function apply(ctx: Context): void {
  ctx.provide('researchTriz', createTrizService());
  ctx.logger?.(name).info('%s: researchTriz mounted（TRIZ 40 原理 / 39 参数 / 精选矛盾矩阵 / IFR）', name);
}
