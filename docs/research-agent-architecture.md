# research-agent-architecture.md — 在 deepseek-harness 之上搭建科研 Agent 而不影响上游更新

> 依据（按用户指定顺序阅读）：
> - [`README.zh.md`](../deepseek-harness/README.zh.md)
> - [`docs/development.zh.md`](../deepseek-harness/docs/development.zh.md)
> - [`docs/architecture.zh.md`](../deepseek-harness/docs/architecture.zh.md)
> - 辅证：`docs/capability-seams.zh.md`、`docs/cookbook/extension-cookbook.zh.md`、`docs/cookbook/adding-a-package.zh.md`、`packages/bundle/base/README.zh.md`、`packages/boot/app-boot/README.zh.md`、`apps/cli/src/*.ts`、`apps/cli/composition.md`

---

## 0. 结论（TL;DR）

**把 dsh 当作只读上游依赖，代码、配置、扩展三者全部放在它的源码树之外。** 只要遵守下面三条黄金规则，`git pull` 永远干净、永不冲突，你的 Agent 可以在 dsh 持续升级的同时稳定存在：

1. **代码不进 `deepseek-harness/`**：自定义插件/组合包放在独立 workspace（本仓库 `dsh-research/` 或独立 npm 包）。
2. **配置不进源码树**：一切运行时组装走 `$DSH_HOME/profiles/<name>` + `cordis.patch.yml` + `--patch` 覆盖层。
3. **只消费公开 seam**：用的是 `ctx.*` 服务、`agent/*`/`tools/*`/`session/event` 事件、以及发布的 `@deepseek-ai/dsh-*` 包入口，不 import 上游源码内部路径。

dsh 的架构文档明确承诺：*"不存在需要打补丁的特权内核；扩展 dsh 的方式是把插件挂载到其他插件旁边"*。这正是上下两层能解耦的结构性保证。

---

## 1. dsh 提供的结构性保证（为什么能做到"不碰上游"）

### 1.1 一切皆插件（Cordis）

- 产品每一部分都是插件：模型适配器、工具注册表、会话日志、agent loop 本身都可从配置替换。
- 所有注册都是"作用域副作用"，插件卸载时自动撤销 → 你在旁挂插件不会污染其他插件。
- 关键推论：**没有必须改的 privileged core**。要换能力 = 注册另一个 provider，而不是改源码。

### 1.2 分层叠加的组装机制（Profile / Bundle / Patch）

运行中的 dsh 是一棵插件树，按序叠加：

```text
空 root 条目列表
  ↑ 1) profile 列出的组合包（bundle），按 package.json 里 dsh.profile.bundles 的顺序
  ↑ 2) profile 自己的 cordis.patch.yml        （$DSH_HOME/profiles/<name>/cordis.patch.yml）
  ↑ 3) home 级用户 patch                      （$DSH_HOME/cordis.patch.yml —— 机器级，作用于所有 profile）
  ↑ 4) 任意 --patch overlay                   （按 argv 顺序，后盖先）
```

- patch 按 **id** 定位条目并**替换其整个 config**（不合并），或插入新条目 → 覆盖任何内置行都不需要改源码。
- `dsh --profile web --dump-config` 打印的每一个条目，都可以被你的 patch 替换。
- 组合包 = Cordis 配置项 + 挂载代码的分发格式 → 我们自研束 `dsh-routing-research` 就长这样。

### 1.3 Profile 与插件住在源码树之外

- profile 位于 `$DSH_HOME/profiles/<name>`（默认 `~/.dsh/profiles/<name>`），**不在仓库里**。
- `dsh plugin --profile <name> add <pkg>` 在 profile 目录内用 pnpm 安装外部插件 → `$DSH_HOME/profiles/<name>/node_modules`。
- `dsh plugin` 会**初始化一个基于 dsh-base 的 profile**（base 型），不必手写；`--from-default-profile <template>` 可从随附模板初始化自定义 profile。
- 因此：源码仓库升级 = `git pull` + `pnpm install`，你的 profile/插件目录根本不在其中。

### 1.4 稳定的分发入口 = 稳定 API

- 所有能力经**发布包入口**（`@deepseek-ai/dsh-*` 的 `main/exports`）暴露；仓库内的 `src` 内部结构不是契约。
- 开发者预览阶段会有破坏性变更，但方向是"seam 接口在有文档、有升级路径地演进"，且有版本兼容性豁免机制（`compatibility.json` / `dsh plugin version-exemptions`）。

