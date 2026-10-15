// src/triza/triza.test.ts — 阶段 9 · TRIZa 闭环自测。
// 覆盖：冻结契约指纹确定性/变更 → 新指纹；FI 公式（位估计 + 保守界）；FI/Ideality；
//       typed 变换契约（40 整表 + 精选子集）；晋升决策（硬门否决 / 阈值不达负证据 /
//       认证不足 revise / 全过 promote）；控制器审计 balanced vs safety-first；追溯包。
// 只依赖本包源码与 node:test，Node 24 直接跑：node --test src/triza/triza.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { freezeContract, fingerprintContract, canonicalSerialize, sameFingerprint } from './contract.ts';
import { functionalInformation, bitsFromCount, wilsonProportionBound } from './functional-information.ts';
import { typedPlans, typedContract, TRIZ_TYPED_CLASSES } from './typed.ts';
import { decidePromotion, collectGates, evidenceLabel, EVIDENCE_LEVELS } from './promotion.ts';
import { createTraceBundle } from './trace.ts';
import { auditController, auditPolicies } from './audit.ts';
import { createTrizaService } from './index.ts';

/** 便捷：构造一份契约 + 指纹。 */
function makeContract(over: Record<string, unknown> = {}) {
  return freezeContract({
    problem: 'ROV 提升劫持检测率但跨长收敛',
    improving: '检测',
    worsening: '收敛',
    relativeGainPct: over.relativeGainPct ?? 3.0,
    seeds: [42],
    primaryMetric: 'detection_rate',
    ...over,
  });
}

test('contract: 冻结契约指纹确定且稳定，改任一绑定字段 → 新指纹', () => {
  const a = makeContract();
  const b = makeContract();
  assert.equal(a.fingerprint, b.fingerprint, '同输入 → 同指纹');
  assert.equal(a.fingerprint.length, 64, 'SHA-256 hex 长度');
  assert.equal(sameFingerprint(a.contract, b.contract), true);

  const c = makeContract({ relativeGainPct: 5.0 });
  assert.notEqual(c.fingerprint, a.fingerprint, '改晋升阈值 → 新指纹');
  const d = makeContract({ seeds: [7] });
  assert.notEqual(d.fingerprint, a.fingerprint, '改种子 → 新指纹');
});

test('contract: canonicalSerialize 稳定排序（对象按 key 字典序、数组保序）', () => {
  assert.equal(canonicalSerialize({ b: 1, a: 2 }), canonicalSerialize({ a: 2, b: 1 }));
  assert.equal(canonicalSerialize([1, 2]), '[1,2]');
  assert.notEqual(canonicalSerialize([1, 2]), canonicalSerialize([2, 1]));
});

test('fi: 公式(2)(3) 位估计与保守界（手工可验的参考总体）', () => {
  // useful: 参考 [0.9,0.8,0.7,0.6]，候选 0.85 → k=1 (0.9>=0.85)，N=4
  // IU = -log2((1+1)/(1+4)) = -log2(0.4) ≈ 1.3219
  const fi = functionalInformation({ useful: 0.85, referenceUseful: [0.9, 0.8, 0.7, 0.6], harmful: 0.03, referenceHarmful: [0.02, 0.04, 0.05], cost: 0, lambdaC: 0 });
  assert.ok(Math.abs(fi.usefulFI - 1.322) < 0.01, `usefulFI=${fi.usefulFI}`);
  // harmful: 候选 0.03，参考 [0.02,0.04,0.05] → k=2（0.04,0.05>=0.03）
  // IH = -log2(3/4) = 0.4150
  assert.ok(Math.abs(fi.harmfulFI - 0.415) < 0.01, `harmfulFI=${fi.harmfulFI}`);
  // conservative: useful 用比例上界（IU^LB 更小），harmful 用比例下界（IH^UB 更大）
  assert.ok(fi.usefulFI_LB <= fi.usefulFI + 1e-6, 'useful 保守界 ≤ 点估计');
  assert.ok(fi.harmfulFI_UB >= fi.harmfulFI - 1e-6, 'harmful 保守界 ≥ 点估计');
  // 无参考 → 退化为 0（不炸）
  const empty = functionalInformation({ useful: 0.5, referenceUseful: [], harmful: 0.1, referenceHarmful: [] });
  assert.equal(empty.n, 0);
  assert.equal(empty.usefulFI, 0);
});

