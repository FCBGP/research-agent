// src/intent/types.ts — H-UNI 最小原型：统一 AS 意图对象 vs 分散载体。
//
// 背景（docs/domain-intent-survey.md · 设计假说 V3）：IETF 目前没有统一 AS 路由意图对象——
// 起源（ROA/ROV）、上游授权（ASPA）、对等角色（BGP Roles/OTC）、转发承诺（FC-BGP）四类意图
// 载体分属证书库与 BGP 属性两个平面，组合验证与跨家族一致性由运营者手工承担。
// V3（disputed）：「H-UNI 统一意图中介层可降低一致性维护开销」。
//
// 本模块 = V3 的最小原型的**代价口径层**：把「单一 AS 意图对象 + 组合验证」与「分散对象」
// 在确定性成本会计下对比（一致性维护/验证开销）。只量化**对象级操作次数**，明确不覆盖
// 表达力↔可判定性、增量部署、缓存失效半径等 V3 反证维度（真实网元不可得，故仅 C 级证据）。
//
// 纯 TS、确定性、可测；遵循仓库 Node 24 strip-only 约束（无构造器参数属性 / 无内联 type import）。
export type Asn = number;

/** 对等角色（BGP Roles，RFC 9234 词汇）。 */
export type PeerRole = 'provider' | 'customer' | 'peer';

/** 一条 BGP 路由（含 AS_PATH；path[0] = 起源 AS）。 */
export interface Route {
  originAs: Asn;
  prefix: string;
  /** 路径 AS 序列，path[0] 为起源（originAs），随后为中转/邻居。 */
  path: Asn[];
}

/** 意图变更事件（确定性脚本；failAfterWrite 只影响分散态的多写原子性演示）。 */
export type IntentEvent =
  | { kind: 'addProvider'; as: Asn; provider: Asn; failAfterWrite?: number }
  | { kind: 'removeProvider'; as: Asn; provider: Asn; failAfterWrite?: number }
  | { kind: 'addRole'; as: Asn; neighbor: Asn; role: PeerRole; failAfterWrite?: number }
  | { kind: 'removeRole'; as: Asn; neighbor: Asn; failAfterWrite?: number }
  | { kind: 'splitPrefix'; oldPrefix: string; newPrefix: string; failAfterWrite?: number }
  | { kind: 'addForwarding'; as: Asn; prefix: string; failAfterWrite?: number }
  | { kind: 'revokeAll'; as: Asn; failAfterWrite?: number };

/** 对象级代价计数器。 */
export interface CostCounters {
  /** 对象写入（create/update/delete）次数。 */
  writes: number;
  /** 存储读取（lookup / join）次数。 */
  lookups: number;
  /** 密码学签名操作（每次对象写入计入 1 次签名）。 */
  signOps: number;
  /** 密码学验证操作（每次对象读取核验计 1 次验签）。 */
  verifyOps: number;
  /** 观测到的不一致窗口次数（分散多写部分生效；统一单写原子 → 恒 0）。 */
  drift: number;
}

export function zeroCounters(): CostCounters {
  return { writes: 0, lookups: 0, signOps: 0, verifyOps: 0, drift: 0 };
}

/** 归一化意图快照（ground truth，用于一致性对比与测试）。 */
export interface CanonicalIntent {
  origins: Map<string, Asn>;            // prefix -> 被授权起源 AS（ROA/ROV）
  providers: Map<Asn, Set<Asn>>;        // AS -> 被授权上游集合（ASPA 有向边）
  roles: Map<Asn, Map<Asn, PeerRole>>;  // AS -> (neighbor -> role)（BGP Roles）
  forwarding: Set<string>;              // "as:prefix"（FC-BGP）
}

