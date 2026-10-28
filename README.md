# dsh-routing-research — 域间路由安全研究 Agent（操作命令 `dsh research`）

> **EN (What is this?):** A domain-specific **Research Agent OS** built on top of the
> [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) runtime,
> targeting **inter-domain routing security** research (BGP / RPKI / BGPsec / ASPA / VRO / CRC /
> FC-BGP, with FRR / VPP as real-network executors). It ships **Research / Verification /
> Experiment loops**, a Claim→Evidence controlled plane, five research memories, DAG-based
> task scheduling, automated experiment campaigns (deterministic simulator + real daemon
> adapters), paper/slides generation and TRIZ-based hypothesis generation. Everything is a
> **pure overlay** on dsh (profile + bundle + skills); it never forks or edits the harness.

在 **DeepSeek Harness（dsh）** 之上构建的领域专用科研 Agent（**Research Agent OS**），
面向 **域间路由安全（BGP / RPKI / BGPsec / ASPA / VRO / CRC / FC-BGP）**，
实现「检索 → 阅读 → 假设 → 实验 → 验证 → 反证 → 成文」的科研流水线。

本仓库只做 dsh 的**上层叠加**：`dsh` 是运行时（操作系统底座），我们的成果 =
**profile + bundle（preset + 插件）+ skills**，**绝不修改 `deepseek-harness/` 内部代码**。

**English quick start** (prereqs: Node 24+, global dsh runtime, an OpenAI-compatible model gateway):

```bash
git clone <repo-url>                              # deepseek-harness 已不入库，见 §3
npm install -g @deepseek-ai/dsh                   # dsh runtime (v0.2.x / 当前 0.2.1-rc.2)
DSH_HOME="$HOME/.dsh" ./dsh-research/scripts/deploy-profile.sh
dsh research                                      # starts the Web UI (http://127.0.0.1:3080/)
```

---

## 目录

