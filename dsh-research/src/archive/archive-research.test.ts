// archive-research.test.ts — research/ 三文件 → Memory artifact store（art-1…art-13）往返自检。
// 依赖当前工作树 research/（2026-10-09 起 gitignore、不入 git）；克隆缺 research/ 时跳过，
// 保证主力测试套在干净克隆上仍全绿。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { archiveResearchFiles, verifyArchive, parseVerdictRow, parseVerdictRows, findBullet } from './archive-research.ts';
import { createMemory, loadMemoryInto } from '../memory/index.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..');
const RESEARCH_DIR = join(REPO_ROOT, 'research');
const REPORT_FILE = 'RPKI-BGPsec-security-gaps.md';
const GRID_FILE = 'sim-grid-results.json';
const DRIVER_FILE = 'sim-grid.ts';
const MEASURE_FILE = 'net-measure-results.json';

const skipNoResearch = !existsSync(join(RESEARCH_DIR, REPORT_FILE));

function tmpMem(): string {
  return mkdtempSync(join(tmpdir(), 'dsh-research-archive-'));
}

test('parse: 报告的核验表解析出恰 10 行 V1…V10', { skip: skipNoResearch }, () => {
  const text = readFileSync(join(RESEARCH_DIR, REPORT_FILE), 'utf8');
  const rows = parseVerdictRows(text);
  assert.equal(rows.length, 10);
  assert.deepEqual(rows.map((r) => r.id), ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10']);
  assert.equal(rows[0].verdict, 'verified');
  // V4/V5 条件性 disputed 已展开：verdict 收敛为「verified（条件性）」——
  // 全覆盖/全部署数字保留，实测锚点与覆盖 0 端点同时入句（§3.1/§3.2）。
  assert.equal(rows[3].verdict, 'verified(条件性：全覆盖≈0.79，实测覆盖→≈0.73，覆盖0→≈0.10)');
  assert.equal(rows[4].verdict, 'verified(条件性：全部署≈0.94，dep⁴链完整度，实测部署→≈0.10)');
  assert.ok(parseVerdictRow('| ID | 主张 | 类型 | 证据 | 实验 | verdict |') === undefined, '表头不匹配');
  assert.ok(parseVerdictRow('|---|---|---|---|---|---|') === undefined, '分隔行不匹配');
});

test('archive: 四文件 → 14 件 artifact（art-1…art-14）并可回读验证', { skip: skipNoResearch }, () => {
  const dir = tmpMem();
  const report = archiveResearchFiles({ researchDir: RESEARCH_DIR, memoryDir: dir });
  assert.ok(report.file.endsWith('research-memory.json'));
  assert.equal(report.artifacts.length, 14);
  assert.equal(report.artifacts[0].id, 'art-1');
  assert.equal(report.artifacts[12].id, 'art-13');
  assert.equal(report.artifacts[13].id, 'art-14');
  assert.equal(report.researchFiles.length, 4);
  assert.equal(report.episodes, 5); // 1 decision + 4 file notes

  const v = verifyArchive(dir);
  assert.equal(v.ok, true, v.issues.join('\n'));
  assert.equal(v.artifacts.length, 14);
});

test('archive: 报告自标的 art-11/art-12/art-13/art-14 落在指定槽位', { skip: skipNoResearch }, () => {
  const dir = tmpMem();
  const r = archiveResearchFiles({ researchDir: RESEARCH_DIR, memoryDir: dir });
  const a11 = r.artifacts[10];
  const a12 = r.artifacts[11];
  const a13 = r.artifacts[12];
  const a14 = r.artifacts[13];
  assert.equal(a11.kind, 'note');
  assert.equal(a11.title.includes('attackClass'), true);
  assert.equal(a12.kind, 'result');
  assert.equal(a12.title.includes('sim-grid'), true);
  assert.equal(a13.kind, 'report');
  assert.equal(a13.title.includes('RPKI+BGPsec'), true);
  assert.equal(a14.kind, 'result');
  assert.equal(a14.title.includes('net-measure'), true);
});

test('archive: 全部内容来自文件原文，无凭空生成', { skip: skipNoResearch }, () => {
  const dir = tmpMem();
  archiveResearchFiles({ researchDir: RESEARCH_DIR, memoryDir: dir });
  const m = createMemory();
  loadMemoryInto(m, dir);
  const get = (id: string) => m.artifact.store_.get(id)!;

  // art-13 = 报告全文（逐字节）；art-12 = 网格结果全文；art-14 = 联网测量结果全文；art-11 = 报告 §6 原文 bullet。
  assert.equal(get('art-13').body, readFileSync(join(RESEARCH_DIR, REPORT_FILE), 'utf8'));
  assert.equal(get('art-12').body, readFileSync(join(RESEARCH_DIR, GRID_FILE), 'utf8').trim());
  assert.equal(get('art-14').body, readFileSync(join(RESEARCH_DIR, MEASURE_FILE), 'utf8').trim());
  const bullet = findBullet(readFileSync(join(RESEARCH_DIR, REPORT_FILE), 'utf8'), 'attackClass');
  assert.ok(bullet !== undefined, 'report §6 should mention attackClass');
  assert.equal(get('art-11').body, bullet);
  // art-1 = 核验表 V1 原文行。
  const v1line = readFileSync(join(RESEARCH_DIR, REPORT_FILE), 'utf8')
    .split('\n').filter((l) => parseVerdictRow(l)?.id === 'V1')[0].trim();
  assert.equal(get('art-1').body, v1line);
  // art-12 驱动源随 meta 归档（三文件之一 sim-grid.ts）。
  const meta = get('art-12').meta as { driver: string; driverSource?: string };
  assert.equal(meta.driver, `research/${DRIVER_FILE}`);
  assert.ok(String(meta.driverSource ?? '').includes('RouteEngineSim'), 'sim-grid.ts 源应随 art-12 meta 归档');
});

test('archive: 幂等可复现（两次归档同一文件 → 相同 id 序列）', { skip: skipNoResearch }, () => {
  const d1 = tmpMem();
  const d2 = tmpMem();
  const r1 = archiveResearchFiles({ researchDir: RESEARCH_DIR, memoryDir: d1 });
  const r2 = archiveResearchFiles({ researchDir: RESEARCH_DIR, memoryDir: d2 });
  assert.deepEqual(r1.artifacts.map((a) => a.id), r2.artifacts.map((a) => a.id));
  assert.deepEqual(r1.artifacts.map((a) => a.title), r2.artifacts.map((a) => a.title));
  assert.equal(r1.researchFiles.length, 4);
});
