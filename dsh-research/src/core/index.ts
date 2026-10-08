// dsh-research 核心领域层聚合入口。
export * from './types.ts';
export { selectNext, unlock } from './dag.ts';
export { newClaim, addEvidence, addCounterEvidence, synthConfidence } from './claim.ts';
export { runVerification } from './verification.ts';
export { ArtifactStore } from './artifact-store.ts';
