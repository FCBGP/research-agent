#!/usr/bin/env node
// build.mjs — 为 npm 打包构建可发行 staging 树（把 src/ 纯 TS 构建为 Node ESM JS）。
//
// 为什么需要构建：
//   Node 24 的类型剥离（--experimental-strip-types，默认开启）**不允许 node_modules 下
//   的 .ts** —— `Stripping types is currently unsupported for files under node_modules`。
//   本地 symlink 部署能跑 .ts，是因为 symlink realpath 逃逸出 node_modules 目录；
//   npm 实装包（dsh plugin --profile research add @basil/dsh-research）是 node_modules
//   下的真实拷贝 → 5 个 host 插件直接 import 失败（researchCore 缺失）。
//
// 本脚本读取仓库 dsh-research/，产出完整 staging 包：
//   staging/
//     package.json        （main/exports 指向 .js，files 白名单，去掉 prepack）
//     README.md  cordis.patch.yml  presets/  patches/  skills/  scripts/runtime-smoke.mjs
//     src/                （.ts → .js 类型剥离 + 相对 import 后缀 .ts → .js；非 ts 文件原样复制）
//
// dev 模式（deploy-profile.sh 的 symlink）不走本脚本，保持「改 src 立即生效」。
//
// 用法:
//   node scripts/build.mjs [--out <dir>]     # 默认 <repo>/dist/.staging/package
//   node scripts/build.mjs --out /tmp/pkg     # 自定义输出目录（会先清空）
//
// 零依赖：只用 node:module 的 stripTypeScriptTypes（Node ≥ 22.6/24，strip 模式）。
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = join(HERE, '..');
const REPO_ROOT = join(PKG_DIR, '..');
const DEFAULT_OUT = join(REPO_ROOT, 'dist', '.staging', 'package');

function parseArgs(argv) {
  const out = DEFAULT_OUT;
  const args = argv.slice(2);
  let outDir = out;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--out') outDir = args[i + 1] ?? out;
    else if (args[i].startsWith('--out=')) outDir = args[i].slice('--out='.length);
  }
  return { outDir };
}

/** 递归遍历目录，返回所有文件相对路径（按 'OS 无关' 的正斜杠）。 */
function walkFiles(dir, base = dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, base, acc);
    else if (entry.isFile()) acc.push(relative(base, full).split(sep).join('/'));
  }
  return acc;
}

/** 相对 import/export 的 `.ts` 后缀 → `.js`（for `from '…'` 与动态 `import('…')`）。 */
function rewriteRelativeExt(code) {
  return code.replace(/(\b(?:from\s*|import\s*\(\s*)['"])(\.\.?\/[^'"]+?)\.ts(['"])/g, '$1$2.js$3');
}

/** 类型剥离 + 相对后缀改写。 */
function buildSource(code) {
  const stripped = stripTypeScriptTypes(code, { mode: 'strip' });
  return rewriteRelativeExt(stripped);
}

/** 逐字段改写 package.json：main/exports 指向 .js，files 白名单，去掉会跑单测的 prepack。 */
function stagedPackageJson(pkg) {
  const next = JSON.parse(JSON.stringify(pkg));
  const toJs = (p) => p.replace(/\.ts$/, '.js');
  // scripts：staging 里不再需要仓库内脚本（prepack 会在 npm pack 时跑 node --test 但
  // staging 没有 *.test.ts，行为无意义；直接清空避免误导）。
  next.scripts = {};
  next.main = toJs(pkg.main);
  const exportsOut = {};
  // 容器内只发编译后 JS，不带 .d.ts：exports 用纯字符串目标（去掉条件对象里的 types 指向 .js）。
  for (const [key, value] of Object.entries(pkg.exports ?? {})) {
    if (typeof value === 'string') exportsOut[key] = toJs(value);
    else if (value && typeof value === 'object' && typeof value.default === 'string') exportsOut[key] = toJs(value.default);
    else exportsOut[key] = value;
  }
  next.exports = exportsOut;
  next.files = [
    'src',
    'cordis.patch.yml',
    'presets',
    'patches',
    'skills',
    'scripts/runtime-smoke.mjs',
    'README.md',
  ];
  return next;
}

const { outDir } = parseArgs(process.argv);
const pkg = JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8'));

// 1) 清空并重建 outDir
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// 2) src 构建：.ts（排除 *.test.ts）→ .js；非 .ts 原样复制
const srcDir = join(PKG_DIR, 'src');
const outSrc = join(outDir, 'src');
let tsCount = 0;
let copiedCount = 0;
for (const rel of walkFiles(srcDir)) {
  const source = join(srcDir, rel);
  const dest = join(outSrc, rel);
  mkdirSync(dirname(dest), { recursive: true });
  if (rel.endsWith('.ts')) {
    if (rel.endsWith('.test.ts')) continue; // 单测不进发行包（src 里执行）
    const code = buildSource(readFileSync(source, 'utf8'));
    writeFileSync(dest.replace(/\.ts$/, '.js'), code, 'utf8');
    tsCount += 1;
  } else {
    cpSync(source, dest);
    copiedCount += 1;
  }
}

// 3) 非 src 运行时/验证资产复制
for (const rel of ['README.md', 'cordis.patch.yml', 'presets', 'patches', 'skills', 'scripts/runtime-smoke.mjs']) {
  const source = join(PKG_DIR, rel);
  if (!existsSync(source)) throw new Error(`missing package asset: ${source}`);
  const dest = join(outDir, rel);
  if (statSync(source).isDirectory()) cpSync(source, dest, { recursive: true });
  else { mkdirSync(dirname(dest), { recursive: true }); cpSync(source, dest); }
}

// 4) staged package.json
writeFileSync(join(outDir, 'package.json'), JSON.stringify(stagedPackageJson(pkg), null, 2) + '\n', 'utf8');

const totalJs = walkFiles(outSrc).filter((f) => f.endsWith('.js')).length;
console.log(`build OK: ${outDir}`);
console.log(`  ts→js: ${tsCount}  src files copied: ${copiedCount}  js total: ${totalJs}`);
console.log(`  main: ${pkg.main} → ${stagedPackageJson(pkg).main}`);
