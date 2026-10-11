// 阶段 3 · 第 14 项 — Paper generation：把研究项目（goal + claims + experiments + verdicts）
// 渲染成结构化 Markdown 论文。纯数据 → 文本，零依赖、可测；写作骨架确定，
// 内容全部来自可追溯的研究对象（不臆造）。
import type { ClaimType, Verdict } from '../core/types.ts';

export interface PaperClaimInput {
  id: string;
  statement: string;
  type: ClaimType;
  confidence: number;
  verificationStatus: Verdict;
  source: string;
  evidence: Array<{ source: string; evidence: string; confidence: number; verified: boolean }>;
  counterEvidence: Array<{ evidence: string; source: string }>;
}

export interface PaperExperimentInput {
  claimId: string;
  configFingerprint: string;
  scenario: string;
  outcome: 'support' | 'refute' | 'inconclusive';
  verdict?: Verdict;
  stats?: Record<string, number>;
  engine?: string;
}

/** 实验矩阵：attack × validator 网格逐格战役的检测率/判定对照（autonomous 流水线产出）。 */
export interface PaperExperimentMatrix {
  attacks: string[];
  validators: string[];
  cells: Array<{
    attack: string;
    validator: string;
    detection: number;
    falsePositive?: number;
    outcome: string;
    verdict?: string;
  }>;
}

export interface PaperInput {
  title: string;
  researchQuestion: string;
  hypothesis: string;
  contextNotes?: string[];          // 文献/背景要点
  claims: PaperClaimInput[];
  experiments?: PaperExperimentInput[];
  experimentMatrix?: PaperExperimentMatrix;  // 实验矩阵小结（§4.1）
  limitations?: string[];
  artifacts?: string[];
  generatedAt?: string;
}

export interface PaperReport {
  title: string;
  abstract: string;
  sections: Array<{ id: string; heading: string; body: string }>;
  markdown: string;
  stats: {
    claims: number;
    verified: number;
    disputed: number;
    rejected: number;
    experiments: number;
  };
}

const VERDICT_LABEL: Record<Verdict, string> = {
  verified: '✅ 已核验',
  disputed: '⚠️ 存疑',
  rejected: '❌ 被证伪',
  pending: '⏳ 待验证',
};

/** 矩阵单元格用的紧凑判定标记（与 VERDICT_LABEL 同源短标）。 */
const VMARK: Record<string, string> = {
  verified: '✅',
  disputed: '⚠️',
  rejected: '❌',
  pending: '⏳',
};

const TYPE_LABEL: Record<ClaimType, string> = {
  Fact: '事实',
  Hypothesis: '假设',
  Assumption: '假设前提',
  Result: '结论',
  Interpretation: '解释',
};

function mdTable(headers: string[], rows: string[][]): string {
  const esc = (s: string): string => s.replace(/\|/g, '\\|');
  const w = (cells: string[]): string => `| ${cells.map((c) => esc(c.trim())).join(' | ')} |`;
  const widths = headers.map((_, i) => Math.max(headers[i].length, ...rows.map((r) => (r[i] ?? '').length)));
  const pad = (cells: string[]): string[] => cells.map((c, i) => c.padEnd(widths[i]));
  const sep = `|${headers.map((_, i) => '-'.repeat(widths[i] + 2)).join('|')}|`;
  return [w(pad(headers)), sep, ...rows.map((r) => w(pad(r.map((c, i) => c ?? ''))))].join('\n');
}

