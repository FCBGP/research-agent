// src/self-improve/self-improve.test.ts — 阶段 4b · 第 20 项 自测。
// 覆盖契约：
//   - 冷启动：snapshot.episodes === 0，summary 仍含「改进建议」，推荐冷启动动作
//   - 有记忆后：episodes/artifacts/evidence/jobs/scheduled 计数正确
//   - 未核验证据 → 高优建议核验
//   - 无问题 → 低优「健康节奏」建议兜底
//   - 反思会归档一条 episodic（可在下次 reflect 前观察到）
// 纯内存 createMemory()，Node 24 直接跑：node --test src/self-improve/self-improve.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMemory } from '../memory/index.ts';
import { SelfImprover } from './index.ts';

test('self-improve: 冷启动 → episodes=0 且 summary 含「改进建议」', () => {
  const memory = createMemory();
  const report = new SelfImprover(memory).reflect();
  assert.equal(report.snapshot.episodes, 0);
  assert.equal(report.snapshot.artifacts, 0);
  assert.ok(report.summary.includes('改进建议'), 'summary 必须含「改进建议」');
  assert.ok(report.recommendations[0]?.action.includes('冷启动'), '冷启动给出手把手指引');
  assert.ok(report.snapshot.jobs === 0 && report.snapshot.scheduled === 0);
  // 反思留痕 → 归档后 episodes 变为 1
  assert.equal(memory.episodic.all().length, 1, '反思自身归档一条 episodic');
});

test('self-improve: 有记忆后计数正确 + 未核验证据触发高优建议', () => {
  const memory = createMemory();
  memory.episodic.record({ kind: 'verify', summary: 'ROV 提升劫持检测率 verified', outcome: 'verified', meta: { jobId: 'job-1' } });
  memory.episodic.record({ kind: 'decision', summary: '实验决策', meta: { scheduleId: 's1' } });
  memory.artifact.put({ kind: 'report', title: 'paper draft', body: '...' });
  memory.hypothesis.propose('BGPsec 可防御 path-manipulation', 'c-1');
  memory.evidence.add('c-1', { source: 'RFC-8205', evidence: 'BGPsec path 抗篡改', confidence: 0.9, verified: false });

  const report = new SelfImprover(memory).reflect();
  assert.equal(report.snapshot.episodes, 2);
  assert.equal(report.snapshot.artifacts, 1);
  assert.equal(report.snapshot.hypotheses, 1);
  assert.equal(report.snapshot.evidence, 1);
  assert.equal(report.snapshot.unverified, 1);
  assert.equal(report.snapshot.jobs, 1);
  assert.equal(report.snapshot.scheduled, 1);
  assert.ok(report.summary.includes('改进建议'));
  const high = report.recommendations.find((r) => r.priority === 'high');
  assert.ok(high?.action.includes('核验'), '未核验证据 → 高优核验建议');
  // 观察分桶
  assert.ok(report.observations.some((o) => o.kind === 'episodic:verify' && o.count === 1));
});

test('self-improve: 无问题 → 低优「健康节奏」兜底', () => {
  const memory = createMemory();
  memory.episodic.record({ kind: 'experiment', summary: '一场战役', meta: {} });
  memory.episodic.record({ kind: 'decision', summary: 'claim 决策' });
  memory.artifact.put({ kind: 'result', title: 'campaign result', body: 'ok' });
  memory.evidence.add('c-2', { source: 'sim', evidence: 'det=0.79', confidence: 0.8, verified: true });
  const report = new SelfImprover(memory).reflect();
  assert.ok(report.summary.includes('改进建议'));
  assert.equal(report.snapshot.unverified, 0);
  assert.ok(report.recommendations.some((r) => r.priority === 'low' && r.action.includes('健康节奏')));
});
