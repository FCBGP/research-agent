# @basil/dsh-research

研究型 agent 的 dsh bundle（插件组合包）。**绝不修改 `deepseek-harness/` 内部代码**，
一切经本 bundle 的 patch 层与公开 seam 叠加在 dsh 之上。

## 命名与内置领域词汇（2026-10-09 定型）

- **定型名称**：`dsh-routing-research`（域间路由安全研究专用 Agent，见仓库 README「命名定型」）；
  操作命令不变，仍为 `dsh research`（== `dsh --profile research`）。
- **内置领域词汇**：`src/domain/vocabulary.ts` 是**唯一口径来源** ——
  定型名 / 操作命令 / 领域范围（BGP / RPKI / BGPsec / ASPA / VRO / CRC / FC-BGP）/
  执行器（FRR / VPP）/ 检索种子词（DOMAIN_KEYWORDS）/ 词汇表（GLOSSARY）。
- **运行时面**：`researchCore.domain` 服务暴露上述域（`plugin-core.ts`），
  `research_search` 缺省 query 时用 `DOMAIN_KEYWORDS` 兜底检索（seeded=true），
  persona / preset-research description 引用同一套词表。

## 已实现

### 阶段 1 · 核心六件（纯 TS 领域层，`src/core/`，零运行时依赖）

| 模块 | 六件对应 |
|---|---|
| `types.ts` | ResearchGoal / ResearchClaim / ResearchEvidence / Verdict / DAG 边 |
| `dag.ts` | ResearchTask DAG：按「依赖已满足 + 信息增益最高」选节点（`selectNext`/`unlock`） |
| `claim.ts` | Claim/Evidence 构造 + 置信度合成（`newClaim`/`addEvidence`/`synthConfidence`） |
| `verification.ts` | Verification Loop：Evidence Check / Counter Search / Experiment Test → verdict |
| `artifact-store.ts` | Artifact Store：统一存储、按 claim 追溯（`trace`）、归档 |

### 阶段 2 · Research Memory + 三个角色 Agent + 调度（`src/memory|agents|research-*`，✅ 已实现并自测）

- **五类记忆**（`src/memory/`）：`semantic`（事实三元组+溯源）/ `episodic`（事件时间线）/
  `artifact`（产出检索式回忆）/ `hypothesis`（假设生命周期）/ `evidence`（证据台账）；
  `createMemory()` 门面 + `persistMemory`/`loadMemoryInto` 可选 JSON 落盘
- **Literature Agent**（`src/agents/literature.ts`）：本地种子语料（`corpus.ts`，
  9 篇 RPKI/BGPsec 经典文献）+ 关键词/词频召回；`LiteratureSource` 接口可注入真实检索
- **Reviewer Agent**（`src/agents/reviewer.ts`）：research-paper-review 8 步清单，
  评分合成 → `accept/minor-revision/major-revision/reject` 判定 + 改进建议汇总
- **Experiment Agent**（`src/agents/experiment.ts`）：claim → 实验计划（env/scenario/
  配置指纹/metrics）→ Executor 执行（当前 `StubExecutor` 占位，显式 `simulated`）→
  `analyze` 多次重复统计（均值/标准差）
- **ResearchDirector + 三条循环**（`src/research-director|research-loop|verification-loop|experiment-loop/`）：
  Goal → 任务 DAG → 按角色分派 → 记忆写入 → 产出归档；独立验证/实验循环可复用

### 阶段 3 · Executors 与产出（`src/experiment|writer/`，✅ 已实现并自测）

- **确定性模拟拓扑**（`src/experiment/topology.ts`）：`RouteEngineSim`（mulberry32 种子可复现）
  + FRR/VPP 真实守护进程适配器（`FrrTopology`/`VppTopology`，守护进程不可用时回退）；
  `TopologyExecutor` 实现 Executor 契约（`src/experiment/executors.ts`），
  攻击类别由 `inferAttack(plan.scenario)` 自动判定（hijack→prefix-hijack / bgpsec→path-manipulation…）
- **自动实验流水线**（`src/experiment/runner.ts`）：`runAutomaticExperiment` /
  `runCampaign` 实现 deploy → run(×repetitions) → collect → analyze → verify → archive，
  写回 episodic + artifact；四口径统计（`src/experiment/stats.ts`：
  均值 / 样本标准差 / 95%CI / effectiveScore）
