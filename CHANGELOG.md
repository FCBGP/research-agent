# CHANGELOG.md — Research Agent OS 演进记录

> 维护规则（详见 `AGENTS.md` §10.1 文档卫生）：
> - 每轮完成的 TODO 项在收尾时**整条移入本文件**，按日期分节，逐条保留
>   「做了什么 / 关键产物 / 提交号(SHA) / 测试与 SMOKE 数字」，保证可追溯。
> - 未发布（repo 内自证）阶段用日期小节；正式对外发布后再引入 `## [x.y.z]` 版本头。
> - **本文件只放「已完成」**；未完成项一律留在 `TODO.md`，两边不重复。

---

## 2026-10-15 · 域间路由意图全景调研 · 结论速览（简报式交付）（提交 `6f9b5fe`）

需求（用户）：原请求「域间路由意图调研」；消歧后确认 scope=**全景调研**、deliverable=**简报式结论速览**
（判定表 + 关键缺口 + 课题建议，**不做**全流水线论文/幻灯片/实验）。已取消选型未执行。

- **做了什么**：把「路由意图」从 RFC 9315（IRTF NMRG 2022，intent=声明式期望结果 vs policy=约束行为的规则）
  口径出发，逐机制判定其是否承载 IBN 式意图：ROA/ROV ✅（强·单侧授权事实）、ASPA 🟡（I-D·顾客→上游
  传播路径授权·无偏好）、BGPsec ❌（运行期逐跳证明非意图语言，RFC 8205/8206）、IRR/RPSL 🟡（声明型弱权威）、
  BGP community 🟡（本地语义·可被劫持者注入，RFC 1997/2622/7999）、SLURM 🟡（RP 本地定制 RPKI 视图=本地意图
  例外层，RFC 8416）、SCION ✅（数据面 hop-field+MAC 链·唯一真路径意图）、IBN 域间线 ⚠️（无标准意图语言/
  assurance 环，Princeton BGP 配置验证佐证）、RFC 9871 BGP CAR 🟡（最接近 IBN 域间落点·场景受限）、
  课题「多源共识三视图」✅（补缺口接缝）。
- **关键缺口 G1–G5**：G1 声明盲区 40–50% + partial deployment；G2 单侧 vs 双向（ASPA 顾客→上游，无接收偏好）
  往语义；G3 广义意图（偏好/优化/时变/条件）结构性不支持（快照式签名+慢更新，maxLength 授权粒度↔伪造子前缀
  面张力，RFC 6480 §3.2/§4.1、RFC 7115、RFC 9319）；G4 缺 SHOULD↔IS assurance 闭环（RFC 9315 assurance 五部件，
  RFC 7908 仅事后行为告警）；G5 权威层级混排（RPKI 强/IRR 弱/community 无语义）→ 多源共识为自然解法。
- **课题建议 5 条**：① 锚点分级 + 盲区显式 `UNKNOWN` 态兜底；② 补双向意图边；③ assurance 闭环指标
  （intent-compliance/drift）；④ community 注入攻击面列入异常视图；⑤ 表达模型可翻译（对接 ASPA/RFC 9871/SCION）。
- **关键产物**：
  - `reports/域间路由意图全景调研-结论速览.md` —— 交付物（§0 一句话结论 + §1 RFC 9315 口径表 + §2 逐机制
    判定表 11 行 + §3 G1–G5 + §4 课题建议 5 条 + §5 证据追溯 12 条，各条标来源属性与复核口径）。
  - artifact store（kind=evidence-log）：**art-1** RFC 8416 SLURM=本地化意图载体 / **art-2** community+RPSL=
    运营信号型弱意图载体 / **art-3** SCION 路径意图 + RFC 9871 CAR + APNIC IRV；落盘
    `artifacts/domain-routing-intent-survey/research-memory.json`。
  - 证据底座复用既有 `reports/RPKI承载域间路由意图-调研报告.md`（RW 全表，terabytes 形态无需重复检索）。