test('fi: bitsFromCount 与 wilson 界（公式核对）', () => {
  assert.ok(Math.abs(bitsFromCount(1, 4) - 1.3219) < 0.01);
  // k=0, N=4：-log2(1/5)=2.3219
  assert.ok(Math.abs(bitsFromCount(0, 4) - 2.3219) < 0.01);
  const ub = wilsonProportionBound(0, 4, 'upper');
  assert.ok(ub > 0 && ub < 1, `upper bound=${ub}`);
  const lb = wilsonProportionBound(4, 4, 'lower');
  assert.ok(lb > 0.5 && lb <= 1, `lower bound=${lb}`);
});

test('typed: 40 原理整表 transform class + 精选子集详细契约（Table 1/4 对口）', () => {
  assert.equal(Object.keys(TRIZ_TYPED_CLASSES).length, 40, '40 原理整表');
  const seg = typedContract(1);
  assert.ok(seg && seg.level === 'curated', 'Segmentation 精选详细契约');
  assert.equal(seg.opType, 'segmentation');
  assert.ok(Array.isArray(seg.prohibitedChanges) && seg.prohibitedChanges.length > 0, '禁止变更非空');
  const param = typedContract(35);
  assert.ok(param && param.level === 'curated' && param.opType === 'parameter_change');
  const generic = typedContract(19); // periodic_action 未进精选子集 → generic 占位
  assert.ok(generic && generic.level === 'generic' && generic.opType === 'periodic_action');
  assert.equal(typedContract(999), undefined, '未知编号 → undefined');
  const plans = typedPlans([1, 35, 23]);
  assert.equal(plans.length, 3);
  assert.deepEqual(plans.map((p) => p.principleNo), [1, 35, 23]);
});

test('promotion: 硬门任一不过 → 不晋升（FI 无法覆盖 Gl(s)=0），高风险 escalate', () => {
  const { contract, fingerprint } = makeContract({ relativeGainPct: 2.0 });
  const d = decidePromotion({
    contract, contractFingerprint: fingerprint, candidateId: 'c1',
    principleNos: [10, 23],
    gates: { integrity: true, safety: false, reproducibility: true, resource: true },
    evidenceLevel: 1, certifiedLevel: 1,
    metrics: { detection_rate: 0.99, false_positive_rate: 0.01 },
    baselineMetrics: { detection_rate: 0.9 },
    reference: { useful: [0.92, 0.9, 0.88], harmful: [0.02, 0.03] },
  });
  assert.equal(d.admissible, false, '硬门不过 → 不可晋升');
  assert.equal(d.promotion, 'reject');
  assert.ok(d.gateFailures.some((g) => g.id === 'safety'));
  assert.equal(d.negativeEvidenceRetained, true, '负证据保留');
  assert.ok(d.reason.includes('硬门未过'));

  const esc = decidePromotion({
    contract, contractFingerprint: fingerprint, candidateId: 'c2',
    principleNos: [10], gates: { integrity: true, safety: false },
    evidenceLevel: 1, certifiedLevel: 1,
    metrics: { detection_rate: 0.99, false_positive_rate: 0.01 },
    baselineMetrics: { detection_rate: 0.9 },
    reference: { useful: [0.92], harmful: [0.02] },
    requiresAuthorization: true,
  });
  assert.equal(esc.promotion, 'escalate', '高风险 + 硬门不过 → escalate');
});

