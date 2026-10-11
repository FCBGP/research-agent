// RealSubagent — 阶段 4 · 第 16c 项：把 role→agent 接到真实 LLM 回合的数据契约。
//
//   role→agent 的「静态注册表」（roles/）与「模型路由」（model-router/）已就绪，
//   缺的最后一块是把角色真正派发到 dsh 模型层的 agent 会话（web 会话 seam）：
//   一个 role 子任务 → 一次真实 LLM 回合 → 文本结果 + 会话 id → 写入研究记忆。
//   本模块是纯数据契约，不依赖 dsh 运行时（运行时适配在 seam.ts，回退在 local.ts）。
import type { ResearchRole } from '../roles/index.ts';
import type { ModelRoute } from '../model-router/index.ts';

/** 一次角色委托的实际执行来源。 */
export type Delegator = 'real-subagent' | 'local';

export interface RoleTurnInput {
  /** 由哪个科研角色执行本回合。 */
  role: ResearchRole;
  /** 该角色的子任务（自包含 prompt；随 persona/policy 整包下发给子 agent）。 */
  task: string;
  /** 额外上下文（memory 摘要 / 相关 claim / 上一环节输出），拼进 prompt。 */
  context?: string;
  /** 模型路由覆盖；缺省由 ModelRouter 按角色解析。 */
  model?: ModelRoute;
  /** true 时 runtime seam 不可用直接失败（不回退本地）；默认 false（本地回退并如实标记）。 */
  requireReal?: boolean;
  /**
   * 真实会话中的父 Agent（dsh tool exec 的 exec.agent / agent 调用者自身）。
   * in-process provider 需要 parent 派生 workspace/lineage/depth；
   * 插件/宿主层调用时为 undefined → dsh start 会拒绝 → 诚实回退本地（不冒充真实回合）。
   */
  parent?: unknown;
}

export interface RoleTurnResult {
  role: ResearchRole;
  ok: boolean;
  /** 子 agent 回合的最终文本输出（真实 LLM）或确定性回退文本。 */
  output: string;
  /** real-subagent = 真实 LLM 子 agent 回合；local = 确定性回退（非模型生成）。 */
  delegator: Delegator;
  provider?: string;
  model?: string;
  /** 真实子 agent 的会话 id（web 会话 seam 可追溯）。 */
  sessionId?: string;
  /** 真实子 agent 的终止原因（completed/aborted/error/max-tokens/refusal）。 */
  stopReason?: string;
  error?: string;
}
