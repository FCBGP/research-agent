// @basil/dsh-research/tools — preset 平面插件：14 个 research_* 工具（阶段 5·B2 + 阶段 8·TRIZ）。
//
// 阶段 5 把 research_* 工具从 host 全局层（原 src/plugin.ts 的 registerTools）移到
// preset 作用域：本插件作为 preset-research 的 research-tools 子行挂载
// （见 presets/research.patch.yml），`ctx.tools`（dsh-tools 的会话工具目录）在会话
// 作用域注册 → 工具只进 research 预设会话的工具目录，不再污染 standard 等其它预设。
//
// 消费 host 平面 5 插件提供的服务：`inject ['tools']` 保证 ctx.tools 就绪；
// researchCore / researchMemory / researchAgents / researchDirector /
// researchExperiment / researchWriter / researchPolicy / researchAutonomous /
// researchJobs / researchScheduler / researchSelfImprove / researchSubagents
// 经 `ctx.get(...)` 惰性读取（cordis ctx.get 无需 inject）；缺任一核心服务时告警跳过，
// 不注册半吊子工具。14 个 research_* 工具定义原样保留（与 src/plugin.ts 一致）。

import type { Context } from '@deepseek-ai/cordis';
import type { ArtifactStore } from './core/artifact-store.ts';
import type { ExperimentResult, ResearchClaim, ResearchTask } from './core/types.ts';
import type { ResearchMemory } from './memory/index.ts';
import type { ResearchAgents } from './agents/index.ts';
import type { ResearchDirector } from './research-director/director.ts';
import type { CampaignReport } from './experiment/runner.ts';
import type { ResearchWriter } from './writer/index.ts';
import type { PolicyService } from './policy/index.ts';
import type { AutonomousInput, AutonomousReport } from './autonomous/index.ts';
import type { Job, JobRunner } from './jobs/index.ts';
import type { ResearchScheduler, ScheduleSpec } from './scheduler/index.ts';
import type { SelfImprover, ReflectionReport } from './self-improve/index.ts';
import type { RealSubagentAgent } from './real-subagent/index.ts';
import type { ResearchExperimentService } from './plugin-experiment.ts';
import type { ResearchTrizService } from './triz/index.ts';
import { DOMAIN_KEYWORDS } from './domain/index.ts';
import type { ResearchDomain } from './plugin-core.ts';

export const name = 'dsh-research-tools';

/** 依赖 dsh-tools 提供的 ctx.tools 服务；host research 服务经 ctx.get 惰性消费。 */
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
  domain: ResearchDomain;
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
      validator?: 'none' | 'rov' | 'bgpsec' | 'rov+bgpsec' | 'aspa' | 'rov+aspa';
      attackClass?: 'prefix-hijack' | 'subprefix-hijack' | 'as-set-injection' | 'path-manipulation' | 'authorized-leak';
      asCount?: number;
      supportThreshold?: number;
    }): CampaignReport;
  };
  writer: ResearchWriter;
  policy: PolicyService;
  autonomous: {
    run(input: AutonomousInput): AutonomousReport;
  };
  jobs: JobRunner;
  scheduler: ResearchScheduler;
  selfImprove: SelfImprover;
  subagents: RealSubagentAgent;
  triz: ResearchTrizService;
}

export interface PluginToolsConfig {
  tools?: {
    enabled?: boolean;
    /** 角色预设裁剪：only 提供白名单时只注册列出的 research_* 工具名（缺省 = 全部 13 个）。 */
    only?: string[];
  };
}

/**
 * preset 平面 apply：消费 host 平面 5 插件提供的服务（ctx.get(researchCore/…)），
 * 装配 runtime 聚合，再注册 14 个 research_* 工具（含 research_triz）。返回 disposer（卸载时注销工具）。
 */
