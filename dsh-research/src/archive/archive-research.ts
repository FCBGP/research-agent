// archive-research.ts — 归档：把 `research/` 四文件写回 Memory artifact store（报告自标 art-1…art-14）。
//
// 背景：`research/`（报告 RPKI-BGPsec-security-gaps.md + 网格结果 sim-grid-results.json +
// 网格驱动 sim-grid.ts）自 2026-10-09 起加入 .gitignore、不再入 git；归档走 Memory
// artifact store（docs/research-agent-migration-plan.md §5.2）。本模块把四文件读入
// ArtifactStore 并经 persistMemory() 落盘为 <dir>/research-memory.json，产出**与报告自标
// 一致**的 art-1…art-14：
//
//   art-1 … art-10  → 报告 §4 核验表 V1…V10 逐行归档（kind=result，title `verdict: V<n>`，
//                     claimId=V<n>，与 runtime 的 verdict: <claimId> 归档同名同语义）
//   art-11           → 报告 §6「基建修复」note（research_campaign attackClass 未透传，
//                     inferAttack 覆盖；kind=note）
//   art-12           → research/sim-grid-results.json 全文（kind=result，meta 附驱动源
//                     sim-grid.ts，seed=7 / engine=route-engine-sim / simulated=true 如实标注）
//   art-13           → 报告全文 research/RPKI-BGPsec-security-gaps.md（kind=report）
//   art-14           → research/net-measure-results.json 全文（kind=result）——联网测量原始结果
//
// 全部内容来自四文件原文（逐字 / 正则解析），不引入模型生成内容（AGENTS.md §9 铁律）；
// 零外部依赖（node:fs + memory 层）。ArtifactStore 自增 id = art-<seq>，恰为 art-1…art-13。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createMemory, loadMemoryInto, persistMemory, type ResearchMemory } from '../memory/index.ts';
import type { ArtifactKind } from '../core/artifact-store.ts';

/** `research/` 三个归档文件（2026-10-09 起 gitignore，不入 git）。 */
export const RESEARCH_FILES = {
  report: 'RPKI-BGPsec-security-gaps.md',
  grid: 'sim-grid-results.json',
  driver: 'sim-grid.ts',
  measure: 'net-measure-results.json',
} as const;

export interface ArchiveInput {
  /** 含三文件的 research/ 目录。 */
  researchDir: string;
  /** persistMemory 落盘目录（写 <dir>/research-memory.json）。 */
  memoryDir: string;
}

export interface ArtifactSummary {
  id: string;
  kind: ArtifactKind;
  title: string;
}

export interface ArchiveReport {
  /** 写出的 research-memory.json 全路径。 */
  file: string;
  /** 归档的三文件相对路径（research/…）。 */
  researchFiles: string[];
  /** 生成的 artifact（按插入序 = art-1…art-13）。 */
  artifacts: ArtifactSummary[];
  episodes: number;
}

export interface VerifyReport {
  ok: boolean;
  issues: string[];
  artifacts: ArtifactSummary[];
}

/** 报告 §4 核验表一行的解析结果（表头/分隔行不匹配，仅 V<num> 数据行）。 */
export interface VerdictRow {
  id: string;
  claim: string;
  type: string;
  evidence: string;
  experiment: string;
  verdict: string;
}

const VERDICT_ROW_RE = /^\|\s*(V\d+)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|$/;

export function parseVerdictRow(line: string): VerdictRow | undefined {
  const m = VERDICT_ROW_RE.exec(line);
  if (!m) return undefined;
  const [, id, claim, type, evidence, experiment, verdict] = m;
  return {
    id,
    claim: claim.trim(),
    type: type.trim(),
    evidence: evidence.trim(),
    experiment: experiment.trim(),
    verdict: verdict.trim().replace(/\*\*/g, ''),
  };
}

/** 报告全文 → 核验表数据行（按 V1…V10 顺序）。 */
export function parseVerdictRows(reportText: string): VerdictRow[] {
  const out: VerdictRow[] = [];
  for (const line of reportText.split('\n')) {
    const row = parseVerdictRow(line);
    if (row) out.push(row);
  }
  return out;
}

