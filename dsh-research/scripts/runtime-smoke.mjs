// runtime-smoke.mjs — 用 dsh 自己的 boot() 装载 research profile，验证端到端挂载：
//   researchCore / researchMemory / researchAgents / researchDirector 服务、
//   research_* 工具集、BGP claim→verify 冒烟闭环。
//
//   复刻 CLI 的 provideCmdline（cmdlineArgs/appExit），使含 @deepseek-ai/dsh-headless
//   前端的组合也能完整 boot；headless 的一次性任务以异步方式启动并被 dispose 取消。
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
// 与 profile-boot.js 一致：headless 前端需要 cmdlineArgs/appExit 才能挂载。
const { provideCmdline } =
  await import('file://' + join(NODE_ROOT, 'node_modules/@deepseek-ai/dsh-cmdline/lib/index.js'));

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
let exitCode;
try {
  ctx = await boot('dsh', rootConfig, patches, async (hostCtx) => {
    hostCtx.provide('profileContext', profileContext);
    await hostCtx.plugin(PluginPackages, { resolution });
    provideCmdline(hostCtx, {
      // 只验证“能 boot”，不真的驱动 LLM：给一个平凡任务让 headless 前端挂载，
      // 其异步 run 会在下方 fiber.dispose() 时被取消。
      args: process.env.SMOKE_TASK ? [process.env.SMOKE_TASK] : ['smoke: research layer boot check'],
      exit: (code) => { exitCode = code; },
      ready: { onReady() { return () => {}; } },
    });
  });
} catch (err) {
  console.error('BOOT FAILED:', err?.stack ?? err);
  process.exit(1);
}

console.log('boot ctx fiber state:', ctx.fiber.state);
console.log('researchCore provided?', ctx.get('researchCore') !== undefined ? 'YES' : 'NO');
console.log('researchMemory provided?', ctx.get('researchMemory') !== undefined ? 'YES' : 'NO');
console.log('researchAgents provided?', ctx.get('researchAgents') !== undefined ? 'YES' : 'NO');
console.log('researchDirector provided?', ctx.get('researchDirector') !== undefined ? 'YES' : 'NO');

const tools = ctx.get('tools');
const researchTools = tools?.schemas?.().map((t) => t.name).filter((n) => n.startsWith('research_')) ?? [];
console.log('research tools mounted:', researchTools.length ? researchTools.join(', ') : '(none)');

const EXPECTED = ['research_verify', 'research_record', 'research_search', 'research_review', 'research_experiment', 'research_campaign'];
const toolOk = EXPECTED.every((n) => researchTools.includes(n));

const core = ctx.get('researchCore');
let verdict = '(researchCore missing)';
if (core) {
  let claim = core.claims.create({ statement: 'BGP 源地址验证依赖 ROA 限定来源 AS', type: 'Hypothesis', source: 'RFC8481' });
  claim = core.claims.addEvidence(claim, { source: 'RFC8481', evidence: 'ROA 限定合法来源 AS', confidence: 0.9 });
  const report = core.verify.claim(claim, { experiment: 'sim', claim: claim.id, outcome: 'support', data: {}, archivedAt: new Date().toISOString() });
  verdict = report.verdict;
  console.log('smoke verdict:', verdict, '| rationale:', report.rationale);
}

// 阶段 2 冒烟：本地语料检索应命中 RPKI 文献（走真实挂载的 researchAgents）。
const agents = ctx.get('researchAgents');
let searchOk = false;
if (agents?.literature) {
  const hits = agents.literature.search('RPKI origin validation', 2);
  searchOk = hits.length > 0;
  console.log('literature search hits:', hits.length);
}

// 阶段 3 冒烟：自动实验战役（确定性模拟拓扑）产出统计与 verdict。
const expSvc = ctx.get('researchExperiment');
let campaignOk = false;
let campaign = null;
if (expSvc?.runAutomatic) {
  campaign = expSvc.runAutomatic({
    claim: 'ROV 显著提升劫持检测率', repetitions: 3, validator: 'rov', supportThreshold: 0.6,
  });
  campaignOk = campaign?.verdict === 'verified' && campaign?.artifacts?.length >= 2 && campaign?.detection?.mean > 0.6;
  console.log('campaign verdict:', campaign?.verdict, '| detection mean:', campaign?.detection?.mean?.toFixed(3), '| artifacts:', campaign?.artifacts?.length);
}

const servicesOk = ['researchCore', 'researchMemory', 'researchAgents', 'researchDirector', 'researchExperiment'].every((s) => ctx.get(s) !== undefined);
const ok = servicesOk && toolOk && verdict === 'verified' && searchOk && campaignOk;
await ctx.fiber.dispose();
console.log('disposed OK');
console.log(ok ? 'SMOKE PASS' : 'SMOKE FAIL');
console.log(`summary: services=${servicesOk} tools(${researchTools.length}/${EXPECTED.length})=${toolOk} verdict=${verdict} search=${searchOk} campaign=${campaignOk}`);
process.exit(ok ? 0 : 2);