- **Paper generation**（`src/writer/paper.ts`）：摘要 + 6 章节 + 附录 A 证据追溯，统计
  claims/verified/disputed/rejected/experiments；**PPT generation**（`src/writer/slides.ts`）：
  8 页 Marp 科研汇报，与 paper 共享同一 `PaperInput`（自测各 2 pass）

### 阶段 4 · 自治化（`src/roles|model-router|policy|autonomous/`，✅ 已完成核心）

- **多角色注册表**（`src/roles/`）：`ROLE_REGISTRY`（director / literature / reviewer /
  experimenter / writer 五角色）+ `TASK_ROLE` 分派表（task kind → 角色）
- **角色级模型路由**（`src/model-router/`）：默认 `local-interval-dsv4/dsv4flash`
  （与 profile 两层 overlay 对齐），可 `routes`/`roleModels` 覆盖
- **Research Agent Policy**（`src/policy/`）：10 条纪律（AGENTS.md §9）固化，
  `PolicyService` 支持 omit/extra/enabled，渲染 system-prompt 块
- **一键科研流水线**（`src/autonomous/`）：`buildGoal`（5 任务 DAG）+
  `runAutonomousResearch`（Director → 实验战役 + **4 攻击 × 4 验证策略实验矩阵** →
  验证折入 → Writer 论文+幻灯片（含矩阵小结）→ 归档）；
  攻击语义正确：ROV 对 prefix-hijack verified（≈0.79）、对 path-manipulation rejected（≈0.33，需 BGPsec）；
  矩阵逐格战役全部归档进 memory，流水线结束时按 `memory.dir`（plugin-core）或显式
  `memoryDir` 落盘五类记忆（论文/幻灯片/矩阵 artifact 可 load 回、可追溯）
- **长任务队列**（`src/jobs/`）：JobRunner 状态机（pending→running→done/failed，可 cancel），
  同步/异步执行体 + 归档；**周期调度**（`src/scheduler/`）：at/daily/everyMs 纯函数
  nextOccurrence + ResearchScheduler（可注入时钟）；**自省改进**（`src/self-improve/`）：
  基于 episodic+artifact 统计 → 观察 + 优先级改进建议 + 反思归档

### 阶段 4c · real subagent 实挂 dsh 模型层（`src/real-subagent/`，✅ 已实现并自测）

- **web 会话 seam**（`seam.ts`）：消费 dsh 公开 seam `ctx.subagents`（`ctx.reflect.get`
  读取，无需声明 inject；provider 缺省 `spawn`，web base 的 standard preset 已注册）。
  `createDshSubagentSeam(ctx, 'spawn')` / 可注入 `ScriptedSubagentSeam`（测试/离线）。
- **persona/prompt 组包**（`persona.ts`）：角色人格（roles 注册表 label+description）+
  研究纪律（policy 10 条）+ 上下文 + 任务 → 整包下发子 agent。
- **确定性本地回退**（`local.ts`）：seam 不可用 / start 失败时按角色产出可追溯占位结论，
  诚实标注 `delegator: 'local'`、`ok: false`，绝不冒充模型（AGENTS.md 铁律）。
- **RealSubagentAgent 服务**（`index.ts`）：`run(input, signal)` →
  model 路由（`input.model` 单次覆盖 / `ModelRouter.setRole` 持久覆盖）→ 真实回合 →
  文本 + sessionId → 写回 episodic + artifact；`runtimeStatus()` 暴露 seam 就绪度。
  插件上下文无父 Agent 时 dsh in-process provider 会拒绝 start → 服务如实回退本地；
  在 web 会话的 agent 回合内传入 `parent`（`exec.agent`）即可触发真实 LLM 回合。
- 插件挂载 `researchSubagents` 服务（第 12 个），`config.subagents.enabled=false` 可禁用 seam。

### 阶段 5 · Agent Preset + 插件化重构（preset-research + 6 插件，✅ 已实现并自测）

