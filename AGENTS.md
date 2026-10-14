# AGENTS.md

> 本项目所有智能体工作的操作手册与最高指导原则。
> 由 `prompts/dsh.md` 梳理生成，作为 DeepSeek Harness 之上的 **Research Agent OS** 的开发与运行准则。

## 1. 项目定位

我们不是在做一个"更强的 Codex"，而是在做一个 **Research Agent OS**：一个用于 **域间路由安全研究（BGP / RPKI / BGPsec / ASPA / VRO / CRC / FC-BGP）** 的领域专用科研 Agent。

**命名定型（2026-10-09）**：该 Agent / Profile 的定型名称 = **`dsh-routing-research`**
（对应 `prompts/dsh.md` §11「不要叫它 research」）；操作命令不变，README/脚本仍用
`dsh research`（== `dsh --profile research`）。领域词汇（范围 BGP / RPKI / BGPsec / ASPA /
VRO / CRC / FC-BGP + 执行器 FRR / VPP）**内置**于 `dsh-research/src/domain/vocabulary.ts`
（唯一口径来源），供 persona / preset 描述 / `research_search` 种子检索 /
`researchCore.domain` 服务统一引用。

- **DeepSeek Harness = Runtime（操作系统底座）**
- **Research Agent OS = 核心成果（上层 Agent Operating System）**
- **Codex Loop = Engineering Executor**
- **FRR/VPP = Experiment Executor**
- **RAG / 论文 / RFC = Knowledge Plane**
- **Claim / Evidence / Verification = Scientific Control Plane**

科研任务流水线：

> 科研任务 → 自动拆解 → 检索 → 阅读 → 假设 → 实验 → 编码 → 验证 → 反证 → 形成论文/报告/图表 → 自我审查 → 持续迭代

与普通 Coding Agent（用户任务 → 改代码 → 跑测试 → 修 bug → 完成）的根本区别：**Research Loop 与 Engineering Loop 必须分开。**

```
                    Research Agent
                         │
              ┌──────────┴──────────┐
              │                     │
        Research Loop          Engineering Loop
              │                     │
      ┌───────┼────────┐      ┌─────┼─────┐
      ↓       ↓        ↓      ↓     ↓     ↓
   Search   Read    Reason   Code  Test  Deploy
      │       │        │      │     │     │
      └───────┴────────┴──────┴─────┴─────┘
                         │
                    Verification
                         │
                  Evidence / Results
                         │
                    Artifact Store
                         │
                  Paper / PPT / Report
```

## 2. 最高指导原则

1. **不要 fork DeepSeek Harness 后大规模修改。** 它已经把 Agent / Agent Loop / Session / Tool / LLM / Skill / Sandbox / Subagent / MCP / Jobs / Storage / Context / Goal 全部做成独立插件能力（everything-is-a-plugin）。
2. **永远不要先改基础设施**：`agent-loop`、`session`、`llm`、`tool registry`、`Cordis`；对应 `packages/core`、`packages/llm`、`packages/session`、`packages/tools`、`packages/sandbox`。
3. 正确策略 = **原生 Harness + 自定义 Profile + 自定义 Bundle + 少量 Plugin**。只有现有 Agent Loop 无法表达 Research / Verification / Experiment Loop 时才替换对应 plugin。
4. Harness 是操作系统，我们写的是科研 Agent。
5. 模型只是 **Model Provider**，不是 Agent 本体；保持 provider-neutral（DeepSeek / Qwen / OpenAI 兼容 / 本地 LLM），保留"一个模型 active、随时切换"的能力。

```
DeepSeek Harness
       │
       ├── Core / LLM / Session / Tool / Sandbox
       ├── Skill / Subagent / MCP / Jobs / Storage
              ↓
        你的 Research Layer
              ↓
        你的 Research Agent
```

## 3. 目标架构

顶部由 **Research Director** 驱动：`Goal → Plan → Execute → Verify → Reflect → Continue`。

```
                     Research Agent OS
                    Research Director
   Research Knowledge Layer: Claims | Evidence | Hypothesis | Sources | Artifacts
   Agent Layer:  Literature | Protocol | Engineer | Experiment | Reviewer
   Execution Layer: Shell | Browser | MCP | FRR | VPP | Docker | SSH | Git
   Harness Layer:  Session | Agent Loop | Tools | Skills | Sandbox | Jobs
                   | Storage | Subagent | Context | LLM | Schedule
   Model Layer:    DeepSeek | Qwen | OpenAI-compatible | Local LLM
```

Profile 视图（最终交付形态）：

```
dsh-routing-research (Profile)
  ├── Research Agent     (Research Loop / Verify Loop / Experiment)
  ├── Skills             (BGP / RPKI / FC-BGP / Paper / Experiment)
  ├── Executors          (Codex / FRR / VPP)
  └── → Claims / Evidence → Research Memory
```

