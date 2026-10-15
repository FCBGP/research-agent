// src/intent/intent.test.ts — H-UNI 最小原型自测（Node 24 直接跑：node --test src/intent/intent.test.ts）。
// 覆盖：种子等价 / 空事件代价、S1 三态运行（漂移 + coherent + V3 窄口径评估）、
// splitPrefix 替换语义与部分失败的悬空 FC、revokeAll 原子全清 vs 部分失败陈旧引用、
// addRole 角色面判定变化、totalWriteSteps / isPartialFailure 步骤口径。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DispersedRepo } from './dispersed.ts';
import { UnifiedRepo } from './unified.ts';
import { S1, runScenario, evaluateV3Narrow } from './compare.ts';
import {
  totalWriteSteps,
  isPartialFailure,
  type CanonicalIntent,
} from './types.ts';

/** 两仓库快照深度等价（逐家族比对）。 */
function assertSnapEqual(a: CanonicalIntent, b: CanonicalIntent): void {
  assert.equal(a.origins.size, b.origins.size, 'origins 数量');
  for (const [k, v] of a.origins) assert.equal(b.origins.get(k), v, `origins[${k}]`);
  assert.equal(a.providers.size, b.providers.size, 'providers 数量');
  for (const [as, set] of a.providers) {
    const ob = b.providers.get(as);
    assert.ok(ob, `providers[${as}]`);
    assert.deepEqual([...set].sort(), [...ob].sort(), `providers[${as}]`);
  }
  assert.equal(a.roles.size, b.roles.size, 'roles 数量');
  for (const [as, nb] of a.roles) {
    const ob = b.roles.get(as);
    assert.ok(ob, `roles[${as}]`);
    assert.deepEqual([...nb.entries()].sort((x, y) => String(x[0]).localeCompare(String(y[0]))),
      [...ob.entries()].sort((x, y) => String(x[0]).localeCompare(String(y[0]))), `roles[${as}]`);
  }
  assert.deepEqual([...a.forwarding].sort(), [...b.forwarding].sort(), 'forwarding');
}

test('intent: 种子等价——同一归一化意图两仓库快照一致，统一种子写入 ≤ 分散', () => {
  const d = new DispersedRepo();
  d.seedFrom(S1.seed);
  const u = new UnifiedRepo();
  u.seedFrom(S1.seed);
  assertSnapEqual(d.snap(), u.snap());
  // 种子写入：分散按家族对象逐写（1 ROA + 2 ASPA + 2 Roles + 1 FC = 6）；
  // 统一按「不同 AS 对象」逐写，S1 亦为 6（≤ 保证跨场景不更差）。
  assert.equal(d.counters().writes, 6, '分散种子对象写入');
  assert.equal(u.counters().writes, 6, '统一种子对象写入');
  assert.ok(u.counters().writes <= d.counters().writes, '统一种子写入不更多');
  assert.equal(u.counters().drift, 0);
  assert.equal(d.counters().drift, 0);
});

test('intent: S1 三态运行——分散出现漂移与跨家族矛盾，统一原子恒一致', () => {
  const r = runScenario(S1);
  // 漂移：事件 1 splitPrefix (fail=1) 与事件 6 revokeAll (fail=2) 各一次部分失败。
  assert.equal(r.dispersed.counts.drift, 2, '分散 2 处部分失败 → drift=2');
  assert.equal(r.unified.counts.drift, 0, '统一单对象原子 → 恒无漂移');
  // R2（已被拆走的前缀 /24）：分散 ROA 已迁移、FC 仍引用旧前缀 → origin notFound + forwarding
  // committed 自相矛盾（coherent=false）；统一对象内原子迁移 → coherent=true。
  assert.equal(r.dispersed.verdicts[1].coherent, false, '分散 R2 跨家族自相矛盾');
  assert.equal(r.unified.verdicts[1].coherent, true, '统一 R2 面内一致');
  // R1（新前缀 /25）：统一对象内 FC 同步迁移 → 合规；分散 FC 未迁移（未承诺）→ 阻断。
  assert.equal(r.dispersed.verdicts[0].compliant, false, '分散 R1 阻断');
  assert.equal(r.unified.verdicts[0].compliant, true, '统一 R1 合规');
  // R3（上游 200 已撤销）：两态均阻断（provider notFound），对照组。
  assert.equal(r.dispersed.verdicts[2].compliant, false);
  assert.equal(r.unified.verdicts[2].compliant, false);
  // V3 窄口径：对象级代价各维统一 ≤ 分散 + 无漂移 + 审计违规不更多 → supported。
  const v = evaluateV3Narrow(r);
  assert.equal(v.supported, true, 'V3 窄口径整体支持');
  for (const [k, val] of Object.entries(v.ok)) {
    assert.equal(val, true, `V3 ok.${k}`);
  }
  // 代价比值松断言（确定性数值在报告/实测表确认）：
  assert.ok(r.ratios.eventWrites <= 1, '事件写放大不更大');
  assert.ok(r.ratios.verifyLookups < 1, '验证 lookups 更省');
  assert.ok(r.ratios.verifyOps <= 1, '验签更省或不更多');
  assert.ok(r.ratios.auditLookups <= 1, '审计 lookups 不更多');
  // 分散含失败 vs 无失败基线：事件写放大更低=部分失败少写；统一写放大为 no-fail 基线对照。
  assert.ok(r.dispersed.eventWrites < r.dispersedNoFail.eventWrites, '分散部分失败减少落库写入');
});

