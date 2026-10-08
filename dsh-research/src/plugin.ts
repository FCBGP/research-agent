// @basil/dsh-research — dsh 运行时插件入口（Cordis 插件形态）。
//
// 三条黄金规则下挂在 dsh 之上，不改任何 dsh 内部代码：
//   1) 只消费公开 seam：`ctx`（cordis）、`ctx.tools`（@deepseek-ai/dsh-tools）
//   2) 通过 profile 的 patch 层注入（见 package.json `dsh.bundle.patch`）
//   3) 领域逻辑全部在 `src/core|memory|agents|research-*`，本文件仅做
//      「挂载 + 工具注册」薄层
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
import { createMemory, loadMemoryInto, type ResearchMemory } from './memory/index.ts';
import { createAgents, type ResearchAgents } from './agents/index.ts';
import { ResearchDirector } from './research-director/director.ts';
import { runCampaign, type CampaignReport } from './experiment/runner.ts';
import { createWriter, type ResearchWriter } from './writer/index.ts';
import { PolicyService, type PolicyOptions } from './policy/index.ts';
import { runAutonomousResearch, type AutonomousInput, type AutonomousReport } from './autonomous/index.ts';

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

/** 阶段 2 服务：记忆 + 三个角色 agent + 调度器。 */
export interface ResearchRuntimeService {
  memory: ResearchMemory;
  agents: ResearchAgents;
  director: ResearchDirector;
  experiment: {
    runAutomatic(input: {
      claim: string;
      claimId?: string;
      env?: 'frr' | 'vpp' | 'sim';
      repetitions?: number;
      validator?: 'none' | 'rov' | 'bgpsec' | 'rov+bgpsec';
      attackClass?: 'prefix-hijack' | 'subprefix-hijack' | 'as-set-injection' | 'path-manipulation';
      asCount?: number;
      supportThreshold?: number;
    }): CampaignReport;
  };
  writer: ResearchWriter;
  policy: PolicyService;
  autonomous: {
    run(input: AutonomousInput): AutonomousReport;
  };
}

export interface PluginConfig {
  tools?: { enabled?: boolean };
  memory?: { dir?: string };
  agents?: { enabled?: boolean };
  policy?: PolicyOptions;
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
      claim: (claim, experiment) => runVerification(claim, experiment),
    },
    plan: { selectNext, unlock },
    artifacts,
  };

  // —— 阶段 2：Research Memory + 三个角色 agent + Director ——
  const memory = createMemory();
  const agents = createAgents({ memory });
  const director = new ResearchDirector(memory, agents);
  const experiment = {
    runAutomatic: (input: Parameters<ResearchRuntimeService['experiment']['runAutomatic']>[0]): CampaignReport => {
      const claimId = input.claimId ?? `claim-${Date.now().toString(36)}`;
      return runCampaign(memory, agents.experiment, {
        claim: { id: claimId, statement: input.claim },
        env: input.env,
        repetitions: input.repetitions,
        validator: input.validator,
        attackClass: input.attackClass,
        asCount: input.asCount,
        supportThreshold: input.supportThreshold,
      });
    },
  };
  // —— 阶段 3.6/4a：Writer（论文/幻灯片）+ Policy（10 条纪律）+ Autonomous（一键流水线）——
  const writer = createWriter();
  const policy = new PolicyService(config.policy);
  const autonomous = {
    run: (input: AutonomousInput): AutonomousReport =>
      runAutonomousResearch(input, { memory, agents, writer }),
  };
  const runtime: ResearchRuntimeService = { memory, agents, director, experiment, writer, policy, autonomous };

  if (config.memory?.dir) loadMemoryInto(memory, config.memory.dir);

  // 服务生命周期挂在 fiber effect 上：profile 卸载时自动回收。
  ctx.provide('researchCore', researchCore);
  ctx.provide('researchMemory', memory);
  ctx.provide('researchAgents', agents);
  ctx.provide('researchDirector', director);
  ctx.provide('researchExperiment', experiment);
  ctx.provide('researchWriter', writer);
  ctx.provide('researchPolicy', policy);
  ctx.provide('researchAutonomous', autonomous);
  ctx.logger?.(name).info('%s: researchCore + memory + agents + director + experiment + writer + policy + autonomous mounted', name);

  if (config.tools?.enabled === false) {
    ctx.logger?.(name).info('%s: config.tools.enabled=false，跳过工具注册（服务仍挂载）', name);
    return;
  }
  return registerTools(ctx, researchCore, runtime);
}