多 Profile（`research` / `paper` / `experiment` / `engineering` / `reviewer`）共享 `dsh-base` + `dsh-research-core` + 共享 research storage，而不是"一个超级 Agent 挂 100 个工具、50 个 skill、20 个 agent、10 个 MCP"。

## 4. 核心数据模型（research-core）

统一对象：`ResearchProject, ResearchGoal, ResearchTask, ResearchClaim, ResearchEvidence, ResearchHypothesis, ResearchExperiment, ResearchResult, ResearchArtifact, Verification`。所有其他组件围绕这些对象工作。

- **ResearchGoal** = 科研目标（不是"一次任务"）。Objectives 形如：O1 问题定义 → O2 调研 → O3 找缺口 → O4 提出机制 → O5 原型 → O6 实验 → O7 反证 → O8 论文输出。
- **每个 Objective 必须携带**：`Hypothesis / Tasks / Evidence / Experiments / Results / Verification / Counterexamples / Status`。
- **ResearchTask DAG（不是简单 TODO list）**：调度策略 = "寻找当前 DAG 中所有依赖已满足、且信息增益最高的节点"。
- **ResearchClaim**：`Statement + Type + Evidence[] + Source[] + Confidence + VerificationStatus + CounterEvidence[] + Dependencies[]`；Type ∈ {Fact, Hypothesis, Assumption, Result, Interpretation}。
- **ResearchEvidence**：`{claim, source, evidence, confidence, verified, last_verified, related_claims}`。

```
Research DAG
Problem
   ├── Literature Review  (RPKI / BGPsec / ASPA / VRO)
   ├── Gap Analysis       → Gap-01
   ├── Hypothesis         → H-01
   ├── Design             → D-01
   ├── Implementation     → I-01
   ├── Experiment         → E-01
   └── Verification       → V-01 / V-02
```

## 5. 三条核心循环（必须分开实现）

1. **Research Loop**：Search → Read → Reason（+ Engineering Loop：Code → Test → Deploy）→ Verification → Evidence/Results → Artifact Store → Paper/PPT/Report。
2. **Verification Loop**：主 Agent 提出 "I think X" → Verification Agent 执行 **Evidence Check / Counter Search / Experiment Test** → 输出 Verdict（**verified / disputed / rejected**）。用于解决科研 Agent 最严重的问题——"把合理误认为正确"。
3. **Experiment Loop**：Hypothesis → Experiment Specification → Environment Provisioning → Execution → Measurement → Result → Statistical Analysis → Verification → Archive。Agent 自主执行 `deploy → run → collect → analyze → verify → archive`。
4. **Engineering Loop**：现有 `TODO → Codex/CodeBuddy → 修改 → 验证 → 下一轮` 不废弃，升级为 **Engineering Executor**（一个 Engine，不是整个 Agent）。

## 6. Research Memory（五种，缺一不可）

- **Semantic**：知识库（papers / RFC）
- **Episodic**：历史过程（previous runs）
- **Artifact**：文件/结果（code / data）
- **Hypothesis**：假设库
- **Evidence**：证据库

铁律：**不能把"模型曾经说过"当作事实。** 每条 claim 必须记录 `source / evidence / confidence / verified / last_verified`，否则视为未验证。

## 7. Skill 组织与领域知识分层（按需加载，勿塞进 system prompt）

**Skill = 程序性能力**（「怎么做」：流程、清单、纪律），按需进会话目录；
**领域知识 ≠ Skill**——「某机制是什么（bgp / rpki / bgpsec / fcbgp / aspa…）」是参考数据，
放进知识平面而不是 skill 目录（2026-10-10 修正）。

- 程序性 Skill（`dsh-research/skills/`，bundle 自带，经 `skill-filesystem` 挂载）：
  - `experiment` —— 自动实验流水线纪律：deploy → run(×repetitions) → collect → analyze → verify → archive（四口径）
  - `paper-review` —— `research-paper-review` 8 步审稿工作流
  - `triz` —— TRIZ 假设生成工作流（阶段 8，2026-10-14）：矛盾 → 发明原理 → 机制方向假说 →
    接 research_verify / research_campaign 核验闭环
- 领域知识（BGP / RPKI / BGPsec / ASPA / FC-BGP / VRO / CRC / 攻击面…）：
  - 一句话口径 → `dsh-research/src/domain/vocabulary.ts`（GLOSSARY，唯一口径来源）
  - 详细参考 → `docs/domain-knowledge-notes.md`（暂存，非权威，以 RFC / IETF 草案 / 论文为准）
  - 长期运行的知识平面 → **WeKnora 知识库**（RAG 检索，见仓库 README「WeKnora 知识库对接」）
- 禁止把领域参考知识塞成 skill（污染 skill 目录、且非程序性）。

`research-paper-review` 8 步：identify claims → check citations → check methodology → search counterexamples → inspect experiment design → identify unsupported conclusions → assign confidence → produce review report。

## 8. Subagent / 多角色

