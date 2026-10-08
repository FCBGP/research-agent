// HypothesisMemory — 假设池：每条假设有生命周期与置信度历史。
// 与 ResearchClaim 关联；verification 每次给出 verdict 都追加一条历史。
import type { Verdict } from '../core/types.ts';
import type { HypothesisEntry, HypothesisStatus } from './types.ts';

let seq = 0;

export class HypothesisMemory {
  private items = new Map<string, HypothesisEntry>();

  propose(statement: string, claimId?: string): HypothesisEntry {
    seq += 1;
    const now = new Date().toISOString();
    const h: HypothesisEntry = {
      id: `h-${seq}`,
      claimId,
      statement,
      status: 'proposed',
      confidence: 0,
      history: [],
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(h.id, h);
    return h;
  }

  activate(id: string): HypothesisEntry | undefined {
    return this.update(id, { status: 'active' });
  }

  /** 记录一次验证结果：自动更新状态与置信度。 */
  recordVerdict(id: string, verdict: Verdict, { confidence, note }: { confidence?: number; note?: string } = {}): HypothesisEntry | undefined {
    const h = this.items.get(id);
    if (!h) return undefined;
    const status: HypothesisStatus =
      verdict === 'verified' ? 'supported'
      : verdict === 'rejected' ? 'refuted'
      : verdict === 'disputed' ? 'active'
      : h.status; // pending 保持现状
    return this.update(id, {
      status,
      confidence: confidence ?? h.confidence,
      history: [...h.history, { ts: new Date().toISOString(), verdict, note }],
    });
  }

  update(id: string, patch: Partial<Pick<HypothesisEntry, 'status' | 'confidence' | 'claimId' | 'history'>>): HypothesisEntry | undefined {
    const h = this.items.get(id);
    if (!h) return undefined;
    const next: HypothesisEntry = { ...h, ...patch, updatedAt: new Date().toISOString() };
    this.items.set(id, next);
    return next;
  }

  /** 当前激活中（proposed/active）的假设 —— 实验与验证的候选。 */
  active(): HypothesisEntry[] {
    return [...this.items.values()].filter((h) => h.status === 'proposed' || h.status === 'active');
  }

  byClaim(claimId: string): HypothesisEntry[] {
    return [...this.items.values()].filter((h) => h.claimId === claimId);
  }

  all(): HypothesisEntry[] {
    return [...this.items.values()];
  }
}
