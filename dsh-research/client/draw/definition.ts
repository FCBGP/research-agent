// client/draw/definition.ts — 右侧栏「科研绘图」Tab 的类型定义（stage one）。
//
// 与「TRIZ 发明原理」Tab 同机制（TRIZ 同款两步注册）：
//   stage one = 本文件（sidebarRightTabs.register：描述 kind / patterns / 标题 / guide 条目）
//   stage two = DrawTab.tsx 的 body（sidebar.right.pane.tab keyed seat 挂组件）
// kind 是类型判别符（openTab 用它打开），id 是本次实现的唯一标识（body 注册的 key）。
// 提供 guide 条目 → 用户打开右侧栏的指南页即可看到并点开本面板（与 TRIZ 两个 tab 并列）。
import type { SidebarRightGuideEntry, SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'

/** 本 Tab 的 kind（右栏 tab 类型判别符；openTab('draw-studio') 打开它）。 */
export const DRAW_STUDIO_KIND = 'draw-studio'

/** 本次实现的唯一标识 = body 在 sidebar.right.pane.tab 座席注册的 key。 */
export const DRAW_STUDIO_ID = '@basil/dsh-research-draw-studio'

/** 本类型认领的资源地址 glob（支持 openResource 打开，供后续自动化/链接接入）。 */
export const DRAW_STUDIO_ADDRESS = 'dsh-resource://draw-studio/**'

/** 指南页（右侧栏空态/指南）上的入口胶囊，点开即以页签形态打开本面板。 */
export function drawStudioGuide(): SidebarRightGuideEntry[] {
  return [{
    id: 'draw-studio',
    order: 2,
    title: () => '科研绘图',
    description: () => '生成/编辑科研配图（Qwen-Image-2.1 本机 or OpenAI 兼容 API）；支持比例/分辨率/画质与 1 张参考垫图。',
  }]
}

/** 右侧栏 Tab 类型定义（stage one）。 */
export function drawStudioDefinition(): SidebarRightTabDefinition {
  return {
    id: DRAW_STUDIO_ID,
    kind: DRAW_STUDIO_KIND,
    patterns: [DRAW_STUDIO_ADDRESS],
    priority: 'extension',
    // 打开后保持挂载：会话切换/隐藏后不销毁，用户再次打开右侧栏立即可见。
    keepMounted: true,
    title: () => '科研绘图',
    guide: drawStudioGuide(),
  }
}