- **角色化科研代理**（Research Director 编排）：Literature / Protocol / Engineer / Experiment / Adversarial / Reviewer Agent。
- **Subagent 之间传递结构化 Artifact**（如 `{type: research_finding, claim_id, evidence, confidence}`），**不是自然语言聊天**。

```
                  Research Director
        ┌────────────────┼────────────────┐
        ↓                ↓                ↓
   Literature        Engineer          Reviewer
   Researcher        Agent             Agent
        ↓                ↓                ↓
      Papers          Code/Test        Critique
        └────────────────┼────────────────┘
                         ↓
                   Verification
```

## 9. Research Agent Policy（固化为 Profile 行为，而非临时 prompt）

1. 不把模型生成内容当作事实。
2. 所有关键 Claim 必须有 Evidence。
3. RFC / IETF / 论文优先使用原始来源。
4. 对关键结论主动寻找 Counter Evidence。
5. 实验结论必须绑定 Experiment Artifact。
6. 没有实验数据不得声称"实验验证"。
7. 区分 Fact / Hypothesis / Assumption / Result。
8. 研究任务采用 DAG，而非简单 TODO。
9. 完成任务前必须执行 Verification Loop。
10. 最终输出必须可追溯到 Evidence。

## 10. 本仓库工作约定

目标形态（Profile 机制）：

```bash
dsh research                             # 或 dsh --profile research
dsh research "分析 RPKI+BGPsec 的安全能力边界"
dsh research --patch profiles/fcbgp-experiment.yml "验证恶意 ASPP 情形"
# 命名定型（2026-10-09）：Profile 定型名称 = dsh-routing-research（域间路由安全研究专用，
# 见 prompts/dsh.md §11「不要叫它 research」）；操作命令不变，README/脚本仍用 dsh research。
# 内置领域词汇：BGP / RPKI / BGPsec / ASPA / VRO / CRC / FC-BGP（研究范围）+ FRR / VPP（执行器）；
# 唯一口径来源 = dsh-research/src/domain/vocabulary.ts，供 persona / preset 描述 /
# research_search 种子检索 / researchCore.domain 服务统一引用。
```

开发态（本仓库，不用 npm 发布）——先把 profile 部署进 `$DSH_HOME`（默认 `~/.dsh`，
symlink 指向仓库，改 `dsh-research/` 立即生效，免重装），再直接调用：

```bash
DSH_HOME="$HOME/.dsh" ./dsh-research/scripts/deploy-profile.sh
dsh research "分析 RPKI+BGPsec 的安全能力边界"     # == dsh --profile research "<task>"
```

一键部署：`npm install -g @basil/dsh-research` → `dsh plugin --profile research add @basil/dsh-research` → `dsh research "…"`。

历史：旧 Python 本地智能体栈（`src/research_agent/`、`pyproject.toml`、`config.yaml`、`requirements/` 等）已于 2026-10-08 移除，
本仓库只保留 dsh research 上层叠加（dsh-research / profiles）。

工作规范：
- 运行：`dsh research "<任务>"`（== `dsh --profile research "<任务>"`）；部署与模型路由见 `README.md`。
- **禁止修改 `deepseek-harness/` 下 `packages/` 的基础设施代码**；新能力放独立 bundle / plugin / 本仓库上层代码。
- 设计文档放 `docs/`；研究产出与实验 artifact 必须可追溯、可归档。

### 10.1 文档卫生 · TODO.md / CHANGELOG.md 维护规则

每次收尾一轮工作时，必须按下述规则维护 `TODO.md` 与 `CHANGELOG.md`（两者互补、不重复）：

- **TODO.md 只保留未完成项**：标识仅两种——未完成 `- [ ]`、已完成 `- [x]`，无其他标识。
- **已完成项整条移入 `CHANGELOG.md`**：按日期分节归档，逐条保留「做了什么 / 关键产物 / 提交号
  (SHA) / 测试与 SMOKE 数字」，保证可追溯；归档后从 TODO.md 删除，不在两边重复出现。
- **未完成项逐条斟酌**：过时 / 与现状冲突（如 `.gitignore` 变更、方案被取代）的项改写或删除，
  而非原样保留；保留就绪的项，调整措辞使其与当前状态一致。
- **新规划直接写入 TODO.md**：以新阶段 / 新条目追加（如「阶段 5 · Agent Preset + 插件化重构」，
  按 A/B/C/D/E 分阶段列可勾选子项），并同步更新「里程碑」口径。
- **规则本文件收口**：本规则（10.1）即流程定义；任何一轮的 TODO↔CHANGELOG 整理都照此执行。

## 仓库状态（2026-10-08 快照）

- `deepseek-harness/`：官方上游 **git submodule**（pin `5badb15009`, dsh-v0.2.1-alpha.1），只读参考。
  升级：`git -C deepseek-harness fetch origin && git -C deepseek-harness checkout origin/v0.2.1-alpha.1 && git add deepseek-harness && git commit`（或用 `git submodule update --remote`）。