export function apply(ctx: Context, config: PluginToolsConfig = {}): (() => void) | undefined {
  if (config.tools?.enabled === false) {
    ctx.logger?.(name).info('%s: config.tools.enabled=false，跳过工具注册', name);
    return undefined;
  }

  const researchCore = ctx.get('researchCore') as ResearchCoreService | undefined;
  const memory = ctx.get('researchMemory') as ResearchMemory | undefined;
  const agents = ctx.get('researchAgents') as ResearchAgents | undefined;
  const director = ctx.get('researchDirector') as ResearchDirector | undefined;
  const experiment = ctx.get('researchExperiment') as ResearchExperimentService | undefined;
  const writer = ctx.get('researchWriter') as ResearchWriter | undefined;
  const policy = ctx.get('researchPolicy') as PolicyService | undefined;
  const autonomous = ctx.get('researchAutonomous') as ResearchRuntimeService['autonomous'] | undefined;
  const jobs = ctx.get('researchJobs') as JobRunner | undefined;
  const scheduler = ctx.get('researchScheduler') as ResearchScheduler | undefined;
  const selfImprove = ctx.get('researchSelfImprove') as SelfImprover | undefined;
  const subagents = ctx.get('researchSubagents') as RealSubagentAgent | undefined;
  const triz = ctx.get('researchTriz') as ResearchTrizService | undefined;

  if (!researchCore || !memory || !agents || !director || !experiment || !writer ||
      !policy || !autonomous || !jobs || !scheduler || !selfImprove || !subagents || !triz) {
    ctx.logger?.(name).warn('%s: host research 服务未就绪（research-core / research-writer / research-operations 未挂载？），跳过工具注册', name);
    return undefined;
  }

  const runtime: ResearchRuntimeService = {
    memory, agents, director, experiment, writer, policy, autonomous,
    jobs, scheduler, selfImprove, subagents, triz,
  };
  return registerTools(ctx, researchCore, runtime, config?.tools?.only);
}

interface ToolRegistrar {
  register(def: unknown): () => void;
}