---

## 2. 推荐的仓库布局（三块互不交叉）

```text
research-agents/                          # 本仓库 = 编排层（含现有 Python 科研智能体）
├── deepseek-harness/                     # ① 只读上游：自带 .git，git pull 更新，永不本地提交（当前 0.2.1-alpha.1，干净树）
├── dsh-research/                         # ② 我们的插件 workspace（独立 npm 包，全部新代码）
│   ├── packages/
│   │   ├── research-core/                #   数据模型 + ctx 服务（Claim/Evidence/Artifact/Memory/DAG）
│   │   ├── research-goal/                #   ResearchGoal（复用 dsh-goal 同会话持久语义）
│   │   ├── research-tools/               #   paper-search / rfc-search / citation-check /
│   │   │                                 #   experiment-run / result-analysis
│   │   ├── research-loops/               #   research-loop / verification-loop / experiment-loop（事件钩子）
│   │   ├── research-skills/              #   bgp / rpki / fcbgp / paper-review / experiment skill 提供方
│   │   ├── research-agents/              #   literature / protocol / engineer / experiment / reviewer 角色配置
│   │   └── routing-research/             #   dsh-routing-research 组合包（cordis.patch.yml 组装上面全部）
│   └── package.json
├── profiles/                             # ③ patch 源文件（可被 --patch 引用，也供复制进 $DSH_HOME）
│   ├── research/policy.yml               #   Research Agent Policy（10 条）
│   ├── research/bgp.yml                  #   BGP/RPKI 研究工作区默认
│   └── experiments/fcbgp-aspp.yml        #   实验专用 patch
├── docs/                                 # 本文件等三件套
└── src/research_agent/                   # 现有 Python agent（可降级/并存为外部 orchestrator）
```

三者职责：
- ① 上游：只 `git pull` / `pnpm install` / `pnpm run build`，**零本地提交**。
- ② 插件：`dsh plugin --profile <name> add <path|pkg>` 装进 `$DSH_HOME`，开发期用 `file:`/`link:` 指向本仓库。
- ③ patch：纯 YAML 覆盖，甚至每次实验用 `--patch` 临时叠加。

---

## 3. 每层需求 → 具体 seam 映射（全部用公开扩展点，不改上游循环）

| 你要的"层" | 复用/挂载的 dsh 能力 | 机制（公开 seam） |
|---|---|---|
| Research Goal（Objectives/Evidence/Status） | `@deepseek-ai/dsh-goal`（`ctx.goals`） | 同会话持久 goal：active/paused/blocked/complete、round 上限；research-goal 包在其上扩展 Objectives 结构 |
| Research Task DAG | `@deepseek-ai/dsh-experimental-agent-team`（`ctx.agentTeams`） | 持久 teammate roster + 共享任务板（依赖/claim/owner）+ mailbox；或自研 `ctx.tools` + `ctx.jobs` 调度 |
| Claims / Evidence 系统 | 自研 `research-core` 服务 | `ctx.tools.register()` 暴露 claim/evidence 工具；持久化走 session 事件 + `sessionProjections`（同 `dsh-goal` 模式） |
| Research Memory（5 类） | `storage`/`storage-json` + `ctx.fs` + 会话事件 | Semantic→skills/文件；Episodic→会话日志；Artifact→`ctx.attachments`；Hypothesis/Evidence→research-core 存储 |
| Verification Loop | 自研 `research-loops/verification-loop` | `agent/*`、`turn/end`、`tools/*` 事件钩子 + 委派一个 reviewer `subagent`（`ctx.subagents`）；verdict 写入 Claim |
| Experiment Loop | `ctx.shell` + `ctx.jobs` + 自研工具 | 注册 FRR/VPP 执行器作为 `ctx.shell` 后端；长实验提交到 `ctx.jobs`；`experiment-run`/`result-analysis` 工具面向模型 |
| 角色化 Subagent（Literature/Engineer/…） | `ctx.subagents` 提供方 | in-process spawn/fork、`acp`、`dsh-sdk`；Codex = `subagent-codex` 提供方（Engineering Executor） |
| 协作多 Agent 团队 | `dsh-experimental-agent-team` + `tool-agent-team` | 9 个模型工具；DAG 任务板 + 持久消息 |
| Skill 系统 | `@deepseek-ai/dsh-skill` + `dsh-skill-filesystem` + `dsh-tool-skill` | `ctx.skills.registerProvider()`；research-skills 按需加载指令，不塞 system prompt |
| 模型路由（多角色/多模型） | `ctx.llm` 适配器 + agent preset + `ctx.agentDefaultModel` | 自研/注册 Qwen、OpenAI-compatible、本地 LLM 适配器；按角色 preset 选模型，"一个 active 随时切换" |
| Paper / PPT 产出 | `@deepseek-ai/dsh-document`、`office-to-pdf`、`ctx.attachments` + 自研工具 | 模型工具生成 markdown/图表 → 转 docx/pptx |
| 定时/长任务 | `@deepseek-ai/dsh-schedule` + `ctx.jobs` | 提醒工具 `schedule_create` 等；到期经 `agent.inject()`/`followup()` 投递 |
| 外部自动化/编排 | `dsh --profile headless --json --session-id`；Python SDK（`python/sdk` + `sdk-runtime`） | 按行 JSON 事件流驱动、跨调用续会话；现有 Python repo 可直接当 orchestrator |
| 会话存档/回放 | `session-persistence-jsonl` + `session-query-sqlite` | JSONL 仅追加 + 格式迁移链；研究轨迹可复现 |
| 权限/策略 | `tools/pre-execute`、`ctx.sandbox`、`ctx.approval` | Research Agent Policy 用 hook 插件落地为门禁，而非 prompt |

