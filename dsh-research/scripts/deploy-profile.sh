#!/usr/bin/env bash
# deploy-profile.sh — 把 research / paper / experiment / engineering / reviewer profile 从仓库模板部署到 $DSH_HOME。
#
# 用法:
#   DSH_HOME=/tmp/dsh-home ./dsh-research/scripts/deploy-profile.sh                # 默认 research
#   DSH_HOME=/tmp/dsh-home ./dsh-research/scripts/deploy-profile.sh paper          # 指定角色 profile
#   DSH_HOME="$HOME/.dsh" ./dsh-research/scripts/deploy-profile.sh experiment      # 真实机器
#
# 支持任意 name（PROFILE_NAME 环境变量或第一个位置参数），默认 research；
# 仓库模板位于 $REPO_ROOT/profiles/<name>/，仅支持已存在的模板名。
#
# 部署内容（不复制代码，链接到仓库，改 dsh-research 立即生效）:
#   $DSH_HOME/profiles/<name>/package.json         (bundle 清单: base + web 前端 + @basil/dsh-research [+ 第三方插件])
#   $DSH_HOME/profiles/<name>/cordis.patch.yml     (profile overlay: 默认 preset = 角色 [+ 第三方插件配置行])
#   $DSH_HOME/profiles/<name>/node_modules/@basil/dsh-research -> 仓库 dsh-research
#
# 插件幂等（模板声明了第三方插件但 node_modules 缺失时自动补装）:
#   - 当前第三方插件 = @wxg-prc-cpg/dsh-weknora（WeKnora 知识库）+ dsh-web-search-plugin
#     （联网搜索，替代 dsh 内置 web 搜索）；只对「声明了该插件」的 profile 生效（当前仅 research）
#   - 已装则跳过（`dsh plugin add` 对已安装包返回 already-installed，故只在缺失时触发）
#   - 关掉自动安装: DEPLOY_AUTO_PLUGINS=0（此时只打印手动命令）
set -euo pipefail

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
NAME="${PROFILE_NAME:-${1:-research}}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROFILE_DIR="$DSH_HOME/profiles/$NAME"
TEMPLATE_DIR="$REPO_ROOT/profiles/$NAME"

if [ ! -d "$TEMPLATE_DIR" ]; then
  echo "error: no profile template at $TEMPLATE_DIR (available: research / paper / experiment / engineering / reviewer)" >&2
  exit 1
fi

mkdir -p "$PROFILE_DIR/node_modules/@basil"
cp "$TEMPLATE_DIR/package.json" "$PROFILE_DIR/package.json"
cp "$TEMPLATE_DIR/cordis.patch.yml" "$PROFILE_DIR/cordis.patch.yml"
ln -sfn "$REPO_ROOT/dsh-research" "$PROFILE_DIR/node_modules/@basil/dsh-research"

# 第三方插件幂等补装（在 @basil symlink 之后执行，顺序安全）。
# 只对「模板 package.json 声明了该插件」的 profile 生效（当前仅 research 声明了
# weknora + dsh-web-search-plugin，其余 profile 不受影响）；已装则跳过
# （`dsh plugin add` 对已安装包返回 already-installed，故只在缺失时触发）；
# 安装失败不阻断 deploy（打印手动命令，稍后补跑即可）。
# 关掉自动安装: DEPLOY_AUTO_PLUGINS=0（此时只打印手动命令）。
for plugin_spec in "@wxg-prc-cpg/dsh-weknora" "dsh-web-search-plugin"; do
  if ! grep -Fq "$plugin_spec" "$PROFILE_DIR/package.json"; then
    continue
  fi
  if [ -e "$PROFILE_DIR/node_modules/$plugin_spec" ]; then
    echo "plugin ok: $plugin_spec already installed"
  elif [ "${DEPLOY_AUTO_PLUGINS:-1}" = "1" ] && command -v dsh >/dev/null 2>&1; then
    echo "plugin missing -> installing: dsh plugin --profile $NAME add $plugin_spec"
    if ! DSH_HOME="$DSH_HOME" dsh plugin --profile "$NAME" add "$plugin_spec"; then
      echo "warning: $plugin_spec install failed — run manually later:" >&2
      echo "  DSH_HOME=$DSH_HOME dsh plugin --profile $NAME add $plugin_spec" >&2
    fi
  else
    echo "plugin missing (DEPLOY_AUTO_PLUGINS=0 or no dsh in PATH) -> run manually:"
    echo "  DSH_HOME=$DSH_HOME dsh plugin --profile $NAME add $plugin_spec"
  fi
done

echo "deployed: $PROFILE_DIR"
echo "verify -> DSH_HOME=$DSH_HOME dsh --profile $NAME --dump-config | grep -E 'web|preset-$NAME'"
