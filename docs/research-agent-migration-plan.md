# research-agent-migration-plan.md — Research Agent OS 迁移计划

> 迁移计划是 `prompts/dsh.md` 原始 15 项产出的 **13. Migration plan**，是阶段 0 三件套之一：
> `research-agent-architecture.md`（时序 + 装配 + 迁移摘要 + 风险登记册）/
> `research-agent-data-model.md`（数据）/ **本文件（迁移）**。
>
> 本文件把 `research-agent-architecture.md` §7 的"可执行摘要"展开为可执行的完整计划：
> **起点 → 终点 → 分阶段迁移（状态 + 交付物 + 验收门禁）→ 工具链与工程纪律 →
> 数据迁移与证据保全 → 回滚与隔离 → 迁移特有风险 → 验收总纲**。
> 只描述迁移决策与路径，不重复架构细节（见 architecture）与对象字段（见 data-model）。

---

## 0. TL;DR

**迁移目标**：把"一个通用 Coding Agent + 一个旧 Python 科研栈"迁移为
**在 DeepSeek Harness（dsh）之上运行的 Research Agent OS**——领域专用科研 Agent，
面向域间路由安全（BGP / RPKI / BGPsec / ASPA / VRO / CRC / FC-BGP），
一条指令跑通「检索 → 阅读 → 假设 → 实验 → 验证 → 反证 → 论文/报告/图表」。

**迁移的边界（不迁移什么）**：`deepseek-harness/`（上游）是只读运行时，**零改动**；
模型是 provider 不是 agent 本体。我们的成果 = **profile + bundle（`@basil/dsh-research`）+
少量插件 + skills**，全部叠加在 dsh 公开 seam 之上。

**三条铁律（贯穿全部阶段）**：

1. **不 fork / 不大规模修改 DeepSeek Harness**；代码不进 `deepseek-harness/`。
2. **永远不先改基础设施**：agent-loop / session / llm / tool registry / Cordis
   （`packages/core|llm|session|tools|sandbox`）。
3. **Research Loop 与 Engineering Loop 分开**（`AGENTS.md` §5），两类交付物分开验证。

**迁移节奏**：阶段 0 "先分析后编码" → 阶段 1–4 已落地（MVI → 长大）→ 阶段 5 preset
重构（规划中）→ 收尾/并行/在研清单。每个阶段自带独立验收门禁，上一阶段全绿才进入
下一阶段。

---

## 1. 起点盘存（迁移前现状，2026-10-08 前）

### 1.1 旧栈构成（已移除）

| 组件 | 说明 | 处置 |
|---|---|---|
| `src/research_agent/` | 旧 Python 科研智能体（planning / evolve / memory / tools / debate / harness 六能力区） | **2026-10-08 整棵移除**（`8fddf37`），不逐文件迁移 |
| `pyproject.toml` / `config.yaml` / `requirements/` | 旧 Python 配置与依赖 | 同上，一并移除 |

**处置原则（避免双栈并存）**：不迁移的旧能力**不进新树**，旧 Python 栈整体移除而非
共存——避免 "两套记忆、两套工具、两套循环" 的维护成本。旧能力 → 新落点按能力语义
对应（迁移时按"改造而非搬运"理解，旧代码未做逐行移植）：

| 旧能力区 | 新落点（dsh-research） |
|---|---|
| planning | `ResearchDirector` + `ResearchGoal` + 任务 DAG（`src/research-director/`、`src/core/`） |
| memory | 五类 Research Memory（`src/memory/`，TS 重写 + `research-memory.json` 持久化） |
| tools | 13 个 `research_*` 工具（`src/plugin.ts`，挂在 web 会话） |
| harness | DeepSeek Harness = runtime（只读上游，本仓库 `deepseek-harness/` submodule） |
| debate | `Reviewer Agent` + Verification Loop（`src/agents/reviewer.ts`、`src/core/verification.ts`） |
| evolve | 阶段 4b `SelfImprover`（`src/self-improve/`，reflect → 改进建议） |

### 1.2 运行时基线

- **dsh 运行时**：npm 全局 `dsh v0.2.0-rc.2`（`$DSH_HOME/profiles`，沙箱内
  `DSH_HOME=/tmp/dsh-home`）。
