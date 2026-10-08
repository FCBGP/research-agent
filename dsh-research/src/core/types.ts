// 阶段 1 核心领域类型（ResearchGoal / ResearchClaim / ResearchEvidence / Verdict）
// 纯数据层：不依赖 dsh 运行时，供 agent/verification 等 consumers 使用。

export type ClaimType = 'Fact' | 'Hypothesis' | 'Assumption' | 'Result' | 'Interpretation';
export type Verdict = 'verified' | 'disputed' | 'rejected' | 'pending';
export type TaskStatus = 'blocked' | 'ready' | 'running' | 'done' | 'failed';

export interface ResearchEvidence {
  claim: string;            // 证据所支持的 claim id
  source: string;           // 来源（文献/实验/推理）
  evidence: string;         // 证据内容（引用/数据/观测）
  confidence: number;       // 0..1
  verified: boolean;
  lastVerified?: string;    // ISO 时间
  relatedClaims: string[];
}

export interface CounterEvidence {
  evidence: string;
  source: string;
  againstClaim: string;
  confidence: number;
}

export interface ResearchClaim {
  id: string;
  type: ClaimType;
  statement: string;
  evidence: ResearchEvidence[];
  counterEvidence: CounterEvidence[];
  source: string;
  confidence: number;          // 合成置信度 0..1
  verificationStatus: Verdict;
  dependencies: string[];      // 依赖的其他 claim id（构成验证 DAG）
  verdictRationale?: string;
}

export interface ExperimentResult {
  experiment: string;          // 实验名/配置指纹
  claim: string;               // 被验证的 claim id
  outcome: 'support' | 'refute' | 'inconclusive';
  data: Record<string, unknown>;
  archivedAt: string;          // ISO 时间
}

export interface ResearchTask {
  id: string;
  goal: string;                // 所属 goal id
  title: string;
  kind: 'read' | 'search' | 'hypothesis' | 'experiment' | 'verify' | 'write';
  produceClaims: string[];     // 该任务产出的 claim id
  consumesClaims: string[];    // 依赖的 claim id（DAG 边）
  gain: number;                // 预估信息增益 0..1
  status: TaskStatus;
}

export interface ResearchGoal {
  id: string;
  hypothesis: string;          // 中心假设/研究问题
  tasks: ResearchTask[];       // 任务 DAG
  claims: ResearchClaim[];     // 所有 claim 的池
  experiments: ExperimentResult[];
  results: string[];           // 结论 artifact id 列表
  verification: string[];      // 验证记录
  counterexamples: string[];   // 反例 artifact id
  status: 'active' | 'done' | 'aborted';
}
