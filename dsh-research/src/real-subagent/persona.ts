// RealSubagent · persona — 角色 → 系统人格 + 研究纪律 → 子 agent prompt。
//
// 复用 roles/ 静态注册表（label + description）与 policy/ 的 10 条纪律，
// 把「research 角色的行为约束」渲染成可下发给模型层的自包含文本。
// 纯函数、可测；不引入领域逻辑。
import { ROLE_REGISTRY } from '../roles/index.ts';
import type { ResearchRole } from '../roles/index.ts';
import { PolicyService } from '../policy/index.ts';
import type { RoleTurnInput } from './types.ts';

/** 角色系统人格：身份 + 职责（来自 ROLE_REGISTRY）。 */
export function rolePersona(role: ResearchRole): string {
  const def = ROLE_REGISTRY.find((r) => r.role === role) ?? ROLE_REGISTRY[0];
  return [
    `你是 Research Agent OS 的「${def.label}」研究角色。`,
    `职责：${def.description}。`,
    '你完成当前回合后，把结构化结论作为最终文本返回（只忠于事实与证据，不臆造来源）。',
  ].join('\n');
}

/**
 * 组装下发给子 agent 的完整 prompt：
 * [角色人格] + [研究纪律（enabled 时）] + [额外上下文] + [任务]。
 * 返回 persona 与整包 prompt，便于服务层打日志 / 存 artifact。
 */
export function buildRolePrompt(input: RoleTurnInput, policy?: PolicyService): { persona: string; prompt: string } {
  const persona = rolePersona(input.role);
  const blocks: string[] = [persona];
  const policyPrompt = policy?.enabled === false ? '' : (policy?.buildPrompt() ?? '');
  if (policyPrompt) blocks.push(policyPrompt);
  if (input.context?.trim()) blocks.push(`## 上下文\n${input.context.trim()}`);
  blocks.push(`## 任务\n${input.task.trim()}`);
  return { persona, prompt: blocks.join('\n\n') };
}