- **运行时 dsh**：npm 全局 `dsh v0.2.0-rc.2`，走 `$DSH_HOME/profiles`（沙箱内用 `DSH_HOME=/tmp/dsh-home`）。
- 阶段 0 基线（`docs/baseline/` 的 web-profile 插件树 dump）已随 2026-10-08 瘦身删除；阶段 0 分析结论保留在 `docs/research-agent-architecture.md`。
- **阶段 1 + 运行时挂载已完成并实测**（2026-10-08）：
  - `dsh-research/src/core/` 六件（goal/dag/claim/evidence/verification/artifact）纯 TS，`node --test` 全绿；
  - `dsh-research/src/plugin.ts` 为 Cordis 插件：`ctx.provide('researchCore', …)` + `ctx.tools.register(research_verify / research_record)`；
  - `patches/research-agent.yml` 插入 `dsh-research-core` 行；`profiles/research/` 为可部署模板；
  - 一键部署：`./dsh-research/scripts/deploy-profile.sh`；in-dsh 实测：`node dsh-research/scripts/runtime-smoke.mjs` → **SMOKE PASS**。
- 黄金规则不变：代码不进 `deepseek-harness/`；配置只走 profiles/patch 层；只消费公开 seam。

### Cordis 插件挂载要点（已踩坑复盘）

- 插件 = `export const name` + `export function apply(ctx, config)`；bundle 的 `dsh.bundle.patch`
  用 `- insert:` 把 `name: '包名'` 行插入组合树；包 `main` 指向插件入口即可被 dsh 运行时加载。
- **读 `ctx.tools` 必须先 `export const inject = ['tools']`**，否则 Cordis 报
  `cannot get property "tools" without inject`，插件整行不激活。
- 服务/工具生命周期挂在 fiber effect 上：`ctx.provide(...)`、`tools.register(...)` 随插件卸载自动回收；
  显式返回 disposer 更稳（`registry.plugin()` 会在卸载时调用）。
- 运行时解析 two-anchor（安装包优先、profile 目录其次）→ 本地 bundle 只需 symlink 进
  `$DSH_HOME/profiles/<name>/node_modules/<scope>/`，改代码免重装。

---

## 阶段 2 状态快照（2026-10-08）

仓库状态：分支 `dsh-dev`；`deepseek-harness/` 为只读 submodule（零改动，三条黄金规则不变）。
上一提交 `5225704`：阶段 1 + 端到端挂载（runtime plugin + bundle patch + SMOKE PASS）。

### 阶段 2 已实现（Memory + 三角色 Agent + 调度）

- `dsh-research/src/memory/` — 五类记忆：semantic / episodic / artifact / hypothesis / evidence，
  门面 `createMemory()` + 可选 JSON 持久化（`persistMemory`/`loadMemoryInto`）
- `dsh-research/src/agents/` — Literature（本地种子语料 + 可注入 source）/ Reviewer（8 步清单判定）/
  Experiment（plan → executor → analyze 统计）
- `dsh-research/src/research-director|research-loop|verification-loop|experiment-loop/` —
  Director 按任务 DAG 分派 + 三条循环驱动
- `src/plugin.ts` 扩展：`ctx.provide` researchCore / researchMemory / researchAgents / researchDirector；
  工具 5 个：research_verify / research_record / research_search / research_review / research_experiment

### 踩坑速记（Node 24 类型剥离 strip-only）

- **不支持类构造器参数属性**（`constructor(private x)`）→ 显式字段 + 赋值
- **不支持 `import { type X }` 内联类型修饰** → 拆成 `import type { X }`
- Cordis 读 `ctx.tools` 必须先 `export const inject = ['tools']`
- 测试 glob 用 `node --test "src/**/*.test.ts"`（`node --test src/` 报 directory not found）

---

## 阶段 3 状态快照（2026-10-08）

仓库状态：分支 `dsh-dev`；`deepseek-harness/` 只读 submodule（零改动）。上一提交 `f9532e3`：阶段 2 测试全绿。

### 阶段 3 已实现（Executors + 自动实验 + 统计口径）

- `dsh-research/src/experiment/` — 实验层四件
  - `stats.ts` — 四口径统一统计：detection_rate / false_positive_rate / convergence_time /
    verification_latency，均值/样本标准差/95%CI（analyzeSeries / metricsFromResults /
    summarizeDetection → effectiveScore = det.mean − fp.mean）
  - `topology.ts` — 可控拓扑抽象 `Topology`：`RouteEngineSim`（确定性路由引擎模拟器，
    ROV/BGPsec 状态模型，mulberry32 同 seed 可复现）、`FrrTopology` / `VppTopology`
    （真实守护进程适配器：探测二进制、渲染 frr.conf / startup.conf、可用时管进程；
    缺失时 fallbackToSim 回退确定性模拟并如实标记 engine）
  - `executors.ts` — `TopologyExecutor`：部署 → 注入攻击 → 采集四口径 → detection 阈值
    判定 outcome（support/refute/inconclusive）；实现既有 Executor 契约
  - `runner.ts` — `runAutomaticExperiment` / `runCampaign`：自动实验
    deploy → run(×repetitions) → collect → analyze → verify → archive，写回
    episodic + artifact，返回 `CampaignReport`（stats + detection + verdict + artifacts）
