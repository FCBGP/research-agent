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

（15 项产出中顶层已覆盖、本节做实现级细分的是 **11. Memory architecture / 12. Artifact architecture / 13. Migration plan / 14. Minimal viable implementation / 15. 上游风险**；独立文档 `data-model.md` / `migration-plan.md` 见 TODO。）

---

## 6. Memory / Artifact 架构（细分）

> §3 表对 Memory 只有一行顶层映射；**11. Memory architecture** 与 **12. Artifact
> architecture** 是原始 15 项产出（`prompts/dsh.md`）中要求展开的两项，本节落到实现级。
> 代码事实来源：`dsh-research/src/memory/`、`dsh-research/src/core/artifact-store.ts`、
> `dsh-research/src/plugin.ts`（`researchMemory` 服务 + `research_record` 等工具）。

### 6.1 五类记忆的职责与落点

五类记忆正好回答五个问题：**"我们知道什么 / 我们做过什么 / 我们产出过什么 /
我们在验证什么 / 证据是什么"**，一一对应 AGENTS.md §6 的研究记忆五件套。

| 记忆类 | 回答的问题 | 模块（`src/memory/`） | 关键操作 | 上游 seam 落点 |
|---|---|---|---|---|
| Semantic 语义 | 我们知道什么（已确认/高置信事实） | `semantic.ts` → `SemanticMemory` | `put` / `query`（关键词召回）/ `bySubject` / `digest`（从已核验 claim 归纳三元组） | skills / 领域知识文件 |
| Episodic 情景 | 我们做过什么（事件时间线） | `episodic.ts` → `EpisodicMemory` | `record` / `recent` / `since` / `forClaim` / `ofKind` | 会话日志（`session-persistence-jsonl` 可回放研究轨迹） |
| Artifact 产出 | 我们产出过什么（检索式回忆） | `artifact.ts` → `ArtifactMemory` | `put` / `recall` / `byKind` / `forClaim` / `archive`（ArtifactStore 之上的召回适配器） | `ctx.attachments` / 文件系统 |
| Hypothesis 假设 | 我们在验证什么（假设生命周期） | `hypothesis.ts` → `HypothesisMemory` | `propose` / `activate` / `recordVerdict` / `update` / `active` / `byClaim` | research-core 存储 |
| Evidence 证据 | 证据是什么（按 claim 台账 + 复核灯） | `evidence.ts` → `EvidenceMemory` | `add` / `forClaim` / `unverified` / `markVerified` | research-core 存储 |

语义设计要点：

- **HypothesisMemory 是验证状态机**：`propose → active → supported / refuted / abandoned`，
  每次 verification 的 verdict（verified/disputed/rejected）经 `recordVerdict` 追加进
  `history` 并自动推状态——假设不是"一句话"，而是一条带置信度历史的生命周期。
- **EvidenceMemory 是 claim 证据的"台账时间线"**：与 `ResearchClaim.evidence[]` 互为镜像，
  区别在按 `collectedAt` 排序、暴露 `unverified()`（复核灯未点亮）供验证循环优先处理。
- **SemanticMemory 只收"已核验"事实**：`digest()` 的入参是已 verified 的 claim，
  避免把模型生成的中间说辞污染知识库（铁律见 §6.5）。

### 6.2 Artifact Store（统一产出 / 实验档案）

所有研究产出——笔记、证据日志、实验、结果、报告、反例——进**同一个** `ArtifactStore`：

```text
ArtifactKind = 'note' | 'evidence-log' | 'experiment' | 'result' | 'report' | 'counterexample'

Artifact {
  id: 'art-<seq>';            // 单调递增，归档唯一标识
  kind: ArtifactKind;
  title: string;  body: string;
  claimId?: string;           // ← 可追溯的关键外键
  createdAt: string;          // ISO
  meta: Record<string, unknown>;  // ← 机器可读数据（env/outcome/n/engine/verdict…）
  archived: boolean;
}
put() / get() / trace(claimId, kind?) / archive(id) / list()
```