test('promotion: 指标提升但未过冻结阈值 → reject 且保留完整证据（CICIoT 形式化 V2 语义）', () => {
  const { contract, fingerprint } = makeContract({ relativeGainPct: 3.2277 });
  const d = decidePromotion({
    contract, contractFingerprint: fingerprint, candidateId: 'v2',
    principleNos: [3, 35],
    gates: { integrity: true, safety: true, reproducibility: true, resource: true },
    evidenceLevel: 3, certifiedLevel: 3,
    metrics: { detection_rate: 0.8483, false_positive_rate: 0.0017 },
    baselineMetrics: { detection_rate: 0.8325 },
    reference: { useful: [0.85, 0.84, 0.83], harmful: [0.002, 0.003] },
  });
  // 相对增益 = (0.8483-0.8325)/0.8325*100 = 1.898% < 3.2277%
  assert.ok(d.relativeGainPct < 3.0, `gain=${d.relativeGainPct}`);
  assert.equal(d.admissible, true, '硬门过 → 可评估');
  assert.equal(d.promotion, 'reject', '阈值不达 → 不晋升');
  assert.equal(d.negativeEvidenceRetained, true, '完整负证据保留');
  assert.ok(d.reason.includes('冻结晋升阈值'));
});

test('promotion: 认证等级不足 → revise；全过 → promote', () => {
  const { contract, fingerprint } = makeContract({ relativeGainPct: 2.0 });
  const revise = decidePromotion({
    contract, contractFingerprint: fingerprint, candidateId: 'c3',
    principleNos: [1],
    gates: { integrity: true, safety: true, reproducibility: true, resource: true },
    evidenceLevel: 3, certifiedLevel: 1,
    metrics: { detection_rate: 0.95, false_positive_rate: 0.01 },
    baselineMetrics: { detection_rate: 0.9 },
    reference: { useful: [0.92], harmful: [0.02] },
  });
  assert.equal(revise.promotion, 'revise', '认证 L1 < 施加 L3 → revise（先补证据）');

  const promote = decidePromotion({
    contract, contractFingerprint: fingerprint, candidateId: 'c4',
    principleNos: [10, 23],
    gates: { integrity: true, safety: true, reproducibility: true, resource: true },
    evidenceLevel: 2, certifiedLevel: 2,
    metrics: { detection_rate: 0.95, false_positive_rate: 0.01 },
    baselineMetrics: { detection_rate: 0.9 },
    reference: { useful: [0.92, 0.9, 0.88], harmful: [0.02, 0.03] },
  });
  assert.equal(promote.promotion, 'promote', '全过 → 晋升为现任');
  assert.equal(promote.negativeEvidenceRetained, false);
});

test('promotion: 次级硬门槛不过 → reject（FPR 上限）', () => {
  const { contract, fingerprint } = makeContract({ relativeGainPct: 2.0, secondaryGates: [{ metric: 'false_positive_rate', operator: 'lte', threshold: 0.005 }] });
  const d = decidePromotion({
    contract, contractFingerprint: fingerprint, candidateId: 'c5',
    principleNos: [35],
    gates: { integrity: true, safety: true, reproducibility: true, resource: true },
    evidenceLevel: 1, certifiedLevel: 1,
    metrics: { detection_rate: 0.95, false_positive_rate: 0.02 },
    baselineMetrics: { detection_rate: 0.9 },
    reference: { useful: [0.92], harmful: [0.02] },
  });
  assert.equal(d.promotion, 'reject');
  assert.ok(d.secondaryGateFailures.some((s) => s.includes('false_positive_rate')), `failures=${d.secondaryGateFailures}`);
});