function registerTools(
  ctx: Context & { tools?: ToolRegistrar },
  researchCore: ResearchCoreService,
  runtime: ResearchRuntimeService,
  only?: string[],
): (() => void) | undefined {
  const tools = (ctx as Context & { tools?: ToolRegistrar }).tools;
  if (!tools) {
    ctx.logger?.(name).warn('%s: ctx.tools 不可用，跳过工具注册', name);
    return undefined;
  }

  const disposers: Array<() => void> = [];

  // 角色预设裁剪：config.tools.only 提供白名单时只注册列出的 research_* 工具
  // （缺省 = 全部 13 个；research 预设不设 only → 全量，行为与阶段 5 一致）。
  const allow = only && only.length > 0 ? new Set(only) : undefined;
  const register = (def: unknown) => {
    if (allow && !allow.has((def as { name: string }).name)) return;
    disposers.push(tools.register(def));
  };

  register({
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
  });

  register({
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
  });

  register({
    name: 'research_search',
    description: '在 RPKI/BGPsec 文献语料中检索相关文献（本地种子语料；可注入外部 source）。缺省 query 时用内置领域词汇（dsh-routing-research DOMAIN_KEYWORDS）兜底。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '检索词；缺省/空串时用内置领域词汇（bgp/rpki/bgpsec/aspa/fc-bgp/…）兜底' },
        topK: { type: 'number', description: '返回条数' },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { hits: { type: 'array', items: { type: 'object' } }, seeded: { type: 'boolean', description: '是否为内置领域词汇兜底检索（缺省/空 query 为 true）' } }, required: ['hits', 'seeded'], additionalProperties: false },
      render: (_a, v) => [{ type: 'text', text: JSON.stringify(v) }],
    },
    async execute(args) {
      const { query, topK } = args as { query?: string; topK?: number };
      // 内置领域词汇兜底：缺省/空 query 时检索整个领域（BGP / RPKI / BGPsec / ASPA / VRO / CRC / FC-BGP / FRR / VPP）。
      const q = (query ?? '').trim() || researchCore.domain.keywords.join(' ');
      const hits = runtime.agents.literature.search(q, topK ?? 5);
      return { hits: hits.map((h) => ({ title: h.paper.title, year: h.paper.year, venue: h.paper.venue, abstract: h.paper.abstract, score: Number(h.score.toFixed(3)) })), seeded: !(query ?? '').trim() };
    },
  });

  register({
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
  });

  register({
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
  });

  register({
    name: 'research_campaign',
    description: '运行一次自动实验流水线（deploy → run×repetitions → collect → analyze → verify → archive），返回四口径统计与 verdict。默认确定性模拟拓扑（RouteEngineSim）；FRR/VPP 守护进程可用时由适配器接管。',
    parameters: {
      type: 'object',
      properties: {
        claim: { type: 'string', description: '待验证 claim 文本' },
        claimId: { type: 'string', description: 'claim id（可选）' },
        env: { type: 'string', enum: ['frr', 'vpp', 'sim'], description: '实验环境' },
        repetitions: { type: 'number', description: '重复轮数（默认 3）' },
        validator: { type: 'string', enum: ['none', 'rov', 'bgpsec', 'rov+bgpsec', 'aspa', 'rov+aspa'], description: '验证策略（ASPA = RFC 9319 路径政策验证）' },
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
      const input = args as { claim: string; claimId?: string; env?: 'frr' | 'vpp' | 'sim'; repetitions?: number; validator?: 'none' | 'rov' | 'bgpsec' | 'rov+bgpsec' | 'aspa' | 'rov+aspa'; attackClass?: 'prefix-hijack' | 'subprefix-hijack' | 'as-set-injection' | 'path-manipulation' | 'authorized-leak'; asCount?: number; supportThreshold?: number };
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
  });

  // —— 阶段 3.6/4a：Writer / Policy / Autonomous 四工具 ————————————————————————
  register({
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
  });

  register({
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
  });

  register({
    name: 'research_autonomous',
    description: '一键科研流水线：topic → 任务 DAG → Director（检索/假设）→ 确定性实验战役 + 4攻击×4验证策略实验矩阵 → 验证折入 claim → Writer 出论文+幻灯片（含矩阵）→ 归档（可选落盘 memoryDir）；返回结构化 AutonomousReport。',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: '研究主题' },
        hypothesis: { type: 'string', description: '可选中心假设（缺省自动生成）' },
        paperTitle: { type: 'string', description: '论文标题（缺省自动）' },
        env: { type: 'string', enum: ['frr', 'vpp', 'sim'], description: '实验环境（默认 sim）' },
        repetitions: { type: 'number', description: '实验重复轮数（默认 3）' },
        validator: { type: 'string', enum: ['none', 'rov', 'bgpsec', 'rov+bgpsec', 'aspa', 'rov+aspa'], description: '验证策略（默认 none）' },
        supportThreshold: { type: 'number', description: '判定 support 的检测率阈值（默认 0.8）' },
        seed: { type: 'number', description: '确定性模拟种子' },
        matrix: { type: 'boolean', description: '运行 4 攻击 × 4 验证策略实验矩阵（默认 true，false 关闭）' },
        memoryDir: { type: 'string', description: '可选：流水线结束后把五类记忆（论文/幻灯片/矩阵 artifact）落盘到该目录' },
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
          matrix: { type: 'object' }, episodes: { type: 'number' }, summary: { type: 'string' },
        },
        required: ['goalId', 'summary'],
        additionalProperties: true,
      },
      render: (_a, v) => [{ type: 'text', text: JSON.stringify({ summary: v.summary, campaign: v.campaign ? { verdict: v.campaign.verdict, outcome: v.campaign.outcome, detection: v.campaign.detection?.mean } : null, matrix: v.matrix ? { attacks: v.matrix.attacks?.length, validators: v.matrix.validators?.length, cells: v.matrix.cells?.length } : null, claimVerdicts: v.claimVerdicts, artifacts: v.artifacts?.length }, null, 2) }],
    },
    async execute(args) {
      const input = args as { topic: string; hypothesis?: string; paperTitle?: string; env?: 'frr' | 'vpp' | 'sim'; repetitions?: number; validator?: 'none' | 'rov' | 'bgpsec' | 'rov+bgpsec' | 'aspa' | 'rov+aspa'; supportThreshold?: number; seed?: number; matrix?: boolean; memoryDir?: string };
      const report = runtime.autonomous.run({
        ...input,
        matrix: input.matrix === false ? false : undefined,
      });
      return {
        goalId: report.goalId,
        topic: report.topic,
        claimVerdicts: report.claimVerdicts,
        artifacts: report.artifacts,
        paper: report.paper,
        slides: report.slides,
        campaign: report.campaign ? { verdict: report.campaign.verdict, outcome: report.campaign.outcome, detection: { mean: report.campaign.detection.mean, falsePositive: report.campaign.detection.falsePositive.mean }, results: report.campaign.results.length } : undefined,
        matrix: report.matrix ? { attacks: report.matrix.attacks, validators: report.matrix.validators, cells: report.matrix.cells } : undefined,
        episodes: report.episodes,
        summary: report.summary,
      };
    },
  });

  register({
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
  });

  // —— 阶段 4b：Jobs / Schedule / Reflect 三工具 ————————————————————————————————
  register({
    name: 'research_job',
    description: '长任务队列：submit 提交科研任务（research=一键流水线 / campaign=自动实验）异步入队并执行，list/get 轮询状态，cancel 取消未开始任务。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['submit', 'list', 'get', 'cancel'], description: '操作' },
        jobId: { type: 'string', description: 'get/cancel 用' },
        kind: { type: 'string', enum: ['research', 'campaign'], description: '任务类别（submit 用）' },
        title: { type: 'string', description: '任务标题' },
        topic: { type: 'string', description: 'research 任务的研究主题' },
        hypothesis: { type: 'string', description: 'research 任务的可选中心假设' },
        claim: { type: 'string', description: 'campaign 任务的 claim' },
        validator: { type: 'string', enum: ['none', 'rov', 'bgpsec', 'rov+bgpsec', 'aspa', 'rov+aspa'] },
        supportThreshold: { type: 'number' },
        repetitions: { type: 'number' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { action: { type: 'string' }, jobs: { type: 'array', items: { type: 'object' } }, job: { type: 'object' }, cancelled: { type: 'boolean' }, message: { type: 'string' } }, required: ['action'], additionalProperties: true },
      render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }],
    },
    async execute(args) {
      const input = args as { action: 'submit' | 'list' | 'get' | 'cancel'; jobId?: string; kind?: 'research' | 'campaign'; title?: string; topic?: string; hypothesis?: string; claim?: string; validator?: 'none' | 'rov' | 'bgpsec' | 'rov+bgpsec' | 'aspa' | 'rov+aspa'; supportThreshold?: number; repetitions?: number };
      if (input.action === 'submit') {
        const kind = input.kind ?? 'research';
        if (kind === 'campaign') {
          if (!input.claim) return { action: input.action, message: 'campaign 任务缺少 claim' };
          const job = runtime.jobs.submit({ kind: 'campaign', title: input.title ?? `campaign: ${input.claim.slice(0, 30)}`, run: () => runtime.experiment.runAutomatic({ claim: input.claim!, validator: input.validator, supportThreshold: input.supportThreshold, repetitions: input.repetitions }) });
          return { action: input.action, job: jobView(job) };
        }
        if (!input.topic) return { action: input.action, message: 'research 任务缺少 topic' };
        const job = runtime.jobs.submit({ kind: 'research', title: input.title ?? `research: ${input.topic.slice(0, 30)}`, run: () => runtime.autonomous.run({ topic: input.topic!, hypothesis: input.hypothesis, validator: input.validator, supportThreshold: input.supportThreshold, repetitions: input.repetitions }) });
        return { action: input.action, job: jobView(job) };
      }
      if (input.action === 'list') {
        return { action: input.action, jobs: runtime.jobs.list().map(jobView) };
      }
      if (input.action === 'get') {
        const job = input.jobId ? runtime.jobs.get(input.jobId) : undefined;
        return { action: input.action, job: job ? jobView(job) : undefined, message: job ? '' : `未找到 job ${input.jobId ?? ''}` };
      }
      const cancelled = input.jobId ? runtime.jobs.cancel(input.jobId) : false;
      return { action: input.action, cancelled, message: cancelled ? `已取消 ${input.jobId}` : `无法取消 ${input.jobId ?? ''}（未开始的任务才可取消）` };
    },
  });

  register({
    name: 'research_schedule',
    description: '周期/每日/一次性科研调度：register 注册（at ISO / daily HH:MM / everyMs），due 查到期项，tick 触发到期调度跑自动流水线，unregister 移除。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['register', 'unregister', 'due', 'tick'], description: '操作' },
        scheduleId: { type: 'string', description: '调度 id' },
        topic: { type: 'string', description: '研究主题（register 必需）' },
        hypothesis: { type: 'string' },
        daily: { type: 'string', description: "'HH:MM' 每日时刻" },
        everyMs: { type: 'number', description: '周期毫秒' },
        at: { type: 'string', description: 'ISO 一次性时刻' },
        validator: { type: 'string', enum: ['none', 'rov', 'bgpsec', 'rov+bgpsec', 'aspa', 'rov+aspa'] },
        supportThreshold: { type: 'number' },
        enabled: { type: 'boolean' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { action: { type: 'string' }, schedule: { type: 'object' }, schedules: { type: 'array', items: { type: 'object' } }, runs: { type: 'array', items: { type: 'object' } }, removed: { type: 'boolean' }, message: { type: 'string' } }, required: ['action'], additionalProperties: true },
      render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }],
    },
    async execute(args) {
      const input = args as { action: 'register' | 'unregister' | 'due' | 'tick'; scheduleId?: string; topic?: string; hypothesis?: string; daily?: string; everyMs?: number; at?: string; validator?: 'none' | 'rov' | 'bgpsec' | 'rov+bgpsec' | 'aspa' | 'rov+aspa'; supportThreshold?: number; enabled?: boolean };
      if (input.action === 'register') {
        if (!input.scheduleId || !input.topic) return { action: input.action, message: 'register 需要 scheduleId 与 topic' };
        const schedule = runtime.scheduler.register({ id: input.scheduleId, topic: input.topic, hypothesis: input.hypothesis, daily: input.daily, everyMs: input.everyMs, at: input.at, validator: input.validator, supportThreshold: input.supportThreshold, enabled: input.enabled });
        return { action: input.action, schedule: scheduleView(schedule) };
      }
      if (input.action === 'unregister') {
        const removed = input.scheduleId ? runtime.scheduler.unregister(input.scheduleId) : false;
        return { action: input.action, removed, message: removed ? `已移除 ${input.scheduleId}` : `未找到 ${input.scheduleId ?? ''}` };
      }
      if (input.action === 'due') {
        return { action: input.action, schedules: runtime.scheduler.due().map(scheduleView) };
      }
      const runs = runtime.scheduler.tick();
      return { action: input.action, runs: runs.map((r) => ({ scheduleId: r.scheduleId, at: r.at, verdict: r.report.campaign?.verdict ?? 'n/a', nextRunAt: r.nextRunAt })) };
    },
  });

  register({
    name: 'research_reflect',
    description: '基于情景记忆自省：统计核验/实验/长任务/调度状况，输出观察与改进建议（self-improvement），并归档反思。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: { type: 'object', properties: { at: { type: 'string' }, summary: { type: 'string' }, snapshot: { type: 'object' }, observations: { type: 'array', items: { type: 'object' } }, recommendations: { type: 'array', items: { type: 'object' } } }, required: ['at', 'summary'], additionalProperties: true },
      render: (_a, v) => [{ type: 'text', text: JSON.stringify({ summary: v.summary, snapshot: v.snapshot, recommendations: v.recommendations }, null, 2) }],
    },
    async execute() {
      const report: ReflectionReport = runtime.selfImprove.reflect();
      return { at: report.at, summary: report.summary, snapshot: report.snapshot, observations: report.observations, recommendations: report.recommendations };
    },
  });

  register({
    name: 'research_triz',
    description:
      'TRIZ（发明问题解决理论）矛盾分析：把研究问题形式化为「改善↔恶化」技术矛盾，'
      + '查 40 发明原理 / 精选矛盾矩阵给出机制方向假说、IFR 理想解与分离/进化视角。'
      + '输出皆为待核验 Hypothesis（source=triz, confidence=0.5），须经 research_verify / '
      + 'research_campaign 核验后才能成为 claim；record 时写入 artifact + 情景记忆。',
    parameters: {
      type: 'object',
      properties: {
        problem: { type: 'string', description: '要解决的研究问题 / 机制矛盾（如「ROV 提升劫持检测率但跨长收敛」）' },
        improving: { type: 'string', description: '想改善的方面：中英皆可（reliability / 检测 / 抗劫持 / 收敛 / 自动化…）' },
        worsening: { type: 'string', description: '可接受的恶化方面（latency / 复杂度 / 开销 / CPU / 部署成本…）' },
        record: { type: 'boolean', description: '是否写入 artifact + 情景记忆（默认 true）' },
      },
      required: ['problem'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          problem: { type: 'string' },
          source: { type: 'string', enum: ['curated-matrix', 'heuristic-fallback', 'unresolved'] },
          contradiction: { type: 'object' },
          candidates: { type: 'array', items: { type: 'object' } },
          separation: { type: 'array', items: { type: 'object' } },
          evolution: { type: 'array', items: { type: 'object' } },
          ideality: { type: 'object' },
          hypotheses: { type: 'array', items: { type: 'object' } },
          artifactId: { type: 'string' },
        },
        required: ['problem', 'source', 'candidates', 'hypotheses'],
        additionalProperties: true,
      },
      render: (_a, v) => [{
        type: 'text',
        text: JSON.stringify({
          problem: v.problem,
          source: v.source,
          contradiction: v.contradiction,
          candidates: (v.candidates ?? []).map((c) => `#${c.no} ${c.name} — ${c.routingHint}`),
          hypotheses: (v.hypotheses ?? []).map((h) => h.statement),
          artifactId: v.artifactId,
        }, null, 2),
      }],
    },
    async execute(args) {
      const input = args as { problem: string; improving?: string; worsening?: string; record?: boolean };
      const analysis = runtime.triz.analyzeProblem({ problem: input.problem, improving: input.improving, worsening: input.worsening });
      const ideality = runtime.triz.idealityFraming({ problem: input.problem });
      const hypotheses = runtime.triz.toHypotheses(analysis);
      let artifactId: string | undefined;
      if (input.record !== false) {
        const body = hypotheses.map((h) => `[原理${h.principleNo} ${h.principleName}] ${h.statement}`).join('\n');
        artifactId = researchCore.artifacts.put({
          kind: 'note',
          title: `triz: ${input.problem.slice(0, 40)}`,
          body,
          meta: { source: analysis.source, candidates: analysis.candidates.map((c) => c.no) },
        }).id;
        runtime.memory.episodic.record({ kind: 'triz', summary: `triz: ${input.problem.slice(0, 40)}`, outcome: analysis.source });
      }
      return {
        problem: analysis.problem,
        source: analysis.source,
        contradiction: analysis.contradiction,
        candidates: analysis.candidates.map((c) => ({ no: c.no, name: c.name, summary: c.summary, routingHint: c.routingHint })),
        separation: analysis.separation,
        evolution: analysis.evolution,
        ideality,
        hypotheses,
        artifactId,
      };
    },
  });


function jobView(job: Job): { id: string; kind: string; title: string; status: string; progress: number; error?: string; createdAt: string } {
  return { id: job.id, kind: job.kind, title: job.title, status: job.status, progress: job.progress, error: job.error, createdAt: job.createdAt };
}

function scheduleView(schedule: ScheduleSpec): { id: string; topic: string; enabled: boolean; daily?: string; everyMs?: number; at?: string; lastRunAt?: string; nextRunAt?: string } {
  return { id: schedule.id, topic: schedule.topic, enabled: schedule.enabled === true, daily: schedule.daily, everyMs: schedule.everyMs, at: schedule.at, lastRunAt: schedule.lastRunAt, nextRunAt: schedule.nextRunAt };
}

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

  ctx.logger?.(name).info(
    '%s: registered %d/%d research tools%s',
    name, disposers.length, allow ? allow.size : 14, allow ? ` (tools.only=${[...allow].join(',')})` : '',
  );
  // 显式返回 disposer：cordis registry.plugin() 在卸载本插件时统一调用。
  return () => {
    for (const dispose of disposers) dispose();
  };
}
