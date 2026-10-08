// verification-loop — 独立验证循环：对 claim 集合批量跑证据/反证/实验三步，
// 结果写回记忆（episodic + hypothesis），并归档 verdict artifact。
import type { ResearchClaim, Verdict } from '../core/types.ts';
import { runVerification, type VerificationReport } from '../core/verification.ts';
import type { ResearchMemory } from '../memory/index.ts';
import { synthConfidence } from '../core/claim.ts';

export interface VerificationOutcome {
  claimId: string;
  verdict: Verdict;
  report: VerificationReport;
  confidence: number;
}

export function runVerificationLoop(
  memory: ResearchMemory,
  claims: ResearchClaim[],
): VerificationOutcome[] {
  const outcomes: VerificationOutcome[] = [];
  for (const c of claims) {
    const report = runVerification(c);
    const confidence = synthConfidence(c);
    outcomes.push({ claimId: c.id, verdict: report.verdict, report, confidence });

    memory.episodic.record({ kind: 'verify', summary: `${c.id}: ${report.verdict}`, claimId: c.id, outcome: report.verdict });
    for (const h of memory.hypothesis.byClaim(c.id)) {
      memory.hypothesis.recordVerdict(h.id, report.verdict, { confidence });
    }
    memory.artifact.put({
      kind: 'result',
      title: `verification: ${c.id}`,
      body: report.rationale,
      claimId: c.id,
      meta: { verdict: report.verdict, checks: report.checks, confidence },
    });
  }
  return outcomes;
}
