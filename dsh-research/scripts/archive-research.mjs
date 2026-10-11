#!/usr/bin/env node
// archive-research.mjs — 归档：把 `research/` 四文件写回 Memory artifact store（报告自标 art-1…art-14）。
//
// 背景：`research/`（报告 md + 网格结果 json + 网格驱动 ts）自 2026-10-09 起 gitignore、
// 不再入 git；归档走 Memory artifact store（docs/research-agent-migration-plan.md §5.2）。
// 本脚本读四文件 → 14 件 artifact（art-1…art-14，槽位见 src/archive/archive-research.ts）→
// persistMemory 落盘 <dir>/research-memory.json；--check 回读断言可追溯。
//
// 用法:
//   node dsh-research/scripts/archive-research.mjs                    # 默认写 <repo>/storage/research
//   node dsh-research/scripts/archive-research.mjs --dir /path/mem --check
//   RESEARCH_MEMORY_DIR=/path/mem node dsh-research/scripts/archive-research.mjs --check
//
// 落盘目录与 profile 运行时记忆同构：把该目录配到 research-core 的 config.memory.dir
// （profiles/research/cordis.patch.yml 整行覆盖 research-core），下一次 `dsh research`
// boot 即经 loadMemoryInto 载入归档（migration-plan §5.1 的"载入可开"）。
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { archiveResearchFiles, verifyArchive, RESEARCH_FILES } from '../src/archive/archive-research.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const RESEARCH_DIR = join(REPO_ROOT, 'research');
const DEFAULT_MEMORY_DIR = join(REPO_ROOT, 'storage', 'research');

function usage(code = 0) {
  console.log(`用法: node dsh-research/scripts/archive-research.mjs [--dir <memoryDir>] [--check]
  --dir <path>    memory 落盘目录（写 <dir>/research-memory.json）；等价环境变量 RESEARCH_MEMORY_DIR
                  默认: ${DEFAULT_MEMORY_DIR}
  --check         写盘后回读并断言 art-1…art-14 全部可追溯
  --help          本帮助`);
  process.exit(code);
}

const argv = process.argv.slice(2);
let memoryDir = process.env.RESEARCH_MEMORY_DIR ?? DEFAULT_MEMORY_DIR;
let doCheck = false;
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === '--dir') {
    memoryDir = argv[i + 1] ?? memoryDir;
    i += 1; // 消费值，避免下一轮把目录当参数
  } else if (a.startsWith('--dir=')) memoryDir = a.slice('--dir='.length);
  else if (a === '--check') doCheck = true;
  else if (a === '--help' || a === '-h') usage(0);
  else {
    console.error(`unknown arg: ${a}`);
    usage(2);
  }
}
memoryDir = resolve(memoryDir);

if (!existsSync(RESEARCH_DIR)) {
  console.error(`error: research/ dir not found: ${RESEARCH_DIR}`);
  process.exit(1);
}
for (const f of Object.values(RESEARCH_FILES)) {
  if (!existsSync(join(RESEARCH_DIR, f))) {
    console.error(`error: missing research/${f} (research/ 已 gitignore，需本地保留)`);
    process.exit(1);
  }
}

const report = archiveResearchFiles({ researchDir: RESEARCH_DIR, memoryDir });
const first = report.artifacts[0]?.id;
const last = report.artifacts[report.artifacts.length - 1]?.id;
console.log(`归档完成 → ${report.file}`);
console.log(`  artifact: ${report.artifacts.length} 件（${first}…${last}）`);
for (const a of report.artifacts) console.log(`    ${a.id}  [${a.kind}]  ${a.title}`);
console.log(`  episodic: ${report.episodes} 条审计轨迹`);
for (const f of report.researchFiles) console.log(`  ✓ ${f} 已写回 Memory artifact store`);

if (!doCheck) {
  console.log('\n提示：--check 回读断言；把落盘目录配到 research-core 的 config.memory.dir 即随 dsh research 载入。');
  process.exit(0);
}

const v = verifyArchive(memoryDir);
if (v.ok) {
  console.log(`\nARCHIVE CHECK PASS — ${v.artifacts.length}/14 art ids OK，全部可追溯（claimId/verdict/来源原文）`);
  process.exit(0);
}
console.error('\nARCHIVE CHECK FAIL');
for (const issue of v.issues) console.error(`  - ${issue}`);
process.exit(1);
