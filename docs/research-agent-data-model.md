# research-agent-data-model.md — Research Agent OS 数据模型

> 代码事实来源：`dsh-research/src/`（`core/`、`memory/`、`agents/`、`experiment/`、
> `research-director/`、`research-loop/`、`verification-loop/`、`experiment-loop/`、
> `roles/`、`model-router/`、`policy/`、`writer/`、`autonomous/`、`jobs/`、
> `scheduler/`、`self-improve/`、`plugin.ts`）。本文档只描述**已落地的对象 /
> 字段 / 状态机 / 关系 / 持久化格式**，不臆造未实现的语义。
>
> 与 `research-agent-architecture.md` 的分工：architecture 讲「时序 + 装配 +
> 迁移」（三黄金规则、profile/bundle/patch 分层、Memory/Artifact 架构、MVI、
> 风险登记册）；本文档讲「**数据**」——领域对象长什么样、字段语义、状态机、
> 对象之间怎么关联、如何持久化、运行时的服务/工具各自读写哪些对象。

---

## 0. TL;DR

- **一条证据链贯穿全部对象**：`ResearchClaim` 是中心，`claimId` 是全局外键；
  `ResearchClaim.dependencies[]` 与 `ResearchTask.produceClaims/consumesClaims`
  构成任务 DAG；所有产出统一进 `ArtifactStore`（`claimId` 可追溯）；五类记忆
  从不同侧面回答「我们知道什么 / 做过什么 / 产出过什么 / 在验证什么 / 证据是什么」。
- **三个状态机是核心**：`Verdict`（claim 终局）、`TaskStatus`（DAG 节点）、
  `HypothesisStatus`（假设生命周期）；阶段 4b 新增 `JobStatus` 与
  `ReviewVerdict`（审稿判定）。
- **同步迭代为纯内存**：`createMemory()` 零外部依赖；`persistMemory()` 把五类 +
  ArtifactStore 快照成 `research-memory.json`（`loadMemoryInto` 读回）。
- **类型即纪律**：`verified` 灯 / `verificationStatus` / `simulated` 标记被做成
  必填字段，把「不能把模型说过的当事实」「实验数据须如实标记」固化为数据结构。

---

## 1. 领域核心对象（`src/core/`）

### 1.1 基础枚举

| 类型 | 取值 | 说明 |
|---|---|---|
| `ClaimType` | `'Fact' \| 'Hypothesis' \| 'Assumption' \| 'Result' \| 'Interpretation'` | claim 的陈述类别，Policy 7 要求显式区分 |
| `Verdict` | `'verified' \| 'disputed' \| 'rejected' \| 'pending'` | claim 验证终局（§3.1） |
| `TaskStatus` | `'blocked' \| 'ready' \| 'running' \| 'done' \| 'failed'` | DAG 节点状态（§3.2） |

### 1.2 `ResearchGoal` — 顶层容器（一次科研目标，非单次任务）

```ts
interface ResearchGoal {
  id: string;
  hypothesis: string;          // 中心假设 / 研究问题
  tasks: ResearchTask[];       // 任务 DAG（§1.3）
  claims: ResearchClaim[];     // 全部 claim 的池
  experiments: ExperimentResult[];
  results: string[];           // 结论 artifact id 列表
  verification: string[];      // 验证记录
  counterexamples: string[];   // 反例 artifact id
  status: 'active' | 'done' | 'aborted';
}
```

- 承载 AGENTS.md §4 的 O1…O8 目标语义：每个 objective 的
  Hypothesis / Tasks / Evidence / Experiments / Results / Verification /
  Counterexamples / Status 分别映射到上表字段。
- `autonomous.buildGoal()` 是它的标准工厂：直接产出一个 5 任务 DAG
  （read → hypothesis → experiment → verify → write，`g-auto`）。

### 1.3 `ResearchTask` — DAG 节点（不是 TODO 条目）

```ts
interface ResearchTask {
  id: string;
  goal: string;                // 所属 goal id
  title: string;
  kind: 'read' | 'search' | 'hypothesis' | 'experiment' | 'verify' | 'write';
  produceClaims: string[];     // 该任务产出的 claim id（DAG 右出边）
  consumesClaims: string[];    // 依赖的 claim id（DAG 左入边）
  gain: number;                // 预估信息增益 0..1（调度排序键）
  status: TaskStatus;
}
```