- `src/agents/experiment.ts` — `metricsFor` 收敛为四口径；`ExperimentAgent(executor?)`
  默认仍 StubExecutor（显式最小占位），阶段 3 实验走 TopologyExecutor
- `src/plugin.ts` — 新增服务 `researchExperiment.runAutomatic` + 第 6 个工具
  `research_campaign`（工具 6 个：…/research_experiment/research_campaign）
- 实测：`node --test "src/**/*.test.ts"` **27/27 全绿**；in-dsh runtime-smoke
  **SMOKE PASS**（services 5 + tools 6/6 + campaign verdict verified）

### 关键约定

- 沙箱无 FRR/VPP/docker 二进制 → 默认实验执行源 = `RouteEngineSim`（确定性、可复现），
  `data.engine` / `data.simulated` 如实标记；FRR/VPP 适配器在目标机安装二进制后自动接管
  （`available` 探测），未安装且 fallbackToSim 关闭时抛 `TopologyUnavailableError`。
- 实验与统计分层：`ExperimentAgent`（计划/统计）→ `Executor`（契约）→ `Topology`
  （执行源）→ `runner`（流水线编排）。FRR/VPP 实时指标采集（vtysh/vppctl 解析）为后续
  增量（见 TODO 阶段 3.5）。
- 旧工具 `research_experiment`（plan+run 单轮）保留兼容；新 `research_campaign` 为完整
  自动战役入口。

---

## 阶段 3.5 · Profile 前端修复（headless one-shot，2026-10-08）

现象：`dsh research "…"` 报 `profile "research" does not exist`；且旧 `profiles/research/package.json`
只含 `base + @basil/dsh-research`，缺能启动 agentic loop 的前端 bundle。

修复：`profiles/research/package.json` 的 `dsh.profile.bundles` 改为

```json
["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-headless", "@basil/dsh-research"]
```

- bundle 顺序 = 内置 headless 模板（base + headless）+ 我们的 research 层；headless 提供
  一次性 CLI 前端（`cmdlineArgs`/`appExit` → headless-startup/headless-runner → 直连 core Agent）。
- `@deepseek-ai/dsh-headless` 位于全局 dsh 的 node_modules（非顶层全局包），profile 部署后由
  运行时 two-anchor 解析。agent-loop 由 `dsh-base` patch 自带挂载（组合树含 `- id: agent-loop`）。
- **部署 + 运行（用户自己的终端，沙箱无法写 `~/.dsh`）**：

  ```bash
  cd /Users/basil/2500/agents/research-agents
  DSH_HOME="$HOME/.dsh" ./dsh-research/scripts/deploy-profile.sh
  DSH_HOME="$HOME/.dsh" dsh --profile research --dump-config | grep -E "headless|dsh-research-core"
  dsh research "研究 RPKI+BGPsec 的安全缺口"       # == dsh --profile research "<task>"
  # 注：重跑 deploy 会刷新 package.json 与 cordis.patch.yml（含模型层 overlay）
  ```

- `scripts/runtime-smoke.mjs` 复刻 CLI 的 `provideCmdline`（注入 `cmdlineArgs`/`appExit`），
  使含 headless 前端的组合能完整 boot；headless 的一次性任务异步启动并在 `fiber.dispose()`
  取消。沙箱实测：dump-config 组合树含 headless-startup/headless-runner + dsh-research-core；
  runtime-smoke → **SMOKE PASS**（services 5 + tools 6/6）。
- **模型层（2026-10-08 追加）**：web profile 实际用的是本地 interval DSV4 网关
  （`llm-pi-ai` + provider `local-interval-dsv4`，key 取 credential-ref `LOCAL_INTERVAL_DSV4_API_KEY`），
  并非 `DEEPSEEK_API_KEY`（`.credentials.yaml` 里该 ref 只是占位值 「0731」，base 默认模型
  `deepseek-official` 会因它 401）。把 web 同款两层 overlay 加入 `profiles/research/cordis.patch.yml`：
  `llm-pi-ai.providers.local-interval-dsv4`（openai-completions，baseURL `http://10.2.165.201:8232/v1`）
  + `agent-default-model` 默认切到 `local-interval-dsv4 / dsv4flash`。
  **真机端到端实测通过**：`dsh --profile research --json "RPKI 的作用?"` → boot → turn →
  dsv4flash 正确作答并输出 final（`reason.kind: completed`）。
- 注意：`baseURL` 是本机内网地址（配置在 profile 层，改这里即可）；若用 `dsh headless` 同样
  报 401，把这两层 overlay 同样加到 `~/.dsh/profiles/headless/cordis.patch.yml`。

---

