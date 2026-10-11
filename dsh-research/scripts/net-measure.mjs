#!/usr/bin/env node
// net-measure.mjs — 联网测量：ROA 覆盖 / RPKI 验证 / ROV 强制落地 / BGPsec 部署占比
//
// 目的：把报告 `research/RPKI-BGPsec-security-gaps.md` 的 V7/V8/V9 从
// 「待联网测量的 Hypothesis/disputed」升级到 verified / rejected 所需的**真实观测数据**。
// 数据源（live，2026-10-09 实测可直连）：
//
//   1) NIST RPKI Monitor — ROA Coverage（`/Cov`）
//      网页内嵌 `coverageData`（JSON 数组，按 6h 一轮，覆盖多年）；
//      取最后一轮：`T_Pr4` = 唯一 (IPv4 前缀, origin) 总数，`Cv4` = Covered/Not-Covered
//      细分为 Valid / Not-Found。→ ROA 覆盖率的权威口径（RFC 6811 语义）。
//      ⚠ 明确 caveat（NIST Methodology 原文）：本页**不测量**哪些网络在做 ROV 过滤。
//   2) NIST RPKI Monitor — Validation Status（`/Val`）
//      内嵌 `data1` 时间序列，最后一轮 `POV4` = 跨 RouteViews 采集点的 IPv4
//      (prefix,origin) 验证计数（V/NF/I）。
//   3) APNIC stats — RPKI I-ROV Filtering World Map（`https://stats.labs.apnic.net/rpki`）
//      内嵌 `arrayToDataTable([...])`；区域块（Region）给出 World/Europe/Americas/Asia/
//      Oceania/Africa 的 **I-RoV Filtering %**（以 AS path 推断的 ROV 过滤占比，非官方强制
//      落地口径）。页面标注 7 天范围（如 02/10/2026-08/10/2026）。
//      解析用「容错 JS 数组字面量 → JSON」转换（标签串兼容 ASCII/弯引号），不依赖行级正则。
//   4) Cloudflare RPKI GraphQL（`https://rpki.cloudflare.com/api/graphql`）
//      `{ roaStats{ ta count } }` → 各 TAL 注册 ROA 计数（v4+v6 合并），辅助口径。
//
// BGPsec 部署占比：**不存在**权威实时全局计数器（NIST/APNIC/Cloudflare 均无 BGPsec
// 签名公告数据集）。故脚本如实记录「无可用实时全局计数器 → 生产部署 ≈0（由标准状态 +
// 测量生态缺失推断）」，并在报告里按此口径给 V9/相关结论，不伪造数字（AGENTS.md 铁律）。
//
// 输出：`research/net-measure-results.json`（research/ 已 gitignore，不入 git；
// 由 archive-research 一并归档为 art-14，可追溯）。raw 页面存 <cache>/<id>.html。
//
// 用法:
//   node dsh-research/scripts/net-measure.mjs                 # 联网拉取并写 research/net-measure-results.json
//   node dsh-research/scripts/net-measure.mjs --out /tmp/m.json
//   node dsh-research/scripts/net-measure.mjs --cache /tmp/nm-cache   # raw HTML 落盘缓存
//   node dsh-research/scripts/net-measure.mjs --offline --cache /tmp/nm-cache  # 只解析缓存，不联网
//   node dsh-research/scripts/net-measure.mjs --help
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const DEFAULT_OUT = join(REPO_ROOT, 'research', 'net-measure-results.json');
const DEFAULT_CACHE = join(REPO_ROOT, 'storage', 'net-measure-cache');

const UA = 'Mozilla/5.0 (research-agent; dsh-routing-research net-measure)';