- **DAG 语义**：`consumesClaims` 是依赖边；只有当「done」任务的
  `produceClaims` 覆盖了某项依赖，对应节点才由 `blocked` 解锁为 `ready`
  （`dag.ts::unlock`）。
- **调度策略** = 当前 `ready` 且依赖全部满足的节点中选 `gain` 最大者
  （`dag.ts::selectNext`）——即 AGENTS.md §4 的「依赖已满足 + 信息增益最高」。

### 1.4 `ResearchClaim` — 证据链中心（铁律第一链）

```ts
interface ResearchClaim {
  id: string;                  // c-<seq>（claim.ts 内 seq 递增）
  type: ClaimType;
  statement: string;
  evidence: ResearchEvidence[];        // 支持性证据
  counterEvidence: CounterEvidence[];  // 反证
  source: string;              // 来源（文献 / 实验 / 推理 / 用户 / unknown）
  confidence: number;          // 合成置信度 0..1（§4.2）
  verificationStatus: Verdict;
  dependencies: string[];      // 依赖的其他 claim id（构成验证 DAG）
  verdictRationale?: string;
}
```

### 1.5 `ResearchEvidence` / `CounterEvidence` — 证据与反证

```ts
interface ResearchEvidence {
  claim: string;            // 所支持的 claim id（写入时自动回填）
  source: string;           // 来源（文献 / 实验 / 推理）
  evidence: string;         // 证据内容（引用 / 数据 / 观测）
  confidence: number;       // 0..1
  verified: boolean;        // 复核灯（是否经过核验）
  lastVerified?: string;    // ISO
  relatedClaims: string[];
}

interface CounterEvidence {
  evidence: string;
  source: string;
  againstClaim: string;
  confidence: number;
}
```

### 1.6 `ExperimentResult` — 一次（或聚合一轮）实验产出

```ts
interface ExperimentResult {
  experiment: string;       // 实验名 / configFingerprint
  claim: string;            // 被验证的 claim id
  outcome: 'support' | 'refute' | 'inconclusive';
  data: Record<string, unknown>;   // 指标原始数据（四口径、engine、simulated 等）
  archivedAt: string;       // ISO
}
```

---

## 2. 对象关系（ER / 可追溯链）

```text
ResearchGoal (id)
   │ 1:N
   ▼
ResearchTask (id) ──consume/produce──▶ ResearchClaim (id)
   │ kind=experiment                          │ 1:N
   ▼                                         ▼
ExperimentResult (claim)              ResearchEvidence (claim)
   │ claim                                   │ ∧ 反证
   ▼                                        CounterEvidence
ArtifactStore.Artifact (claimId?) ◀── trace ─┘
   ▲
   └─ episodic / hypothesis / evidence 记忆（claimId 关联）
```

| 对象 A | 字段 | 指向对象 B | 语义 |
|---|---|---|---|
| `ResearchTask` | `consumesClaims[]` / `produceClaims[]` | `ResearchClaim.id` | DAG 依赖边 / 产出边 |
| `ResearchClaim` | `dependencies[]` | `ResearchClaim.id` | 验证 DAG（claim 间依赖） |
| `ResearchEvidence` | `claim` | `ResearchClaim.id` | 证据 → 被支撑的 claim |
| `CounterEvidence` | `againstClaim` | `ResearchClaim.id` | 反证 → 被攻击的 claim |
| `ExperimentResult` | `claim` | `ResearchClaim.id` | 实验 → 被验证 claim |
| `Artifact` | `claimId?` | `ResearchClaim.id` | 产出可追溯（论文附录 A 凭此回放证据链） |
| `Episode` / `EvidenceLedgerEntry` / `HypothesisEntry` | `claimId?` / `claimId` | `ResearchClaim.id` | 记忆侧关联 |
| `CampaignReport.artifacts[]` | — | `Artifact.id` | 战役归档产物 id 列表 |

**可追溯链（MVI 纵切面）**：

```text
ResearchClaim(Hypothesis)
  → research_verify（证据核验 / 反证 / 实验判定）
  → Campaign / Experiment（四口径统计）
  → Verdict（verified / disputed / rejected）
  → Artifact（result，绑定 claimId）
  → Episodic（verify 事件）+ 论文附录 A 逐条追溯
```

