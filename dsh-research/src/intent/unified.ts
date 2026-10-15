// src/intent/unified.ts — H-UNI 统一仓库：每个 AS 一张「单一意图对象」，四类面共居一对象。
//
// 口径：
//   - 每 AS 一个 AsIntent 对象（origin 面按该 AS 宣告的前缀、provider 面、role 面、forwarding 面
//     都在同一对象内），单版本、单签名；任何变更 = 1 write + 1 signOp（原子，无写放大）。
//   - 验证一条路由 = 对路径上每个**不同** AS 检索其对象（1 lookup + 1 验签，若对象存在），
//     全部面在同一对象内内存判定（不再按面分次检索）——origin/FC/provider/role 一并裁决。
//   - audit = 每对象 1 次读出后在对象内部做跨面一致核查（不跨家族 join）。
//   与分散基线（dispersed.ts）用同一 IntentRepo 接口与同一事件脚本，保证对比只差「分库 vs 合一」。
import { zeroCounters, type Asn, type PeerRole, type CostCounters, type CanonicalIntent,
  type Route, type RouteVerdict, type AuditResult, type IntentRepo, type IntentEvent } from './types.ts';

/** 单一 AS 意图对象：四类面共居。 */
export interface AsIntentObject {
  as: Asn;
  /** origin 面：本 AS 被授权起源的前缀 → 记录「声明起源」固定为自己的 ASN。 */
  origins: Map<string, Asn>;
  /** provider 面：本 AS 的上游授权集合。 */
  providers: Set<Asn>;
  /** role 面：neighbor -> 对等角色。 */
  roles: Map<Asn, PeerRole>;
  /** forwarding 面：本 AS 声明转发承诺的前缀。 */
  forwarding: Set<string>;
}

/** 统一仓库：ASN -> 单一意图对象。 */
export class UnifiedRepo implements IntentRepo {
  private readonly objs = new Map<Asn, AsIntentObject>();
  private readonly c = zeroCounters();

  private write(): void { this.c.writes += 1; this.c.signOps += 1; }
  private lookup(): void { this.c.lookups += 1; }

  /** 取/建某 AS 的对象（可写路径）。 */
  private obj(as: Asn, create: boolean): AsIntentObject | undefined {
    let o = this.objs.get(as);
    if (!o && create) { o = { as, origins: new Map(), providers: new Set(), roles: new Map(), forwarding: new Set() }; this.objs.set(as, o); }
    return o;
  }

  /** 若对象为空则移除（保持快照精简）。 */
  private prune(as: Asn): void {
    const o = this.objs.get(as);
    if (o && o.origins.size === 0 && o.providers.size === 0 && o.roles.size === 0 && o.forwarding.size === 0) {
      this.objs.delete(as);
    }
  }

  snap(): CanonicalIntent {
    const origins = new Map<string, Asn>();
    const providers = new Map<Asn, Set<Asn>>();
    const roles = new Map<Asn, Map<Asn, PeerRole>>();
    const forwarding = new Set<string>();
    for (const o of this.objs.values()) {
      for (const [prefix, origin] of o.origins) origins.set(prefix, origin);
      if (o.providers.size > 0) providers.set(o.as, new Set(o.providers));
      if (o.roles.size > 0) roles.set(o.as, new Map(o.roles));
      for (const p of o.forwarding) forwarding.add(`${o.as}:${p}`);
    }
    return { origins, providers, roles, forwarding };
  }

  seedFrom(canonical: CanonicalIntent): void {
    for (const [prefix, origin] of canonical.origins) { const o = this.obj(origin, true) as AsIntentObject; o.origins.set(prefix, origin); this.write(); }
    for (const [as, set] of canonical.providers) { const o = this.obj(as, true) as AsIntentObject; for (const p of set) o.providers.add(p); this.write(); }
    for (const [as, nb] of canonical.roles) { const o = this.obj(as, true) as AsIntentObject; for (const [n, r] of nb) o.roles.set(n, r); this.write(); }
    for (const key of canonical.forwarding) { const [as, prefix] = key.split(':', 2); const o = this.obj(Number(as), true) as AsIntentObject; o.forwarding.add(prefix); this.write(); }
  }

