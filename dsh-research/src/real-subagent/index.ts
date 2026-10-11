// RealSubagent — 阶段 4 · 第 16c 项：把 role→agent 接到 dsh 模型层的真实 LLM 回合。
//
// 流程：role 子任务 → persona/policy/context 组包 → (seam 可用) 起真实子 agent 回合
//       → 文本输出 + sessionId → 写回研究记忆（episodic + artifact，delegator 如实标记）
//       → (seam 不可用 / start 失败 / requireReal) 确定性本地回退或直接失败。
// 模型路由由 ModelRouter 按角色解析（input.model 单次覆盖；setRole 持久覆盖）。
//
// 与 dsh 的 `ctx.subagents` 解耦：本服务只消费 `SubagentSeam` 接口（real-subagent/seam.ts），
// 运行时 seam 经 `createDshSubagentSeam(ctx, 'spawn')` 注入（web 会话 seam）；测试/离线注入
// `ScriptedSubagentSeam` 或缺省（→ 本地回退）。服务本身不 import dsh 运行时，零外部依赖。
import type { ResearchMemory } from '../memory/index.ts';
import { createMemory } from '../memory/index.ts';
import type { ResearchAgents } from '../agents/index.ts';
import { createAgents } from '../agents/index.ts';
import { ModelRouter } from '../model-router/index.ts';
import { PolicyService } from '../policy/index.ts';
import { roleDef } from '../roles/index.ts';
import { buildRolePrompt } from './persona.ts';
import { runLocal } from './local.ts';
import type { SubagentSeam } from './seam.ts';
import type { RoleTurnInput, RoleTurnResult } from './types.ts';

export interface RealSubagentOptions {
  /** 共享研究记忆（与插件/autonomous 同一份，回退/回合都会写情景记忆）。 */
  memory?: ResearchMemory;
  /** 共享角色 agent 门面（literature 本地回退统计命中数等）。 */
  agents?: ResearchAgents;
  /** 角色级模型路由（默认 local-interval-dsv4 / dsv4flash）。 */
  model?: ModelRouter;
  /** 研究纪律策略（10 条），拼进子 agent prompt。 */
  policy?: PolicyService;
  /** 真实子 agent runtime seam；缺省 = 不可用 → 本地回退。 */
  seam?: SubagentSeam;
}

/**
 * 角色级子 agent 服务：把「一个科研角色 + 一个子任务」变成一次真实 LLM 子 agent 回合。
 * `ok: true` = 产出来自真实 LLM 回合并成功返回；`ok: false` = 本地确定性回退或失败，
 * 均如实标注 delegator，可追溯。
 */
export class RealSubagentAgent {
  readonly memory: ResearchMemory;
  readonly agents: ResearchAgents;
  readonly router: ModelRouter;
  readonly policy: PolicyService;
  readonly seam?: SubagentSeam;

  constructor(opts: RealSubagentOptions = {}) {
    this.memory = opts.memory ?? createMemory();
    this.agents = opts.agents ?? createAgents({ memory: this.memory });
    this.router = opts.model ?? new ModelRouter();
    this.policy = opts.policy ?? new PolicyService();
    this.seam = opts.seam;
  }

  /** runtime seam 是否就绪（provider 已注册且可 start）。 */
  runtimeStatus(): { available: boolean; provider: string; realSubagent: boolean } {
    const available = this.seam?.available() ?? false;
    return { available, provider: this.seam?.provider ?? 'none', realSubagent: available };
  }

  /**
   * 以 role→agent 执行一次角色回合：
   *   - 模型路由 = input.model（单次覆盖） ?? router.route(role)
   *   - seam 可用 → 起真实子 agent（persona+纪律+上下文+任务 整包 prompt）
   *   - seam 不可用：requireReal=true 直接失败；否则确定性本地回退（诚实标注 local）
   *   - start 失败：requireReal=true 直接失败；否则记录后回退本地
   * @param signal 取消信号（dsh tool exec 的 exec.signal 可传入）
   */
  async run(input: RoleTurnInput, signal?: AbortSignal): Promise<RoleTurnResult> {
    const role = input.role;
    const def = roleDef(role);
    const route = input.model ?? this.router.route(role);
    const { persona, prompt } = buildRolePrompt(input, this.policy);

    const seamAvailable = this.seam?.available() ?? false;
    if (!seamAvailable) {
      if (input.requireReal) {
        return this.fail(role, route, 'requireReal：real-subagent seam 不可用，未回退本地');
      }
      return this.local(role, input.task, route, prompt, persona, 'real-subagent seam 不可用');
    }

    try {
      const res = await this.seam!.start({
        label: `research lead: ${def.label}`,
        prompt,
        parent: input.parent,
        agentOptions: { provider: route.provider, model: route.model },
        signal,
      });
      this.memory.episodic.record({
        kind: 'decision',
        summary: `subagent ${role} 真实回合：${input.task.slice(0, 40)}`,
        source: 'real-subagent',
        outcome: 'ok',
        meta: { delegator: 'real-subagent', model: `${route.provider}/${route.model}`, sessionId: res.sessionId, persona, prompt },
      });
      this.memory.artifact.put({
        kind: 'note',
        title: `role turn: ${def.label}`,
        body: `【角色】${def.label}（${role}）\n【任务】\n${input.task}\n\n【子 agent 输出】\n${res.output || '(空输出)'}\n\n【模型路由】${route.provider}/${route.model}${res.sessionId ? `\n【会话】${res.sessionId}` : ''}`,
        meta: { role, delegator: 'real-subagent', model: `${route.provider}/${route.model}`, sessionId: res.sessionId },
      });
      return {
        role,
        ok: true,
        output: res.output,
        delegator: 'real-subagent',
        provider: route.provider,
        model: route.model,
        sessionId: res.sessionId,
        stopReason: res.stopReason,
      };
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      if (input.requireReal) {
        return this.fail(role, route, `requireReal：真实 subagent 回合失败（${msg}）`);
      }
      return this.local(role, input.task, route, prompt, persona, `real subagent start 失败：${msg}`);
    }
  }

  /** 本地确定性回退：诚实标注 delegator='local' / ok=false，并写情景记忆。 */
  private local(
    role: RoleTurnInput['role'],
    task: string,
    route: { provider: string; model: string },
    prompt: string,
    persona: string,
    reason: string,
  ): RoleTurnResult {
    const lr = runLocal(role, task, { reason, agents: this.agents });
    this.memory.episodic.record({
      kind: 'note',
      summary: `subagent ${role} 本地回退（无真实 LLM 回合）`,
      source: 'local',
      outcome: 'fallback',
      meta: { delegator: 'local', model: `${route.provider}/${route.model}`, reason, persona, prompt },
    });
    return {
      role,
      ok: false,
      output: lr.output,
      delegator: 'local',
      provider: route.provider,
      model: route.model,
      error: lr.error,
    };
  }

  /** requireReal 直接失败：不产出任何回退内容，错误可追溯。 */
  private fail(role: RoleTurnInput['role'], route: { provider: string; model: string }, reason: string): RoleTurnResult {
    this.memory.episodic.record({
      kind: 'note',
      summary: `subagent ${role} 失败（requireReal）`,
      source: 'real-subagent',
      outcome: 'error',
      meta: { model: `${route.provider}/${route.model}`, reason },
    });
    return { role, ok: false, output: '', delegator: 'local', provider: route.provider, model: route.model, error: reason };
  }
}

export * from './types.ts';
export * from './persona.ts';
export * from './seam.ts';
export * from './local.ts';