interface ToolRegistrar {
  register(def: unknown): () => void;
}

function registerTools(
  ctx: Context & { tools?: ToolRegistrar },
  researchCore: ResearchCoreService,
  runtime: ResearchRuntimeService,
): (() => void) | undefined {
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
        evidence: { type: 'array', items: { type: 'string' }, description: '支持性证据（默认置信 0.7）' },
        counterEvidence: { type: 'array', items: { type: 'string' }, description: '反证（默认置信 0.8）' },
        experimentOutcome: { type: 'string', enum: ['support', 'refute', 'inconclusive'], description: '实验判定' },
      },
      required: ['claim'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: { verdict: { type: 'string' }, rationale: { type: 'string' }, checks: { type: 'array', items: { type: 'string' } } },
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
      let claim = researchCore.claims.create({ statement: input.claim, type: 'Hypothesis', source: input.source ?? 'unknown' });
      for (const text of input.evidence ?? []) {
        claim = researchCore.claims.addEvidence(claim, { source: 'user', evidence: text, confidence: 0.8 });
      }
      for (const text of input.counterEvidence ?? []) {
        claim = researchCore.claims.addCounter(claim, { source: 'user', evidence: text, confidence: 0.9 });
      }
      const report = researchCore.verify.claim(claim, input.experimentOutcome
        ? { experiment: 'input', claim: claim.id, outcome: input.experimentOutcome, data: {}, archivedAt: new Date().toISOString() }
        : undefined);
      runtime.memory.episodic.record({ kind: 'verify', summary: `verify: ${input.claim.slice(0, 40)}`, claimId: claim.id, outcome: report.verdict });
      researchCore.artifacts.put({ kind: 'result', title: `verify: ${input.claim.slice(0, 40)}`, body: report.rationale, claimId: claim.id, meta: { claim: input.claim, verdict: report.verdict } });
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
        properties: { id: { type: 'string' }, kind: { type: 'string' }, title: { type: 'string' }, createdAt: { type: 'string' } },
        required: ['id', 'kind', 'title', 'createdAt'],
        additionalProperties: false,
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args) {
      const input = args as { kind: 'note' | 'evidence-log' | 'experiment' | 'result' | 'counterexample'; title: string; body: string; claimId?: string };
      const artifact = researchCore.artifacts.put({ kind: input.kind, title: input.title, body: input.body, claimId: input.claimId, meta: {} });
      return { id: artifact.id, kind: artifact.kind, title: artifact.title, createdAt: artifact.createdAt };
    },
  }));

  disposers.push(tools.register({
    name: 'research_search',
    description: '在 RPKI/BGPsec 文献语料中检索相关文献（本地种子语料；可注入外部 source）。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '检索词' },
        topK: { type: 'number', description: '返回条数' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { hits: { type: 'array', items: { type: 'object' } } }, required: ['hits'], additionalProperties: false },
      render: (_a, v) => [{ type: 'text', text: JSON.stringify(v) }],
    },
    async execute(args) {
      const { query, topK } = args as { query: string; topK?: number };
      const hits = runtime.agents.literature.search(query, topK ?? 5);
      return { hits: hits.map((h) => ({ title: h.paper.title, year: h.paper.year, venue: h.paper.venue, abstract: h.paper.abstract, score: Number(h.score.toFixed(3)) })) };
    },
  }));

  disposers.push(tools.register({
    name: 'research_review',
    description: '对一篇文献执行 8 步结构化学术审稿（research-paper-review 清单），返回每步评分、总判定与改进建议。',
    parameters: {
      type: 'object',
      properties: {
        paperTitle: { type: 'string', description: '文献标题' },
        paperId: { type: 'string', description: '文献 id（语料中）' },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              step: { type: 'number' }, score: { type: 'number' },
              strengths: { type: 'array', items: { type: 'string' } },
              concerns: { type: 'array', items: { type: 'string' } },
              suggestion: { type: 'string' },
            },
            required: ['step', 'score'],
            additionalProperties: false,
          },
          description: '模型/人工逐步点评（1..8）',
        },
      },
      required: ['paperTitle', 'steps'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { verdict: { type: 'string' }, overallScore: { type: 'number' }, steps: { type: 'array' } }, required: ['verdict', 'overallScore'], additionalProperties: false },
      render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }],
    },
    async execute(args) {
      const input = args as { paperTitle: string; paperId?: string; steps: Array<{ step: number; score: number; strengths?: string[]; concerns?: string[]; suggestion?: string }> };
      const paper = {
        id: input.paperId ?? `ext-${input.paperTitle}`,
        title: input.paperTitle,
        authors: [] as string[],
        year: 0,
        venue: 'external',
        abstract: '',
        keywords: [] as string[],
      };
      const report = runtime.agents.reviewer.review({ paper, steps: input.steps });
      runtime.memory.episodic.record({ kind: 'note', summary: `审稿 ${report.paperTitle.slice(0, 40)} → ${report.verdict}`, source: 'reviewer', outcome: report.verdict });
      runtime.memory.artifact.put({ kind: 'report', title: `review: ${report.paperTitle.slice(0, 60)}`, body: JSON.stringify(report), meta: { verdict: report.verdict, overall: report.overallScore } });
      return {
        verdict: report.verdict,
        overallScore: report.overallScore,
        steps: report.steps.map((st) => ({ step: st.step, label: st.label, score: st.score, robust: st.robust })),
        strengths: report.strengths.slice(0, 5),
        concerns: report.concerns.slice(0, 5),
      };
    },
  }));

  disposers.push(tools.register({
    name: 'research_experiment',
    description: '为一条 claim 生成实验计划并（用当前执行器）运行，返回配置指纹与结果（sim 环境为占位）。',
    parameters: {
      type: 'object',
      properties: {
        claim: { type: 'string', description: 'claim 文本' },
        claimId: { type: 'string', description: 'claim id（可选）' },
        env: { type: 'string', enum: ['frr', 'vpp', 'sim'] },
        repetitions: { type: 'number' },
      },
      required: ['claim'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { plan: { type: 'object' }, result: { type: 'object' } }, required: ['plan', 'result'], additionalProperties: false },
      render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }],
    },
    async execute(args) {
      const input = args as { claim: string; claimId?: string; env?: 'frr' | 'vpp' | 'sim'; repetitions?: number };
      const claimId = input.claimId ?? researchCore.claims.create({ statement: input.claim, type: 'Hypothesis', source: 'experiment' }).id;
      const plan = runtime.agents.experiment.plan({ claimId, claimStatement: input.claim, env: input.env, repetitions: input.repetitions });
      const result = runtime.agents.experiment.run(plan);
      return { plan: { id: plan.id, env: plan.env, scenario: plan.scenario, configFingerprint: plan.configFingerprint, metrics: plan.metrics, steps: plan.steps }, result };
    },
  }));

  disposers.push(tools.register({
    name: 'research_campaign',
    description: '运行一次自动实验流水线（deploy → run×repetitions → collect → analyze → verify → archive），返回四口径统计与 verdict。默认确定性模拟拓扑（RouteEngineSim）；FRR/VPP 守护进程可用时由适配器接管。',
    parameters: {
      type: 'object',
      properties: {
        claim: { type: 'string', description: '待验证 claim 文本' },
        claimId: { type: 'string', description: 'claim id（可选）' },
        env: { type: 'string', enum: ['frr', 'vpp', 'sim'], description: '实验环境' },
        repetitions: { type: 'number', description: '重复轮数（默认 3）' },
        validator: { type: 'string', enum: ['none', 'rov', 'bgpsec', 'rov+bgpsec'], description: '验证策略' },
        attackClass: { type: 'string', enum: ['prefix-hijack', 'subprefix-hijack', 'as-set-injection', 'path-manipulation'], description: '攻击类别' },
        asCount: { type: 'number', description: '参与者 AS 数（默认 40）' },
        supportThreshold: { type: 'number', description: 'detection_rate 达到该值判定 support（默认 0.8）' },
      },
      required: ['claim'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          claimId: { type: 'string' }, env: { type: 'string' }, scenario: { type: 'string' },
          configFingerprint: { type: 'string' }, outcome: { type: 'string' }, verdict: { type: 'string' },
          rationale: { type: 'string' }, artifacts: { type: 'array', items: { type: 'string' } }, stats: { type: 'object' },
        },
        required: ['claimId', 'verdict'],
        additionalProperties: false,
      },
      render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }],
    },
    async execute(args) {
      const input = args as { claim: string; claimId?: string; env?: 'frr' | 'vpp' | 'sim'; repetitions?: number; validator?: 'none' | 'rov' | 'bgpsec' | 'rov+bgpsec'; attackClass?: 'prefix-hijack' | 'subprefix-hijack' | 'as-set-injection' | 'path-manipulation'; asCount?: number; supportThreshold?: number };
      const report = runtime.experiment.runAutomatic(input);
      return {
        claimId: report.plan.claimId,
        env: report.plan.env,
        scenario: report.plan.scenario,
        configFingerprint: report.plan.configFingerprint,
        outcome: report.outcome,
        verdict: report.verdict,
        rationale: report.rationale,
        artifacts: report.artifacts,
        stats: {
          detection_rate: report.detection.mean,
          false_positive_rate: report.detection.falsePositive.mean,
          convergence_time: report.stats.convergence_time?.mean,
          verification_latency: report.stats.verification_latency?.mean,
        },
      };
    },
  }));

  // —— 阶段 3.6/4a：Writer / Policy / Autonomous 四工具 ————————————————————————
  disposers.push(tools.register({
    name: 'research_paper',
    description: '把研究项目（问题/假设/claims/证据/实验）渲染成结构化 Markdown 论文（摘要 + 6 章节 + 证据追溯附录），全部内容来自可追溯研究对象。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '论文标题' },
        researchQuestion: { type: 'string', description: '研究问题' },
        hypothesis: { type: 'string', description: '中心假设' },
        contextNotes: { type: 'array', items: { type: 'string' }, description: '文献/背景要点' },
        claims: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' }, statement: { type: 'string' }, type: { type: 'string' },
              confidence: { type: 'number' }, verificationStatus: { type: 'string' }, source: { type: 'string' },
              evidence: { type: 'array', items: { type: 'object' } },
              counterEvidence: { type: 'array', items: { type: 'object' } },
            },
            required: ['id', 'statement', 'type'],
            additionalProperties: true,
          },
          description: '研究 claim 列表（含证据/反证）',
        },
        experiments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              claimId: { type: 'string' }, configFingerprint: { type: 'string' }, scenario: { type: 'string' },
              outcome: { type: 'string' }, verdict: { type: 'string' }, engine: { type: 'string' },
              stats: { type: 'object' },
            },
            required: ['claimId', 'configFingerprint', 'scenario', 'outcome'],
            additionalProperties: true,
          },
        },
        limitations: { type: 'array', items: { type: 'string' } },
        artifacts: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'researchQuestion', 'hypothesis'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: { title: { type: 'string' }, abstract: { type: 'string' }, stats: { type: 'object' }, sections: { type: 'array', items: { type: 'object' } }, markdown: { type: 'string' } },
        required: ['title', 'markdown'],
        additionalProperties: true,
      },
      render: (_a, v) => [{ type: 'text', text: v.markdown }],
    },
    async execute(args) {
      const input = args as PaperInputLike;
      const report = runtime.writer.paper({
        title: input.title,
        researchQuestion: input.researchQuestion,
        hypothesis: input.hypothesis,
        contextNotes: input.contextNotes,
        claims: input.claims ?? [],
        experiments: input.experiments,
        limitations: input.limitations,
        artifacts: input.artifacts,
      });
      runtime.memory.artifact.put({ kind: 'report', title: input.title, body: report.markdown, meta: { kind: 'paper', claims: report.stats.claims } });
      return { title: report.title, abstract: report.abstract, stats: report.stats, sections: report.sections, markdown: report.markdown };
    },
  }));

  disposers.push(tools.register({
    name: 'research_slides',
    description: '从研究项目渲染 8 页 Marp 科研汇报幻灯片（标题/动机/方法/实验/结果/结论/局限/下一步），与 research_paper 共享同一 PaperInput。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '论文标题' },
        researchQuestion: { type: 'string', description: '研究问题' },
        hypothesis: { type: 'string', description: '中心假设' },
        contextNotes: { type: 'array', items: { type: 'string' } },
        claims: { type: 'array', items: { type: 'object' } },
        experiments: { type: 'array', items: { type: 'object' } },
        limitations: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'researchQuestion', 'hypothesis'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { title: { type: 'string' }, pages: { type: 'number' }, markdown: { type: 'string' } }, required: ['title', 'markdown'], additionalProperties: true },
      render: (_a, v) => [{ type: 'text', text: v.markdown }],
    },
    async execute(args) {
      const input = args as PaperInputLike;
      const deck = runtime.writer.slides({
        title: input.title,
        researchQuestion: input.researchQuestion,
        hypothesis: input.hypothesis,
        contextNotes: input.contextNotes,
        claims: input.claims ?? [],
        experiments: input.experiments,
        limitations: input.limitations,
      });
      runtime.memory.artifact.put({ kind: 'report', title: `${input.title} · slides`, body: deck.markdown, meta: { kind: 'slides', pages: deck.slides.length } });
      return { title: deck.title, pages: deck.slides.length, markdown: deck.markdown };
    },
  }));

  disposers.push(tools.register({
    name: 'research_autonomous',
    description: '一键科研流水线：topic → 任务 DAG → Director（检索/假设）→ 确定性实验战役 → 验证折入 claim → Writer 出论文+幻灯片 → 归档；返回结构化 AutonomousReport。',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: '研究主题' },
        hypothesis: { type: 'string', description: '可选中心假设（缺省自动生成）' },
        paperTitle: { type: 'string', description: '论文标题（缺省自动）' },
        env: { type: 'string', enum: ['frr', 'vpp', 'sim'], description: '实验环境（默认 sim）' },
        repetitions: { type: 'number', description: '实验重复轮数（默认 3）' },
        validator: { type: 'string', enum: ['none', 'rov', 'bgpsec', 'rov+bgpsec'], description: '验证策略（默认 none）' },
        supportThreshold: { type: 'number', description: '判定 support 的检测率阈值（默认 0.8）' },
        seed: { type: 'number', description: '确定性模拟种子' },
      },
      required: ['topic'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          goalId: { type: 'string' }, topic: { type: 'string' },
          claimVerdicts: { type: 'object' }, artifacts: { type: 'array', items: { type: 'string' } },
          paper: { type: 'string' }, slides: { type: 'string' }, campaign: { type: 'object' },
          episodes: { type: 'number' }, summary: { type: 'string' },
        },
        required: ['goalId', 'summary'],
        additionalProperties: true,
      },
      render: (_a, v) => [{ type: 'text', text: JSON.stringify({ summary: v.summary, campaign: v.campaign ? { verdict: v.campaign.verdict, outcome: v.campaign.outcome, detection: v.campaign.detection?.mean } : null, claimVerdicts: v.claimVerdicts, artifacts: v.artifacts?.length }, null, 2) }],
    },
    async execute(args) {
      const input = args as { topic: string; hypothesis?: string; paperTitle?: string; env?: 'frr' | 'vpp' | 'sim'; repetitions?: number; validator?: 'none' | 'rov' | 'bgpsec' | 'rov+bgpsec'; supportThreshold?: number; seed?: number };
      const report = runtime.autonomous.run(input);
      return {
        goalId: report.goalId,
        topic: report.topic,
        claimVerdicts: report.claimVerdicts,
        artifacts: report.artifacts,
        paper: report.paper,
        slides: report.slides,
        campaign: report.campaign ? { verdict: report.campaign.verdict, outcome: report.campaign.outcome, detection: { mean: report.campaign.detection.mean, falsePositive: report.campaign.detection.falsePositive.mean }, results: report.campaign.results.length } : undefined,
        episodes: report.episodes,
        summary: report.summary,
      };
    },
  }));

  disposers.push(tools.register({
    name: 'research_policy',
    description: '读取研究纪律策略（默认 10 条，profile 可通过 omit/extra 增删），返回 enabled/rules/prompt，供模型遵守或拼进系统提示。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: { type: 'object', properties: { enabled: { type: 'boolean' }, rules: { type: 'array', items: { type: 'object' } }, prompt: { type: 'string' } }, required: ['enabled', 'rules', 'prompt'], additionalProperties: true },
      render: (_a, v) => [{ type: 'text', text: v.prompt || JSON.stringify(v.rules, null, 2) }],
    },
    async execute() {
      const view = runtime.policy.view();
      return { enabled: view.enabled, rules: view.rules, prompt: view.prompt };
    },
  }));

  // PaperInput 形状（与 src/writer/paper.ts 对齐的插件侧宽类型）。
  interface PaperInputLike {
    title: string;
    researchQuestion: string;
    hypothesis: string;
    contextNotes?: string[];
    claims?: Array<{
      id: string; statement: string; type: string; confidence?: number; verificationStatus?: string;
      source?: string; evidence?: Array<{ source: string; evidence: string; confidence: number; verified?: boolean }>;
      counterEvidence?: Array<{ evidence: string; source: string }>;
    }>;
    experiments?: Array<{ claimId: string; configFingerprint: string; scenario: string; outcome: 'support' | 'refute' | 'inconclusive'; verdict?: string; stats?: Record<string, number>; engine?: string }>;
    limitations?: string[];
    artifacts?: string[];
  }

  ctx.logger?.(name).info('%s: registered %d tools', name, disposers.length);
  // 显式返回 disposer：cordis registry.plugin() 在卸载本插件时统一调用。
  return () => {
    for (const dispose of disposers) dispose();
  };
}