test('intent: splitPrefix 替换语义——旧前缀消失、新前缀就位、FC 同步迁移', () => {
  const run = (repo: DispersedRepo | UnifiedRepo): void => {
    repo.seedFrom(S1.seed);
    repo.apply({ kind: 'splitPrefix', oldPrefix: '10.0.0.0/24', newPrefix: '10.0.0.0/25' });
    const s = repo.snap();
    assert.equal(s.origins.get('10.0.0.0/24'), undefined, '旧 ROA 前缀被替换');
    assert.equal(s.origins.get('10.0.0.0/25'), 100, '新 ROA 前缀就位');
    assert.equal(s.forwarding.has('100:10.0.0.0/24'), false, 'FC 旧前缀已迁走');
    assert.equal(s.forwarding.has('100:10.0.0.0/25'), true, 'FC 新前缀同步迁移');
  };
  run(new DispersedRepo());
  run(new UnifiedRepo());

  // 分散态部分失败（failAfterWrite=1，共 2 步：ROA + FC）：ROA 迁移、FC 未迁移 → 悬空 FC。
  const d = new DispersedRepo();
  d.seedFrom(S1.seed);
  d.apply({ kind: 'splitPrefix', oldPrefix: '10.0.0.0/24', newPrefix: '10.0.0.0/25', failAfterWrite: 1 });
  assert.equal(d.counters().drift, 1, '部分失败 → 漂移窗口');
  assert.equal(d.snap().forwarding.has('100:10.0.0.0/24'), true, 'FC 仍引用旧前缀（悬空）');
});

test('intent: revokeAll——统一原子全清；分散部分失败保留陈旧跨家族引用', () => {
  const revokedSeed: CanonicalIntent = {
    origins: new Map([['192.0.2.0/24', 200]]),
    providers: new Map([[200, new Set([300])], [100, new Set([200])]]),
    roles: new Map([[200, new Map([[300, 'provider']])], [100, new Map([[200, 'provider']])]]),
    forwarding: new Set(['200:192.0.2.0/24']),
  };
  // 统一：单对象原子删除 → 该 AS 四类面全部消失（含他人对 200 的 provider 引用清理）。
  const u = new UnifiedRepo();
  u.seedFrom(revokedSeed);
  u.apply({ kind: 'revokeAll', as: 200 });
  const us = u.snap();
  assert.equal(u.counters().drift, 0);
  assert.equal(us.origins.has('192.0.2.0/24'), false, '统一：起源面已撤');
  assert.equal(us.providers.get(200), undefined, '统一：provider 面已撤');
  assert.equal(us.roles.get(200), undefined, '统一：role 面已撤');
  assert.equal(us.forwarding.size, 0, '统一：forwarding 面已撤');
  const r100u = us.roles.get(100);
  assert.ok(!r100u || !r100u.has(200), '统一：他人对 200 的 role 引用已清理');

  // 分散：部分失败（failAfterWrite=2，总 5 步）→ 只撤 aspa + 自身 roles，
  //   自身 ROA / FC 与「他人 provider 引用」陈旧残留 → 恢复期不一致，audit 捕获。
  const d = new DispersedRepo();
  d.seedFrom(revokedSeed);
  d.apply({ kind: 'revokeAll', as: 200, failAfterWrite: 2 });
  assert.equal(d.counters().drift, 1, '分散部分失败 → 漂移窗口');
  const ds = d.snap();
  assert.equal(ds.origins.has('192.0.2.0/24'), true, '分散：ROA 未撤（陈旧）');
  assert.equal(ds.forwarding.has('200:192.0.2.0/24'), true, '分散：FC 未撤（陈旧）');
  assert.equal(ds.roles.get(100)?.has(200), true, '分散：他人 provider 引用残留（陈旧）');
  const audit = d.audit();
  assert.equal(audit.violations, 1, '陈旧 provider 引用被跨家族审计捕获');

  // 无失败基线：分散与统一终态快照等价（陈旧引用全部清干净）。
  const d0 = new DispersedRepo();
  d0.seedFrom(revokedSeed);
  d0.apply({ kind: 'revokeAll', as: 200 });
  assert.equal(d0.counters().drift, 0);
  assertSnapEqual(d0.snap(), u.snap());
});