## 阶段 4.5 · Profile 前端切换：headless → 基于 web（2026-10-09）

需求：research profile 应"在 web 基础上实现"，`dsh research` 跑在 web（Web UI）之上，
而非 headless 一次性 CLI。

改动：
- `profiles/research/package.json`：`dsh.profile.bundles` 由
  `base + @deepseek-ai/dsh-headless + @basil/dsh-research`
  改为 `base + @deepseek-ai/dsh-web-app + @basil/dsh-research`。
- `profiles/research/cordis.patch.yml`：合并 web 同款三层 overlay——`ui-settings-general`
  （welcomeNoticeVersion）+ `llm-pi-ai`（`local-interval-dsv4`）+ `agent-default-model`
  （dsv4flash）；模型层与 web profile 完全对齐。
- `dsh-research/scripts/runtime-smoke.mjs`：web 基座**不接受位置参数**（`too many
  arguments`），改为只传 flag（默认 `--no-open`，可选 `--port`）；headless 的一次性
  CLI 任务不再存在。
- `scripts/deploy-profile.sh` / 各 README：headless → web 措辞同步。

实测（沙箱，`DSH_HOME=/tmp/dsh-home`）：
- `--dump-config` 组合树含 `web-startup` / `webserver`(127.0.0.1:3080) / `web-runtime` +
  `dsh-research-core`（无 headless-startup/headless-runner）。
- runtime-smoke → **SMOKE PASS**（services 11 + tools 13/13；`dsh web: http://127.0.0.1:3080/`）。
- `dsh --profile research --no-open --port 3099` 真实 boot 出 Web UI URL。

用法变化：`dsh research` 启动 Web UI（浏览器会话），科研任务（research_autonomous /
research_campaign 等 13 个 research_* 工具）在 web 会话内交互，**不再支持
`dsh research "<task>"` 位置参数一次任务**。真机端到端浏览器实测留待用户在
`$HOME/.dsh` 部署后确认（沙箱无法开浏览器）。

---

## 阶段 5 · Agent Preset + 插件化重构：preset-research + 6 插件（2026-10-09）

需求：`@basil/dsh-research` 从「一个 700+ 行巨型插件（12 服务 + 13 工具全在 host 平面，
`research_*` 对所有 preset 会话 always-on 可见）」重构为
**preset-research（Research Agent 本体）+ 6 个职责单一插件**；工具只在 research 会话出现，
领域 skill（bgp / rpki / …）经 `skill-filesystem` 真正挂载。

改动：
- `dsh-research/package.json`：`dsh.bundle.patch` 由单文件改为数组
  `["./cordis.patch.yml", "./presets/research.patch.yml"]`；`exports` 为 6 个插件入口加
  显式子路径 `./core` `./director` `./experiment` `./writer` `./operations` `./tools`；
  `main` / `.` 指向 `./src/plugin-core.ts`。
- 新增 `dsh-research/cordis.patch.yml`：host 平面 5 行 `research-core` /
  `research-director` / `research-experiment` / `research-writer` / `research-operations`
  （行序 = 依赖顺序；config 承接 `tools.enabled` / `memory.dir` / policy 等）。
- 新增 `dsh-research/presets/research.patch.yml`：`preset-research`
  （`@deepseek-ai/dsh-agent-preset`，id=research, order=2）挂载 persona（研究 agent 身份）+
  research-tools（13 个 `research_*` 工具 → 会话作用域）+ skill-filesystem
  （customSkillDirs → bundle `skills/`）+ tool-skill + standard 基础工具集。
- `src/plugin.ts` 拆为 6 个插件：`src/plugin-{core,director,experiment,writer,operations}.ts`
  （host；服务名 / 工具 schema 语义零变化）+ `src/plugin-tools.ts`（preset 平面 tools，
  `inject ['tools']`）；`src/plugin.ts` 降级为纯 re-export（保留历史模块路径）。
- 删除 `dsh-research/patches/research-agent.yml`（被 `cordis.patch.yml` 取代）。
- `profiles/research/cordis.patch.yml`：新增 `agent-preset-registry` 行
  `config.default: research`（新会话默认 Research Agent；模型 overlay 原样保留）。

**行为变更（2026-10-09）：**
- **默认 preset = research**：新会话默认 Research Agent 本体（persona + 领域 skill +
  `research_*` 工具），而非 web 的 standard。
- **`research_*` 只在 research 会话出现**：工具注册移到 preset 作用域（research-tools
  子行）；standard 等其它 preset 会话看不到（always-on 污染消除，runtime-smoke 反证
  断言 standard tools w/ research_* = 0）。

实测（沙箱，`DSH_HOME=/tmp/dsh-home`）：
- `node --test "src/**/*.test.ts"` = **83/83 全绿**（含 `plugin-tools.test.ts`）。
- 部署 + `--dump-config` 组合树含 research-* 5 行 + preset-research（无旧 dsh-research-core 行）。
- runtime-smoke → **SMOKE PASS**（services 12 + tools 13/13 preset 作用域 + standard=0 +
  verdict / campaign / policy / autonomous / job / schedule / reflect / subagents 全真；
  `subagents status: {"available":true,...}`）。

