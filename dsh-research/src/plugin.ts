// @basil/dsh-research — dsh 运行时插件入口（Cordis 插件形态）。
//
// 三条黄金规则下挂在 dsh 之上，不改任何 dsh 内部代码：
//   1) 只消费公开 seam：`ctx`（cordis）、`ctx.tools`（@deepseek-ai/dsh-tools）
//   2) 通过 profile 的 patch 层注入（见 package.json `dsh.bundle.patch`）
//   3) 领域逻辑全部在 `src/core/*`，本文件仅做「挂载 + 工具注册」薄层
//
// 唯一运行时依赖是 dsh 自身已提供的服务（ctx / ctx.tools）；本包零外部依赖。
// `@deepseek-ai/cordis` 与 `@deepseek-ai/dsh-tools` 仅用作类型（`import type`，
// 类型剥离后不在产物中出现），因此无需把两者列为依赖。

import type { Context } from '@deepseek-ai/cordis';
import { ArtifactStore } from './core/artifact-store.ts';
import { addCounterEvidence, addEvidence, newClaim, synthConfidence } from './core/claim.ts';
import { selectNext, unlock } from './core/dag.ts';
import { runVerification } from './core/verification.ts';
import type { ExperimentResult, ResearchClaim, ResearchTask } from './core/types.ts';

export const name = 'dsh-research';

/** 依赖 @deepseek-ai/dsh-tools 提供的 ctx.tools 服务；profile 组合缺它时本插件不激活。 */
export const inject = ['tools'];

/** 注册到 `ctx` 的研究核心服务：claim / verify / plan / artifact。 */
export interface ResearchCoreService {
  claims: {
    create(input: { statement: string; type?: ResearchClaim['type']; source: string }): ResearchClaim;
    addEvidence(claim: ResearchClaim, evidence: { source: string; evidence: string; confidence: number; verified?: boolean }): ResearchClaim;
    addCounter(claim: ResearchClaim, counter: { source: string; evidence: string; confidence: number }): ResearchClaim;
    confidence(claim: ResearchClaim): number;
  };
  verify: {
    claim(claim: ResearchClaim, experiment?: ExperimentResult): { verdict: ResearchClaim['verificationStatus']; rationale: string; checks: string[] };
  };
  plan: {
    selectNext(tasks: ResearchTask[]): ResearchTask | undefined;
    unlock(tasks: ResearchTask[], finished: ResearchTask[]): ResearchTask[];
  };
  artifacts: ArtifactStore;
}

export interface PluginConfig {
  tools?: { enabled?: boolean };
}

export function apply(ctx: Context, config: PluginConfig = {}): void {
  const artifacts = new ArtifactStore();

  const researchCore: ResearchCoreService = {
    claims: {
      create: ({ statement, type = 'Hypothesis', source }) =>
        newClaim({ statement, type, source }),
      addEvidence: (claim, evidence) =>
        addEvidence(claim, { ...evidence, verified: evidence.verified ?? evidence.confidence >= 0.7 }),
      addCounter: (claim, counter) => addCounterEvidence(claim, counter),
      confidence: synthConfidence,
    },
    verify: {
      // 便捷一层：claim + 可选实验结果 → verdict/rationale/checks
      claim: (claim, experiment) => runVerification(claim, experiment),
    },
    plan: { selectNext, unlock },
    artifacts,
  };

  // 服务生命周期挂在 fiber effect 上：profile 卸载时自动回收。
  ctx.provide('researchCore', researchCore);
  ctx.logger?.(name).info('%s: researchCore mounted (claim/verify/plan/artifact)', name);

  // 面向模型的工具：纯内存、可验证；schema 采用原始 JSON Schema 形态。
  if (config.tools?.enabled === false) {
    ctx.logger?.(name).info('%s: config.tools.enabled=false，跳过工具注册（researchCore 仍挂载）', name);
    return;
  }
  return registerTools(ctx, researchCore, artifacts);
}

interface ToolRegistrar {
  register(def: unknown): () => void;
}