- **上游 submodule**：`deepseek-harness/` pin `5badb15009`（dsh-v0.2.1-alpha.1），只读。
- **合并进上游的方式**：`git -C deepseek-harness fetch origin && git -C deepseek-harness
  checkout origin/v0.2.1-alpha.1 && git add deepseek-harness && git commit`（或
  `git submodule update --remote`）。

### 1.3 迁移前的核心矛盾

1. **模型说过的 ≠ 事实**：科研 Agent 最严重问题是"把合理误认为正确" → 需要
   Claim / Evidence / Verification 的科学控制面（阶段 1 解决）。
2. **旧栈与运行时强耦合**：旧 Python 栈自封装 harness，升级/换底座成本高 →
   dsh 的 everything-is-a-plugin + 三黄金规则解耦（阶段 0 解决）。
3. **一次做完会死循环**：dsh 是 developer preview，直接在巨物上硬改会陷入
   "追着上游改" → "先分析后编码"（阶段 0）再逐阶段小步 + 门禁（阶段 1–5）。

---

## 2. 目标状态（迁移终点）

### 2.1 分层目标架构

```
Research Agent OS
  Research Director        Goal → Plan → Execute → Verify → Reflect → Continue
  Research Knowledge Layer Claims | Evidence | Hypothesis | Sources | Artifacts
  Agent Layer              Literature | Protocol | Engineer | Experiment | Reviewer
  Execution Layer          Shell | Browser | MCP | FRR | VPP | Docker | SSH | Git
  Harness Layer            Session | Agent Loop | Tools | Skills | Sandbox | Jobs
                           | Storage | Subagent | Context | LLM | Schedule
  Model Layer              DeepSeek | Qwen | OpenAI-compatible | Local LLM（provider-neutral）
```

### 2.2 Profile 交付形态（阶段性递进）

```text
阶段 1–4.5 已到达：dsh research == base + web-app + @basil/dsh-research
  （web 会话内与 13 个 research_* 工具 + 11 个服务交互）

阶段 5 规划：dsh-routing-research 形态——preset-research（Research Agent 本体）
  + 6 个职责单一插件；research_* 只出现在 research 会话；skills 真正挂载

命名定型（2026-10-09）：Profile 定型名称 = dsh-routing-research（域间路由安全研究专用），
  操作命令仍用 dsh research（== dsh --profile research）；领域词汇（范围 BGP / RPKI /
  BGPsec / ASPA / VRO / CRC / FC-BGP + 执行器 FRR / VPP）内置在
  src/domain/vocabulary.ts（唯一口径来源，供 persona / preset / research_search 种子检索 /
  researchCore.domain 服务引用）

远期：多 Profile（research / paper / experiment / engineering / reviewer）
  共享 dsh-base + dsh-research-core + 共享 research storage（非"超级 Agent"）
```

### 2.3 迁移完成的最终验收口径

- **Phase 1–4.5**：核心六件 + 五类记忆 + 三角色 + Director + Executors + 自动实验 +
  统计 + writer + roles/model-router + autonomous + jobs/scheduler/self-improve + web 前端。
- **Phase 4 收尾**：16c real subagent、多 Profile、`--patch` 链、npm 一键部署、报告跟进。
- **Phase 5**：preset-research + 6 插件重构落地；SMOKE PASS 且 standard 会话无 research_*。
- **全部完成**：`dsh research`（web 会话）一条指令跑完整科研流水线，且阶段 4/5 + 报告跟进
  全部关闭。

---

## 3. 分阶段迁移（核心）

> 状态：`✅` = 已落地；`⏳` = 未开始（见对应 TODO 条目）。验收门禁分两类——
> **单测**（`node --test`，不依赖 dsh）与 **smoke**（`runtime-smoke.mjs`，依赖 dsh
> 组合树），二者互为安全网（详见 §4.4）。

### 阶段 0 · 架构迁移分析（✅ 2026-10-09）

| 项 | 内容 |
|---|---|
| 迁移内容 | "先分析后编码"：完成 15 项产出 → 三篇文档 |
| 交付物 | `docs/research-agent-architecture.md`（时序/装配/迁移摘要/风险登记册）+
  `docs/research-agent-data-model.md`（数据）+ **`docs/research-agent-migration-plan.md`（本文）** |
| 验收门禁 | 三黄金规则 + seam 表 + 15 项产出覆盖；另运行 `dsh --profile web --dump-config` 留存基线 |

### 阶段 1 · 核心六件 + 插件挂载（✅ 2026-10-08）