/** 验证查询的逐面判决（成本口径用计数，判定用于可测断言）。 */
export interface RouteVerdict {
  route: Route;
  origin: 'valid' | 'invalid' | 'notFound';
  /** 每跳 provider 授权判决（i 为跳序，0 表示 origin→path[1]）。 */
  hops: { fromAs: Asn; toAs: Asn; provider: 'valid' | 'invalid' | 'notFound' }[];
  /** 每跳角色合规（role 语义：仅当 provider/customer 关系声明且与传播相反谓词冲突才判 violation）。 */
  roles: { fromAs: Asn; toAs: Asn; role: PeerRole | null; compliant: boolean }[];
  forwarding: 'committed' | 'uncommitted';
  /** origin/forwarding 两面对话一致（无自相矛盾）：committed 的转发承诺必须落在 valid 的起源上。
   *   分散态跨家族部分生效可产生「origin notFound 却 forwarding committed」的矛盾面，
   *   统一态单对象原子 → 恒 coherent。 */
  coherent: boolean;
  /** 全部判决合格 = compliant。 */
  compliant: boolean;
}

/** 审计（一致性维护的另一面：跨家族 join 扫描 vs 单对象内部核查）结果。 */
export interface AuditResult {
  /** 交叉引用悬空/不一致数。 */
  violations: number;
  /** 本审计新增的 lookup 数（已并入 counters.lookups）。 */
  auditLookups: number;
}

/** 意图仓库统一接口（分散态 / 统一态各自实现，保证同一事件脚本可复现对比）。 */
export interface IntentRepo {
  /** 归一化快照（用于一致性/漂移断言）。 */
  snap(): CanonicalIntent;
  /** 应用一个意图变更事件（只做一次，一次性语义；跨家族分散多写按 failAfterWrite 可能部分生效）。 */
  apply(event: IntentEvent): void;
  /** 验证一条路由的全部意图面（计 lookups / verifyOps）。 */
  verify(route: Route): RouteVerdict;
  /** 一致性审计（计 lookups；分散态为跨家族 join 扫描，统一态为对象内核查）。 */
  audit(): AuditResult;
  /** 当前累计代价。 */
  counters(): CostCounters;
}

/** 事件应用的可写步骤数（分散态多写原子性演示用；统一态恒 1）。 */
export function totalWriteSteps(event: IntentEvent, repoSnap: CanonicalIntent): number {
  switch (event.kind) {
    case 'addProvider':
    case 'removeProvider':
    case 'addRole':
    case 'removeRole':
    case 'addForwarding':
      return 1;
    case 'splitPrefix': {
      // ROA 分裂（若旧前缀有 ROA 则 1 步）+ 每个引用旧前缀的 FC 记录重写（每 AS 1 步）。
      let steps = repoSnap.origins.has(event.oldPrefix) ? 1 : 0;
      for (const key of [...repoSnap.forwarding]) {
        const [as, prefix] = key.split(':', 2);
        if (prefix === event.oldPrefix) steps += 1;
      }
      return steps;
    }
    case 'revokeAll': {
      // aspa 记录 + 该 AS 自身的 roles + 其他 AS roles 中对其的引用 + 该 AS 的 FC 记录 + 该 AS 的 ROA。
      let steps = 0;
      if (repoSnap.providers.has(event.as)) steps += 1;
      if (repoSnap.roles.has(event.as)) steps += 1;
      for (const [as, nb] of repoSnap.roles) {
        void as;
        if (nb.has(event.as)) steps += 1;
      }
      for (const key of repoSnap.forwarding) {
        if (key.startsWith(`${event.as}:`)) steps += 1;
      }
      for (const [prefix, origin] of repoSnap.origins) {
        if (origin === event.as) steps += 1;
      }
      return steps;
    }
  }
}

/** 事件是否产生部分生效（1 <= failAfterWrite < totalSteps）→ 仅分散态可出现漂移窗口。 */
export function isPartialFailure(event: IntentEvent, repoSnap: CanonicalIntent): boolean {
  const f = event.failAfterWrite;
  if (f === undefined) return false;
  const total = totalWriteSteps(event, repoSnap);
  return f >= 1 && f < total;
}
