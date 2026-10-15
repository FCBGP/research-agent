// src/triza/typed.ts — 阶段 9 · TRIZa 闭环：类型化变换契约（typed transformation τr）。
//
// 论文对口（docs/2610.04555v1.pdf，§3.2 / Table 1 / Appendix B Table 4）：
// 每次候选变换必须实例化某个已声明的 TRIZ 原理，且属于对应的**类型化变换算符**——
// 声明「我要做什么类型的变换、不能改变什么、需要什么证据」之后才允许执行。
// 一段变换只有 operator type 在**评估前**被声明才算 TRIZ 引导（有利结果单独出现不算）。
//
// 本表格 = 论文 Table 4 的 40 原理整表（transformation class 一句话）+ 面向路由安全的
// 精选子集的**详细契约**（输入/输出类型、允许参数、禁止变更、证据义务，Table 1 风格）。
// 渲染为 TypedTransformationDetail；未收录子集用 generic 占位（level: 'generic'），
// 调用方须按 Research Agent Policy 把输出当**待核验方向**而非事实。
import type { TrizPrinciple } from '../triz/data.ts';
import { TRIZ_PRINCIPLES } from '../triz/data.ts';

/** 论文 Table 4 的 40 原理 → 类型化变换类（一行口径，全表）。 */
export interface TypedClass {
  opType: string;
  description: string;
}

/** 精选子集的详细变换契约（Table 1 风格，路由安全适配）。 */
export interface TypedTransformationDetail {
  principleNo: number;
  principleName: string;
  opType: string;
  /** 该变换接受什么作为输入（父产物侧类型）。 */
  inputType: string;
  /** 该变换产出什么（候选产物侧类型）。 */
  outputType: string;
  /** 允许的具体参数（Δ 的取值域）。 */
  admissibleArgs: string[];
  /** 该变换明确禁止改变什么（守住冻结契约与不可侵犯边界）。 */
  prohibitedChanges: string[];
  /** 评估该候选要求提交的证据义务。 */
  evidenceObligations: string[];
  /** curated = 精选详细契约；generic = 仅来源于整表 class 的占位。 */
  level: 'curated' | 'generic';
}

/** 40 原理 → 类型化变换类（原文：

Table 4: TRIZ principles and software/agent transformation classes）。
 */
export const TRIZ_TYPED_CLASSES: Readonly<Record<number, TypedClass>> = {
  1: { opType: 'segmentation', description: 'Partition modules, data, decisions, or search regions behind a stable interface.' },
  2: { opType: 'taking_out', description: 'Isolate a confounder, harmful path, privileged component, or expensive stage.' },
  3: { opType: 'local_quality', description: 'Dispatch context-specific policy under a registered context type.' },
  4: { opType: 'asymmetry', description: 'Apply different rules to unequal classes, risks, or resource directions.' },
  5: { opType: 'merging', description: 'Compose compatible stages, features, models, or evaluation passes.' },
  6: { opType: 'universality', description: 'Replace duplicated components with one multi-role typed service.' },
  7: { opType: 'nested_doll', description: 'Introduce nested scopes, hierarchical models, or encapsulated sub-pipelines.' },
  8: { opType: 'anti_weight', description: 'Compensate load, bias, latency, or redundant effort with a counter force.' },
  9: { opType: 'preliminary_anti_action', description: 'Apply a pre-staged counteraction against an expected adverse event.' },
  10: { opType: 'preliminary_action', description: 'Prepare reusable state (compute, sign, cache) before the critical path.' },
  11: { opType: 'beforehand_cushioning', description: 'Add fallback, buffer, retry budget, or damage-limiting boundary.' },
  12: { opType: 'equipotentiality', description: 'Normalize representations or equalize operating conditions.' },
  13: { opType: 'other_way_round', description: 'Invert control, data flow, labels, optimization direction, or dependency.' },
  14: { opType: 'spheroidality', description: 'Replace brittle discrete geometry with smooth or continuous structure.' },
  15: { opType: 'dynamics', description: 'Adapt a parameter or module at runtime within frozen bounds.' },
  16: { opType: 'partial_excessive_action', description: 'Use approximation, overprovisioning, or a bounded partial result.' },
  17: { opType: 'another_dimension', description: 'Add a feature, hierarchy, temporal axis, view, or latent coordinate.' },
  18: { opType: 'mechanical_vibration', description: 'Introduce controlled probing, perturbation, or oscillatory scheduling.' },
  19: { opType: 'periodic_action', description: 'Re-evaluate, refresh, checkpoint, or sample on a registered schedule.' },
  20: { opType: 'continuity_useful_action', description: 'Stream or persist useful work while avoiding idle transitions.' },
  21: { opType: 'skipping', description: 'Add an early exit, fast path, pruning rule, or bypass for safe cases.' },
  22: { opType: 'blessing_in_disguise', description: 'Convert errors, attacks, or rejected candidates into training or test evidence.' },
  23: { opType: 'feedback', description: 'Update a bounded controller from measured residuals or evaluator evidence.' },
  24: { opType: 'intermediary', description: 'Insert an adapter, proxy, translator, broker, or validation layer.' },
  25: { opType: 'self_service', description: 'Add self-monitoring, self-configuration, or automated maintenance.' },
  26: { opType: 'copying', description: 'Use a surrogate, mock, digital twin, replay, or immutable snapshot.' },
  27: { opType: 'cheap_short_lived_objects', description: 'Use disposable sandboxes, ephemeral workers, or low-cost probes.' },
  28: { opType: 'mechanics_substitution', description: 'Replace a mechanism, representation, solver, or execution substrate.' },
  29: { opType: 'pneumatics_hydraulics', description: 'Introduce elastic resource pools, queues, or flow-control abstractions.' },
  30: { opType: 'flexible_shells_thin_films', description: 'Add a lightweight interface, wrapper, boundary, or soft constraint.' },
  31: { opType: 'porous_materials', description: 'Use sparse structure, slots, sampling windows, or selective permeability.' },
  32: { opType: 'color_changes', description: 'Change encoding, annotation, visibility, or diagnostic representation.' },
  33: { opType: 'homogeneity', description: 'Align schemas, units, interfaces, distributions, or component types.' },
  34: { opType: 'discarding_recovering', description: 'Garbage-collect, reset, recycle, or restore a component after use.' },
  35: { opType: 'parameter_change', description: 'Change a type, range, threshold, loss, weight, or operating point.' },
  36: { opType: 'phase_transition', description: 'Switch between discrete modes or representations at a registered boundary.' },
  37: { opType: 'thermal_expansion', description: 'Scale capacity or spacing as load changes within resource gates.' },
  38: { opType: 'strong_oxidants', description: 'Increase validation strength, selection pressure, or stress testing.' },
  39: { opType: 'inert_atmosphere', description: 'Isolate execution in a sandbox, no-op mode, or low-interaction context.' },
  40: { opType: 'composite_materials', description: 'Construct an ensemble or layered architecture with typed interfaces.' },
};

