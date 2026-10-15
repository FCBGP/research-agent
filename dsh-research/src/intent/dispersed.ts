// src/intent/dispersed.ts — 分散载体仓库（基线）：ROA / ASPA / BGP-Roles / FC 四家族分库存储。
//
// 口径：
//   - 每个家族对象独立 schema；每次对象写入 = 1 write + 1 signOp（签名新版本）。
//   - 跨家族的「同一意图变更」触发多对象并发更新（写放大），且**非原子**：
//     事件脚本给 failAfterWrite=n 时只应用前 n 个对象写、其余中止 → 观测到不一致窗口（drift++）。
//   - 验证一条路由 = 按面分别检索：origin 需 ROA + FC 两次检索；每个在途 AS 需 ASPA + Roles
//     两次检索（Roles 未签名 → 只计 lookup，不计验签——对齐 RFC 9234 无签名属性语义）。
//   - audit = 跨家族 join 扫描（每个 FC 记录回查 ROA；每个 provider 角色回查 ASPA）。
//   本实现刻意**只统计对象级操作**，不引入任何「统一更优」的先验，数值由脚本决定。
import {
  zeroCounters,
  totalWriteSteps,
  isPartialFailure,
  type Asn,
  type PeerRole,
  type CostCounters,
  type CanonicalIntent,
  type Route,
  type RouteVerdict,
  type AuditResult,
  type IntentRepo,
  type IntentEvent,
} from './types.ts';

/** 分散仓库：四个独立对象家族。 */
export class DispersedRepo implements IntentRepo {
  private readonly roas = new Map<string, Asn>();                 // prefix -> originAs
  private readonly aspas = new Map<Asn, Set<Asn>>();              // as -> providers
  private readonly roles = new Map<Asn, Map<Asn, PeerRole>>();    // as -> (neighbor -> role)
  private readonly fc = new Set<string>();                        // "as:prefix"
  private readonly c = zeroCounters();

  /** 写入一个对象（write+sign 计数；对象存在则视为版本更新）。 */
  private write(family: string): void {
    void family;
    this.c.writes += 1;
    this.c.signOps += 1;
  }

  /** 检索一个对象（lookup 计数）。 */
  private lookup(): void {
    this.c.lookups += 1;
  }

  snap(): CanonicalIntent {
    return {
      origins: new Map(this.roas),
      providers: new Map([...this.aspas].map(([k, v]) => [k, new Set(v)])),
      roles: new Map([...this.roles].map(([k, v]) => [k, new Map(v)])),
      forwarding: new Set(this.fc),
    };
  }

  /** 种子：从归一化意图集合构造（计对象级写入）。 */
  seedFrom(canonical: CanonicalIntent): void {
    for (const [prefix, origin] of canonical.origins) { this.roas.set(prefix, origin); this.write('roa'); }
    for (const [as, set] of canonical.providers) { this.aspas.set(as, new Set(set)); this.write('aspa'); }
    for (const [as, nb] of canonical.roles) { this.roles.set(as, new Map(nb)); this.write('roles'); }
    for (const key of canonical.forwarding) { this.fc.add(key); this.write('fc'); }
  }

  apply(event: IntentEvent): void {
    const total = totalWriteSteps(event, this.snap());
    const partial = isPartialFailure(event, this.snap());
    // failAfterWrite：前 n 步成功、余下中止（只产生漂移窗口，被中止的部分不再落库）。
    const cap = event.failAfterWrite === undefined ? total : Math.max(0, Math.min(total, event.failAfterWrite));
    if (partial) this.c.drift += 1;

    switch (event.kind) {
      case 'addProvider': {
        if (cap < 1) break;
        const s = this.aspas.get(event.as) ?? new Set<Asn>();
        s.add(event.provider);
        this.aspas.set(event.as, s);
        this.write('aspa');
        break;
      }
      case 'removeProvider': {
        if (cap < 1) break;
        const s = this.aspas.get(event.as);
        if (s) { s.delete(event.provider); if (s.size === 0) this.aspas.delete(event.as); this.write('aspa'); }
        break;
      }
      case 'addRole': {
        if (cap < 1) break;
        const m = this.roles.get(event.as) ?? new Map<Asn, PeerRole>();
        m.set(event.neighbor, event.role);
        this.roles.set(event.as, m);
        this.write('roles');
        break;
      }
      case 'removeRole': {
        if (cap < 1) break;
        const m = this.roles.get(event.as);
        if (m) { m.delete(event.neighbor); if (m.size === 0) this.roles.delete(event.as); this.write('roles'); }
        break;
      }
      case 'splitPrefix': {
        // 步 1：ROA 新前缀；步 2..n：每个引用旧前缀的 FC 记录重写（每 AS 1 步）。
        let step = 0;
        if (step < cap && this.roas.has(event.oldPrefix)) {
          this.roas.set(event.newPrefix, this.roas.get(event.oldPrefix) as Asn);
          this.roas.delete(event.oldPrefix);
          this.write('roa'); step += 1;
        }
        const affected = new Set<string>();
        for (const key of this.fc) {
          const [as, prefix] = key.split(':', 2);
          if (prefix === event.oldPrefix) affected.add(as);
        }
        for (const as of affected) {
          if (step >= cap) break;
          this.fc.delete(`${as}:${event.oldPrefix}`);
          this.fc.add(`${as}:${event.newPrefix}`);
          this.write('fc'); step += 1;
        }
        break;
      }
      case 'addForwarding': {
        if (cap < 1) break;
        this.fc.add(`${event.as}:${event.prefix}`);
        this.write('fc');
        break;
      }
      case 'revokeAll': {
        // 依次撤销：aspa / 自身 roles / 他人 roles 引用 / 自身 fc / 自身 roa（顺序即步骤序）。
        // 与 splitPrefix 一致：只有「被 take 的步骤」真正落库；步骤数不足时陈旧引用残留
        // （部分失败 → 恢复期跨家族不一致，由 audit 捕获 → drift 窗口可见）。
        let step = 0;
        const take = (): boolean => { if (step < cap) { step += 1; return true; } return false; };
        if (this.aspas.has(event.as) && take()) { this.aspas.delete(event.as); this.write('aspa'); }
        if (this.roles.has(event.as) && take()) { this.roles.delete(event.as); this.write('roles'); }
        for (const [as, nb] of [...this.roles]) {
          if (nb.has(event.as) && take()) {
            nb.delete(event.as);
            if (nb.size === 0) this.roles.delete(as);
            this.write('roles');
          }
        }
        for (const key of [...this.fc]) {
          if (key.startsWith(`${event.as}:`) && take()) { this.fc.delete(key); this.write('fc'); }
        }
        for (const [prefix, origin] of [...this.roas]) {
          if (origin === event.as && take()) { this.roas.delete(prefix); this.write('roa'); }
        }
        break;
      }
    }
  }

