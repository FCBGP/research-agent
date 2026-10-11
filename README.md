# dsh-routing-research — 域间路由安全研究 Agent（操作命令 `dsh research`）

在 **DeepSeek Harness（dsh）** 之上构建的领域专用科研 Agent，面向
**域间路由安全（BGP / RPKI / BGPsec / ASPA / VRO / CRC / FC-BGP）**，
实现「检索 → 阅读 → 假设 → 实验 → 验证 → 反证 → 成文」的科研流水线
（Research Loop / Verification Loop / Experiment Loop）。

本仓库只做 dsh 的**上层叠加**：`dsh` 是运行时（操作系统底座），
我们的成果 = **profile + bundle（preset + 6 插件）+ skills**，
**绝不修改 `deepseek-harness/` 内部代码**。

## 命名定型（2026-10-09）

- **定型名称**：`dsh-routing-research` —— 域间路由安全研究专用 Agent（对应
  `prompts/dsh.md` §11「不要叫它 research」，`AGENTS.md` §3/§10 的 Profile 视图），
  不再用泛化的 "research" 自指。
- **操作命令不变**：`dsh research` == `dsh --profile research`（本 README 与 scripts
  仍用 `dsh research`；profile 目录名保持 `research`，部署模板 `profiles/research/`）。
- **内置领域词汇**：研究范围 = **BGP / RPKI / BGPsec / ASPA / VRO / CRC / FC-BGP**，
  真实网元执行器 = **FRR / VPP**。唯一口径来源 = `dsh-research/src/domain/vocabulary.ts`
  （命名 + 词表 + 词汇表常量），供 persona / preset 描述 / `research_search` 种子检索 /
  `researchCore.domain` 服务统一引用；`research_search` 缺省 query 时自动用领域词表兜底检索。

## 目录结构

```
research-agents/
├── deepseek-harness/      # 官方上游 git submodule（只读，禁止改动）
├── dsh-research/          # 核心 TS bundle：领域层 + 运行时插件 + skills + 脚本
│   ├── src/core/                 # 核心领域对象：goal / dag / claim / evidence / verification / artifact
│   ├── src/memory/               # 五类 Research Memory（semantic/episodic/artifact/hypothesis/evidence）
│   ├── src/agents/               # Literature / Reviewer / Experiment 三角色
│   ├── src/research-director/ + 三个 loop/   # 调度与三条循环
│   ├── src/experiment/           # 实验层：stats / RouteEngineSim / FRR·VPP 适配器 / 自动战役
│   ├── src/plugin-*.ts           # Cordis 插件六片：core/director/experiment/writer/operations/tools
│   │                             #   （plugin.ts 仅为兼容 re-export，运行时挂载走子路径）
│   ├── presets/                  # preset 平面：research.patch.yml（preset-research）
│   │                             #   + roles.patch.yml（paper/experiment/engineering/reviewer）
│   ├── patches/                  # bundle 组合：chain-{research-policy,bgp-research,fcbgp-experiment}.yml（--patch 组合链）
│   ├── skills/                   # 程序性 skill：experiment / paper-review（领域知识见 docs/domain-knowledge-notes.md + WeKnora）
│   └── scripts/                  # deploy-profile.sh / runtime-smoke.mjs / verify-patch-chain.sh / pack.sh
├── profiles/              # 可部署 Profile 模板（research + paper/experiment/engineering/reviewer）
├── research/              # 研究产出（报告 / 实验数据 / 实验脚本）
├── AGENTS.md / TODO.md    # dsh research 操作手册与路线图
└── .gitmodules            # 声明 deepseek-harness 为 submodule
```

## 部署（Deployment）

### 前置条件

- **Node.js 24+**。注意：Node 24 的 strip-only 类型剥离**不允许 node_modules 下的 .ts**
  （`Stripping types is currently unsupported for files under node_modules`），因此
  **npm 实装包必须发编译后 JS**（见模式 B，pack.sh 会先构建 staging）。
