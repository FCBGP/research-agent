#!/usr/bin/env bash
# verify-patch-chain.sh — 组合链（--patch）离线 + 运行时验证。
#
# 目标（TODO「--patch 组合链验证：base → research policy → bgp research → experiment-specific」）:
#   base                                   = dsh research profile 的 bundle 组合树
#   --patch chain-research-policy.yml      = 第 1 层：research policy（research-operations 行）
#   --patch chain-bgp-research.yml         = 第 2 层：bgp research（research-core 行 memory.dir）
#   --patch chain-fcbgp-experiment.yml     = 第 3 层：experiment-specific（research-experiment 行 defaults）
#
# 验证内容:
#   1) --dump-config 离线组合：三层覆盖各落到正确行、值生效、且「后层覆盖前层」
#      （用临时 later overlay 把 defaults.env 覆成 frr 证明 argv 后层赢）。
#   2) runtime-smoke + SMOKE_OVERLAYS：组合链（含 3 层）boot 仍 SMOKE PASS，
#      且 policy.extra（L1 → 12 条纪律）与 defaults-only 战役（L3 → env=sim）在运行时生效。
#   3) 单测：plugin-experiment 消费 config.defaults（默认打底、输入优先）。
#
# 用法:
#   DSH_HOME=/tmp/dsh-home ./dsh-research/scripts/verify-patch-chain.sh
#   DSH_HOME="$HOME/.dsh"   ./dsh-research/scripts/verify-patch-chain.sh [SMOKE_PORT]
# 失败任一断言即退出非零。
set -euo pipefail

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
SMOKE_PORT="${1:-3099}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PATCH_DIR="$REPO_ROOT/dsh-research/patches"
L1="$PATCH_DIR/chain-research-policy.yml"
L2="$PATCH_DIR/chain-bgp-research.yml"
L3="$PATCH_DIR/chain-fcbgp-experiment.yml"
PROFILE_DIR="$DSH_HOME/profiles/research"

fail() { echo "CHAIN VERIFY FAIL: $*" >&2; exit 1; }
note() { echo "[verify] $*"; }

for f in "$L1" "$L2" "$L3"; do
  [ -f "$f" ] || fail "missing chain overlay: $f"
done

# 0) 部署 profile（幂等）：bundle 清单 + profile overlay + @basil/dsh-research symlink。
if [ ! -d "$PROFILE_DIR" ] || [ ! -e "$PROFILE_DIR/node_modules/@basil/dsh-research" ]; then
  note "deploying research profile into $DSH_HOME ..."
  (cd "$REPO_ROOT" && DSH_HOME="$DSH_HOME" ./dsh-research/scripts/deploy-profile.sh research)
fi

# 1) 离线组合：dump-config（3 层按 argv 顺序叠加）。
DUMP="$(mktemp)"
trap 'rm -f "$DUMP"' EXIT
note "composing: base + L1(research-policy) + L2(bgp-research) + L3(experiment-specific) --dump-config"
DSH_HOME="$DSH_HOME" dsh --profile research \
  --patch "$L1" --patch "$L2" --patch "$L3" \
  --dump-config > "$DUMP" 2> /dev/null

ABS="$REPO_ROOT/dsh-research/patches"
L1_ABS="$ABS/chain-research-policy.yml"
L2_ABS="$ABS/chain-bgp-research.yml"
L3_ABS="$ABS/chain-fcbgp-experiment.yml"
# 1a) 三层覆盖各以「patched by <abs path>」标在 @basil/dsh-research 的对应行上。
for p in "$L1_ABS" "$L2_ABS" "$L3_ABS"; do
  grep -Fq "$p" "$DUMP" || fail "overlay label missing in dump: $p"
done
for row in "- id: research-operations" "- id: research-core" "- id: research-experiment"; do
  grep -Fq -- "$row" "$DUMP" || fail "expected host row missing: $row"
done
note "OK: 3 layers each land on @basil/dsh-research (L1→operations, L2→core, L3→experiment)"

# 1b) L1 → research-operations：policy.extra 生效，tools/policy/subagents 原样保留。
grep -Fq "链层 L1/research-policy：本次科研战役" "$DUMP" || fail "L1 policy.extra 未落到 research-operations"
grep -Fq "    subagents:" "$DUMP" || fail "L1 未保留 subagents 子键（整行覆盖漏写）"

# 1c) L2 → research-core：memory.dir 生效。
grep -Fq "process.env.DSH_HOME + '/profiles/research/memory/bgp-research'" "$DUMP" \
  || fail "L2 memory.dir 未落到 research-core"

# 1d) L3 → research-experiment：defaults 生效。
grep -Fq "validator: rov+bgpsec" "$DUMP" || fail "L3 defaults.validator 未落到 research-experiment"
grep -Fq "attackClass: as-set-injection" "$DUMP" || fail "L3 defaults.attackClass 未落到 research-experiment"

# 1e) 后层赢：把 L3 复制成 later overlay 把 defaults.env 覆成 frr，断言最终 env=frr，
#     且同一行 research-experiment 的 patched-by 标签按 argv 序列出 L3 → late（后层赢）。
TMPD="$(mktemp -d)"
trap 'rm -rf "$TMPD"; rm -f "$DUMP"' EXIT
LATE="$TMPD/late-fcbgp-experiment.yml"
sed 's/env: sim/env: frr/' "$L3" > "$LATE"
LATE_DUMP="$TMPD/late-dump.yml"
DSH_HOME="$DSH_HOME" dsh --profile research \
  --patch "$L1" --patch "$L2" --patch "$L3" --patch "$LATE" \
  --dump-config > "$LATE_DUMP" 2> /dev/null
LATE_ABS="$(cd "$TMPD" && pwd)/late-fcbgp-experiment.yml"
grep -Fq "env: frr" "$LATE_DUMP" || fail "later overlay 未覆盖 defaults.env（后层未赢）"
grep -Fq "patched by ${L3_ABS}, ${LATE_ABS}" "$LATE_DUMP" \
  || fail "argv 覆盖顺序未被记录（research-experiment 行 patched-by 缺 L3→late）"
note "OK: later-wins 成立（--patch 后层覆盖前层，env sim→frr；同行 patched-by = L3, late）"

# 2) 运行时：组合链 boot + 全量冒烟。
note "runtime: SMOKE_OVERLAYS=L1+L2+L3, SMOKE_PORT=$SMOKE_PORT node runtime-smoke.mjs"
OUT="$(DSH_HOME="$DSH_HOME" SMOKE_PORT="$SMOKE_PORT" \
  SMOKE_OVERLAYS="$L1 $L2 $L3" \
  node "$REPO_ROOT/dsh-research/scripts/runtime-smoke.mjs" 2>&1 || true)"
printf '%s\n' "$OUT"
grep -Fq "chain defaults-only campaign: OK | env: sim" <<<"$OUT" \
  || fail "L3 defaults 未在运行时生效（defaults-only 战役未走 env=sim）"
grep -Fq "policy rules: 12" <<<"$OUT" || fail "L1 policy.extra 未在运行时生效（无 12 条纪律）"
grep -Fq "SMOKE PASS" <<<"$OUT" || fail "组合链 boot/冒烟未通过"

# 3) 单测：experiment plugin 的 defaults 消费（默认打底、输入优先）。
note "unit: node --test (dsh-research/src)"
(cd "$REPO_ROOT/dsh-research" && node --test "src/**/*.test.ts" 2>&1 | tail -6) \
  || fail "单测未通过"

note "CHAIN VERIFY PASS: base → research-policy → bgp-research → experiment-specific"