| 项 | 内容 |
|---|---|
| 迁移内容 | ResearchGoal / 任务 DAG / Claim / Evidence / Verification Loop / Artifact Store 六件纯 TS（`src/core/`）+ Cordis 插件（`researchCore` + `research_verify`/`research_record`） |
| 交付物 | `src/core/`（goal / dag / claim / evidence / verification / artifact）+ `src/plugin.ts` |
| 验收门禁 | `node --test` 全绿 + runtime-smoke **SMOKE PASS**（2 工具，BGP 冒烟 verdict: verified）；`--dump-config` 含 `dsh-research-core` 行 |
| 提交 | `e09c8c1` / `5225704` / `12d9ed4` |

### 阶段 2 · 五类记忆 + 三角色 Agent + Director + 三条循环（✅ 2026-10-08）

| 项 | 内容 |
|---|---|
| 迁移内容 | Semantic / Episodic / Artifact / Hypothesis / Evidence 五类记忆（`src/memory/`）+
  Literature / Reviewer / Experiment 三角色（`src/agents/`）+ Director + research/verification/experiment 三循环 |
| 交付物 | `src/memory/` `src/agents/` `src/research-director|research-loop|verification-loop|experiment-loop/` |
| 验收门禁 | 单测全绿 + SMOKE PASS（4 服务 + 5 工具：research_verify / research_record / research_search / research_review / research_experiment） |
| 提交 | `40f807e` / `f9532e3` |

> **踩坑固化（全阶段适用）**：Node 24 类型剥离 strip-only——不支持类构造器参数属性、
> 不支持 `import { type X }` 内联类型修饰；Cordis 读 `ctx.tools` 必须先
> `export const inject = ['tools']`（见 architecture §9.3 R2）。

### 阶段 3 · Executors + 自动实验 + 统计口径（✅ 2026-10-08）

| 项 | 内容 |
|---|---|
| 迁移内容 | 四口径统计（detection_rate / false_positive_rate / convergence_time / verification_latency）、
  `Topology` 抽象（`RouteEngineSim` 确定性模拟 + FRR/VPP 守护进程适配器/回退）、
  `TopologyExecutor`、`runAutomaticExperiment` / `runCampaign` 自动流水线 |
| 交付物 | `src/experiment/`（stats / topology / executors / runner）+ `researchExperiment` 服务 + `research_campaign` 工具 |
| 验收门禁 | **27/27** 单测 + SMOKE PASS（5 服务 + 6 工具 + campaign verdict verified） |
| 提交 | `634dbc6` |

> **沙箱约束约定（迁移期关键决策）**：沙箱无 FRR/VPP/docker 二进制 → 默认执行源 =
> `RouteEngineSim`（`data.simulated=true` 如实标记）；FRR/VPP 适配器在目标机安装二进制后
> 自动接管（`available` 探测）。**模拟数据不冒充真实实验**（Policy 5/6）。

### 阶段 4 · 自治化（✅ 2026-10-08）

| 子阶段 | 迁移内容 | 交付物 | 验收门禁 |
|---|---|---|---|
| 4a | 多角色注册表 + 角色级模型路由 + 一键科研流水线 + 写作（paper / slides） | `src/roles/` `src/model-router/` `src/autonomous/` `src/writer/` | 69/69（与 4b 合计）+ 语义自测（ROV verify / path-manipulation reject：ROV ≈0.79 verified、path-m 操纵 ≈0.33 rejected） |
| 4b | 长任务 + 周期调度 + 自省改进 | `src/jobs/` `src/scheduler/` `src/self-improve/` | **69/69 单测 + SMOKE PASS**（11 服务 + 13/13 工具） |

- 提交：`fbb389d`（4a）→ `574e051`（4b）。
- 4a 说明：模型路由默认 `local-interval-dsv4/dsv4flash`（与本机 web profile 两层 overlay
  对齐），保持 provider-neutral，"一个模型 active、随时切换"；写作产出由
  `src/writer/paper.ts`（摘要 + 6 章节 + 附录 A 证据追溯）与 `src/writer/slides.ts`
  （8 页 Marp 汇报）生成。

### 阶段 4.5 · 前端 headless → web（✅ 2026-10-09）

