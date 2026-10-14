// src/triz/index.ts — TRIZ 分析引擎 + ResearchTrizService（host 插件 research-triz 消费）。
//
// 三件套（对应 skills/triz/SKILL.md 的流程）：
//   1. analyzeProblem    —— 把研究问题形式化为「改善参数 ↔ 恶化参数」的技术矛盾，
//                           查精选矛盾矩阵（或启发式兜底）得出候选发明原理。
//   2. idealityFraming   —— Ideal Final Result（理想解）建模：不新增机制/开销/攻击面
//                           的前提下目标自动达成；列出需消除的有害作用与可用资源。
//   3. toHypotheses      —— 把候选原理翻译成路由安全**机制方向假说**（type=Hypothesis，
//                           待研究/实验核验，不做事实断言——与 Research Agent Policy 一致）。
//
// 服务方法均为纯函数/可测；plugin-triz.ts 只负责 ctx.provide('researchTriz', …)。

import {
  TRIZ_PRINCIPLES,
  TRIZ_PARAMETERS,
  ROUTING_PARAMETER_ALIASES,
  TRIZ_CURATED_MATRIX,
  HEURISTIC_PRINCIPLES_BY_PARAMETER,
  STARTER_PRINCIPLES,
  type TrizPrinciple,
} from './data.ts';
import { mapResultToTriz, type TrizResultMapping } from './result-map.ts';

/** 单一分离原理条目。 */
export interface SeparationPrinciple {
  type: '空间' | '时间' | '条件' | '系统级';
  hint: string;
}

/** 技术系统进化法则的一则。 */
export interface EvolutionLaw {
  law: string;
  hint: string;
}

/** 矛盾分析结果：解析的参数 + 候选原理 + 来源标注 + 分离/进化视角。 */
export interface TrizAnalysis {
  problem: string;
  contradiction: {
    improving?: TrizParameter;
    worsening?: TrizParameter;
  };
  /** curated-matrix（命中精选矩阵）/ heuristic-fallback（启发式兜底）/ unresolved（参数未解析）。 */
  source: 'curated-matrix' | 'heuristic-fallback' | 'unresolved';
  candidates: TrizPrinciple[];
  separation: SeparationPrinciple[];
  evolution: EvolutionLaw[];
}

/** 一条 TRIZ 派生研究假说（type=Hypothesis，待核验）。 */
export interface TrizHypothesis {
  id: string;
  statement: string;
  mechanism: string;
  principleNo: number;
  principleName: string;
  contradiction: string;
  type: 'Hypothesis';
  source: 'triz';
  confidence: number;
}

/** research_triz 工具的输入形状。 */
export interface TrizAnalyzeInput {
  problem: string;
  improving?: string;
  worsening?: string;
}

/** 理想解建模输出。 */
export interface IdealityFrame {
  problem: string;
  /** Ideal Final Result 表述。 */
  ifr: string;
  /** 需要消除的有害作用。 */
  harms: string[];
  /** 可借用的现成资源（超系统/子系统/时间维度）。 */
  resources: string[];
  /** 增益放大方向。 */
  benefits: string[];
}

/** host 插件提供的 TRIZ 服务（ctx.provide('researchTriz', …)）。 */
export interface ResearchTrizService {
  analyzeProblem(input: TrizAnalyzeInput): TrizAnalysis;
  idealityFraming(input: { problem: string }): IdealityFrame;
  toHypotheses(analysis: TrizAnalysis): TrizHypothesis[];
  /** 「结果 → TRIZ 发明原理」映射（默认先做矛盾分析，再把结果文本特征词反演补足）。 */
  mapResult(input: TrizAnalyzeInput & { resultText?: string }): TrizResultMapping;
}

const PRINCIPLE_BY_NO = new Map<number, TrizPrinciple>(TRIZ_PRINCIPLES.map((p) => [p.no, p]));
const PARAMETER_BY_NO = new Map<number, TrizParameter>(TRIZ_PARAMETERS.map((p) => [p.no, p]));

/** 解析 improving/worsening 字符串 → 技术参数：先精确匹配参数名，再打别名表，再模糊包含。 */
export function resolveParameter(text: string | undefined): TrizParameter | undefined {
  if (!text) return undefined;
  const t = text.trim();
  if (!t) return undefined;
  const low = t.toLowerCase();
  // 1) 精确匹配规范参数名（含 '-' 转空格）
  const exact = TRIZ_PARAMETERS.find((p) => p.name.toLowerCase() === low || p.name.toLowerCase().replace(/-/g, ' ') === low);
  if (exact) return exact;
  // 2) 别名表精确匹配
  if (ROUTING_PARAMETER_ALIASES[low] !== undefined) return PARAMETER_BY_NO.get(ROUTING_PARAMETER_ALIASES[low]);
  // 3) 包含匹配（参数名或别名键）
  for (const [alias, no] of Object.entries(ROUTING_PARAMETER_ALIASES)) {
    if (low.includes(alias)) return PARAMETER_BY_NO.get(no);
  }
  const partial = TRIZ_PARAMETERS.find((p) => p.name.toLowerCase().includes(low.split(/\s+/)[0]) && low.length >= 4);
  return partial;
}

