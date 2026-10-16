// sweep.ts — H-UNI 参数扫描（AS 数 × 事件数）（huni-min-proto-report.md 局限 #4）。
//
//   确定性：所有随机性来自 topology.ts 的 mulberry32（同 seed 可复现）。每格
//   (asCount × eventCount) 生成 scriptCount 个不同脚本（种子 = mixSeed(globalSeed,
//   asCount, eventCount, scriptIndex) 逐格错开），逐脚本跑 runScenario →
//   evaluateV3Narrow，聚合 supportedRate / 各维 ok / 平均与最大比值 / 漂移 /
//   一致·合规计数，反例（任何一维 V3 ok=false）如实保留。
//
//   事件 mix（权重之和 = 1.0）：addProvider .18 / removeProvider .10 / addRole .16 /
//   removeRole .08 / addForwarding .20 / splitPrefix .14 / revokeAll .14。
//   failurePlan 是本模块唯一的失败注入源（事件本身永不携带 failAfterWrite）：
//   仅当「该事件在规划模型上可判定的 totalWriteSteps ≥ 2」才注入 failAfterWrite=1——
//     · splitPrefix：old 前缀仍存于 roa 根部 且 仍有 ≥1 条 FC 引用（种子 FC 覆盖全部池前缀）
//     · revokeAll  ：该 AS 的 roas + FC 条数之和 ≥ 2
//   规划模型镜像「分散带失败」run 的 roas / fc 两个族的演化（部分失败语义 = 只完成
//   cap=1 的第一步），因此注入命中即为真多步事件；个别边界（如已无 FC 的 AS 被
//   部分 revoke 消耗根部 roa）会让后续注入判定保守偏移——落空只会退化为无操作
//   （无漂移、无崩溃，见分散/统一仓库 apply 的守卫），不产生虚假漂移。
//
//   输出口径：比值一律 unified/dispersed（<1 = 统一态更省）；supported 由
//   evaluateV3Narrow 六维 all-ok 定义；全部结论为 C 级（确定性模拟）disputed、方向性。
import { mulberry32 } from '../experiment/topology.ts';
import { runScenario, evaluateV3Narrow } from './compare.ts';
import type { Asn, PeerRole, CanonicalIntent, IntentEvent, Route } from './types.ts';
import type { IntentScenario, CompareResult, V3NarrowFinding } from './compare.ts';

export type SweepDim =
  | 'eventWrites' | 'verifyLookups' | 'verifyOps' | 'auditLookups' | 'violations' | 'noDrift';

export interface SweepGridCell {
  asCount: number;
  eventCount: number;
  scriptCount: number;
}

export interface SweepScriptResult {
  asCount: number;
  eventCount: number;
  scriptIndex: number;
  seed: number;
  finding: V3NarrowFinding;
  ratios: CompareResult['ratios'];
  driftDispersed: number;
  driftUnified: number;
  coherentDispersed: number;
  coherentUnified: number;
  compliantDispersed: number;
  compliantUnified: number;
}

export interface SweepCounterexample {
  scriptIndex: number;
  seed: number;
  dim: SweepDim;
}

export type SweepRatioKey = 'eventWrites' | 'verifyLookups' | 'verifyOps' | 'auditLookups';

export interface SweepCellResult {
  asCount: number;
  eventCount: number;
  scriptCount: number;
  scripts: SweepScriptResult[];
  supportedCount: number;
  perDimOk: Record<SweepDim, number>;
  avgRatios: Record<SweepRatioKey, number>;
  maxRatios: Record<SweepRatioKey, number>;
  driftSum: { dispersed: number; unified: number };
  coherentSum: { dispersed: number; unified: number };
  compliantSum: { dispersed: number; unified: number };
  counterexamples: SweepCounterexample[];
}

export interface SweepReport {
  cells: SweepCellResult[];
  globalSeed: number;
}

const round = (x: number): number => Math.round(x * 100) / 100;