- **`trace(claimId)` 是按 claim 回放的证据链入口**：给定一条 claim，能取回与之绑定的
  全部 experiment / result / counterexample，直接支撑论文附录 A 的"证据追溯"。
- **`meta` 承载结构化数据**（如战役 artifact 记 `{env, outcome, n, engine}`、verdict
  artifact 记 `{verdict, outcome}`），供统计/复盘/写作直接消费，不必解析 `body` 文本。
- `ArtifactMemory`（§6.1）就是 ArtifactStore 的召回侧：`recall(query, topK)` /
  `byKind` / `forClaim` 供写作与自省使用；`store_` 暴露给 `persistMemory` 一起落盘。

### 6.3 记忆在三条核心循环中的流动

五类记忆不是孤立表，而是被 Director + 三条核心循环 + 阶段 4 的
autonomous / jobs / scheduler / self-improve 持续读写（代码事实如下）：

```text
Research Loop（ResearchDirector.run，src/research-director/director.ts）
  task=read/search  → episodic(read) + claim(type=Fact, evidence=文献命中)
       (语义沉淀能力 = `LiteratureAgent.absorb()` / `SemanticMemory.digest()`，
        两者均已实现但当前无调用方；Director 尚未把文献命中
        折入 semantic —— 见本节末"语义接线缺口")
  task=hypothesis   → hypothesis.propose + episodic(hypothesis) + claim(type=Hypothesis)
  task=experiment   → agents.experiment.plan/run + episodic(experiment) + artifact(experiment)
  task=verify       → runVerification + episodic(verify) + artifact(result: verdict)
  task=write        → artifact(report)

Verification Loop（runVerificationLoop，src/verification-loop/verification-loop.ts）
  claim 批量（证据/反证/实验三步）→ episodic(verify) + hypothesis.recordVerdict(状态机)
  → artifact(result: verdict, meta.checks=checks)

Experiment Loop（runAutomaticExperiment / runCampaign，src/experiment/runner.ts）
  deploy→run(×repetitions)→collect→analyze→verify→archive
  → episodic(experiment) + artifact(experiment: 原始 results + 统计) + artifact(result: verdict)
```

- **单一写入面**：所有写记忆都汇入**同一个 memory 实例 + ArtifactStore**
  （`createMemory()` 单例，无旁路存储）。主路径是 Director / verification-loop /
  runner / jobs / scheduler / self-improve 的领域层函数；模型触发的工具
  （`research_record` / `research_verify` / `research_review` /
  `research_experiment` / `research_campaign` / `research_autonomous` /
  `research_job` / `research_schedule` / `research_reflect` / `research_paper` /
  `research_slides` 等）也经由同一个 `runtime.memory` / `researchCore.artifacts`
  服务写回——保证"谁产出谁落账"、审计可追。
- **阶段 4a/4b 扩展写者（同一写入面，代码事实）**：三条核心循环之外，
  autonomous / jobs / scheduler / self-improve 也读写**同一个** memory 实例，
  不存在第二套存储：

  | 模块 | 读 | 写 |
  |---|---|---|
  | Autonomous（`src/autonomous/index.ts` → `runAutonomousResearch`） | 驱动 5 任务 DAG（read → hypothesis → experiment → verify → write） | 经 Director + campaign + writer 内部分派写作（见上三条循环），本身不旁路 |
  | JobRunner（`src/jobs/index.ts`） | 仅内部状态 | 完成/失败 → `episodic(note, meta.jobId)` + `artifact(result 成功 / evidence-log 失败, meta.jobId/kind/status)` |
  | ResearchScheduler（`src/scheduler/index.ts`） | 调度状态表 | 注册 → `episodic(note)`；触发 → `episodic(decision)` + 跑 autonomous（内部再写）+ `artifact(report, meta.scheduleId/verdict)` + `episodic(note done)`；失败 → `episodic(note failed)` 并推进状态 |
  | SelfImprover（`src/self-improve/index.ts`） | 五类快照：`episodic.all()` / `artifact.store_.list()` / `hypothesis.all()` / `evidence.all()`（并派生 jobs / scheduled 计数） | 反思 → `episodic(note, meta.kind=reflection)`（留痕在快照之后，冷启动 `snapshot` 不被污染） |

  「写者 = 读者」闭环：所有复盘/解码（`research_reflect` / self-improve）只读这
  一个 memory 实例再产出建议，§6.4 的持久化因此只需序列化 `persistMemory` 一个入口。

