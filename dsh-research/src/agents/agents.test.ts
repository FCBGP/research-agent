// 三个角色 agent 的自检（纯内存，不依赖 dsh / LLM）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAgents } from './index.ts';
import { SEED_CORPUS } from './corpus.ts';
import { LocalCorpusSource } from './literature.ts';
import { ReviewerAgent, REVIEW_STEPS } from './reviewer.ts';
import { ExperimentAgent, StubExecutor } from './experiment.ts';
import { createMemory } from '../memory/index.ts';

test('literature: 本地语料按相关度召回', () => {
  const memory = createMemory();
  const ag = createAgents({ memory });
  const hits = ag.literature.search('RPKI origin validation', 3);
  assert.ok(hits.length > 0, 'should hit RPKI-related papers');
  assert.ok(hits[0].score >= hits[hits.length - 1].score, 'sorted desc');
  assert.ok(SEED_CORPUS.length >= 8);
  assert.equal(memory.episodic.ofKind('search').length, 1, 'search recorded to episodic memory');
});

test('literature: 可注入外部 source', () => {
  const src = new LocalCorpusSource([SEED_CORPUS[0]]);
  const ag = createAgents({ source: src });
  assert.equal(ag.literature.search('bgp path signature').length >= 1, true);
});

test('reviewer: 8 步完整 + 判定阈值', () => {
  const rev = new ReviewerAgent();
  const paper = SEED_CORPUS[0];
  const report = rev.review({
    paper,
    steps: [
      { step: 1, score: 0.9, strengths: ['问题清晰'] },
      { step: 2, score: 0.85, strengths: ['贡献新颖'] },
      { step: 3, score: 0.6, concerns: ['需更多细节'] },
      { step: 4, score: 0.5, concerns: ['缺基线'] },
      { step: 5, score: 0.55, concerns: ['代码未公开'] },
      { step: 6, score: 0.4, concerns: ['统计不充分'] },
      { step: 7, score: 0.8 },
      { step: 8, score: 0.75 },
    ],
  });
  assert.equal(report.steps.length, 8);
  assert.equal(report.steps[0].label, 'Problem & Motivation');
  assert.ok(Math.abs(report.overallScore - 0.66875) < 0.01);
  assert.equal(report.verdict, 'major-revision');
  assert.equal(report.checklist.filter((c) => c.ok).length, 4);
  assert.deepEqual(REVIEW_STEPS.map((s) => s.step), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('reviewer: 缺步自动补 0 分且不破判定', () => {
  const rev = new ReviewerAgent();
  const report = rev.review({ paper: SEED_CORPUS[1], steps: [{ step: 1, score: 0.9 }] });
  assert.equal(report.steps.length, 8);
  assert.equal(report.steps[7].score, 0);
  assert.equal(report.checklist[7].ok, false);
});

test('experiment: plan → run(sim) → analyze', async () => {
  const ag = new ExperimentAgent(new StubExecutor());
  const plan = ag.plan({ claimId: 'c-1', claimStatement: 'BGP 劫持检测率测试' , env: 'frr', repetitions: 3 });
  assert.equal(plan.env, 'frr');
  assert.ok(plan.metrics.includes('detection_rate'));
  assert.ok(plan.steps.length >= 4);

  const results = [];
  for (let i = 0; i < plan.repetitions; i += 1) {
    const r = await ag.run(plan);
    results.push({ ...r, data: { detection_rate: 0.9 + i * 0.05, convergence_time: 1.0 } });
  }
  const stats = ag.analyze(results, 'detection_rate');
  assert.equal(stats.n, 3);
  assert.equal(stats.primary, 0.93);
  assert.ok(stats.metrics.detection_rate_stddev > 0);
  assert.equal(results[0].experiment, plan.configFingerprint);
});

test('experiment: sim 结果显式标记 simulated', () => {
  const ag = new ExperimentAgent(new StubExecutor());
  const plan = ag.plan({ claimId: 'c-1', claimStatement: 'as_set injection', env: 'sim' });
  const r = ag.run(plan);
  assert.equal(r.data.simulated, true);
  assert.equal(r.outcome, 'inconclusive');
});
