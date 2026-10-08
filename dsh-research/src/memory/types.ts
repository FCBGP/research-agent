// Research Memory — 五类记忆的类型定义（纯数据层，零外部依赖）。
// Semantic / Episodic / Artifact / Hypothesis / Evidence 分别回答：
//   "我们知道什么 / 我们做过什么 / 我们产出过什么 / 我们在验证什么 / 证据是什么"。
import type { Verdict } from '../core/types.ts';

/** 语义记忆：已确认（或高置信）的事实三元组 + 到 claim 的溯源。 */
export interface SemanticFact {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  sourceClaims: string[];   // 溯源：由哪些 claim 归纳而来
  confidence: number;       // 0..1
  verified: boolean;
  updatedAt: string;        // ISO
}

/** 情景记忆：一次可追溯的事件/活动。 */
export type EpisodeKind =
  | 'search' | 'read' | 'synthesize'
  | 'hypothesis' | 'experiment' | 'verify'
  | 'decision' | 'note';

export interface Episode {
  id: string;
  ts: string;               // ISO
  kind: EpisodeKind;
  summary: string;
  claimId?: string;
  source?: string;          // 文献/实验/推理
  outcome?: string;
  meta?: Record<string, unknown>;
}

/** 假设记忆：假设生命周期（提出 → 激活 → 支持/证伪/放弃）。 */
export type HypothesisStatus = 'proposed' | 'active' | 'supported' | 'refuted' | 'abandoned';

export interface HypothesisEntry {
  id: string;
  claimId?: string;         // 关联的 ResearchClaim
  statement: string;
  status: HypothesisStatus;
  confidence: number;       // 当前合成置信度
  history: Array<{ ts: string; verdict: Verdict; note?: string }>;
  createdAt: string;
  updatedAt: string;
}

/** 证据记忆：按 claim 组织的证据台账（与 claim.evidence 互为镜像）。 */
export interface EvidenceLedgerEntry {
  id: string;
  claimId: string;
  source: string;
  evidence: string;
  confidence: number;
  verified: boolean;
  collectedAt: string;      // ISO
}
