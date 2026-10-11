#!/usr/bin/env node
// aspa-grid.mjs — ASPA / RFC 9319 路径政策场景网格 + V10 增量收益量测
//
// 背景：TODO「ASPA / RFC 9319：路径政策场景加入拓扑抽象（experiment/topology.ts），
// 量测其对 '授权泄密/原主作恶'（V10）的增量收益」。
//
// 新增后拓扑抽象支持：
//   - ValidatorMode 增加 aspa / rov+aspa（RFC 9319 路径政策校验 customer→provider 跳）；
//   - AttackClass 增加 authorized-leak（V10：原主作恶/授权泄密 —— origin 持有合法 ROA，
//     路径被授权 AS 泄给非合法上游，破坏 valley-free/provider 政策）。
//
// 本脚本走与 research_campaign 完全相同的执行路径（runAutomaticExperiment → TopologyExecutor
// → RouteEngineSim / *-adapter-sim 回退），对 5 攻击类 × 6 验证策略 × N 重复注入，输出
// 四口径统计，并单独计算 V10 增量收益：
//   gain(ref) = detection(aspa) − detection(ref)   ref ∈ {rownov, rov, bgpsec, rov+bgpsec}
//
// 用法:
//   node dsh-research/scripts/aspa-grid.mjs                     # 全 5×6 网格（默认 sim）
//   node dsh-research/scripts/aspa-grid.mjs --env frr           # 经 FrrTopology 适配器（回退 adapter-sim）
//   node dsh-research/scripts/aspa-grid.mjs --reps 8 --seed 7 --as-count 40
//   node dsh-research/scripts/aspa-grid.mjs --head 2 --seed 3    # attack 数限制（调试）
//   node dsh-research/scripts/aspa-grid.mjs --out /tmp/aspa-grid.json
//
// 输出：逐格 JSON + V10 增量收益汇总行；默认写 research/aspa-grid-results.json
// （research/ 已 gitignore，与 sim-grid-results.json 同目录，不入 git）。
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { runAutomaticExperiment } from '../src/experiment/runner.ts';
import { ExperimentAgent } from '../src/agents/experiment.ts';
import { topologyForEnv, isSimulatedEngine } from '../src/experiment/topology.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..');
const DEFAULT_OUT = join(REPO_ROOT, 'research', 'aspa-grid-results.json');

const ATTACKS = ['prefix-hijack', 'subprefix-hijack', 'as-set-injection', 'path-manipulation', 'authorized-leak'];
const VALIDATORS = ['none', 'rov', 'bgpsec', 'rov+bgpsec', 'aspa', 'rov+aspa'];
const V10_ATTACK = 'authorized-leak';

// —— CLI 解析 ——
const argv = process.argv.slice(2);
let env = 'sim';
let reps = 8;
let seed = 7;
let asCount = 40;
let head = ATTACKS.length;
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
  else if (a === '--head') head = Number(next() ?? head);
  else if (a.startsWith('--head=')) head = Number(a.slice('--head='.length));
  else if (a === '--out') outFile = next() ?? outFile;
  else if (a.startsWith('--out=')) outFile = a.slice('--out='.length);
  else if (a === '--help' || a === '-h') {
    console.log(`用法: node dsh-research/scripts/aspa-grid.mjs [--env sim|frr|vpp] [--reps N] [--seed N] [--as-count N] [--head N] [--out <file>]\n
  --env <sim|frr|vpp>  执行源（默认 sim = RouteEngineSim 机制先验；frr/vpp 回退 adapter-sim）
  --reps N             每格重复轮数（默认 8）
  --seed N             确定性种子（默认 7）
  --as-count N         参与者 AS 数（默认 40）
  --head N             只跑前 N 个攻击类（调试用，默认全部 5 个）
  --out <file>         结果落盘路径（默认 ${DEFAULT_OUT}）`);
    process.exit(0);
  } else {
    console.error(`unknown arg: ${a}`);
    process.exit(2);
  }
}

const probeEngine = topologyForEnv(env, { seed, asCount }).info.engine;

// —— 逐格跑 research_campaign 等价路径（env=sim → RouteEngineSim；frr/vpp → 适配器回退） ——
const agent = new ExperimentAgent();
const rows = [];
for (const attack of ATTACKS.slice(0, head)) {
  for (const validator of VALIDATORS) {
    const claimId = `aspa-grid-${attack}-${validator}`;
    const plan = agent.plan({
      claimId,
      claimStatement: `ASPA 路径政策网格：${validator} 对 ${attack}（research_campaign env=${env}）`,
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

// —— V10 增量收益汇总：ASPA/ROV+ASPA 相对 ROV/BGPsec/无验证 的 detection 增益 ——
const detMean = (rows, attack, validator) => {
  const r = rows.find((x) => x.attack === attack && x.validator === validator);
  return r?.detection?.mean ?? NaN;
};
const table = rows.filter((r) => r.attack === V10_ATTACK);
console.log('\n—— V10 增量收益（authorized-leak；机制级先验，engine=' + probeEngine + ', simulated=' + isSimulatedEngine(probeEngine) + '） ——');
for (const ref of ['none', 'rov', 'bgpsec', 'rov+bgpsec']) {
  const base = detMean(table, V10_ATTACK, ref);
  const asp = detMean(table, V10_ATTACK, 'aspa');
  const rovAsp = detMean(table, V10_ATTACK, 'rov+aspa');
  if (Number.isNaN(base) || Number.isNaN(asp) || Number.isNaN(rovAsp)) continue;
  console.log(
    `  ref=${ref.padEnd(9)} det(ref)=${base.toFixed(4)}  det(aspa)=${asp.toFixed(4)}  gain_aspa=${(asp - base).toFixed(4)}  gain_rov+aspa=${(rovAsp - base).toFixed(4)}`,
  );
}
console.log(`TOTAL_CELLS=${rows.length} REPS=${reps} SEED=${seed} ASCOUNT=${asCount} ENGINE=${probeEngine}`);

// —— 写盘（research/ 已 gitignore） ——
try {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
  console.log(`GRID_SAVED=${resolve(outFile)}`);
} catch (err) {
  console.error(`warn: 无法写 ${outFile}: ${String(err?.message ?? err)}`);
}
