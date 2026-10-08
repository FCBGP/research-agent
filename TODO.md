# TODO.md — Research Agent OS 实施路线

> 标识规则：未完成 = `- [ ]`，已完成 = `- [x]`，仅此两种，无其他标识。

## 阶段 0 · 架构迁移分析

- [x] 阶段 0 基线：vendored `deepseek-harness` 跑 `dsh --profile web --dump-config` 与
  `--dump-config-schema`，保存"机器实际启动的完整插件树"（`docs/baseline/` 在 2026-10-08 瘦身时
  已删除，结论保留在 `docs/research-agent-architecture.md`）
- [x] 产出 `docs/research-agent-architecture.md`（TL;DR 三黄金规则 + 结构保证 + 已验证挂载路径附录），
  含 Harness capability map / Existing capability reuse map / Required extension points /
  Components that must NOT be modified / New research-domain packages / Data model / Agent lifecycle /
  Research·Verification·Experiment 三条循环
- [x] 现状盘点：旧 Python agent 栈（planning / evolve / memory / tools / debate / harness）已于
  2026-10-08 移除；Executor / Knowledge Plane 全部走 dsh bundle / skills 层
- [ ] `docs/research-agent-architecture.md` 的 Memory / Artifact 架构、Migration plan、MVI、上游风险
  细分（顶层已覆盖，细分待补）
- [ ] 产出 `docs/research-agent-data-model.md`
- [ ] 产出 `docs/research-agent-migration-plan.md`

## 阶段 1 · 核心六件

- [x] 1. ResearchGoal：Objectives 结构 = hypothesis / tasks / evidence / experiments / results /
  verification / counterexamples / status
- [x] 2. ResearchTask DAG：按"依赖已满足 + 信息增益最高"选节点（`src/core/dag.ts`）
- [x] 3. ResearchClaim：Type ∈ {Fact, Hypothesis, Assumption, Result, Interpretation}；含 evidence /
  source / confidence / verificationStatus / counterEvidence / dependencies（`src/core/types.ts`）
- [x] 4. ResearchEvidence：claim / source / evidence / confidence / verified / last_verified
- [x] 5. Verification Loop：Evidence Check / Counter Search / Experiment Test → verdict
  （`src/core/verification.ts`）
- [x] 6. Artifact Store：统一存储、按 claim 追溯、可归档（`src/core/artifact-store.ts`）
- [x] 端到端冒烟：BGP 用例跑通 "claim → 实验 → verdict → artifact"（`src/core/core.test.ts`）
- [x] 运行时插件挂载：`src/plugin.ts`（researchCore + `research_verify` / `research_record`）
  in-dsh SMOKE PASS

## 阶段 2 · Agent 与 Memory

- [x] 7. Research Memory：Semantic / Episodic / Artifact / Hypothesis / Evidence 五类
  （`src/memory/`）
- [x] 8. Literature Agent（RPKI/BGPsec 文献检索）：`src/agents/literature.ts` + 种子语料
  `corpus.ts`（9 篇，可注入 source）
- [x] 9. Reviewer Agent（research-paper-review 8 步）：`src/agents/reviewer.ts`，8 步评分→判定+建议
- [x] 10. Experiment Agent（FRR / VPP 实验）：`src/agents/experiment.ts` plan→executor→analyze
  （真实 FRR/VPP 执行见"在研报告跟进"）

## 阶段 3 · Executors 与产出

- [x] 11. FRR/VPP executor（`src/experiment/topology.ts`：RouteEngineSim 确定性模拟 + Frr/VppTopology
  真实守护进程适配器/回退；`executors.ts` TopologyExecutor 实现 Executor 契约；缺失时
  fallbackToSim 回退确定性模拟并如实标记 engine）
- [x] 12. automatic experiment：`runner.ts` runAutomaticExperiment / runCampaign 实现
  deploy → run(×repetitions) → collect → analyze → verify → archive，写回 episodic+artifact，
  插件 `research_campaign` 工具 + `researchExperiment` 服务（attackClass 透传缺陷见"在研报告跟进"）
- [x] 13. statistical analysis：`experiment/stats.ts` 四口径均值 / 样本标准差 / 95%CI +
  summarizeDetection（effectiveScore = det.mean − fp.mean）；`metricsFor` 收敛四口径，多次重复统计
