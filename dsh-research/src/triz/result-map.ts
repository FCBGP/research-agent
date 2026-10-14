// src/triz/result-map.ts — 「结果 → TRIZ 发明原理」映射（retrospective）。
//
// 需求（用户，2026-10-14）：每次研究给出的**结果**都要对应到 TRIZ 的发明原理——不只是
// research_triz 的矛盾分析（那是「事前/正演」：从矛盾推原理），还要把**已产生的结果**
// （问题、假设、claim、实验结论）映射回它体现的发明原理（「事后/反演」），并给出理由。
//
// 口径（诚实标注，勿当权威转录）：
//   - didactic：前置矛盾分析（analyzeProblem，improving↔worsening → 精选矩阵/启发式）
//     命中的原理——这是「默认调 TRIZ」的入口，永远在场。
//   - retrospective：对结果文本做**特征词打分**——原理的 name/aliases（中英文）出现在
//     结果文本里即计分，取命中且得分最高的补足；命不中就不硬凑。
//   - 输出全部是**待核验 Hypothesis（source=triz, confidence=0.5）**：mapping 只是研究
//     取证的灵感层，须经 research_verify / research_campaign 验证后才成为结论。
//
// 纯函数、确定性、可测；TrizAnalysis 由调用方（service/autonomous/工具）先通过
// analyzeProblem 造出再传入，避免与 index.ts 循环依赖。
import { TRIZ_PRINCIPLES, type TrizPrinciple } from './data.ts';
import type { TrizAnalysis } from './index.ts';

/** 结果映射里一条「原理 ↔ 结果」对应。 */
export interface TrizResultMappingEntry {
  principleNo: number;
  principleName: string;
  /** didactic = 矛盾分析正演命中；retrospective = 结果文本特征词反演命中。 */
  kind: 'didactic' | 'retrospective';
  /** 该结果为何对应此原理的一句理由。 */
  reason: string;
}

/** 一次「结果 → TRIZ 原理」映射结果。 */
export interface TrizResultMapping {
  problem: string;
  source: TrizAnalysis['source'];
  contradiction: { improving?: string; worsening?: string };
  entries: TrizResultMappingEntry[];
}

export interface MapResultInput {
  problem: string;
  /** 前置矛盾分析（调用方经 createTrizService().analyzeProblem 造好传入）。 */
  analysis: TrizAnalysis;
  /** 结果文本：topic + 假设 + claim + 实验结论等，用于特征词打分。 */
  resultText?: string;
}

/** 一条结果最多映射的发明原理数（didactic 优先、retrospective 补足）。 */
export const MAX_RESULT_MAPPING = 5;

const PRINCIPLE_BY_NO = new Map<number, TrizPrinciple>(TRIZ_PRINCIPLES.map((p) => [p.no, p]));

/** 特征词 = 原理规范名（英文）与其别名（中文为主）；长度 ≥ 2 才参与匹配。 */
function termsOf(p: TrizPrinciple): string[] {
  return [p.name, ...p.aliases].filter((w) => w.length >= 2);
}

/** 结果文本里命中的特征词（小写 ASCII 精确包含、中文子串匹配）。 */
function matchedTerms(text: string, p: TrizPrinciple): string[] {
  if (!text) return [];
  const low = text.toLowerCase();
  return termsOf(p).filter((w) => low.includes(w.toLowerCase()));
}

/** 将该结果映射到 TRIZ 原理：didactic 全收，retrospective 按特征词得分补足至上限。 */
export function mapResultToTriz(input: MapResultInput): TrizResultMapping {
  const { problem, analysis, resultText } = input;
  const entries: TrizResultMappingEntry[] = [];
  const seen = new Set<number>();
  const contradiction = {
    improving: analysis.contradiction.improving?.name,
    worsening: analysis.contradiction.worsening?.name,
  };

  // 1) didactic：矛盾分析命中的候选原理（默认 TRIZ 入口，永远在场）。
  for (const p of analysis.candidates) {
    if (entries.length >= MAX_RESULT_MAPPING) break;
    if (seen.has(p.no)) continue;
    seen.add(p.no);
    entries.push({
      principleNo: p.no,
      principleName: p.name,
      kind: 'didactic',
      reason: `矛盾分析（改善「${contradiction.improving ?? '—'}」↔ 恶化「${contradiction.worsening ?? '—'}」）命中 #${p.no}：${p.routingHint}`,
    });
  }

  // 2) retrospective：结果文本特征词打分（name/aliases 命中即得分，按分降序）。
  if (entries.length < MAX_RESULT_MAPPING && resultText) {
    const scored = TRIZ_PRINCIPLES
      .map((p) => ({ p, terms: matchedTerms(resultText, p), score: matchedTerms(resultText, p).length }))
      .filter((x) => x.score > 0 && !seen.has(x.p.no))
      .sort((a, b) => b.score - a.score || a.p.no - b.p.no);
    for (const { p, terms } of scored) {
      if (entries.length >= MAX_RESULT_MAPPING) break;
      seen.add(p.no);
      entries.push({
        principleNo: p.no,
        principleName: p.name,
        kind: 'retrospective',
        reason: `结果文本出现原理 #${p.no} 特征词「${terms.join('、')}」，与 ${p.name}（${p.summary}）方向一致：${p.routingHint}`,
      });
    }
  }

  return { problem, source: analysis.source, contradiction, entries };
}

/** 结果映射单条的可读渲染（供 artifact body / 面板行）。 */
export function toTrizMappingLine(e: TrizResultMappingEntry): string {
  return `[原理${e.principleNo} ${e.principleName}] ${e.reason}`;
}