| 项 | 内容 |
|---|---|
| 迁移内容 | profile bundle 前端基座由 `@deepseek-ai/dsh-headless` 换成 `@deepseek-ai/dsh-web-app` |
| 交付物 | `profiles/research/package.json`（bundle = base + web-app + dsh-research）+ `cordis.patch.yml`（web 同款三层 overlay） |
| 验收门禁 | SMOKE PASS（services 11 + tools 13/13；boot 出 `dsh web: http://127.0.0.1:3080/`）；`--dump-config` 含 web-startup/webserver 无 headless |
| 行为变更 | `dsh research "<task>"` 位置参数任务**不再支持**；科研交互（research_autonomous / research_campaign 等）在 web 会话内完成 |

### 阶段 4 收尾 ·（⏳ 未完成，见 TODO）

- **16c. real subagent 实挂 dsh 模型层**（web 会话 seam）：把 role→agent 接到真实 LLM
  回合，做完才真正 multi-agent；模型路由已就绪，仅差这一步。
- **真机浏览器端到端**：用户在自己终端
  `DSH_HOME="$HOME/.dsh" ./dsh-research/scripts/deploy-profile.sh && dsh research`
  启动 Web UI，在 web 会话里实测 research_autonomous / research_campaign（沙箱无法开浏览器）。

### 阶段 5 · Agent Preset + 插件化重构（⏳ 2026-10-09 规划）

> 背景：当前 `@basil/dsh-research` = 一个 npm 包同时扮演 bundle + 一个巨型插件
> （11 服务 + 13 工具全在 host 平面），与 dsh web 基座「模型可见面全部进 agent preset」
> 的现行架构错位：research_* 工具对所有 preset 会话可见、无法按会话裁剪；领域 skill
> 从未挂进运行时。
> **目标**：把 research 包装为 `preset-research`（Research Agent 本体）+ 多个职责单一插件；
> 工具只在 research 会话出现；skill 经 `skill-filesystem(customSkillDirs)` 真正挂载。

| 步骤 | 迁移内容 | 验收门禁 |
|---|---|---|
| A · bundle 分片（纯声明） | `dsh.bundle.patch` 单文件 → 数组（cordis.patch.yml + presets/research.patch.yml）；`exports` 显式子路径（./core ./director ./experiment ./writer ./operations ./tools）；host 平面 5 行（research-core/director/experiment/writer/operations）替换 dsh-research-core；新建 presets/research.patch.yml（preset-research：persona + research-tools + skill-filesystem + tool-skill + standard 工具集）；删除/标注弃用 `patches/research-agent.yml` | `--dump-config` 出现 research-* 5 行 + preset-research |
| B · 拆插件（逻辑搬移，语义零变化） | 从 `src/plugin.ts` 抽 5 个 host 插件 `src/plugin-{core,director,experiment,writer,operations}.ts`（service 名、工具 schema 不动，host 行顺序 = 依赖顺序）+ `src/plugin-tools.ts`（`inject ['tools']`，13 个 research_* 工具原样保留，注册进 preset 作用域）；`src/plugin.ts` 降级为 re-export | 14 个单测全绿 |
| C · profile overlay | `profiles/research/cordis.patch.yml` 新增 `agent-preset-registry`（`config.default: research`，新会话默认 Research Agent；模型 overlay 保留） | 新会话默认 preset=research |
| D · 冒烟 / 验证改造 | runtime-smoke 工具断言改为解析 preset-research 组成；追加断言 standard 会话不含 research_*（证明 always-on 污染已消除） | SMOKE PASS + standard 无 research_* + `--dump-config` 5 行 + preset |
| E · 文档同步 | `dsh-research/README.md` / `profiles/README.md` / `AGENTS.md`：单行 dsh-research-core → preset-research + 6 插件；记录「默认 preset=research」「research_* 只在 research 会话出现」 | 文档与 dump-config 一致 |

### 并行 · Profile / 打包缺口（⏳）

- 多 Profile：目前仅 `profiles/research/`；未建 `paper` / `experiment` / `engineering` /
  `reviewer`（共享 research 能力；阶段 5 的 preset 粒度可被多 Profile 复用）。
- `--patch` 组合链验证：base → research policy → bgp research → experiment-specific patch。
- 命名定型 `dsh-routing-research`，内置领域词汇（README/脚本仍用 dsh research）。
- 一键部署：打包 `@basil/dsh-research`（npm）→
  `dsh plugin --profile research add @basil/dsh-research`（目前靠 deploy-profile.sh 本地 symlink）。
