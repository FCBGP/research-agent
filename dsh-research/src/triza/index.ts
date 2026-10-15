// src/triza/index.ts — 阶段 9 · TRIZa 闭环：researchTriza 服务（closed invention loop）。
//
// 论文对口（docs/2610.04555v1.pdf）：把 TRIZa 四阶段（矛盾识别 → 原理选择 → 方案生成 →
// 评估与进化）做成**可执行的闭环**，与阶段 8 的 TRIZ 思想层（src/triz/index.ts）衔接：
//   阶段 8 = 事前/正演想法（矛盾 → 原理 → 假说，confidence=0.5）；
//   阶段 9 = 事后/治理（冻结契约 → 类型化变换契约 → FI/Ideality → 硬门 → 晋升决策 →
//             追溯记录 + 负证据保留）。「指标提升是观察，晋升是被治理的决策」。
//
// 本服务纯函数 / 可测；依赖 src/triz（思想层，无环）+ src/triza 四个子模块。
// host 插件 plugin-triza.ts 只负责 ctx.provide('researchTriza', …)。
import type { FreezeContractInput, FrozenContract } from './contract.ts';
import { freezeContract } from './contract.ts';
import type { TypedTransformationDetail } from './typed.ts';
import { typedPlans } from './typed.ts';
import type { PromotionInput, PromotionDecision } from './promotion.ts';
import { decidePromotion, type HardGate } from './promotion.ts';
import type { TraceBundle } from './trace.ts';
import { createTraceBundle } from './trace.ts';
import type { ControllerAudit } from './audit.ts';
import { auditController, auditPolicies, type AuditDecisionRow } from './audit.ts';
import type { ResearchTrizService } from '../triz/index.ts';
import { createTrizService } from '../triz/index.ts';

export type { FrozenContract } from './contract.ts';
export { freezeContract, fingerprintContract, canonicalSerialize, sameFingerprint } from './contract.ts';
export type { TypedTransformationDetail, TypedClass } from './typed.ts';
export { TRIZ_TYPED_CLASSES, typedClass, typedContract, typedPlans } from './typed.ts';
export type { FiInput, FiResult } from './functional-information.ts';
export { functionalInformation, countMatchOrExceed, wilsonProportionBound, bitsFromCount } from './functional-information.ts';
export type { PromotionInput, PromotionDecision, HardGate, GateInput, GateBundle, EvidenceLevelSpec } from './promotion.ts';
export { decidePromotion, collectGates, EVIDENCE_LEVELS, evidenceLabel } from './promotion.ts';
export type { TraceBundle, TrizContextRecord, StrategyPlanRecord, ScoreLine } from './trace.ts';
export { createTraceBundle, trizContextRecord, strategyPlanRecord, scoreLine, sha256sums, renderStrategyPlanMd } from './trace.ts';
export type { ControllerAudit, AuditDecisionRow } from './audit.ts';
export { auditController, auditPolicies } from './audit.ts';

/** research_triza 工具 / 闭环输入（契约字段为可选覆盖，缺省给路由安全常用口径）。 */
export interface TrizaEvaluateInput extends Omit<FreezeContractInput, 'problem' | 'improving' | 'worsening'> {
  problem: string;
  improving: string;
  worsening: string;
  /** 候选 id（必填：每次执行都要落一条候选级记录）。 */
  candidateId: string;
  parentId?: string;
  /** 指定候选机制方向对应的原理；省略时用 researchTriz.analyzeProblem 推导。 */
  principleNos?: number[];
  /** 候选指标（冻结协议 κ 下测得）；至少含主指标与 false_positive_rate。 */
  metrics: Record<string, number>;
  /** 基线（incumbent）指标（同一 κ 下重跑）。 */
  baselineMetrics: Record<string, number>;
  /** 冻结参考总体 Bl 的 useful 配置值（higher-is-better）。 */
  referenceUseful: number[];
  /** 冻结参考总体 Bl 的 harmful 配置值（larger-is-worse）。 */
  referenceHarmful: number[];
  gates?: {
    integrity?: boolean;
    safety?: boolean;
    reproducibility?: boolean;
    resource?: boolean;
    extra?: HardGate[];
  };
  evidenceLevel?: number;
  certifiedLevel?: number;
  cost?: number;
  lambdaC?: number;
  requiresAuthorization?: boolean;
}

/** 一次闭环评估的完整报告（契约 / 类型化变换 / 决策 / 追溯包 / 汇总）。 */
export interface TrizaReport {
  claimId: string;
  contract: FrozenContract;
  fingerprint: string;
  problem: string;
  improving: string;
  worsening: string;
  typedPlans: TypedTransformationDetail[];
  decision: PromotionDecision;
  trace: TraceBundle;
  artifactSummary: string;
}

