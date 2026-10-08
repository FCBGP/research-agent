// Writer facade — 论文/幻灯片生成器组装门面（阶段 3 · 14/15）。
import { generatePaper, type PaperInput, type PaperReport } from './paper.ts';
import { generateSlides, type SlideDeckReport } from './slides.ts';

export interface ResearchWriter {
  paper(input: PaperInput): PaperReport;
  slides(input: PaperInput): SlideDeckReport;
}

export function createWriter(): ResearchWriter {
  return {
    paper: (input) => generatePaper(input),
    slides: (input) => generateSlides(input),
  };
}

export * from './paper.ts';
export * from './slides.ts';