export function generatePaper(input: PaperInput): PaperReport {
  const claims = input.claims;
  const experiments = input.experiments ?? [];
  const matrixCells = input.experimentMatrix?.cells.length ?? 0;
  const verified = claims.filter((c) => c.verificationStatus === 'verified').length;
  const disputed = claims.filter((c) => c.verificationStatus === 'disputed').length;
  const rejected = claims.filter((c) => c.verificationStatus === 'rejected').length;
  const stats = { claims: claims.length, verified, disputed, rejected, experiments: experiments.length + matrixCells };

  const abstract =
    `针对「${input.researchQuestion}」，本文沿 research-loop 提出假设「${input.hypothesis}」，` +
    `经文献沉淀、假设构造与实验验证，共形成 ${claims.length} 条 claim（已核验 ${verified} / 存疑 ${disputed} / 证伪 ${rejected}）` +
    `与 ${experiments.length + matrixCells} 项战役` +
    (matrixCells > 0 ? `（含 ${matrixCells} 格实验矩阵）` : '') +
    `。核心机制的判定见 §5 结论与判定，全部证据可经附录逐条追溯。`;

  const sections: PaperReport['sections'] = [];

  // 1. 背景与研究问题
  sections.push({
    id: 'introduction',
    heading: '## 1. 背景与研究问题',
    body: [
      `研究问题：**${input.researchQuestion}**`,
      '',
      `中心假设：**${input.hypothesis}**`,
      ...(input.contextNotes && input.contextNotes.length > 0
        ? ['', '背景要点：', ...input.contextNotes.map((n, i) => `- ${n}`)]
        : []),
    ].join('\n'),
  });

  // 2. 文献与现有工作
  const lit = claims.filter((c) => c.type === 'Fact');
  sections.push({
    id: 'related',
    heading: '## 2. 文献与现有工作',
    body: lit.length === 0
      ? '（本期未沉淀领域事实类 claim；可扩展 literature source 补足。）'
      : mdTable(
          ['Claim', '事实要点', '来源', '置信'],
          lit.map((c) => [c.id, c.statement, c.source, pct(c.confidence)]),
        ),
  });

  // 3. 方法与假设
  const hypos = claims.filter((c) => c.type === 'Hypothesis' || c.type === 'Assumption');
  sections.push({
    id: 'method',
    heading: '## 3. 方法与假设',
    body: hypos.length === 0
      ? '（本期未声明假设，仅沉淀事实与结论。）'
      : hypos
          .map((c) => `- **${c.id}**（${TYPE_LABEL[c.type] ?? c.type}，置信 ${pct(c.confidence)}）：${c.statement}`)
          .join('\n'),
  });

  // 4. 实验与结果
  let expBody = experiments.length === 0
    ? '（本期未执行实验。）'
    : mdTable(
        ['Claim', '场景', '配置指纹', '执行源', 'outcome', 'verdict'],
        experiments.map((e) => [
          e.claimId,
          e.scenario,
          e.configFingerprint,
          e.engine ?? 'sim',
          e.outcome,
          e.verdict ?? '—',
        ]),
      ) +
      (experiments.some((e) => e.stats && Object.keys(e.stats).length > 0)
        ? '\n\n四口径统计摘要（均值）：\n\n' +
          mdTable(
            ['Claim', 'detection', 'false_positive', 'convergence_ms', 'latency_ms'],
            experiments.map((e) => [
              e.claimId,
              num(e.stats?.detection_rate),
              num(e.stats?.false_positive_rate),
              num(e.stats?.convergence_time),
              num(e.stats?.verification_latency),
            ]),
          )
        : '');
  if (input.experimentMatrix) {
    const m = input.experimentMatrix;
    const rows = m.attacks.map((a) => [
      a,
      ...m.validators.map((v) => {
        const cell = m.cells.find((c) => c.attack === a && c.validator === v);
        return cell ? `${Math.round(cell.detection * 100)}% ${VMARK[cell.verdict ?? ''] ?? cell.outcome}` : '—';
      }),
    ]);
    expBody +=
      '\n\n### 4.1 实验矩阵（检测率 × 验证策略）\n\n每格 = 检测率均值 + 判定标记（✅ 已核验 / ⚠️ 存疑 / ❌ 被证伪）：\n\n' +
      mdTable(['攻击 \\ 验证', ...m.validators], rows);
  }
  sections.push({
    id: 'experiments',
    heading: '## 4. 实验与结果',
    body: expBody,
  });

  // 5. 结论与判定
  sections.push({
    id: 'conclusions',
    heading: '## 5. 结论与判定',
    body: mdTable(
      ['Claim', '类型', '表述', '置信', 'verdict'],
      claims.map((c) => [c.id, TYPE_LABEL[c.type] ?? c.type, c.statement, pct(c.confidence), VERDICT_LABEL[c.verificationStatus] ?? c.verificationStatus]),
    ),
  });

  // 6. 局限与后续
  const lim = [
    ...(input.limitations ?? []),
    ...claims
      .filter((c) => c.counterEvidence.length > 0)
      .map((c) => `${c.id} 存在反证：${c.counterEvidence.map((x) => `${x.evidence}（${x.source}）`).join('；')}`),
    ...(disputed > 0 ? [`${disputed} 条 claim 仍处存疑态，需补充证据或反证实验。`] : []),
  ];
  sections.push({
    id: 'limitations',
    heading: '## 6. 局限与后续',
    body: lim.length === 0 ? '（未记录明显局限。）' : lim.map((x) => `- ${x}`).join('\n'),
  });

  // 附录：证据追溯
  sections.push({
    id: 'appendix',
    heading: '## 附录 A · 证据追溯',
    body: claims
      .map((c) => {
        const evRows = c.evidence.length === 0
          ? ['（无证据记录）']
          : c.evidence.map((e) => `- [${e.verified ? '已核验' : '未核验'}] ${e.source} · conf ${pct(e.confidence)}：${e.evidence}`);
        return [`### ${c.id} — ${c.statement}`, ...evRows].join('\n');
      })
      .join('\n\n'),
  });

  const markdown = [
    `# ${input.title}`,
    '',
    `> 生成时间：${input.generatedAt ?? new Date().toISOString()}`,
    '',
    '## 摘要',
    '',
    abstract,
    '',
    ...sections.flatMap((s) => [s.heading, '', s.body, '']),
    ...(input.artifacts && input.artifacts.length > 0
      ? ['## 附录 B · 关联 artifact', '', ...input.artifacts.map((a) => `- \`${a}\``), '']
      : []),
  ].join('\n');

  return { title: input.title, abstract, sections, markdown, stats };
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
function num(x: number | undefined): string {
  return x === undefined ? '—' : String(Math.round(x * 100) / 100);
}