test('intent: addRole 影响 verify 角色面判定（向 provider 宣告 = 简化违反）', () => {
  const seed: CanonicalIntent = {
    origins: new Map([['10.0.0.0/24', 100]]),
    providers: new Map([[100, new Set([200])]]),
    roles: new Map([[100, new Map()]]),
    forwarding: new Set(['100:10.0.0.0/24']),
  };
  const route = { originAs: 100, prefix: '10.0.0.0/24', path: [100, 200] };
  for (const Repo of [DispersedRepo, UnifiedRepo]) {
    const repo = new Repo();
    repo.seedFrom(seed);
    const before = repo.verify(route);
    assert.equal(before.roles[0].role, null, '初始无角色声明');
    assert.equal(before.roles[0].compliant, true);
    assert.equal(before.compliant, true, '初始：origin/FC/provider 齐备 → 合规');
    repo.apply({ kind: 'addRole', as: 100, neighbor: 200, role: 'provider' });
    const after = repo.verify(route);
    assert.equal(after.roles[0].role, 'provider');
    assert.equal(after.roles[0].compliant, false, '向 provider 宣告 = 泄漏方向 → 简化违反');
    assert.equal(after.compliant, false, '角色违反 → 整条路由不再合规');
    assert.equal(after.coherent, true, '角色面不影响 coherent（仅 origin/forwarding 对话）');
  }
});

test('intent: totalWriteSteps / isPartialFailure 步骤口径', () => {
  const s = S1.seed;
  // splitPrefix：旧前缀有 ROA（1）+ 引用旧前缀的 FC（100，1）= 2 步。
  assert.equal(totalWriteSteps({ kind: 'splitPrefix', oldPrefix: '10.0.0.0/24', newPrefix: '10.0.0.0/25' }, s), 2);
  assert.equal(isPartialFailure({ kind: 'splitPrefix', oldPrefix: '10.0.0.0/24', newPrefix: '10.0.0.0/25', failAfterWrite: 1 }, s), true);
  assert.equal(isPartialFailure({ kind: 'splitPrefix', oldPrefix: '10.0.0.0/24', newPrefix: '10.0.0.0/25', failAfterWrite: 2 }, s), false, '等于总步数 → 全量生效非部分');
  // revokeAll（AS 200 拥有 aspa/roles/被引用/FC/ROA 各 1）= 5 步。
  const rseed: CanonicalIntent = {
    origins: new Map([['192.0.2.0/24', 200]]),
    providers: new Map([[200, new Set([300])], [100, new Set([200])]]),
    roles: new Map([[200, new Map([[300, 'provider']])], [100, new Map([[200, 'provider']])]]),
    forwarding: new Set(['200:192.0.2.0/24']),
  };
  assert.equal(totalWriteSteps({ kind: 'revokeAll', as: 200 }, rseed), 5);
  assert.equal(isPartialFailure({ kind: 'revokeAll', as: 200, failAfterWrite: 2 }, rseed), true);
  // 单对象事件：恒 1 步，failAfterWrite=0 不算部分失败（未发生任何写）。
  assert.equal(totalWriteSteps({ kind: 'addProvider', as: 100, provider: 300 }, s), 1);
  assert.equal(isPartialFailure({ kind: 'addProvider', as: 100, provider: 300, failAfterWrite: 0 }, s), false);
  assert.equal(isPartialFailure({ kind: 'addProvider', as: 100, provider: 300, failAfterWrite: 1 }, s), false, '1/1 全量生效');
});
