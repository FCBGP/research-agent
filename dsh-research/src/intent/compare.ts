// src/intent/compare.ts — H-UNI 最小原型：同事件脚本在「分散载体」与「统一对象」上对比，
// 并给出 V3 窄口径的可测评估。
//
// 运行方式（确定性，无随机）：
//   - seed → 用同一归一化意图集合分别种子两个仓库（记录种子代价）。
//   - events → 同一事件脚本；failurePlan 只作用于分散态（演示多对象写非原子的部分生效/漂移），
//     统一态单对象原子写，失败语义对其无意义，故忽略。
//   - verify → 对同一组路由分别验证（计 lookups / verifyOps；额外输出 coherent/compliant）。
//   - audit → 一致性审计（分散态跨家族 join 扫描；统一态对象内核查）。
// 输出：各仓库全量代价 + 事件阶段写放大（无失败基线）+ 路由判定 + 比值。
import { DispersedRepo } from './dispersed.ts';
import { UnifiedRepo } from './unified.ts';
import { zeroCounters, type CostCounters, type IntentEvent, type CanonicalIntent, type Route, type RouteVerdict, type AuditResult } from './types.ts';

export interface IntentScenario {
  name: string;
  seed: CanonicalIntent;
  events: IntentEvent[];
  /** event 下标 -> failAfterWrite（只作用于分散态多写原子性演示）。 */
  failurePlan: Record<number, number>;
  routes: Route[];
}

export interface RepoRun {
  /** 全量累计代价（seed + events + verify + audit）。 */
  counts: CostCounters;
  /** 事件阶段写入数（seed 之后、verify/audit 之前）。 */
  eventWrites: number;
  audit: AuditResult;
  verdicts: RouteVerdict[];
  coherent: number;
  compliant: number;
}

export interface CompareResult {
  scenario: string;
  dispersed: RepoRun;         // failurePlan 生效（含部分失败/漂移）→ 最终状态不一致可见
  dispersedNoFail: RepoRun;   // 无失败基线 → 纯写放大对比
  unified: RepoRun;           // 忽略 failures（原子）→ 恒无漂移
  /** 比值统一按 unified/dispersed 计（< 1 = 统一更省）。 */
  ratios: { eventWrites: number; verifyLookups: number; verifyOps: number; auditLookups: number };
}

/** 计数增量。 */
export function countersDelta(after: CostCounters, before: CostCounters): CostCounters {
  return {
    writes: after.writes - before.writes,
    lookups: after.lookups - before.lookups,
    signOps: after.signOps - before.signOps,
    verifyOps: after.verifyOps - before.verifyOps,
    drift: after.drift - before.drift,
  };
}

function summarize(vs: RouteVerdict[]): { coherent: number; compliant: number } {
  return { coherent: vs.filter((v) => v.coherent).length, compliant: vs.filter((v) => v.compliant).length };
}

export function runScenario(scenario: IntentScenario): CompareResult {
  // —— 分散态（with failures）——
  const d = new DispersedRepo();
  d.seedFrom(scenario.seed);
  const dSeed = d.counters();
  for (let i = 0; i < scenario.events.length; i++) {
    const f = scenario.failurePlan[i];
    d.apply(f === undefined ? scenario.events[i] : { ...scenario.events[i], failAfterWrite: f });
  }
  const dEvent = countersDelta(d.counters(), dSeed);
  const dVerdicts = scenario.routes.map((r) => d.verify(r));
  const dAudit = d.audit();
  const dCounts = d.counters();

  // —— 分散态（无失败，纯写放大基线）——
  const d2 = new DispersedRepo();
  d2.seedFrom(scenario.seed);
  const d2Seed = d2.counters();
  for (const ev of scenario.events) d2.apply(ev);
  const d2Event = countersDelta(d2.counters(), d2Seed);
  const d2Verdicts = scenario.routes.map((r) => d2.verify(r));
  const d2Audit = d2.audit();

  // —— 统一态（忽略 failures）——
  const u = new UnifiedRepo();
  u.seedFrom(scenario.seed);
  const uSeed = u.counters();
  for (const ev of scenario.events) u.apply(ev);
  const uEvent = countersDelta(u.counters(), uSeed);
  const uVerdicts = scenario.routes.map((r) => u.verify(r));
  const uAudit = u.audit();
  const uCounts = u.counters();

  const ratio = (a: number, b: number): number => (b === 0 ? 0 : Math.round((a / b) * 100) / 100);
  return {
    scenario: scenario.name,
    dispersed: { counts: dCounts, eventWrites: dEvent.writes, audit: dAudit, verdicts: dVerdicts, ...summarize(dVerdicts) },
    dispersedNoFail: { counts: d2.counters(), eventWrites: d2Event.writes, audit: d2Audit, verdicts: d2Verdicts, ...summarize(d2Verdicts) },
    unified: { counts: uCounts, eventWrites: uEvent.writes, audit: uAudit, verdicts: uVerdicts, ...summarize(uVerdicts) },
    ratios: {
      eventWrites: ratio(uEvent.writes, d2Event.writes),
      verifyLookups: ratio(uCounts.lookups, dCounts.lookups),
      verifyOps: ratio(uCounts.verifyOps, dCounts.verifyOps),
      auditLookups: ratio(uAudit.auditLookups, dAudit.auditLookups),
    },
  };
}

