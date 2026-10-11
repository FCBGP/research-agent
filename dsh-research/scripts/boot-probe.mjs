// boot-probe.mjs — 最小 boot 探针：验证一个 dsh profile 能完整 boot 且 researchCore 就绪。
//
// 与 runtime-smoke 的差别：runtime-smoke 断言整个挂载面（服务 + preset 工具目录 + 角色），
// 适合在 deploy-profile.sh（web 基座 + 模型 overlay）之上跑；boot-probe 只验证
// 「能 boot + 5 个 host 插件能 import + researchCore 提供成功」，适合对 dsh plugin add 装的
// 最小组合（base + @basil/dsh-research，无 web 前端）做快速反证——尤其是检测 npm 实装包
// 的 .ts 缺陷（Node 24 拒绝 node_modules 下的 .ts → 5 个 host 插件 failed to import）。
//
// 用法（先部署/安装好 profile）:
//   DSH_HOME=/tmp/dsh-pack-home node dsh-research/scripts/boot-probe.mjs
//
// 输出: `boot:researchCore YES|NO`；非 0 退出即失败。
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
const NODE_ROOT = join(globalRoot, '@deepseek-ai', 'dsh');
const INSTALL_ANCHOR = join(NODE_ROOT, 'package.json');
const { loadProfile, readProfilePatches, boot, PluginPackages, createRuntimeResolution } =
  await import('file://' + join(NODE_ROOT, 'node_modules/@deepseek-ai/dsh-app-boot/lib/index.js'));

const profile = loadProfile('dsh', 'research', INSTALL_ANCHOR, home, { userLayer: true });
const resolution = await createRuntimeResolution({ installAnchor: INSTALL_ANCHOR, profile });
const profileContext = {
  name: 'research', dir: profile.dir, patchPath: profile.patchPath, installAnchor: INSTALL_ANCHOR,
  startedBundles: profile.layers.map((l) => l.packageName), cwd: process.cwd(), home,
  overlays: [], telemetryDisabledEnv: '1',
};
const patches = readProfilePatches('dsh', profileContext, profile);
const rootConfig = join(profile.dir, 'cordis.yml');
if (!existsSync(rootConfig)) writeFileSync(rootConfig, '[]\n', 'utf8');

try {
  const ctx = await boot('dsh', rootConfig, patches, async (hostCtx) => {
    hostCtx.provide('profileContext', profileContext);
    await hostCtx.plugin(PluginPackages, { resolution });
  });
  await new Promise((r) => setTimeout(r, 2500));
  const ok = ctx.get('researchCore') !== undefined;
  const missing = [];
  for (const s of ['researchCore', 'researchMemory', 'researchAgents', 'researchDirector', 'researchExperiment', 'researchWriter', 'researchPolicy', 'researchSubagents']) {
    if (ctx.get(s) === undefined) missing.push(s);
  }
  console.log('boot:researchCore', ok ? 'YES' : 'NO', missing.length === 0 ? '(all 8 research services up)' : `(missing: ${missing.join(', ')})`);
  await ctx[Symbol.asyncDispose]?.();
  process.exit(ok ? 0 : 1);
} catch (err) {
  console.error('BOOT FAILED:', err?.stack ?? err);
  process.exit(1);
}