- **全局安装 dsh 运行时**：`npm install -g @deepseek-ai/dsh`（基线 dsh v0.2.x，
  走 `$DSH_HOME/profiles` 的 two-anchor 解析）。
- **pnpm**（仅模式 B 的 `VERIFY_INSTALL=1` 全链路校验需要）：`npm i -g pnpm` 或
  `corepack enable pnpm`。

### 模式 A：开发模式（symlink，改码立即生效，推荐日常工作）

不复制代码，`deploy-profile.sh` 把 profile 模板写入 `$DSH_HOME`，并把
`@basil/dsh-research` 以 **symlink 指向本仓库**（`profiles/<name>/node_modules/@basil/dsh-research`
→ `$REPO_ROOT/dsh-research`），**改 dsh-research 源码立即生效、免重装**。

```bash
# 1. 进入仓库
cd /Users/basil/2500/agents/research-agents

# 2. 部署 research profile 到 $DSH_HOME（默认 ~/.dsh）
#    默认 research；也可指定其它角色：
#      ./dsh-research/scripts/deploy-profile.sh paper         # Paper Agent
#      ./dsh-research/scripts/deploy-profile.sh experiment    # Experiment Agent
#      ./dsh-research/scripts/deploy-profile.sh engineering   # Engineering Agent
#      ./dsh-research/scripts/deploy-profile.sh reviewer      # Reviewer Agent
DSH_HOME="$HOME/.dsh" ./dsh-research/scripts/deploy-profile.sh

# 3. 验证组合树（应出现 web 基座 + research-* 5 行 + preset-research）
DSH_HOME="$HOME/.dsh" dsh --profile research --dump-config | grep -E "web|research-|preset-research"

# 4. 运行（dsh research == dsh --profile research；research profile 基于 web，启动 Web UI）
dsh research
#   → 浏览器打开 DeepSeek Harness Web UI（默认 http://127.0.0.1:3080/）。
#     科研任务（13 个 research_* 工具：research_autonomous / research_campaign 等）
#     在浏览器会话里交互执行；web 基座不接受位置参数（不支持 `dsh research "<任务>"`）。
#   不想自动开浏览器：dsh research --no-open；改端口：dsh research --port 8080
```

> 若提示 `profile "research" does not exist`：profile 尚未部署到 `$DSH_HOME`，
> 先执行第 2 步的 `deploy-profile.sh`。重跑 deploy 会刷新 `package.json` 与
> `cordis.patch.yml`（含模型层 overlay），不会破坏已在用的记忆/会话。

### 模式 B：npm 一键部署（打包 / 发布 / 直装）

`pack.sh` 把 `@basil/dsh-research` 打成一个**可 boot 的** npm tarball：
先用 `scripts/build.mjs` 构建 staging（类型剥离 + 相对 import `.ts→.js` + staged
`package.json`），再 `npm pack`；产物**只含编译后 JS**（含 `.ts` 视为失败项），
并校验包内必须包含 5 个 host 插件 / presets / chain patches / skills / smoke 脚本。

```bash
# 1. 打包（跑单测 → 构建 staging → npm pack → 产物内容校验）
./dsh-research/scripts/pack.sh
#    → dist/basil-dsh-research-0.2.0.tgz

# 2a. 本地 tarball 直装（不发布）
DSH_HOME="$HOME/.dsh" dsh plugin --profile research add ./dist/basil-dsh-research-0.2.0.tgz

# 2b. npm 发布后从 registry 装（发布操作详见下方「发布」）
dsh plugin --profile research add @basil/dsh-research

# 3. 可选：全链路安装校验（打包 → 装入 scratch profile → boot 探针 → 组合树断言）
VERIFY_INSTALL=1 ./dsh-research/scripts/pack.sh
```

**两种部署模式的关系**：互补，不是替代——模式 A（dev symlink）改码即生效，适合日常
开发；模式 B（npm 实装）是发布 / 分发形态（编译后 JS，可在无仓库的机器上用）。