- **证据约束（如实标注）**：RFC 9315 / ASPA I-D / RFC 9871 不在 WeKnora RFC 知识库检索命中范围内，判定以
  「既有报告 + RFC 原文 + 外网线索」立证，简报 §0 顶部显式声明，未冒充 KB 检索；「更新 RFC 4271 默认不导入
  导出」未挂编号。
- **测试与 SMOKE**：文件已写入并复核结构（§0–§5 齐全）；无代码改动、无测试。提交号 SHA 提交后回填。

---

## 2026-10-15 · 联网搜索切换：弃用 dsh 内置 web 搜索 → `dsh-web-search-plugin`（提交 `86b730f`）

需求（用户）：不再使用 dsh 内置的 web 搜索（base 的 `web-search-deepseek` host 插件，DeepSeek
官方后端），改用社区插件 `dsh-web-search-plugin`（v0.5.x，9 个后端：DeepSeek 官方默认 / Tavily /
Brave / Serper / SerpApi / Exa / SearXNG / Scavio / Firecrawl），且**在 deploy 时与
`@wxg-prc-cpg/dsh-weknora` 一样自动检测并安装**。`web_search` 工具沿用不变，只换底层 provider；
插件 bundle 自带 patch 覆盖 `web` 行 `searchProvider=dsh-web-search` + 禁用内置
`web-search-deepseek` + 插入插件行（默认 `provider: deepseek-official`，第三方后端在
Web UI → 设置 → 网页搜索 卡片运行时切换，免改 YAML/免重启）。

- **关键产物**：
  - `profiles/research/package.json` —— `dsh.profile.bundles` 与 `dependencies` 追加
    `dsh-web-search-plugin`（`^0.5.1`），description 同步（重跑 deploy 不丢插件）。
  - `profiles/research/cordis.patch.yml` —— 追加 `- id: dsh-web-search-plugin` 配置行
    （默认 `provider: deepseek-official`；插件未装时该行被静默丢弃，非致命，装上即生效）。
  - `dsh-research/scripts/deploy-profile.sh` —— weknora 单块补装改为**通用插件循环**
    `for plugin_spec in "@wxg-prc-cpg/dsh-weknora" "dsh-web-search-plugin"`：grep package.json
    声明 → node_modules 缺失自动 `dsh plugin add` → 已装跳过 → 失败仅 warn；
    `DEPLOY_AUTO_PLUGINS=0` 打印手动命令。
  - `README.md` 新增「联网搜索切换」章节（deploy 生命周期 / 选后端 / 排查表 / 兼容性）；
    `profiles/README.md` bundle 清单补两插件。
- **验证（沙箱，dsh 0.2.0-rc.2 / Node 24，DSH_HOME=/tmp/dsh-home）**：
  - Fresh deploy 自动补装 weknora + dsh-web-search-plugin；重跑打 `already installed`；
    `DEPLOY_AUTO_PLUGINS=0` 打两条手动命令；`bash -n` 通过。
  - `--dump-config`：组合树 `web.searchProvider=dsh-web-search` + `fetchProvider=http`、
    内置 `web-search-deepseek` `disabled: true`、插件行 `provider: deepseek-official`。
  - 未装场景仅非致命 `skipping profile bundle ... cannot resolve` / `patch: entry not found`，
    boot 正常退出（exit=0）。
  - runtime-smoke → **SMOKE PASS**（services 15/15, tools 15/15, standard=0, roles 10/10/8/8）；
    单测 **183/183 全绿**（无回归）。
- **待办（真机，已列 TODO「在研 · 联网搜索切换」）**：浏览器侧栏插件页可见、设置→网页搜索卡片
  选第三方后端、`web_search` 不再耗官方搜索模型 token。沙箱无法开浏览器，留待用户
  `DSH_HOME="$HOME/.dsh" ./dsh-research/scripts/deploy-profile.sh && dsh research` 确认。

---

## 2026-10-15 · 阶段 9 · TRIZa 闭环：冻结契约 → 类型化变换 → FI/Ideality → 硬门晋升 → 可追溯（提交 `566bd7c`）