- 删除空占位 `patches/research-tools | policy | memory.yml`（随阶段 5 一并清理）。

### 在研 · RPKI+BGPsec 安全缺口报告跟进（⏳）

- 归档：`research/` 三文件写回 Memory artifact store（报告自标 art-1…art-13）；
  `research/` 于 2026-10-09 加入 `.gitignore`，**不再 git add**。
- 修复 `research_campaign` 的 `attackClass` 透传缺陷（art-11）：`runAutomaticExperiment`
  构造默认 TopologyExecutor 时未传 `attack: opts.topologyConfig?.attack`
  （`src/experiment/runner.ts`、`executors.ts` 的 `attack ?? inferAttack`），TO fallback 到
  `inferAttack(plan.scenario)` 覆盖显式 attackClass；修复 = 显式透传 attack + 补测试。
- 真实网元验证：目标机安装 FRR（bgpd + RTR）+ BGPsec 后，`research_campaign env=frr`
  复测同一 4 攻击 × 4 策略矩阵；`executors.ts` 的 `simulated: true` 硬编码待真实引擎接入后改写。
- V4/V5 条件性 disputed 参数化验证（2026-10-09 完成）：`RouteEngineSim` 新增
  `coverage`/`deployment` 两参数（V4=ROA 覆盖占比、V5=BGPsec 部署占比，链完整概率
  `deployment^pathLen`），`research/sim-grid.ts` 扩展为 120 格（基线 16 + coverage 56 +
  deployment 48），联网锚点（NIST ≈91.4%、BGPsec ≈0）代入端点，V4/V5 升级为 verified（条件性），
  art-12 全文归档。
- 仍在跟进：联网测量 / ASPA 场景（双 I-D：`draft-ietf-sidrops-aspa-{verification,profile}`，未 RFC 化）/ FRR·VPP 实时指标采集（vtysh/vppctl）
  （详见 TODO「在研」节）。

---

## 4. 迁移工具链与工程纪律

### 4.1 上游零改动（升级流程）

```bash
cd deepseek-harness && git fetch origin && git pull --ff-only
pnpm install && pnpm run build                 # 上游自己的门禁
git -C deepseek-harness status                 # 必须永远干净
```

### 4.2 profile 部署与开发期加载

- **部署**：`./dsh-research/scripts/deploy-profile.sh` 把 `package.json` + `cordis.patch.yml`
  复制进 `$DSH_HOME/profiles/research/`，并把仓库 `dsh-research` **symlink** 到
  `$DSH_HOME/profiles/research/node_modules/@basil/`。
- **two-anchor 解析**（安装包优先、profile 目录其次）→ symlink 即生效，改 `dsh-research/`
  免重装；漏 symlink 的表现是"工具没出现"而非报错（architecture §9.3 R5）。

### 4.3 组合核对（迁移每一步必做）

```bash
DSH_HOME=/tmp/dsh-home dsh --profile research --dump-config        # 插件树 diff
DSH_HOME=/tmp/dsh-home dsh --profile research --dump-config-schema # schema diff
```

patch 按 **id** 整行替换 config（不合并）——自研 bundle 必须"自己重述整行"，
覆盖任何内置行都不需要改源码（architecture §9.3 R3/R5 教训）。

### 4.4 回归安全网（两层防线）

- **单元测试**（不依赖 dsh，锁领域层）：`cd dsh-research && node --test "src/**/*.test.ts"`
  → 当前 **69/69 全绿**。
- **运行时冒烟**（依赖 dsh 组合树，锁 seam）：部署后
  `DSH_HOME=/tmp/dsh-home node dsh-research/scripts/runtime-smoke.mjs` → **SMOKE PASS**
  （断言 11 服务 + 13/13 工具数，防"静默不激活"）。上游怎么变，先撞后者再查前者。

### 4.5 兼容性豁免与升级留痕

- 临时不兼容：`compatibility.json` / `dsh plugin version-exemptions` 记录豁免，
  不阻塞继续升级。
- 升级过程记 `docs/upgrade-notes.md`。

### 4.6 "小步 + 门禁"纪律

- 每个阶段在上一阶段全绿基础上叠加，各自带独立测试门禁。
- 不迁移的旧能力不进新树（旧 Python 栈整体移除而非并存）。
- 关键需求 ≥ 2 条实现路径（架构 §4.1-5），实验包只作可替换 option。