- 实验 artifact 与 episodic 同时落：artifact 存"数据"，episodic 存"做了什么/为什么"，
  两者用同一 `claimId` 关联，构成 `claim → experiment → artifact → verdict` 的完整证据链。
- **语义接线缺口(现状如实标注)**：SemanticMemory 的写入能力(`digest`/`absorb`)已就绪，
  但三条循环当前**都不写 semantic**——`grep -rn digest src/` 仅命中定义、无调用。
  后续增量是把"已核验 claim → 三元组"的 absorb 折入检索/阅读任务(见 §6.1 表)，现在不写是
  为了避免"未核验中间说辞"污染知识库(§6.5 铁律)。

### 6.4 持久化与运行时接线

- **默认全内存**（`createMemory()`），零外部依赖，便于单测与沙箱。
- **可选 JSON 落盘**：`memory.dir` 配置存在时，插件 boot 期 `loadMemoryInto()` 载入，
  `persistMemory()` 把五类 + ArtifactStore 快照进 `<dir>/research-memory.json`；
  配置入口 = profile overlay 整行覆盖 `dsh-research-core` 行并给出 `dir`（见
  `dsh-research/patches/research-agent.yml` 的示例注释）。
- **持久化接线缺口(现状如实标注，同 §6.3 语义缺口同一风格)**：插件目前只接线了
  启动侧 `loadMemoryInto()`；`persistMemory()` 尚无 shutdown/定时 flush 钩子，
  落盘是**显式触发**（单测 / 后续可加工具或卸载钩子），非自动——"载入可开、落盘待接"。
- **运行时面**：`ctx.provide('researchMemory', memory)` → web 会话可拿到整套记忆；
  13 个 `research_*` 工具中的 `research_record` / `research_search` /
  `research_review` / `research_campaign` / `research_reflect` 等直接读写五类记忆。

### 6.5 一致性铁律与反模式

- **铁律（对应 AGENTS.md §6 铁律 / Policy 1）**：不能把"模型曾经说过"当作事实；
  每条 claim 必须带 `source / evidence / confidence / verified / last_verified`。
  记忆层通过类型强制（`SemanticFact.verified`、`EvidenceLedgerEntry.verified`、
  `ResearchClaim.verificationStatus`）把这条纪律固化进数据结构。
- **镜像一致**：`ResearchClaim.evidence[]`（合成口径）↔ `EvidenceMemory`（时间线台账），
  新增证据两边都要落；反例走 `counterEvidence` 且 `ResearchClaim` 结构内含
  `CounterEvidence[]` 与 `verdictRationale`。
- **实验结论必须绑定 artifact（Policy 5/6）**：无 artifact 的实验数据不得声称
  "实验验证"；沙箱模拟必须 `simulated=true` 如实标记（RouteEngineSim），
  报告 `research/RPKI-BGPsec-security-gaps.md` 已把"sim 数据的性质"列为方法学声明。
- **反模式清单**：不绑 `claimId` 的 artifact（无法 `trace`）；把 Hypothesis 标成 Fact；
  未跑验证就把 HypothesisMemory 置 supported；用 `meta` 存文件而不用 `body` 存正文。

---

## 7. Migration plan（迁移计划细分）

> **13. Migration plan** 在 §5 只有阶段编号；本节把它展开成"起点 → 分阶段 → 工具链 →
> 回滚"的迁移计划。独立文档（`docs/research-agent-migration-plan.md`）另行产出，
> 本节是架构文档内的可执行摘要。

### 7.1 起点与终点

- **起点（2026-10-08 前）**：旧 Python 科研智能体栈（`src/research_agent/`、
  `pyproject.toml`、`config.yaml`）承载 planning / evolve / memory / debate / harness；
  已于 2026-10-08 移除。dsh 运行时为 `v0.2.0-rc.2`，上游 submodule pin
  `5badb15009`（dsh-v0.2.1-alpha.1）。
