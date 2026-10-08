// SemanticMemory — 已确认事实（三元组）的语义索引，可做关键词召回。
// 定位：把"已核验 claim"归纳为可检索的领域知识，供检索/阅读/推理复用。
import type { SemanticFact } from './types.ts';

let seq = 0;

export class SemanticMemory {
  private facts = new Map<string, SemanticFact>();

  put(f: Omit<SemanticFact, 'id' | 'updatedAt'>): SemanticFact {
    seq += 1;
    const fact: SemanticFact = { ...f, id: f.id ?? `fact-${seq}`, updatedAt: new Date().toISOString() };
    this.facts.set(fact.id, fact);
    return fact;
  }

  /** 关键词召回：匹配 subject/predicate/object 或溯源 claim id。 */
  query(text: string, topK = 10): SemanticFact[] {
    const terms = tokenize(text);
    const scored = [...this.facts.values()].map((f) => {
      const hay = `${f.subject} ${f.predicate} ${f.object} ${f.sourceClaims.join(' ')}`.toLowerCase();
      const hits = terms.filter((t) => hay.includes(t)).length;
      return { f, score: hits === 0 ? 0 : hits / terms.length + f.confidence * 0.1 };
    });
    return scored
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((x) => x.f);
  }

  bySubject(subject: string): SemanticFact[] {
    return [...this.facts.values()].filter((f) => f.subject.toLowerCase() === subject.toLowerCase());
  }

  /** 从已核验 claim 归纳事实（由调用方给出 subject/predicate/object 组件）。 */
  digest(claimId: string, subject: string, predicate: string, object: string): SemanticFact {
    return this.put({ subject, predicate, object, sourceClaims: [claimId], confidence: 1, verified: true });
  }

  all(): SemanticFact[] {
    return [...this.facts.values()];
  }
}

export function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, ' ').split(/\s+/).filter(Boolean);
}