**发布 `@basil/dsh-research`（可选）**：`npm publish` 前先经 `pack.sh` 产出 staging
（含编译后 JS 的产物树，位于 `dist/.staging/package`），从该目录发布；版本号在
`dsh-research/package.json`（当前 `0.2.0`）。

### --patch 组合链

三层 overlay 位于 `dsh-research/patches/`，可实现 `base → research policy →
bgp research → experiment-specific` 的分层覆盖：

- `chain-research-policy.yml`（L1）：research policy（research-operations 行）
- `chain-bgp-research.yml`（L2）：bgp research（research-core 行 memory.dir）
- `chain-fcbgp-experiment.yml`（L3）：experiment-specific（research-experiment 行 defaults）

验证（离线 dump-config 覆盖断言 + 运行时 smoke，失败即非零退出）：

```bash
DSH_HOME=/tmp/dsh-home ./dsh-research/scripts/verify-patch-chain.sh
# → CHAIN VERIFY OK（三层各落到正确行、后层覆盖前层、boot 仍 SMOKE PASS）
```

### 部署后验证

```bash
# 单元测试（不依赖 dsh）
cd dsh-research && node --test "src/**/*.test.ts"     # 137/137 全绿

# dsh 真实运行树冒烟：服务 + 13/13 工具 + standard 无 research_* + roles + 链默认
DSH_HOME=/tmp/dsh-home ./dsh-research/scripts/deploy-profile.sh
DSH_HOME=/tmp/dsh-home node dsh-research/scripts/runtime-smoke.mjs   # → SMOKE PASS

# --patch 组合链验证
DSH_HOME=/tmp/dsh-home ./dsh-research/scripts/verify-patch-chain.sh  # → CHAIN VERIFY OK
```

### 多角色 Profile

`profiles/` 提供 5 套可部署模板，全部基于 web 基座（bundle =
`@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app` + `@basil/dsh-research`），
仅默认 preset 与 persona 不同（角色 preset 定义见 `dsh-research/presets/roles.patch.yml`）：

| Profile | 命令 | 默认 preset | 定位 |
|---|---|---|---|
| research | `dsh research` | research | Research Agent 完整流水线 |
| paper | `dsh --profile paper` ① | paper | 写作 Agent（论文 / 幻灯片） |
| experiment | `dsh --profile experiment` | experiment | 实验战役 Agent（campaign 四口径） |
| engineering | `dsh --profile engineering` | engineering | 工程执行 Agent |
| reviewer | `dsh --profile reviewer` | reviewer | 同行评审 Agent（8 步清单） |

① 仅 `research` 有命令别名（`dsh research`）；其余角色统一用 `dsh --profile <name>`，
且**先部署后调用**：profile 未部署到 `$DSH_HOME` 时 dsh 会报 `profile does not exist`。

部署任一角色后，新会话默认就落在对应 preset：
`DSH_HOME="$HOME/.dsh" ./dsh-research/scripts/deploy-profile.sh paper` → `dsh --profile paper`。

## Profile 前端

`profiles/research` 在 **web 基座**上实现（与 `dsh --profile web` 同构，仅多叠
`@basil/dsh-research` 领域层）：bundle = `@deepseek-ai/dsh-base` +
`@deepseek-ai/dsh-web-app` + `@basil/dsh-research`。因此 `dsh research` 启动的是
**Web UI**（浏览器会话），而非 headless 一次性 CLI——位置参数任务已不再支持，
科研交互（research_autonomous / research_campaign 等）在 web 会话中完成。

## 模型路由（401 问题）

dsh 生态分两层模型默认值：

- **base 默认** `deepseek-official` 使用环境变量 / credential-ref `DEEPSEEK_API_KEY`；
  若该 key 是占位值（如本机 `.credentials.yaml` 里的 `0731`），会 401。
- **本 profile** 与 dsh web 一致，走本地 **interval DSV4 网关**：
  `llm-pi-ai` 提供 provider `local-interval-dsv4`（OpenAI 兼容，
  `baseURL http://10.2.165.201:8232/v1`），key 取自 credential-ref
  `LOCAL_INTERVAL_DSV4_API_KEY`；`agent-default-model` 把默认模型切到 `dsv4flash`。

