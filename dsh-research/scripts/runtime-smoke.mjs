// runtime-smoke.mjs — 用 dsh 自己的 boot() 装载 research profile，验证端到端挂载：
//   researchCore 是否提供、research_* 工具是否注册、BGP claim→verify 冒烟闭环。
//
// 用法（先部署 profile）:
//   DSH_HOME=/tmp/dsh-home ./dsh-research/scripts/deploy-profile.sh
//   DSH_HOME=/tmp/dsh-home node dsh-research/scripts/runtime-smoke.mjs
//
// 需要 DSH_INSTALL_ROOT（全局 dsh 安装目录）; 未设则用 `npm root -g` 推导。
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const home = process.env.DSH_HOME ?? join(process.env.HOME ?? '/tmp', '.dsh');
process.env.DSH_HOME = home;
process.env.DSH_TELEMETRY_DISABLED = '1';

let globalRoot = process.env.DSH_INSTALL_ROOT ?? '';
if (!globalRoot) {
  try { globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(); } catch { /* ignore */ }
}
const NODE_ROOT = globalRoot ? join(globalRoot, '@deepseek-ai', 'dsh') : '';
if (!existsSync(NODE_ROOT)) {
  console.error(`DSH install not found at ${NODE_ROOT}; set DSH_INSTALL_ROOT to the @deepseek-ai/dsh package dir`);
  process.exit(1);
}

const INSTALL_ANCHOR = join(NODE_ROOT, 'package.json');
const { loadProfile, readProfilePatches, boot, PluginPackages, createRuntimeResolution } =
  await import('file://' + join(NODE_ROOT, 'node_modules/@deepseek-ai/dsh-app-boot/lib/index.js'));

const profile = loadProfile('dsh', 'research', INSTALL_ANCHOR, home, { userLayer: true });
const resolution = await createRuntimeResolution({ installAnchor: INSTALL_ANCHOR, profile });
const profileContext = {
  name: 'research',
  dir: profile.dir,
  patchPath: profile.patchPath,
  installAnchor: INSTALL_ANCHOR,
  startedBundles: profile.layers.map((l) => l.packageName),
  cwd: process.cwd(),
  home,
  overlays: [],
  telemetryDisabledEnv: '1',
};
const patches = readProfilePatches('dsh', profileContext, profile);
const rootConfig = join(profile.dir, 'cordis.yml');
// 复刻 prepareProfile：缺失时写入空根配置（dsh --dump-config 也会做同样的事）。
if (!existsSync(rootConfig)) writeFileSync(rootConfig, '[]\n', 'utf8');

let ctx;
try {
  ctx = await boot('dsh', rootConfig, patches, async (hostCtx) => {
    hostCtx.provide('profileContext', profileContext);
    await hostCtx.plugin(PluginPackages, { resolution });
  });
} catch (err) {
  console.error('BOOT FAILED:', err?.stack ?? err);
  process.exit(1);
}

console.log('boot ctx fiber state:', ctx.fiber.state);
console.log('researchCore provided?', ctx.get('researchCore') !== undefined ? 'YES' : 'NO');

const tools = ctx.get('tools');
const researchTools = tools?.schemas?.().map((t) => t.name).filter((n) => n.startsWith('research_')) ?? [];
console.log('research tools mounted:', researchTools.length ? researchTools.join(', ') : '(none)');

const core = ctx.get('researchCore');
let verdict = '(researchCore missing)';
if (core) {
  let claim = core.claims.create({ statement: 'BGP 源地址验证依赖 ROA 限定来源 AS', type: 'Hypothesis', source: 'RFC8481' });
  claim = core.claims.addEvidence(claim, { source: 'RFC8481', evidence: 'ROA 限定合法来源 AS', confidence: 0.9 });
  const report = core.verify.claim(claim, { experiment: 'sim', claim: claim.id, outcome: 'support', data: {}, archivedAt: new Date().toISOString() });
  verdict = report.verdict;
  console.log('smoke verdict:', verdict, '| rationale:', report.rationale);
}

const ok = core !== undefined && researchTools.length === 2 && verdict === 'verified';
await ctx.fiber.dispose();
console.log('disposed OK');
console.log(ok ? 'SMOKE PASS' : 'SMOKE FAIL');
process.exit(ok ? 0 : 2);