> 背景：此前 `@basil/dsh-research` = 一个 npm 包同时扮演 bundle + 一个 700+ 行巨型插件
> （12 服务 + 13 工具全在 host 平面）→ `research_*` 工具对所有 preset 会话 always-on 可见、
> 无法按会话裁剪；领域 skill（bgp / rpki / …）从未挂进运行时。
> 阶段 5 把 research 包装为 **preset-research（Research Agent 本体）+ 6 个职责单一插件**；
> 工具只在 research 会话出现，skill 经 `skill-filesystem` 真正挂载。

**bundle patch 分片**（`dsh-research/package.json` → `dsh.bundle.patch` 数组）：

| 文件 | 平面 | 内容 |
|---|---|---|
| `cordis.patch.yml` | host | 6 行：`research-core` / `research-triz` / `research-director` / `research-experiment` / `research-writer` / `research-operations`（行序 = 依赖顺序） |
| `presets/research.patch.yml` | preset | `preset-research`（`@deepseek-ai/dsh-agent-preset`，id=research, order=2）：persona + research-tools + skill-filesystem + tool-skill + standard 基础工具集 |

**7 个插件**（包 `exports` 显式子路径 `./core` `./triz` `./director` `./experiment`
`./writer` `./operations` `./tools`）：

| 插件 | 入口 | 平面 | 提供 |
|---|---|---|---|
| `dsh-research-core` | `src/plugin-core.ts` | host | `researchCore` / `researchMemory` / `researchAgents` |
| `dsh-research-triz` | `src/plugin-triz.ts` | host | `researchTriz`（TRIZ 知识基 + 矛盾分析 / IFR / 假说生成） |
| `dsh-research-director` | `src/plugin-director.ts` | host | `researchDirector`（DAG 调度） |
| `dsh-research-experiment` | `src/plugin-experiment.ts` | host | `researchExperiment`（自动实验战役） |
| `dsh-research-writer` | `src/plugin-writer.ts` | host | `researchWriter`（论文 / 幻灯片） |
| `dsh-research-operations` | `src/plugin-operations.ts` | host | `researchPolicy` / `researchAutonomous` / `researchJobs` / `researchScheduler` / `researchSelfImprove` / `researchSubagents` |
| `dsh-research-tools` | `src/plugin-tools.ts` | **preset** | 14 个 `research_*` 工具（research 会话作用域） |

- `package.json` `main` / `.` 指向 `src/plugin-core.ts`；`src/plugin.ts` 降级为纯 re-export
  （保留历史模块路径不中断，不再承载实现）。
- `patches/research-agent.yml` 已删除，由 `cordis.patch.yml` 取代。

**行为变更（2026-10-09）：**
- **默认 preset = research**：`profiles/research/cordis.patch.yml` 新增
  `agent-preset-registry.config.default: research` → 新会话默认 Research Agent 本体。
- **`research_*` 只在 research 会话出现**：工具注册移到 preset-research 的 research-tools
  子行（会话作用域 `ctx.tools`）；standard 等其它 preset 会话看不到 `research_*`
  （消除 always-on 污染，runtime-smoke 反证断言 standard tools w/ research_* = 0）。
- 程序性 skill 真正挂载：skill-filesystem `customSkillDirs` → bundle 自带 `skills/`
  （experiment / paper-review / triz；领域知识 2026-10-10 起不再做成 skill，见 docs/domain-knowledge-notes.md 与仓库 README「WeKnora 知识库对接」）。

### 运行时插件（阶段 5 · 6 插件分片，Cordis 形态）— ✅ 已端到端挂载实测

- 原 `src/plugin.ts` 巨型插件已拆为 7 个职责单一插件（服务名 / 工具 schema 语义零变化；
  阶段 8 起新增 `dsh-research-triz`），挂载分两个平面：
  - **host 平面**（`cordis.patch.yml` 6 行，行序 = 依赖顺序）提供 13 个服务 ——
    `researchCore` / `researchMemory` / `researchAgents`（core）；`researchTriz`（triz）；`researchDirector`（director）；
    `researchExperiment`（experiment）；`researchWriter`（writer）；`researchPolicy` /
    `researchAutonomous` / `researchJobs` / `researchScheduler` / `researchSelfImprove` /
    `researchSubagents`（operations）
  - **preset 平面**（`presets/research.patch.yml` 的 research-tools 子行，`inject ['tools']`）
    在会话作用域注册 14 个 `research_*` 工具 —— `research_verify` / `research_record` /
    `research_search` / `research_review` / `research_experiment` / `research_campaign` /
    `research_paper` / `research_slides` / `research_autonomous` / `research_policy` /
    `research_job` / `research_schedule` / `research_reflect` / `research_triz`