---

## 3. 状态机

### 3.1 `Verdict`（claim 验证终局）

```text
              ┌─ 实验 refute ───────────────▶ rejected（被证伪）
pending ──────┼─ 存在高置信反证(≥0.6) ──────▶ disputed（存疑）
              ├─ 无任何已核验证据 ──────────▶ disputed（证据不足）
              ├─ 证据核验 + 实验 support ───▶ verified（已核验）
              └─ 其余（实验 inconclusive）──▶ disputed（需进一步验证）
```

判定实现在 `verification.ts::runVerification`，优先级：`refute` 实验优先于
强反证，强反证优先于证据不足（§4.3）。

### 3.2 `TaskStatus`（DAG 节点生命周期）

```text
blocked ──(依赖 produceClaims 覆盖 consumesClaims)──▶ ready
ready ──(selectNext 选出、执行)──▶ running      # running 为保留位（本层未写）
                                                   │
                                                   ├─ 成功 ─▶ done（回收 produceClaims → 解锁下游）
                                                   └─ 失败 ─▶ failed
```

`dag.ts::unlock` 只对 `blocked` 节点解锁；对 `finished` 写回 `done` / `failed`
终态；`selectNext` 只从 `ready` 且依赖满足的节点中挑 `gain` 最高者。

### 3.3 `HypothesisStatus`（假设生命周期）

```text
proposed ──(activate)──▶ active ──(recordVerdict)──▶ supported | refuted | abandoned
```

- `recordVerdict` 映射：`verified → supported`、`rejected → refuted`、
  `disputed → active`（保持激活待验）、`pending → 保持现状`。
- 每次验证 verdict 都追加进 `history[]`（含 ts / verdict / note），假设不是
  「一句话」而是带置信度历史的生命周期。

### 3.4 `JobStatus`（长任务，阶段 4b）

```text
pending ──(submit 立即 start)──▶ running ──(执行体落定)──▶ done | failed
   │
   └─ cancel(id)（仅 pending 可取消）─▶ failed('cancelled by user')
```

### 3.5 `ReviewVerdict`（8 步审稿判定）

```text
overallScore ≥ 0.85 → accept
      0.70 ≤ s < 0.85 → minor-revision
      0.50 ≤ s < 0.70 → major-revision
           s < 0.50   → reject
```

单步 `robust = score ≥ 0.65`；`strengths` 只收集 `score ≥ 0.8` 步骤的点评。

### 3.6 其它布尔 / 终态字段

| 字段 | 取值 | 触发方式 |
|---|---|---|
| `ResearchGoal.status` | `active / done / aborted` | 由调用方维护（core 只读） |
| `Artifact.archived` | `false → true` | `ArtifactStore.archive(id)`（归档后 `trace` 不再计入） |

---

## 4. 关键行为 / 算法约束

### 4.1 DAG 调度（`dag.ts`）

- `selectNext(tasks)`：集合 = 所有 `status === 'ready'` 且 `consumesClaims`
  全部被 `done` 任务的 `produceClaims` 覆盖的节点 → 按 `gain` 降序取第一个。
- `unlock(tasks, finished)`：把 `finished` 写回终态（`done` / `failed`），
  并回收其 `produceClaims`；仅 `blocked` 且依赖满足的节点翻为 `ready`。

### 4.2 置信度合成（`claim.ts::synthConfidence`）

```text
base    = Σ(wi · ei.confidence) / Σ wi      # 证据加权平均
         wi = 1 + (ei.confidence > 0.7 ? 1 : 0)   # 高置信证据更高权重
penalty = 0 if 无反证，否则 max(counter.confidence) × 0.5
confidence = clamp01(base − penalty)
```

### 4.3 验证判定（`verification.ts::runVerification`）

三步 checks（写入 `VerificationReport.checks[]`）：

1. Evidence Check：`已核验证据数 / 总证据数`；
2. Counter Search：`none | found(weak) | found(strong)`（strong = confidence ≥ 0.6）；
3. Experiment Test：`experiment.outcome`（缺省 `inconclusive`）。

