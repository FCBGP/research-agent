// ResearchMemory — 五类记忆的门面（facade）+ 可选 JSON 持久化。
//   semantic    ：我们知道什么（已确认事实三元组）
//   episodic    ：我们做过什么（事件时间线）
//   artifact    ：我们产出过什么（检索式回忆）
//   hypothesis  ：我们在验证什么（假设生命周期）
//   evidence    ：证据是什么（按 claim 的证据台账）
// 默认全部在内存；给 dir 时可 loadFrom()/persist() 落盘，零外部依赖（纯 fs）。
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { ArtifactMemory } from './artifact.ts';
import { EpisodicMemory } from './episodic.ts';
import { EvidenceMemory } from './evidence.ts';
import { HypothesisMemory } from './hypothesis.ts';
import { SemanticMemory } from './semantic.ts';
import { ArtifactStore } from '../core/artifact-store.ts';

export interface ResearchMemory {
  semantic: SemanticMemory;
  episodic: EpisodicMemory;
  artifact: ArtifactMemory;
  hypothesis: HypothesisMemory;
  evidence: EvidenceMemory;
  /** 可选持久化：dir 缺省用构造时配置（plugin-core 提供 memory.dir 时挂上）；
   *  纯内存 memory（createMemory()）无此方法，保持默认全内存行为。 */
  persist?(dir?: string): string | undefined;
}

export function createMemory(store?: ArtifactStore): ResearchMemory {
  // 外部注入 store（plugin-core 传入与 core.artifacts 同一个 ArtifactStore）：
  // 则 memory.artifact（persistMemory 序列化的唯一 artifact 源）与 core.artifacts
  // （research_triz 工具 / triz-auto 写 note 的地方）共用同一存储，persist 即覆盖
  // TRIZ 分析记录；缺省自建私有 store（全内存，行为与历史一致）。
  const artifacts = store ?? new ArtifactStore();
  return {
    semantic: new SemanticMemory(),
    episodic: new EpisodicMemory(),
    artifact: new ArtifactMemory(artifacts),
    hypothesis: new HypothesisMemory(),
    evidence: new EvidenceMemory(),
  };
}

export const MEMORY_KEYS = ['semantic', 'episodic', 'artifact', 'hypothesis', 'evidence'] as const;
/** 落盘临时基座：Memory 内的 ArtifactStore 也一起序列化。 */
export function persistMemory(m: ResearchMemory, dir: string): string {
  mkdirSync(dir, { recursive: true });
  const file = `${dir}/research-memory.json`;
  const artifactStore = m.artifact.store_;
  const snapshot = {
    semantic: m.semantic.all(),
    episodic: m.episodic.all(),
    evidence: m.evidence.all(),
    hypothesis: m.hypothesis.all(),
    artifacts: artifactStore.list(),
  };
  writeFileSync(file, JSON.stringify(snapshot, null, 2), 'utf8');
  return file;
}

export function loadMemoryInto(m: ResearchMemory, dir: string): void {
  const file = `${dir}/research-memory.json`;
  if (!existsSync(file)) return;
  const s = JSON.parse(readFileSync(file, 'utf8')) as {
    semantic?: Parameters<SemanticMemory['put']>[0][];
    episodic?: Parameters<EpisodicMemory['record']>[0][];
    evidence?: Parameters<EvidenceMemory['add']>[1][];
    hypothesis?: HypothesisEntriesSnapshot;
    artifacts?: ArtifactPatch[];
  };
  for (const f of s.semantic ?? []) m.semantic.put(f);
  for (const e of s.episodic ?? []) m.episodic.record(e as Parameters<EpisodicMemory['record']>[0]);
  for (const e of s.evidence ?? []) m.evidence.add(e.claimId, e as Parameters<EvidenceMemory['add']>[1]);
  for (const h of s.hypothesis ?? []) {
    const created = m.hypothesis.propose(h.statement, h.claimId);
    m.hypothesis.update(created.id, { status: h.status, confidence: h.confidence, history: h.history });
  }
  for (const a of s.artifacts ?? []) {
    m.artifact.put({ kind: a.kind, title: a.title, body: a.body, claimId: a.claimId ?? undefined, meta: a.meta ?? {} });
  }
}

type HypothesisEntriesSnapshot = Array<{ statement: string; claimId?: string; status: import('./types.ts').HypothesisStatus; confidence: number; history: import('./types.ts').HypothesisEntry['history'] }>;
type ArtifactPatch = { kind: import('../core/artifact-store.ts').ArtifactKind; title: string; body: string; claimId?: string; meta?: Record<string, unknown> };

export * from './types.ts';
export { SemanticMemory } from './semantic.ts';
export { EpisodicMemory } from './episodic.ts';
export { EvidenceMemory } from './evidence.ts';
export { HypothesisMemory } from './hypothesis.ts';
export { ArtifactMemory } from './artifact.ts';
