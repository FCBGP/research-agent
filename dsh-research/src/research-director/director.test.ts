// ResearchDirector + 三条循环的端到端自检（纯内存，stub executor）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemory } from '../memory/index.ts';
import { createAgents } from '../agents/index.ts';
import { createResearchLoop } from '../research-loop/loop.ts';
import { runVerificationLoop } from '../verification-loop/verification-loop.ts';
import { runExperimentLoop } from '../experiment-loop/experiment-loop.ts';
import type { ResearchGoal, ResearchTask } from '../core/types.ts';

function bgpGoal(): ResearchGoal {
  const tasks: ResearchTask[] = [
    { id: 't1', goal: 'g-bgp', title: 'RPKI origin validation 文献', kind: 'read', produceClaims: ['c-1'], consumesClaims: [], gain: 0.6, status: 'ready' },
    { id: 't2', goal: 'g-bgp', title: 'BGP 劫持检测实验', kind: 'experiment', produceClaims: ['c-2'], consumesClaims: ['c-1'], gain: 0.8, status: 'blocked' },
    { id: 't3', goal: 'g-bgp', title: '验证检测机制 claim', kind: 'verify', produceClaims: [], consumesClaims: ['c-2'], gain: 0.4, status: 'blocked' },
    { id: 't4', goal: 'g-bgp', title: '输出报告', kind: 'write', produceClaims: [], consumesClaims: ['c-2'], gain: 0.2, status: 'blocked' },
  ];
  return { id: 'g-bgp', hypothesis: 'ROV 可显著提升劫持检测', tasks, claims: [], experiments: [], results: [], verification: [], counterexamples: [], status: 'active' };
}

test('director: 全任务 DAG 依次解锁并产出 verdict + 归档', () => {
  const memory = createMemory();
  const agents = createAgents({ memory });
  const loop = createResearchLoop(memory, agents);
  const goal = bgpGoal();

  const report = loop.run(goal, { withExperiment: true });
  assert.equal(report.iterations, 4, '4 个任务应全部执行');
  assert.equal(report.claims.size >= 1, true);
  assert.equal(memory.episodic.ofKind('experiment').length, 1);
  assert.equal(goal.tasks.every((t) => t.status === 'done'), true, '全部终态 done');
  assert.equal(report.episodes.length >= 4, true);

  // 验证扫描 + 实验循环可独立复用
  const bois = runVerificationLoop(memory, goal.claims);
  assert.ok(bois.length >= 1);
  const eos = runExperimentLoop(memory, agents.experiment, goal.claims, { repetitions: 2 });
  assert.ok(eos.length >= 1 && eos[0].result.claim === eos[0].plan.claimId);
  assert.equal(memory.episodic.ofKind('experiment').length >= 2, true);
});

test('director: 依赖未满足时保持 blocked，不会有进度', () => {
  const memory = createMemory();
  const agents = createAgents({ memory });
  const loop = createResearchLoop(memory, agents);
  const goal = bgpGoal();
  goal.tasks[1].consumesClaims = ['c-999']; // 永远不满足的依赖
  const report = loop.run(goal, { withExperiment: true });
  assert.equal(report.iterations, 1, '只有 t1 可执行');
  assert.equal(goal.tasks[1].status, 'blocked');
});
