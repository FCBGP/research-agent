// EpisodicMemory — 时间线式情景记忆："我们做过什么 / 为什么"。
// 支持按 claim 追溯、按时间回溯、最近 N 条，供 agent 自省与复盘。
import type { Episode, EpisodeKind } from './types.ts';

let seq = 0;

export class EpisodicMemory {
  private episodes: Episode[] = [];

  record(partial: Omit<Episode, 'id' | 'ts'>): Episode {
    seq += 1;
    const ep: Episode = {
      ...partial,
      id: partial.meta?.episodeId as string ?? `ep-${seq}`,
      ts: new Date().toISOString(),
      meta: partial.meta ?? {},
    };
    this.episodes.push(ep);
    return ep;
  }

  recent(n = 10): Episode[] {
    return this.episodes.slice(-n).reverse();
  }

  since(iso: string): Episode[] {
    return this.episodes.filter((e) => e.ts >= iso);
  }

  forClaim(claimId: string): Episode[] {
    return this.episodes.filter((e) => e.claimId === claimId);
  }

  ofKind(kind: EpisodeKind): Episode[] {
    return this.episodes.filter((e) => e.kind === kind);
  }

  all(): Episode[] {
    return [...this.episodes];
  }
}
