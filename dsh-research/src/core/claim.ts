// ResearchClaim / ResearchEvidence 的构造与置信度合成。
import type { CounterEvidence, ResearchClaim, ResearchEvidence } from './types.ts';

let seq = 0;
export function newClaim(
  c: Pick<ResearchClaim, 'statement' | 'type' | 'source'> &
    Partial<Omit<ResearchClaim, 'statement' | 'type' | 'source' | 'id'>>,
): ResearchClaim {
  seq += 1;
  return {
    id: c.id ?? `c-${seq}`,
    statement: c.statement,
    type: c.type,
    source: c.source,
    evidence: c.evidence ?? [],
    counterEvidence: c.counterEvidence ?? [],
    confidence: c.confidence ?? 0,
    verificationStatus: c.verificationStatus ?? 'pending',
    dependencies: c.dependencies ?? [],
  };
}

export function addEvidence(claim: ResearchClaim, ev: Omit<ResearchEvidence, 'claim'>): ResearchClaim {
  return { ...claim, evidence: [...claim.evidence, { ...ev, claim: claim.id, verified: ev.verified, lastVerified: ev.lastVerified ?? new Date().toISOString() }] };
}

export function addCounterEvidence(claim: ResearchClaim, ce: CounterEvidence): ResearchClaim {
  return { ...claim, counterEvidence: [...claim.counterEvidence, ce] };
}

// 合成置信度：证据按来源加权取均值，反证按系数压制。
export function synthConfidence(claim: ResearchClaim): number {
  const totalW = 0;
  let w = 0;
  let s = 0;
  for (const e of claim.evidence) {
    const wt = 1 + (e.confidence > 0.7 ? 1 : 0); // 高置信证据更高权重
    w += wt;
    s += wt * e.confidence;
  }
  const base = w === 0 ? 0 : s / w;
  const ce = claim.counterEvidence;
  const penalty = ce.length === 0 ? 0 : Math.max(...ce.map((x) => x.confidence)) * 0.5;
  return Math.max(0, Math.min(1, base - penalty));
}