结局表（§3.1）：`refute → rejected`；`strongCounter → disputed`；
`无任何证据或证据均未核验 → disputed`；`support → verified`；其余 `disputed`。
返回 `VerificationReport { verdict, rationale, checks[] }`。

---

## 5. 五类 Research Memory 数据模型（`src/memory/`）

### 5.1 `SemanticFact` — 「我们知道什么」

```ts
interface SemanticFact {
  id: string;              // fact-<seq>（或外部给定）
  subject: string; predicate: string; object: string;   // 事实三元组
  sourceClaims: string[];  // 溯源：由哪些 claim 归纳而来
  confidence: number;      // 0..1
  verified: boolean;
  updatedAt: string;       // ISO
}
```

只收「已核验」事实：`digest()` 约定入参为已 verified 的 claim，避免把模型
中间说辞污染知识库（§9 铁律）。

### 5.2 `Episode` — 「我们做过什么」

```ts
type EpisodeKind = 'search' | 'read' | 'synthesize' | 'hypothesis'
                 | 'experiment' | 'verify' | 'decision' | 'note';

interface Episode {
  id: string;              // ep-<seq>（meta.episodeId 可覆盖）
  ts: string;              // ISO
  kind: EpisodeKind;
  summary: string;
  claimId?: string;
  source?: string;         // 文献 / 实验 / 推理
  outcome?: string;
  meta?: Record<string, unknown>;   // jobId / scheduleId / model / kind 等机器可读字段
}
```

### 5.3 `Artifact` — 「我们产出过什么」（统一产出 / 实验档案）

```ts
type ArtifactKind = 'note' | 'evidence-log' | 'experiment'
                  | 'result' | 'report' | 'counterexample';

interface Artifact {
  id: string;              // art-<seq>（单调递增，报告自标 art-1…art-13 同源）
  kind: ArtifactKind;
  title: string;
  body: string;
  claimId?: string;        // ← 可追溯关键外键
  createdAt: string;       // ISO
  meta: Record<string, unknown>;   // env / outcome / n / engine / verdict / jobId…
  archived: boolean;
}
```

操作：`put / get / trace(claimId, kind?) / archive(id) / list`。
`ArtifactMemory`（`src/memory/artifact.ts`）是召回侧适配器：
`recall(query?, topK)`、`byKind`、`forClaim`。

### 5.4 `HypothesisEntry` — 「我们在验证什么」

```ts
type HypothesisStatus = 'proposed' | 'active' | 'supported' | 'refuted' | 'abandoned';

interface HypothesisEntry {
  id: string;              // h-<seq>
  claimId?: string;        // 关联的 ResearchClaim
  statement: string;
  status: HypothesisStatus;
  confidence: number;      // 当前合成置信度
  history: Array<{ ts: string; verdict: Verdict; note?: string }>;
  createdAt: string;
  updatedAt: string;
}
```

### 5.5 `EvidenceLedgerEntry` — 「证据是什么」

```ts
interface EvidenceLedgerEntry {
  id: string;              // ev-<seq>
  claimId: string;
  source: string;
  evidence: string;
  confidence: number;
  verified: boolean;       // 复核灯（unverified() 供验证循环优先处理）
  collectedAt: string;     // ISO
}
```

### 5.6 持久化格式（`persistMemory` / `loadMemoryInto`）

落盘文件：`<memory.dir>/research-memory.json`，顶层快照结构：

```jsonc
{
  "semantic":   [ /* SemanticFact[] */ ],
  "episodic":   [ /* Episode[](record 入参) */ ],
  "evidence":   [ /* EvidenceLedgerEntry[](add 入参) */ ],
  "hypothesis": [ /* { statement, claimId?, status, confidence, history } */ ],
  "artifacts":  [ /* ArtifactPatch { kind, title, body, claimId?, meta? } */ ]
}
```

- `loadMemoryInto` 把 hypothesis 按 `propose → update(status/confidence/history)`
  恢复（保留生命周期与置信度历史）；artifacts 经 `ArtifactMemory.put` 重建。
- **现状如实标注**：插件只接线了启动侧 `loadMemoryInto()`；`persistMemory()`
  仍是显式触发，尚无 shutdown / 定时 flush 钩子。

---

## 6. 实验数据模型（`src/experiment/` + `src/agents/experiment.ts`）