- [x] 14. paper generation：`src/writer/paper.ts` 六章节 + 摘要 + 附录 A 证据追溯 + 插件
  `research_paper` 工具
- [x] 15. PPT generation：`src/writer/slides.ts` 8 页 Marp 科研汇报 + 插件 `research_slides` 工具

## 阶段 4 · 自治化

- [x] 16a. 五角色注册表 + 任务分派表：`src/roles/`，覆盖六种 task kind
- [x] 16b. 角色级模型路由：`src/model-router/`，默认
  `local-interval-dsv4/dsv4flash`，可角色级覆盖
- [ ] 16c. real subagent 实挂 dsh 模型层（web 会话 seam）：把 role→agent 接到真实 LLM 回合，
  做完才真正 multi-agent；模型路由已就绪，仅差这一步
- [x] 17. autonomous research loop：`src/autonomous/` buildGoal(5 任务 DAG) +
  runAutonomousResearch 一键流水线（Director → 实验战役 → 验证折入 → Writer → 归档），
  插件 `research_autonomous` 工具；ROV 对 prefix-hijack verified / path-manipulation rejected
  两项语义自测
- [x] 18. long-running jobs：`src/jobs/` JobRunner 实现
  （`submit({kind:'research'|'campaign', title, run})→Job`，同步/异步执行体，get / list / cancel
  仅未开始可取消，完成/失败归档 episodic + artifact；research_job 工具 + 7 自测用例）
- [x] 19. scheduled research：`src/scheduler/` 实现
  （`nextOccurrence` 纯函数 at ISO / daily HH:MM / everyMs + `class ResearchScheduler({memory,
  runner})`；register / unregister / due / tick / get；可注入时钟；一次性 at 到期后
  `enabled=false`；research_schedule 工具 + 9 自测用例）
- [x] 20. self-improvement：`src/self-improve/` 实现
  （`class SelfImprover(memory)`，`reflect()→ReflectionReport{at, summary(含"改进建议"),
  snapshot{episodes, artifacts, hypotheses, evidence, unverified, jobs, scheduled}, observations[],
  recommendations[]}`，反思归档在快照之后；research_reflect 工具 + 3 自测用例）
- [x] 阶段 4b 恢复绿：`node --test "src/**/*.test.ts"` = 69/69 全绿；runtime-smoke
  SMOKE PASS（services 11 + tools 13/13：research_job / research_schedule / research_reflect 一致）

## 阶段 4.5 · Profile 前端：headless → 基于 web（2026-10-09）

- [x] `profiles/research/package.json`：`dsh.profile.bundles` 改为
  `["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@basil/dsh-research"]`
  （丢弃 headless 一次性 CLI，research 跑在 web 之上）
- [x] `profiles/research/cordis.patch.yml`：合并 web 同款 overlay——
  `ui-settings-general` + `llm-pi-ai`（provider `local-interval-dsv4`，credential-ref
  `LOCAL_INTERVAL_DSV4_API_KEY`）+ `agent-default-model`（dsv4flash）
- [x] `dsh-research/scripts/deploy-profile.sh`：部署清单与 verify 行更新（base + web + dsh-research）
- [x] `dsh-research/scripts/runtime-smoke.mjs`：适配 web 基座（web startup 拒绝位置参数，
  只给 `--no-open` 等 flag；SMOKE_PASS：boot 出 `dsh web: http://127.0.0.1:3080/`）
- [x] 组合树核实：`dsh --profile research --dump-config` 含 web-startup / webserver / web-runtime
  + dsh-research-core（无 headless-startup / headless-runner）
- [x] `dsh research`（即 `dsh --profile research`）在 web 之上可启动：沙箱实测 boot 出 Web UI URL，
  13/13 research 工具 + 11 服务全挂载
- [ ] 真机浏览器端到端：用户在自己终端
  `DSH_HOME="$HOME/.dsh" ./dsh-research/scripts/deploy-profile.sh && dsh research`
  启动 Web UI，在 web 会话里实测 research_autonomous / research_campaign（沙箱无法开浏览器）

## 并行 · Profile / 打包缺口

- [ ] 多 Profile：目前仅 `profiles/research/`；未建 `paper` / `experiment` / `engineering` /
  `reviewer`（共享 `dsh-research-core`）