/** 报告中以 `- ` 开头的第 1 条含 keyword 的 bullet（未命中返回 undefined）。 */
export function findBullet(reportText: string, keyword: string): string | undefined {
  for (const line of reportText.split('\n')) {
    const t = line.trim();
    if (t.startsWith('- ') && t.includes(keyword)) return t;
  }
  return undefined;
}

function findVerdictRowLine(reportText: string, id: string): string {
  for (const line of reportText.split('\n')) {
    if (parseVerdictRow(line)?.id === id) return line.trim();
  }
  return id;
}

function buildMemory(researchDir: string): { memory: ResearchMemory; artifacts: ArtifactSummary[] } {
  const reportText = readFileSync(join(researchDir, RESEARCH_FILES.report), 'utf8');
  const gridText = readFileSync(join(researchDir, RESEARCH_FILES.grid), 'utf8').trim();
  const driverText = readFileSync(join(researchDir, RESEARCH_FILES.driver), 'utf8');
  const measureText = readFileSync(join(researchDir, RESEARCH_FILES.measure), 'utf8').trim();

  const rows = parseVerdictRows(reportText);
  if (rows.length !== 10) {
    throw new Error(`expected 10 verdict rows (V1..V10) in ${RESEARCH_FILES.report}, parsed ${rows.length}`);
  }

  const memory = createMemory();
  const artifacts: ArtifactSummary[] = [];

  // art-1 … art-10：报告 §4 核验表 V1…V10 逐行归档（kind=result，title `verdict: <id>`）。
  for (const row of rows) {
    const a = memory.artifact.put({
      kind: 'result',
      title: `verdict: ${row.id}`,
      body: findVerdictRowLine(reportText, row.id),
      claimId: row.id,
      meta: {
        verdict: row.verdict,
        claimType: row.type,
        evidence: row.evidence,
        experiment: row.experiment,
        source: `research/${RESEARCH_FILES.report} §4`,
      },
    });
    artifacts.push({ id: a.id, kind: a.kind, title: a.title });
  }

  // art-11：报告 §6「基建修复」note —— research_campaign attackClass 未透传至 executor。
  const attackBullet = findBullet(reportText, 'attackClass');
  const a11 = memory.artifact.put({
    kind: 'note',
    title: 'bug: research_campaign attackClass 未透传至 executor（inferAttack 覆盖）',
    body: attackBullet ?? 'research_campaign 的 attackClass 未透传至 executor（inferAttack 覆盖）',
    meta: {
      source: `research/${RESEARCH_FILES.report} §6`,
      related: ['src/experiment/runner.ts', 'src/experiment/executors.ts'],
    },
  });
  artifacts.push({ id: a11.id, kind: a11.kind, title: a11.title });

  // art-12：research/sim-grid-results.json 全文（kind=result），meta 附驱动源 sim-grid.ts。
  // n 自网格汇总行 TOTAL_CELLS=… 解析（基线 16 + coverage 扫描 + deployment 扫描 = 120 格），
  // 免硬编码漂移；meta 如实标 engine=route-engine-sim / simulated=true（V4/V5 条件性参数化）。
  const cells = /TOTAL_CELLS=(\d+)/.exec(gridText)?.[1] ?? '16';
  const a12 = memory.artifact.put({
    kind: 'result',
    title: `sim-grid: 4 攻击类 × 4 验证策略 × ${cells} 格（基线+coverage+deployment 扫描，seed=7, route-engine-sim, simulated=true）`,
    body: gridText,
    meta: {
      source: `research/${RESEARCH_FILES.grid}`,
      driver: `research/${RESEARCH_FILES.driver}`,
      driverSource: driverText,
      engine: 'route-engine-sim',
      seed: 7,
      n: Number(cells),
      reps: 8,
      simulated: true,
      artifactId: 'art-12',
    },
  });
  artifacts.push({ id: a12.id, kind: a12.kind, title: a12.title });

  // art-13：报告全文（kind=report）。
  const reportTitle = reportText.split('\n')[0]?.replace(/^#\s*/, '').trim() || 'RPKI+BGPsec 的安全缺口——系统梳理与实验核验报告';
  const a13 = memory.artifact.put({
    kind: 'report',
    title: reportTitle,
    body: reportText,
    meta: {
      source: `research/${RESEARCH_FILES.report}`,
      completedAt: '2026-10-08',
      task: 'dsh research "研究 RPKI+BGPsec 的安全缺口"',
      artifactId: 'art-13',
    },
  });
  artifacts.push({ id: a13.id, kind: a13.kind, title: a13.title });

  // art-14：research/net-measure-results.json 全文（kind=result）——联网测量原始结果
  // （ROA 覆盖 / ROV 强制落地推断 / BGPsec 部署占比，NIST/APNIC/Cloudflare 实采，2026-10-09）。
  const a14 = memory.artifact.put({
    kind: 'result',
    title: 'net-measure: 联网测量原始结果（ROA 覆盖/ROV 强制/BGPsec 部署，2026-10-09）',
    body: measureText,
    meta: {
      source: `research/${RESEARCH_FILES.measure}`,
      generator: 'dsh-research/scripts/net-measure.mjs',
      artifactId: 'art-14',
    },
  });
  artifacts.push({ id: a14.id, kind: a14.kind, title: a14.title });

  // episodic 审计轨迹：一次决策 + 每文件一条 note（记录三文件各自去向）。
  memory.episodic.record({
    kind: 'decision',
    summary: '归档：research/ 三文件写回 Memory artifact store（报告自标 art-1…art-13）',
    meta: { artifactRange: 'art-1…art-13' },
  });
  for (const f of [RESEARCH_FILES.report, RESEARCH_FILES.grid, RESEARCH_FILES.driver, RESEARCH_FILES.measure]) {
    memory.episodic.record({ kind: 'note', summary: `归档 research/${f}`, meta: { source: `research/${f}` } });
  }

  return { memory, artifacts };
}

/** 归档主入口：读三文件 → 13 件 artifact → persistMemory 落盘。 */
export function archiveResearchFiles(input: ArchiveInput): ArchiveReport {
  const missing = Object.values(RESEARCH_FILES).filter((f) => !existsSync(join(input.researchDir, f)));
  if (missing.length > 0) {
    throw new Error(`missing research files: ${missing.join(', ')} (researchDir=${input.researchDir})`);
  }
  const { memory, artifacts } = buildMemory(input.researchDir);
  const file = persistMemory(memory, input.memoryDir);
  return {
    file,
    researchFiles: Object.values(RESEARCH_FILES).map((f) => `research/${f}`),
    artifacts,
    episodes: memory.episodic.all().length,
  };
}

/** 从落盘点回读并断言 14 件归档（art-1…art-14）均可追溯（CLI --check / 测试共用）。 */
export function verifyArchive(memoryDir: string): VerifyReport {
  const issues: string[] = [];
  const m = createMemory();
  loadMemoryInto(m, memoryDir);
  const items = m.artifact.store_.list();
  const expected = Array.from({ length: 14 }, (_, i) => `art-${i + 1}`);
  if (items.length !== 14) issues.push(`expected 14 artifacts, found ${items.length}`);
  for (let i = 0; i < expected.length; i += 1) {
    if (i >= items.length || items[i].id !== expected[i]) issues.push(`expected id[${i}]=${expected[i]}, found ${items[i]?.id}`);
  }

  for (let v = 1; v <= 10; v += 1) {
    const a = m.artifact.store_.get(`art-${v}`);
    if (a?.kind !== 'result' || a.title !== `verdict: V${v}`) issues.push(`art-${v} expected kind=result title=verdict: V${v}`);
  }
  const a11 = m.artifact.store_.get('art-11');
  if (a11?.kind !== 'note' || !String(a11.body).includes('attackClass')) issues.push('art-11 expected kind=note with attackClass body');
  const a12 = m.artifact.store_.get('art-12');
  if (a12?.kind !== 'result' || !String(a12.body).includes('TOTAL_CELLS=120')) issues.push('art-12 expected kind=result with sim-grid JSON body (TOTAL_CELLS=120)');
  const a13 = m.artifact.store_.get('art-13');
  if (a13?.kind !== 'report' || !String(a13.body).includes('# RPKI+BGPsec')) issues.push('art-13 expected kind=report with report body');
  const a14 = m.artifact.store_.get('art-14');
  if (a14?.kind !== 'result' || !String(a14.body).includes('rovFiltering')) issues.push('art-14 expected kind=result with net-measure JSON body');

  return { ok: issues.length === 0, issues, artifacts: items.map((a) => ({ id: a.id, kind: a.kind, title: a.title })) };
}
