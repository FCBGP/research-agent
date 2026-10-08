#!/usr/bin/env bash
# deploy-research-profile.sh — 把 research profile 从仓库模板部署到 $DSH_HOME。
#
# 用法:
#   DSH_HOME=/tmp/dsh-home ./scripts/deploy-profile.sh
#   DSH_HOME="$HOME/.dsh" ./scripts/deploy-profile.sh   # 真实机器
#
# 部署内容（不复制代码，链接到仓库，改 dsh-research 立即生效）:
#   $DSH_HOME/profiles/research/package.json         (bundle 清单: base + @basil/dsh-research)
#   $DSH_HOME/profiles/research/cordis.patch.yml     (profile overlay)
#   $DSH_HOME/profiles/research/node_modules/@basil/dsh-research -> 仓库 dsh-research
set -euo pipefail

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
NAME="research"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROFILE_DIR="$DSH_HOME/profiles/$NAME"

mkdir -p "$PROFILE_DIR/node_modules/@basil"
cp "$REPO_ROOT/profiles/research/package.json" "$PROFILE_DIR/package.json"
cp "$REPO_ROOT/profiles/research/cordis.patch.yml" "$PROFILE_DIR/cordis.patch.yml"
ln -sfn "$REPO_ROOT/dsh-research" "$PROFILE_DIR/node_modules/@basil/dsh-research"

echo "deployed: $PROFILE_DIR"
echo "verify -> DSH_HOME=$DSH_HOME dsh --profile $NAME --dump-config | grep dsh-research"