/** V3 窄口径评估：统一态在**对象级代价**各维不更差 + 无部分漂移 + 审计违规不更多。 */
export interface V3NarrowFinding {
  ok: {
    eventWrites: boolean;  // 事件阶段写放大（no-fail 基线）
    verifyLookups: boolean;
    verifyOps: boolean;
    auditLookups: boolean;
    violations: boolean;
    noDrift: boolean;
  };
  supported: boolean;
}

export function evaluateV3Narrow(r: CompareResult): V3NarrowFinding {
  const ok = {
    eventWrites: r.unified.eventWrites <= r.dispersedNoFail.eventWrites,
    verifyLookups: r.unified.counts.lookups <= r.dispersed.counts.lookups,
    verifyOps: r.unified.counts.verifyOps <= r.dispersed.counts.verifyOps,
    auditLookups: r.unified.audit.auditLookups <= r.dispersed.audit.auditLookups,
    violations: r.unified.audit.violations <= r.dispersed.audit.violations,
    noDrift: r.unified.counts.drift === 0,
  };
  return { ok, supported: Object.values(ok).every(Boolean) };
}

/** 默认场景 S1（4-AS / 7 事件 / 2 处部分失败 / 3 条验证路由），测试与报告共用。 */
export const S1: IntentScenario = {
  name: 'S1 · 4-AS 事件脚本（含跨家族分裂 + 撤销的部分失败）',
  seed: {
    origins: new Map([['10.0.0.0/24', 100]]),
    providers: new Map([[100, new Set([200])], [200, new Set([300])]]),
    roles: new Map([[100, new Map([[200, 'provider'], [400, 'peer']])], [200, new Map([[300, 'provider']])]]),
    forwarding: new Set(['100:10.0.0.0/24']),
  },
  events: [
    { kind: 'addProvider', as: 100, provider: 300 },
    { kind: 'splitPrefix', oldPrefix: '10.0.0.0/24', newPrefix: '10.0.0.0/25' },
    { kind: 'addProvider', as: 100, provider: 400 },
    { kind: 'addRole', as: 200, neighbor: 400, role: 'peer' },
    { kind: 'removeProvider', as: 100, provider: 300 },
    { kind: 'addForwarding', as: 200, prefix: '10.0.0.0/25' },
    { kind: 'revokeAll', as: 200 },
  ],
  failurePlan: { 1: 1, 6: 2 },
  routes: [
    { originAs: 100, prefix: '10.0.0.0/25', path: [100, 400] },     // 有进路（新前缀）· 统一合规 / 分散阻断
    { originAs: 100, prefix: '10.0.0.0/24', path: [100, 400] },     // 已被拆走的前缀 · 分散自相矛盾（coherent=false）
    { originAs: 100, prefix: '10.0.0.0/25', path: [100, 200, 300] }, // 上游已撤销 · 双方都不合规（对照）
  ],
};

export function toReportMarkdown(r: CompareResult): string {
  const L: string[] = [];
  L.push(`# H-UNI 最小原型 · 场景运行报告：${r.scenario}`);
  L.push('');
  L.push(`## 对象级代价（全量）`);
   L.push('');
  L.push(`| 仓库 | writes | signOps | lookups | verifyOps | drift | auditViolations |`);
  L.push(`| --- | ---: | ---: | ---: | ---: | ---: | ---: |`);
  const row = (label: string, c: CostCounters, v: number): string =>
    `| ${label} | ${c.writes} | ${c.signOps} | ${c.lookups} | ${c.verifyOps} | ${c.drift} | ${v} |`;
  L.push(row('分散（基线）', r.dispersed.counts, r.dispersed.audit.violations));
  L.push(row('统一（H-UNI）', r.unified.counts, r.unified.audit.violations));
   L.push('');
  L.push(`- 事件阶段写放大（无失败基线）：分散 ${r.dispersedNoFail.eventWrites} vs 统一 ${r.unified.eventWrites}（比值 ${r.ratios.eventWrites}）`);
  L.push(`- 验证+审计 lookups：${r.dispersed.counts.lookups} vs ${r.unified.counts.lookups}（比值 ${r.ratios.verifyLookups}）`);
  L.push(`- 验签 verifyOps：${r.dispersed.counts.verifyOps} vs ${r.unified.counts.verifyOps}（比值 ${r.ratios.verifyOps}）`);
   L.push('');
  L.push(`## 路由判定（最终状态）`);
   L.push('');
  L.push(`| 路由 | 分散 compliant | 统一 compliant | 分散 coherent | 统一 coherent |`);
  L.push(`| --- | ---: | ---: | ---: | ---: |`);
  for (let i = 0; i < r.dispersed.verdicts.length; i++) {
    const rd = r.dispersed.verdicts[i] as RouteVerdict;
    const ru = r.unified.verdicts[i] as RouteVerdict;
    L.push(`| R${i + 1}（${rd.route.originAs} / ${rd.route.prefix} / [${rd.route.path.join(',')}]） | ${rd.compliant ? '✅合规' : '❌阻断'} | ${ru.compliant ? '✅合规' : '❌阻断'} | ${rd.coherent ? '✅一致' : '❌矛盾'} | ${ru.coherent ? '✅一致' : '❌矛盾'} |`);
  }
  return L.join('\n');
}