/** 精选子集：面向域间路由安全、与精选矛盾矩阵/路由提示对齐的 14 个原理的详细契约。 */
const CURATED_DETAILS: Record<number, Omit<TypedTransformationDetail, 'principleNo' | 'principleName' | 'opType' | 'level'>> = {
  1: {
    inputType: 'single monolithic validator / policy engine',
    outputType: 'partitioned validator set behind stable verdict interface',
    admissibleArgs: ['partition-by', 'shared-schema', 'fail-closed-branch'],
    prohibitedChanges: ['renaming shared verdict schema', 'changing frozen split', 'expanding candidate budget'],
    evidenceObligations: ['per-family detection artifact', 'paired rerun on frozen split', 'protocol fingerprint match'],
  },
  2: {
    inputType: 'combined detect+validate pipeline',
    outputType: 'isolated verification side-car with separate lifecycle',
    admissibleArgs: ['isolate', 'cache-endpoint', 'offload-layer'],
    prohibitedChanges: ['touching data plane forwarding', 'freezing verified set without digest'],
    evidenceObligations: ['side-car deployment artifact', 'zero train-test overlap ledger', 'resource ceiling checks'],
  },
  3: {
    inputType: 'uniform policy for all prefixes/peers',
    outputType: 'context-registered differentiated policy dispatch',
    admissibleArgs: ['context-key', 'class-boundary', 'strength-profile'],
    prohibitedChanges: ['registering new context type after evaluation', 'changing thresholds mid-eval'],
    evidenceObligations: ['context registry snapshot', 'class-wise metrics under frozen protocol'],
  },
  5: {
    inputType: 'independent ROV / BGPsec / ASPA / FC-BGP signals',
    outputType: 'merged composite verdict with typed interface',
    admissibleArgs: ['merge-strategy', 'source-weights', 'dependency-order'],
    prohibitedChanges: ['bypassing any registered gate', 'masking a vetoed source'],
    evidenceObligations: ['composite artifact', 'each source eval under same fingerprint'],
  },
  10: {
    inputType: 'on-path verification / signing in critical path',
    outputType: 'precomputed & cached verification/signing state',
    admissibleArgs: ['precompute-window', 'cache-digest', 'offline-signer'],
    prohibitedChanges: ['recomputing after observing traffic', 'invalidating cache digest without new fingerprint'],
    evidenceObligations: ['precompute artifact bound to split digest', 'staleness bound metric'],
  },
  11: {
    inputType: 'single source of truth with no fallback',
    outputType: 'cushioned multi-path validation with default-safe fallback',
    admissibleArgs: ['fallback', 'retry-budget', 'buffer-window'],
    prohibitedChanges: ['fallback that widens attack surface beyond frozen ceiling'],
    evidenceObligations: ['fallback behavior artifact', 'harm-event check on fallback path'],
  },
  13: {
    inputType: 'receiver-side validation burden',
    outputType: 'origin/forwarding self-attestation (self-certifying)',
    admissibleArgs: ['attestation-field', 'invert-direction', 'self-declaration'],
    prohibitedChanges: ['removing receiver-side sanity checks', 'claiming self-attestation == ground truth'],
    evidenceObligations: ['attestation artifact', 'paired rerun + counter search'],
  },
  15: {
    inputType: 'static strategy bound to one operating point',
    outputType: 'runtime-adaptive strategy within frozen bounds',
    admissibleArgs: ['adaptation-trigger', 'dynamics-bounds', 'threat-level'],
    prohibitedChanges: ['adapting outside frozen bounds', 'changing protocol without new fingerprint'],
    evidenceObligations: ['adaptation trace', 'worst-case resource metric'],
  },
  22: {
    inputType: 'wasted attack / rejected-candidate traces',
    outputType: 'annotated attack corpus / negative-evidence dataset',
    admissibleArgs: ['corpus-sink', 'label-mapping', 'retention-policy'],
    prohibitedChanges: ['feeding attack traces into training split (leakage)'],
    evidenceObligations: ['corpus digest', 'strict train/test separation ledger'],
  },
  23: {
    inputType: 'open-loop detector with fixed thresholds',
    outputType: 'feedback-tuned bounded controller from measured residuals',
    admissibleArgs: ['feedback-signal', 'controller-bounds', 'residual-source'],
    prohibitedChanges: ['gaming metric after observing output', 'changing gate after promotion'],
    evidenceObligations: ['controller policy decision ledger', 'promotion-specificity audit'],
  },
  24: {
    inputType: 'direct dependency / many-to-many trust graph',
    outputType: 'adapter / proxy / broker validation layer',
    admissibleArgs: ['proxy-mode', 'adapter-schema', 'broker-policy'],
    prohibitedChanges: ['transparent forwarding of unvalidated state'],
    evidenceObligations: ['adapter artifact', 'latency + coverage metrics under frozen protocol'],
  },
  25: {
    inputType: 'manual monitoring / rotation / maintenance',
    outputType: 'self-monitoring, self-configuration, automated maintenance',
    admissibleArgs: ['self-check', 'rotation-schedule', 'healing-action'],
    prohibitedChanges: ['autonomous action that bypasses human authorization for high-risk ops'],
    evidenceObligations: ['self-* audit trail', 'resource and safety gate checks'],
  },
  35: {
    inputType: 'binary trust / fixed operating point',
    outputType: 'parameterized trust or operating point (type/threshold/loss/weight)',
    admissibleArgs: ['threshold', 'class-weights', 'calibrated-loss', 'operating-point'],
    prohibitedChanges: ['changing type/range beyond frozen declaration'],
    evidenceObligations: ['registered parameter change', 'paired rerun under same fingerprint'],
  },
  40: {
    inputType: 'single-layer mechanism',
    outputType: 'layered ensemble with typed interfaces',
    admissibleArgs: ['layer-list', 'interface-contract', 'order'],
    prohibitedChanges: ['silently disabling one layer', 'merging decision boundaries across layers'],
    evidenceObligations: ['per-layer artifact', 'each layer under frozen protocol fingerprint'],
  },
};