export const SOURCES = {
  nistCov: {
    id: 'nist-cov',
    name: 'NIST RPKI Monitor — ROA Coverage',
    url: 'https://rpki-monitor.antd.nist.gov/Cov',
    caveats: [
      '按 RFC 6811 语义对 RouteViews/各采集点 BGP 表中的唯一 (IPv4 前缀, origin) 计数；',
      'NIST 方法论明确声明：本页不测量哪些网络在做 ROV 过滤/强制落地。',
    ],
  },
  nistVal: {
    id: 'nist-val',
    name: 'NIST RPKI Monitor — Validation Status',
    url: 'https://rpki-monitor.antd.nist.gov/Val',
    caveats: [
      'POV4 = 跨 RouteViews 采集点的 IPv4 (prefix,origin) 验证计数（V/NF/I），',
      '是「验证状态」计数而非「ROV 部署比例」，不要把两者混为一谈。',
    ],
  },
  apnic: {
    id: 'apnic-rov',
    name: 'APNIC stats — RPKI I-ROV Filtering World Map',
    url: 'https://stats.labs.apnic.net/rpki',
    caveats: [
      'I-RoV = 以 AS path 推断的 ROV 过滤占比（Inferred ROV），是推断不是官方强制落地证明；',
      '页面范围 7 天；权重按样本量。',
    ],
  },
  cloudflare: {
    id: 'cloudflare-rpki',
    name: 'Cloudflare RPKI — GraphQL roaStats',
    url: 'https://rpki.cloudflare.com/api/graphql',
    caveats: ['roaStats{ta count} 返回各 TAL 注册 ROA 计数（v4+v6 合并，跨 length 桶）；辅助口径。'],
  },
};

// —— CLI 解析 ——
const argv = process.argv.slice(2);
let outFile = DEFAULT_OUT;
let cacheDir = DEFAULT_CACHE;
let offline = false;
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  const next = () => { i += 1; return argv[i]; };
  if (a === '--out') outFile = next() ?? outFile;
  else if (a.startsWith('--out=')) outFile = a.slice('--out='.length);
  else if (a === '--cache') cacheDir = next() ?? cacheDir;
  else if (a.startsWith('--cache=')) cacheDir = a.slice('--cache='.length);
  else if (a === '--offline') offline = true;
  else if (a === '--help' || a === '-h') {
    console.log(`用法: node dsh-research/scripts/net-measure.mjs [--out <file>] [--cache <dir>] [--offline]\n\n` +
      `  --out <file>     输出 JSON（默认 ${DEFAULT_OUT}）\n` +
      `  --cache <dir>    raw HTML 缓存目录（默认 ${DEFAULT_CACHE}；--offline 只读缓存）\n` +
      `  --offline        不联网，只用缓存 raw 页面解析（可复现/离线验证）\n` +
      `  --help           本帮助`);
    process.exit(0);
  } else {
    console.error(`unknown arg: ${a}`);
    process.exit(2);
  }
}
outFile = resolve(outFile);
cacheDir = resolve(cacheDir);
mkdirSync(cacheDir, { recursive: true });

// —— 抓取助手：联网 → 落盘缓存；离线 → 只读缓存 ——
async function fetchCache(id, url) {
  const file = join(cacheDir, `${id}.html`);
  if (offline) {
    if (!existsSync(file)) throw new Error(`--offline but cache missing: ${file}`);
    return readFileSync(file, 'utf8');
  }
  const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  const text = await r.text();
  writeFileSync(file, text);
  return text;
}

// —— 解析：从 HTML 提取 `var <name> = [ … ];` 的 JSON 数组 ——
function extractJsonArray(html, varName) {
  const re = new RegExp(`var\\s+${varName}\\s*=\\s*(\\[[\\s\\S]*?\\]);`);
  const m = html.match(re);
  if (!m) throw new Error(`cannot find var ${varName} in page`);
  return JSON.parse(m[1]);
}