### 6.1 `ExperimentPlan` / `Executor` / `Statistics`

```ts
type Env = 'frr' | 'vpp' | 'sim';

interface ExperimentPlan {
  id: string;                    // exp-<seq>
  claimId: string;
  env: Env;
  scenario: string;              // route-hijack / as-set-injection / bgpsec-path-verify / …
  steps: string[];
  configFingerprint: string;     // finger(`${env}::${scenario}::${claimStatement}`) 可复现
  metrics: string[];             // sim → ['simulated_ok']；frr/vpp → 四口径
  repetitions: number;
}

interface Executor {
  run(plan: ExperimentPlan): ExperimentResult | Promise<ExperimentResult>;
}

interface Statistics {
  n: number;
  metrics: Record<string, number>;   // 均值 + `${k}_stddev`
  primary?: number;
}
```

### 6.2 拓扑抽象（`experiment/topology.ts`）

```ts
type ValidatorMode = 'none' | 'rov' | 'bgpsec' | 'rov+bgpsec';
type AttackClass   = 'prefix-hijack' | 'subprefix-hijack' | 'as-set-injection' | 'path-manipulation';

interface TopologyConfig {
  seed?: number;          // mulberry32 同 seed 可复现
  validator?: ValidatorMode;
  attack?: AttackClass;
  asCount?: number;       // 参与者 AS 总数（默认 40）
  saturated?: boolean;    // 全互联 / 反射器拓扑
}

interface TopologyInfo {
  engine: string;         // route-engine-sim | frr | vpp | frr-adapter-sim | vpp-adapter-sim
  available: boolean;
  validator: ValidatorMode;
  attack: AttackClass;
}

interface MetricSample {  // 一轮注入采集的四口径
  detection_rate: number;
  false_positive_rate: number;
  convergence_time: number;      // ms
  verification_latency: number;  // ms
}

interface Topology {
  readonly info: TopologyInfo;
  deploy(cfg?: TopologyConfig): void;
  teardown(): void;
  inject(): MetricSample;
}
```

实现：`RouteEngineSim`（默认、确定性、可复现）；`FrrTopology` / `VppTopology`
（真实守护进程适配器；二进制缺失时 `fallbackToSim` 回退，`info.engine` 如实
标记 `*-adapter-sim`）；守护进程不可用且关闭回退时抛 `TopologyUnavailableError`。

### 6.3 统计口径（`experiment/stats.ts`）

```ts
const EXPERIMENT_METRICS = [
  'detection_rate', 'false_positive_rate',
  'convergence_time', 'verification_latency',
] as const;

interface SeriesStats {
  n: number;
  mean: number;           // 4 位小数
  stddev: number;         // 样本标准差（n-1）；n<=1 为 0
  ci95: [number, number]; // 正态近似 95% CI（n<2 时退化为 [mean, mean]）
}

interface DetectionStats extends SeriesStats {
  falsePositive: SeriesStats;
  effectiveScore: number;      // det.mean − fp.mean
}
```

### 6.4 自动战役（`experiment/runner.ts`）

```ts
interface CampaignOptions {
  claim: { id: string; statement: string };
  plan: ExperimentPlan;
  executor?: Executor;
  topologyConfig?: TopologyConfig;
  validator?: ValidatorMode;
  supportThreshold?: number;      // 默认 0.8
  evidenceConfidence?: number;    // 默认 0.8
  memory?: ResearchMemory;
}

interface CampaignReport {
  plan: ExperimentPlan;
  results: ExperimentResult[];
  stats: Record<string, SeriesStats>;   // 四口径批量统计
  detection: DetectionStats;
  outcome: ExperimentResult['outcome']; // det.mean ≥ threshold → support；≤ 0.4 → refute；否则 inconclusive
  verdict: Verdict;
  rationale: string;
  artifacts: string[];                 // 归档的 artifact id
}

interface CampaignSpec {   // 插件 / 调度便捷入口
  claim: { id: string; statement: string };
  env?: 'frr' | 'vpp' | 'sim';
  repetitions?: number;    // 默认 3
  validator?: ValidatorMode;
  attackClass?: AttackClass;
  asCount?: number;
  seed?: number;
  supportThreshold?: number;
  executor?: Executor;
}
```