- **终点**：`dsh research`（= `dsh --profile research`）= **base + web-app +
  `@basil/dsh-research`**；Web 会话内与 13 个 `research_*` 工具 + 11 个服务交互，
  跑完整科研流水线（DAG → 检索 → 实验战役 → 验证 → 论文/幻灯片 → 归档）。

### 7.2 分阶段迁移（状态 + 交付物 + 验收门禁）

| 阶段 | 迁移内容 | 交付物 | 状态 | 验收门禁 |
|---|---|---|---|---|
| 0 | 架构迁移分析（"先分析后编码"，§8.1） | 三件套文档（architecture / data-model / migration-plan） | 架构文档 ✅；另两篇待补 | 三黄金规则 + seam 表 + 15 项产出覆盖 |
| 1 | 核心六件 + 插件挂载 | `src/core/`（goal/dag/claim/evidence/verification/artifact）+ `src/plugin.ts` | ✅ 2026-10-08 | `node --test` 全绿 + runtime-smoke **SMOKE PASS**（2 工具） |
| 2 | 五类记忆 + 三角色 + Director | `src/memory/ src/agents/ src/research-director/` + 三条循环 | ✅ 2026-10-08 | 单测全绿 + SMOKE PASS（5 工具） |
| 3 | 执行器 + 自动战役 + 统计口径 | `src/experiment/`（stats / topology / executors / runner） | ✅ 2026-10-08 | 27/27 + SMOKE PASS（6 工具） |
| 4a | 角色注册表 + 模型路由 + 一键流水线 + 写作 | `src/roles/ src/model-router/ src/autonomous/ src/writer/` | ✅ | 69/69（与 4b 合计）+ 语义自测（ROV verify / path-manipulation reject） |
| 4b | 长任务 + 调度 + 自省 | `src/jobs/ src/scheduler/ src/self-improve/` | ✅ | **69/69 单测 + SMOKE PASS**（11 服务 + 13/13 工具） |
| 4.5 | 前端 headless → web | `profiles/research/`（bundle = base + web-app + dsh-research） | ✅ 2026-10-09 | SMOKE PASS + `--dump-config` 含 web-startup/webserver 无 headless |
| 收尾 | 16c real subagent / 多 Profile / `--patch` 链 / npm 一键部署 / 报告跟进 | — | ⏳（见 TODO.md） | TODO 相应条目关闭 |

### 7.3 迁移工具链与工程纪律

- **上游零改动**：submodule pin + `git pull --ff-only` + `pnpm install && pnpm run build`；
  `git -C deepseek-harness status` 永远干净。
- **profile 部署**：`./dsh-research/scripts/deploy-profile.sh` 把 `package.json` +
  `cordis.patch.yml` 复制进 `$DSH_HOME/profiles/research/`，并把仓库 `dsh-research`
  **symlink** 到 profile 的 `node_modules/@basil/`——two-anchor 解析（安装包优先、
  profile 目录其次）⇒ 改 `dsh-research/` 立即生效，免重装。
- **两步核对**：`dsh --profile research --dump-config`（插件树 diff）+
  `--dump-config-schema`（schema diff）⇒ 任何 seam 变化一眼可见。
- **版本兼容豁免**：`compatibility.json` / `dsh plugin version-exemptions` 记录临时不兼容，
  不阻塞继续升级；升级过程记 `docs/upgrade-notes.md`。
- **"小步 + 门禁"**：每个阶段在上一阶段全绿基础上叠加，各自带独立测试门禁；
  不迁移的旧能力不进新树（旧 Python 栈整体移除而非并存）。

### 7.4 回滚与隔离

- **结构性回滚保障**：三黄金规则 ⇒ 任何时刻都可退回"只读上游 + 外部叠加"；
  回滚 = 撤销 profile 层（重跑 deploy / 还原 bundle 顺序 / 临时 `--patch` 禁用
  `dsh-research-core` 行），不动上游。
- **数据可迁移**：`research-memory.json` 快照可在新旧 profile 间 `loadMemoryInto`；
  实验 artifact 一律绑定 claimId + 落 `research/`，迁移不丢证据链。
