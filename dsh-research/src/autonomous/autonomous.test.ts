// Autonomous research loop 自测（TODO 阶段 4 · 第 17 项）：
//   buildGoal DAG 结构 + 一键流水线端到端 + 攻击语义（ROV 只对 prefix 劫持有效、
//   path-manipulation 需要 BGPsec）+ 空输入健壮性。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGoal, runAutonomousResearch } from './index.ts';

test('buildGoal: 5 任务 DAG，t1 ready，t2~t5 blocked 且依赖正确', () => {
  const goal = buildGoal('RPKI+BGPsec 安全缺口');
  assert.equal(goal.tasks.length, 5);
  const kinds = new Set(goal.tasks.map((t) => t.kind));
  for (const k of ['read', 'hypothesis', 'experiment', 'verify', 'write']) assert.ok(kinds.has(k), `缺任务 kind ${k}`);
  const byId = new Map(goal.tasks.map((t) => [t.id, t]));
  assert.equal(byId.get('t1').status, 'ready');
  for (const id of ['t2', 't3', 't4', 't5']) assert.equal(byId.get(id).status, 'blocked');
  assert.deepEqual(byId.get('t2').consumesClaims, ['c-lit']);
  for (const id of ['t3', 't4', 't5']) assert.deepEqual(byId.get(id).consumesClaims, ['c-h']);
  // 未给假设时自动生成，且引用 topic
  assert.ok(goal.hypothesis.includes('RPKI+BGPsec 安全缺口'));
  assert.ok(goal.claims.length === 0);
});

test('runAutonomousResearch: 一键流水线端到端（hijack → ROV verified）', () => {
  const report = runAutonomousResearch({
    topic: 'RPKI+BGPsec 安全缺口',
    hypothesis: 'ROV 能显著提升 prefix 劫持的检测率',
    repetitions: 3,
    validator: 'rov',
    supportThreshold: 0.6,
    seed: 1,
  });
  // 战役：route-hijack + ROV → 检测率 ~0.79 → verified
  assert.equal(report.campaign?.plan.scenario, 'route-hijack');
  assert.equal(report.campaign.verdict, 'verified');
  assert.equal(report.campaign.outcome, 'support');
  assert.ok(report.campaign.detection.mean >= 0.6);

  // 论文：6 章节 + 摘要 + 附录齐备
  for (const heading of ['## 摘要', '## 1. 背景与研究问题', '## 2. 文献与现有工作', '## 3. 方法与假设', '## 4. 实验与结果', '## 5. 结论与判定', '## 6. 局限与后续', '## 附录 A · 证据追溯']) {
    assert.ok(report.paper.includes(heading), `论文缺章节 ${heading}`);
  }
  assert.ok(report.paper.includes(report.topic));

  // 幻灯片：≥8 页 Marp
  assert.ok(report.slides.split(/\n---\n/).length >= 8);

  // 判定与归档
  assert.ok(Object.keys(report.claimVerdicts).length > 0);
  assert.ok(Object.values(report.claimVerdicts).includes('verified'));
  assert.ok(report.artifacts.length > 0);
  assert.ok(report.summary.includes('已核验'));
  assert.ok(report.episodes > 0);
});

test('runAutonomousResearch: 攻击语义 —— ROV 对 path-manipulation 无法验证（rejected）', () => {
  // BGPsec 场景 → infer 为 path-manipulation，ROV 检测率低 → 正确判 rejected
  const report = runAutonomousResearch({
    topic: 'BGPsec 路径完整性',
    hypothesis: 'ROV 能验证 AS 路径完整性（BGPsec 场景）',
    repetitions: 3,
    validator: 'rov',
    supportThreshold: 0.6,
    seed: 1,
  });
  assert.equal(report.campaign?.plan.scenario, 'bgpsec-path-verify');
  assert.equal(report.campaign.verdict, 'rejected');
  assert.ok(report.paper.includes('## 5. 结论与判定'));
});

test('runAutonomousResearch: 空假设/空 topic 也能出骨架（不抛错）', () => {
  // 未给假设 → 自动生成
  const a = runAutonomousResearch({ topic: '通用课题' });
  assert.ok(a.paper.includes('## 1. 背景与研究问题'));
  assert.equal(a.campaign?.plan.env, 'sim');
  // 空 topic + 显式假设 → 仍产出报告
  const b = runAutonomousResearch({ topic: '', hypothesis: 'H' });
  assert.ok(b.summary.length > 0);
  assert.ok(b.paper.length > 0);
  assert.ok(b.slides.length > 0);
});