  apply(event: IntentEvent): void {
    // 统一对象每次事件至多 1 次对象写：变更是原子的——failAfterWrite>=1 全量生效（无部分窗口），
    // failAfterWrite=0 则整票不生效（未应用，无漂移）。
    const cap = event.failAfterWrite ?? 1;
    if (cap < 1) return;
    switch (event.kind) {
      case 'addProvider': { const o = this.obj(event.as, true) as AsIntentObject; o.providers.add(event.provider); this.write(); this.prune(event.as); break; }
      case 'removeProvider': { const o = this.obj(event.as, false); if (o) { o.providers.delete(event.provider); this.write(); this.prune(event.as); } break; }
      case 'addRole': { const o = this.obj(event.as, true) as AsIntentObject; o.roles.set(event.neighbor, event.role); this.write(); this.prune(event.as); break; }
      case 'removeRole': { const o = this.obj(event.as, false); if (o) { o.roles.delete(event.neighbor); this.write(); this.prune(event.as); } break; }
      case 'splitPrefix': {
        // 只更新**起源 AS** 的对象（若存在该前缀）：原子改两个面（origin 新前缀 + forwarding 新前缀）。
        let touched = false;
        for (const o of this.objs.values()) {
          if (o.origins.has(event.oldPrefix)) {
            o.origins.set(event.newPrefix, o.as); o.origins.delete(event.oldPrefix); touched = true;
            if (o.forwarding.has(event.oldPrefix)) { o.forwarding.delete(event.oldPrefix); o.forwarding.add(event.newPrefix); }
          }
        }
        if (touched) this.write();
        break;
      }
      case 'addForwarding': { const o = this.obj(event.as, true) as AsIntentObject; o.forwarding.add(event.prefix); this.write(); this.prune(event.as); break; }
      case 'revokeAll': {
        const o = this.obj(event.as, false);
        if (o) { this.objs.delete(event.as); this.write(); }
        // 其他 AS 的 roles 若引用该 AS，一并清理（仍在一对象内原子完成）。
        let extra = false;
        for (const other of this.objs.values()) { if (other.roles.delete(event.as)) extra = true; }
        if (extra) this.write();
        break;
      }
    }
  }

  verify(route: Route): RouteVerdict {
    const path = [...route.path];
    const seen = new Set<Asn>();
    let origin: RouteVerdict['origin'] = 'notFound';
    let forwarding: RouteVerdict['forwarding'] = 'uncommitted';
    const hops: RouteVerdict['hops'] = [];
    const rolesOut: RouteVerdict['roles'] = [];

    for (let i = 0; i < path.length; i++) {
      const as = path[i];
      if (seen.has(as)) continue;
      seen.add(as);
      // 每 AS 单次对象检索（1 lookup + 1 验签若存在）——所有面一次取齐。
      this.lookup();
      const o = this.objs.get(as);
      if (!o) continue;
      this.c.verifyOps += 1;
      if (i === 0) {
        const declared = o.origins.get(route.prefix);
        origin = declared === undefined ? 'notFound' : (declared === route.originAs ? 'valid' : 'invalid');
        forwarding = o.forwarding.has(route.prefix) ? 'committed' : 'uncommitted';
      }
    }
    // 面内判定（不增加检索）：
    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i]; const to = path[i + 1];
      const oFrom = this.objs.get(from);
      let p: RouteVerdict['hops'][number]['provider'];
      if (!oFrom || oFrom.providers.size === 0) p = 'notFound';
      else if (oFrom.providers.has(to)) p = 'valid';
      else p = 'invalid';
      hops.push({ fromAs: from, toAs: to, provider: p });
      const role = oFrom?.roles.get(to) ?? null;
      const compliant = role !== 'provider';
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
    for (const o of this.objs.values()) {
      this.lookup(); scan += 1;
      // 对象内一致核查（不跨家族 join，因四面共居单对象）：
      // ① 声明邻居为 provider 又同时列其为上游授权 → 自相矛盾（violation）。
      // ② forwarding 承诺的前缀必须在本对象 origin 面存在（不能承诺未受权前缀）→ 否则 violation。
      for (const [neighbor, role] of o.roles) {
        if (role === 'provider' && o.providers.has(neighbor)) violations += 1;
      }
      for (const pf of o.forwarding) {
        if (!o.origins.has(pf)) violations += 1;
      }
    }
    return { violations, auditLookups: scan };
  }

  counters(): CostCounters {
    return { ...this.c };
  }
}