/** researchTriza 服务（host 插件 ctx.provide）。 */
export interface ResearchTrizaService {
  /** 冻结一份评估契约 + 协议指纹（改任一绑定字段 → 新指纹）。 */
  freezeContract(input: FreezeContractInput): { contract: FrozenContract; fingerprint: string };
  /** 一组原理 → 类型化变换契约（40 原理整表 + 精选子集详细契约）。 */
  typedPlans(principleNos: number[]): TypedTransformationDetail[];
  /** 闭环评估：冻结契约 → 原理(缺省经 TRIZ 思想层推导) → 类型化变换 → FI/Ideality →
   *  硬门 → 晋升决策 → 追溯记录。输入里的问题同时作为 TRIZ 矛盾输入。 */
  evaluate(input: TrizaEvaluateInput): TrizaReport;
  /** 控制器策略审计（Campaign08 风格）：balanced vs safety-first 描述性聚合。 */
  audit(rows: AuditDecisionRow[], opts?: { vetoHarmThreshold?: number }): {
    balanced: ControllerAudit;
    safetyFirst: ControllerAudit;
  };
}

let seq = 0;

/** 创建 researchTriza 服务（plugin-triza.ts 用；triz 参数可注入以复用既有 TRIZ 服务）。 */
export function createTrizaService(triz: ResearchTrizService = createTrizService()): ResearchTrizaService {
  const b = ++seq;
  void b;
  return {
    freezeContract,
    typedPlans,

    evaluate(input) {
      // 1) 冻结契约（含协议指纹）
      const { contract, fingerprint } = freezeContract({
        claimId: input.claimId,
        task: input.task,
        problem: input.problem,
        improving: input.improving,
        worsening: input.worsening,
        datasetVersion: input.datasetVersion,
        split: input.split,
        preprocessing: input.preprocessing,
        featureFitScope: input.featureFitScope,
        seeds: input.seeds,
        candidateBudget: input.candidateBudget,
        primaryMetric: input.primaryMetric,
        secondaryMetrics: input.secondaryMetrics,
        usefulEvents: input.usefulEvents,
        harmfulEvents: input.harmfulEvents,
        resourceCeilings: input.resourceCeilings,
        missingData: input.missingData,
        stoppingRule: input.stoppingRule,
        relativeGainPct: input.relativeGainPct,
        secondaryGates: input.secondaryGates,
        protocolVersion: input.protocolVersion,
      });

      // 2) 原理集合：显式给定优先；否则经 TRIZ 思想层的矛盾分析推导
      let principleNos = input.principleNos ?? [];
      let contradictionSrc = '';
      if (principleNos.length === 0) {
        const analysis = triz.analyzeProblem({ problem: input.problem, improving: input.improving, worsening: input.worsening });
        principleNos = analysis.candidates.map((c) => c.no);
        contradictionSrc = analysis.source;
      }

      // 3) 类型化变换契约 + 转换参数
      const plans = typedPlans(principleNos);
      const transformations = plans.map((p) => p.opType);

      // 4) 硬门 → 认证 → 晋升决策（promotion 决策独立于指标观察）
      const decision = decidePromotion({
        contract,
        contractFingerprint: fingerprint,
        candidateId: input.candidateId,
        parentId: input.parentId,
        principleNos,
        gates: input.gates ?? {},
        evidenceLevel: input.evidenceLevel ?? 1,
        certifiedLevel: input.certifiedLevel,
        metrics: input.metrics,
        baselineMetrics: input.baselineMetrics,
        reference: { useful: input.referenceUseful, harmful: input.referenceHarmful },
        cost: input.cost,
        lambdaC: input.lambdaC,
        requiresAuthorization: input.requiresAuthorization,
      });

      // 5) 追溯包（triz_context / strategy_plan / scores.jsonl 追加行 / 摘要）
      const trace = createTraceBundle({
        contract,
        fingerprint,
        principles: plans.map((p) => ({ no: p.principleNo, name: p.principleName })),
        plans,
        decision,
        candidateId: input.candidateId,
        parentId: input.parentId,
        seeds: contract.protocol.seeds,
        sources: contradictionSrc ? [contradictionSrc] : undefined,
      });

      const artifactSummary = [
        `claim=${contract.claimId}`,
        `fingerprint=${fingerprint.slice(0, 12)}…`,
        `principles=${plans.map((p) => `#${p.principleNo} ${p.opType}`).join(', ') || 'none'}`,
        `FI useful=${decision.fi.usefulFI}(LB=${decision.fi.usefulFI_LB}) harmful=${decision.fi.harmfulFI}(UB=${decision.fi.harmfulFI_UB})`,
        `decision=${decision.promotion} (admissible=${decision.admissible}, gain=${decision.relativeGainPct ?? 0}%)`,
      ].join('\n');

      return {
        claimId: contract.claimId,
        contract,
        fingerprint,
        problem: input.problem,
        improving: input.improving,
        worsening: input.worsening,
        typedPlans: plans,
        decision,
        trace,
        artifactSummary,
      };
    },

    audit(rows, opts) {
      return auditPolicies(rows, opts);
    },
  };
}

/** 方便外部直接构造服务（测试/插件复用同一实例化逻辑）。 */
export const createTriza = createTrizaService;