- **隔离边界**：代码（`dsh-research/`）、配置（`$DSH_HOME/profiles`）、上游（submodule）
  三块互不写文件——回滚任意一块不影响另外两块。

---

## 8. MVI — Minimal viable implementation（最小可行实现）

> **14. Minimal viable implementation** 是原始 15 项产出之一。MVI 的目标不是"最小
> 代码量"，而是**最小的、可验证的、跑通整条科研证据链的实现**。

### 8.1 为什么"先分析、后编码"

`prompts/dsh.md` §十六明确建议：**"最应该做的不是开始改代码"**，而是先让 Agent 完成
一次架构迁移分析（15 项产出 → 三篇文档），**然后**再据此编码。理由是 DeepSeek
Harness 已是 developer preview、API 有兼容性变化，直接在巨物上硬改会陷入
"追着上游改"的死循环。MVI 是这条纪律的产物：先明确"最小能跑的形态"，再逐阶段长大。

### 8.2 纵切面：一条可追溯的证据链（walking skeleton）

MVI 的纵切面 = **一条跨全栈的证据链**，`src/core/core.test.ts` 的 BGP 冒烟即此形态：

```text
ResearchClaim（Hypothesis）
  → research_verify（证据核验 / 反证 / 实验判定）
  → Campaign/Experiment（RouteEngineSim 四口径）
  → Verdict（verified / disputed / rejected）
  → Artifact（result，绑定 claimId）
  → Episodic（verify 事件）+ Artifact 回收（论文附录 A 可追溯）
```

这一刀从**领域类型**（claim/evidence/verdict）切到**验证闭环**再到**归档**，
虽不真实，但验证了：类型模型、验证判定、artifact 追溯、记忆写入、插件挂载
五层全部真实可用。

### 8.3 MVI 范围与验收标准

- **范围内**：阶段 1 核心六件（goal / dag / claim / evidence / verification /
  artifact）+ ArtifactStore；Cordis 插件（`researchCore` 服务 + `research_verify` /
  `research_record` 工具）；`profiles/research/`（base + bundle 组合）能 boot；
  BGP claim 冒烟 `verdict: verified`。
- **验收命令**（沙箱可复现）：
  - `cd dsh-research && node --test "src/**/*.test.ts"` → 全绿
  - `DSH_HOME=/tmp/dsh-home ./dsh-research/scripts/deploy-profile.sh && DSH_HOME=/tmp/dsh-home node dsh-research/scripts/runtime-smoke.mjs` → **SMOKE PASS**
  - `dsh --profile research --dump-config` → 组合树含 `dsh-research-core` 行
- **非目标（明确不进 MVI）**：真实 FRR/VPP 网元执行（沙箱无二进制 → 回退 sim 并
  如实标记）；多 agent 团队与真实 subagent 会话（16c）；前端 Web 会话内的自治交互
  （阶段 4.5 才完成 web 化）——这些是 MVI 之后的增量，而不是 MVI 的一部分。

### 8.4 从 MVI 到完整系统的增长路径

每步都保持 MVI 精神（最小可用 + 可验证 + 不碰上游）：

```text
MVI（2 工具）──阶段2──▶ 五类记忆 + 三角色 + Director（5 工具）
   ──阶段3──▶ 执行器 + 自动战役 + 统计（6 工具）
   ──阶段4──▶ roles/model-router/autonomous/writer/jobs/scheduler/self-improve（13 工具）
   ──4.5──▶ 前端切 web（Web 会话内交互）
   ──收尾──▶ 16c real subagent / 多 Profile / --patch 链 / npm 一键部署
```

关键增量都是"同一领域层 + 同一插件 seam"上加法，不替换 MVI 已验证的任何接缝
——这正是 §9 风险登记册的减压阀：MVI 的接缝即整套系统的接缝，升级时只需复核它。

---

## 9. 上游风险登记册（细分）

> §4.3 是顶层概括（5 行）；本节把它展开为**可执行的登记册**：
> 分类 → 检测 → 缓解 → 治理节奏，并把项目实际踩过的风险落成具体条目。

