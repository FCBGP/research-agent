// LiteratureAgent — RPKI/BGPsec 文献检索与阅读辅助。
//
// 设计：本地语料库（corpus）+ 关键词/词频打分，零外部依赖；
// 检索结果可落 EpisodicMemory，命中文献可沉淀为 SemanticFact。
// 需要联网搜索时，实现 LiteratureSource 接口注入（例如把某搜索 API
// 包装成 source），本 agent 结构不变 —— 只消费公开 seam。
import { tokenize } from '../memory/semantic.ts';
import type { EpisodicMemory } from '../memory/episodic.ts';
import type { SemanticMemory } from '../memory/semantic.ts';

export interface PaperRef {
  id: string;
  title: string;
  authors: string[];
  year: number;
  venue: string;
  abstract: string;
  keywords: string[];
  url?: string;
}

export interface SearchHit {
  paper: PaperRef;
  score: number;
}

/** 可插拔检索源：默认本地语料；也可对接真实检索。 */
export interface LiteratureSource {
  search(query: string, topK?: number): SearchHit[];
}

/** 本地语料：词频 + 关键词加权召回。 */
export class LocalCorpusSource implements LiteratureSource {
  private corpus: PaperRef[];
  constructor(corpus: PaperRef[]) {
    this.corpus = corpus;
  }

  search(query: string, topK = 5): SearchHit[] {
    const q = tokenize(query);
    if (q.length === 0) return [];
    return this.corpus
      .map((p) => {
        const hay = tokenize(`${p.title} ${p.abstract} ${p.keywords.join(' ')}`);
        let hits = 0;
        for (const t of q) if (hay.includes(t)) hits += 1;
        const kwHit = p.keywords.some((k) => q.includes(k.toLowerCase()));
        const score = hits / q.length + (kwHit ? 0.2 : 0) + p.year / 100000;
        return { paper: p, score };
      })
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  get size(): number {
    return this.corpus.length;
  }
}

export class LiteratureAgent {
  private source: LiteratureSource;
  private epochs?: EpisodicMemory;
  private semantic?: SemanticMemory;
  constructor(source: LiteratureSource, epochs?: EpisodicMemory, semantic?: SemanticMemory) {
    this.source = source;
    this.epochs = epochs;
    this.semantic = semantic;
  }

  search(query: string, topK = 5): SearchHit[] {
    const hits = this.source.search(query, topK);
    this.epochs?.record({ kind: 'search', summary: `检索: ${query}`, source: 'literature', outcome: `${hits.length} 条命中`, meta: { query, hits: hits.length } });
    return hits;
  }

  /** 把一篇文献的"要旨"沉淀为语义事实（供后续检索/推理复用）。 */
  absorb(paper: PaperRef, claimId: string): void {
    if (!this.semantic) return;
    const subject = paper.keywords[0] ?? paper.title;
    this.semantic.put({
      subject,
      predicate: 'reported-in',
      object: paper.title,
      sourceClaims: [claimId],
      confidence: 0.9,
      verified: true,
    });
  }


}