流水线 = `deploy → run(×repetitions) → collect → analyze → verify → archive`，
写回 episodic + artifact（`experiment` + `result` 两类，均绑 `claimId`）。

---

## 7. 阶段 4 运作对象（roles / router / policy / autonomous / jobs / scheduler / self-improve / writer / director / loops）

### 7.1 角色与模型路由

```ts
type ResearchRole = 'director' | 'literature' | 'reviewer' | 'experimenter' | 'writer';

interface RoleDef {
  role: ResearchRole;
  label: string;
  description: string;
  agentKey: keyof ResearchAgents | 'writer' | 'director';
  defaultModel: string;
}

// TASK_ROLE: read/search/hypothesis → literature；experiment → experimenter；
//            verify → reviewer；write → writer
interface ModelRoute { provider: string; model: string; }
// 默认 DEFAULT_MODEL_ROUTE = { provider: 'local-interval-dsv4', model: 'dsv4flash' }
```

### 7.2 研究纪律（`policy/`）

```ts
interface ResearchPolicyRule { id: string; text: string; }   // p01…p10
interface PolicyOptions { enabled?: boolean; extra?: string[]; omit?: string[]; }
interface PolicyView    { enabled: boolean; rules: ResearchPolicyRule[]; prompt: string; }
```

`RESEARCH_POLICY` 10 条与 AGENTS.md §9 一一对应；`PolicyService.buildPrompt()`
渲染 system-prompt 块（禁用时规则可查但 prompt 为空）。

### 7.3 一键流水线（`autonomous/`）

```ts
interface AutonomousInput {
  topic: string;
  hypothesis?: string;
  paperTitle?: string;
  env?: 'frr' | 'vpp' | 'sim';
  repetitions?: number;
  validator?: ValidatorMode;
  supportThreshold?: number;
  seed?: number;
}

interface AutonomousReport {
  goalId: string;
  topic: string;
  claimVerdicts: Record<string, Verdict>;
  artifacts: string[];
  paper: string;        // markdown 论文
  slides: string;       // marp 幻灯片
  campaign?: CampaignReport;
  episodes: number;
  summary: string;
}
```

`buildGoal(topic)` 产出的标准 5 任务 DAG：`t1 read → t2 hypothesis → t3 experiment →
t4 verify → t5 write`，`hypothesis` 任务产出主假设 claim（`c-h`），下游 consume 它。

### 7.4 长任务与调度

```ts
type JobKind = 'research' | 'campaign';
type JobStatus = 'pending' | 'running' | 'done' | 'failed';

interface Job {
  id: string;          // job-<seq36>-<date36>
  kind: JobKind;
  title: string;
  status: JobStatus;
  progress: number;    // 0..1
  error?: string;
  createdAt: string;
}
interface JobInput { kind: JobKind; title: string; run: () => unknown | Promise<unknown>; }

interface ScheduleSpec {
  id: string;  topic: string;  hypothesis?: string;
  enabled: boolean;
  daily?: string;           // 'HH:MM'
  everyMs?: number;         // 周期毫秒
  at?: string;              // ISO 一次性
  validator?: string;
  supportThreshold?: number;
  lastRunAt?: string;
  nextRunAt?: string;
}
interface ScheduledRun { scheduleId: string; at: string; report: AutonomousReport; nextRunAt?: string; }
```

- `JobRunner` 完成/失败 → `episodic(note, meta.jobId)` + `artifact(result | evidence-log,
  meta.jobId/kind/status)`。
- `ResearchScheduler` 触发模式优先级：`at（一次性）> daily（每日）> everyMs（周期）`；
  触发 → `episodic + autonomous 任务 + artifact`。

### 7.5 自省（`self-improve/`）

```ts
interface ReflectionObservation     { kind: string; count: number; }
interface ReflectionRecommendation  { priority: 'high' | 'medium' | 'low'; action: string; }
interface ReflectionSnapshot {
  episodes: number; artifacts: number; claims: number; hypotheses: number;
  evidence: number; unverified: number; jobs: number; scheduled: number;
}
interface ReflectionReport {
  at: string;
  summary: string;                      // 必须含「改进建议」
  snapshot: ReflectionSnapshot;
  observations: ReflectionObservation[];
  recommendations: ReflectionRecommendation[];
}
```

