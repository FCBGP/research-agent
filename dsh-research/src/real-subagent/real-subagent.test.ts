// RealSubagent 自测：本地回退 / 真实 seam 回合 / 模型路由覆盖 / requireReal / prompt 组包。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RealSubagentAgent } from './index.ts';
import { ScriptedSubagentSeam } from './seam.ts';
import { buildRolePrompt, rolePersona } from './persona.ts';
import { runLocal } from './local.ts';
import { createMemory, type ResearchMemory } from '../memory/index.ts';
import { createAgents } from '../agents/index.ts';
import { ModelRouter } from '../model-router/index.ts';
import { PolicyService } from '../policy/index.ts';

function mem(): ResearchMemory {
  return createMemory();
}

test('real-subagent: 无 seam → 本地回退，delegator=local/ok=false，情景记忆可追溯', async () => {
  const memory = mem();
  const service = new RealSubagentAgent({ memory, agents: createAgents({ memory }) });
  const st = service.runtimeStatus();
  assert.equal(st.available, false);
  assert.equal(st.realSubagent, false);

  const r = await service.run({ role: 'literature', task: 'RPKI origin validation 的安全边界' });
  assert.equal(r.delegator, 'local');
  assert.equal(r.ok, false);
  assert.ok(r.output.includes('RPKI origin validation'), `output 含任务: ${r.output}`);
  assert.ok(r.output.includes('本地回退'));
  assert.ok((r.error ?? '').includes('local fallback'));
  assert.equal(r.provider, 'local-interval-dsv4');
  assert.equal(r.model, 'dsv4flash');
  // 情景记忆写入 local 回退事件
  assert.ok(memory.episodic.recent(1)[0].summary.includes('本地回退'));
  assert.equal(memory.episodic.recent(1)[0].meta?.delegator, 'local');
});

test('real-subagent: ScriptedSeam → real-subagent 回合，persona/纪律进 prompt，agentOptions 带路由', async () => {
  const seam = new ScriptedSubagentSeam('子 agent 的审稿结论');
  const service = new RealSubagentAgent({
    memory: mem(),
    policy: new PolicyService(),
    seam,
  });
  const r = await service.run({ role: 'reviewer', task: '审稿：验证 RPKI 缺口', context: '上一环节：文献 9 篇' });
  assert.equal(r.delegator, 'real-subagent');
  assert.equal(r.ok, true);
  assert.equal(r.output, '子 agent 的审稿结论');
  assert.ok(r.sessionId?.startsWith('scripted-'), `sessionId: ${r.sessionId}`);
  assert.equal(seam.count(), 1);

  const call = seam.lastCall()!;
  assert.equal(call.label, 'research lead: 审稿');
  assert.ok(call.prompt.includes('审稿'), 'prompt 含角色人格标签');
  assert.ok(call.prompt.includes('Research Agent Policy'), 'prompt 含研究纪律（policy 默认开启）');
  assert.ok(call.prompt.includes('上一环节：文献 9 篇'), 'prompt 含上下文');
  assert.ok(call.prompt.includes('审稿：验证 RPKI 缺口'), 'prompt 含任务');
  assert.deepEqual(call.agentOptions, { provider: 'local-interval-dsv4', model: 'dsv4flash' });
});

test('real-subagent: input.model 单次覆盖路由；setRole 持久覆盖', async () => {
  const router = new ModelRouter();
  const seam = new ScriptedSubagentSeam('ok');
  const service = new RealSubagentAgent({ seam, model: router });

  await service.run({ role: 'writer', task: '写论文', model: { provider: 'deepseek-official', model: 'dsv4' } });
  assert.deepEqual(seam.lastCall()!.agentOptions, { provider: 'deepseek-official', model: 'dsv4' });

  router.setRole('experimenter', { provider: 'deepseek-official', model: 'dsv4long' });
  await service.run({ role: 'experimenter', task: '跑实验' });
  assert.deepEqual(seam.lastCall()!.agentOptions, { provider: 'deepseek-official', model: 'dsv4long' });
  assert.equal(router.route('experimenter').model, 'dsv4long');
});

test('real-subagent: requireReal + seam 不可用 → 直接失败（无本地回退输出）', async () => {
  const service = new RealSubagentAgent({ memory: mem() }); // 无 seam → unavailable
  const r = await service.run({ role: 'director', task: '调度', requireReal: true });
  assert.equal(r.ok, false);
  assert.equal(r.output, '', 'requireReal 失败不产出回退内容');
  assert.ok((r.error ?? '').includes('requireReal'));
  assert.equal(r.delegator, 'local', '没有真实回合，也无本地输出');
});

test('real-subagent: seam 不可用但 requireReal=false → 本地回退；seam start 抛错 → 同样回退本地', async () => {
  // 1) 无 seam → local
  const noSeam = new RealSubagentAgent({ memory: mem() });
  const r1 = await noSeam.run({ role: 'experimenter', task: '设计实验' });
  assert.equal(r1.delegator, 'local');
  assert.ok(r1.output.includes('实验'));

  // 2) seam available 但 start 抛错 → local（诚实回退）
  class ThrowingSeam extends ScriptedSubagentSeam {
    override available(): boolean { return true; }
    override start(): never { throw new Error('boom: provider 需要 parent'); }
  }
  const throwing = new RealSubagentAgent({ memory: mem(), seam: new ThrowingSeam() });
  const r2 = await throwing.run({ role: 'director', task: '规划' });
  assert.equal(r2.delegator, 'local');
  assert.ok((r2.error ?? '').includes('boom'));
  assert.ok(r2.output.includes('规划'));
});

test('real-subagent: policy.enabled=false 时 prompt 不含纪律块；persona 拼接正确', () => {
  const { prompt } = buildRolePrompt(
    { role: 'literature', task: '检索 RPKI' },
    new PolicyService({ enabled: false }),
  );
  assert.ok(prompt.includes('文献'));
  assert.ok(!prompt.includes('Research Agent Policy'), 'disabled policy 不渲染纪律');
  assert.ok(rolePersona('literature').includes('文献'), 'rolePersona 含角色标签');
});

test('real-subagent: 本地回退 literature 可统计本地语料命中数', () => {
  const agents = createAgents({ memory: createMemory() });
  const r = runLocal('literature', 'RPKI origin validation', { agents });
  assert.ok(r.output.includes('本地语料命中'), `output: ${r.output}`);
  assert.ok(r.output.includes('RPKI origin validation'));
  assert.equal(r.ok, false);
});