- 依赖生命周期挂在 fiber effect 上：profile 卸载即回收
- 行 `config`（`tools.enabled` 开关、`memory.dir` 持久化等）经 bundle patch
  （`cordis.patch.yml`）进入组合树，profile overlay 可整行覆盖

**验证（在 dsh 真实运行时内，非 mock）：**

```sh
# 1) 部署 profile（复制模板 + symlink 本包到 $DSH_HOME/profiles/research）
DSH_HOME=/tmp/dsh-home ./scripts/deploy-profile.sh

# 2) 组合树含 research-* 6 行 + preset-research（无旧 dsh-research-core 行）
DSH_HOME=/tmp/dsh-home dsh --profile research --dump-config | grep -E "research-(core|triz|director|experiment|writer|operations)|preset-research"

# 3) 运行时冒烟：13 服务（host，含 researchTriz）/ 14 工具（research 会话作用域，standard=0）/
#    BGP claim→verify / campaign / policy / autonomous / job / schedule / reflect / subagents / triz
DSH_HOME=/tmp/dsh-home node scripts/runtime-smoke.mjs   # → SMOKE PASS
#    端口被占用时：SMOKE_PORT=<空闲端口> node scripts/runtime-smoke.mjs
```

### 阶段 6 · 多 Profile / 角色 preset（paper / experiment / engineering / reviewer，✅ 已实现并验证）

> 背景（TODO 「多 Profile」）：`profiles/` 原来只有 `research/`。阶段 5 把 Research Agent 做成
> preset 平面后，同一 bundle 可在 preset 平面再注册多个角色预设，每个 Profile
> （`profiles/<role>/`）经自己 `cordis.patch.yml` 的默认 preset 选取对应角色 —— 无需复制代码，
> 四个角色共享同一 host 平面（research-core/triz/director/experiment/writer/operations）。

- **preset 注册**：`presets/roles.patch.yml`（bundle patch 第 3 片，`package.json`
  `dsh.bundle.patch` = `[cordis.patch.yml, presets/research.patch.yml, presets/roles.patch.yml]`）
  在 preset 平面追加 4 个角色预设 —— `preset-paper`（order=3）/ `preset-experiment`（order=4）/
  `preset-engineering`（order=5）/ `preset-reviewer`（order=6）。每个角色 = persona
  （角色专用 agent 身份）+ research-tools（`config.tools.only` 白名单裁剪）+ skill-filesystem +
  tool-skill + standard 基础工具集（与 `research.patch.yml` 同一块，改时五处同步）。
- **工具裁剪语义（`config.tools.only`）**：`src/plugin-tools.ts` 的 `register()` 闭包
  只注册白名单内的 `research_*` 工具；白名单 = `undefined`/空数组 → 全量 14 个
  （preset-research 不设 only → 行为与阶段 5 完全一致）。角色白名单：
  - `paper`（10）：search / record / verify / paper / slides / autonomous / policy / job / schedule / reflect
  - `experiment`（10）：search / record / verify / experiment / campaign / autonomous / policy / job / schedule / reflect
  - `engineering`（7）：record / verify / **triz** / policy / job / schedule / reflect
  - `reviewer`（8）：search / record / verify / review / policy / job / schedule / reflect
- **Profile 模板**：`profiles/{paper,experiment,engineering,reviewer}/` 各含 `package.json`
  （base + web 前端 + `@basil/dsh-research`）+ `cordis.patch.yml`（从 `profiles/research/`
  复制、`agent-preset-registry.config.default` 改为对应角色；模型 overlay 原样保留）。
- **部署**：`deploy-profile.sh` 接受任意 profile 名 —— `PROFILE_NAME` 环境变量或第一个位置参数，
  缺省 `research`。`DSH_HOME=/tmp/dsh-home ./scripts/deploy-profile.sh paper` 即部署 paper profile。