反思留痕写在快照之后（`episodic(note, meta.kind=reflection)`），冷启动
`snapshot` 不被污染。

### 7.6 写作与审稿对象

```ts
interface PaperInput {
  title: string;
  researchQuestion: string;
  hypothesis: string;
  contextNotes?: string[];
  claims: PaperClaimInput[];           // id / statement / type / confidence / verificationStatus / source / evidence[] / counterEvidence[]
  experiments?: PaperExperimentInput[]; // claimId / configFingerprint / scenario / outcome / verdict? / stats? / engine?
  limitations?: string[];
  artifacts?: string[];
  generatedAt?: string;
}

interface PaperReport {
  title: string;
  abstract: string;
  sections: Array<{ id: string; heading: string; body: string }>;
  markdown: string;
  stats: { claims: number; verified: number; disputed: number; rejected: number; experiments: number };
}

interface SlideDeckReport { title: string; slides: string[]; markdown: string; }

interface ReviewRequest { paper: PaperRef; steps: ReviewStepInput[]; }  // 8 步评分
interface ReviewReport {
  paperId: string; paperTitle: string;
  steps: ReviewStepResult[];           // step/label/score/robust/strengths/concerns/suggestion
  overallScore: number;
  verdict: ReviewVerdict;              // §3.5
  strengths: string[]; concerns: string[]; suggestions: string[];
  checklist: Array<{ step: number; label: string; ok: boolean }>;
}

interface PaperRef {
  id: string; title: string; authors: string[];
  year: number; venue: string; abstract: string;
  keywords: string[]; url?: string;
}
```

### 7.7 循环与调度报告对象

```ts
interface RunReport {                     // director.run()
  goalId: string;
  iterations: number;
  episodes: Episode[];
  claims: Map<string, Verdict>;
  artifacts: string[];
}
interface VerificationOutcome {           // verification-loop.runVerificationLoop()
  claimId: string; verdict: Verdict; report: VerificationReport; confidence: number;
}
interface ExperimentOutcome {             // experiment-loop.runExperimentLoop()
  plan: ExperimentPlan; result: ExperimentResult; stats?: Statistics;
}
```

---

## 8. 运行时接线（services / tools ↔ 对象）

### 8.1 11 个 `ctx.provide` 服务

| 服务名 | 提供对象 | 主要字段 / 能力 |
|---|---|---|
| `researchCore` | `ResearchCoreService` | `claims{create,addEvidence,addCounter,confidence}`、`verify.claim`、`plan{selectNext,unlock}`、`artifacts`(ArtifactStore) |
| `researchMemory` | `ResearchMemory` | 五类记忆门面（§5） |
| `researchAgents` | `ResearchAgents` | `literature` / `reviewer` / `experiment` |
| `researchDirector` | `ResearchDirector` | `run(goal) → RunReport` |
| `researchExperiment` | `{ runAutomatic }` | → `CampaignReport` |
| `researchWriter` | `ResearchWriter` | `paper(input) → PaperReport`、`slides(input) → SlideDeckReport` |
| `researchPolicy` | `PolicyService` | `rules() / buildPrompt() / view()` |
| `researchAutonomous` | `{ run }` | → `AutonomousReport` |
| `researchJobs` | `JobRunner` | `submit / get / list / cancel` |
| `researchScheduler` | `ResearchScheduler` | `register / list / tick / cancel` |
| `researchSelfImprove` | `SelfImprover` | `reflect() → ReflectionReport` |

### 8.2 13 个 `research_*` 工具（host 全局层注册）

| 工具 | 读 | 写 |
|---|---|---|
| `research_verify` | — | claim 构造 / verify 判定 → `episodic(verify)` + `artifact(result)` |
| `research_record` | — | `artifact(note/evidence-log/experiment/result/counterexample)`（`claimId?`） |
| `research_search` | `agents.literature.search`（本地语料） | —（只读） |
| `research_review` | `ReviewRequest` | `episodic(note)` + `artifact(report)` |
| `research_experiment` | claim 文本 | plan + run 单轮（`ExperimentResult`） |
| `research_campaign` | — | 自动战役 → episodic + artifact + `CampaignReport` |
| `research_paper` | PaperInput | `PaperReport`（含附录 A 追溯） |
| `research_slides` | PaperInput | `SlideDeckReport`（Marp） |
| `research_autonomous` | `AutonomousInput` | 一键流水线 → 论文/幻灯片/归档 + episodic |
| `research_policy` | `PolicyService` | 策略视图（只读） |
| `research_job` | `JobRunner` | 长任务 + 归档 |
| `research_schedule` | `ResearchScheduler` | 周期 / 一次性调度 + 归档 |
| `research_reflect` | 五类记忆快照 | `SelfImprover.reflect()` + episodic 反思留痕 |