---

## 4. 保证"可随上游更新"的工程纪律

### 4.1 黄金规则细化

1. **目录隔离**：`deepseek-harness/` 的 `packages/ apps/ scripts/ docs/` 一律只读。检查方式：`git -C deepseek-harness status` 必须永远干净。
2. **配置分层**：默认值写进我们的组合包 patch；机器偏好写 `$DSH_HOME/cordis.patch.yml`；实验参数用 `--patch xxx.yml`。三者都不写进上游。
3. **只 import 发布入口**：插件里 `import` 只允许 `@deepseek-ai/dsh-*` / `@deepseek-ai/cordis` 顶层导出；import 上游 `src/` 相对路径视为违规（可加到 CI 门禁）。
4. **版本 pin + 升级节奏**：`dsh-research` 的 peerDependencies 声明所支持的 dsh 版本范围；上游以 git commit/版 pin。开发者预览 = 定期（而非追着）升级，每次升级跑 §4.2 流程。
5. **每个关键需求 ≥ 2 条实现路径**：优先稳定 seam（`ctx.tools`/`ctx.llm`/`ctx.subagents`/`ctx.goals`/会话事件）；实验性包（agent-team / workflow-ptc）只作可替换 option，防止上游撤回实验包时被卡住。

### 4.2 每次 dsh 升级的标准流程

```bash
# 1) 更新只读上游（零冲突，因为从没改过它）
cd deepseek-harness && git fetch origin && git pull --ff-only
pnpm install && pnpm run build                 # 上游自己的门禁

# 2) 兼容性检查
dsh --profile routing-research --dump-config     # 对比插件树 diff
dsh --profile routing-research --dump-config-schema

# 3) 跑我们的回归（goal/verification/experiment 冒烟用例）
./dsh-research/tests/smoke.sh

# 4) 若某 seam 签名变了 → 只改 dsh-research 的适配层，仍不动上游
# 5) 临时不兼容 → dsh plugin --profile routing-research version-exemptions（记录豁免，不阻塞继续升级）
# 6) 记 docs/upgrade-notes.md
```

### 4.3 风险与缓解

| 风险 | 缓解 |
|---|---|
| 开发者预览、会出破坏性变更 | 版本 pin + 定期升级 + seam 依赖最小化；peerDependencies 声明范围 |
| 实验包不承诺稳定（agent-team 等） | 关键路径只用稳定包；实验包做成可缺省 option |
| patch 替换整段 config（不合并） | 我们的 bundle 自己"重述整行"，在自研 bundle/patch 内维护，不与上游交错 |
| 上游增删/改名 seam | capability-seams 表 + 升级时 `--dump-config-schema` diff 主动发现 |
| 想换 agent loop | 只要需求能被 preset/goals/workflow/team 表达就**不要**换；确需替换时用外部插件在同一 seam 注册，仍不改上游 |

---

## 5. 实施顺序（与 TODO.md 对齐）