/** NIST /Cov coverageData → ROA 覆盖指标（取最后一轮）。 */
export function parseNistCoverage(coverageData) {
  if (!Array.isArray(coverageData) || coverageData.length === 0) throw new Error('coverageData empty');
  const last = coverageData[coverageData.length - 1];
  const cv4 = last.Cv4.find((x) => x.V === 'Cv');
  const nc = last.Cv4.find((x) => x.V === 'NCv');
  if (!cv4 || !nc || !last.T_Pr4) throw new Error(`unexpected /Cov entry shape: ${JSON.stringify(last).slice(0, 200)}`);
  const total = last.T_Pr4;
  const covered = cv4.C;
  const notCovered = nc.C;
  const detail = cv4.D || [];
  const found = detail.find((x) => x.V === 'V');
  const nf = detail.find((x) => x.V === 'NF');
  return {
    snapshot: last.Time,
    ipv4: {
      totalPrefixOrigins: total,
      covered,
      coveredPct: roundPct((covered / total) * 100),
      notCovered,
      notCoveredPct: roundPct((notCovered / total) * 100),
      coveredValid: found ? found.C : null,
      coveredNotFound: nf ? nf.C : null,
    },
  };
}

/** NIST /Val data1 时间序列 → 最后一轮 POV4/POVN4 验证计数。 */
export function parseNistValidation(data1) {
  if (!Array.isArray(data1) || data1.length === 0) throw new Error('data1 empty');
  const last = data1[data1.length - 1];
  const pick = (arr, v) => arr?.find((x) => x.V === v)?.C ?? null;
  const pov4 = last.POV4 || [];
  const povn4 = last.POVN4 || [];
  const sum = (arr) => arr.reduce((s, x) => s + (x.C || 0), 0);
  return {
    snapshot: last.Time,
    ipv4: {
      pov4: {
        valid: pick(pov4, 'V'),
        notFound: pick(pov4, 'NF'),
        invalid: pick(pov4, 'I'),
        total: sum(pov4),
      },
      povn4: {
        valid: pick(povn4, 'V'),
        notFound: pick(povn4, 'NF'),
        invalid: pick(povn4, 'I'),
        total: sum(povn4),
      },
    },
  };
}

/** 从 HTML 提取 `arrayToDataTable([ … ]);` 块（括号配对，返回内层文本数组）。 */
export function extractDataTableBlocks(html) {
  const blocks = [];
  let pos = 0;
  const marker = 'arrayToDataTable([';
  while ((pos = html.indexOf(marker, pos)) !== -1) {
    let depth = 0;
    let inStr = false;
    let quote = null;
    let i = pos + marker.length - 1; // index of '['
    for (; i < html.length; i += 1) {
      const c = html[i];
      if (inStr) {
        if (c === quote && html[i - 1] !== '\\') inStr = false;
        continue;
      }
      if (c === '"' || c === "'") { inStr = true; quote = c; continue; }
      if (c === '[') depth += 1;
      else if (c === ']') { depth -= 1; if (depth === 0) { i += 1; break; } }
    }
    blocks.push(html.slice(pos + marker.length - 1, i));
    pos = i;
  }
  return blocks;
}

/** 去掉字符串中的 HTML 标签（如 `<a href="/rpki/XA">World</a>` → `World`）。 */
function stripTags(s) {
  return String(s).replace(/<[^>]*>/g, '').trim();
}

