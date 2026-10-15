// @basil/dsh-research/triza — host 平面插件 8（TRIZa 闭环：冻结契约 / 类型化变换 /
// FI/Ideality / 硬门晋升 / 可追溯）。
//
// 阶段 9：把论文 docs/2610.04555v1.pdf（TRIZa）从「理念」落成「可执行闭环」——
// 阶段 8 的 researchTriz 只做**事前/正演想法**（矛盾 → 原理 → 假说）；本插件提供
// researchTriza 服务做**事后/治理**：冻结评估契约（协议指纹 SHA-256）→ 类型化变换契约 →
// 功能信息（useful/harmful 位口径分开报告）+ FI/Ideality → 四类硬门 → 晋升决策
// （promote/revise/reject/escalate，指标提升是观察、晋升是被治理的决策）→
// triz_context.json / triz_strategy_plan.md / scores.jsonl 追加记录 / SHA256SUMS，负证据保留。
// 消费方：research_triza 工具（preset 平面）+ skills/triz/SKILL.md 的闭环环节。
//
// 定位与分层：TRIZa = **方法论/程序性能力 → 服务 + skill**，不是领域知识；输出全部是
// 待核验结论（hard gate 判定 + 保留证据），必须可追溯到协议指纹（Research Agent Policy）。
import type { Context } from '@deepseek-ai/cordis';
import { createTrizaService } from './triza/index.ts';

export const name = 'dsh-research-triza';

/**
 * 挂载 researchTriza 服务。依赖顺序：放在 research-triz 之后（复用其矛盾分析做
 * 原理推导），但能力完全自带（知识基 = src/triza/ 内嵌）；被 plugin-tools 一并 ctx.get。
 */
export function apply(ctx: Context): void {
  ctx.provide('researchTriza', createTrizaService());
  ctx.logger?.(name).info('%s: researchTriza mounted（frozen contract / typed transformation / FI-Ideality / hard-gate promotion / traceability）', name);
}
