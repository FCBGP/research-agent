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
`@basil/dsh-research` + `@wxg-prc-cpg/dsh-weknora`（知识库）+ `dsh-web-search-plugin`
（联网搜索，替代内置 web 搜索）（顺序即叠加顺序）。两个第三方插件已并入 deploy 生命周期：
`deploy-profile.sh` 首次部署**自动补装**、已装跳过、重跑不丢（见仓库 README「WeKnora」与
「联网搜索切换」）。

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


---

## 可选集成：WeKnora 知识库（Knowledge Plane）

`dsh research` 可通过官方插件 `@wxg-prc-cpg/dsh-weknora` 连上 WeKnora 部署，把领域知识
（RFC / 论文 / 草案）变成 RAG 检索源。4 个工具**只读**（不入库、不改分块、不删除），
进 research 会话工具目录：

| 工具 | 用途 |
|---|---|
| `weknora_list_knowledge_bases` | 列出可见知识库及 ID |
| `weknora_search` | 混合检索片段 + 匹配文档标题（返回 knowledge_id / 分块 / 得分） |
| `weknora_read_document` | 按文档读有序正文（标题 / 摘要，长文翻页） |
| `weknora_ask` | 在 WeKnora 创建/续接会话，返回答案 + 引用（走服务端模型，较慢） |

**配置**（deploy 生命周期已并入——模板声明 + 首次部署自动补装，重跑不丢）：

```bash
# 0. 前置：Node 24+、全局 dsh
# 1. 一次性：API key（平台级 key 再加 tenantId）
export WEKNORA_API_KEY='sk-你的key'        # 需要 retrieve；weknora_ask 还需 chat
export WEKNORA_TENANT_ID='...'             # 仅平台级 key 需要（X-Tenant-ID 选工作空间）
# 2. 部署 research profile（自动带上 weknora 声明 + 配置行）
DSH_HOME="$HOME/.dsh" ./dsh-research/scripts/deploy-profile.sh
# 3.（可选）确认配置就位
DSH_HOME="$HOME/.dsh" dsh --profile research --dump-config | grep -A6 'id: weknora'
```

⚠️ 模板 `profiles/research/cordis.patch.yml` 的 `baseUrl` 是作者**内网** WeKnora 地址，
公网不可达——请改成你自己的部署（`baseUrl` 含 `/api/v1`）。`apiKey` / `tenantId` 走环境变量，
**不写进仓库**；插件未装时该行被**静默丢弃**（非致命警告 `entry not found`），不阻塞启动。
`knowledgeBaseIds: []` 默认留空 = 自动检索凭据可见的全部知识库；收紧时改模板该行后重跑 deploy。

### 排查

| 现象 | 检查 |
|---|---|
| 加载阶段报配置错误 | 逐字段核对 `baseUrl`（含 `/api/v1`）、`toolPrefix`（`^[a-z][a-z0-9_]*$`） |
| 检索 401/403 | key 是否有效、有 `retrieve` 能力、授权到目标知识库 |
| `weknora_ask` 被拒 | key 是否另有 `chat`；平台级 key 是否已配 `tenantId` |
| 引用无图片直链 | `resourceUrls: public` 是否生效，部署是否配了可访问外链 |
| 长问题超时 | 调大 `chatTimeoutMs`，检查 WeKnora 服务端模型调用 |

## 可选集成：联网搜索（dsh-web-search-plugin）

`dsh research` **不再使用 dsh 内置的 web 搜索**（base 的 `web-search-deepseek` host 插件，
DeepSeek 官方后端），改由社区插件 `dsh-web-search-plugin`（v0.5.x）统一提供 **9 个搜索后端**：
DeepSeek（官方，默认）/ Tavily / Brave / Serper / SerpApi / Exa / SearXNG / Scavio / Firecrawl。
`web_search` 工具沿用不变，只换底层 provider；插件 bundle 自带 patch 会覆盖 `web` 行的
`searchProvider=dsh-web-search`，并**禁用内置的 `web-search-deepseek`**。

插件已并入 **deploy 生命周期**（与 weknora 同机制）：

```bash
DSH_HOME="$HOME/.dsh" ./dsh-research/scripts/deploy-profile.sh
DSH_HOME="$HOME/.dsh" dsh --profile research --dump-config | grep -E "searchProvider|web-search-deepseek|id: dsh-web-search-plugin"
```

**选后端**：默认 `provider = deepseek-official`（仍走 DeepSeek 官方搜索，会耗费模型 token）。
要省官方调用，在 **Web UI → 设置 → 网页搜索** 卡片选第三方引擎（Tavily keyless 免账号，
其余对应各自 `*_API_KEY` 环境变量或卡片内直填）并保存即可，无需重启插件或改 YAML。
要固定默认后端：改模板 `profiles/research/cordis.patch.yml` 的 `- id: dsh-web-search-plugin`
行 `provider:`，重跑 deploy 生效。恢复内置搜索：在侧栏**插件**页停用 `dsh-web-search-plugin` 组合包。

### 排查

| 现象 | 检查 |
|---|---|
| `web_search` 报 401/超时 | 插件是否在 bundles；选的是官方还是第三方后端、key 是否生效 |
| 官方 DeepSeek 搜索域名不通 | 会话模型与**搜索**后端独立；官方搜索需公网可达 `api.deepseek.com`，或换第三方后端 |
| 搜索仍走 DeepSeek 官方 | provider 默认即官方；在设置卡片选第三方引擎并保存 |
| 想改默认后端 | 模板 `provider:` 改值 → 重跑 deploy（卡片改动会覆盖模板默认） |

## 可选集成：科研绘图（右侧栏 tab）

`research-draw` host 插件提供**科研绘图**右侧栏 tab + `research_draw` / `research_draw_status`
工具（paper 预设）。双后端：`local`（本机 mflux CLI 调 Qwen-Image-2.1，非驻留、并发 1，
支持垫图 edit）/ `api`（OpenAI 兼容 images API）。文字/图形错乱（Qwen 系文字短板）处理纪律见
`dsh-research/skills/draw/SKILL.md`（分类 → 提示词纪律 → 结构化图 → 两阶段混合 → 验收）。
路由与尺寸处理在 `dsh-research/src/draw/`。
