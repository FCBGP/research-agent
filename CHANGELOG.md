# CHANGELOG.md — Research Agent OS 演进记录

> 维护规则（详见 `AGENTS.md` §10.1 文档卫生）：
> - 每轮完成的 TODO 项在收尾时**整条移入本文件**，按日期分节，逐条保留
>   「做了什么 / 关键产物 / 提交号(SHA) / 测试与 SMOKE 数字」，保证可追溯。
> - 未发布（repo 内自证）阶段用日期小节；正式对外发布后再引入 `## [x.y.z]` 版本头。
> - **本文件只放「已完成」**；未完成项一律留在 `TODO.md`，两边不重复。

---

## 2026-10-10 · FC-BGP 概念修正 + 领域知识分层 + WeKnora 对接（6e2307f）

- **FC-BGP 概念修正**：确认 FC-BGP = **Forwarding Commitment BGP**（基于「转发承诺（Forwarding
  Commitment）」的 BGP 安全研究，IETF SIDR/IDR 工作项、草案阶段非 RFC；datatracker 多份
  slides / Progress Update 佐证），废弃旧「Function-Composed BGP（无人机组网）」定义。
  同步修正 `src/domain/vocabulary.ts` GLOSSARY 词条（aliases + def 双改）。
- **领域知识 ≠ Skill 分层**：bgp / rpki / bgpsec / fcbgp 4 张「参考速查」从
  `dsh-research/skills/` 迁出 → `docs/domain-knowledge-notes.md`（暂存归档：标注非权威、
  指向 RFC / 草案原始来源；FC-BGP 段落含修正后定义与出处清单）；skill 目录只保留程序性
  skill（experiment / paper-review）。
  同步：`pack.sh` REQUIRED（bgp/rpki → paper-review / experiment）、
  `presets/research.patch.yml` / `presets/roles.patch.yml` 注释、AGENTS.md §7（Skill 组织与
  领域知识分层）、README「领域知识分层」、dsh-research/README 措辞。
- **WeKnora 知识库对接（方案 → 落地 deploy 生命周期）**：调研官方插件
  `@wxg-prc-cpg/dsh-weknora`（npm v0.1.0，零运行时依赖、仅用 `ctx.tools.register` /
  `inject=['tools']`，与仓库 6 个 research 插件同类 seam），`dsh research` 可连
  http://10.2.165.201/api/v1（4 个只读工具：list / search / read / ask）。
  落地三件套（日后升级重跑 deploy 不再丢插件 / 不再手写 `$DSH_HOME` 侧配置）：
  - **A. `profiles/research/package.json`**：bundles + dependencies 声明
    `@wxg-prc-cpg/dsh-weknora`（与 `dsh plugin add` 写出的形状一致，幂等收敛）；
  - **B. `profiles/research/cordis.patch.yml`**：末尾追加 `- id: weknora` 配置行
    （baseUrl 钉死 10.2.165.201/api/v1、resourceUrls: public、knowledgeBaseIds: []、
    apiKey / tenantId 走 env，key 不进仓库）；
  - **C. `deploy-profile.sh`**：模板声明了但 node_modules 未装 → 自动
    `dsh plugin --profile <name> add @wxg-prc-cpg/dsh-weknora`
    （`DEPLOY_AUTO_PLUGINS=0` 关、只打印手动命令；已装则跳过；安装失败不阻断 deploy）。
  - **沙箱实证**（`/tmp/dsh-home*`）：① 插件已装 → profile overlay 整行覆盖插件自带
    env 默认行（dump-config 只留模板 config）；② 插件未装 → bundle 与配置行均被
    **非致命**丢弃（`skipping profile bundle ... cannot resolve` /
    `patch: entry "weknora" not found`，exit 0，不阻塞启动）→ 修正旧「不改模板以免
    boot 失败」的保守做法，配置行可长期留在模板；③ e2e：deploy 到全新 `$DSH_HOME`
    自动 pnpm 装 weknora、package.json 收敛为模板形状、`@basil/dsh-research` symlink 存活。
  - README「WeKnora 行动清单」改写：一键 deploy 全搞定 + 升级不丢 + 配置来源说明；
    排查 / 兼容性表照旧。真机建库 + 配 key + 验证 4 工具仍待用户（TODO「在研」）。
