// ArtifactMemory — 产出记忆：在 ArtifactStore 之上的"召回侧"适配器。
// 提供按关键词/类型/claim 的检索式回忆，供写作与复盘直接消费。
import { ArtifactStore } from '../core/artifact-store.ts';
import type { Artifact, ArtifactKind } from '../core/artifact-store.ts';

export class ArtifactMemory {
  private store: ArtifactStore;
  constructor(store: ArtifactStore) {
    this.store = store;
  }

  put(a: Omit<Artifact, 'id' | 'createdAt' | 'archived'>): Artifact {
    return this.store.put(a);
  }

  recall(query?: string, topK = 10): Artifact[] {
    if (!query) return this.store.list().filter((a) => !a.archived).slice(-topK);
    const q = query.toLowerCase();
    return this.store
      .list()
      .filter((a) => !a.archived && `${a.title} ${a.body}`.toLowerCase().includes(q))
      .slice(-topK);
  }

  byKind(kind: ArtifactKind): Artifact[] {
    return this.store.list().filter((a) => a.kind === kind && !a.archived);
  }

  forClaim(claimId: string): Artifact[] {
    return this.store.trace(claimId);
  }

  archive(id: string): void {
    this.store.archive(id);
  }

  get store_(): ArtifactStore {
    return this.store;
  }
}