需求（用户）：继续读论文 `docs/2610.04555v1.pdf`（TRIZa: Guiding Agent Evolution from Pattern
Recognition to Solution Invention，arXiv:2610.04555v1），把 TRIZa 从「理念」落成 `dsh research`
的**可执行闭环**。定位（AGENTS.md §7）：TRIZa = 方法论/程序性能力 → 服务 + skill，不是领域知识。
与阶段 8 衔接：`researchTriz` = 事前/正演想法（矛盾 → 原理 → 假说，confidence=0.5）；
`researchTriza` = 事后/治理（冻结评估契约 → 类型化变换契约 → FI/Ideality → 四类硬门 → 晋升决策
→ 追溯记录）。铁律：**指标提升是观察，晋升是被治理的决策**；硬门任一失败 FI 不可覆盖。

- **新模块 `src/triza/`（8 文件）**：
  - `contract.ts` —— 冻结评估协议 κ（数据集版本/划分/预处理/feature-fit/种子/预算/主次指标/
    useful·harmful 合格事件/资源上限/缺失值行为/停止规则 + 晋升阈值）；**协议指纹 = SHA-256 of
    规范化绑定字段序列化**（改任一绑定字段 → 新指纹，silently 扩展旧结果不被允许；claimId/task/
    contradiction/frozenAt 不参与指纹，同协议可多 claim 复用）。
  - `typed.ts` —— 40 原理整表（论文 Table 4）→ 类型化变换类 + **精选路由安全子集 14 条**
    （原理 1/2/3/5/10/11/13/15/22/23/24/25/35/40）详细契约（输入/输出类型、允许参数、禁止变更、
    证据义务）；其余 26 条 generic 占位（诚实标注非权威）。
  - `functional-information.ts` —— 公式(2)/(3) useful/harmful **位口径分开报告**（useful 提升不能
    数值抵消 harmful 增加），Wilson 比分区间给保守界（useful 上界偏小不夸大、harmful 下界偏大不
    低估），公式(5) Ideality `J = IU_LB/(IH_UB + λ·cost)`（描述性打平指标，不决定认证）。
  - `promotion.ts` —— 证据阶梯 L0–L3 + 认证等级 Lcert（公式 4）+ 四类硬门（integrity/safety/
    reproducibility/resource，可自定义 extra）；决策顺序：硬门任一失败 → reject/escalate（高风险
    待人工授权）→ 认证 < 施加等级 → revise → 相对增益 < 冻结阈值 或 次级硬门槛不过 → **reject 且
    保留完整负证据**（论文 CICIoT 形式化 V2 语义）→ 全过 → promote；不同决策边界不打平（Table 2）。
  - `trace.ts` / `audit.ts` —— 追溯包（triz_context.json / triz_strategy_plan.md / scores.jsonl
    追加式 / 逐文件 SHA256SUMS，论文 Appendix A.1）+ 控制器策略审计（balanced vs safety-first，
    Figure 2B 语义：promotion F1/recall/specificity 描述性聚合，嵌套决策不给 p 值）。
  - `index.ts` —— `ResearchTrizaService`（freezeContract / typedPlans / evaluate / audit），
    evaluate = 冻结契约 → 原理（显式给定或经 researchTriz.analyzeProblem 推导）→ typed 变换 →
    FI/Ideality → 硬门 → 晋升决策 → 追溯包完整闭环。
- **新 host 插件 `src/plugin-triza.ts`**（exports `./triza`，`name='dsh-research-triza'`，
  `ctx.provide('researchTriza', …)`）；`cordis.patch.yml` host 平面 core 服务 **6 → 7 行**
  （core/triz/**triza**/director/experiment/writer/operations + triz-ui/triz-auto，共 9 行）。
