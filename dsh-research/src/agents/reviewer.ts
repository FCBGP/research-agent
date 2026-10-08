// ReviewerAgent — research-paper-review 风格的结构化审稿（8 步清单）。
//
// 定位：审稿的"骨架 + 判定"是确定性的（评分合成 → verdict）；每步的
// 具体点评由模型/人工填充（steps 输入），本 agent 强制 8 步齐备、
// 一致性判定（overall → verdict 阈值）与改进建议汇总 —— 不臆造内容。
import type { PaperRef } from './literature.ts';

export const REVIEW_STEPS = [
  { step: 1, label: 'Problem & Motivation', question: '研究问题是否清晰、重要、被正确动机化？' },
  { step: 2, label: 'Contribution & Novelty', question: '贡献是否明确、新颖、显著，且与既有工作可区分？' },
  { step: 3, label: 'Method & Soundness', question: '方法是否合理可复现、逻辑自洽，是否覆盖主要威胁？' },
  { step: 4, label: 'Experimental Design', question: '实验设计是否有对照组/基线、参数扫描与场景覆盖？' },
  { step: 5, label: 'Data & Implementation', question: '数据集是否公开可复核，实现/代码是否可得？' },
  { step: 6, label: 'Results & Statistics', question: '指标选择与统计推断是否恰当，结论是否被数据支持？' },
  { step: 7, label: 'Related Work & Positioning', question: '相关工作引用是否充分，定位是否准确且不过度声明？' },
  { step: 8, label: 'Writing, Ethics & Limitations', question: '表述是否清晰、局限是否披露、伦理与可复现性声明是否到位？' },
] as const;

export interface ReviewStepInput {
  step: number;             // 1..8
  score: number;            // 0..1
  strengths?: string[];
  concerns?: string[];
  suggestion?: string;
}

export interface ReviewRequest {
  paper: PaperRef;
  steps: ReviewStepInput[]; // 模型/人工逐步点评
}

export interface ReviewStepResult extends ReviewStepInput {
  label: string;
  robust: boolean;          // 该步是否达到通过线（≥0.65）
}

export type ReviewVerdict = 'accept' | 'minor-revision' | 'major-revision' | 'reject';

export interface ReviewReport {
  paperId: string;
  paperTitle: string;
  steps: ReviewStepResult[];
  overallScore: number;
  verdict: ReviewVerdict;
  strengths: string[];
  concerns: string[];
  suggestions: string[];
  checklist: Array<{ step: number; label: string; ok: boolean }>;
}

export class ReviewerAgent {
  review(req: ReviewRequest): ReviewReport {
    const byStep = new Map(req.steps.map((s) => [s.step, s]));
    // 强制对齐 REVIEW_STEPS 顺序，缺步自动给 0 分并附带说明。
    const steps: ReviewStepResult[] = REVIEW_STEPS.map((r) => {
      const input = byStep.get(r.step);
      return {
        step: r.step,
        label: r.label,
        score: input?.score ?? 0,
        strengths: input?.strengths ?? (input ? [] : ['未提供点评']),
        concerns: input?.concerns ?? (input ? [] : ['缺少该步评估']),
        suggestion: input?.suggestion,
        robust: (input?.score ?? 0) >= 0.65,
      };
    });

    const overallScore = steps.reduce((a, s) => a + s.score, 0) / steps.length;
    const verdict: ReviewVerdict =
      overallScore >= 0.85 ? 'accept'
      : overallScore >= 0.7 ? 'minor-revision'
      : overallScore >= 0.5 ? 'major-revision'
      : 'reject';

    const strengths = steps.flatMap((s) => (s.score >= 0.8 ? s.strengths ?? [] : []));
    const concerns = steps.flatMap((s) => (s.concerns ?? []));
    const suggestions = steps.flatMap((s) => (s.suggestion ? [`[S${s.step}] ${s.suggestion}`] : []));

    return {
      paperId: req.paper.id,
      paperTitle: req.paper.title,
      steps,
      overallScore: round(overallScore),
      verdict,
      strengths,
      concerns,
      suggestions,
      checklist: steps.map((s) => ({ step: s.step, label: s.label, ok: s.robust })),
    };
  }
}

export function round(x: number): number {
  return Math.round(x * 100) / 100;
}