### 9.1 风险分类

| 域 | 风险 | 影响面 |
|---|---|---|
| R1 模型/API 层 | developer preview 破坏性变更（CLI/配置/schema） | 启动、工具调用、模型回合 |
| R2 seam 契约 | `ctx.tools` / `ctx.llm` / `ctx.subagents` / 事件名签名变化 | 插件激活、工具注册、Subagent 委派 |
| R3 组合机制 | bundle / patch 行寻址、组合顺序语义变化 | profile 组装、overlay 覆盖 |
| R4 实验包撤出 | agent-team / workflow-ptc 等实验包不承诺稳定、或被撤回 | 团队协作/流程 DAG（可选路径） |
| R5 分发解析 | `main`/`exports` 入口重命名、two-anchor 解析规则变化 | 本地 symlink 部署、包导入 |
| R6 模型默认/凭据 | 默认 provider 的 key 占位、401；credential-ref 解析变化 | 真机端到端、无头/Web 会话 |
| R7 前端基座 | headless → web →（未来）其他前端；位置参数/会话 seam 变 | `dsh research` 入口形态 |
| R8 会话/存储 | JSONL schema、session-query 迁移链变化 | 研究轨迹回放、记忆持久化 |

### 9.2 风险 → 检测 → 缓解矩阵

| ID | 概率 | 检测手段 | 缓解（优先级排序） |
|---|---|---|---|
| R1 | 高 | `--dump-config` / `--dump-config-schema` diff + 回归冒烟 | 版本 pin + peerDependencies 声明范围 + 定期（非追更）升级；豁免机制记录 |
| R2 | 中 | 升级后 `runtime-smoke.mjs`（工具注册数/服务提供数断言）；`inject` 声明检查 | **只消费公开 seam**；适配层集中在 `src/plugin.ts` 单点；签名变只改这层 |
| R3 | 中 | `--dump-config` 对比插件树；`--patch` 链回归用例 | 自研 bundle "重述整行"，patch 覆盖语义不改上游交错 |
| R4 | 低-中 | 上游 changelog / 依赖树检查 | 关键路径只用稳定 seam；实验包 = 可缺省 option（§4.1-5 双路径） |
| R5 | 中 | `node --test` 导入断言 + deploy 后 resolve 检查 | 只 import 发布入口顶层导出；symlink 采用 two-anchor 官方语义 |
| R6 | 中（本机实测踩过） | 真机 `dsh research` 启动第一回合 | 两层 overlay（provider + agent-default-model）固化在 profile；key 走 credential-ref |
| R7 | 中（已踩过一次） | 升级后跑一遍 `dsh research`（无位置参数）；runtime-smoke 适配 | 前端形态封装在 `profiles/research/package.json` 的 bundles 一行，切换=改一行 |
| R8 | 低-中 | 回放/load 冒烟；dump-config-schema 关注 session 域 | 记忆/artifact 落自有 JSON（`research-memory.json`），不绑定 dsh 会话格式 |

### 9.3 已踩坑实录（风险具体化，全部已成文）

1. **R2 · `inject` 缺失**：Cordis 读 `ctx.tools` 必须先 `export const inject = ['tools']`，
   否则 `cannot get property "tools" without inject`，插件**整行不激活**（静默）。
   教训：服务/工具激活要有显式断言（runtime-smoke 数服务、数工具）。
2. **R7 · headless → web**：web 基座**不接受位置参数**（`too many arguments`），
   一次性 CLI 任务形态消失；`dsh research "<task>"` 不再成立，改 Web 会话交互。
   教训：前端接缝是"可替换层"，封装在 profile 一行，切换不动领域代码。
3. **R6 · 401**：base 默认 `deepseek-official` 用 `DEEPSEEK_API_KEY`，本机
   `.credentials.yaml` 该 ref 是占位值「0731」→ 401。修复 = web 同款两层 overlay：
   `llm-pi-ai`（provider `local-interval-dsv4`，baseURL 内网网关）+
   `agent-default-model`（默认 dsv4flash）。教训：不依赖任何"默认模型"，
   模型路由显式化（`src/model-router/`，角色级覆盖）。