- **`research_triza` 工具**（第 **15** 个 research_* 工具，preset 作用域；engineering 白名单
  **7 → 8** 含 research_triza；paper/experiment/reviewer 不变 10/10/8）：入参
  `problem/improving/worsening/candidateId/parentId/principleNos/metrics/baselineMetrics/
  referenceUseful/referenceHarmful/evidenceLevel/certifiedLevel/gates/relativeGainPct/
  requiresAuthorization/record`；输出 claimId + 64 位协议指纹 + typedPlans + decision
  （promotion/admissible/gateFailures/certification/fi/relativeGainPct/…）+ traceSummary +
  artifactId；`record` 默认写 artifact（kind=note, title^="triza: "）+ episodic（kind=triza），
  **负证据保留**。
- **`scripts/pack.sh` / `runtime-smoke.mjs` / 单测同步**：REQUIRED 增 `plugin-triza.js`；
  EXPECTED 15、ROLE_TOOLS.engineering 8、servicesOk 含 researchTriza、triza 冒烟（64 位指纹 /
  promote 决策 / 追溯包 ≥3 文件）。
- **验证（沙箱）**：单测 **183/183 全绿**（基线 168 + `src/triza/triza.test.ts` 14：指纹确定性 /
  FI 公式手工核对 / 类型化契约 / 四条晋升决策路径 / 审计语义 / 追溯包 / 服务 evaluate+audit /
  collectGates + `plugin.test.ts` 阶段 9 工具闭环冒烟）；runtime-smoke → **SMOKE PASS**
  （services 14/14 含 researchTriza、tools 15/15、engineering 8/8、triza=true）；`scripts/pack.sh`
  → **PACK OK**（basil-dsh-research-0.2.1.tgz，91 条、无 src/*.ts）。真机部署与实测待用户
  （沙箱无法写 `~/.dsh` / 开浏览器）。
- **关键产物**：`docs/2610.04555v1.pdf`（论文源）+ `dsh-research/src/triza/`（闭环实现）+
  `dsh-research/README.md`（阶段 9 章节）+ `research_triza` 工具（第 15 个）+ `dsh-research-triza`
  插件（exports `./triza`）。

---


## 2026-10-14 · 阶段 8.7 · 右侧栏面板可见性根因修复 + 每个最终回答自动映射 TRIZ

需求（用户，最新一轮）：① 部署后**右侧栏看不到「TRIZ 发明原理」面板**——「我要的应该不是
TRIZ skill，而是你每次给出的结果都要对应到 TRIZ 发明原理，解释在右侧栏那一栏」；② 不要
「写进文件才解释」——**每个回答都要有 TRIZ 解释**。本阶段 = 修面板可见性 + 让「每个最终
回答」在右侧栏自动多一条 TRIZ 映射。

- **面板可见性根因（为什么部署后看不到）**：`@deepseek-ai/dsh-client-modules` 扫描 host
  Loader 条目找声明 `dsh.client` 的包，`exactPackageSpecifier()` **只认裸包名 / 两段
  `@scope/name`**，三段子路径（如 `@basil/dsh-research/core`）一律 `void 0` → `@basil/
  dsh-research` 的 `package.json`（含 `dsh.client` 声明与 `exports["./client"]`）**永远发现
  不了** → 浏览器半边 `client/index.ts`（右侧栏 TRIZ Tab）**从未进入 `window.__DSH_BOOT__`
  组合图** → 面板必然不可见（非 UI 问题，是 bootstrap 根本没带它）。
- **修复**：`cordis.patch.yml` 首行 `research-core` 的 `name` 由 `@basil/dsh-research/core`
  改为**裸包名 `@basil/dsh-research`**（`main`=src/plugin-core.ts，与 `./core` 同入口，
  host 行为零变化）；其余 6 行子路径不动（各自 cached negative，安全）。`lib/client.js`
  重新 build（10657B，含 `keepMounted:true`——面板打开后会话切换/隐藏不销毁）。
- **`research-triz-auto`（新 host 插件，`@basil/dsh-research/triz-auto`，exports `./triz-auto`）**：
  订阅公开 `session/event` 事件总线——`user/message` 缓存问题、`assistant/message` 缓存答案
  （同轮多 step 覆盖、`interrupted:true` 跳过）、`turn/end` 判定**最终答案** →
  `researchTriz.mapResult`（缺省矛盾 改善 detection ↔ 恶化 complexity → 精选矩阵 (28,36)
  → #23/#2/#24）→ 写 `researchCore.artifacts`（`kind=note, title^="triz: ", meta.auto=true`，
  即右侧栏面板数据源）+ `researchMemory.episodic`（kind=triz）→ **面板自动更新**；每轮至多
  1 条（turn/end 清缓存，天然去重）。依赖 `ctx.get` 惰性读取、缺失安全跳过；不注册工具、
  不 provide 服务。对 research 族全部 profile（research/paper/experiment/engineering/reviewer）
  会话生效——这就是「研究时默认就调用 TRIZ」的全会话语义。
- **persona 纪律**（`presets/research.patch.yml`）：EVERY final answer 必须以标题
  **`### 本回答对应的 TRIZ 发明原理映射`** 收尾，逐条 `「原理#N Name — 一句理由」`（1~5 条），
  优先矛盾推理（改善 detection ↔ 恶化 complexity → cell (28,36) → #23/#2/#24；不适用则写
  `直接应用原理 #N Name`），一律标注待核验假说（source=triz, confidence=0.5），**无需额外
  调用工具**（从已知 40 原理推理）。
- **面板位置 / 生效要求（写给用户）**：右侧栏 → guide 页 → **「TRIZ 发明原理」** 条目；
  打开后 `keepMounted` 常驻。**改完必须重启 `dsh research`**（client-modules 对「非 client
  包」的 negative 判定按 source 缓存；重启前旧进程仍 401/无面板）。
- **验证**：单测 **168/168 全绿**（基线 162 + `plugin-triz-auto.test.ts` 6）；runtime-smoke
  → **SMOKE PASS** 新增 `client-graph=true`（graph.entries 含 `@basil/dsh-research` =
  面板可见性根因回归）＋ `triz-auto=true`（真实 services 驱动 createAutoTrizMiddleware，
  user→assistant→turn/end 恰好 1 条 auto note，source=curated-matrix, entries=3）。
- **文档 / 卫生**：README（root+TRIZ 小节）、`dsh-research/README.md`（host 7→8 行、插件
  8→9、阶段 8.7 小节）、CHANGELOG、TODO 里程碑同步。

## 2026-10-14 · 阶段 8.6 · 默认调用 TRIZ + 每次研究结果 ↔ 发明原理映射（论文§6 / 幻灯片 / 右侧栏）


需求（用户，三条）：① **git 每轮收尾完整提交一次并说明改了什么**；② research 时**默认就调用
TRIZ**（不是可选项）；③ 不要 TRIZ skill，要**每次给出的结果都对应到 TRIZ 发明原理**——即研究
产出（问题 / 假设 / claim / 实验结论）要反演映射回其体现的发明原理并给出理由，右侧栏一栏解释
「最终结果用了 TRIZ 的什么原理 / 为什么这么做」。承接阶段 8（research_triz 正演矛盾分析）与
8.5（右侧栏面板），本阶段把 TRIZ 从「手动工具」升级为「**默认自动 + 结果反演映射**」。

- **`src/triz/result-map.ts`（新）**：`mapResultToTriz` 双通道映射引擎——
  `didactic`（前置 `analyzeProblem` 矛盾分析命中的候选，永远在场）＋ `retrospective`
  （结果文本对原理 name/aliases（中英）做特征词打分补足，最多 `MAX_RESULT_MAPPING=5` 条、
  无命中不硬凑）；每条 = `[原理N Name] + kind + 理由`；输出全为**待核验假说**
  （source=triz, confidence=0.5），须经 research_verify / research_campaign 验证后才成结论
  （诚实标注，不作事实断言）。
- **`src/triz/index.ts`**：`ResearchTrizService` 新增 `mapResult`；service 缺省矛盾
  `improving:'detection' ↔ worsening:'complexity'`（命中精选矩阵 cell (28,36) → #23/2/24），
  接受调用方 override。
- **`src/autonomous/index.ts`**：`runAutonomousResearch` 新增 **2.6 默认 TRIZ 步骤**
  （`input.triz !== false`，即默认开启，`triz:false` 可关）：把 topic + hypothesis +
  claim + campaign 统计 + 矩阵拼成结果文本 → `mapResult` → 写 `kind=note, title^="triz: "`
  artifact（右侧栏面板**自动可见**）+ episodic（kind=triz）→ 映射进论文 §6 + 幻灯片页；
  `AutonomousReport.triz`、summary 统计「N 条 TRIZ 原理映射（待核验）」。
- **`src/writer/paper.ts`**：新增 `PaperTrizMapping` / `TRIZ_SOURCE_LABEL` / `TRIZ_KIND_LABEL`；
  新增 **§6 TRIZ 发明原理映射**（问题 / 来源 / 矛盾 / 原理表）+ 局限顺延 **§7**（无 TRIZ 映射
  时局限回退 §6，编号不跳号）；摘要统计映射条数。
- **`src/writer/slides.ts`**：新增 **5c «TRIZ 发明原理映射（本结果对应）»** 页（问题 / 来源 /
  矛盾 / 逐条 `#N Name（类型）：理由` / 待核验标注），插在实验矩阵页之后、结论页之前。
- **`src/plugin-tools.ts`**：`research_triz` 入参新增 `resultText`——传时输出 `mapping` 并写
  进 artifact body（正演假说行 → 映射行），episodic 注明条数；`research_autonomous` 输出新增
  `triz`（render 展示 source/contradiction/entries）。
- **文档**：`docs/survey-interdomain-routing-intent-triz.md`（TRIZ 视角的域间路由意图调研，
  与既有 intent-survey 配套）。
- **验证**：单测 **162/162 全绿**（+ `result-map.test.ts` 7；triz + mapResult 2；writer 补
  TRIZ §6/幻灯片 2；autonomous 默认 TRIZ + `triz:false` 关闭 2）；runtime-smoke → **SMOKE PASS**
  新增 `triz entries: 3`（默认流水线即产出 3 条映射，论文含 §6、幻灯片 10 页）。
## 2026-10-14 · 域间路由意图（AS Intent）调研 + TRIZ 核验闭环

需求：`research_triz` + 调研域间路由意图（inter-domain routing intent）——把「意图」作为跨 AS
声明式安全策略表达/验证的调研题目：现状盘点 → Gap 定位 → TRIZ 机制方向 → 核验闭环 → 中文调研报告。

- **现状盘点**：RFC 9315（意图通用概念，IRTF NMRG，域内管理域）、RFC 9234（BGP Roles/OTC =
  角色意图）、ASPA draft-28（上游授权意图）、ROA/ROV（起源意图，RFC 6811/6480）、FC-BGP
  （转发承诺意图，SIDR/IDR 工作项、草案期非 RFC）四类载体 + 通用概念层。
- **Gap 实证**：datatracker `name__icontains=asintent` → 0 命中；`as-intent` → 仅 1 条过期
  TEAS 草案（流量工程，非安全验证）；`intent` 全量 206 项均非路由安全 →「无统一 AS 路由
  意图对象」成立（V1 verified）。
- **TRIZ**：`research_triz`（测量精度 28 ↔ 系统复杂度 36，curated-matrix）→ 候选 #23 反馈 /
  #2 抽取 / #24 中介；对照既有工作 #23/#2 已被内化，**#24 统一 AS 意图中介层 = 核心 Gap 方向
  （假说 H-UNI, source=triz, confidence=0.5）**。
- **实验（RouteEngineSim, reps=3, 阈值 0.8, 五指纹）**：base/prefix det=0.093；rov/prefix=0.792；
  rov+aspa/subprefix=0.610 vs rov/subprefix=0.55（ASPA +0.06，C5 被证伪）；aspa/path-manip=0.650
  （覆盖 ROV 盲区）；FP≤0.022。五指纹配置指纹 fp-2047234355 / fp-483651690 / fp-2040600629 /
  fp-873252011 / fp-84288830。
- **核验闭环**（research_verify）：V1 verified（无统一意图对象 Gap）；V2 verified（意图验证
  0.093→0.55–0.79、FP≤0.022，「达 0.8」部分被数据否定）；C5 rejected（ASPA 在原子上 +0.06 且
  独立覆盖路径操纵）；V3 disputed（H-UNI 受「表达力↔可判定性」取舍与 SIDR 单机制偏好约束，
  仅设计假说，未实证）。
- **产出**：`docs/domain-intent-survey.md`（中文调研报告：8 条文献按首次出现编号、表题前置、
  逐条可追溯）+ `docs/output/domain-intent-survey.docx`（Word 版，report-word 转换管线）+
  artifact 证据日志 art-5。
- **口径决策（待用户确认）**：域间路由意图 = 跨 AS 声明式安全策略（origin/provider/role/
  forwarding 四类意图对象 + 跨 AS 验证），**不**含域内 IBN 控制器意图；已在报告 §1.2 / §六
  显式列明，用户认可后再将「意图/intent」词条增补进 vocabulary.ts。

---

## 2026-10-14 · 阶段 8.5 · 右侧栏「TRIZ 发明原理」面板（Web UI 可视化）

需求（用户）：`dsh research` 的研究结果要在 **Web UI 右侧栏有一栏**，解释「最终结果用了 TRIZ
的什么发明原理 / 为什么这么做」。承接 `research_triz` 工具（每次分析写 kind=note artifact），
把 TRIZ 分析从「工具返回」升级为「右侧栏可视化的解释层」。分层：host 半边只读数据、浏览器半边
只渲染，不进 Research Loop，不新增 `research_*` 工具。

- **host 半边** `src/plugin-triz-ui.ts`（exports `./triz-ui`，inject `['connection']`）：
  `cordis.patch.yml` 第 3 行（host 6 → **7 行**），在 connection 鉴权栅栏内挂**只读 GET**
  `/api/research.triz.notes` —— 从 `researchCore.artifacts` 过滤 TRIZ note（kind=note /
  !archived / source ∈ curated-matrix|heuristic-fallback|unresolved / title^="triz: "），
  `createdAt` 降序取最近 10 条，回填 40 原理明细（no/name/summary/routingHint）+ 逐行假说。
- **浏览器半边** `client/`：`dsh.client.platform: web` + `inject: @deepseek-ai/dsh-client-ui-sidebar-right`
  两步注册 —— `definition.ts`（Tab 类型定义 kind=triz-explainer + guide 条目）+
  `TrizTab.tsx`（按 tab 生命周期 signal 拉数据渲染）+ `route.ts`（client↔host 契约）。
  `scripts/build-client.mjs`（esbuild）→ `lib/client.js`（ModuleLoader wrapper，已入库；
  client-modules 按 `dsh.client` 声明自动加载）。
- **面板内容**：问题 + 来源徽标 + 候选发明原理（编号/名称/摘要/路由提示）+ 推导假说；
  UI 文案如实标注**待核验假说（source=triz, confidence=0.5）**，须验证后才成结论
  （Research Agent Policy：不把工具生成当事实）。
- **验证**：单测 **151/151 全绿**（+ `plugin-triz-ui.test.ts` 5）；runtime-smoke → **SMOKE PASS**
  新增 `trizUi=true`（`research-triz-ui` 在组合树 + `connection.fetch` 可用）；build-client 复现
  `lib/client.js`；dump-config 组合树含 `research-triz-ui` 行。

---

## 2026-10-14 · 阶段 8 · TRIZ 方法论接入（`ce94b68`）

需求：把 TRIZ（发明问题解决理论）加入 `dsh research`，作为**假说生成 / 机制设计方法**
（研究卡在「两难」时的机制方向来源）。定位：TRIZ = 程序性方法论 → **服务 + skill**（AGENTS.md §7），
不是领域知识（领域知识仍走 vocabulary.ts + WeKnora）；输出永远是**待核验假说**。

- **知识基 + 分析引擎**（`src/triz/`）：`data.ts` —— 40 发明原理（每条含路由安全提示
  routingHint）/ 39 技术参数 / 路由参数中英别名表（reliability・检测・收敛・抗劫持 ↔ 参数号）/
  **精选矛盾矩阵**（适配子集，诚实标注非 39×39 全表转录）/ 启发式兜底原理表 / 启动原理集；
  `index.ts` —— `resolveParameter`（中/英/别名/包含模糊）→ `principlesFor`（三态如实标注
  `curated-matrix | heuristic-fallback | unresolved`）→ `separationFor`（空间/时间/条件/系统级）/
  `evolutionFor`（进化法则视角）/ `idealityFraming`（IFR 理想解 / 有害作用 / 可用资源 / 增益）/
  `toHypotheses`（`type=Hypothesis, source=triz, confidence=0.5`）。
- **host 插件** `src/plugin-triz.ts`（package.json `exports` 加 `./triz`）：`ctx.provide('researchTriz')`；
  `cordis.patch.yml` host 平面 **5 → 6 行**：`research-core` / **`research-triz`** / `research-director` /
  `research-experiment` / `research-writer` / `research-operations`。
- **第 14 个工具 `research_triz`**（`src/plugin-tools.ts`）：入参 `problem / improving / worsening /
  record`（record 默认 true → 写 artifact + episodic, kind=triz），输出 `source / contradiction /
  candidates / separation / evolution / ideality / hypotheses / artifactId`；仅在 research（14 全量）
  与 engineering（白名单 +triz = **7**）会话可见。
- **skill** `skills/triz/SKILL.md`：矛盾 → 原理 → 假说 → 核验闭环 + 常见路由安全矛盾 ↔ 原理映射表
  （检测率↔收敛延迟 → 预操作/反馈/向缓冲；安全强度↔复杂度 → 中介/合并/局部质量…）；纪律 = 别把
  TRIZ 方向当新发现，先对照既有工作（FC-BGP/ASPA 已含「反向/自证」、RPKI 预验证是「预操作」）。
- **打包 / 冒烟同步**：`pack.sh` REQUIRED 加 `src/plugin-triz.js` + `skills/triz/SKILL.md`；
  `runtime-smoke.mjs` EXPECTED 14、ROLE_TOOLS.engineering +triz、servicesOk +researchTriz、triz 冒烟块。
- **文档**：README.md / dsh-research/README.md（新增「阶段 8」小节）/ profiles/README.md /
  AGENTS.md（§7 skills 加 triz + 追加阶段 8 快照）同步；工具口径 13→14、host 5→6 行、插件 6→7、
  engineering 6→7。

**验证（沙箱，`DSH_HOME=/tmp/dsh-home`）：**
- 单测 `node --test "src/**/*.test.ts"` = **146/146 全绿**（基线 137 + TRIZ 9：resolveParameter 中英
  别名 / curated-matrix 命中 / heuristic-fallback / unresolved / separation+evolution / toHypotheses /
  idealityFraming / createTrizService 端到端 / plugin-tools + triz）。
- runtime-smoke → **SMOKE PASS**：`services=true`、`tools(14/14)=true`、`standard=0`、
  `engineering:OK[7/7]`、`triz=true`（命中 curated-matrix：#11 Beforehand cushioning / #10 Preliminary
  action / #23 Feedback，生成 3 条 Hypothesis，confidence=0.5）。
- pack.sh → **PACK OK**：`src/plugin-triz.js` + `src/triz/{data,index}.js` + `skills/triz/SKILL.md`
  进 tarball，包内 0 个 `src/*.ts`。

**口径变更（自本阶段起）**：`research_*` 工具 = 14 全量（research）/ engineering 7；host 平面 6 行 /
13 服务；bundle 插件 7 个（host 6 + preset tools 1）。阶段 4.5/5/6 快照里的 13 / 5 行 / 6 插件属当时
口径，以本段为准。

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