两层 overlay 已固化在 `profiles/<name>/cordis.patch.yml`（5 个 profile 全部带齐，
web 同款）。`baseURL` 是本机内网地址，换机器/网关只需编辑对应 profile 的
`cordis.patch.yml` 后重跑 deploy。若其他 profile（如 `dsh --profile web` / `dsh headless`）
报 401，把同样的两层 overlay 加到对应 profile（如
`~/.dsh/profiles/headless/cordis.patch.yml`）即可。

## 领域知识分层（2026-10-10：domain knowledge ≠ skill）

**Skill = 程序性能力**（experiment 实验纪律 / paper-review 审稿工作流，见 `dsh-research/skills/`）；
**领域知识 = 参考数据**（bgp / rpki / bgpsec / fcbgp / aspa…「某机制是什么」），二者分开：

- 一句话口径 → `dsh-research/src/domain/vocabulary.ts`（GLOSSARY，唯一口径来源）
- 详细参考 → `docs/domain-knowledge-notes.md`（暂存归档）
- 长期运行的知识平面 → **WeKnora 知识库**（RAG 检索，见下节）

**FC-BGP 概念修正（2026-10-10）**：FC-BGP = **Forwarding Commitment BGP**（基于「转发承诺」的
BGP 安全研究，IETF SIDR/IDR 方向、草案阶段非 RFC），**不是**此前的「Function-Composed BGP
（无人机组网）」。已同步修正 `vocabulary.ts` GLOSSARY 与 `docs/domain-knowledge-notes.md`；
原 `skills/{bgp,bgpsec,fcbgp,rpki}` 参考速查已从 skill 目录迁出（skill 目录保留程序性两个：
experiment / paper-review）。

## WeKnora 知识库对接（dsh ↔ 腾讯 WeKnora，2026-10-10）

`dsh research` 可通过官方插件 `@wxg-prc-cpg/dsh-weknora` 连上已有 WeKnora 部署
（http://10.2.165.201），把领域知识（RFC / 论文 / 草案）变成 Knowledge Plane：混合检索、
按文档通读、带引用成稿回答。4 个工具**只读**（不入库、不改分块、不删除），进 research 会话工具目录：

| 工具 | 用途 |
|---|---|
| `weknora_list_knowledge_bases` | 列出可见知识库及 ID |
| `weknora_search` | 混合检索片段 + 匹配文档标题（返回 knowledge_id / 分块 / 得分） |
| `weknora_read_document` | 按文档读有序正文（标题 / 摘要，长文翻页） |
| `weknora_ask` | 在 WeKnora 创建/续接会话，返回答案 + 引用（走服务端模型，较慢） |

本仓库无法替你完成登录 10.2.165.201 的操作（API key / 知识库是你自己的），**以下清单请在真机终端执行**。

### 你要做的事（行动清单）

weknora 已并入 **deploy 生命周期**：仓库模板 `profiles/research/` 声明了插件
（`package.json` 的 bundles / dependencies + `cordis.patch.yml` 的 `- id: weknora` 配置行），
`deploy-profile.sh` 首次部署**自动补装**插件（`DEPLOY_AUTO_PLUGINS=0` 可关，改打印手动命令）。
**升级 dsh-research 后重跑 deploy 不会丢 weknora**（bundle 声明来自模板，node_modules
物理安装仍在）。你只需：

```bash
# 0. 前置：Node 24+、全局 dsh、pnpm（见「部署」前置条件）
cd /Users/basil/2500/agents/research-agents

# 1. 一次性：配置 API key（建议写进 ~/.zshrc 持久化；平台级 key 再加 tenantId）
#    export WEKNORA_API_KEY='sk-你的key'        # 需要 retrieve；weknora_ask 还需 chat
#    export WEKNORA_TENANT_ID='...'             # 仅平台级 key 需要（X-Tenant-ID 选工作空间）

# 2. 部署 research profile（自动带上 weknora 声明 + 配置行；首次自动装插件，已装则跳过）
DSH_HOME="$HOME/.dsh" ./dsh-research/scripts/deploy-profile.sh

# 3.（可选）确认配置就位
DSH_HOME="$HOME/.dsh" dsh --profile research --dump-config | grep -A6 'id: weknora'
```