test('audit: balanced vs safety-first（Campaign08 语义：聚合不打平、不给 p 值）', () => {
  // 4 条：2 条应晋升（benign with moderate harm）、2 条应拒绝（高 harmful）
  const rows = [
    { id: 'a', expected: 'promote' as const, controller: 'promote' as const, useful: 0.95, harmful: 0.01 },
    { id: 'b', expected: 'promote' as const, controller: 'promote' as const, useful: 0.9, harmful: 0.015 },
    { id: 'c', expected: 'reject' as const, controller: 'reject' as const, useful: 0.6, harmful: 0.05 },
    { id: 'd', expected: 'reject' as const, controller: 'promote' as const, useful: 0.99, harmful: 0.08 }, // false promotion
  ];
  const balanced = auditController(rows, { safetyVeto: false });
  assert.equal(balanced.n, 4);
  assert.equal(balanced.truePositive, 2);
  assert.equal(balanced.falsePositive, 1);
  assert.equal(balanced.falseNegative, 0);
  assert.equal(balanced.trueNegative, 1);
  assert.ok(balanced.promotionF1 > 0);
  assert.equal(balanced.specificity, 0.5, "specificity = TN/(TN+FP) = 1/2");
  assert.ok(balanced.promotionF1, "promotion F1 描述性聚合");

  // safety-first：harmful>=0.02 全局否决 → d(0.08) 与 b? b=0.015<0.02 通过；c=0.05 否决（本就 reject）；
  // 但 d 被否决 → 不再 false promotion → FP=0；recall 仍 2/2=1.0（因 a/b 都 promote）
  // 再造一个「有用但 harmful 越界、本应 promote 却被 safety 否决」→ recall 下降
  const rows2 = [
    { id: 'a', expected: 'promote' as const, controller: 'promote' as const, useful: 0.95, harmful: 0.01 },
    { id: 'b', expected: 'promote' as const, controller: 'promote' as const, useful: 0.9, harmful: 0.08 }, // 应晋升但 harmful 高
  ];
  const balanced2 = auditController(rows2, { safetyVeto: false });
  const safety = auditController(rows2, { safetyVeto: true, vetoHarmThreshold: 0.02 });
  assert.equal(balanced2.truePositive, 2);
  assert.equal(safety.truePositive, 1, 'safety-first 全局否决 → 召回下降');
  assert.ok(safety.recall < balanced2.recall, 'safety-first recall < balanced recall');
  assert.ok(safety.specificity >= balanced2.specificity);

  const both = auditPolicies(rows2, { vetoHarmThreshold: 0.02 });
  assert.ok(both.balanced.recall > both.safetyFirst.recall);
  assert.ok((both as unknown as { balanced: { note: string } }).balanced.note.includes('not independent'));
});

test('trace: 追溯包（triz_context / strategy_plan / scores.jsonl / sha256sums）', () => {
  const { contract, fingerprint } = makeContract();
  const plans = typedPlans([1, 35]);
  const decision = decidePromotion({
    contract, contractFingerprint: fingerprint, candidateId: 'p1',
    principleNos: [1, 35],
    gates: { integrity: true, safety: true, reproducibility: true, resource: true },
    evidenceLevel: 1, certifiedLevel: 1,
    metrics: { detection_rate: 0.97, false_positive_rate: 0.01 },
    baselineMetrics: { detection_rate: 0.9 },
    reference: { useful: [0.92, 0.9], harmful: [0.02, 0.03] },
  });
  const trace = createTraceBundle({
    contract, fingerprint, principles: plans.map((p) => ({ no: p.principleNo, name: p.principleName })),
    plans, decision, candidateId: 'p1', seeds: [42], sources: ['curated-matrix'],
  });
  assert.equal(trace.trizContext.claimId, contract.claimId);
  assert.equal(trace.trizContext.protocolFingerprint, fingerprint);
  assert.ok(trace.strategyPlan.declaredTransformations.length === 2);
  assert.ok(trace.scoresJsonl.includes('protocolFingerprint'));
  assert.ok(trace.scoresJsonl.endsWith('\n'), 'append-only jsonl 每行换行');
  const sums = trace.sha256sums;
  assert.equal(Object.keys(sums).length, 3);
  assert.equal(sums['triz_context.json'].length, 64);
  assert.ok(trace.strategyPlan.fingerprint === fingerprint);
});