用法变化（承 4.5）：`dsh research` 仍是 Web UI 浏览器会话；科研任务
（13 个 research_* 工具）只在 research 预设会话内交互，位置参数一次任务仍不支持。

---

## 阶段 6 · 多 Profile（2026-10-09）

需求：TODO「多 Profile」—— 目前仅 `profiles/research/`，补建 `paper` / `experiment` /
`engineering` / `reviewer`（共享 research 能力；阶段 5 的 preset 粒度被多 Profile 复用）。

改动：
- `dsh-research/presets/roles.patch.yml`（bundle patch 第 3 片）：preset 平面追加 4 个角色
  preset —— `preset-paper`（order=3）/ `preset-experiment`（order=4）/
  `preset-engineering`（order=5）/ `preset-reviewer`（order=6）；每个角色 = persona +
  research-tools（`config.tools.only` 白名单）+ skill-filesystem + tool-skill +
  standard 基础工具集（与 research.patch.yml 同一块，五处同步）。
- `dsh-research/package.json`：`dsh.bundle.patch` 改为
  `[cordis.patch.yml, presets/research.patch.yml, presets/roles.patch.yml]`。
- `src/plugin-tools.ts`：新增 `config.tools.only` 白名单裁剪（`register` 闭包过滤）；
  `undefined`/空数组 = 全量 13 个（preset-research 不设 only，行为与阶段 5 一致）。
- 新建 `profiles/{paper,experiment,engineering,reviewer}/`：`package.json`（base + web 前端 +
  `@basil/dsh-research`）+ `cordis.patch.yml`（复制 research，`default` 改为对应角色）。
- `scripts/deploy-profile.sh`：支持任意 profile 名（位置参数或 `PROFILE_NAME`，缺省 research）。

行为：
- **多 Profile 角色视图**：`dsh research` / `dsh --profile paper` / `experiment` /
  `engineering` / `reviewer` 各自启动 Web UI，新会话默认 preset = 对应角色；
  `research_*` 工具按 `tools.only` 白名单裁剪到角色工具集（paper/experiment 10、
  engineering 6、reviewer 8）。

实测（沙箱，`DSH_HOME=/tmp/dsh-home`）：
- `node --test "src/**/*.test.ts"` = **85/85 全绿**（含 `tools.only` 白名单/空数组两用例）。
- 5 个 profile `--dump-config` 各出现对应 `preset-<role>` + `default: <role>`。
- runtime-smoke → **SMOKE PASS**，新增 `roles=true`：
  `paper:OK[10/10] experiment:OK[10/10] engineering:OK[6/6] reviewer:OK[8/8]`
  （组成 inventory 存在 + 未 broken + research-tools enabled + 会话工具目录 = 白名单）。

---

## 阶段 8 · TRIZ 方法论接入（2026-10-14）

需求：把 TRIZ（发明问题解决理论）加入 `dsh research`，作为**假说生成 / 机制设计方法**
（研究卡在「两难」时的机制方向来源；与领域知识正交）。定位与分层遵循 §7：TRIZ = **程序性
方法论 → 服务 + skill**，不是领域知识（领域知识仍走 vocabulary.ts + WeKnora）。

改动：
- 新增 `dsh-research/src/triz/`：`data.ts`（40 发明原理·含路由提示 / 39 技术参数 / 路由参数中英
  别名表 / **精选矛盾矩阵**（适配子集，诚实标注非全表）/ 启发式兜底原理表）+ `index.ts` 分析引擎
  （`resolveParameter` 中/英/别名/模糊、`principlesFor` 三态 `curated-matrix | heuristic-fallback |
  unresolved`、`separationFor` / `evolutionFor` / `idealityFraming`（IFR）/ `toHypotheses`）。
- 新增 host 插件 `dsh-research/src/plugin-triz.ts`（exports `./triz`）：提供 `researchTriz` 服务；
  `cordis.patch.yml` host 平面由 5 → **6 行**：`research-core` / **`research-triz`** /
  `research-director` / `research-experiment` / `research-writer` / `research-operations`。
- `src/plugin-tools.ts`：第 **14** 个工具 `research_triz`（入参 `problem/improving/worsening/record`，
  输出 `source/contradiction/candidates/separation/evolution/ideality/hypotheses/artifactId`，
  默认写 artifact + episodic, kind=triz）；仅在 research（14 全量）与 engineering（白名单
  +triz = **7**）可见。
- 新增 `dsh-research/skills/triz/SKILL.md`：矛盾 → 原理 → 假说 → 核验闭环 + 常见路由安全矛盾↔
  原理映射表；纪律 = 输出只是假说（confidence=0.5），未经 research_verify / research_campaign
  核验不得成为 claim；别把 TRIZ 方向当新发现，先对照既有工作。