- **Phase 0（本文件所属）**：三件套 `architecture.md` / `data-model.md` / `migration-plan.md`；另运行一次 `dsh --profile web --dump-config` 留存基线。
- **Phase 1**：确立 `dsh-research/packages/research-core`（ResearchGoal/DAG/Claim/Evidence）+ Verification Loop + Artifact Store，放出第一个可交互的 `routing-research` profile 跑通 BGP 冒烟。
- **Phase 2–4**：Memory、Literature/Reviewer/Experiment 角色、FRR/VPP executor、自动实验与论文/PPT 产出、多 agent 与自治循环——全部按 §3 表逐项以插件/工具/skill 形式叠入，仍不碰上游。

**一句话架构定位**：`deepseek-harness` 是只读运行时，`dsh-research` 是以组合包形式安装的外部扩展，`$DSH_HOME` 是两者之外的组合层——三层互不写文件，因此上游更新与你的 Agent 永远互不干扰。

---

## 附录 · 端到端挂载已实测（2026-10-08）

用真实 `dsh` CLI + dsh 自身 `boot()` 验证了「bundle → patch 行 → 运行时插件」整条链路：

1. **bundle 形态**：`dsh-research/package.json` 声明 `dsh.bundle.patch = ./patches/research-agent.yml`，
   `main`/`exports` 指向 `src/plugin.ts`（Node 24 类型剥离，零外部运行时依赖；
   `@deepseek-ai/cordis` / `@deepseek-ai/dsh-tools` 只 `import type`，产物中不出现）。
2. **patch 行**：`patches/research-agent.yml` 用 `- insert:` 插 `dsh-research-core` 行，
   `name: '@basil/dsh-research'`。行寻址语义 = 高层 patch 可整行覆盖/禁用，不侵入 base。
3. **profile 部署**：模板在 `profiles/research/`；部署脚本复制模板并把仓库 `dsh-research`
   symlink 到 `$DSH_HOME/profiles/research/node_modules/@basil/`。two-anchor 解析
   （安装包优先、profile 目录其次）→ symlink 即生效，改代码免重装。
4. **运行时契约**（踩过的一个坑，已成文）：Cordis 里读 `ctx.tools` 必须先声明
   `export const inject = ['tools']`，否则 `cannot get property "tools" without inject`。
   声明后插件在 tools 就绪时激活：`ctx.provide('researchCore', …)` + `ctx.tools.register(research_*)`。
5. **验证产物**：
   - `dsh --profile research --dump-config` → 组合树末尾出现 `# == @basil/dsh-research` 行
   - `scripts/runtime-smoke.mjs`（复用 dsh `boot()`）→ `researchCore provided? YES`、
     `research tools mounted: research_verify, research_record`、BGP 冒烟 `verdict: verified`、
     `SMOKE PASS`
   - 仓库内 `node --test`（core 2 + plugin 1）全绿，不依赖 dsh

---

## 附录 · 阶段 2 已实现（2026-10-08）

在阶段 1 的挂载链路上增殖 Memory + Agents + Director，**仍不碰上游**：

- **五类记忆**（`dsh-research/src/memory/`）：semantic（事实三元组+溯源）/ episodic（事件时间线）/
  artifact（产出回忆）/ hypothesis（假设生命周期）/ evidence（证据台账）；门面 `createMemory()`
  + 可选 JSON 持久化（`persistMemory`/`loadMemoryInto`，`memory.dir` 配置）。
- **三角色 Agent**（`src/agents/`）：Literature（`LiteratureSource` 可插拔，默认本地 9 篇种子语料）、
  Reviewer（research-paper-review 8 步清单 → 判定 + 建议）、Experiment（plan → Executor →
  `analyze` 重复统计；`StubExecutor` 显式 `simulated`，阶段 3 换 FRR/VPP 真实执行器）。
- **调度与三循环**（`research-director|research-loop|verification-loop|experiment-loop/`）：
  Goal → 任务 DAG 按角色分派 → 记忆写入 → 产出归档；独立验证/实验循环可复用。
- **运行时面**：`ctx.provide` 4 个服务（researchCore / researchMemory / researchAgents /
  researchDirector），`ctx.tools.register` 5 个工具（+research_search/research_review/research_experiment）。
- **本地自测**（不依赖 dsh）：`node --test "src/**/*.test.ts"` core + memory + agents + director + plugin 全绿；
  in-dsh `scripts/runtime-smoke.mjs` 扩为「4 服务 + 5 工具 + BGP 冒烟 + 文献检索」。

**Strip-only 约束（Node 24 类型剥离）**：不能用类构造器参数属性、不能用 `import { type X }` 内联
类型修饰；一律显式字段 + 整段 `import type`。此约束适用于整个 bundle。
