// Verification Loop：Evidence Check / Counter Search / Experiment Test → verdict
import type { ExperimentResult, ResearchClaim, Verdict } from './types.ts';

export interface VerificationReport {
  verdict: Verdict;
  rationale: string;
  checks: string[];
}

export function runVerification(claim: ResearchClaim, exp?: ExperimentResult): VerificationReport {
  const checks: string[] = [];
  // 1) Evidence Check
  const ev = claim.evidence.filter((e) => e.verified);
  checks.push(`evidence: ${ev.length}/${claim.evidence.length} verified`);
  // 2) Counter Search
  const strongCounter = claim.counterEvidence.find((c) => c.confidence >= 0.6);
  checks.push(`counter: ${strongCounter ? 'found(strong)' : claim.counterEvidence.length > 0 ? 'found(weak)' : 'none'}`);
  // 3) Experiment Test
  const out = exp?.outcome ?? 'inconclusive';
  checks.push(`experiment: ${out}`);

  let verdict: Verdict;
  let rationale: string;
  if (out === 'refute') {
    verdict = 'rejected';
    rationale = `实验证伪：${exp!.experiment} 反证 claim（${claim.id}）`;
  } else if (strongCounter) {
    verdict = 'disputed';
    rationale = `存在高置信反证（${strongCounter.source}），claim 存疑`;
  } else if (ev.length === 0 || claim.evidence.length === 0) {
    verdict = 'disputed';
    rationale = '无可靠证据支撑，暂不能判定';
  } else if (out === 'support') {
    verdict = 'verified';
    rationale = `证据（${ev.length}条已核验）且实验支持`;
  } else {
    verdict = 'disputed';
    rationale = '证据不足或实验无结论，需进一步验证';
  }
  return { verdict, rationale, checks };
}