/** 确定性种子混合：逐格/逐脚本错开（mulberry32 单流，输出 0..2^32-1）。 */
export function mixSeed(...parts: number[]): number {
  let h = 0x9e3779b9;
  for (const p of parts) {
    h = Math.imul(h ^ (p >>> 0), 0x85ebca6b);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export const SWEEP_DIMS: readonly SweepDim[] = [
  'eventWrites', 'verifyLookups', 'verifyOps', 'auditLookups', 'violations', 'noDrift',
];
export const SWEEP_RATIO_KEYS: readonly SweepRatioKey[] = [
  'eventWrites', 'verifyLookups', 'verifyOps', 'auditLookups',
];

/**
 * 生成一个确定性场景脚本（种子 canonical + 事件脚本 + failurePlan + 路由）。
 * 保证：脚本自身的事件不携带 failAfterWrite（失败注入只走 failurePlan）；
 * splitPrefix 的新前缀全局单调递增，杜绝池内碰撞。
 */
export function generateScenario(
  asCount: number,
  eventCount: number,
  seed: number,
  name = `AS${asCount}-E${eventCount}`,
): IntentScenario {
  const rnd = mulberry32(seed);
  const asns = Array.from({ length: asCount }, (_, i) => 100 + i);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];

  // 前缀池：AS 数越大池越大（2..8 个 /16），种子 FC 覆盖全部池前缀 → split 多步条件。
  const poolSize = Math.max(2, Math.min(8, Math.floor(asCount / 4)));
  const prefixPool = Array.from({ length: poolSize }, (_, p) => `10.${p}.0.0/16`);

  const origins = new Map<string, Asn>();
  for (const p of prefixPool) origins.set(p, pick(asns));

  const providers = new Map<Asn, Set<Asn>>();
  const roles = new Map<Asn, Map<Asn, PeerRole>>();
  for (const a of asns) {
    const pr = new Set<Asn>();
    const n = 1 + Math.floor(rnd() * 2); // 1..2 个 provider（保证 revokeAll 计数多步）
    for (let k = 0; k < n; k++) {
      let x = pick(asns);
      while (x === a) x = pick(asns);
      pr.add(x);
    }
    providers.set(a, pr);
    roles.set(a, new Map([...pr].map((p) => [p, 'provider' as PeerRole])));
  }
  const forwarding = new Set<string>();
  for (const [p, o] of origins) forwarding.add(`${o}:${p}`);

  // 规划状态模型：镜像「分散带失败」run 的 roas（originsByAs）与 fc 两族演化。
  const modelOriginsByAs = new Map<Asn, Set<string>>();
  for (const [p, o] of origins) {
    if (!modelOriginsByAs.has(o)) modelOriginsByAs.set(o, new Set());
    modelOriginsByAs.get(o)!.add(p);
  }
  const modelFcByAs = new Map<Asn, Set<string>>();
  for (const f of forwarding) {
    const [asS, p] = f.split(':');
    const as = Number(asS);
    if (!modelFcByAs.has(as)) modelFcByAs.set(as, new Set());
    modelFcByAs.get(as)!.add(p);
  }
  const originsOf = (as: Asn): Set<string> => modelOriginsByAs.get(as) ?? new Set();
  const fcOf = (as: Asn): Set<string> => modelFcByAs.get(as) ?? new Set();
  const prefixLive = (p: string): boolean => {
    for (const s of modelOriginsByAs.values()) if (s.has(p)) return true;
    return false;
  };
  const fcRefs = (p: string): number => {
    let c = 0;
    for (const s of modelFcByAs.values()) if (s.has(p)) c++;
    return c;
  };

  const events: IntentEvent[] = [];
  const failurePlan: Record<number, number> = {};
  let splitCounter = 0;
  for (let i = 0; i < eventCount; i++) {
    const r = rnd();
    let kind: string;
    if (r < 0.18) kind = 'addProvider';
    else if (r < 0.28) kind = 'removeProvider';
    else if (r < 0.44) kind = 'addRole';
    else if (r < 0.52) kind = 'removeRole';
    else if (r < 0.72) kind = 'addForwarding';
    else if (r < 0.86) kind = 'splitPrefix';
    else kind = 'revokeAll';

    switch (kind) {
      case 'addProvider': {
        const as = pick(asns);
        let provider = pick(asns);
        while (provider === as) provider = pick(asns);
        events.push({ kind: 'addProvider', as, provider });
        break;
      }
      case 'removeProvider': {
        const as = pick(asns);
        const prs = providers.get(as)!;
        const provider = prs.size ? [...prs][Math.floor(rnd() * prs.size)] : pick(asns);
        events.push({ kind: 'removeProvider', as, provider });
        break;
      }
      case 'addRole': {
        const as = pick(asns);
        let neighbor = pick(asns);
        while (neighbor === as) neighbor = pick(asns);
        const rr = rnd();
        const role: PeerRole = rr < 0.4 ? 'provider' : rr < 0.75 ? 'peer' : 'customer';
        events.push({ kind: 'addRole', as, neighbor, role });
        break;
      }
      case 'removeRole': {
        const as = pick(asns);
        const rm = roles.get(as)!;
        const neighbor = rm.size ? [...rm.keys()][Math.floor(rnd() * rm.size)] : pick(asns);
        events.push({ kind: 'removeRole', as, neighbor });
        break;
      }
      case 'addForwarding': {
        const as = pick(asns);
        const prefix = pick(prefixPool);
        events.push({ kind: 'addForwarding', as, prefix });
        if (!modelFcByAs.has(as)) modelFcByAs.set(as, new Set());
        modelFcByAs.get(as)!.add(prefix); // addForwarding 永不注入失败 → 全效，模型精确
        break;
      }
      case 'splitPrefix': {
        const oldPrefix = pick(prefixPool);
        const newPrefix = `10.${splitCounter++}.0.0/24`;
        const live = prefixLive(oldPrefix);
        const refs = fcRefs(oldPrefix);
        const injectable = live && refs >= 1; // total = 1(roa) + refs ≥ 2
        if (injectable) failurePlan[events.length] = 1;
        events.push({ kind: 'splitPrefix', oldPrefix, newPrefix });
        if (injectable) {
          // 部分失败（cap=1）：只完成 ROA 移动，FC 改写中止（FC 仍引用旧前缀 → 漂移窗口）
          for (const [o, s] of modelOriginsByAs) {
            if (s.has(oldPrefix)) {
              s.delete(oldPrefix);
              s.add(newPrefix);
              break;
            }
          }
        } else {
          // 全效：ROA 移动 + FC 引用改写
          for (const [o, s] of modelOriginsByAs) {
            if (s.has(oldPrefix)) {
              s.delete(oldPrefix);
              s.add(newPrefix);
              break;
            }
          }
          for (const s of modelFcByAs.values()) {
            if (s.has(oldPrefix)) {
              s.delete(oldPrefix);
              s.add(newPrefix);
            }
          }
        }
        break;
      }
      case 'revokeAll': {
        const as = pick(asns);
        const totalGuaranteed = originsOf(as).size + fcOf(as).size;
        const injectable = totalGuaranteed >= 2;
        if (injectable) failurePlan[events.length] = 1;
        events.push({ kind: 'revokeAll', as });
        if (injectable) {
          // 部分失败（cap=1）：首个 take 落在 aspa/roles/… 族，roas/fc 不动
          // （保守镜像；边界见文件头注释——落空 = 无操作，不产生虚假漂移）
        } else {
          modelOriginsByAs.delete(as);
          modelFcByAs.delete(as);
        }
        break;
      }
    }
  }

  // 路由：6 条 / 脚本（3 条指向「池前缀起源 AS 为主」的目标进路 + 3 条随机探测进路），
  // path 长度 ≥2（起点 = originAs），验证阶段真实产生逐跳 lookups / verifyOps。
  const routes: Route[] = [];
  for (let k = 0; k < 6; k++) {
    const prefix = pick(prefixPool);
    const useOrigin = rnd() < 0.75 && origins.has(prefix);
    const origin = useOrigin ? (origins.get(prefix) as Asn) : pick(asns);
    const path: Asn[] = [origin];
    const hops = 1 + Math.floor(rnd() * 2); // 1..2 跳（总长 2..3），每跳取不同 AS
    for (let j = 0; j < hops; j++) {
      let x = pick(asns);
      while (path.includes(x)) x = pick(asns);
      path.push(x);
    }
    routes.push({ originAs: origin, prefix, path });
  }

  return { name, seed: { origins, providers, roles, forwarding }, events, failurePlan, routes };
}

/** 稳定指纹：同场景 → 同字符串（排序使跨引擎稳定）。 */
export function scenarioFingerprint(sc: IntentScenario): string {
  const seed = {
    origins: [...sc.seed.origins.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    providers: [...sc.seed.providers.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([as, s]) => [as, [...s].sort((a, b) => a - b)]),
    roles: [...sc.seed.roles.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([as, m]) => [as, [...m.entries()].sort((a, b) => a[0] - b[0])]),
    forwarding: [...sc.seed.forwarding].sort(),
  };
  return JSON.stringify({ ...sc, seed });
}

/** 跑一个格（AS×事件×多脚本）并聚合 V3 窄口径统计与反例。 */
export function runSweepCell(cell: SweepGridCell, baseSeed: number): SweepCellResult {
  const { asCount, eventCount, scriptCount } = cell;
  const scripts: SweepScriptResult[] = [];
  let supportedCount = 0;
  const perDimOk: Record<SweepDim, number> = {
    eventWrites: 0, verifyLookups: 0, verifyOps: 0, auditLookups: 0, violations: 0, noDrift: 0,
  };
  const ratiosAcc: Record<SweepRatioKey, number> = { eventWrites: 0, verifyLookups: 0, verifyOps: 0, auditLookups: 0 };
  const maxRatios: Record<SweepRatioKey, number> = { eventWrites: 0, verifyLookups: 0, verifyOps: 0, auditLookups: 0 };
  const driftSum = { dispersed: 0, unified: 0 };
  const coherentSum = { dispersed: 0, unified: 0 };
  const compliantSum = { dispersed: 0, unified: 0 };
  const counterexamples: SweepCounterexample[] = [];

  for (let s = 0; s < scriptCount; s++) {
    const seed = mixSeed(baseSeed, asCount, eventCount, s);
    const scenario = generateScenario(asCount, eventCount, seed, `AS${asCount}-E${eventCount}-S${s}`);
    const r = runScenario(scenario);
    const f = evaluateV3Narrow(r);
    if (f.supported) supportedCount++;
    for (const dim of SWEEP_DIMS) {
      if (f.ok[dim]) perDimOk[dim]++;
      else counterexamples.push({ scriptIndex: s, seed, dim });
    }
    for (const k of SWEEP_RATIO_KEYS) {
      ratiosAcc[k] += r.ratios[k];
      maxRatios[k] = Math.max(maxRatios[k], r.ratios[k]);
    }
    driftSum.dispersed += r.dispersed.counts.drift;
    driftSum.unified += r.unified.counts.drift;
    coherentSum.dispersed += r.dispersed.verdicts.filter((v) => v.coherent).length;
    coherentSum.unified += r.unified.verdicts.filter((v) => v.coherent).length;
    compliantSum.dispersed += r.dispersed.verdicts.filter((v) => v.compliant).length;
    compliantSum.unified += r.unified.verdicts.filter((v) => v.compliant).length;
    scripts.push({
      asCount, eventCount, scriptIndex: s, seed, finding: f, ratios: r.ratios,
      driftDispersed: r.dispersed.counts.drift, driftUnified: r.unified.counts.drift,
      coherentDispersed: r.dispersed.coherent, coherentUnified: r.unified.coherent,
      compliantDispersed: r.dispersed.compliant, compliantUnified: r.unified.compliant,
    });
  }

  const avgRatios = {
    eventWrites: round(ratiosAcc.eventWrites / scriptCount),
    verifyLookups: round(ratiosAcc.verifyLookups / scriptCount),
    verifyOps: round(ratiosAcc.verifyOps / scriptCount),
    auditLookups: round(ratiosAcc.auditLookups / scriptCount),
  };

  return {
    asCount, eventCount, scriptCount, scripts, supportedCount, perDimOk, avgRatios, maxRatios,
    driftSum, coherentSum, compliantSum, counterexamples,
  };
}

/** 跑整张网格（一次性、确定性；同 globalSeed 可复现）。 */
export function runSweep(cells: readonly SweepGridCell[], globalSeed: number): SweepReport {
  return { cells: cells.map((c) => runSweepCell(c, globalSeed)), globalSeed };
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

/** 交叉尺度结论（数据驱动、如实标注 C 级 / disputed / 方向性）。 */
export function summaryVerdict(report: SweepReport): string {
  const total = report.cells.reduce((s, c) => s + c.scriptCount, 0);
  const sup = report.cells.reduce((s, c) => s + c.supportedCount, 0);
  const supportedRate = total ? sup / total : 0;
  const anyCx = report.cells.some((c) => c.counterexamples.length > 0);
  const allAvgLt1 = report.cells.every((c) =>
    SWEEP_RATIO_KEYS.every((k) => c.avgRatios[k] < 1),
  );
  const lines: string[] = [];
  lines.push(`聚合 supportedRate = ${pct(supportedRate)}（${sup}/${total} 个脚本 · 六维 all-ok 定义）`);
  lines.push(`V3 反例（任一维 ok=false）：${anyCx ? '存在，见反例清单' : '无'}`);
  lines.push(`四维平均比值全部 <1（统一态全面更省）：${allAvgLt1 ? '是' : '否（见各格 avgRatios/maxRatios）'}`);
  if (supportedRate >= 0.8 && !anyCx && allAvgLt1) {
    lines.push('▶ 交叉尺度方向性支持成立：统一态在对象级代价各维不更差、无部分漂移、审计违规不更多，且随 AS/事件规模缩放保持——C 级（确定性模拟核算）disputed，仅方向性。');
  } else if (supportedRate >= 0.8 && !anyCx) {
    lines.push('▶ 交叉尺度支持成立但保留：存在平均比值 ≥1 的维度，统一态未在各维全面更省——C 级 disputed，方向性有限。');
  } else {
    lines.push('▶ 交叉尺度统一性不成立 / 不充分：存在反例或支持率未过阈（0.8）——C 级 disputed，反例如实列出，不得升高认证。');
  }
  return lines.join('\n');
}

/** 把整张扫描渲染成 Markdown 报告。 */
export function sweepToMarkdown(report: SweepReport): string {
  const L: string[] = [];
  L.push('# H-UNI 参数扫描报告（AS 数 × 事件数）');
  L.push('');
  L.push(`- 环境：确定性模拟（mulberry32 同 seed 可复现；种子混合 imul-mix）`);
  L.push(`- 全局种子：${report.globalSeed}`);
  L.push(`- 网格：${report.cells.length} 格 · 每格 ${report.cells[0]?.scriptCount ?? 0} 脚本 · 事件 mix 见 sweep.ts 文件头`);
  L.push(`- 口径：比值 = unified/dispersed（<1 = 统一态更省）；supported = V3 窄口径六维 all-ok；结论全部 C 级（确定性模拟）disputed、方向性；反例如实列出。`);
  L.push('');
  L.push('## 交叉尺度结论');
  L.push('');
  L.push(summaryVerdict(report).split('\n').map((x) => `- ${x}`).join('\n'));
  L.push('');
  L.push('## 聚合汇总');
  L.push('');
  L.push('| 格(AS×E) | supportedRate | 六维 ok 计数 | avg(eventWrites/verify/verifyOps/audit) | max(同序) | drift(统一/分散) | coherent(统一/分散) | compliant(统一/分散) | 反例数 |');
  L.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const c of report.cells) {
    const rate = c.scriptCount ? c.supportedCount / c.scriptCount : 0;
    const ok = `${c.perDimOk.eventWrites}/${c.perDimOk.verifyLookups}/${c.perDimOk.verifyOps}/${c.perDimOk.auditLookups}/${c.perDimOk.violations}/${c.perDimOk.noDrift}`;
    L.push(`| ${c.asCount}×${c.eventCount} | ${pct(rate)} (${c.supportedCount}/${c.scriptCount}) | ${ok} | ${c.avgRatios.eventWrites} / ${c.avgRatios.verifyLookups} / ${c.avgRatios.verifyOps} / ${c.avgRatios.auditLookups} | ${c.maxRatios.eventWrites} / ${c.maxRatios.verifyLookups} / ${c.maxRatios.verifyOps} / ${c.maxRatios.auditLookups} | ${c.driftSum.unified}/${c.driftSum.dispersed} | ${c.coherentSum.unified}/${c.coherentSum.dispersed} | ${c.compliantSum.unified}/${c.compliantSum.dispersed} | ${c.counterexamples.length} |`);
  }
  L.push('');
  L.push('## 反例清单（任一维 V3 ok=false，如实列出）');
  L.push('');
  const cxs = report.cells.flatMap((c) => c.counterexamples.map((x) => ({ cell: c, ...x })));
  if (cxs.length === 0) {
    L.push('（无）');
  } else {
    L.push('| 格(AS×E) | 脚本 | seed | 失败维 |');
    L.push('| --- | ---: | ---: | ---: |');
    for (const x of cxs) {
      L.push(`| ${x.cell.asCount}×${x.cell.eventCount} | S${x.scriptIndex} | ${x.seed} | ${x.dim} |`);
    }
  }
  L.push('');
  return L.join('\n');
}
