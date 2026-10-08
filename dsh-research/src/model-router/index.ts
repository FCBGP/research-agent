// Model Router — 角色级模型路由（并行 · TODO「Model Router：按角色配模型」）。
// 与 profile 两层 overlay（llm-pi-ai 提供 provider + agent-default-model 默认模型）
// 对齐：默认走 local-interval-dsv4 / dsv4flash；可按角色覆盖 provider/model。
// 纯配置 → 解析，零依赖、可测；autonomous/roles 用它标注每个角色用什么模型。

import type { ResearchRole } from '../roles/index.ts';

export interface ModelRoute {
  provider: string;
  model: string;
}

export interface ModelRouterOptions {
  /** 全局默认路由（默认 local-interval-dsv4 / dsv4flash，与 profile 一致）。 */
  defaultRoute?: ModelRoute;
  /** 角色级覆盖。 */
  routes?: Partial<Record<ResearchRole, ModelRoute>>;
  /** 每角色默认模型（未在 routes 覆盖时作为模型后缀解析；可空）。 */
  roleModels?: Partial<Record<ResearchRole, string>>;
}

export const DEFAULT_MODEL_ROUTE: ModelRoute = { provider: 'local-interval-dsv4', model: 'dsv4flash' };

export class ModelRouter {
  readonly opts: ModelRouterOptions;
  constructor(opts: ModelRouterOptions = {}) {
    this.opts = opts;
  }

  route(role: ResearchRole): ModelRoute {
    const over = this.opts.routes?.[role];
    if (over) return over;
    const model = this.opts.roleModels?.[role] ?? DEFAULT_MODEL_ROUTE.model;
    return { provider: DEFAULT_MODEL_ROUTE.provider, model };
  }

  /** 把角色 × 模型标注拼成一行，供 prompt/日志使用。 */
  describe(role: ResearchRole): string {
    const r = this.route(role);
    return `[${role}] ${r.provider}/${r.model}`;
  }
}
