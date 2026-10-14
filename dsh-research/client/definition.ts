// client/definition.ts — 右侧栏「TRIZ 发明原理」Tab 的类型定义（stage one）。
//
// 与 harness 的 ui-sidebar-documentpreview / ui-deliverables 同款两步注册：
//   stage one = 本文件（sidebarRightTabs.register：描述 kind / patterns / 标题 / guide 条目）
//   stage two = TrizTab.tsx 的 body（sidebar.right.pane.tab keyed seat 挂组件）
// kind 是类型判别符（openTab 用它打开），id 是本次实现的唯一标识（body 注册的 key）。
// 提供 guide 条目 → 用户打开右侧栏的指南页即可看到并点开本面板。
import type { SidebarRightGuideEntry, SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'

/** 本 Tab 的 kind（右栏 tab 类型判别符；openTab('triz-explainer') 打开它）。 */
export const TRIZ_EXPLAINER_KIND = 'triz-explainer'

/** 本次实现的唯一标识 = body 在 sidebar.right.pane.tab 座席注册的 key。 */
export const TRIZ_EXPLAINER_ID = '@basil/dsh-research-triz-explainer'

/** 本类型认领的资源地址 glob（支持 openResource 打开，供后续自动化/链接接入）。 */
export const TRIZ_EXPLAINER_ADDRESS = 'dsh-resource://triz-explainer/**'

/** 指南页（右侧栏空态/指南）上的入口胶囊，点开即以页签形态打开本面板。 */
export function trizExplainerGuide(): SidebarRightGuideEntry[] {
  return [{
    id: 'triz-explainer',
    order: 1,
    title: () => 'TRIZ 发明原理',
    description: () => '查看本次研究结果用到的 TRIZ（发明问题解决理论）发明原理与推理链。',
  }]
}

/** 右侧栏 Tab 类型定义（stage one）。 */
export function trizExplainerDefinition(): SidebarRightTabDefinition {
  return {
    id: TRIZ_EXPLAINER_ID,
    kind: TRIZ_EXPLAINER_KIND,
    patterns: [TRIZ_EXPLAINER_ADDRESS],
    priority: 'extension',
    // 打开后保持挂载：会话切换/隐藏后不销毁，用户再次打开右侧栏立即可见。
    keepMounted: true,
    title: () => 'TRIZ 发明原理',
    guide: trizExplainerGuide(),
  }
}