/** 把数字/带引号标签规整为合法 JSON 值片段。 */
function fmtScalar(raw) {
  let t = String(raw).trim();
  // 标签可能用 ASCII 单引号或弯引号包裹；去掉成对引号。
  for (const q of ["'", '"', '\u2019']) {
    if (t.length >= 2 && t.startsWith(q) && t.endsWith(q)) { t = t.slice(1, -1); break; }
  }
  // 纯数字原样返回（保持 JSON 数值类型）；否则转成双引号字符串。
  const num = Number(t);
  if (t !== '' && Number.isFinite(num)) return String(num);
  return `"${t.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * 把 `arrayToDataTable( [ … ] );` 的内层文本转成合法 JSON 并解析。
 * 页面里 `{v: 27.14, f:'27.14%'}` 这类「裸对象 + 单引号串」不是合法 JSON：
 * 先把它规整为 {"v":27.14,"f":"27.14%"}，再把其余单引号串转双引号，然后 JSON.parse。
 * 失败（个别块含无法转换的字符）时返回 null，由调用方跳过该块。
 */
export function parseDataTableBlock(inner) {
  try {
    let s = inner.replace(
      /\{(\w+):\s*([^,}]+),\s*(\w+):\s*([^}]+)\}/g,
      (_, k1, v1, k2, v2) => `{"${k1}":${fmtScalar(v1)},"${k2}":${fmtScalar(v2)}}`,
    );
    s = s.replace(/'([^'\n]*)'/g, '"$1"');
    const out = JSON.parse(s);
    return Array.isArray(out) ? out : null;
  } catch {
    return null;
  }
}

/** APNIC 页面 → I-ROV 过滤占比（区域块 + 国家块）。 */
export function parseApnicRov(html) {
  const blocks = extractDataTableBlocks(html).map(parseDataTableBlock).filter(Boolean);
  let regionBlock;
  let countryBlock;
  for (const rows of blocks) {
    const head = rows[0];
    if (!Array.isArray(head)) continue;
    const hdr = head.map((h) => String(h));
    if (!regionBlock && hdr.some((h) => h.includes('Region'))) regionBlock = rows;
    if (!countryBlock && hdr[0] === 'CC') countryBlock = rows;
  }
  if (!regionBlock) throw new Error('no region arrayToDataTable block in APNIC page');

  const regions = {};
  for (const row of regionBlock.slice(1)) {
    const code = stripTags(String(row[0])).trim();
    const obj = row[2];
    regions[code] = {
      name: stripTags(row[1]),
      pct: obj && typeof obj === 'object' ? obj.v : null,
      pctLabel: obj && typeof obj === 'object' ? obj.f : null,
      samples: Number(row[3]),
      weight: Number(row[4]),
    };
  }
  const world = regions.XA?.pct ?? null;
  const byRegion = {};
  for (const key of Object.keys(regions)) {
    if (key !== 'XA') byRegion[regions[key].name] = regions[key].pct;
  }

  const countries = [];
  if (countryBlock) {
    for (const row of countryBlock.slice(1)) {
      const obj = row[2];
      countries.push({
        code: stripTags(String(row[0])).trim(),
        name: stripTags(row[1]),
        pct: obj && typeof obj === 'object' ? obj.v : null,
        pctLabel: obj && typeof obj === 'object' ? obj.f : null,
        samples: Number(row[3]),
      });
    }
  }
  return { world, worldSamples: regions.XA?.samples ?? null, byRegion, countries: countries.slice(0, 60) };
}

/** Cloudflare roaStats → 按 TAL 聚合。 */
export function parseCloudflareRoa(rows) {
  const byTal = {};
  let total = 0;
  for (const r of rows) {
    byTal[r.ta] = (byTal[r.ta] ?? 0) + (r.count || 0);
    total += r.count || 0;
  }
  return { totalROAs: total, byTal };
}

function roundPct(x) {
  return Math.round(x * 100) / 100;
}

// —— 主流程 ——
async function main() {
  const fetchedAt = new Date().toISOString();
  const sources = Object.values(SOURCES).map((s) => ({
    id: s.id, name: s.name, url: s.url, fetchedAt: null, httpStatus: null,
    blobs: {}, error: null, methodology: null, caveats: s.caveats,
  }));
  const byId = Object.fromEntries(sources.map((s) => [s.id, s]));

  const metrics = {};

  // 1) NIST /Cov
  try {
    const html = await fetchCache('nist-cov', SOURCES.nistCov.url);
    const coverageData = extractJsonArray(html, 'coverageData');
    metrics.roaCoverage = parseNistCoverage(coverageData);
    byId['nist-cov'].fetchedAt = fetchedAt;
    byId['nist-cov'].httpStatus = 200;
    byId['nist-cov'].methodology = '唯一 (IPv4 前缀, origin) 计数；RFC 6811 Valid/Invalid/NotFound;取 coverageData 最后一轮';
    byId['nist-cov'].blobs = { entries: coverageData.length, lastSnapshot: metrics.roaCoverage.snapshot };
  } catch (e) {
    byId['nist-cov'].error = String(e && e.message ? e.message : e);
  }

  // 2) NIST /Val
  try {
    const html = await fetchCache('nist-val', SOURCES.nistVal.url);
    const data1 = extractJsonArray(html, 'data1');
    metrics.rpkiValidation = parseNistValidation(data1);
    byId['nist-val'].fetchedAt = fetchedAt;
    byId['nist-val'].httpStatus = 200;
    byId['nist-val'].methodology = 'POV4/POVN4 = 跨 RouteViews 采集点的 IPv4 (prefix,origin) 验证计数;取 data1 最后一轮';
    byId['nist-val'].blobs = { entries: data1.length, lastSnapshot: metrics.rpkiValidation.snapshot };
  } catch (e) {
    byId['nist-val'].error = String(e && e.message ? e.message : e);
  }

  // 3) APNIC I-ROV
  try {
    const html = await fetchCache('apnic-rov', SOURCES.apnic.url);
    const parsed = parseApnicRov(html);
    metrics.rovFiltering = {
      periodLabel: 'I-RoV Filtering (7-day window, embedded in page)',
      pctLabel: 'inferred ROV filtering by AS path',
      ...parsed,
    };
    byId['apnic-rov'].fetchedAt = fetchedAt;
    byId['apnic-rov'].httpStatus = 200;
    byId['apnic-rov'].methodology = '解析 arrayToDataTable 区域块（Region -> I-RoV Filtering %, samples, weight）';
    byId['apnic-rov'].blobs = { blocks: extractDataTableBlocks(html).length };
  } catch (e) {
    byId['apnic-rov'].error = String(e && e.message ? e.message : e);
  }

  // 4) Cloudflare roaStats
  try {
    const query = '{ roaStats{ ta count } }';
    const r = await fetch(SOURCES.cloudflare.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ query }),
    });
    const j = await r.json();
    byId['cloudflare-rpki'].fetchedAt = fetchedAt;
    byId['cloudflare-rpki'].httpStatus = r.status;
    byId['cloudflare-rpki'].methodology = 'GraphQL roaStats{ta count} 聚合';
    metrics.roaRegistry = parseCloudflareRoa(j?.data?.roaStats ?? []);
  } catch (e) {
    byId['cloudflare-rpki'].error = String(e && e.message ? e.message : e);
  }

  // 5) BGPsec 部署占比：如实记录无实时全局计数器
  metrics.bgpsec = {
    productionDeployment: '≈0 (无权威实时全局计数器)',
    evidence: [
      'NIST/APNIC/Cloudflare 三处运营测量生态均无 BGPsec 签名公告数据集（只有 RPKI-ROV 口径）；',
      'RFC 8205 为 Standards Track（Proposed Standard），RFC 编辑器可见；',
      '报告 §7 列出的权威机制分析（Lychev/Goldberg/Schapira SIGCOMM\'13；RFC 8205 的 AS 不支持则剥离 BGPsec 属性）',
    ],
    verdictNote: '「BGPsec 生产部署接近 0」是依据标准状态 + 测量生态缺失 + 机制分析的综合判断，不是来自某个计数器。',
  };

  const out = {
    schema: 1,
    generatedAt: fetchedAt,
    generator: 'dsh-research/scripts/net-measure.mjs',
    notes: [
      '本文件为联网测量原始结果，供报告 upgrade V7/V8/V9 引用；research/ 已 gitignore，',
      '由 archive-research 归档为 art-14。',
      '诚实性：APNIC I-ROV 是按路径推断的过滤占比，非官方“强制落地”；NIST /Cov 不测量 ROV 部署。',
    ],
    sources,
    metrics,
  };

  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n');
  console.log(`net-measure 完成 → ${outFile}${offline ? '（offline 解析缓存）' : ''}`);
  for (const s of sources) {
    const st = s.error ? `✗ ${s.error}` : `✓ ${s.blobs ? JSON.stringify(s.blobs) : 'rows parsed'}`;
    console.log(`  ${s.id.padEnd(18)} ${st}`);
  }
  return out;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => { console.error('net-measure failed:', e); process.exit(1); });
}