**验证（沙箱，`DSH_HOME=/tmp/dsh-home`）：**
- 单测 98/98 全绿（含 `src/domain/vocabulary.test.ts` 命名/领域词汇 6 用例 + `research_search`
  领域词表兜底 1 用例；`plugin.test.ts` 断言 `researchCore.domain` = `dsh-routing-research`）。
- 5 个 profile `--dump-config` 各出现其默认 preset 行（`preset-{research,paper,experiment,
  engineering,reviewer}`）+ 对应 `agent-preset-registry.config.default`。
- runtime-smoke → **SMOKE PASS**，新增角色断言 `roles=true`：
  `paper:OK[10/10] experiment:OK[10/10] engineering:OK[7/7] reviewer:OK[8/8]`
  （组成 inventory 存在 + 未 broken + research-tools enabled；对应会话工具目录里
  `research_*` 恰好 = 白名单）。

**用法变化（承 4.5 / 5）：** `dsh research`、`dsh --profile paper`、`dsh --profile experiment`、
`dsh --profile engineering`、`dsh --profile reviewer` 各自启动 Web UI 会话，默认 preset 对应角色；
科研任务（`research_*` 工具按角色裁剪）在各自会话内交互；位置参数一次任务仍不支持。

### 阶段 7 · `--patch` 组合链（base → research policy → bgp research → experiment-specific，✅ 已实现并验证）

`--patch` 是 launcher flag（可重复、相对调用 cwd 解析），叠加顺序 = bundle patch（`cordis.patch.yml` +
presets）→ profile `cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml` → argv 里的 `--patch` 覆盖层（后层赢）。
对目标行 id 做**整行 config 替换（不深合并）**，因此覆盖层必须原样保留此前 bundle 设置的子键。

三层链式覆盖示例（`dsh-research/patches/`）：

```sh
DSH_HOME="$HOME/.dsh" dsh --profile research \
  --patch dsh-research/patches/chain-research-policy.yml    \   # L1 → research-operations：policy.extra（+2 条纪律）
  --patch dsh-research/patches/chain-bgp-research.yml       \   # L2 → research-core：memory.dir（BGP 研究方向）
  --patch dsh-research/patches/chain-fcbgp-experiment.yml   \   # L3 → research-experiment：experiment defaults
  --dump-config | grep -E '^# ==|research-|policy:'
```

- **L1 `chain-research-policy.yml`** → `research-operations`：整行替换时原样保留 `tools.enabled` /
  `policy.enabled` / `subagents.*`，只追加 `policy.extra`（2 条链层纪律，运行时 policy 10→12 条）。
- **L2 `chain-bgp-research.yml`** → `research-core`：`memory.dir`（`!!js process.env.DSH_HOME`
  运行时展开；plugin-core 只在 `dir/research-memory.json` 存在时落盘，属 provenance/落盘级配置）。
- **L3 `chain-fcbgp-experiment.yml`** → `research-experiment`：`config.defaults`（`env: sim` /
  `validator: rov+bgpsec` / `attackClass: as-set-injection` / `repetitions: 4`）。
  `plugin-experiment` 的 `runAutomatic` 把 `{ ...config.defaults, ...input }` 合并（显式输入优先），
  于是「恶意 ASPP 情形」战役只需传 claim 即可复现；`config.defaults` 不设则行为与阶段 6 完全一致。
- **后层赢**：argv 靠后的 `--patch` 覆盖靠前的（同 id 行）；`--dump-config` 逐行标注
  `# == <origin>, patched by <abs path>` 便于审计。

验证（`scripts/verify-patch-chain.sh`，一键跑通 dump 离线组合 + 运行时 + 单测）：

```sh
DSH_HOME=/tmp/dsh-home ./dsh-research/scripts/verify-patch-chain.sh   # 可选第 1 参 = SMOKE_PORT
```

`scripts/runtime-smoke.mjs` 额外支持 `SMOKE_OVERLAYS`（空白分隔、相对 cwd 的 `--patch` 清单）注入 boot 的
patch 栈，冒烟时断言 `policy rules: 12`（L1）与 `chain defaults-only campaign: OK | env: sim`（L3）。