  verify(route: Route): RouteVerdict {
    const path = [...route.path];
    let origin: RouteVerdict['origin'] = 'notFound';
    let forwarding: RouteVerdict['forwarding'] = 'uncommitted';
    const hops: RouteVerdict['hops'] = [];
    const rolesOut: RouteVerdict['roles'] = [];

    // 检索以「对象」为单位（同 AS 去重，对应 unified 的去重口径）：
    //   - origin AS：ROA / FC / ASPA / Roles 四个家族对象（4 lookup）；ROA+FC+ASPA 有签名。
    //   - 其余在途 **不同** AS：ASPA + Roles 两家族对象（2 lookup）；ASPA 有签名，Roles 无。
    const seen = new Set<Asn>();
    seen.add(path[0]);
    this.lookup();
    const originAs = this.roas.get(route.prefix);
    if (originAs !== undefined) {
      origin = originAs === route.originAs ? 'valid' : 'invalid';
      this.c.verifyOps += 1; // ROA 验签
    }
    this.lookup();
    if (this.fc.has(`${route.originAs}:${route.prefix}`)) {
      forwarding = 'committed';
      this.c.verifyOps += 1; // FC 承诺验签
    }
    const aspaCache = new Map<Asn, Set<Asn> | undefined>();
    const roleCache = new Map<Asn, Map<Asn, PeerRole> | undefined>();
    this.lookup();
    aspaCache.set(path[0], this.aspas.get(path[0]));
    if (this.aspas.has(path[0])) this.c.verifyOps += 1; // origin 的 ASPA 验签
    this.lookup();
    roleCache.set(path[0], this.roles.get(path[0]));

    for (const as of path.slice(1)) {
      if (seen.has(as)) continue;
      seen.add(as);
      this.lookup();
      aspaCache.set(as, this.aspas.get(as));
      if (this.aspas.has(as)) this.c.verifyOps += 1; // ASPA 验签
      this.lookup();
      roleCache.set(as, this.roles.get(as));
    }

    // 逐跳判定（内存内，不再计检索）：provider 授权 + 角色合规。
    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i];
      const to = path[i + 1];
      const provs = aspaCache.get(from);
      let p: RouteVerdict['hops'][number]['provider'];
      if (!provs) p = 'notFound';
      else if (provs.has(to)) p = 'valid';
      else p = 'invalid';
      hops.push({ fromAs: from, toAs: to, provider: p });
      const nbMap = roleCache.get(from);
      const role = nbMap?.get(to) ?? null;
      let compliant = true;
      if (role === 'provider') compliant = false; // 向 provider 宣告其上游路线 = 泄漏方向（简化裁决）
      rolesOut.push({ fromAs: from, toAs: to, role, compliant });
    }

    const coherent = !(forwarding === 'committed' && origin !== 'valid');
    const compliant = origin === 'valid' && forwarding === 'committed'
      && hops.every((h) => h.provider === 'valid')
      && rolesOut.every((r) => r.compliant);
    return { route, origin, hops, roles: rolesOut, forwarding, coherent, compliant };
  }

  audit(): AuditResult {
    let violations = 0;
    let scan = 0;
    // FC 记录回查 ROA 是否仍存在（缺少 = 悬空）。
    for (const key of this.fc) {
      const [, prefix] = key.split(':', 2);
      this.lookup(); scan += 1;
      if (!this.roas.has(prefix)) violations += 1;
    }
    // provider 角色回查 ASPA 是否仍存在反向授权。
    for (const [as, nb] of this.roles) {
      for (const [neighbor, role] of nb) {
        if (role === 'provider') {
          this.lookup(); scan += 1;
          const provs = this.aspas.get(neighbor);
          if (!provs || !provs.has(as)) violations += 1;
        }
      }
    }
    return { violations, auditLookups: scan };
  }

  counters(): CostCounters {
    return { ...this.c };
  }
}

/** 空的归一化意图集合。 */
export function emptyCanonical(): CanonicalIntent {
  return { origins: new Map(), providers: new Map(), roles: new Map(), forwarding: new Set() };
}