- 验证：`node --test "src/**/*.test.ts"` = **137/137 全绿**（词汇表改动不破坏既有断言）。

## 2026-10-09 · 命名定型 `dsh-routing-research` + 内置领域词汇（6e2307f）

- 命名定型：`dsh-research/src/domain/vocabulary.ts` 作唯一口径来源——`PRODUCT_NAME='dsh-routing-research'`、
  `COMMAND='dsh research'`、`PROFILE_FLAG='dsh --profile research'`、`PROFILE_NAME='research'`；
  README / 脚本仍用 `dsh research`（操作命令不变）。
- 内置领域词汇：`DOMAIN_SCOPE`（BGP / RPKI / BGPsec / ASPA / VRO / CRC / FC-BGP）+ `DOMAIN_EXECUTORS`
  （FRR / VPP）+ `DOMAIN_KEYWORDS`（15+ 检索种子词，research_search 无 query 兜底）+ `GLOSSARY`
  （9 词条，VRO/CRC 按范围代码）+ `describeDomain/scopeList/executorList/lookupTerm`。
- 运行时挂接：`plugin-core.ts` 提供服务 `researchCore.domain`（领域词汇单一口径）；
  `research_search` 缺省/空 query 用领域词汇兜底检索，返回 `seeded` 标记并写入输出 schema；
  `presets/research.patch.yml` persona / preset 描述改用定型名。
- 文档同步：README.md / dsh-research/README.md / profiles/README.md / AGENTS.md / src/README.md /
  docs/research-agent-migration-plan.md；`dsh-research/package.json` 与 `profiles/research/package.json`
  description 带上定型名。
- 验证：`node --test "src/**/*.test.ts"` = **93/93 全绿**（新增 src/domain 6 用例）；
  runtime-smoke **SMOKE PASS**（`domain=true` / `search=true`）；verify-patch-chain **CHAIN VERIFY PASS**。

## 2026-10-09 · 阶段 4b · jobs / scheduler / self-improve（`574e051`）

- 16a. 五角色注册表 + 任务分派表：`src/roles/`，覆盖六种 task kind。
- 16b. 角色级模型路由：`src/model-router/`，默认 `local-interval-dsv4/dsv4flash`，可角色级覆盖。
- 17. autonomous research loop：`src/autonomous/` buildGoal(5 任务 DAG) + runAutonomousResearch
  一键流水线（Director → 实验战役 → 验证折入 → Writer → 归档），插件 `research_autonomous`
  工具；ROV 对 prefix-hijack verified / path-manipulation rejected 两项语义自测。
- 18. long-running jobs：`src/jobs/` JobRunner
  （submit({kind:'research'|'campaign', title, run})→Job，同步/异步执行体，get / list / cancel
  仅未开始可取消，完成/失败归档 episodic + artifact；research_job 工具 + 7 自测用例）。
- 19. scheduled research：`src/scheduler/` nextOccurrence 纯函数（at ISO / daily HH:MM /
  everyMs）+ ResearchScheduler（可注入时钟；一次性 at 到期 enabled=false）；research_schedule
  工具 + 9 自测用例。
- 20. self-improvement：`src/self-improve/` SelfImprover，reflect()→ReflectionReport
  （at / summary / snapshot / observations[] / recommendations[]）；research_reflect 工具 + 3 自测用例。
- 阶段 4b 恢复绿：`node --test "src/**/*.test.ts"` = **69/69 全绿**；runtime-smoke **SMOKE PASS**
  （services 11 + tools 13/13：research_job / research_schedule / research_reflect 一致）。

