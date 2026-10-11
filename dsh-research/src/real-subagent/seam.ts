// RealSubagent · seam — 消费 dsh 公开 seam 的运行时适配（web 会话 seam）。
//
// dsh 的 `ctx.subagents` 是「子 agent 注册表 + 能力校验 async start」：
//   一个 AGENT 会话（web 会话里就是调用者）→ 以角色人格 + 模型路由为参数
//   → 起一个 one-shot 子 agent → 它自己驱动真实 LLM 回合 → 返回最终输出。
// 本文件只按结构消费该公开 seam；provider 缺省 `spawn`
// （web base 的 standard preset 经 @deepseek-ai/dsh-subagent-spawn-in-process 注册）。
// 不 import dsh 的类型（本包零外部依赖）：全部用最小结构类型 + 防御式判空。
//
// ctx.subagents 读取经 `ctx.reflect.get('subagents', false)`（无需在插件上声明
// inject，未提供时安全返回 undefined），回退直接属性访问——任意作用域下
// 都不断言服务存在，插件激活契约保持 `inject = ['tools']` 不变。
import type { Context } from '@deepseek-ai/cordis';

/** 一次真实子 agent 委托的最小请求（与 dsh SubagentStartRequest 结构对齐）。 */
export interface SubagentStartRequestLike {
  label: string;
  /** 整包 prompt（含角色人格 + 研究纪律 + 任务），作为子 agent 的 user 消息。 */
  prompt: string;
  /** 父 Agent（dsh 会话的调用者）；in-process provider 派生 workspace/lineage/depth。 */
  parent?: unknown;
  /** 角色模型路由：provider + model（agentOptions 能力，in-process provider 合并到子 agent）。 */
  agentOptions?: { provider: string; model: string };
  signal?: AbortSignal;
}

/** 子 agent run 的最小结构（与 dsh SubagentRun / SubagentResult 对齐）。 */
export interface SubagentRunLike {
  readonly id: string;
  readonly result: Promise<{
    readonly output?: ReadonlyArray<{ readonly type?: string; readonly text?: string }>;
    readonly stopReason?: string;
    readonly diagnostic?: string;
  }>;
  dispose(): Promise<void>;
}

/** 真实子 agent seam 的契约（测试用 ScriptedSubagentSeam 可注入）。 */
export interface SubagentSeam {
  readonly provider: string;
  /** provider 是否已在 registry 注册、可 start。 */
  available(): boolean;
  /** 起一个 one-shot 真实子 agent，等待其最终输出并 dispose。 */
  start(request: SubagentStartRequestLike): Promise<{
    output: string;
    sessionId?: string;
    stopReason?: string;
    diagnostic?: string;
  }>;
}

interface SubagentsLike {
  getProvider?(name: string): unknown;
  start?(name: string, request: unknown): Promise<SubagentRunLike>;
}

/** 从 dsh ctx 读取 `ctx.subagents` 的公开 seam（缺任一结构即视为不可用）。 */
export function createDshSubagentSeam(ctx: Context | unknown, provider = 'spawn'): SubagentSeam {
  const c = ctx as {
    subagents?: SubagentsLike;
    reflect?: { get?(name: string, strict?: boolean): unknown };
  };
  // 每次调用时重新解析：服务可能是异步提供的，不缓存失效引用。
  const resolve = (): SubagentsLike | undefined => {
    const raw = typeof c?.reflect?.get === 'function'
      ? c.reflect.get('subagents', false)
      : c?.subagents;
    return raw as SubagentsLike | undefined;
  };
  const available = (): boolean => {
    const subagents = resolve();
    return Boolean(subagents)
      && typeof subagents!.getProvider === 'function'
      && Boolean(subagents!.getProvider(provider))
      && typeof subagents!.start === 'function';
  };
  return {
    provider,
    available,
    async start(request) {
      const subagents = resolve();
      if (!subagents || !available()) {
        throw new Error(`real-subagent seam unavailable: provider "${provider}" 未注册或 ctx.subagents 缺失`);
      }
      const run = await subagents.start!(provider, {
        label: request.label,
        prompt: [{ type: 'text', text: request.prompt }],
        ...(request.parent === undefined ? {} : { parent: request.parent }),
        ...(request.agentOptions === undefined ? {} : { agentOptions: request.agentOptions }),
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      });
      const result = await run.result;
      const text = (result.output ?? []).filter((b) => b?.type === 'text').map((b) => b.text ?? '').join('\n');
      return {
        output: text,
        sessionId: run.id,
        stopReason: result.stopReason,
        diagnostic: result.diagnostic,
      };
    },
  };
}

/** 脚本化 seam：测试 / 离线场景注入固定回复（delegator 仍标 real-subagent 语义由调用方决策）。 */
export class ScriptedSubagentSeam implements SubagentSeam {
  readonly provider: string;
  private reply: string;
  private calls: Array<SubagentStartRequestLike> = [];
  constructor(reply = 'scripted reply', provider = 'spawn') {
    this.reply = reply;
    this.provider = provider;
  }

  available(): boolean {
    return true;
  }

  count(): number {
    return this.calls.length;
  }

  lastCall(): SubagentStartRequestLike | undefined {
    return this.calls[this.calls.length - 1];
  }

  async start(request: SubagentStartRequestLike): Promise<{ output: string; sessionId?: string; stopReason?: string }> {
    this.calls.push(request);
    return { output: this.reply, sessionId: `scripted-${this.calls.length}`, stopReason: 'completed' };
  }
}