const PRINCIPLE_BY_NO = new Map<number, TrizPrinciple>(TRIZ_PRINCIPLES.map((p) => [p.no, p]));

/** 取一个原理的类型化变换类（40 原理整表；未知编号 → undefined）。 */
export function typedClass(no: number): TypedClass | undefined {
  return TRIZ_TYPED_CLASSES[no];
}

/** 取一个原理的完整变换契约：精选子集给详细契约，其余给 generic 占位（含整表 class）。 */
export function typedContract(no: number): TypedTransformationDetail | undefined {
  const cls = TRIZ_TYPED_CLASSES[no];
  if (!cls) return undefined;
  const p = PRINCIPLE_BY_NO.get(no);
  const name = p?.name ?? `Principle ${no}`;
  const curated = CURATED_DETAILS[no];
  if (curated) {
    return { principleNo: no, principleName: name, opType: cls.opType, ...curated, level: 'curated' };
  }
  return {
    principleNo: no,
    principleName: name,
    opType: cls.opType,
    inputType: 'parent artifact under frozen contract',
    outputType: 'candidate artifact conforming to typed operator',
    admissibleArgs: ['declared-in-strategy-plan'],
    prohibitedChanges: ['any change outside declared operator semantics', 'any change to frozen protocol fields'],
    evidenceObligations: ['strategy-plan declaration before evaluation', 'protocol fingerprint', 'paired rerun'],
    level: 'generic',
  };
}

/** 一次取一组原理的变换契约（保持输入顺序；服务与工具共用入口）。 */
export function typedPlans(principleNos: number[]): TypedTransformationDetail[] {
  const out: TypedTransformationDetail[] = [];
  for (const no of principleNos) {
    const d = typedContract(no);
    if (d) out.push(d);
  }
  return out;
}
