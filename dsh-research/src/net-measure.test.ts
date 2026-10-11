// net-measure.test.ts — 联网测量脚本 `scripts/net-measure.mjs` 的结构化解析器离线单测。
// 覆盖：NIST /Cov 覆盖解析、NIST /Val 验证解析、arrayToDataTable 块提取与容错 JSON 转换、
// APNIC I-ROV 解析、Cloudflare roaStats 聚合。全部用内嵌 fixture，不依赖网络。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNistCoverage,
  parseNistValidation,
  extractDataTableBlocks,
  parseDataTableBlock,
  parseApnicRov,
  parseCloudflareRoa,
} from '../scripts/net-measure.mjs';

test('net-measure: NIST /Cov coverageData → ROA 覆盖指标（取最后一轮）', () => {
  const data = [{
    Cv4: [
      { C: 14099, D: [{ C: 13670, V: 'V' }, { C: 429, V: 'NF' }], V: 'Cv' },
      { C: 1324, V: 'NCv' },
    ],
    Time: '20261008.18',
    T_Pr4: 15423,
  }];
  const m = parseNistCoverage(data);
  assert.equal(m.snapshot, '20261008.18');
  assert.equal(m.ipv4.totalPrefixOrigins, 15423);
  assert.equal(m.ipv4.covered, 14099);
  assert.equal(m.ipv4.notCovered, 1324);
  assert.equal(m.ipv4.coveredValid, 13670);
  assert.equal(m.ipv4.coveredNotFound, 429);
  assert.equal(m.ipv4.coveredPct, 91.42); // 14099/15423 ≈ 91.416%
  assert.equal(m.ipv4.notCoveredPct, 8.58);
});

test('net-measure: NIST /Val data1 → POV4/POVN4 验证计数（取最后一轮）', () => {
  const data1 = [{
    Time: '20261008.18',
    POVN4: [
      { D4: [], C: 8618870, V: 'V' },
      { D4: [{ C: 4928959, V: 'NF' }], C: 4933972, V: 'NF' },
      { D4: [], C: 57213, V: 'I' },
    ],
    POV4: [
      { D4: [], C: 880758, V: 'V' },
      { D4: [{ C: 344111, V: 'NF' }], C: 344366, V: 'NF' },
      { D4: [], C: 15480, V: 'I' },
    ],
  }];
  const m = parseNistValidation(data1);
  assert.equal(m.snapshot, '20261008.18');
  assert.equal(m.ipv4.pov4.valid, 880758);
  assert.equal(m.ipv4.pov4.notFound, 344366);
  assert.equal(m.ipv4.pov4.invalid, 15480);
  assert.equal(m.ipv4.pov4.total, 1240604);
  assert.equal(m.ipv4.povn4.valid, 8618870);
});

test('net-measure: arrayToDataTable 块提取 + 容错 JS 数组字面量 → JSON', () => {
  const html = [
    'x = arrayToDataTable([',
    "  ['Code', 'Region', 'I-RoV Filtering','Samples','Weight','Weighted Samples']        ,",
    '["<a href=\\"/rpki/XA\\">XA</a>","<a href=\\"/rpki/XA\\">World</a>",{v: 27.14, f:\'27.14%\'},88150302,1.00,88150302],',
    '["<a href=\\"/rpki/XE\\">XE</a>","<a href=\\"/rpki/XE\\">Europe</a>",{v: 50.73, f:\'50.73%\'},12441655,1.01,12541695]',
    ']);',
    'y = arrayToDataTable([["CC","Country","I-RoV Filtering","Samples","Weight","Weighted Samples"],['
      + '"<a href=\\"/rpki/SA\\">SA</a>","<a href=\\"/rpki/SA\\">Saudi Arabia</a>",{v: 99.81, f:\'99.81%\'},997880,0.73,729705]]);',
  ].join('\n');
  const blocks = extractDataTableBlocks(html);
  assert.equal(blocks.length, 2);
  const parsed = blocks.map(parseDataTableBlock);
  assert.equal(parsed[0].length, 3); // header + 2 region rows
  const region = parseApnicRov(html);
  assert.equal(region.world, 27.14);
  assert.equal(region.worldSamples, 88150302);
  assert.equal(region.byRegion.Europe, 50.73);
  assert.equal(region.countries.length, 1);
  assert.equal(region.countries[0].code, 'SA');
  assert.equal(region.countries[0].name, 'Saudi Arabia');
});

test('net-measure: APNIC 页面解析对弯引号标签也鲁棒（非 ASCII 引号不炸）', () => {
  // 真实页面个别 label 用 U+2019 弯引号（如 f:'27.14%' 中撇号排版为 ’），
  // 容错转换应剥离成对引号。这里用 ASCII ' 与弯引号 ’ 各测一次。
  const narrow = `arrayToDataTable([
    ['Code','Region','I-RoV Filtering','Samples','Weight','Weighted Samples'],
    ["<a href=\\"/rpki/XA\\">XA</a>","<a href=\\"/rpki/XA\\">World</a>",{v: 27.14, f:\u201927.14%\u2019},88150302,1.00,88150302]
  ]);`;
  const m = parseApnicRov(narrow);
  assert.equal(m.world, 27.14);
  // 只有 XA/World 一行时，byRegion 不含世界行 → 空对象
  assert.deepEqual(m.byRegion, {});
});

test('net-measure: Cloudflare roaStats → 按 TAL 聚合', () => {
  const rows = [
    { ta: 'RIPE', count: 5 },
    { ta: 'RIPE', count: 3 },
    { ta: 'ARIN', count: 2 },
  ];
  const m = parseCloudflareRoa(rows);
  assert.equal(m.totalROAs, 10);
  assert.deepEqual(m.byTal, { RIPE: 8, ARIN: 2 });
});

test('net-measure: 解析函数对畸形输入诚实报错/跳过，不崩溃', () => {
  assert.throws(() => parseNistCoverage([]), /empty/);
  assert.throws(() => parseNistCoverage([{ Cv4: [] }]), /unexpected|Cv/);
  assert.equal(parseDataTableBlock('not an array'), null);
  assert.throws(() => parseApnicRov('no table here'), /no region arrayToDataTable block/);
});