/** 对给定 (improve, worsen) 求候选原理编号，标注来源。 */
export function principlesFor(
  improve: TrizParameter | undefined,
  worsen: TrizParameter | undefined,
): { principles: number[]; source: TrizAnalysis['source'] } {
  if (improve && worsen) {
    const cell = TRIZ_CURATED_MATRIX.find((c) => c.improve === improve.no && c.worsen === worsen.no);
    if (cell) return { principles: cell.principles, source: 'curated-matrix' };
    // 任意一个方向命中也用启发式（按惡化参数取交集）
    const worsenHits = HEURISTIC_PRINCIPLES_BY_PARAMETER[worsen.no];
    const improveHits = HEURISTIC_PRINCIPLES_BY_PARAMETER[improve.no];
    const merged = [...new Set([...(worsenHits ?? []), ...(improveHits ?? [])])];
    return { principles: merged.length ? merged : STARTER_PRINCIPLES, source: 'heuristic-fallback' };
  }
  if (improve) {
    const hits = HEURISTIC_PRINCIPLES_BY_PARAMETER[improve.no];
    return { principles: hits ?? STARTER_PRINCIPLES, source: hits ? 'heuristic-fallback' : 'unresolved' };
  }
  if (worsen) {
    const hits = HEURISTIC_PRINCIPLES_BY_PARAMETER[worsen.no];
    return { principles: hits ?? STARTER_PRINCIPLES, source: hits ? 'heuristic-fallback' : 'unresolved' };
  }
  return { principles: STARTER_PRINCIPLES, source: 'unresolved' };
}

/** 分离原理推荐：按矛盾主题给一组（含默认视角）。 */
export function separationFor(improve?: TrizParameter, worsen?: TrizParameter): SeparationPrinciple[] {
  const set = new Set<string>();
  const out: SeparationPrinciple[] = [];
  const push = (type: SeparationPrinciple['type'], hint: string) => {
    if (set.has(type)) return;
    set.add(type);
    out.push({ type, hint });
  };
  const names = [improve?.name ?? '', worsen?.name ?? ''].join(' ').toLowerCase();
  if (names.includes('time') || names.includes('speed')) push('时间', '关键验证/事件响应在关键时窗内做，平时低开销异步化（分时复用）。');
  if (names.includes('harmful') || names.includes('detect') || names.includes('measure')) push('空间', '把安全关键路径与普通路径、控制面与数据面分离，隔离攻击面。');
  if (names.includes('adapt') || names.includes('stability')) push('条件', '按条件/上下文切换验证策略（威胁等级、对等体可信度、前缀关键度）。');
  if (names.includes('complex') || names.includes('automation')) push('系统级', '在系统层级拆分矛盾：逐跳 vs 端到端验证分工，子系统各用不同的局部实现。');
  if (out.length === 0) {
    push('空间', '默认视角：把高保障部分与低保障部分在空间上分离（分区/隔离）。');
    push('时间', '把昂贵操作移到非关键时窗（预计算/异步/周期化）。');
  }
  return out;
}

/** 技术进化法则视角（给分析补演化方向提示）。 */
export function evolutionFor(improve?: TrizParameter, worsen?: TrizParameter): EvolutionLaw[] {
  const out: EvolutionLaw[] = [];
  const names = [improve?.name ?? '', worsen?.name ?? ''].join(' ').toLowerCase();
  if (names.includes('complex') || names.includes('automation')) {
    out.push({ law: '向超系统迁移', hint: '单 AS 级机制成本高 → 考虑全互联网级协同（统一信任锚/共享数据库）。' });
  }
  if (names.includes('harmful') || names.includes('reliab')) {
    out.push({ law: '动态化与可控性递增', hint: '静态配置 → 自适应策略：威胁驱动地抬高/放松验证强度。' });
  }
  if (names.includes('time') || names.includes('speed')) {
    out.push({ law: '宏观→微观', hint: '从整条路径级验证下探到字段/会话级细粒度验证，降低单点时延。' });
  }
  if (out.length === 0) {
    out.push({ law: '理想度递增', hint: '沿 IFR 方向演进：逐步去掉独立的验证组件，把安全性内化到协议本体。' });
  }
  out.push({ law: '部件发展不均衡', hint: '识别滞后部件（如某机制部署覆盖率低），那里往往是新的安全缺口与机会。' });
  return out;
}