### 阶段 8 · TRIZ 方法论接入（2026-10-14：假说生成 / 机制设计，✅ 已实现并自测）

> 需求（用户）：把 TRIZ（发明问题解决理论）加入 `dsh research`，用于**研究卡在「两难」时的
> 机制方向生成**。定位 = **程序性方法论 → 服务 + skill**（不是领域知识，领域知识走
> vocabulary.ts + WeKnora）；输出永远是**待核验假说**（confidence=0.5），接
> research_verify / research_campaign 闭环后才成为 claim。

- **知识基** `src/triz/data.ts`：40 发明原理（每条含路由安全提示 routingHint）、39 技术参数、
  路由参数中英别名表（`ROUTING_PARAMETER_ALIASES`：reliability/检测/收敛/…↔ 参数号）、
  **精选矛盾矩阵**（适配子集，非 39×39 全表转录）、启发式兜底原理表、启动原理集。
- **分析引擎** `src/triz/index.ts`：`resolveParameter`（中/英/别名/包含模糊）→
  `principlesFor`（curated-matrix 命中 / heuristic-fallback / unresolved 三态如实标注）→
  `separationFor`（空间/时间/条件/系统级分离）+ `evolutionFor`（技术进化法则视角）+
  `idealityFraming`（IFR 理想解 / 有害作用 / 可用资源 / 增益）+ `toHypotheses`
  （把候选原理翻译成机制方向假说，`type=Hypothesis, source=triz, confidence=0.5`）。
- **host 插件** `src/plugin-triz.ts`（exports `./triz`）：`ctx.provide('researchTriz', …)`，
  挂在 host 平面第 2 行（`research-core` 之后 / `research-director` 之前），使 host 由 5 → **6 行**。
- **工具** `research_triz`（第 14 个 `research_*`，仅 research 全量 + engineering 白名单可见）：
  入参 `problem / improving / worsening / record`（record 默认 true 写 artifact + episodic, kind=triz）；
  返回 `source / contradiction / candidates / separation / evolution / ideality / hypotheses / artifactId`。
  输入中英皆可（improving="检测" 或 "reliability"），别名表 + 模糊包含兜底。
- **skill** `skills/triz/SKILL.md`：TRIZ 假设生成工作流（矛盾 → 原理 → 假说 → 核验闭环），
  含「常见路由安全矛盾 ↔ 原理映射」表（检测率↔收敛延迟→预操作/反馈/向缓冲；安全强度↔复杂度→
  中介/合并/局部质量…）；纪律 = 别把 TRIZ 方向当新发现，先对照既有工作（FC-BGP/ASPA 已含
  「反向/自证」、RPKI 预验证是「预操作」）。
- **角色可见性**：research（14 全量）＋ engineering（白名单 +triz = 7，擅长机制设计）；
  paper / experiment / reviewer 不含 `research_triz`。

**验证（沙箱，`DSH_HOME=/tmp/dsh-home`）：**
- 单测 146/146 全绿（基线 137 + TRIZ 9：resolveParameter 中英别名 / curated-matrix 命中 /
  heuristic-fallback / unresolved / separation+evolution / toHypotheses / idealityFraming /
  createTrizService 端到端 / plugin-tools TOOL_NAMES + triz）。
- runtime-smoke → **SMOKE PASS**：`tools(14/14)=true`、`engineering:OK[7/7]`、
  `triz=true`（分析命中 curated-matrix：`#11 Beforehand cushioning / #10 Preliminary action /
  #23 Feedback`，生成 3 条 Hypothesis，`confidence=0.5`）。
- pack.sh → 产物含 `src/plugin-triz.js` + `src/triz/{data,index}.js` + `skills/triz/SKILL.md`，
  反证包内 0 个 `src/*.ts`（PACK OK）。

## npm 打包与一键部署（2026-10-09：TODO「一键部署」✅）


`@basil/dsh-research` 是**可 npm 安装的 bundle 包**：`package.json` 声明了
`dsh.bundle.patch`（3 片 bundle patch）与 7 个插件子路径 `exports`；用
`dsh plugin --profile <name> add` 安装后是 `node_modules` 下的**真实拷贝**，可被 dsh
运行时直接 import。**与 `deploy-profile.sh` 是两条互补路径，不存在替代关系**：