- [ ] `--patch` 组合链验证：base → research policy → bgp research → experiment-specific patch
- [ ] 命名定型 `dsh-routing-research`，内置领域词汇（README/脚本仍用 dsh research）
- [ ] 一键部署：打包 `@basil/dsh-research`（npm）→
  `dsh plugin --profile research add @basil/dsh-research`（目前靠 deploy-profile.sh 本地 symlink）
- [ ] `patches/research-tools | policy | memory.yml` 接线：仍为空数组占位，policy 注入 profile
  patch 的 prompt seam 也待接

## 在研 · RPKI+BGPsec 安全缺口报告跟进（2026-10-08 已产出，`research/` 未提交）

- [x] 产出报告：`research/RPKI-BGPsec-security-gaps.md`（G1–G11 缺口清单 + 4×4 实验矩阵 +
  V1–V10 核验闭环）/ `research/sim-grid.ts`（4 攻击类 × 4 策略 × n=8 规范网格）/
  `research/sim-grid-results.json`（32 格数据）
- [ ] `research/` 三文件提交并归档：git add + 写回 Memory artifact store（报告自标 art-1…art-13）
- [ ] 修复 `research_campaign` 的 `attackClass` 透传缺陷（art-11）：`runAutomaticExperiment`
  构造默认 TopologyExecutor 时未传 `attack: opts.topologyConfig?.attack`，TO fallback 到
  `inferAttack(plan.scenario)` 覆盖显式 attackClass（`src/experiment/runner.ts:42`、
  `executors.ts:28-31`）；`research/sim-grid.ts` 因此绕过工具层直驱 RouteEngineSim；修复 = 显式
  透传 attack + 补测试
- [ ] 真实网元验证：目标机安装 FRR（bgpd + RTR）+ BGPsec 后，`research_campaign env=frr` 复测
  同一 4 攻击 × 4 策略矩阵，替换 RouteEngineSim 机制先验；`executors.ts` 的 `simulated: true`
  目前硬编码，接入真实引擎后应随 engine 改写
- [ ] 联网测量：补齐 ROA 覆盖 / ROV 强制落地 / BGPsec 部署占比真实观测，把 V7 / V8 / V9 从
  disputed（待外部验证的 Hypothesis）升级到 verified / rejected
- [ ] ASPA / RFC 9319：路径政策场景加入拓扑抽象（`experiment/topology.ts`），量测其对
  "授权泄密/原主作恶"（V10）的增量收益
- [ ] FRR / VPP 实时指标采集：vtysh / vppctl 解析实时 metrics；目前 Frr/VppTopology 只做二进制
  探测 + 渲染配置 + 回退 sim，无实时采样
- [ ] V4 / V5 条件性 disputed 的展开：V4（ROV 高效但受 NotFound/覆盖前提限制）、V5（BGPsec 高效
  但受部分部署降级限制）需把"覆盖假设"参数化进 sim 网格再验证

## 里程碑

- [x] Phase 1 完成 = ResearchGoal / DAG / Claim / Evidence / Verification Loop / Artifact Store
  + BGP 冒烟 + 运行时挂载（SMOKE PASS）
- [x] Phase 2 完成 = 五类 Memory + Literature/Reviewer/Experiment 三角色 + Director/三循环
- [x] Phase 3 完成 = Executors + 自动实验 + 统计 + paper/PPT 产出
- [x] Phase 4a 完成 = writer / policy / roles / model-router / autonomous 一键流水线 + 端到端报告
- [x] Phase 4b 完成 = jobs / scheduler / self-improve 三模块 ＋ 插件三工具（research_job /
  research_schedule / research_reflect）＋ 69/69 单测绿 ＋ SMOKE PASS
- [x] Profile 前端 web 化 = headless 一次性 CLI → `@deepseek-ai/dsh-web-app` Web UI 基座，
  `dsh research` 跑在 web 之上
- [ ] Phase 4 完成（收尾）= 仅剩 16c real subagent、多 Profile、`--patch` 链、npm 一键部署、
  报告跟进
- [ ] 全部完成 = `dsh research`（web 会话）一条指令跑完整科研流水线
  （RPKI+BGPsec 缺口 → 实验矩阵 → 核验 → 论文/幻灯片），且 4b + 报告跟进 + 多 Profile 全部关闭
