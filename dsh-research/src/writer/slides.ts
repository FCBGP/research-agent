// 阶段 3 · 第 15 项 — PPT generation：从论文对象渲染一套 Markdown 幻灯片
// （Marp 风格，`---` 分页，可在 Marp/VSCode/CLI 一键导出 PDF/PPTX）。
// 与 paper.ts 共享 PaperInput，骨架确定、内容全部来自研究对象。
import type { PaperInput } from './paper.ts';
import { generatePaper } from './paper.ts';

export interface SlideDeckReport {
  title: string;
  slides: string[];        // 每页原始文本（不含分隔符）
  markdown: string;        // 完整 Marp 源
}

/** 从同一 PaperInput 渲染 8 页标准科研汇报。 */
export function generateSlides(input: PaperInput): SlideDeckReport {
  const paper = generatePaper(input);
  const verified = paper.stats.verified;
  const claims = paper.stats.claims;

  const claimRows = input.claims.map((c) => `- ${c.id}（${c.type}，${pct(c.confidence)} · ${c.verificationStatus}）：${c.statement}`);
  const expRows = (input.experiments ?? []).map(
    (e) => `- ${e.claimId}｜${e.scenario}｜fingerprint \`${e.configFingerprint}\` → ${e.outcome}${e.verdict ? `（${e.verdict}）` : ''}`,
  );
  const statsTableRows = (input.experiments ?? []).filter((e) => e.stats && e.stats.detection_rate !== undefined).map(
    (e) => `| ${e.claimId} | ${num(e.stats?.detection_rate)} | ${num(e.stats?.false_positive_rate)} | ${num(e.stats?.convergence_time)} | ${num(e.stats?.verification_latency)} |`,
  );

  const slides: string[] = [
    // 1 标题页
    [
      `# ${input.title}`,
      '',
      '域间路由安全 · research agent 自动流水线产出',
      '',
      `研究问题：${input.researchQuestion}`,
    ].join('\n'),

    // 2 研究问题与动机
    [
      '## 研究问题与动机',
      '',
      `**${input.researchQuestion}**`,
      '',
      `中心假设：**${input.hypothesis}**`,
      ...(input.contextNotes && input.contextNotes.length > 0
        ? ['', '背景要点：', ...input.contextNotes.slice(0, 4).map((n) => `- ${n}`)]
        : []),
    ].join('\n'),

    // 3 方法：假设与事实
    [
      '## 方法与假设',
      '',
      `${claims} 条 claim（${verified} 已核验）`,
      '',
      ...claimRows,
      '',
      '> 完整判定表见论文 §5。',
    ].join('\n'),

    // 4 实验设计
    [
      '## 实验设计',
      '',
      ...(input.experiments && input.experiments.length > 0 ? expRows : ['（本期未执行实验）']),
      '',
      '流水线：deploy → run(×repetitions) → collect → analyze → verify → archive',
    ].join('\n'),

    // 5 结果
    [
      '## 结果（四口径统计均值）',
      '',
      ...(statsTableRows.length > 0
        ? ['| claim | detection | false_pos | converge(ms) | latency(ms) |', '|---|---|---|---|---|', ...statsTableRows]
        : ['（无可用数值口径）']),
      '',
      '> detection − false_positive 即 effectiveScore，越大越优。',
    ].join('\n'),

    // 5b 实验矩阵（detection 对照；autonomous 流水线带矩阵时追加一页）
    ...(input.experimentMatrix
      ? [[
          '## 实验矩阵（检测率对照）',
          '',
          `| 验证策略 \\ 攻击 | ${input.experimentMatrix.attacks.join(' | ')} |`,
          `|${input.experimentMatrix.attacks.map(() => '---').join('|')}|`,
          ...input.experimentMatrix.validators.map((v) => {
            const cells = input.experimentMatrix.attacks.map((a) => {
              const c = input.experimentMatrix.cells.find((x) => x.attack === a && x.validator === v);
              return c ? `${Math.round(c.detection * 100)}%` : '—';
            });
            return `| ${v} | ${cells.join(' | ')} |`;
          }),
          '',
          '> 单元格 = 检测率均值（%）。逐格 verdict 见论文 §4.1。',
        ].join('\n')]
      : []),

    // 6 结论与判定
    [
      '## 结论与判定',
      '',
      ...input.claims.map((c) => `- ${c.id} → **${c.verificationStatus}**（${pct(c.confidence)}）`),
      '',
      `汇总：${paper.stats.verified} 已核验 / ${paper.stats.disputed} 存疑 / ${paper.stats.rejected} 证伪。`,
    ].join('\n'),

    // 7 局限
    [
      '## 局限与反证',
      '',
      ...(input.limitations && input.limitations.length > 0 ? input.limitations.map((x) => `- ${x}`) : ['（未记录明显局限）']),
      ...input.claims
        .filter((c) => c.counterEvidence.length > 0)
        .map((c) => `- ${c.id} 反证：${c.counterEvidence.map((x) => `${x.evidence}（${x.source}）`).join('；')}`),
    ].join('\n'),

    // 8 下一步
    [
      '## 下一步',
      '',
      '- 对存疑 claim 补充反证实验（research_campaign）',
      '- 扩展真实 FRR/VPP 执行源取代确定性模拟',
      '- 按 ReviewerAgent 8 步清单迭代论文',
    ].join('\n'),
  ];

  const markdown = slides.map((s) => s.trimEnd()).join('\n\n---\n\n') + '\n';

  return { title: input.title, slides, markdown };
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
function num(x: number | undefined): string {
  return x === undefined ? '—' : String(Math.round(x * 100) / 100);
}
