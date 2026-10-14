// runtime-smoke.mjs — 用 dsh 自己的 boot() 装载 research profile，验证端到端挂载：
//   researchCore / researchMemory / researchAgents / researchDirector 服务、
//   research_* 工具集、BGP claim→verify 冒烟闭环。
//
//   复刻 CLI 的 provideCmdline（cmdlineArgs/appExit），使含 @deepseek-ai/dsh-web-app
//   前端的组合也能完整 boot；web 基座不接受位置参数，故只给 --no-open 等 flag，
//   不驱动任何一次性 CLI 任务（web 会话走浏览器 Web UI）。
//
// 阶段 7（--patch 链）扩展：SMOKE_OVERLAYS 把 `--patch` 覆盖层注入 boot 的 patch 栈
// （bundle → profile cordis.patch.yml → $DSH_HOME 层 → overlays，后层赢），验证组合链
// （base → research policy → bgp research → experiment-specific）不改坏运行时挂载；
// SMOKE_OVERLAYS 为空白/相对路径列表（相对运行 cwd 解析），例如:
//   SMOKE_OVERLAYS="dsh-research/patches/chain-research-policy.yml
//                   dsh-research/patches/chain-bgp-research.yml
//                   dsh-research/patches/chain-fcbgp-experiment.yml" \
//   DSH_HOME=/tmp/dsh-home node dsh-research/scripts/runtime-smoke.mjs
//
// 用法（先部署 profile）:
//   DSH_HOME=/tmp/dsh-home ./dsh-research/scripts/deploy-profile.sh
//   DSH_HOME=/tmp/dsh-home node dsh-research/scripts/runtime-smoke.mjs
//
// 需要 DSH_INSTALL_ROOT（全局 dsh 安装目录）; 未设则用 `npm root -g` 推导。
// 未显式给 SMOKE_PORT 时自动挑一个空闲端口（3080 被残留进程占用时避让）。
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';

const home = process.env.DSH_HOME ?? join(process.env.HOME ?? '/tmp', '.dsh');
process.env.DSH_HOME = home;
process.env.DSH_TELEMETRY_DISABLED = '1';

// 阶段 7（--patch 链）：把 SMOKE_OVERLAYS（空白分隔、相对运行 cwd 解析）作为 boot overlay，
// 与 CLI 的 `--patch` 同语义（loadOverlayPatches，缺失文件抛错）。overlays 解析放到
// app-boot 动态 import 之后（loadOverlayPatches 那一刻才可用）。
const SMOKE_OVERLAYS = (process.env.SMOKE_OVERLAYS ?? '')
  .split(/\s+/).map((p) => p.trim()).filter(Boolean)
  .map((file) => resolve(file));
let OVERLAYS = [];

// 未显式给 SMOKE_PORT 时自动挑一个空闲端口：从 4000 起扫 30 个，避开默认 3080 一带
// （沙箱里先前 boot 的僵尸进程可能仍占着默认端口，导致 boot 挂在端口上）。
async function pickFreePort(start = 4000) {
  for (let port = start; port <= start + 30; port += 1) {
    const ok = await new Promise((resolveOk) => {
      const svr = createServer();
      svr.once('error', () => resolveOk(false));
      svr.once('listening', () => svr.close(() => resolveOk(true)));
      svr.listen(port, '127.0.0.1');
    });
    if (ok) return port;
  }
  return null;
}

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
const { loadProfile, readProfilePatches, boot, PluginPackages, createRuntimeResolution, loadOverlayPatches } =
  await import('file://' + join(NODE_ROOT, 'node_modules/@deepseek-ai/dsh-app-boot/lib/index.js'));
