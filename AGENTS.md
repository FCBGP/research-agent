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

一键部署：`npm install -g @basil/dsh-research` → `dsh plugin --profile research add @basil/dsh-research` → `dsh research "…"`。

现状资产（本仓库 `src/research_agent/` 已有，可复用为 Executor / Knowledge Plane）：
- 本地科研智能体：`loop / context / tools / memory / skills / mcp / server / cli`
- 科研规划 `planning.py`、进化环 `evolve.py`（LEARN→DESIGN→EXPERIMENT→ANALYZE）、`harness.py`（hooks/settings/events/permissions）、`debate.py`、`longdoc / worddoc / md2docx / figures`

工作规范：
- 运行：`uv run research-agent ...`；本地 LLM 走 OpenAI 兼容接口（环境变量见 `README.md`）。
- **禁止修改 `deepseek-harness/` 下 `packages/` 的基础设施代码**；新能力放独立 bundle / plugin / 本仓库上层代码。
- 设计文档放 `docs/`；研究产出与实验 artifact 必须可追溯、可归档。
