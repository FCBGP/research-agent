// RealSubagent · local — 确定性本地回退。
//
// 真实 LLM seam 不可用（离线 / 插件层无父 Agent 会话 / start 失败）时的兜底：
// 按角色产出可追溯的占位结论，诚实标注 `delegator: 'local'`、`ok: false`，
// 绝不冒充模型生成内容（AGENTS.md 铁律：不能把"模型曾经说过"当作事实）。
// 纯函数 + 可选 agents（literature 角色可顺手统计本地语料命中数）；可测。
import type { ResearchAgents } from '../agents/index.ts';
import { roleDef, type ResearchRole } from '../roles/index.ts';

export interface LocalFallbackResult {
  output: string;
  ok: boolean;
  /** 说明为何走本地回退（no real LLM turn）。 */
  error: string;
}

export interface LocalFallbackDeps {
  /** 回退原因（真实 seam 不可用 / start 失败 / requireReal=false）。 */
  reason?: string;
  /** 可选：literature 角色回退时可统计本地语料命中数（不依赖则给出占位说明）。 */
  agents?: ResearchAgents;
}

/** 按角色执行确定性本地回退。 */
export function runLocal(role: ResearchRole, task: string, deps: LocalFallbackDeps = {}): LocalFallbackResult {
  const reason = deps.reason ?? 'real-subagent seam 不可用';
  return {
    output: localText(role, task, deps.agents),
    ok: false,
    error: `local fallback (no real LLM turn): ${reason}`,
  };
}

function localText(role: ResearchRole, task: string, agents?: ResearchAgents): string {
  const def = roleDef(role);
  const label = def.label;
  const note = '未接入真实 LLM 回合，仅确定性占位；请在 web 会话中以真实 subagent 重跑。';
  switch (role) {
    case 'director':
      return `[${label}·本地回退] 收到角色子任务「${trim(task)}」。${note} 规划骨架：拆解 → 分派 → 仲裁，未做真实调度。`;
    case 'literature': {
      let hits = '';
      try {
        const n = agents?.literature?.search(task, 5).length;
        if (n !== undefined && n >= 0) hits = `本地语料命中 ${n} 条（seed corpus），`;
      } catch { /* 检索异常则退化为占位说明 */ }
      return `[${label}·本地回退] 检索「${trim(task)}」：${hits || '本地语料可检索，'}${note} 未沉淀事实 claim。`;
    }
    case 'reviewer':
      return `[${label}·本地回退] 对「${trim(task)}」执行 8 步清单骨架：步骤齐备但每步点评需模型/人工填充，判定待真实 LLM 回合细化。${note}`;
    case 'experimenter':
      return `[${label}·本地回退] 针对「${trim(task)}」给出实验计划骨架：env=sim、scenario 由 claim 推断、四口径统计（detection_rate/fp/convergence/verification_latency）。${note}`;
    case 'writer':
      return `[${label}·本地回退] 针对「${trim(task)}」建议论文/幻灯片骨架：摘要 + 6 章节 + 附录 A 证据追溯，或 8 页 Marp 科研汇报。${note}`;
    default:
      return `(local fallback) 收到角色子任务「${trim(task)}」。${note}`;
  }
}

function trim(s: string): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > 60 ? `${t.slice(0, 60)}…` : t;
}
