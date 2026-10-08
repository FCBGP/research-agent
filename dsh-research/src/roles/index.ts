// 角色注册表 — 阶段 4 · 第 16 项 multi-agent 的「角色 → 职责 → agent → 模型」映射。
// Director 按任务 kind 找角色分派；ModelRouter 按角色解析模型；Writer 按角色收尾。
// 让"多角色 + 结构化 artifact 传递"变成可查验的静态注册表，而非散落在代码里。
import type { ResearchAgents } from '../agents/index.ts';

export type ResearchRole = 'director' | 'literature' | 'reviewer' | 'experimenter' | 'writer';

export interface RoleDef {
  role: ResearchRole;
  label: string;
  description: string;
  agentKey: keyof ResearchAgents | 'writer' | 'director';
  /** 该角色默认模型（ModelRouter 无覆盖时使用）。 */
  defaultModel: string;
}

/** 五个科研角色的静态注册表。 */
export const ROLE_REGISTRY: readonly RoleDef[] = [
  { role: 'director', label: '调度', description: '目标 → 任务 DAG → 按信息增益分派 → 仲裁', agentKey: 'director', defaultModel: 'dsv4flash' },
  { role: 'literature', label: '文献', description: '检索/阅读/沉淀事实 claim（research_search）', agentKey: 'literature', defaultModel: 'dsv4flash' },
  { role: 'reviewer', label: '审稿', description: '8 步清单结构化学术审稿（research_review）', agentKey: 'reviewer', defaultModel: 'dsv4flash' },
  { role: 'experimenter', label: '实验', description: '设计/执行/统计实验（research_campaign）', agentKey: 'experiment', defaultModel: 'dsv4flash' },
  { role: 'writer', label: '写作', description: '论文/幻灯片生成（research_paper/research_slides）', agentKey: 'writer', defaultModel: 'dsv4flash' },
] as const;

/** 按角色取定义；未知角色回退 director。 */
export function roleDef(role: string): RoleDef {
  return ROLE_REGISTRY.find((r) => r.role === role) ?? ROLE_REGISTRY[0];
}

/** 角色 → 对应 agent 门面（writer/director 为 null，由 autonomous 直接调用）。 */
export function roleAgent(role: ResearchRole, agents: ResearchAgents): unknown {
  return role === 'writer' || role === 'director' ? null : agents[ROLE_REGISTRY.find((r) => r.role === role)!.agentKey as keyof ResearchAgents];
}

/** 任务 kind → 默认负责角色（分派表，供 Director/autonomous 查阅）。 */
export const TASK_ROLE: Record<string, ResearchRole> = {
  read: 'literature',
  search: 'literature',
  hypothesis: 'literature',
  experiment: 'experimenter',
  verify: 'reviewer',
  write: 'writer',
};
