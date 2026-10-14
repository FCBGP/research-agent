// Writer 自测：论文与幻灯片的骨架确定性 + 证据追溯完整性。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWriter } from './index.ts';
import type { PaperInput } from './paper.ts';

function sampleInput(): PaperInput {
  return {
    title: 'ROV 对 BGP 劫持检测的有效性评估',
    researchQuestion: 'ROV 是否显著提升劫持检测率且不放大误报？',
    hypothesis: 'ROV 显著提升检测率，误报小幅抬升可接受',
    contextNotes: ['BGP 信任链缺失是劫持根源（RFC 4271）', 'ROA 限定来源 AS（RFC 8481）'],
    claims: [
      {
        id: 'c-1',
        statement: 'ROV 将 prefix-hijack 检测率抬升至 0.8 区间',
        type: 'Hypothesis',
        confidence: 0.81,
        verificationStatus: 'verified',
        source: 'director',
        evidence: [
          { source: 'experiment:sim', evidence: '3 轮重复 detection≈0.80', confidence: 0.8, verified: true },
          { source: 'RFC 8481', evidence: 'ROA 限定合法来源 AS', confidence: 0.9, verified: true },
        ],
        counterEvidence: [],
      },
      {
        id: 'c-2',
        statement: 'ROV 对 path-manipulation 覆盖有限',
        type: 'Hypothesis',
        confidence: 0.4,
        verificationStatus: 'disputed',
        source: 'director',
        evidence: [],
        counterEvidence: [{ evidence: 'BGPsec 才能验路径', source: 'RFC 8205' }],
      },
    ],
    experiments: [
      {
        claimId: 'c-1',
        configFingerprint: 'sim::route-hijack::c-1',
        scenario: 'route-hijack',
        outcome: 'support',
        verdict: 'verified',
        engine: 'route-engine-sim',
        stats: { detection_rate: 0.802, false_positive_rate: 0.02, convergence_time: 1.2, verification_latency: 0.4 },
      },
    ],
  };
}

test('paper: 生成完整 6 章节 + 摘要 + 附录，统计正确', () => {
  const writer = createWriter();
  const report = writer.paper(sampleInput());
  assert.equal(report.stats.claims, 2);
  assert.equal(report.stats.verified, 1);
  assert.equal(report.stats.disputed, 1);
  assert.equal(report.stats.experiments, 1);
  for (const heading of ['## 1. 背景与研究问题', '## 2. 文献与现有工作', '## 3. 方法与假设', '## 4. 实验与结果', '## 5. 结论与判定', '## 6. 局限与后续', '## 附录 A · 证据追溯']) {
    assert.ok(report.markdown.includes(heading), `缺少章节 ${heading}`);
  }
  assert.ok(report.markdown.includes('c-1'));
  assert.ok(report.markdown.includes('c-2'));
  assert.ok(report.markdown.includes('detection'));
  assert.ok(report.markdown.includes('已核验'));
});

test('paper: 证据追溯把所有 claim 与其证据源列出', () => {
  const writer = createWriter();
  const report = writer.paper(sampleInput());
  const appendix = report.sections.find((s) => s.id === 'appendix');
  assert.ok(appendix);
  assert.ok(appendix.body.includes('RFC 8481'), '附录应列出证据源');
  const limitations = report.sections.find((s) => s.id === 'limitations');
  assert.ok(limitations);
  assert.ok(limitations.body.includes('RFC 8205'), '反证应出现在局限/反证章节');
});

test('slides: Marp 分页（≥8 页），含标题/结果/结论', () => {
  const writer = createWriter();
  const deck = writer.slides(sampleInput());
  const pages = deck.markdown.split(/\n---\n/);
  assert.ok(pages.length >= 8, `应有 8 页，实际 ${pages.length}`);
  assert.ok(pages[0].includes('ROV 对 BGP 劫持检测的有效性评估'));
  assert.ok(deck.markdown.includes('## 结果'));
  assert.ok(deck.markdown.includes('c-1 → **verified**'));
  assert.ok(deck.markdown.includes('c-2 → **disputed**'));
});

test('slides: 空实验/空 claim 也能出骨架（不抛错）', () => {
  const writer = createWriter();
  const deck = writer.slides({
    title: '空项目',
    researchQuestion: 'Q',
    hypothesis: 'H',
    claims: [],
    experiments: [],
  });
  assert.ok(deck.markdown.includes('# 空项目'));
  assert.ok(deck.markdown.length > 50);
});

test('paper: trizMapping 时 §6 = TRIZ 发明原理映射、局限顺延 §7，且条目标待核验', () => {
  const writer = createWriter();
  const report = writer.paper({
    ...sampleInput(),
    trizMapping: {
      problem: 'ROV 提升劫持检测率而不放大误报',
      source: 'curated-matrix',
      contradiction: { improving: 'Measurement accuracy', worsening: 'Device complexity' },
      entries: [
        { principleNo: 23, principleName: 'Feedback', kind: 'didactic', reason: '矛盾分析命中 #23：劫持检测结果反馈到策略' },
        { principleNo: 2, principleName: 'Taking out', kind: 'didactic', reason: '把验证逻辑抽离为旁路组件' },
        { principleNo: 24, principleName: 'Intermediary', kind: 'retrospective', reason: '结果文本出现「中介」特征词，方向一致' },
      ],
    },
  });
  assert.ok(report.markdown.includes('## 6. TRIZ 发明原理映射'), '缺 TRIZ 章节');
  assert.ok(report.markdown.includes('## 7. 局限与后续'), '带 TRIZ 时局限应顺延 §7');
  assert.ok(!report.markdown.includes('## 6. 局限与后续'), '不应出现 §6 局限');
  assert.ok(report.markdown.includes('| 23 | Feedback | 矛盾分析正演 |'), '原理行表应含条目');
  assert.ok(report.markdown.includes('待核验假说'), '条目明确标待核验');
  assert.ok(report.markdown.includes('source=triz, confidence=0.5'), '承诺 confidence=0.5');
  assert.ok(report.markdown.includes('3 条 TRIZ 发明原理映射'), '摘要统计映射条数');
});

test('slides: trizMapping 时含 TRIZ 发明原理映射页（待核验标注）', () => {
  const writer = createWriter();
  const deck = writer.slides({
    ...sampleInput(),
    trizMapping: {
      problem: 'ROV 提升劫持检测率而不放大误报',
      source: 'curated-matrix',
      contradiction: { improving: 'Measurement accuracy', worsening: 'Device complexity' },
      entries: [
        { principleNo: 23, principleName: 'Feedback', kind: 'didactic', reason: '矛盾分析命中 #23' },
        { principleNo: 2, principleName: 'Taking out', kind: 'retrospective', reason: '结果文本特征词命中' },
      ],
    },
  });
  assert.ok(deck.markdown.includes('TRIZ 发明原理映射（本结果对应）'), '缺 TRIZ 幻灯片页');
  assert.ok(deck.markdown.includes('#23 Feedback'), '幻灯片含原理条目');
  assert.ok(deck.markdown.includes('待核验假说'), '幻灯片标待核验');
});
