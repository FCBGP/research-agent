# AGENTS.md

> 本项目所有智能体工作的操作手册与最高指导原则。
> 由 `prompts/dsh.md` 梳理生成，作为 DeepSeek Harness 之上的 **Research Agent OS** 的开发与运行准则。

## 1. 项目定位

我们不是在做一个"更强的 Codex"，而是在做一个 **Research Agent OS**：一个用于 **域间路由安全研究（BGP / RPKI / BGPsec / ASPA / VRO / CRC / FC-BGP）** 的领域专用科研 Agent。

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

## 7. Skill 组织（按需加载，勿塞进 system prompt）

- `skills/research/`: literature-review, rfc-analysis, standards-analysis, claim-verification, peer-review
- `skills/networking/`: bgp, rpki, bgpsec, aspa, fcbgp, routing-experiment
- `skills/engineering/`: frr, bird, vpp, docker, vmware
- `skills/publication/`: paper, ppt, figure, technical-report

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
dsh routing-research                     # 更明确的领域命名
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