「写者 = 读者」闭环：所有复盘 / 解码（`research_reflect` 等）只读同一份
`runtime.memory` 再产出建议，因此 `persistMemory` 一个入口即可序列化全部状态。

---

## 9. 数据完整性铁律与反模式

- **铁律（AGENTS.md §6 / Policy 1）**：不能把「模型曾经说过」当作事实；
  每条 claim 必须带 `source / evidence / confidence / verified / last_verified`。
  类型强制：`SemanticFact.verified`、`EvidenceLedgerEntry.verified`、
  `ResearchClaim.verificationStatus`。
- **镜像一致**：`ResearchClaim.evidence[]`（合成口径）↔ `EvidenceMemory`
  （时间线台账）互为镜像；新增证据两边都要落；反例走 `counterEvidence`，
  `ResearchClaim` 结构内含 `CounterEvidence[]` 与 `verdictRationale`。
- **实验结论必须绑定 artifact（Policy 5/6）**：无 artifact 的实验数据不得声称
  「实验验证」；沙箱模拟必须 `simulated=true` 如实标记（RouteEngineSim），
  `info.engine` / `data.engine` 统一标注执行源。
- **反模式清单**：不绑 `claimId` 的 artifact（无法 `trace`）；把 Hypothesis 标成
  Fact；未跑验证就把 HypothesisMemory 置 supported；用 `meta` 存文件正文而不用
  `body`；把「实验计划」与「实验结果」混在同一个对象里。

---

## 10. 已知缺口（现状如实标注）

- **语义接线缺口**：`SemanticMemory.digest()` 能力已就绪，但当前三条循环 /
  任务**都不写 semantic**（`grep -rn digest src/` 仅命中定义、无调用）——现状
  是「不写」以避免未核验中间说辞污染知识库，后续增量把「已核验 claim → 三元组」
  折入检索 / 阅读任务。
- **持久化落盘缺口**：插件只接线了启动侧 `loadMemoryInto()`；`persistMemory()`
  尚无 shutdown / 定时 flush 钩子，落盘为显式触发（详见 architecture §6.4）。
- **战役参数透传缺口**（数据流层面的已知缺陷，见 TODO「在研」）：`runAutomaticExperiment`
  构造默认 `TopologyExecutor` 时未把 `attack` 显式透传，会回退到
  `inferAttack(plan.scenario)`（`runner.ts` → `executors.ts`）；修复 = 显式透传 +
  补测试。
- **`simulated` 硬编码**：`executors.ts` 的 `simulated: true` 目前固定；接入真实
  FRR/VPP 引擎后应随 `engine` 改写。

---

## 附录 · 本文件与代码的对应（快速核对）

| 章节 | 代码事实 |
|---|---|
| §1 | `src/core/types.ts`（字段逐一对应）、`src/core/claim.ts`、`src/core/verification.ts`、`src/core/artifact-store.ts` |
| §3 状态机 | `src/core/dag.ts`、`src/core/verification.ts`、`src/memory/hypothesis.ts`、`src/jobs/index.ts`、`src/agents/reviewer.ts` |
| §5 记忆 | `src/memory/{semantic,episodic,artifact,evidence,hypothesis,index}.ts` |
| §6 实验 | `src/agents/experiment.ts`、`src/experiment/{topology,stats,executors,runner}.ts` |
| §7 阶段 4 | `src/roles/`、`src/model-router/`、`src/policy/`、`src/autonomous/`、`src/jobs/`、`src/scheduler/`、`src/self-improve/`、`src/writer/`、`src/research-director/`、`src/*-loop/` |
| §8 运行时 | `src/plugin.ts`（`ResearchCoreService` / `ResearchRuntimeService` / `registerTools`） |