---

## 5. 数据迁移与证据链保全

> 目标：迁移（升级 / 换 profile / 回滚）**不丢证据链**。

### 5.1 记忆快照迁移

- `persistMemory()` 把五类记忆 + ArtifactStore 快照成 `<dir>/research-memory.json`；
  `loadMemoryInto()` 读回。快照**可在新旧 profile 间迁移**——迁移/回滚时复制该文件即可。
- **现状缺口（如实标注）**：插件只接线了启动侧 `loadMemoryInto()`；`persistMemory()`
  尚无 shutdown/定时 flush 钩子，落盘是显式触发（"载入可开、落盘待接"，见 architecture §6.4）。
  迁移计划包含：后续补卸载钩子/定时 flush，保证研究记忆跨会话自动保全。

### 5.2 Artifact 证据链

- 实验 artifact 一律绑定 `claimId`（`trace(claimId)` 可回放）并落 `research/`；
  迁移不丢证据链的判据 = `claim → experiment → artifact → verdict` 可完整追溯
  （论文附录 A）。
- `research/` 已于 2026-10-09 加入 `.gitignore`，不再入 git；归档走 Memory artifact store
  —— `scripts/archive-research.mjs` 把三文件（报告 md / sim-grid-results.json / sim-grid.ts）
  写回 ArtifactStore 并 persistMemory 落盘（默认 `storage/research/`，gitignore），
  产出与报告自标一致的 **art-1…art-13**：art-1…art-10 = §4 核验表 V1…V10（result，
  claimId=V<n>）、art-11 = §6 基建修复 note（attackClass 未透传）、art-12 = 网格结果全文
  （result，meta 附驱动源 sim-grid.ts）、art-13 = 报告全文（report）。`--check` 回读断言；
  把落盘目录配到 research-core 的 `config.memory.dir` 即随 `dsh research` boot 载入
  （migration-plan §5.1「载入可开」）。测试：`src/archive/archive-research.test.ts`。

### 5.3 迁移中的数据一致性铁律

- 每条 claim 必须带 `source / evidence / confidence / verified / last_verified`
  （记忆层类型强制，见 data-model §0）。
- 实验/模拟数据如实标记（`simulated`、engine），禁止模拟冒充真实实验。

---

## 6. 回滚与隔离

### 6.1 结构性回滚保障

三黄金规则 ⇒ 任何时刻都可退回「只读上游 + 外部叠加」形态。回滚不动上游：

```text
回滚 = 撤销 profile 层：
  1) 重跑 deploy-profile.sh 还原 bundle 顺序 / cordis.patch.yml
  2) 或临时用 --patch 禁用 dsh-research-core / preset-research 行
  3) 数据上用 research-memory.json 快照恢复记忆
  4) 前端形态切换 = 改 profiles/research/package.json 的 bundles 一行
```

### 6.2 隔离边界（三块互不写文件）

| 块 | 内容 | 写权限 |
|---|---|---|
| ① 代码 | `dsh-research/`（领域层 + 插件 + skills） | 可写（本仓库） |
| ② 配置 | `$DSH_HOME/profiles`（组合层） | profile 部署写入，内容受 patch 规则约束 |
| ③ 上游 | `deepseek-harness/` submodule | **只读**（`git status` 永远干净） |

回滚任意一块不影响另外两块——这是"迁移失败可随时退回"的结构性保证。

---

## 7. 迁移特有风险

> 通用上游风险（R1–R8）见 `research-agent-architecture.md` §9 登记册；这里只列
> **迁移本身**引入的风险。

