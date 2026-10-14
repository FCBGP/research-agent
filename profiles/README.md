# profiles/ — 可部署的 dsh Profile 模板源

`$DSH_HOME/profiles/<name>/` 下的目录即为一个可启动的 profile。本目录保存 profile 模板
（独立于机器上的 `$DSH_HOME`）；**一键部署用 `dsh-research/scripts/deploy-profile.sh`**
（支持任意 profile 名：第一个位置参数或 `PROFILE_NAME` 环境变量，缺省 `research`）。

现有模板：`research`（完整 Research Agent，**定型名称 `dsh-routing-research`**）+
`paper` / `experiment` / `engineering` / `reviewer`（多 Profile 角色视图，共享同一
`@basil/dsh-research` bundle，仅默认 preset 不同）。

> 命名定型（2026-10-09）：Profile 语义名 = **`dsh-routing-research`**（域间路由安全研究专用）；
> 操作命令仍用 `dsh research`（== `dsh --profile research`），README/scripts 不变。
> 内置领域词汇（BGP / RPKI / BGPsec / ASPA / VRO / CRC / FC-BGP + FRR / VPP）唯一口径来源 =
> `dsh-research/src/domain/vocabulary.ts`。

## research

在 **web 基座**上实现（与 `dsh --profile web` 同构，仅多叠 `@basil/dsh-research` 领域层）：

`dsh.profile.bundles` = `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app` +
`@basil/dsh-research`（顺序即叠加顺序）。

- `@deepseek-ai/dsh-web-app`：Web UI 前端基座（web-startup / webserver / web-runtime），
  `dsh research` 启动浏览器会话（默认 `http://127.0.0.1:3080/`），**不接受位置参数任务**。
- `@basil/dsh-research`：领域层（阶段 5/8 = **preset-research + 7 插件** ——
  13 个服务在 host 平面 6 个插件上（core / **triz** / director / experiment / writer /
  operations，阶段 8 新增 research-triz），14 个 `research_*` 工具（含 `research_triz`）在
  preset 平面的 research-tools 子行注册），在 web 会话里跑科研流水线。
- **默认 preset = research**：`agent-preset-registry.config.default: research`
  → 新会话默认 Research Agent（persona + 领域 skill + `research_*` 工具），而非 web 的 standard。
- **行为变更**：`research_*` 工具**只在 research 预设会话**的工具目录出现；
  standard 等其它 preset 会话看不到（消除 always-on 污染，runtime-smoke 断言 standard=0）。
- 领域专用配置（模型路由、policy、默认 preset）经 `cordis.patch.yml` 注入；
  模型层与 web profile 完全对齐（`ui-settings-general` + `llm-pi-ai.local-interval-dsv4` +
  `agent-default-model` → dsv4flash）。

### 部署与验证

```bash
# 部署：复制模板 + symlink 本仓库 dsh-research 到 profile
DSH_HOME=/tmp/dsh-home ./dsh-research/scripts/deploy-profile.sh

# 组合验证：dump-config 应出现 web-startup / webserver + research-* 6 行 + preset-research
# （旧 dsh-research-core 行已不存在；无 headless）
DSH_HOME=/tmp/dsh-home dsh --profile research --dump-config | grep -E "web|research-(core|triz|director|experiment|writer|operations)|preset-research"

# 运行时验证（在 dsh 真实运行树内）：
DSH_HOME=/tmp/dsh-home node dsh-research/scripts/runtime-smoke.mjs   # → SMOKE PASS

# 真机运行：启动 Web UI（浏览器会话）
DSH_HOME="$HOME/.dsh" ./dsh-research/scripts/deploy-profile.sh
dsh research   # == dsh --profile research；可选 --no-open / --port <n> / --host <host>
```

> 说明：bundle 包 `@basil/dsh-research` 同时扮演两个角色 —— bundle（声明两份 patch：
> `cordis.patch.yml` host 6 行 + `presets/research.patch.yml` preset-research）与
> 7 个插件（`main` 指向 `src/plugin-core.ts`，`exports` 提供
> `./core` `./triz` `./director` `./experiment` `./writer` `./operations` `./tools` 子路径，
> Node 24 类型剥离直接运行）。运行时解析采用 two-anchor：安装包优先，其次 profile 目录的
> `node_modules`，因此 symlink 即可生效，改代码无需重装。## paper / experiment / engineering / reviewer（多 Profile · 角色视图，2026-10-09）

四个角色 profile 与 `research/` 同构（web 基座 + `@basil/dsh-research`），差异只在默认 preset：
`profiles/<role>/cordis.patch.yml` 的 `agent-preset-registry.config.default` 选到对应角色
（preset 定义见 bundle `presets/roles.patch.yml`）。`research/` 全量 14 个 `research_*` 工具（含 `research_triz`：TRIZ 矛盾分析 → 机制方向假说）；
角色 profile 经 `config.tools.only` 白名单裁剪到各自工具集（`src/plugin-tools.ts` 注册闭包过滤）：

| profile | 默认 preset | research_* 工具白名单 |
|---|---|---|
| `paper` | `preset-paper` | search / record / verify / paper / slides / autonomous / policy / job / schedule / reflect（10） |
| `experiment` | `preset-experiment` | search / record / verify / experiment / campaign / autonomous / policy / job / schedule / reflect（10） |
| `engineering` | `preset-engineering` | record / verify / **triz** / policy / job / schedule / reflect（7） |
| `reviewer` | `preset-reviewer` | search / record / verify / review / policy / job / schedule / reflect（8） |

部署与验证与 `research/` 一致，只把 profile 名换成角色：

```bash
# 部署
DSH_HOME=/tmp/dsh-home ./dsh-research/scripts/deploy-profile.sh paper          # 或 experiment / engineering / reviewer
DSH_HOME=/tmp/dsh-home PROFILE_NAME=paper ./dsh-research/scripts/deploy-profile.sh   # 等价

# 组合验证：每个 profile 的 dump-config 应出现对应默认 preset 行
DSH_HOME=/tmp/dsh-home dsh --profile paper --dump-config | grep -E "default:|preset-paper"

# 运行时验证：runtime-smoke 已一并断言 4 个角色预设（roles=true，paper 10/10 等）
DSH_HOME=/tmp/dsh-home node dsh-research/scripts/runtime-smoke.mjs   # → SMOKE PASS 且 roles=true
```