1. [这是什么](#1-这是什么)
2. [架构总览](#2-架构总览)
3. [`deepseek-harness/` 是什么](#3-deepseek-harness-是什么)
4. [快速开始（安装与运行）](#4-快速开始安装与运行)
5. [5 套 Profile 与角色视图](#5-5-套-profile-与角色视图)
6. [科研流水线：数据模型 / 记忆 / 工具](#6-科研流水线数据模型--记忆--工具)
7. [模型配置（Provider-Neutral）](#7-模型配置provider-neutral)
8. [领域知识分层](#8-领域知识分层)
9. [可选集成：WeKnora 知识库 / 联网搜索 / 科研绘图](#9-可选集成weknora-知识库--联网搜索--科研绘图)
10. [目录结构](#10-目录结构)
11. [开发与贡献](#11-开发与贡献)
12. [发布 npm 包（可选）](#12-发布-npm-包可选)
13. [许可协议（License）](#13-许可协议license)

---

## 1. 这是什么

**dsh-routing-research** 是一个面向域间路由安全研究的领域专用科研 Agent。它的定位不是
“更强的 Codex”，而是把 **Research Loop 与 Engineering Loop 分开**的科研操作系统：

- **研究范围**：BGP / RPKI / BGPsec / ASPA / VRO / CRC / FC-BGP；
  真实网元执行器 **FRR / VPP**（沙箱无二进制时回退**确定性路由引擎模拟器**，同 seed 可复现）。
- **科研纪律**：所有关键 Claim 必须绑定 Evidence 与 Source；结论必须经过
  **Verification Loop（Evidence Check / Counter Search / Experiment Test）** 后
  才能从 `hypothesis` 晋升为 `verified` 结论；区分 Fact / Hypothesis / Assumption / Result；
  无实验数据不得声称“实验验证”。
- **命名口径**：产品名 `dsh-routing-research`（“域间路由安全研究专用”），
  操作命令保持 `dsh research`（== `dsh --profile research`）。内置领域词汇的唯一口径来源 =
  `dsh-research/src/domain/vocabulary.ts`（GLOSSARY，含 BGP / RPKI / BGPsec / ASPA / VRO /
  CRC / FC-BGP 一词条定义，以及 FRR / VPP 执行器）。

## 2. 架构总览

```
                 Research Agent OS (本仓库 = dsh 上层叠加)
                    Research Director（Goal → Plan → Execute → Verify → Reflect → Continue）
   Research Knowledge Layer: Claims | Evidence | Hypothesis | Sources | Artifacts
   Agent Layer:   Literature | Protocol | Engineer | Experiment | Reviewer
   Execution Layer: Shell | Browser | MCP | FRR | VPP | Docker | SSH | Git
   Harness Layer:  Session | Agent Loop | Tools | Skills | Sandbox | Jobs
                   | Storage | Subagent | Context | LLM | Schedule      ← dsh（运行时）
   Model Layer:    DeepSeek | Qwen | OpenAI-compatible | Local LLM（Provider-Neutral）
```

三条核心循环（分开实现、可独立调用）：

| 循环 | 流程 | 对应 |
|---|---|---|
| **Research Loop** | Search → Read → Reason → (Engineering: Code → Test → Deploy) → Verify → Evidence → Artifact → Paper/PPT | `research_autonomous` / Director |
| **Verification Loop** | “I think X” → Evidence Check / Counter Search / Experiment Test → **verdict**（verified / disputed / rejected） | `research_verify` |
| **Experiment Loop** | Hypothesis → Spec → Provisioning → Execute → Measure → Analyze → Verify → Archive（deploy → run(×repetitions) → collect → analyze → verify → archive） | `research_campaign` |
| **Engineering Loop**（不废弃） | TODO → Codex/CodeBuddy → 修改 → 验证 → 下一轮，升级为 **Engineering Executor** | engineering profile |

> 核心对象：`ResearchProject / ResearchGoal / ResearchTask(DAG) / ResearchClaim /
> ResearchEvidence / ResearchHypothesis / ResearchExperiment / ResearchResult /
> ResearchArtifact / Verification`。任务调度 = “当前 DAG 中依赖已满足、且信息增益最高”的节点，
> 不是简单 TODO list。

## 3. `deepseek-harness/` 是什么

它是 **DeepSeek Harness（dsh）的官方上游源码**，做**源码级只读参考**（“API 手册”）用。

> **当前状态（2026-10-28）**：已**不再作为 submodule 入库**——gitlink 与 `.gitmodules` 已删除、
> 目录进 `.gitignore`（`deepseek-harness/`），本仓库**不再持有上游 pin**。dsh = **纯前置依赖**，
> 由 `npm install -g @deepseek-ai/dsh` 提供。

- **角色 = 运行时 / 操作系统底座**。dsh 提供 Agent Loop、Session、LLM Provider、
  Tool Registry、Sandbox、Subagent、MCP、Jobs、Storage、Skill、Context 等**一切基础设施能力**；
  本仓库（dsh-routing-research）是构建在它之上的 **Research Agent OS**。
- **只读参考，绝不修改**。本仓库所有能力都通过 dsh 的**公开 seam** 叠加：
  bundle patch（`dsh-research/cordis.patch.yml` + `presets/*.patch.yml`）、
  profile overlay（`profiles/<name>/cordis.patch.yml`）、preset / skill-filesystem / tool
  注册。开发新插件时，它相当于“API 手册”——去 `deepseek-harness/packages/*` 里查公开 seam 的用法。
- **运行不依赖它**。`dsh research` 跑的是**全局安装的 dsh 运行时**
  （`npm install -g @deepseek-ai/dsh`），只消费公开 seam，不 import 上游内部路径。
- **怎么本地拿一份参考源码（可选，不入库不 pin）**：
  ```bash
  git clone https://github.com/deepseek-ai/deepseek-harness.git ~/deepseek-harness
  # 或 cd 到本仓库后：git clone --depth 1 <url> deepseek-harness （目录已被 .gitignore 忽略）
  ```
  该目录进 `.gitignore`，不随本仓库提交；删除 / 重建 / 不动它都完全不影响安装、启动与运行。

## 4. 快速开始（安装与运行）

### 前置条件

- **Node.js 24+**（Node 24 的 strip-only 类型剥离不允许 `node_modules` 下的 `.ts`，
  npm 实装包在 `pack.sh` 里会被预编译为 JS，本地 symlink 开发模式无此问题）。
- **全局 dsh 运行时**：`npm install -g @deepseek-ai/dsh`（v0.2.x，走 `$DSH_HOME/profiles`
  的 two-anchor 解析）。

> **版本对齐（兼容性声明，v0.2.1）**：本仓库与 `@basil/dsh-research` 当前按以下版本组合构建与
> 验证，发版即以该组合为准：
>
> | 组件 | 版本 | 说明 |
> | --- | --- | --- |
> | `@deepseek-ai/dsh`（运行时） | `0.2.1-rc.2` | `npm install -g @deepseek-ai/dsh`；走 `$DSH_HOME/profiles` two-anchor |
> | `@basil/dsh-research`（本仓库 bundle） | `0.2.1` | 见 `dsh-research/package.json`（对齐 dsh 0.2.x 主版本） |
> | `@wxg-prc-cpg/dsh-weknora`（知识平面 RAG） | `0.1.0` | WeKnora 知识库插件 |
> | `dsh-web-search-plugin`（联网搜索） | `0.5.1` | 替换 dsh 内置 web 搜索 |
>
> 对齐方式：`profiles/<name>/package.json` 的 bundles `/ dependencies` 声明与
> `dsh-research/package.json` 一一对应；升级 dsh 运行时请参照 `CHANGELOG.md` 的兼容修复记录
> （如 0.2.1-rc.2 需移除 preset 的 `toolFilter` / `backgroundMode` 与 persona `{{cwd}}`）。
- **一个可用的 LLM 网关**：默认需要 OpenAI 兼容 endpoint（DeepSeek / Qwen / 本地 LLM 均可），
  见 [§7 模型配置](#7-模型配置provider-neutral)。
- **pnpm**（仅“模式 B 全链路校验”需要）：`npm i -g pnpm` 或 `corepack enable pnpm`。

### 模式 A：开发部署（symlink，改码立即生效，推荐本地开发）

不复制代码，`deploy-profile.sh` 把 profile 模板写入 `$DSH_HOME`，并把 `@basil/dsh-research`
以 **symlink 指向仓库**（`profiles/<name>/node_modules/@basil/dsh-research`
→ `$REPO_ROOT/dsh-research`）：**改 dsh-research 源码立即生效、免重装**。

```bash
# 1. 进入仓库
cd <repo-root>

# 2. 部署 research profile 到 $DSH_HOME（默认 ~/.dsh；首次部署会自动补装模板声明的
#    第三方插件 weknora / dsh-web-search-plugin；DEPLOY_AUTO_PLUGINS=0 可关闭）
DSH_HOME="$HOME/.dsh" ./dsh-research/scripts/deploy-profile.sh

# 3.（可选）验证组合树：应出现 web 基座 + research-* host 行 + preset-research
DSH_HOME="$HOME/.dsh" dsh --profile research --dump-config | grep -E "web|research-|preset-research"

# 4. 运行（research profile 基于 web 基座，启动 Web UI）
dsh research
#   → 浏览器打开 DeepSeek Harness Web UI（默认 http://127.0.0.1:3080/）。
#     科研任务（15 个 research_* 工具）在浏览器会话里交互执行；
#     web 基座不接受位置参数（不支持 `dsh research "<任务>"`）。
#   不想自动开浏览器：dsh research --no-open；改端口：dsh research --port 8080
```

> 若提示 `profile "research" does not exist`：profile 尚未部署到 `$DSH_HOME`，先执行第 2 步。
> 重跑 deploy 会刷新 `package.json` 与 `cordis.patch.yml`（含模型层 overlay），
> 不会破坏已在用的记忆/会话。

### 模式 B：npm 打包 / 发布 / 直装

`pack.sh` 把 `@basil/dsh-research` 打成**可 boot 的** npm tarball（先构建 staging：
类型剥离 + 相对 import `.ts→.js` + staged `package.json`，产物**只含编译后 JS**；
并校验包内必须包含 host 插件 / presets / chain patches / skills / smoke 脚本）。

```bash
# 1. 打包（跑单测 → 构建 staging → npm pack → 产物内容校验）
./dsh-research/scripts/pack.sh
#    → dist/basil-dsh-research-<version>.tgz

# 2a. 本地 tarball 直装（不发布）
DSH_HOME="$HOME/.dsh" dsh plugin --profile research add ./dist/basil-dsh-research-<version>.tgz

# 2b. npm 发布后从 registry 装
dsh plugin --profile research add @basil/dsh-research

# 3. 可选：全链路安装校验（打包 → 装入 scratch profile → boot 探针 → 组合树断言）
VERIFY_INSTALL=1 ./dsh-research/scripts/pack.sh
```

两种部署模式互补：模式 A（dev symlink）改码即生效，适合日常开发；
模式 B（npm 实装）是发布 / 分发形态（可在无仓库的机器上用）。

### 部署后验证

```bash
# 单元测试（不依赖 dsh）
cd dsh-research && node --test "src/**/*.test.ts"     # 当前 278/278 全绿

# dsh 真实运行树冒烟（服务 / 工具 / preset 作用域 / 角色白名单 / verdict）
DSH_HOME=/tmp/dsh-home ./dsh-research/scripts/deploy-profile.sh
DSH_HOME=/tmp/dsh-home node dsh-research/scripts/runtime-smoke.mjs   # → SMOKE PASS

# --patch 组合链验证（base → research policy → bgp research → experiment-specific）
DSH_HOME=/tmp/dsh-home ./dsh-research/scripts/verify-patch-chain.sh  # → CHAIN VERIFY OK
```

## 5. 5 套 Profile 与角色视图

`profiles/` 提供 5 套可部署模板，全部基于 **web 基座**（bundle =
`@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app` + `@basil/dsh-research`），
差异只在默认 preset 与 persona（角色 preset 定义见 `dsh-research/presets/roles.patch.yml`）。
`research_*` 工具按角色白名单裁剪（`src/plugin-tools.ts` 的 `config.tools.only` 过滤）。

| Profile | 命令 | 默认 preset | 定位 | `research_*` 工具白名单 |
|---|---|---|---|---|
| research | `dsh research` ① | research | Research Agent 完整流水线（全量） | 15 个基础工具（全量，含 triz / triza） |
| paper | `dsh --profile paper` ② | paper | 写作 Agent（论文 / 幻灯片 / 科研绘图） | 12 个（含 **draw / draw_status**） |
| experiment | `dsh --profile experiment` | experiment | 实验战役 Agent（campaign 四口径） | 10 个 |
| engineering | `dsh --profile engineering` | engineering | 工程执行 Agent | 8 个（含 triz / triza） |
| reviewer | `dsh --profile reviewer` | reviewer | 同行评审 Agent（8 步清单） | 8 个 |

① 仅 `research` 有命令别名（`dsh research`）；其余角色统一 `dsh --profile <name>`。
② 其余 profile **先部署后调用**：`DSH_HOME="$HOME/.dsh" ./dsh-research/scripts/deploy-profile.sh
paper` → `dsh --profile paper`。未部署时 dsh 会报 `profile does not exist`。

## 6. 科研流水线：数据模型 / 记忆 / 工具

### 数据模型与五类记忆

- **核心对象**见 §2；每个 ResearchGoal 的每个 Objective 都携带
  `Hypothesis / Tasks / Evidence / Experiments / Results / Verification / Counterexamples / Status`。
- **Research Memory（五类，缺一不可）**：`semantic`（知识）/ `episodic`（历史过程）/
  `artifact`（文件与结果）/ `hypothesis`（假设库）/ `evidence`（证据台账）。
  默认全内存；`profiles/research/cordis.patch.yml` 已把 `memory.dir` 指到
  `$DSH_HOME/profiles/research/memory` → 跨会话 JSON 落盘，重启后 `loadMemoryInto` 还原。
- 铁律：**不能把“模型曾经说过”当作事实**——每条 claim 必须记录
  `source / evidence / confidence / verified / last_verified`，否则视为未验证。

### `research_*` 工具（preset 作用域，仅研究会话可见）

| 工具 | 作用 |
|---|---|
| `research_search` | 领域检索；缺省 query 用内置领域词表兜底（seeded） |
| `research_record` | 记录 claim / evidence / artifact（可追溯） |
| `research_verify` | **Verification Loop**：Evidence Check / Counter Search / Experiment Test → verdict |
| `research_review` | 论文 8 步结构化审稿（`research-paper-review`） |
| `research_experiment` | 单轮实验（plan + run） |
| `research_campaign` | **自动实验战役**：deploy → run(×repetitions) → collect → analyze → verify → archive |
| `research_paper` | 生成论文（摘要 + 6 章 + 附录 A 证据追溯） |
| `research_slides` | 生成 Marp 科研幻灯片（与 paper 共享同一输入） |
| `research_autonomous` | **一键科研流水线**：Goal DAG → Director → 实验矩阵（4 攻击 × 4 验证策略）→ 验证折入 → 论文 + 幻灯片 → 归档 |
| `research_policy` | Research Agent Policy（10 条纪律） |
| `research_job` | 长任务队列（状态机 + 可取消） |
| `research_schedule` | 周期调度（at / daily / everyMs） |
| `research_reflect` | 自省改进（基于 episodic + artifact 统计 → 观察 + 建议 + 反思） |
| `research_triz` | TRIZ 矛盾分析 → 40 发明原理 → **机制方向假说**（confidence=0.5，未核验不得成为 claim） |
| `research_triza` | TRIZa 闭环治理：契约冻结 → 功能信息 FI → 四类硬门 → 晋升决策（promote/revise/reject/escalate）→ 追溯包 |
| `research_draw` / `research_draw_status` | 科研绘图（paper 预设）：提交图任务 / 轮询状态；local mflux CLI 或 OpenAI 兼容 images API 双后端 |

### 自动实验（四口径统计）

`RouteEngineSim`（确定性模拟，mulberry32 同 seed 可复现）为默认执行源，FRR / VPP
二进制可用时自动接管（`available` 探测）；未安装且关闭回退时抛 `TopologyUnavailableError`。
四口径：`detection_rate / false_positive_rate / convergence_time / verification_latency`
（均值 ± 样本标准差 + 95%CI），`summarizeDetection` → `effectiveScore = det.mean − fp.mean`，
`repetitions ≥ 3`，拒绝单点结论。攻击语义：ROV 对 prefix-hijack verified、对
path-manipulation rejected（需 BGPsec）已在自治流水线中固化验证。

### TRIZ（假说生成 / 机制设计方法）

研究卡在“两难”（如检测率 ↔ 收敛延迟、安全强度 ↔ 开销）时，用 `research_triz` 把矛盾
形式化为“改善 ↔ 恶化”技术矛盾 → 查 40 发明原理 / 39 参数 / 精选矛盾矩阵（诚实标注
`curated-matrix | heuristic-fallback | unresolved`）→ 得到机制方向假说。Web UI 右侧栏
**「TRIZ 发明原理」面板**会把 `research_triz` 与自动映射（`research-triz-auto`，每个最终回答自动映射到
发明原理、每轮至多 1 条）写入的 note 渲染成卡片；**侧边栏是 TRIZ 唯一展示面**，
回答正文不追加 TRIZ 小节（保证确定性分析面与模型自写面一致）。工作流见
`dsh-research/skills/triz/SKILL.md`；代码旁的论文化说明见 `docs/2610.04555v1.pdf`。

## 7. 模型配置（Provider-Neutral）

模型只是 **Model Provider**，不是 Agent 本体。dsh 生态分两层模型默认值：

- **base 默认** `deepseek-official`：用环境变量 / credential-ref `DEEPSEEK_API_KEY`
  （若 key 是占位值会 401）。
- **本仓库 profile 默认**：走一个 OpenAI 兼容网关（provider `local-interval-dsv4`，
  key 取 credential-ref `LOCAL_INTERVAL_DSV4_API_KEY`，默认模型 `dsv4flash`）。

⚠️ **仓库里 `profiles/<name>/cordis.patch.yml` 的 `baseURL: http://10.2.165.201:8232/v1`
是作者私有的内网网关（RFC1918 私网地址），公网不可达，且属于**不适合随开源仓库公开的内容**——
公开 GitHub 前请先把 `profiles/<name>/cordis.patch.yml` 里的 `baseURL` /
`apiKeyEnv` / 模型 id 替换为你自己的网关（或删掉这两层 overlay 走官方 DeepSeek），
再重跑 `deploy-profile.sh`。换机器 / 换网关时：

```bash
# 方式一：用 base 默认（DeepSeek 官方）
export DEEPSEEK_API_KEY='sk-...'
# 把 profiles/<name>/cordis.patch.yml 里 llm-pi-ai + agent-default-model 两层 overlay 删掉后重跑 deploy

# 方式二：指向你自己的 OpenAI 兼容网关
# 编辑 profiles/<name>/cordis.patch.yml 的 baseURL / apiKeyEnv / 模型 id，然后重跑 deploy
DSH_HOME="$HOME/.dsh" ./dsh-research/scripts/deploy-profile.sh
```

任何 provider（DeepSeek / Qwen / OpenAI 兼容 / 本地 LLM）都能接入；“一个模型 active、
随时切换”在 Web UI 的模型设置里完成；角色级路由可在 `src/model-router/` 覆盖。

## 8. 领域知识分层

**Skill = 程序性能力**（experiment 实验纪律 / paper-review 审稿工作流 / triz 方法），按需进会话目录；
**领域知识 ≠ Skill**（“某机制是什么”是参考数据），不与 skill 混放：

- 一句话口径 → `dsh-research/src/domain/vocabulary.ts`（**GLOSSARY，唯一口径来源**）
- 详细参考 → `docs/domain-knowledge-notes.md`（非权威速记；下结论前以 **RFC / IETF 草案 /
  顶会论文原始来源**为准）
- 长期知识平面 → 可选 **WeKnora 知识库**（RAG 检索，见 §9）

## 9. 可选集成：WeKnora 知识库 / 联网搜索 / 科研绘图

三个可选能力（官方/社区插件）已并入 **deploy 生命周期**——模板声明了插件
（`profiles/research/package.json` 的 bundles/dependencies + `cordis.patch.yml` 的配置行），
`deploy-profile.sh` 首次部署**自动补装**、已装跳过、重跑不丢；插件未装时对应 patch 行被**静默
丢弃**（非致命警告），不阻塞启动。

- **WeKnora 知识库（Knowledge Plane）**：`@wxg-prc-cpg/dsh-weknora` 把 RFC / 论文 /
  草案变成 RAG 检索源。4 个只读工具：`weknora_list_knowledge_bases` / `weknora_search` /
  `weknora_read_document` / `weknora_ask`。用前需自备 WeKnora 部署与 API key：
  `export WEKNORA_API_KEY=sk-...`（`ask` 另需 `chat`；平台级 key 加 `WEKNORA_TENANT_ID`），
  `baseUrl` 在模板 `profiles/research/cordis.patch.yml` 里改成你自己的。
- **联网搜索切换**：`dsh-web-search-plugin` 提供 9 个搜索后端（DeepSeek 官方默认 / Tavily /
  Brave / Serper / SerpApi / Exa / SearXNG / Scavio / Firecrawl），替换 dsh 内置 web 搜索；
  `web_search` 工具沿用不变。在 **Web UI → 设置 → 网页搜索** 卡片选后端并保存即可，无需重启。
- **科研绘图（右侧栏 tab）**：`research-draw` host 插件 —— local（mflux CLI 调
  Qwen-Image-2.1）或 OpenAI 兼容 images API 双后端；文字/图形错乱处理纪律见
  `dsh-research/skills/draw/SKILL.md`。

> 详细操作与排查表见 `profiles/README.md`（WeKnora 401/403、`resourceUrls`、
> 搜索后端切换、TRIZ 面板重启缓存等）。

## 10. 目录结构

```
research-agents/            # 本仓库（deepseek-harness/ 为可选本地参考，进 .gitignore，不入库）
├── dsh-research/           # 核心 TS bundle：领域层 + 运行时插件 + skills + 脚本
│   ├── src/core/                  # 核心领域对象：goal / dag / claim / evidence / verification / artifact
│   ├── src/memory/                # 五类 Research Memory
│   ├── src/agents/                # Literature / Reviewer / Experiment 角色
│   ├── src/domain/                # vocabulary.ts —— 命名定型 + 内置领域词汇（唯一口径）
│   ├── src/research-director/ + 三个 loop/   # 调度 + Research / Verification / Experiment 循环
│   ├── src/experiment/            # 实验层：stats / RouteEngineSim / FRR·VPP 适配器 / 自动战役
│   ├── src/autonomous|jobs|scheduler|self-improve|real-subagent|policy|roles|model-router/
│   ├── src/triz+triza|draw/       # TRIZ 知识基+分析引擎 / TRIZa 闭环治理 / 科研绘图
│   ├── src/plugin-*.ts            # Cordis 插件（core/triz/triza/triz-ui/triz-auto/draw/
│   │                              #   director/experiment/writer/operations/tools）
│   ├── presets/                   # preset 平面：research.patch.yml + roles.patch.yml（5 角色）
│   ├── patches/                   # --patch 组合链：chain-{research-policy,bgp-research,fcbgp-experiment}.yml
│   ├── skills/                    # 程序性 skill：experiment / paper-review / triz / draw
│   ├── client/ lib/               # Web UI 右侧栏（TRIZ / 科研绘图）浏览器半边
│   └── scripts/                   # deploy-profile.sh / runtime-smoke.mjs / verify-patch-chain.sh / pack.sh / build.mjs
├── profiles/               # 可部署 Profile 模板（research + paper/experiment/engineering/reviewer）
├── docs/                   # 架构 / 数据模型 / 领域知识笔记 / 调研报告
├── AGENTS.md / TODO.md / CHANGELOG.md   # 操作手册、路线图、变更日志
└── .gitignore              # 含 deepseek-harness/（本地参考不入库）
```

## 11. 开发与贡献

黄金规则（详见 `AGENTS.md`）：

1. **不 fork、不修改 `deepseek-harness/`**，只当只读参考（可选本地 clone，不入库）。
2. 新能力 = 独立 bundle / plugin / profile / patch 层；只消费 dsh 的公开 seam。
3. 模型是 provider，不是 agent 本体；保持 provider-neutral，随时切换。
4. 研究产出与实验 artifact 必须可追溯、可归档。
5. 完成科研任务前必须执行 Verification Loop；最终输出可追溯到 Evidence。

常用命令：

```bash
# 单元测试
cd dsh-research && node --test "src/**/*.test.ts"          # 278/278
# 运行时冒烟 / 组合链验证（无须真机）
DSH_HOME=/tmp/dsh-home node dsh-research/scripts/runtime-smoke.mjs   # SMOKE PASS
DSH_HOME=/tmp/dsh-home ./dsh-research/scripts/verify-patch-chain.sh  # CHAIN VERIFY OK
# 打包
./dsh-research/scripts/pack.sh
```

## 12. 发布 npm 包（可选）

`dsh-research` 是一个可作为 npm 包发布的 bundle（`dsh plugin --profile <name> add <pkg>`）。
当前包名 `@basil/dsh-research` 是作者个人 scope：

> 本仓库**自用为记录仓库、默认不出 npm 包、不 `npm publish`**（作者不对外发版；如你 fork 后要发版，
> 请按 §4「版本对齐」表配置 `@basil/dsh-research@0.2.1` → 你自己的版本号，再照本节约流程执行）。

- **版本口径**：当前 `@basil/dsh-research@0.2.1`，面向 **dsh runtime `v0.2.1-rc.2`**（与 dsh
  0.2.x 主版本对齐）；配套选装插件 `@wxg-prc-cpg/dsh-weknora@0.1.0` / `dsh-web-search-plugin@0.5.1`
  （见 §4 前置条件「版本对齐」表）。升版本号改 `dsh-research/package.json`，写对应 CHANGELOG
  条目并打 git tag。

- 发布前先经 `pack.sh` 产出 staging（含编译后 JS，位于 `dist/.staging/package`），从该目录
  `npm publish`（版本号在 `dsh-research/package.json`）。
- **fork 后如换 scope / 包名**，需要同步所有引用处（`grep -rn "basil" . --include=*.json
  --include=*.yml --include=*.sh --include=*.ts | grep -v node_modules`）：
  `dsh-research/package.json`（name / exports）、`dsh-research/cordis.patch.yml`（host 行
  `name:`，首行必须用裸包名）、`dsh-research/presets/*.patch.yml`、
  `profiles/*/package.json`（`dsh.profile.bundles`）、`dsh-research/scripts/deploy-profile.sh`
  （symlink 路径）。

## 13. 许可协议（License）

- **本仓库采用 [Apache-2.0](./LICENSE)**（作者自用记录仓库，2026-10-28 选定）。
- 贡献/使用视同接受 Apache-2.0 条款；保留版权声明与出处即可引用、修改、再分发。