| ID | 风险 | 检测 | 缓解 |
|---|---|---|---|
| M1 | 旧 Python 栈移除后仍有脚本/文档引用旧路径 | `grep -rn "research_agent\|pyproject\|config.yaml" .`（文档层复查） | 移除时同步改写 README/AGENTS（`8fddf37` 已完成）；后续文档一律走新形态 |
| M2 | 数据迁移丢证据链（memory 快照 / artifact 未随迁移走） | 迁移后 `trace(claimId)` 回放冒烟 | 快照可 `loadMemoryInto`；artifact 绑 `claimId`；见 §5 |
| M3 | 前端/入口形态切换破坏既有用法（headless → web 已发生过一次） | 每次前端切换跑 `dsh research`（无位置参数）+ runtime-smoke | 前端形态封装在 profile `bundles` 一行，切换=改一行（architecture §9.3 R7） |
| M4 | 阶段 5 拆插件后工具"静默丢失"（host → preset 作用域迁移） | runtime-smoke 工具断言改为解析 preset-research 组成；追加 standard 会话无 research_* 断言 | 工具 schema/注册逻辑零变化，仅注册作用域平移；单测 + smoke 双网 |
| M5 | SIM → 真实网元替换时统计口径漂移 | FRR/VPP 接入后复测同一 4×4 矩阵，与 RouteEngineSim 先验对比 | `simulated`/engine 如实标记；统计口径统一四口径（阶段 3 固化） |
| M6 | 模型层默认 401（迁到新 profile 忘带 overlay） | 真机 `dsh research` 第一回合即暴露（已踩过 R6） | 两层 overlay（provider + agent-default-model）固化在 profile，见 `cordis.patch.yml` |

---

## 8. 验收总纲（迁移全程门禁汇总）

```bash
# 每阶段通用验收序列：
cd dsh-research && node --test "src/**/*.test.ts"            # 1) 领域层全绿（当前 69/69）
DSH_HOME=/tmp/dsh-home ./dsh-research/scripts/deploy-profile.sh
DSH_HOME=/tmp/dsh-home node dsh-research/scripts/runtime-smoke.mjs   # 2) smoke SMOKE PASS
DSH_HOME=/tmp/dsh-home dsh --profile research --dump-config          # 3) 组合树 diff（web + research 行）
# 行为验收（阶段 5 起）：
#   standard 会话工具目录不含 research_*（always-on 污染消除）
#   新会话默认 preset = research
```

| 里程碑 | 达成判据 |
|---|---|
| Phase 0 | 三件套文档齐备（architecture / data-model / migration-plan） |
| Phase 1 | 六件 + 插件挂载（2 工具）SMOKE PASS |
| Phase 2 | 五类记忆 + 三角色 + Director（5 工具）SMOKE PASS |
| Phase 3 | Executors + 自动实验 + 统计（6 工具）27/27 + SMOKE PASS |
| Phase 4 | 13 工具 + 11 服务 69/69 + SMOKE PASS（4a 语义自测 / 4b jobs·scheduler·self-improve） |
| Phase 4.5 | web 前端（services 11 + tools 13/13）SMOKE PASS + dump-config 无 headless |
| Phase 4 收尾 | 16c real subagent / 真机浏览器端到端 / 多 Profile / `--patch` 链 / npm 一键部署 / 报告跟进关闭 |
| Phase 5 | preset-research + 6 插件；SMOKE PASS 且 standard 会话无 research_* |
| 全部完成 | `dsh research` 一条指令跑完整科研流水线，阶段 4/5 + 报告跟进全关 |

---

## 9. 迁移时间线（TL;DR 一览）

```text
2026-10-08（前置）旧 Python 栈移除（8fddf37）→ dsh 只读 submodule 基线确立
2026-10-08 阶段0 三件套分析 → 阶段1 六件挂载 → 阶段2 记忆+三角色 →
          阶段3 Executors+自动实验 → 阶段4a/4b 自治化（roles/router/autonomous/jobs/scheduler/self-improve）
2026-10-09 阶段4.5 前端 headless→web → 阶段0 收尾（migration-plan 文档产出）
2026-10-09 规划 阶段5 preset-research 重构（A–E，见 §3）
待定       收尾 / 并行 / 在研清单（见 §3 与 TODO.md）
```

---

## 附录 · 与本仓库其他文档的关系

| 文档 | 回答的问题 | 本文件引用 |
|---|---|---|
| `research-agent-architecture.md` | 为什么能"不碰上游" / 时序与装配 / 风险登记册 R1–R8 | §4、§7 引用其 seam 表与 §9 |
| `research-agent-data-model.md` | 领域对象长什么样 / 状态机 / 持久化 | §5 引用其记忆与 artifact 格式 |
| **`research-agent-migration-plan.md`（本文）** | **从哪来 → 到哪去 → 分几步 → 怎么验证 → 怎么回滚** | — |
| `AGENTS.md` / `TODO.md` / `CHANGELOG.md` | 操作手册 / 未完成路线图 / 已完成记录 | 各阶段状态以 TODO/CHANGELOG 为准 |