function registerTools(ctx: Context & { tools?: ToolRegistrar }, researchCore: ResearchCoreService, artifacts: ArtifactStore): (() => void) | undefined {
  const tools = (ctx as Context & { tools?: ToolRegistrar }).tools;
  if (!tools) {
    ctx.logger?.(name).warn('%s: ctx.tools 不可用，跳过工具注册', name);
    return undefined;
  }

  const disposers: Array<() => void> = [];

  disposers.push(tools.register({
    name: 'research_verify',
    description: '对一条研究 claim 执行验证闭环（证据核验 / 反证搜索 / 实验判定），返回 verdict/rationale/checks。',
    parameters: {
      type: 'object',
      properties: {
        claim: { type: 'string', description: '要验证的主张' },
        source: { type: 'string', description: '主张来源' },
        evidence: {
          type: 'array',
          items: { type: 'string', description: '一条支持性证据' },
          description: '支持性证据（默认置信 0.7）',
        },
        counterEvidence: {
          type: 'array',
          items: { type: 'string', description: '一条反证' },
          description: '反证（默认置信 0.8）',
        },
        experimentOutcome: {
          type: 'string',
          enum: ['support', 'refute', 'inconclusive'],
          description: '实验判定',
        },
      },
      required: ['claim'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          verdict: { type: 'string' },
          rationale: { type: 'string' },
          checks: { type: 'array', items: { type: 'string' } },
        },
        required: ['verdict', 'rationale', 'checks'],
        additionalProperties: false,
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      const input = args as {
        claim: string; source?: string; evidence?: string[];
        counterEvidence?: string[]; experimentOutcome?: 'support' | 'refute' | 'inconclusive';
      };
      let claim = researchCore.claims.create({
        statement: input.claim,
        type: 'Hypothesis',
        source: input.source ?? 'unknown',
      });
      for (const text of input.evidence ?? []) {
        claim = researchCore.claims.addEvidence(claim, { source: 'user', evidence: text, confidence: 0.8 });
      }
      for (const text of input.counterEvidence ?? []) {
        claim = researchCore.claims.addCounter(claim, { source: 'user', evidence: text, confidence: 0.9 });
      }
      const report = researchCore.verify.claim(claim, input.experimentOutcome
        ? { experiment: 'input', claim: claim.id, outcome: input.experimentOutcome, data: {}, archivedAt: new Date().toISOString() }
        : undefined);
      // 结果归档到 artifact store，便于追溯。
      artifacts.put({
        kind: 'result',
        title: `verify: ${claim.statement.slice(0, 40)}`,
        body: report.rationale,
        claimId: claim.id,
        meta: { claim: claim.statement, verdict: report.verdict },
      });
      return { verdict: report.verdict, rationale: report.rationale, checks: report.checks };
    },
  }));

  disposers.push(tools.register({
    name: 'research_record',
    description: '把一条研究产出（笔记/证据/实验/反例）写入 artifact store，返回 artifact id。',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['note', 'evidence-log', 'experiment', 'result', 'counterexample'], description: '产出类型' },
        title: { type: 'string', description: '标题' },
        body: { type: 'string', description: '正文' },
        claimId: { type: 'string', description: '关联 claim id' },
      },
      required: ['kind', 'title', 'body'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          kind: { type: 'string' },
          title: { type: 'string' },
          createdAt: { type: 'string' },
        },
        required: ['id', 'kind', 'title', 'createdAt'],
        additionalProperties: false,
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args) {
      const input = args as { kind: 'note' | 'evidence-log' | 'experiment' | 'result' | 'counterexample'; title: string; body: string; claimId?: string };
      const artifact = artifacts.put({
        kind: input.kind,
        title: input.title,
        body: input.body,
        claimId: input.claimId,
        meta: {},
      });
      return { id: artifact.id, kind: artifact.kind, title: artifact.title, createdAt: artifact.createdAt };
    },
  }));

  ctx.logger?.(name).info('%s: registered %d tools', name, disposers.length);
  // 显式返回 disposer：cordis registry.plugin() 在卸载本插件时统一调用。
  return () => { for (const dispose of disposers) dispose(); };
}
