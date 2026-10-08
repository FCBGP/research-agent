# profiles/ — 可部署的 dsh Profile 模板源

`$DSH_HOME/profiles/<name>/` 下的目录即为一个可启动的 profile。本目录保存 profile 模板
（独立于机器上的 `$DSH_HOME`）；**一键部署用 `dsh-research/scripts/deploy-profile.sh`**。

## research

在 **web 基座**上实现（与 `dsh --profile web` 同构，仅多叠 `@basil/dsh-research` 领域层）：

`dsh.profile.bundles` = `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app` +
`@basil/dsh-research`（顺序即叠加顺序）。

- `@deepseek-ai/dsh-web-app`：Web UI 前端基座（web-startup / webserver / web-runtime），
  `dsh research` 启动浏览器会话（默认 `http://127.0.0.1:3080/`），**不接受位置参数任务**。
- `@basil/dsh-research`：领域层（11 服务 + 13 个 `research_*` 工具），
  在 web 会话里跑科研流水线。
- 领域专用配置（模型路由、policy）经 `cordis.patch.yml` 与 `dsh-research/patches/*.yml` 注入；
  模型层与 web profile 完全对齐（`ui-settings-general` + `llm-pi-ai.local-interval-dsv4` +
  `agent-default-model` → dsv4flash）。

### 部署与验证

```bash
# 部署：复制模板 + symlink 本仓库 dsh-research 到 profile
DSH_HOME=/tmp/dsh-home ./dsh-research/scripts/deploy-profile.sh

# 组合验证：dump-config 应出现 web-startup / webserver + dsh-research-core 行（无 headless）
DSH_HOME=/tmp/dsh-home dsh --profile research --dump-config | grep -E "web|dsh-research-core"

# 运行时验证（在 dsh 真实运行树内）：
DSH_HOME=/tmp/dsh-home node dsh-research/scripts/runtime-smoke.mjs   # → SMOKE PASS

# 真机运行：启动 Web UI（浏览器会话）
DSH_HOME="$HOME/.dsh" ./dsh-research/scripts/deploy-profile.sh
dsh research   # == dsh --profile research；可选 --no-open / --port <n> / --host <host>
```

> 说明：bundle 包 `@basil/dsh-research` 同时扮演两个角色 —— bundle（声明 patch）与
> 插件（`main` 指向 `src/plugin.ts`，Node 24 类型剥离直接运行）。运行时解析采用
> two-anchor：安装包优先，其次 profile 目录的 `node_modules`，因此 symlink 即可生效，
> 改代码无需重装。