## 2026-10-09 · 阶段 4.5 · Profile 前端：headless → 基于 web（`574e051` 等）

- `profiles/research/package.json`：`dsh.profile.bundles` 改为
  `["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@basil/dsh-research"]`
  （丢弃 headless 一次性 CLI，research 跑在 web 之上）。
- `profiles/research/cordis.patch.yml`：合并 web 同款 overlay——`ui-settings-general` +
  `llm-pi-ai`（provider `local-interval-dsv4`，credential-ref `LOCAL_INTERVAL_DSV4_API_KEY`）+
  `agent-default-model`（dsv4flash）。
- `dsh-research/scripts/deploy-profile.sh`：部署清单与 verify 行更新（base + web + dsh-research）。
- `dsh-research/scripts/runtime-smoke.mjs`：适配 web 基座（web startup 拒绝位置参数，只给
  `--no-open` 等 flag；SMOKE_PASS：boot 出 `dsh web: http://127.0.0.1:3080/`）。
- 组合树核实：`dsh --profile research --dump-config` 含 web-startup / webserver / web-runtime
  + dsh-research-core（无 headless-startup / headless-runner）。
- `dsh research` 在 web 之上可启动：沙箱实测 boot 出 Web UI URL，13/13 research 工具 +
  11 服务全挂载。

## 2026-10-08 · 模型路由落地（`455ff5e`）

- research profile 模型层接本地 interval DSV4 网关：`llm-pi-ai` provider
  `local-interval-dsv4`（openai-completions，baseURL `http://10.2.165.201:8232/v1`，key 走
  credential-ref `LOCAL_INTERVAL_DSV4_API_KEY`）+ `agent-default-model` 默认 `dsv4flash`；
  真机端到端：`dsh --profile research --json "RPKI 的作用?"` → dsv4flash 正确作答并输出
  final（`reason.kind: completed`）。
- `94bba87`：research profile 获得 headless one-shot 前端（阶段 3.5，后被阶段 4.5 web 化取代）。

## 2026-10-08 · 阶段 3 · Executors 与产出（`634dbc6`）

- 11. FRR/VPP executor：`src/experiment/topology.ts` RouteEngineSim（mulberry32 同 seed 可复现）
  + Frr/VppTopology 真实守护进程适配器/回退；`executors.ts` TopologyExecutor 实现 Executor 契约
  （缺失时 fallbackToSim 回退确定性模拟并如实标记 engine）。
- 12. automatic experiment：`runner.ts` runAutomaticExperiment / runCampaign 实现
  deploy → run(×repetitions) → collect → analyze → verify → archive，写回 episodic+artifact，
  插件 `research_campaign` 工具 + `researchExperiment` 服务。
- 13. statistical analysis：`experiment/stats.ts` 四口径均值 / 样本标准差 / 95%CI +
  summarizeDetection（effectiveScore = det.mean − fp.mean）；`metricsFor` 收敛四口径。
- 14. paper generation：`src/writer/paper.ts` 六章节 + 摘要 + 附录 A 证据追溯 + `research_paper` 工具。
- 15. PPT generation：`src/writer/slides.ts` 8 页 Marp 科研汇报 + `research_slides` 工具。

## 2026-10-08 · 阶段 2 · Agent 与 Memory（`40f807e` / `f9532e3`）

- 7. Research Memory：Semantic / Episodic / Artifact / Hypothesis / Evidence 五类（`src/memory/`，
  createMemory 门面 + persistMemory / loadMemoryInto 可选 JSON 落盘）。
- 8. Literature Agent：`src/agents/literature.ts` + 种子语料 `corpus.ts`（9 篇 RPKI/BGPsec 经典
  文献，LiteratureSource 可注入真实检索）。