| 路径 | 安装方式 | 运行代码 | 用途 |
|---|---|---|---|
| dev symlink | `scripts/deploy-profile.sh` | 仓库 `src/*.ts`（改码即生效） | 开发 / 迭代 |
| npm 实装 | `dsh plugin --profile research add @basil/dsh-research`（或本地 tarball） | 包内编译后 `src/*.js` | 分发 / 一键部署 |

### ⚠️ 为什么必须编译后发（关键坑）

Node 24 的类型剥离 **不允许 `node_modules` 下的 `.ts`**
（`Stripping types is currently unsupported for files under node_modules`）。dev symlink 能跑
`.ts` 是因为 symlink realpath 逃逸出 node_modules；npm 实装是 node_modules 下的真实拷贝，
直接发 `src/*.ts` 会让 5 个 host 插件 `import` 失败（典型症状 `boot:researchCore NO`）。
因此 **不要直接 `npm pack` / `npm publish`**（`package.json` 的 `prepack` 已设防，会报错
提示走 `npm run pack`）；必须走 `npm run pack` 先构建可 boot 的 staging 树。

### 本地打包（无需发布）

```sh
./dsh-research/scripts/pack.sh                    # 单测 → 构建 staging(.js) → npm pack → dist/basil-dsh-research-<version>.tgz
OUT_DIR=/tmp/out ./dsh-research/scripts/pack.sh   # 自定义输出目录
VERIFY_INSTALL=1 ./dsh-research/scripts/pack.sh   # 打包后 dsh plugin 装进 scratch profile，校验组合树 + boot 探针
```

- 先跑单测（146/146）→ `scripts/build.mjs` 构建 staging：`src/*.ts` 类型剥离（
  `node:module.stripTypeScriptTypes`，零依赖）+ 相对 import 后缀 `.ts→.js`，并改写
  `main`/`exports` 指向 `.js`；然后 `npm pack` 以 staging 为包根出 tarball。
- 产物逐项校验：package.json / 3 片 bundle patch / 7 插件入口（`.js`）/ skills / patches /
  runtime-smoke 必在包内；**反证包内无 `src/*.ts`**。
- `files` 白名单只发运行时 + 验证所需：`src`（编译后）、`cordis.patch.yml`、`presets/`、
  `patches/`、`skills/`、`scripts/runtime-smoke.mjs`、`README.md`；单测 / 构建脚本不进包。

### 一键部署（发布版，从 registry 装）

```sh
dsh plugin --profile research add @basil/dsh-research
```

`dsh plugin --profile <name> add` 在 profile 目录（首次自动初始化）里跑 pnpm：把该包加入
`dependencies`，并把 `@basil/dsh-research` 追加进 `dsh.profile.bundles`，组合树即含
research-* 6 行 + preset-research。

### 一键部署（本地 tarball，发布前验证同构流程）

```sh
DSH_HOME=${DSH_HOME:-$HOME/.dsh} dsh plugin --profile research add ./dist/basil-dsh-research-<version>.tgz
DSH_HOME=${DSH_HOME:-$HOME/.dsh} dsh --profile research --dump-config | grep -E "research-(core|triz|director|experiment|writer|operations)|preset-research"
DSH_HOME=${DSH_HOME:-$HOME/.dsh} node dsh-research/scripts/boot-probe.mjs   # 期望 boot:researchCore YES
```

> 沙箱实测（2026-10-09）：tarball 经 `dsh plugin --profile research add` 装进 scratch profile
> → `--dump-config` 组合树含 research-* 6 行 + preset-research；boot-probe →
> `boot:researchCore YES (all 9 research services up)`（0 个 failed-to-import），dev symlink
> 路径的 runtime-smoke 不受影响（SMOKE PASS）。
>
> 注：`dsh plugin add` 初始化的 profile 是 dsh-base 之上的最小组合（无 Web 前端 / 模型
> overlay；npm registry 装包需网络）。需要完整 Web UI（web 前端 + local-interval-dsv4 模型
> overlay + 默认 preset=research）时，仍走仓库内 `scripts/deploy-profile.sh` 部署
> `profiles/<name>/` 模板。