/** 把候选原理渲染为结构化假说（一条机制方向 + 一句可验证陈述）。 */
export function toHypotheses(analysis: TrizAnalysis): TrizHypothesis[] {
  const contra = [analysis.contradiction.improving?.name, analysis.contradiction.worsening?.name]
    .filter(Boolean).join(' ↔ ') || '未解析矛盾';
  return analysis.candidates.map((p, i) => {
    const mechanism = `运用发明原理 ${p.no}「${p.name}」（${p.summary}）：${p.routingHint}`;
    const statement = `针对「${analysis.problem}」，沿 ${p.name}（原理${p.no}）方向（${p.routingHint}）的机制原型可显著缓解该矛盾——待实验/反证核验。`;
    return {
      id: `triz-${String(p.no).padStart(2, '0')}-${i + 1}`,
      statement,
      mechanism,
      principleNo: p.no,
      principleName: p.name,
      contradiction: contra,
      type: 'Hypothesis',
      source: 'triz',
      confidence: 0.5,
    };
  });
}

/** 理想解（IFR）建模：目标自动达成、零额外成本/机制/攻击面。 */
export function idealityFraming(input: { problem: string }): IdealityFrame {
  const { problem } = input;
  const terms = resolveProblemTerms(problem);
  return {
    problem,
    ifr: `在「不新增独立安全机制、不增加消息/计算/延迟开销、不引入新攻击面」的前提下，系统天然避免或自愈「${problem}」——安全内化在现有路由行为中。`,
    harms: [
      '来源验证缺失导致的未授权宣告（prefix / sub-prefix hijack）',
      '路径验证缺失导致的 AS_PATH 操纵（缩短/伪造路径）',
      '验证延迟拖慢收敛，放大故障/攻击窗口',
      '验证机制本身成为新攻击面（缓存投毒、依赖方劫持、密钥泄露）',
      '部署/运维复杂度压制覆盖率，形成验证盲区（NotFound / 未覆盖前缀）',
    ],
    resources: [
      '现有 RPKI PKI 层级与 ROA 声明（无需新建信任锚）',
      '协议既有字段与属性（AS_PATH / NEXT_HOP / communities / attributes）',
      '路由系统的复制与冗余本性（多对等体、多 RIB 副本）',
      '时间维度：非关键时窗可预计算/异步（收敛时窗外）',
      '分布式性质：各 AS 本地可得的验证信息（自证优于下游推断）',
    ].concat(terms.length ? [`问题语境资源提示：${terms.join('、')}。`] : []),
    benefits: [
      '放大「检测即缓解」：让验证结果直接驱动传播决策（反馈闭环）',
      '让安全开销向关键对象倾斜（局部质量），整体成本趋近理想',
      '把信任从「外部附加」变为「协议内化」，逼近 IFR',
    ],
  };
}

/** 从问题陈述里抽出与别名表相关的词（供 IFR resources 语境提示）。 */
function resolveProblemTerms(problem: string): string[] {
  const low = problem.toLowerCase();
  const found = new Set<string>();
  for (const [alias, no] of Object.entries(ROUTING_PARAMETER_ALIASES)) {
    if (alias.length < 2) continue;
    if (low.includes(alias)) {
      const p = PARAMETER_BY_NO.get(no);
      if (p) found.add(`#${p.no} ${p.name}`);
    }
  }
  return [...found].slice(0, 4);
}

let seq = 0;
/** 创建 ResearchTrizService（plugin-triz.ts 用；纯内存、无副作用）。 */
export function createTrizService(): ResearchTrizService {
  const b = ++seq;
  const svc: ResearchTrizService = {
    analyzeProblem({ problem, improving, worsening }) {
      const ip = resolveParameter(improving);
      const wp = resolveParameter(worsening);
      const { principles, source } = principlesFor(ip, wp);
      const candidates = principles.map((no) => PRINCIPLE_BY_NO.get(no)).filter((p): p is TrizPrinciple => !!p);
      return {
        problem,
        contradiction: { improving: ip, worsening: wp },
        source,
        candidates,
        separation: separationFor(ip, wp),
        evolution: evolutionFor(ip, wp),
      };
    },
    idealityFraming,
    toHypotheses,
    mapResult({ problem, improving, worsening, resultText }) {
      const analysis = svc.analyzeProblem({
        problem,
        // 缺省矛盾：验证/检测精度 ↔ 系统复杂度（路由安全最常用的 TRIZ 入题角度）
        improving: improving ?? 'detection',
        worsening: worsening ?? 'complexity',
      });
      return mapResultToTriz({ problem, analysis, resultText });
    },
  };
  return svc;
}

/** 方便外部直接构造服务（测试/插件复用同一实例化逻辑）。 */
export const createTriz = createTrizService;