test('service: researchTriza.evaluate —— 完整闭环：契约 → 推导原理 → typed 变换 → FI → 硬门 → 决策 → 追溯', () => {
  const svc = createTrizaService();
  const report = svc.evaluate({
    problem: 'ROV 提升劫持检测率但跨长收敛',
    improving: '检测',
    worsening: '收敛',
    claimId: 't-eval-1',
    candidateId: 'cand-a',
    parentId: 'parent-0',
    metrics: { detection_rate: 0.97, false_positive_rate: 0.012 },
    baselineMetrics: { detection_rate: 0.9 },
    referenceUseful: [0.92, 0.9, 0.88, 0.86],
    referenceHarmful: [0.02, 0.03, 0.04],
    gates: { integrity: true, safety: true, reproducibility: true, resource: true },
    evidenceLevel: 2,
    certifiedLevel: 2,
    relativeGainPct: 2.0,
  });
  assert.equal(report.fingerprint.length, 64);
  // metrics 有主指标 improve=detection → 矛盾解析出候选原理（精选矩阵: reliability↔time 等）
  assert.ok(report.typedPlans.length >= 1, '自动推导原理 → typed 变换契约');
  assert.equal(report.decision.promotion, 'promote');
  assert.ok(report.decision.fi.usefulFI > 0, 'FI 有意义');
  assert.equal(report.trace.trizContext.protocolFingerprint, report.fingerprint);
  assert.ok(report.artifactSummary.includes('decision=promote'));
  assert.ok(report.artifactSummary.includes('#') && report.artifactSummary.includes('preliminary_action'), '含变换映射');

  // 显式给出原理时优先
  const report2 = svc.evaluate({
    problem: 'ROV 提升劫持检测率但跨长收敛',
    improving: '检测', worsening: '收敛',
    candidateId: 'cand-b', principleNos: [10, 23],
    metrics: { detection_rate: 0.9, false_positive_rate: 0.02 },
    baselineMetrics: { detection_rate: 0.9 },
    referenceUseful: [0.9, 0.89], referenceHarmful: [0.02, 0.03],
    relativeGainPct: 2.0,
  });
  assert.deepEqual(report2.typedPlans.map((p) => p.principleNo), [10, 23]);
  // 增益 0% < 2% → reject（负证据）
  assert.equal(report2.decision.promotion, 'reject');
});

test('service: researchTriza.audit —— 两种策略对比（Figure 2B 语义）', () => {
  const svc = createTrizaService();
  const rows = [
    { id: 'a', expected: 'promote' as const, controller: 'promote' as const, useful: 0.95, harmful: 0.01 },
    { id: 'b', expected: 'promote' as const, controller: 'promote' as const, useful: 0.9, harmful: 0.09 },
    { id: 'c', expected: 'reject' as const, controller: 'reject' as const, useful: 0.6, harmful: 0.05 },
  ];
  const out = svc.audit(rows, { vetoHarmThreshold: 0.02 });
  assert.ok(out.balanced.recall > out.safetyFirst.recall, 'balanced 召回更高');
  assert.ok(out.safetyFirst.specificity >= out.balanced.specificity);
  assert.equal(out.balanced.n, 3);
  assert.equal(evidenceLabel(0), 'static');
  assert.equal(EVIDENCE_LEVELS.length, 4);
});

test('promotion: collectGates —— 四类硬门 + 自定义合并且如实标注失败', () => {
  const gates = collectGates({ integrity: true, safety: false, extra: [{ id: 'golden-set', desc: 'golden set 一致', pass: true }] });
  assert.equal(gates.length, 5);
  assert.ok(gates.find((g) => g.id === 'safety' && !g.pass));
});
