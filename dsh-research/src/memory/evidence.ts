// EvidenceMemory — 证据台账：按 claim 组织的证据流，支持"未核验证据"召回。
// 与 claim.evidence 互为镜像：这里的重点是时间线 + 可复核（verified 灯）。
import type { EvidenceLedgerEntry } from './types.ts';

let seq = 0;

export class EvidenceMemory {
  private entries: EvidenceLedgerEntry[] = [];

  add(claimId: string, e: Omit<EvidenceLedgerEntry, 'id' | 'claimId' | 'collectedAt'>): EvidenceLedgerEntry {
    seq += 1;
    const entry: EvidenceLedgerEntry = {
      ...e,
      id: `ev-${seq}`,
      claimId,
      collectedAt: new Date().toISOString(),
    };
    this.entries.push(entry);
    return entry;
  }

  forClaim(claimId: string): EvidenceLedgerEntry[] {
    return this.entries.filter((e) => e.claimId === claimId);
  }

  /** 有待复核的证据（verified 灯未点亮）。 */
  unverified(): EvidenceLedgerEntry[] {
    return this.entries.filter((e) => !e.verified);
  }

  markVerified(id: string): EvidenceLedgerEntry | undefined {
    const e = this.entries.find((x) => x.id === id);
    if (!e) return undefined;
    e.verified = true;
    return e;
  }

  all(): EvidenceLedgerEntry[] {
    return [...this.entries];
  }
}