OVERLAYS = SMOKE_OVERLAYS.flatMap((file) => loadOverlayPatches('dsh', file));
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
  overlays: OVERLAYS,
  telemetryDisabledEnv: '1',
};
const patches = readProfilePatches('dsh', profileContext, profile);
if (SMOKE_OVERLAYS.length > 0) {
  console.log('--patch overlays (SMOKE_OVERLAYS):', SMOKE_OVERLAYS.join(' -> '));
  console.log('--patch overlays parsed entries:', OVERLAYS.length, '(bundle+profile+home precede them; later wins)');
}
const rootConfig = join(profile.dir, 'cordis.yml');
// 复刻 prepareProfile：缺失时写入空根配置（dsh --dump-config 也会做同样的事）。
if (!existsSync(rootConfig)) writeFileSync(rootConfig, '[]\n', 'utf8');

let ctx;
let exitCode;
// 先解析空闲端口（resolve 在 boot 回调内使用）；SMOKE_PORT 显式给出时直接用它。
const smokePort = process.env.SMOKE_PORT ? Number(process.env.SMOKE_PORT) : (await pickFreePort() ?? 3080);
try {
  ctx = await boot('dsh', rootConfig, patches, async (hostCtx) => {
    hostCtx.provide('profileContext', profileContext);
    await hostCtx.plugin(PluginPackages, { resolution });
    provideCmdline(hostCtx, {
      // 只验证“能 boot”，不真的驱动 LLM：web 基座拒绝位置参数，仅给 --no-open
      // 避免沙箱尝试打开浏览器；SMOKE_PORT 指定时用该端口，否则自动挑空闲端口。
      args: (process.env.SMOKE_ARGS ? process.env.SMOKE_ARGS.split(' ') : ['--no-open'])
        .concat(process.env.SMOKE_PORT ? [`--port`, process.env.SMOKE_PORT] : [`--port`, String(smokePort)]),
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

// 阶段 5·D：research_* 工具不再 host 全局注册（移到 preset-research 作用域）——
// 工具断言从 host 全局层改为解析 preset-research 组成：
//   1) 组成断言：agentPresets.compositionInventory() 里存在 id=research 的预设且未 broken，
//      其行含 research-tools（moduleName=@basil/dsh-research/tools）且 enabled（严格 true）。
//   2) 工具目录断言（research 侧）：acquireScope('research') 拿到 research 预设 standing 作用域
//      的 scope key，以该作用域读 ctx.tools.schemas(scope)（继承的 global + preset 自身注册）——
//      这才是 research 会话真正可见的工具目录；不再查 host 全局层。
//   3) 工具目录断言（standard 侧 / 反证 always-on 污染已消除）：acquireScope('standard') 读
//      standard 预设作用域的工具目录，断言其中**不含任何 research_***——research_* 只进
//      research 会话，standard 等其它预设会话看不到（TODO 阶段 5·D 追加断言）。
const EXPECTED = ['research_verify', 'research_record', 'research_search', 'research_review', 'research_experiment', 'research_campaign', 'research_paper', 'research_slides', 'research_autonomous', 'research_policy', 'research_job', 'research_schedule', 'research_reflect', 'research_triz'];
const agentPresets = ctx.get('agentPresets');
const tools = ctx.get('tools');
let researchTools = [];
let standardTools = [];
let presetCompositionOk = false;
let standardClean = false;
// 阶段 6·多 Profile：4 个角色预设（paper/experiment/engineering/reviewer）按 roles.patch.yml 的
// config.tools.only 白名单裁剪 research_* 工具；此处记录各角色会话应恰好可见的工具集。
let rolesOk = false;
const ROLE_TOOLS = {
  paper: ['research_search', 'research_record', 'research_verify', 'research_paper', 'research_slides', 'research_autonomous', 'research_policy', 'research_job', 'research_schedule', 'research_reflect'],
  experiment: ['research_search', 'research_record', 'research_verify', 'research_experiment', 'research_campaign', 'research_autonomous', 'research_policy', 'research_job', 'research_schedule', 'research_reflect'],
  engineering: ['research_record', 'research_verify', 'research_triz', 'research_policy', 'research_job', 'research_schedule', 'research_reflect'],
  reviewer: ['research_search', 'research_record', 'research_verify', 'research_review', 'research_policy', 'research_job', 'research_schedule', 'research_reflect'],
};
if (agentPresets?.compositionInventory && agentPresets?.acquireScope && tools?.schemas) {
  // 1) preset-research 组成（不建会话，纯读注册 + 激活诊断）
  const inventory = await agentPresets.compositionInventory();
  const researchPreset = inventory.find((p) => p.id === 'research');
  const toolsRow = researchPreset?.rows?.find((r) => r.moduleName === '@basil/dsh-research/tools');
  presetCompositionOk = !!researchPreset
    && researchPreset.broken === undefined
    && !!toolsRow
    && toolsRow.enabled === true
    && (researchPreset.rows?.length ?? 0) > 0;
  // 2) research 会话工具目录 = research 预设 standing 作用域可见的工具（含 13 个 research_*）
  const lease = await agentPresets.acquireScope('research');
  try {
    researchTools = tools.schemas(lease.key)
      .map((t) => t.name)
      .filter((n) => n.startsWith('research_'));
  } finally {
    await lease[Symbol.asyncDispose]?.();
  }
  // 3) standard 会话工具目录：必须存在且不含任何 research_*（反证 always-on 污染已消除）；
  //    standard 预设缺席 → 无法断言其工具目录干净，视为 FAIL。
  const standardPreset = inventory.find((p) => p.id === 'standard');
  if (!standardPreset) {
    console.log('standard preset 未注册——无法断言其工具目录不含 research_*（视为 FAIL）');
  } else {
    const standardLease = await agentPresets.acquireScope('standard');
    try {
      standardTools = tools.schemas(standardLease.key)
        .map((t) => t.name)
        .filter((n) => n.startsWith('research_'));
      standardClean = standardTools.length === 0;
    } finally {
      await standardLease[Symbol.asyncDispose]?.();
    }
  }
  // 4) 角色预设（阶段 6·多 Profile）：与其他 preset 同一个 compositionInventory/acquireScope 平面，
  //    逐一断言 4 个角色预设存在且未 broken、research-tools 行 enabled，且其会话工具目录里的
  //    research_* 与 config.tools.only 白名单完全一致（白名单之外的工具不应出现）。
  const roleSummary = [];
  rolesOk = true;
  for (const [role, expected] of Object.entries(ROLE_TOOLS)) {
    const preset = inventory.find((q) => q.id === role);
    const toolsRow = preset?.rows?.find((r) => r.moduleName === '@basil/dsh-research/tools');
    const compositionOk = !!preset && preset.broken === undefined && !!toolsRow && toolsRow.enabled === true;
    let names = [];
    let toolsOk = false;
    if (compositionOk) {
      const lease = await agentPresets.acquireScope(role);
      try {
        names = tools.schemas(lease.key)
          .map((t) => t.name)
          .filter((n) => n.startsWith('research_'));
      } finally {
        await lease[Symbol.asyncDispose]?.();
      }
      toolsOk = expected.length === names.length && expected.every((n) => names.includes(n));
    }
    rolesOk = rolesOk && compositionOk && toolsOk;
    roleSummary.push(`${role}:${compositionOk && toolsOk ? 'OK' : 'FAIL'}[${names.length}/${expected.length}]`);
  }
  console.log('role presets (paper/experiment/engineering/reviewer):', roleSummary.join(' '));
} else {
  console.log('agentPresets(compositionInventory/acquireScope) 或 tools.schemas 不可用（preset 平面未挂载？）');
}
const toolOk = presetCompositionOk && EXPECTED.every((n) => researchTools.includes(n)) && standardClean;
console.log('preset-research composition:', presetCompositionOk ? 'OK' : 'FAIL');
console.log('research tools (preset scope):', researchTools.length ? researchTools.join(', ') : '(none)');
console.log('standard tools w/ research_* (must be 0):', standardTools.length);

const core = ctx.get('researchCore');
let verdict = '(researchCore missing)';
if (core) {
  let claim = core.claims.create({ statement: 'BGP 源地址验证依赖 ROA 限定来源 AS', type: 'Hypothesis', source: 'RFC8481' });
  claim = core.claims.addEvidence(claim, { source: 'RFC8481', evidence: 'ROA 限定合法来源 AS', confidence: 0.9 });
  const report = core.verify.claim(claim, { experiment: 'sim', claim: claim.id, outcome: 'support', data: {}, archivedAt: new Date().toISOString() });
  verdict = report.verdict;
  console.log('smoke verdict:', verdict, '| rationale:', report.rationale);
}

// 命名定型 + 内置领域词汇（2026-10-09）：researchCore.domain 必须暴露
// dsh-routing-research 定型名、操作命令 dsh research、领域范围 BGP/RPKI/… 与领域词表。
let domainOk = false;
if (core?.domain) {
  const d = core.domain;
  domainOk =
    d.productName === 'dsh-routing-research' &&
    d.command === 'dsh research' &&
    Array.isArray(d.scope) && d.scope.includes('BGP') && d.scope.includes('RPKI') && d.scope.includes('FC-BGP') &&
    Array.isArray(d.executors) && d.executors.includes('FRR') && d.executors.includes('VPP') &&
    Array.isArray(d.keywords) && d.keywords.length >= 15 &&
    typeof d.describe === 'function' && d.describe().includes('dsh-routing-research');
  console.log('built-in domain vocabulary:', domainOk ? `OK (${d.productName} / ${String(d.scope)} / ${String(d.executors)})` : 'FAIL');
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

// 阶段 7（--patch 链）：覆盖层注入时验证「仅给 claim、其余走 defaults」的调用路径可用
// （experiment-specific 层把 env/validator/attackClass 交给 config.defaults；显式输入覆盖）。
let chainDefaultsOk = true;
if (SMOKE_OVERLAYS.length > 0 && expSvc?.runAutomatic) {
  try {
    const d = expSvc.runAutomatic({ claim: '链层默认值冒烟（不传 env/validator）', repetitions: 2 });
    chainDefaultsOk = d?.plan?.env != null && ['frr', 'vpp', 'sim'].includes(d.plan.env) && d?.verdict != null;
    console.log('chain defaults-only campaign:', chainDefaultsOk ? 'OK' : 'FAIL', '| env:', d?.plan?.env, '| verdict:', d?.verdict);
  } catch (err) {
    chainDefaultsOk = false;
    console.log('chain defaults-only campaign: FAIL', String(err?.message ?? err));
  }
}

// 阶段 3.6/4a 冒烟：Policy（10 条纪律）+ 一键科研流水线（论文 + 幻灯片 + campaign verdict）。
const policy = ctx.get('researchPolicy');
let policyOk = false;
if (policy?.view) {
  const v = policy.view();
  // 基线 = 恰好 10 条纪律（AGENTS.md §9）；挂上 --patch 链（SMOKE_OVERLAYS）后允许
  // 覆盖层追加 extra 纪律（chain-research-policy 层会加 2 条 → 12），只要求基线不缩水。
  const baseIntact = v.rules.slice(0, 10).every((r, i) => r.id === `p${String(i + 1).padStart(2, '0')}`);
  policyOk = v.enabled
    && (SMOKE_OVERLAYS.length === 0 ? v.rules.length === 10 : v.rules.length >= 10)
    && baseIntact
    && v.prompt.includes('Research Agent Policy');
  console.log(
    'policy rules:', v?.rules?.length,
    '| enabled:', v?.enabled,
    '| extra(链层):', SMOKE_OVERLAYS.length > 0 ? v?.rules?.length - 10 : 0,
  );
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
    && report?.paper?.includes('## 6. TRIZ 发明原理映射')
    && report?.slides?.split(/\n---\n/).length >= 9
    && (report?.artifacts?.length ?? 0) > 0
    && report?.summary?.includes('已核验')
    && !!report?.triz && (report?.triz?.entries?.length ?? 0) > 0; // 默认调用 TRIZ：结果→发明原理映射
  console.log('autonomous verdict:', report?.campaign?.verdict, '| slides pages:', report?.slides?.split(/\n---\n/).length, '| triz entries:', report?.triz?.entries?.length ?? 0, '| artifacts:', report?.artifacts?.length);
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

// 阶段 4c 冒烟：researchSubagents 服务挂载；离线 seam 不可用/无父 Agent → 本地回退。
const subagentsSvc = ctx.get('researchSubagents');
let subagentsOk = false;
if (subagentsSvc?.runtimeStatus && subagentsSvc?.run) {
  const st = subagentsSvc.runtimeStatus();
  const turn = await subagentsSvc.run({ role: 'literature', task: 'RPKI origin validation 安全边界' });
  subagentsOk = turn?.delegator === 'local' && turn?.ok === false && (turn?.output ?? '').includes('本地回退') && (turn?.error ?? '').includes('local fallback');
  console.log('subagents status:', JSON.stringify(st), '| delegator:', turn?.delegator, '| model:', turn?.provider + '/' + turn?.model);
}

// 阶段 8 冒烟：TRIZ 方法论服务（research_triz 的 host 后端）——精选矩阵命中 + 假说生成。
const trizSvc = ctx.get('researchTriz');
let trizOk = false;
if (trizSvc?.analyzeProblem && trizSvc?.toHypotheses) {
  const a = trizSvc.analyzeProblem({ problem: '提高 RPKI 验证可靠性而不显著拖慢收敛', improving: 'reliability', worsening: '收敛' });
  const hs = trizSvc.toHypotheses(a);
  trizOk = a.source === 'curated-matrix' && a.candidates.length === 3 && hs.length === a.candidates.length
    && hs.every((h) => h.type === 'Hypothesis' && h.source === 'triz' && h.confidence === 0.5);
  console.log('triz:', a.source, '| candidates:', a.candidates.map((c) => `#${c.no} ${c.name}`).join(', '), '| hypotheses:', hs.length);
}

// 阶段 8.5 冒烟：右侧栏「TRIZ 发明原理」面板 —— host 半边插件（research-triz-ui）必须在
// 组合树里，且 connection.fetch（route 注册依赖）可用；浏览器半边（client bundle）由
// client-modules 按 package.json 的 dsh.client 声明加载，本冒烟只验 host 数据源挂载。
const trizUiEntryOk = [...(ctx.get('loader')?.entries?.() ?? [])]
  .some((entry) => entry?.options?.name === '@basil/dsh-research/triz-ui');
const trizUiOk = trizUiEntryOk && !!ctx.get('connection')?.fetch?.register;
console.log('triz-ui:', trizUiOk ? 'OK (right-sidebar TRIZ explainer route source mounted)' : 'FAIL');

// 阶段 8.6 冒烟（面板可见性根因回验）：client-modules 必须真的把 @basil/dsh-research 的
// 浏览器半边（lib/client.js → 右侧栏 TRIZ Tab）解析进 window.__DSH_BOOT__ 组合图。
// stage 8.5 面板「看不到」的根因 = cordis.patch.yml 首行用子路径 '@basil/dsh-research/core'
// 当 plugin loader entry，client-modules.exactPackageSpecifier 只认裸包名 / 两段 @scope/name，
// 三段子路径一律 void 0 → dsh.client 永远发现不了 → 浏览器半边不进组合图 → 面板必然不可见。
// 修复：首行 name 改为裸包名 '@basil/dsh-research'（main=plugin-core.ts 与 ./core 同入口，
// host 行为不变）。此处断言 graph.entries 里存在 id === '@basil/dsh-research'。
const clientModules = ctx.get('clientModules');
const clientGraph = clientModules?.graph?.();
const clientGraphEntries = Array.isArray(clientGraph?.entries) ? clientGraph.entries : [];
const clientOk = clientGraphEntries.some((row) => row?.id === '@basil/dsh-research');
console.log('client-graph:', clientOk
  ? `OK (browser side @basil/dsh-research -> right-sidebar TRIZ Tab in __DSH_BOOT__ graph, entries=${clientGraphEntries.length})`
  : 'FAIL (client half NOT in graph — panel cannot appear)');

// 阶段 8.6 冒烟：research-triz-auto（每个最终回答自动 TRIZ 映射）——插件行在装配树 +
// 用真实 services 驱动 createAutoTrizMiddleware：user/message → assistant/message →
// turn/end 应恰好写入 1 条 title^='triz: '、meta.auto===true 的 note（右侧栏面板数据源
// 正是从这里取数），且最新 notes 里能看到它。
const trizAutoEntryOk = [...(ctx.get('loader')?.entries?.() ?? [])]
  .some((entry) => entry?.options?.name === '@basil/dsh-research/triz-auto');
let trizAutoOk = false;
if (trizAutoEntryOk && trizSvc?.mapResult && core?.artifacts) {
  try {
    const { createAutoTrizMiddleware } = await import('../src/plugin-triz-auto.ts');
    const handle = createAutoTrizMiddleware(() => ({
      triz: trizSvc,
      core: { artifacts: core.artifacts },
      memory: ctx.get('researchMemory'),
      logger: console,
    }));
    const SMOKE_SID = 'smoke-triz-auto-session';
    handle({ id: SMOKE_SID }, { type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: 'RPKI 劫持检测率 vs 系统复杂度' }] } });
    handle({ id: SMOKE_SID }, { type: 'assistant/message', data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: 'ROV 逐前缀校验宣告来源并反馈给传播决策；BGPsec 提供路径级完整性与来源验证。'.repeat(4) }] }, stream: [] } });
    handle({ id: SMOKE_SID }, { type: 'turn/end', data: { turn: 1, reason: 'complete' } });
    const autoNotes = core.artifacts.list().filter((a) => a.title.startsWith('triz: ') && a.meta?.auto === true);
    trizAutoOk = autoNotes.length === 1;
    console.log('triz-auto:', trizAutoOk
      ? `OK (every final answer -> TRIZ mapping persisted; source=${autoNotes[0].meta.source}, entries=${autoNotes[0].meta.mapping})`
      : 'FAIL (auto TRIZ note not persisted)', '| loader entry:', trizAutoEntryOk ? 'present' : 'MISSING');
  } catch (err) {
    trizAutoOk = false;
    console.log('triz-auto: FAIL (driver error)', String(err?.message ?? err));
  }
} else {
  console.log('triz-auto:', trizAutoEntryOk ? 'FAIL (services missing)' : 'FAIL (loader entry missing)');
}