4. **登录 http://10.2.165.201（Web UI）**：建/选一个知识库，把领域文档传进去（推荐：
   RFC 4271 / 6480 / 8205 / 9319，BGPsec / ASPA / FC-BGP / Forwarding Commitments 相关
   论文与 IETF 草案）。`knowledgeBaseIds` 默认留空 = 自动检索凭据可见的全部知识库；
   要收紧时改 `profiles/research/cordis.patch.yml` 的 `- id: weknora` 行
   （`knowledgeBaseIds: [kb-xxxx]`），重跑 deploy 即生效。
5. **生成/确认 API key**：必须含 **`retrieve`** 能力；要用 `weknora_ask` 还需 **`chat`**；
   平台级 key 另需 **tenantId**（请求经 `X-Tenant-ID` 选工作空间）。
6. **重启并验证**：`dsh research` 启动 Web UI，在 research 会话里应能看到 4 个 `weknora_*`
   工具；先 `weknora_list_knowledge_bases` 确认连通，再 `weknora_search` 验证带引用回答。

> **配置从哪来**：`baseUrl: http://10.2.165.201/api/v1`、`resourceUrls: public`、
> `knowledgeBaseIds: []` 等在仓库模板 `profiles/research/cordis.patch.yml`（不用在
> `$DSH_HOME` 手写，deploy 自动带上、重跑不丢）；`apiKey` / `tenantId` 走环境变量，
> **不写进仓库**。插件未装时该行在 patch 层被**静默丢弃**（dsh 打印非致命
> `patch: entry "weknora" not found` / `skipping profile bundle ... cannot resolve`），
> 不阻塞启动，装上即自动生效——所以模板可长期保留。若想改用插件自带 env 默认行
> （不用模板钉死的 baseUrl），删掉模板那行并在 shell 里 `export WEKNORA_BASE_URL=...` 即可。

### 排查

| 现象 | 检查 |
|---|---|
| 加载阶段报配置错误 | 逐字段核对 `baseUrl`（含 `/api/v1`）、`toolPrefix`（`^[a-z][a-z0-9_]*$`） |
| 检索 401/403 | key 是否有效、有 `retrieve` 能力、授权到目标知识库 |
| `weknora_ask` 被拒 | key 是否另有 `chat`；平台级 key 是否已配 `tenantId` |
| 引用无图片直链 | `resourceUrls: public` 是否生效，部署是否配了可访问外链 |
| 长问题超时 | 调大 `chatTimeoutMs`，检查 WeKnora 服务端模型调用 |

### 兼容性

官方插件验证于 dsh 0.1.0-rc.8 与 WeKnora 0.7.2/0.8.0（文档口径）；本机运行时 dsh 0.2.0-rc.2 /
Node 24。插件**零运行时依赖**、只用 `ctx.tools.register`（与仓库 6 个 research 插件同类 seam，
`inject: ['tools']`），预期兼容；若本机 dsh 工具契约有破坏性变更，加载阶段会报错。npm 侧如遇
`~/.npm` 写权限问题，用 `NPM_CONFIG_CACHE=/tmp/xxx`（或 `--cache /tmp/xxx`）绕开。

## 开发约定（黄金规则）

1. **不 fork、不修改 `deepseek-harness/`**，只当只读 submodule 参考。
2. 新能力 = 独立 bundle / plugin / profile / patch 层；只消费 dsh 的公开 seam。
3. 模型是 provider，不是 agent 本体；保持 provider-neutral，随时切换。
4. 研究产出与实验 artifact 必须可追溯、可归档。
5. 详细开发规范见 `AGENTS.md`，路线图见 `TODO.md`。
