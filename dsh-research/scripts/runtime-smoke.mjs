// runtime-smoke.mjs — 用 dsh 自己的 boot() 装载 research profile，验证端到端挂载：
//   researchCore / researchMemory / researchAgents / researchDirector 服务、
//   research_* 工具集、BGP claim→verify 冒烟闭环。
//
//   复刻 CLI 的 provideCmdline（cmdlineArgs/appExit），使含 @deepseek-ai/dsh-web-app
//   前端的组合也能完整 boot；web 基座不接受位置参数，故只给 --no-open 等 flag，
//   不驱动任何一次性 CLI 任务（web 会话走浏览器 Web UI）。
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
// 与 profile-boot.js 一致：前端（headless/web）都需要 cmdlineArgs/appExit 才能挂载。
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
      // 只验证“能 boot”，不真的驱动 LLM：web 基座拒绝位置参数，仅给 --no-open
      // 避免沙箱尝试打开浏览器；可选 SMOKE_PORT 避免端口冲突。
      args: (process.env.SMOKE_ARGS ? process.env.SMOKE_ARGS.split(' ') : ['--no-open'])
        .concat(process.env.SMOKE_PORT ? [`--port`, process.env.SMOKE_PORT] : []),
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

const EXPECTED = ['research_verify', 'research_record', 'research_search', 'research_review', 'research_experiment', 'research_campaign', 'research_paper', 'research_slides', 'research_autonomous', 'research_policy', 'research_job', 'research_schedule', 'research_reflect'];
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

// 阶段 3.6/4a 冒烟：Policy（10 条纪律）+ 一键科研流水线（论文 + 幻灯片 + campaign verdict）。
const policy = ctx.get('researchPolicy');
let policyOk = false;
if (policy?.view) {
  const v = policy.view();
  policyOk = v.enabled && v.rules.length === 10 && v.prompt.includes('Research Agent Policy');
  console.log('policy rules:', v?.rules?.length, '| enabled:', v?.enabled);
}

const autoSvc = ctx.get('researchAutonomous');
let autoOk = false;
if (autoSvc?.run) {
  const report = autoSvc.run({
    topic: 'RPKI+BGPsec 安全缺口',
    hypothesis: 'ROV 提升 prefix 劫持检测率（hijack）',
    validator: 'rov', supportThreshold: 0.6, repetitions: 3, seed: 1,
  });
  autoOk = report?.campaign?.verdict === 'verified'
    && report?.paper?.includes('## 1. 背景与研究问题')
    && report?.slides?.split(/\n---\n/).length >= 8
    && (report?.artifacts?.length ?? 0) > 0
    && report?.summary?.includes('已核验');
  console.log('autonomous verdict:', report?.campaign?.verdict, '| slides pages:', report?.slides?.split(/\n---\n/).length, '| artifacts:', report?.artifacts?.length);
}

// 阶段 4b 冒烟：长任务队列（job）+ 一次性调度（schedule）+ 自省（reflect）。
const jobSvc = ctx.get('researchJobs');
let jobOk = false;
if (jobSvc?.submit) {
  const job = jobSvc.submit({ kind: 'campaign', title: 'smoke job', run: () => expSvc.runAutomatic({ claim: 'ROV 提升劫持检测率', repetitions: 2, validator: 'rov', supportThreshold: 0.6 }) });
  jobOk = ['done', 'failed'].includes(job.status) && jobSvc.get(job.id)?.status === job.status && jobSvc.list().length >= 1;
  console.log('job status:', job.status, '| kind:', job.kind);
}

const schedSvc = ctx.get('researchScheduler');
let schedOk = false;
if (schedSvc?.register && schedSvc?.tick) {
  schedSvc.register({ id: 'smoke-once', topic: 'RPKI 演进', at: new Date(Date.now() - 1000).toISOString() });
  const runs = schedSvc.tick();
  schedOk = runs.some((r) => r.scheduleId === 'smoke-once') && schedSvc.get('smoke-once')?.enabled === false;
  console.log('schedule runs:', runs.length, '| once disabled:', schedSvc.get('smoke-once')?.enabled === false);
}

const reflectSvc = ctx.get('researchSelfImprove');
let reflectOk = false;
if (reflectSvc?.reflect) {
  const ref = reflectSvc.reflect();
  reflectOk = ref.snapshot.episodes > 0 && ref.summary.includes('改进建议');
  console.log('reflect episodes:', ref.snapshot.episodes, '| recommendations:', ref.recommendations.length);
}

const servicesOk = ['researchCore', 'researchMemory', 'researchAgents', 'researchDirector', 'researchExperiment', 'researchWriter', 'researchPolicy', 'researchAutonomous', 'researchJobs', 'researchScheduler', 'researchSelfImprove'].every((s) => ctx.get(s) !== undefined);
const ok = servicesOk && toolOk && verdict === 'verified' && searchOk && campaignOk && policyOk && autoOk && jobOk && schedOk && reflectOk;
await ctx.fiber.dispose();
console.log('disposed OK');
console.log(ok ? 'SMOKE PASS' : 'SMOKE FAIL');
console.log(`summary: services=${servicesOk} tools(${researchTools.length}/${EXPECTED.length})=${toolOk} verdict=${verdict} search=${searchOk} campaign=${campaignOk} policy=${policyOk} autonomous=${autoOk} job=${jobOk} schedule=${schedOk} reflect=${reflectOk}`);
process.exit(ok ? 0 : 2);