const servicesOk = ['researchCore', 'researchMemory', 'researchAgents', 'researchDirector', 'researchExperiment', 'researchWriter', 'researchPolicy', 'researchAutonomous', 'researchJobs', 'researchScheduler', 'researchSelfImprove', 'researchSubagents', 'researchTriz'].every((s) => ctx.get(s) !== undefined);
const ok = servicesOk && toolOk && standardClean && rolesOk && verdict === 'verified' && domainOk && searchOk && campaignOk && policyOk && autoOk && jobOk && schedOk && reflectOk && subagentsOk && chainDefaultsOk && trizOk && trizUiOk && clientOk && trizAutoOk;
await ctx.fiber.dispose();
console.log('disposed OK');
console.log(ok ? 'SMOKE PASS' : 'SMOKE FAIL');
console.log(`summary: services=${servicesOk} tools(${researchTools.length}/${EXPECTED.length})=${toolOk} standard=${standardClean} roles=${rolesOk} verdict=${verdict} domain=${domainOk} search=${searchOk} campaign=${campaignOk} policy=${policyOk} autonomous=${autoOk} job=${jobOk} schedule=${schedOk} reflect=${reflectOk} subagents=${subagentsOk} chainDefaults=${chainDefaultsOk} triz=${trizOk} trizUi=${trizUiOk} clientGraph=${clientOk} trizAuto=${trizAutoOk}`);
process.exit(ok ? 0 : 2);
