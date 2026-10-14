// Artifact Store：研究产出与实验档案统一存储、可追溯、可归档。
export type ArtifactKind = 'note' | 'evidence-log' | 'experiment' | 'result' | 'report' | 'counterexample';

export interface Artifact {
  id: string;
  kind: ArtifactKind;
  title: string;
  body: string;
  claimId?: string;
  createdAt: string;
  meta: Record<string, unknown>;
  archived: boolean;
}

export class ArtifactStore {
  private items = new Map<string, Artifact>();
  private seq = 0;

  put(partial: Omit<Artifact, 'id' | 'createdAt' | 'archived'> & { createdAt?: string }): Artifact {
    this.seq += 1;
    const a: Artifact = { ...partial, id: `art-${this.seq}`, createdAt: partial.createdAt ?? new Date().toISOString(), archived: false };
    this.items.set(a.id, a);
    return a;
  }

  get(id: string): Artifact | undefined {
    return this.items.get(id);
  }

  trace(claimId: string, kind?: ArtifactKind): Artifact[] {
    return [...this.items.values()].filter((a) => a.claimId === claimId && (!kind || a.kind === kind) && !a.archived);
  }

  archive(id: string): void {
    const a = this.items.get(id);
    if (a) this.items.set(id, { ...a, archived: true });
  }

  list(): Artifact[] {
    return [...this.items.values()];
  }
}
