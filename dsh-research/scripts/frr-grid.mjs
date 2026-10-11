#!/usr/bin/env node
// frr-grid.mjs — TODO「真实网元验证」复测网格执行器
//
// 复测 `research/sim-grid.ts` 的同一 4 攻击类 × 4 验证策略 × N 重复矩阵，
// 但改走与 `research_campaign env=frr` 完全相同的执行路径
// （runAutomaticExperiment → TopologyExecutor → FrrTopology）：
//
//   - 目标机已装 FRR（bgpd + RPKI-RTR + BGPsec）→ 适配器探测到二进制 → engine=frr、
//     simulated=false（真实守护进程数据，替换 RouteEngineSim 机制先验）；
//   - 未装 FRR / VPP → 回退 adapter-sim，engine=frr-adapter-sim、simulated=true 如实标注，
//     指标与 sim-grid 同源（确定性模拟），绝不冒充真实网元（AGENTS.md 铁律）。
//
// 用法:
//   node dsh-research/scripts/frr-grid.mjs                  # 等价 research_campaign env=frr × 16 格
//   node dsh-research/scripts/frr-grid.mjs --env vpp        # VPP 适配器
//   node dsh-research/scripts/frr-grid.mjs --env sim        # RouteEngineSim 对照（= sim-grid）
//   node dsh-research/scripts/frr-grid.mjs --reps 8 --seed 7 --as-count 40
//   node dsh-research/scripts/frr-grid.mjs --require-live   # 引擎非真实守护进程即失败（目标机验收门禁）
//   node dsh-research/scripts/frr-grid.mjs --out /tmp/frr-grid.json
//
// 输出：逐格 JSON（四口径统计 + engine/simulated/env）+ 汇总行；默认写 research/frr-grid-results.json
// （research/ 已 gitignore，与 sim-grid-results.json 同目录，不入 git）。
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { runAutomaticExperiment } from '../src/experiment/runner.ts';
import { ExperimentAgent } from '../src/agents/experiment.ts';
import { FrrTopology, VppTopology, topologyForEnv, isSimulatedEngine } from '../src/experiment/topology.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const DEFAULT_OUT = join(REPO_ROOT, 'research', 'frr-grid-results.json');

const ATTACKS = ['prefix-hijack', 'subprefix-hijack', 'as-set-injection', 'path-manipulation'];
const VALIDATORS = ['none', 'rov', 'bgpsec', 'rov+bgpsec'];

// —— CLI 解析 ——
const argv = process.argv.slice(2);
let env = 'frr';
let reps = 8;
let seed = 7;
let asCount = 40;
let requireLive = false;
let outFile = DEFAULT_OUT;
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  const next = () => { i += 1; return argv[i]; };
  if (a === '--env') env = next() ?? env;
  else if (a.startsWith('--env=')) env = a.slice('--env='.length);
  else if (a === '--reps') reps = Number(next() ?? reps);
  else if (a.startsWith('--reps=')) reps = Number(a.slice('--reps='.length));
  else if (a === '--seed') seed = Number(next() ?? seed);
  else if (a.startsWith('--seed=')) seed = Number(a.slice('--seed='.length));
  else if (a === '--as-count') asCount = Number(next() ?? asCount);
  else if (a.startsWith('--as-count=')) asCount = Number(a.slice('--as-count='.length));
  else if (a === '--require-live') requireLive = true;
  else if (a === '--out') outFile = next() ?? outFile;
  else if (a.startsWith('--out=')) outFile = a.slice('--out='.length);
  else if (a === '--help' || a === '-h') {
    console.log(`用法: node dsh-research/scripts/frr-grid.mjs [--env frr|vpp|sim] [--reps N] [--seed N] [--as-count N] [--require-live] [--out <file>]\n
  --env <frr|vpp|sim>   执行源（默认 frr；sim 等价 sim-grid 对照）
  --reps N              每格重复轮数（默认 8，与 sim-grid 一致）
  --seed N              确定性种子（默认 7，与 sim-grid 一致）
  --as-count N          参与者 AS 数（默认 40）
  --require-live        引擎非真实守护进程（frr/vpp）即失败——目标机验收门禁
  --out <file>          结果落盘路径（默认 ${DEFAULT_OUT}）`);
    process.exit(0);
  } else {
    console.error(`unknown arg: ${a}`);
    process.exit(2);
  }
}

// —— 门禁：--require-live 时先探测引擎，非真实守护进程直接失败 ——
const probe = topologyForEnv(env, { seed, asCount });
const probeEngine = probe.info.engine;
if (requireLive && isSimulatedEngine(probeEngine)) {
  const daemon = env === 'frr' ? ['bgpd', 'vtysh'] : ['vpp', 'vppctl'];
  console.error(`FRR-GRID FAIL (--require-live): 引擎为 ${probeEngine}（模拟），目标机未检测到 ${daemon.join(' / ')} 二进制。
  1) 目标机安装 FRR（bgpd + RPKI-RTR，可选 BGPsec）后重试；或
  2) 去掉 --require-live 以 adapter-sim 回退复测（指标如实标注 simulated=true，不冒充真实网元）。`);
  process.exit(1);
}

// —— 逐格跑 research_campaign env=frr 等价路径 ——
const agent = new ExperimentAgent();
const rows = [];
const firstEngine = probeEngine;
for (const attack of ATTACKS) {
  for (const validator of VALIDATORS) {
    const claimId = `frr-grid-${attack}-${validator}`;
    const plan = agent.plan({
      claimId,
      claimStatement: `真实网元复测：${validator} 对 ${attack} 的检测（research_campaign env=${env}）`,
      env,
      repetitions: reps,
    });
    const report = runAutomaticExperiment({
      claim: { id: claimId, statement: plan.scenario },
      plan,
      validator,
      supportThreshold: 0.4, // 网格只看统计口径；supportThreshold 不影响 stats
      topologyConfig: { seed, attack, asCount },
    });
    const row = {
      attack,
      validator,
      engine: report.results[0]?.data.engine ?? probeEngine,
      simulated: report.results[0]?.data.simulated ?? isSimulatedEngine(probeEngine),
      env: plan.env,
      detection: report.stats.detection_rate,
      fp: report.stats.false_positive_rate,
      latency: report.stats.verification_latency,
      convergence: report.stats.convergence_time,
    };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
}

console.log(`TOTAL_CELLS=${rows.length} REPS=${reps} SEED=${seed} ASCOUNT=${asCount} ENGINE=${firstEngine}`);

// —— 写盘（research/ 已 gitignore，与 sim-grid-results.json 同目录） ——
try {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
  console.log(`GRID_SAVED=${resolve(outFile)}`);
} catch (err) {
  console.error(`warn: 无法写 ${outFile}: ${String(err?.message ?? err)}`);
}

if (requireLive) {
  console.log('FRR-GRID PASS (live daemon) — 复测引擎为真实网元，替换 RouteEngineSim 机制先验。');
  process.exit(0);
} else if (env === 'sim') {
  console.log('FRR-GRID OK (RouteEngineSim 确定性对照组) — 与 sim-grid 同口径，engine=route-engine-sim / simulated=true。');
} else if (isSimulatedEngine(firstEngine)) {
  console.log(`FRR-GRID OK (adapter-sim fallback, simulated=true) — 目标机装 FRR 后用 --require-live 复测真实网元。`);
} else {
  console.log('FRR-GRID OK (live daemon).');
}