- 9. Reviewer Agent：`src/agents/reviewer.ts` research-paper-review 8 步清单 → 评分 → 判定 + 建议。
- 10. Experiment Agent：`src/agents/experiment.ts` plan → executor → analyze（多重复统计）。
- Director + 三条循环：`src/research-director|research-loop|verification-loop|experiment-loop/`，
  Goal → 任务 DAG → 按角色分派 → 记忆写入 → 产出归档。
- 插件扩展：researchCore / researchMemory / researchAgents / researchDirector 服务 +
  research_verify / research_record / research_search / research_review / research_experiment 工具。

## 2026-10-08 · 阶段 1 · 核心六件 + 运行时挂载（`e09c8c1` / `5225704` / `12d9ed4`）

- 1. ResearchGoal（Objectives = hypothesis / tasks / evidence / experiments / results /
  verification / counterexamples / status）；2. ResearchTask DAG（`src/core/dag.ts`，按依赖已满足
  + 信息增益最高选节点）；3. ResearchClaim（Type ∈ {Fact, Hypothesis, Assumption, Result,
  Interpretation}）；4. ResearchEvidence；5. Verification Loop（Evidence Check / Counter Search /
  Experiment Test → verdict，`src/core/verification.ts`）；6. Artifact Store（`src/core/artifact-store.ts`）。
- 端到端冒烟：BGP 用例跑通 claim → 实验 → verdict → artifact（`src/core/core.test.ts`）。
- 运行时插件挂载：`src/plugin.ts`（researchCore + research_verify / research_record）in-dsh
  **SMOKE PASS**；bundle patch（`patches/research-agent.yml`）以行 `dsh-research-core` 插入组合树。

## 2026-10-08 · 阶段 0 · 架构迁移分析（`ee00fa9` / `f670fec` / `8fddf37`）

- 阶段 0 基线：vendored `deepseek-harness` 跑 `dsh --profile web --dump-config` 与
  `--dump-config-schema`（`docs/baseline/` 2026-10-08 瘦身删除，结论保留在
  `docs/research-agent-architecture.md`）。
- 产出 `docs/research-agent-architecture.md`（TL;DR 三黄金规则 + 结构保证 + 已验证挂载路径附录，
  含 capability map / reuse map / extension points / 禁改组件 / data model / 三条循环）。
- 现状盘点：旧 Python agent 栈（planning/evolve/memory/tools/debate/harness）2026-10-08 移除；
  Executor / Knowledge Plane 全部走 dsh bundle / skills 层。
- 仓库瘦身：`8fddf37` 重写 README，drop 旧 Python 栈，只保留 dsh research 上层叠加。

## 里程碑（已达成）

- Phase 1 完成 = ResearchGoal / DAG / Claim / Evidence / Verification Loop / Artifact Store
  + BGP 冒烟 + 运行时挂载（SMOKE PASS）
- Phase 2 完成 = 五类 Memory + Literature/Reviewer/Experiment 三角色 + Director/三循环
- Phase 3 完成 = Executors + 自动实验 + 统计 + paper/PPT 产出
- Phase 4a 完成 = writer / policy / roles / model-router / autonomous 一键流水线 + 端到端报告
- Phase 4b 完成 = jobs / scheduler / self-improve 三模块 + 插件三工具 + 69/69 单测绿 + SMOKE PASS
- Profile 前端 web 化 = headless 一次性 CLI → `@deepseek-ai/dsh-web-app` Web UI 基座，
  `dsh research` 跑在 web 之上

## 在研产出（已产出内容；跟进项见 TODO.md「在研」节）

- 2026-10-08 产出 `research/RPKI-BGPsec-security-gaps.md`（G1–G11 缺口清单 + 4×4 实验矩阵 +
  V1–V10 核验闭环）/ `research/sim-grid.ts`（4 攻击类 × 4 策略 × n=8 规范网格）/
  `research/sim-grid-results.json`（32 格数据）。
- 注：`research/` 于 2026-10-09 加入 `.gitignore`（与 `logs/` 一起），不再入库；
  后续归档走 Memory artifact store。
