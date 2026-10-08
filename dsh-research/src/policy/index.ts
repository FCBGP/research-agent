// Research Agent Policy — 10 条研究纪律（AGENTS.md §9）固化为可复用的策略层。
// 提供：规则定义（可被 profile overlay 增删）+ 系统提示渲染 + 开启/关闭开关。
// 纯数据 + 纯函数，零依赖、可测；策略在插件层注入（patches/research-agent.yml）。

export interface ResearchPolicyRule {
  id: string;          // p01..p10
  text: string;        // 一条纪律
}

/** 10 条核心研究策略（与 AGENTS.md §9 一一对应）。 */
export const RESEARCH_POLICY: readonly ResearchPolicyRule[] = [
  { id: 'p01', text: '不把模型生成内容当作事实；一切陈述区分来源与置信。' },
  { id: 'p02', text: '所有关键 Claim 必须有 Evidence（source + confidence）。' },
  { id: 'p03', text: 'RFC / IETF / 论文优先使用原始来源。' },
  { id: 'p04', text: '对关键结论主动寻找 Counter Evidence。' },
  { id: 'p05', text: '实验结论必须绑定 Experiment Artifact（指纹可复现）。' },
  { id: 'p06', text: '没有实验数据不得声称"实验验证"。' },
  { id: 'p07', text: '区分 Fact / Hypothesis / Assumption / Result / Interpretation。' },
  { id: 'p08', text: '研究任务采用 DAG（依赖 + 信息增益），而非简单 TODO。' },
  { id: 'p09', text: '完成任务前必须执行 Verification Loop（证据/反证/实验）。' },
  { id: 'p10', text: '最终输出必须可追溯到 Evidence（附录逐条溯源）。' },
] as const;

export interface PolicyOptions {
  enabled?: boolean;
  extra?: string[];    // profile 追加的纪律
  omit?: string[];     // profile 省略的纪律 id
}

export interface PolicyView {
  enabled: boolean;
  rules: ResearchPolicyRule[];
  prompt: string;
}

/**
 * PolicyService — 读取策略并渲染为 system-prompt 块。
 * enabled=false 时仍提供规则查询但 prompt 为空（配合 tools 开关可整体关闭）。
 */
export class PolicyService {
  readonly opts: PolicyOptions;
  constructor(opts: PolicyOptions = {}) {
    this.opts = opts;
  }

  get enabled(): boolean {
    return this.opts.enabled !== false;
  }

  rules(): ResearchPolicyRule[] {
    const omit = new Set(this.opts.omit ?? []);
    const base = RESEARCH_POLICY.filter((r) => !omit.has(r.id));
    const extra = (this.opts.extra ?? []).map((text, i) => ({ id: `extra-${i + 1}`, text }));
    return [...base, ...extra];
  }

  /** 渲染一段可直接拼进系统提示的「研究纪律」块。 */
  buildPrompt(): string {
    if (!this.enabled) return '';
    const rules = this.rules();
    return [
      '# Research Agent Policy（必须遵守）',
      ...rules.map((r) => `- ${r.text}`),
    ].join('\n');
  }

  view(): PolicyView {
    return { enabled: this.enabled, rules: this.rules(), prompt: this.buildPrompt() };
  }
}
