# TODO.md — Research Agent OS 实施路线

> 由 `prompts/dsh.md` 梳理。分阶段推进：**先分析、后编码**；每项完成时勾选并附证据/产物路径。

## 阶段 0 · 架构迁移分析（先做，不改代码）

用 DSV4 Agent 先完成一次架构迁移分析，产出 3 份文档作为后续改造的唯一依据：

- [x] 在 vendored `deepseek-harness` 运行 `dsh --profile web --dump-config` 与 `dsh --profile web --dump-config-schema`，保存"机器实际启动的完整插件树"
- [ ] 产出 `docs/research-agent-architecture.md`，覆盖：
  - [ ] Harness capability map（能力地图）
  - [ ] Existing capability reuse map（现有能力复用地图）
  - [ ] Required extension points（需要的扩展点）
  - [ ] Components that must NOT be modified（禁止改动的组件清单）
  - [ ] New research-domain packages（新增科研包划分）
  - [ ] Data model（数据模型）
  - [ ] Agent lifecycle（Agent 生命周期）
  - [ ] Research loop / Verification loop / Experiment loop（三条循环）
  - [ ] Memory architecture / Artifact architecture（Memory 与 Artifact 架构）
  - [ ] Migration plan（迁移计划）
  - [ ] Minimal viable implementation（最小可行实现）
  - [ ] Risks caused by upstream Harness changes（上游变更风险）
- [ ] 产出 `docs/research-agent-data-model.md`
- [ ] 产出 `docs/research-agent-migration-plan.md`
- [ ] 现状盘点：现有 Python agent（`planning / evolve / memory / tools / debate / harness`）哪些可复用作 Executor / Knowledge Plane

## 阶段 1 · 核心六件（MVP，完成后即"已不是普通 Agent"）

- [ ] 1. **ResearchGoal**：Objectives 结构 = hypothesis / tasks / evidence / experiments / results / verification / counterexamples / status
- [ ] 2. **ResearchTask DAG**：不是 TODO list；按"依赖已满足 + 信息增益最高"选节点
- [ ] 3. **ResearchClaim**：Type ∈ {Fact, Hypothesis, Assumption, Result, Interpretation}；含 evidence / source / confidence / verificationStatus / counterEvidence / dependencies
- [ ] 4. **ResearchEvidence**：claim / source / evidence / confidence / verified / last_verified / related_claims
- [ ] 5. **Verification Loop**：Evidence Check / Counter Search / Experiment Test → verdict（verified / disputed / rejected）
- [ ] 6. **Artifact Store**：研究产出与实验档案统一存储、可追溯、可归档
- [ ] 端到端冒烟：以 BGP 用例跑通 "claim → 实验 → verdict → artifact" 的 MVP 流水线

## 阶段 2 · Agent 与 Memory

- [ ] 7. **Research Memory**：Semantic / Episodic / Artifact / Hypothesis / Evidence 五类
- [ ] 8. **Literature Agent**（RPKI/BGPsec 文献检索）
- [ ] 9. **Reviewer Agent**（按 research-paper-review 8 步：claims → citations → methodology → counterexamples → experiment → unsupported conclusions → confidence → report）
- [ ] 10. **Experiment Agent**（FRR / VPP 实验）

## 阶段 3 · Executors 与产出

- [ ] 11. **FRR/VPP executor**
- [ ] 12. **automatic experiment**：deploy → run → collect → analyze → verify → archive
- [ ] 13. **statistical analysis**：detection_rate / false_positive_rate / convergence_time / verification_latency 等指标，多次重复（repeat）统计
- [ ] 14. **paper generation**（论文生成）
- [ ] 15. **PPT generation**（图表 / 汇报生成）

## 阶段 4 · 自治化

- [ ] 16. **multi-agent**：角色化 subagent + 结构化 artifact 传递（非自然语言聊天）
- [ ] 17. **autonomous research loop**（自治科研循环）
- [ ] 18. **long-running jobs**（长时任务）
- [ ] 19. **scheduled research**（定时研究）
- [ ] 20. **self-improvement**（自我改进）

## 并行 · Profile / 打包（依托 Harness 原生机制）

- [ ] `research` Profile：`package.json`（`dsh.profile.bundles` = `@deepseek-ai/dsh-base` + `@your-org/dsh-research`）+ `cordis.patch.yml`
- [ ] `dsh-research` bundle：
  - [ ] `src/`: research-director / research-loop / verification-loop / experiment-loop / artifact-store
  - [ ] `patches/`: research-agent.yml / research-tools.yml / research-policy.yml / research-memory.yml
  - [ ] `skills/`: bgp / rpki / bgpsec / fcbgp / paper-review / experiment
- [ ] 多 Profile：`research` / `paper` / `experiment` / `engineering` / `reviewer`，共享 `dsh-research-core` + 共享 research storage
- [ ] **Research Agent Policy（10 条）固化为 profile 固有行为**
- [ ] `--patch` 组合：base profile → research policy → bgp research → experiment-specific patch（如 `--patch profiles/fcbgp-experiment.yml "验证恶意 ASPP 情形"`）
- [ ] 命名定型为 **`dsh-routing-research`**（域间路由安全专用），内置领域词汇：BGP / RPKI / BGPsec / ASPA / VRO / CRC / FC-BGP / FRR / VPP / IETF / CCSA / paper / experiment / review
- [ ] 一键部署：打包 `@basil/dsh-research` → `dsh plugin --profile research add @basil/dsh-research` → `dsh routing-research "…"`
- [ ] Model Router：planner / researcher / coder / reviewer 按角色配模型（DeepSeek / Qwen），保留"一个模型 active、随时切换"

## 里程碑定义

- **Phase 1 完成** = 具备 ResearchGoal / DAG / Claim / Evidence / Verification Loop / Artifact Store，MVP 可跑通 BGP 用例
- **全部完成** = `dsh routing-research "研究 RPKI+BGPsec 的安全缺口"` 一键跑完整科研流水线（检索 → 阅读 → 假设 → 实验 → 验证 → 反证 → 论文/PPT）

---

**第一阶段（现在就该做）：** 对照 `AGENTS.md` 第 2 节"禁止改动清单"，先完成阶段 0 的 dump-config 与 3 份设计文档，再据此排期阶段 1。
