/**
 * client/index.ts — @basil/dsh-research 的浏览器半边入口（dsh.client 声明指向本 bundle）。
 *
 * 在 Web 客户端 cordis 上下文里做右侧栏 Tab 的两步注册（TRIZ / 科研绘图各一套）：
 *   stage one：sidebarRightTabs.register（类型定义，含 guide 条目与地址认领）
 *   stage two：sidebar.right.pane.tab keyed 座席挂 Tab body（key = 定义的 id）
 * 需要的最小客户端服务：slots（座席注册）+ sidebarRightTabs（右栏 tab 类型注册），
 * 均由 @deepseek-ai/dsh-client-ui-sidebar-right 提供（dsh.client.inject 已声明依赖，
 * 保证激活顺序）。数据经 host 的 /api/research.triz.notes 与 /api/research.draw.* 拉取，
 * 不在此做任何领域计算。
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { TRIZ_EXPLAINER_ID, trizExplainerDefinition } from './definition.ts'
import { TrizTab } from './TrizTab.tsx'
import { DRAW_STUDIO_ID, drawStudioDefinition } from './draw/definition.ts'
import { DrawTab } from './draw/DrawTab.tsx'

/** 浏览器插件的实现标识。 */
export const name = 'dsh-research-tabs'

/** 客户端服务注入：slots（座席注册）+ sidebarRightTabs（右栏 tab 类型注册）。 */
export const inject = ['slots', 'sidebarRightTabs']

/**
 * 客户端插件 body。
 * @param ctx - 客户端 cordis 根上下文。
 */
export function apply(ctx: ClientContext): void {
  // TRIZ 发明原理
  ctx.effect(() => ctx.sidebarRightTabs.register(trizExplainerDefinition()), 'dsh-research: triz-explainer tab type')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: TRIZ_EXPLAINER_ID,
  }, TrizTab)), 'dsh-research: triz-explainer tab body')

  // 科研绘图（阶段 11，2026-10-21）—— 与 TRIZ 同机制的两个 tab 之一（无独立 preset/profile）。
  ctx.effect(() => ctx.sidebarRightTabs.register(drawStudioDefinition()), 'dsh-research: draw-studio tab type')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: DRAW_STUDIO_ID,
  }, DrawTab)), 'dsh-research: draw-studio tab body')
}