## 验证（不依赖 dsh）

```sh
cd dsh-research
node --test "src/**/*.test.ts"   # core + memory + agents + triz + director + plugin + domain 全绿（146/146）
```

## 目录

- `src/domain/` — 阶段 8 命名定型 + 内置领域词汇（`dsh-routing-research` / 范围 / 执行器 / 关键词 / 词汇表）
- `src/core/` — 阶段 1 领域核心
- `src/memory/` — 阶段 2 五类记忆 + 门面/持久化
- `src/archive/` — research/ 产出一键归档（三文件 → Memory artifact store，art-1…art-13）
- `src/agents/` — 阶段 2 Literature / Reviewer / Experiment 三角色
- `src/research-director|research-loop|verification-loop|experiment-loop/` — 阶段 2 调度与三循环
- `src/writer/` — 阶段 3.6 论文/幻灯片生成（`paper.ts`/`slides.ts`）
- `src/roles/` `src/model-router/` `src/policy/` — 阶段 4 多角色 / 模型路由 / 纪律策略
- `src/real-subagent/` — 阶段 4c real subagent：web 会话 seam / persona / 本地回退 / RealSubagentAgent
- `src/autonomous/` — 阶段 4 一键科研流水线
- `src/jobs/` `src/scheduler/` `src/self-improve/` — 阶段 4 长任务 / 周期调度 / 自省改进
- `src/plugin-{core,triz,director,experiment,writer,operations}.ts` — 阶段 5/8 host 平面 6 插件入口
  （阶段 8 新增 `src/plugin-triz.ts`）
- `src/plugin-tools.ts` / `src/plugin-tools.test.ts` — 阶段 5 preset 平面插件：14 个
  `research_*` 工具（research 会话作用域，含 `research_triz`）；`src/plugin.test.ts` — 插件自检（内存假 ctx）
- `src/plugin.ts` — 兼容 re-export（不再承载实现；`main` / `exports` 指向 7 插件分片）
- `scripts/pack.sh` — 一键打包 `@basil/dsh-research` 为**可 boot** 的 npm tarball（单测 → `build.mjs` 构建 staging → npm pack → 产物校验；`VERIFY_INSTALL=1` 时再用 `dsh plugin add` 安装 + boot 验证）
- `scripts/build.mjs` — 为发行包构建 staging：`src/*.ts` 类型剥离（`node:module.stripTypeScriptTypes`，零依赖）+ 相对 import `.ts→.js` + 改写 staging `package.json`（`main`/`exports` 指向 `.js`）
- `scripts/boot-probe.mjs` — 最小 boot 探针：验证 profile 能 boot 且 researchCore 就绪（专测 npm 实装包，能识别 `.ts` 缺陷导致的 `failed to import`）
- `scripts/deploy-profile.sh` — 把任意 profile（默认 research，可传名称）模板部署到 `$DSH_HOME`
- `scripts/archive-research.mjs` — 归档 `research/` 三文件 → Memory artifact store（art-1…art-13；`--check` 回读断言，`--dir`/`RESEARCH_MEMORY_DIR` 指定落盘目录）
- `scripts/runtime-smoke.mjs` — in-dsh 运行时冒烟（preset 作用域工具断言 + standard=0 反证 + 角色预设断言；`SMOKE_OVERLAYS` 注入 `--patch` 链）
- `scripts/verify-patch-chain.sh` — `--patch` 组合链一键验证（dump 离线组合 + 后层赢 + 运行时 + 单测）
- `cordis.patch.yml` / `presets/research.patch.yml` / `presets/roles.patch.yml` — bundle patch 分片（host 6 行 + preset-research + 4 角色 preset）
- `patches/` — 组合链覆盖层（`chain-research-policy.yml` / `chain-bgp-research.yml` /
  `chain-fcbgp-experiment.yml`）；旧空占位（research-tools / research-policy / research-memory）已随阶段 5 删除——policy / 模型注入改走 `cordis.patch.yml` + 插件行
- `skills/` — 程序性 skill：experiment / paper-review / triz（阶段 2+ / 阶段 8；领域知识 2026-10-10 起走 vocabulary.ts + docs/domain-knowledge-notes.md + WeKnora，不再入 skill 目录）
