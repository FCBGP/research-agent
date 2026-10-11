#!/usr/bin/env bash
# pack.sh — 一键打包 @basil/dsh-research 为**可 boot 的** npm tarball 并校验产物。
#
# 用法:
#   ./dsh-research/scripts/pack.sh                     # 输出到 <repo>/dist/basil-dsh-research-<version>.tgz
#   OUT_DIR=/path ./dsh-research/scripts/pack.sh       # 自定义输出目录
#   VERIFY_INSTALL=1 ./dsh-research/scripts/pack.sh    # 打包后再用 dsh plugin 装进 scratch profile + boot 验证
#
# 产出:
#   dist/basil-dsh-research-<version>.tgz
#
# 一键部署（不发布，本地 tarball 直装）:
#   DSH_HOME=${DSH_HOME:-$HOME/.dsh} dsh plugin --profile research add ./dist/basil-dsh-research-<version>.tgz
#
# 一键部署（npm 发布后从 registry 装）:
#   dsh plugin --profile research add @basil/dsh-research
#
# 关键：npm 实装包必须发**编译后 JS** —— Node 24 类型剥离不允许 node_modules 下的 .ts
# （`Stripping types is currently unsupported for files under node_modules`）；直接发 src/ 的
# .ts 会让 5 个 host 插件 import 失败（典型症状 `boot:researchCore NO`）。本脚本先用
# scripts/build.mjs 构建 staging 树（类型剥离 + 相对 import .ts→.js + staged package.json），
# 再在 staging 目录 npm pack。仓库内 dev 模式（deploy-profile.sh symlink）不经构建，
# 维持「改 src 立即生效」；两者是互补路径（dev symlink 改码即生效 vs npm 实装），不存在
# 「npm 安装替代 deploy-profile.sh」的关系。
#
# 依赖: node + npm。VERIFY_INSTALL=1 时另需全局 dsh（@deepseek-ai/dsh）与 PATH 上的 pnpm。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PKG_DIR="$REPO_ROOT/dsh-research"
OUT_DIR="${OUT_DIR:-$REPO_ROOT/dist}"
STAGING="$OUT_DIR/.staging/package"
mkdir -p "$OUT_DIR"
# 沙箱/CI 里默认 ~/.npm 可能不可写：把 npm 缓存落到输出目录（默认 dist/，已 gitignore）。
export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-$OUT_DIR/.npm-cache}"

echo "==> [1/5] 单测"
(cd "$PKG_DIR" && npm run test)

echo "==> [2/5] 构建 staging（src TS → JS，仅发行包）"
node "$PKG_DIR/scripts/build.mjs" --out "$STAGING"

echo "==> [3/5] npm pack（staging）→ $OUT_DIR"
(cd "$STAGING" && npm pack --pack-destination "$OUT_DIR")

TARBALL="$(ls -1t "$OUT_DIR"/basil-dsh-research-*.tgz 2>/dev/null | head -1 || true)"
if [ -z "$TARBALL" ]; then
  echo "error: no tarball produced under $OUT_DIR" >&2
  exit 1
fi

echo "==> [4/5] 产物内容校验: $(basename "$TARBALL")"
REQUIRED=(
  package/package.json
  package/README.md
  package/cordis.patch.yml
  package/presets/research.patch.yml
  package/presets/roles.patch.yml
  package/patches/chain-research-policy.yml
  package/patches/chain-bgp-research.yml
  package/patches/chain-fcbgp-experiment.yml
  package/src/plugin-core.js
  package/src/plugin-director.js
  package/src/plugin-experiment.js
  package/src/plugin-writer.js
  package/src/plugin-operations.js
  package/src/plugin-tools.js
  package/skills/experiment/SKILL.md
  package/skills/paper-review/SKILL.md
  package/scripts/runtime-smoke.mjs
)
for entry in "${REQUIRED[@]}"; do
  if ! tar -tzf "$TARBALL" | grep -Fxq "$entry"; then
    echo "error: tarball missing required entry: $entry" >&2
    exit 1
  fi
done
# 反证：发行包不得含 src/*.ts（Node 24 拒绝 node_modules 下的 .ts import）。
if tar -tzf "$TARBALL" | grep -Eq 'package/src/[^ ]*\.ts$'; then
  echo "error: tarball contains src/*.ts —— npm 实装会 boot:researchCore NO（Node 24 拒绝 node_modules 下 .ts）" >&2
  exit 1
fi
TOTAL="$(tar -tzf "$TARBALL" | wc -l | tr -d ' ')"
echo "OK: tarball contains all required entries, no src/*.ts ($TOTAL 条) → $TARBALL"

if [ "${VERIFY_INSTALL:-}" = "1" ]; then
  echo "==> [5/5] dsh plugin --profile research add <tarball> + boot 探针"
  command -v dsh >/dev/null 2>&1 || { echo "error: dsh not found on PATH (need global @deepseek-ai/dsh)" >&2; exit 1; }
  command -v pnpm >/dev/null 2>&1 || { echo "error: pnpm not found on PATH (install via: npm i -g pnpm 或 corepack enable pnpm)" >&2; exit 1; }
  SMOKE_HOME="${SMOKE_HOME:-/tmp/dsh-pack-home-$$-$(date +%s)}"
  mkdir -p "$SMOKE_HOME"
  # dsh plugin 在 profile 目录（pnpm workspace root，packages: [.]）里跑 `pnpm add <tarball>`；
  # pnpm ≥ 9 报 ERR_PNPM_ADDING_TO_ROOT 拒绝添加（pnpm 8 无此检查）。显式放行——对 pnpm 8
  # 只是无害的未知设置，对 pnpm 9+ 才能跑通一键部署（npm_config_* 经 process.env 透传给 pnpm；
  # 只加在本条 dsh 进程树，避免污染后续 `npm root -g`）。
  DSH_HOME="$SMOKE_HOME" npm_config_ignore_workspace_root_check=true \
    dsh plugin --profile research add "$TARBALL"
  DUMP="$SMOKE_HOME/dump-config.yml"
  DSH_HOME="$SMOKE_HOME" dsh --profile research --dump-config > "$DUMP" 2>/dev/null || true
  grep -Fq -- "- id: research-core" "$DUMP" || { echo "error: research-core 未出现在组合树中（install 未生效？→ $DUMP）" >&2; exit 1; }
  grep -Fq -- "- id: research-director" "$DUMP" || { echo "error: research-director 未出现" >&2; exit 1; }
  grep -Fq -- "preset-research" "$DUMP" || { echo "error: preset-research 未出现" >&2; exit 1; }
  echo "OK: 组合树含 research-* 5 行 + preset-research（dump: ${DUMP}）"
  # boot 探针：实装包必须能真正 import 5 个 host 插件，researchCore 提供成功（.ts 反证）。
  echo "OK: boot 探针 → $(DSH_HOME="$SMOKE_HOME" DSH_INSTALL_ROOT="${DSH_INSTALL_ROOT:-$(npm root -g)}" node "$PKG_DIR/scripts/boot-probe.mjs")"
fi

echo "PACK OK: $TARBALL"