4. **R3 · patch 整行替换不合并**：替换整段 config ≠ 合并且不报错——自研 bundle
   必须"自己重述整行"，否则悄悄丢配置。
5. **R5 · two-anchor**：本地 bundle 不装 npm，需 symlink 进
   `$DSH_HOME/profiles/<name>/node_modules/<scope>/` 才被 two-anchor 解析到；
   漏 symlink 表现为"工具没出现"而非报错。

### 9.4 治理节奏与触发升级

- **升级节奏**：developer preview ⇒ 定期（不追更）升级，每次走 §4.2 标准流程
  （ff-only pull → dump-config/dump-config-schema diff → 回归冒烟 → seam 签名检查 →
  必要时 version-exemptions → `docs/upgrade-notes.md`）。
- **升级触发信号**：上游 release / changelog 提到 seam / 真机运行报错或行为漂移 /
  `runtime-smoke.mjs` 断言失败。
- **回归安全网**：`node --test "src/**/*.test.ts"`（不依赖 dsh **69/69**）+
  `runtime-smoke.mjs`（依赖 dsh 组合树 **SMOKE PASS**）双网；前者锁领域层，
  后者锁 seam——上游怎么变，先撞后者、再查前者。
- **兜底**：任何一条风险被触发，只要满足三黄金规则，就可把"受影响接缝"收敛到
  `src/plugin.ts` / profile 层单点修复，必要时用豁免机制临时放行，不阻塞主线。

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

---

## 附录 · 阶段 3 已实现（2026-10-08）：Executor + 自动实验 + 统计口径

在阶段 2 的 Agent 之上落地「真实执行 → 自动战役 → 四口径统计」三层，**仍不碰上游**：

- **统计口径**（`src/experiment/stats.ts`）：统一收敛
  `detection_rate / false_positive_rate / convergence_time / verification_latency`
  四口径；`analyzeSeries`（均值/样本标准差/95%CI）、`metricsFromResults`（批量抽取）、
  `summarizeDetection`（检测均值 − 误报均值 → effectiveScore）。
- **执行源**（`src/experiment/topology.ts`）：`Topology` 抽象，默认 `RouteEngineSim` 确定性
  路由引擎模拟器（ROV/BGPsec 状态模型、mulberry32 同 seed 可复现、注入产生方差）；
  `FrrTopology` / `VppTopology` 为真实守护进程适配器（探测二进制、渲染 frr.conf / startup.conf、
  可用时管理进程生命周期；缺失时可 `fallbackToSim`，engine 如实标记 `frr-adapter-sim`）。
- **执行器**（`src/experiment/executors.ts`）：`TopologyExecutor` 实现既有 `Executor` 契约，
  部署 → 注入攻击 → 采集四口径 → detection 阈值判定 outcome（support/refute/inconclusive）。
- **自动流水线**（`src/experiment/runner.ts`）：`runAutomaticExperiment` / `runCampaign` 编排
  deploy → run(×repetitions) → collect → analyze → verify → archive，写回 episodic + artifact，
  返回 `CampaignReport`（stats + detection + verdict + artifacts）。
- **运行时面**：`src/plugin.ts` 新增 `ctx.provide('researchExperiment', …)`（`runAutomatic`）
  与第 6 个工具 `research_campaign`；`research_experiment`（单轮 plan+run）保留兼容。
- **本地自测**：`node --test "src/**/*.test.ts"` **27/27** 全绿（新增 experiment 8 项 +
  plugin 阶段 3 战役）；in-dsh `runtime-smoke.mjs` → **SMOKE PASS**（services 5 + tools 6/6 +
  BGP 冒烟 + campaign verdict verified + 文献检索）。

**沙箱约束**：本环境无 FRR/VPP/docker 二进制，默认执行源为 `RouteEngineSim`（指标
`data.simulated=true` 如实标记）。FRR/VPP 适配器在目标机安装二进制后自动接管（`available` 探测）；
实时指标采集（vtysh/vppctl 解析）留作后续增量。
