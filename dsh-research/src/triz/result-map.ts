// src/triz/result-map.ts — 「结果 → TRIZ 发明原理」映射（retrospective）。
//
// 需求（用户，2026-10-14）：每次研究给出的**结果**都要对应到 TRIZ 的发明原理——不只是
// research_triz 的矛盾分析（那是「事前/正演」：从矛盾推原理），还要把**已产生的结果**
// （问题、假设、claim、实验结论）映射回它体现的发明原理（「事后/反演」），并给出理由。
//
// 特征词反演的口径（2026-10-15 放宽，仍诚实标注、勿当权威转录）：
//   - didactic：前置矛盾分析（analyzeProblem，improving↔worsening → 精选矩阵/启发式）
//     命中的原理——这是「默认调 TRIZ」的入口，永远在场。
//   - retrospective：对结果文本做**特征词打分**——原理的 name/aliases（中英文）、英文
//     规范名词干、以及本模块维护的中文同义扩充表（TERM_SYNONYMS）出现在结果文本里即
//     计分，取命中且得分最高的补足；命不中就不硬凑。
//   - contradictionOrigin：矛盾来源三态标注（tool=显式参数 / extracted=文本规则提取 /
//     default=默认「改善 detection ↔ 恶化 complexity」），供面板如实展示，不冒充模型深度。
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

/** 矛盾来源标注：tool=调用方显式给了 improving/worsening；extracted=从问题/结果文本规则提取；
 *  default=两者皆无，回落「改善 detection ↔ 恶化 complexity」。 */
export type ContradictionOrigin = 'tool' | 'extracted' | 'default';

/** 一次「结果 → TRIZ 原理」映射结果。 */
export interface TrizResultMapping {
  problem: string;
  source: TrizAnalysis['source'];
  contradiction: { improving?: string; worsening?: string };
  /** 本矛盾是谁定的（显式参数 / 文本规则提取 / 默认兜底）；面板如实展示。 */
  contradictionOrigin: ContradictionOrigin;
  entries: TrizResultMappingEntry[];
}

export interface MapResultInput {
  problem: string;
  /** 前置矛盾分析（调用方经 createTrizService().analyzeProblem 造好传入）。 */
  analysis: TrizAnalysis;
  /** 结果文本：topic + 假设 + claim + 实验结论等，用于特征词打分。 */
  resultText?: string;
  /** 矛盾来源标注（service.mapResult 端到端时传入；缺省 'default'）。 */
  contradictionOrigin?: ContradictionOrigin;
}

/** 一条结果最多映射的发明原理数（didactic 优先、retrospective 补足）。 */
export const MAX_RESULT_MAPPING = 5;

/**
 * 特征词同义扩充：路由安全研究正文里常见、但不在原理规范名/别名里的表面词 → 原理号。
 * 反演是「启发式召回」：命中即给一条待核验的 retrospective 条目，not 精准断言。
 * 词按小写包含匹配，≥2 字符，避免单字误命中。
 */
const TERM_SYNONYMS: Readonly<Record<number, readonly string[]>> = {
  1: ['拆分', '分解', '细分', '粒度'],
  2: ['旁路', '旁挂', '边车', 'sidecar', '剥离'],
  3: ['差异化', '分级', '分级验证'],
  4: ['非对称'],
  5: ['联合', '复合', '组合'],
  6: ['通用', '统一'],
  7: ['嵌套', '分层', '层次化'],
  8: ['配重', '对冲', '抵消'],
  9: ['预告警', '先置'],
  10: ['预先', '预计算', '预签署', '离线预', 'precompute', 'precomputation', 'precomputed'],
  11: ['冗余', '缓冲', '后备', 'redundancy', 'backup'],
  12: ['对等', '齐平'],
  13: ['反过来', '倒置', '自证', 'reverse'],
  14: ['网状', '多归', 'multi-homing', '冗余路径'],
  15: ['动态', '自适应', 'adaptive'],
  16: ['渐进式', '增量', 'incremental'],
  17: ['多维度', '多视角'],
  18: ['抽样监测', '轮询', 'poll'],
  19: ['周期', '轮换', 'cycl', 'rotat'],
  20: ['连续', '无中断', 'continuous', '流式'],
  21: ['跳过', '绕开', 'bypass', '直达'],
  22: ['变害为利', '化敌为友', '蜜罐', 'honeypot'],
  23: ['闭环', '回授', '反馈回路', 'self-correcting'],
  24: ['缓存', '代理', '中间层', 'relay', 'proxy'],
  25: ['自愈', '自服务', 'self-healing', '自动维护'],
  26: ['影子', '镜像', '复制', 'mirror', 'shadow'],
  27: ['一次性', '短命', 'ephemeral', 'one-time'],
  28: ['替代', '替换', 'substitute'],
  29: ['松耦合', '流动'],
  30: ['薄膜', '封套', '透传', '无侵入'],
  31: ['稀疏', '抽样', '抽查', 'sample'],
  32: ['着色', '标记', '高亮', 'visualize'],
  33: ['同质', '统一接口'],
  34: ['废弃', '回收', '清理', 'purge', 'recycle'],
  35: ['参数化', '可调', 'tunable', '信誉分'],
  36: ['相变', '阈值触发', '跃变'],
  37: ['按需', '膨胀', 'scal'],
  38: ['深度检', '深检'],
  39: ['隔离', '沙箱', '黑名单', 'sandbox'],
  40: ['纵深', '多层', 'defense in depth', 'layered'],
};

/** 特征词 = 原理规范名（英文）与其别名（中文为主）；长度 ≥ 2 才参与匹配。 */
function termsOf(p: TrizPrinciple): string[] {
  return [p.name, ...p.aliases].filter((w) => w.length >= 2);
}

/** 结果文本里命中的特征词：小写包含 + 英文规范名词干 + 中文同义扩充。 */
function matchedTerms(text: string, p: TrizPrinciple): string[] {
  if (!text) return [];
  const low = text.toLowerCase();
  const hits: string[] = [];
  const push = (t: string) => { if (!hits.includes(t)) hits.push(t); };
  // 1) 规范名/别名精确子串（原逻辑）——如《TRIZ 发明原理说明》正文出现「Inversion、反向」。
  for (const t of termsOf(p)) {
    if (low.includes(t.toLowerCase())) push(t);
  }
  // 2) 英文规范名的词干（≥4 字母）：正文出现 'preliminary' 也能反演 #10 Preliminary action。
  const stems = p.name.toLowerCase().split(/[\s\-]+/).filter((w) => w.length >= 4);
  for (const s of stems) {
    if (low.includes(s) && !hits.includes(p.name)) { push(p.name); break; }
  }
  // 3) 中文同义扩充表：正文出现「预计算/闭环/旁路…」→ 对应原理。
  for (const s of TERM_SYNONYMS[p.no] ?? []) {
    if (low.includes(s.toLowerCase())) push(s);
  }
  return hits;
}

/** 将该结果映射到 TRIZ 原理：didactic 全收，retrospective 按特征词得分补足至上限。 */
export function mapResultToTriz(input: MapResultInput): TrizResultMapping {
  const { problem, analysis, resultText, contradictionOrigin = 'default' } = input;
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

  // 2) retrospective：结果文本特征词打分（name/aliases/词干/同义命中即得分，按分降序）。
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

  return { problem, source: analysis.source, contradiction, contradictionOrigin, entries };
}

/** 结果映射单条的可读渲染（供 artifact body / 面板行）。 */
export function toTrizMappingLine(e: TrizResultMappingEntry): string {
  return `[原理${e.principleNo} ${e.principleName}] ${e.reason}`;
}