- `scripts/runtime-smoke.mjs` / `scripts/pack.sh` / 各测试同步（EXPECTED 14、ROLE_TOOLS、
  servicesOk 加 researchTriz、pack 必备条目加 plugin-triz.js + skills/triz）。

**口径变更（自本阶段起）**：`research_*` 工具 = **14 个全量**（research）、engineering 白名单 = **7**、
host 平面 = **6 行 / 13 服务**、bundle 插件 = **7 个**（host 6 + preset tools 1）；阶段 4.5 / 5 / 6
快照里的 13 / 5 行 / 6 插件数字属当时口径，以本段为准。

实测（沙箱，`DSH_HOME=/tmp/dsh-home`）：
- `node --test "src/**/*.test.ts"` = **146/146 全绿**（基线 137 + TRIZ 9）。
- runtime-smoke → **SMOKE PASS**：`tools(14/14)=true`、`standard=0`、`engineering:OK[7/7]`、
  `triz=true`（命中 curated-matrix：#11 Beforehand cushioning / #10 Preliminary action /
  #23 Feedback，生成 3 条 Hypothesis, confidence=0.5）。
- pack.sh → **PACK OK**：`src/plugin-triz.js` + `src/triz/*.js` + `skills/triz/SKILL.md` 进 tarball，
  包内 0 个 `src/*.ts`。

用法（用户口径）：`dsh research` 启动 Web UI，在 research 会话里调 `research_triz`——
`research_triz problem="ROV 提升劫持检测率但跨长收敛" improving="检测" worsening="收敛"`，
读 `candidates / separation / evolution / ideality / hypotheses`，挑高信息增益方向走
`research_verify` / `research_campaign` 核验；完整工作流见 `skills/triz/SKILL.md`。

## 阶段 8.5 · 右侧栏「TRIZ 发明原理」面板（2026-10-14）

需求（用户）：`dsh research` 的研究结果要在 **Web UI 右侧栏有一栏**，解释「最终结果用了 TRIZ
的什么发明原理 / 为什么这么做」。承接 `research_triz` 每次分析写的 kind=note artifact，把 TRIZ
分析升级为**右侧栏可读的解释层**。分层：host 半边只读数据、浏览器半边只渲染，不进 Research
Loop，不新增 `research_*` 工具。

改动：
- 新增 host 插件 `dsh-research/src/plugin-triz-ui.ts`（exports `./triz-ui`，inject `['connection']`）：
  `cordis.patch.yml` host 平面 6 → **7 行**（`research-core` / `research-triz` /
  **`research-triz-ui`** / `research-director` / …），在 connection 鉴权栅栏内挂**只读 GET**
  `/api/research.triz.notes` —— 从 `researchCore.artifacts` 过滤 TRIZ note（kind=note /
  !archived / source ∈ triz 三态 / title^="triz: "），`createdAt` 降序取最近 10 条，回填
  40 原理明细（no/name/summary/routingHint）+ 逐行假说。
- 新增浏览器半边 `dsh-research/client/`（`dsh.client.platform: web` + `inject:
  ['@deepseek-ai/dsh-client-ui-sidebar-right']`）：`definition.ts`（sidebarRightTabs Tab 类型 +
  guide 条目）+ `TrizTab.tsx`（按 tab 生命周期 signal 拉 `/api/research.triz.notes` 渲染）+
  `route.ts`（两侧契约）。`scripts/build-client.mjs`（esbuild，`$ESBUILD_BIN`/本地/CLI 三级兜底）
  → `lib/client.js`（ModuleLoader wrapper，已入库；client-modules 按 `dsh.client` 声明加载）。
- 面板内容：问题 + 来源徽标（curated-matrix / heuristic-fallback / unresolved）+ 候选发明原理
  （编号/名称/摘要/路由提示）+ 逐行推导假说；UI 文案如实标注**待核验假说（source=triz,
  confidence=0.5）**，须经 research_verify / research_campaign 验证后才成结论（Policy §9）。

**口径变更（自本阶段起）**：host 平面 = **7 行 / 13 服务**（triz-ui 不 serve 服务）、
bundle 插件 = **8 个**（host 7 + preset tools 1）；阶段 8 快照里的 6 行 / 7 插件属当时口径。

实测（沙箱，`DSH_HOME=/tmp/dsh-home`）：
- `node --test "src/**/*.test.ts"` = **151/151 全绿**（基线 146 + plugin-triz-ui 5）。
- runtime-smoke → **SMOKE PASS**：`trizUi=true`（`research-triz-ui` 在组合树 + `connection.fetch`
  可用）；dump-config 组合树含 `research-triz-ui` 行；build-client 复现 `lib/client.js`。

用法（用户口径）：`dsh research` 启动 Web UI 后，右侧栏打开「TRIZ 发明原理」面板即可看到
本次研究过程里 `research_triz` 分析出的发明原理与推理链；配合 `skills/triz/SKILL.md` 把候选
方向接 research_verify / research_campaign 核验。
