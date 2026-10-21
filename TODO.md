# TODO.md — Research Agent OS 实施路线

> 维护规则（详见 `AGENTS.md` §10.1 文档卫生）：
> - 标识只有两种：未完成 = `- [ ]`，已完成 = `- [x]`。
> - 已完成项在收尾时**整条移入 `CHANGELOG.md`**，本文件只保留未完成/在研/新规划项，两边不重复。
> - 新增工作直接以新条目/新阶段写入下方，并同步更新「里程碑」口径。

## 阶段 0 · 架构文档收尾

- [x] `docs/research-agent-architecture.md` 的 Memory / Artifact 架构、Migration plan、MVI、
  上游风险细分（顶层已覆盖，细分待补）
- [x] 产出 `docs/research-agent-data-model.md`
- [x] 产出 `docs/research-agent-migration-plan.md`

## 阶段 4 · 收尾

- [x] 16c. real subagent 实挂 dsh 模型层（web 会话 seam）：把 role→agent 接到真实 LLM 回合，
  做完才真正 multi-agent；模型路由已就绪，仅差这一步

## 阶段 4.5 · 收尾

- [x] 真机浏览器端到端：用户在自己终端
  `DSH_HOME="$HOME/.dsh" ./dsh-research/scripts/deploy-profile.sh && dsh research`
  启动 Web UI，在 web 会话里实测 research_autonomous / research_campaign（沙箱无法开浏览器）

## 阶段 5 · Agent Preset + 插件化重构（2026-10-09 规划）

> 背景：当前 `@basil/dsh-research` = 一个 npm 包同时扮演 bundle + 一个 720 行巨型插件
> （11 服务 + 13 工具全在 host 平面）。与 dsh web 基座「模型可见面全部进 agent preset」的现行
> 架构错位：research_* 工具对所有 preset 会话可见、无法按会话裁剪；领域 skill（bgp/rpki/…）
> 从未挂进运行时。
> 目标：把 research 包装为 **`preset-research`（Research Agent 本体）+ 多个职责单一插件**；
> 工具只在 research 会话出现；skill 经 `skill-filesystem(customSkillDirs)` 真正挂载。

### A · bundle 分片（纯声明，不改领域逻辑）

- [x] `dsh-research/package.json`：`dsh.bundle.patch` 由单文件改为数组
  `["./cordis.patch.yml", "./presets/research.patch.yml"]`
- [x] `dsh-research/package.json` `exports`：为 6 个插件入口加**显式子路径**
  `./core` `./director` `./experiment` `./writer` `./operations` `./tools`
  （照抄 `@deepseek-ai/dsh-tool-subagent` 的 `./model-selection-settings` 写法；
  `./src/*` 不会兜底未列出的子路径）
- [x] 新建 `dsh-research/cordis.patch.yml`：host 平面 5 行
  `research-core` / `research-director` / `research-experiment` / `research-writer` /
  `research-operations`（config 承载 tools.enabled / memory.dir 等，替换原 dsh-research-core 行）
- [x] 新建 `dsh-research/presets/research.patch.yml`：`preset-research`
  （`@deepseek-ai/dsh-agent-preset`，id=research, order=2）挂载——
  persona（研究 agent 身份）、research-tools、skill-filesystem（customSkillDirs →
  `node_modules/@basil/dsh-research/skills`）+ tool-skill、standard 基础工具集
  （clone `web-app/presets/standard.patch.yml` 的工具段）
- [x] 删除或标注弃用 `dsh-research/patches/research-agent.yml`（被 cordis.patch.yml 取代）

### B · 拆插件（逻辑搬移，语义零变化）

- [x] 从 `src/plugin.ts` 抽 5 个 host 插件
  `src/plugin-{core,director,experiment,writer,operations}.ts`（各自 name+apply，搬对应
  ctx.provide 段；service 名、工具参数 schema **全部不动**；host 行顺序 = 依赖顺序）
- [x] `src/plugin-tools.ts`：`inject ['tools']` + `ctx.get(researchCore/…)` 消费 host 服务 +
  13 个 `research_*` 工具原样保留（注册发生在 preset 作用域 → 只进 research 会话的工具目录）
- [x] `src/plugin.ts` 降级为 re-export（或删除，`main` 指向 plugin-core）

### C · profile overlay

- [x] `profiles/research/cordis.patch.yml`：新增 `agent-preset-registry` 行
  `config.default: research`（新会话默认用 Research Agent；模型 overlay 原样保留）

### D · 冒烟 / 验证改造

- [x] `scripts/runtime-smoke.mjs`：host 服务断言（researchCore 等 11 个 ctx.get）保留；
  **工具断言改为解析 `preset-research` 组成**（agentPresets.serviceFor() 或起 research 会话
  查其工具目录），不再查 host 全局层
- [x] 追加断言：`standard` 会话**不含** `research_*`（证明 always-on 污染已消除）
- [x] 验收门禁：14 个单测全绿 → `DSH_HOME=/tmp/dsh-home ./dsh-research/scripts/deploy-profile.sh`
  → runtime-smoke **SMOKE PASS** → `--dump-config` 出现 research-* 5 行 + preset-research

### E · 文档同步

- [x] `dsh-research/README.md` / `profiles/README.md` / `AGENTS.md`：
  单行 dsh-research-core 插件 → preset-research + 6 插件；
  记录「默认 preset=research」「research_* 只在 research 会话出现」行为变更

## 并行 · Profile / 打包缺口

- [x] 多 Profile：目前仅 `profiles/research/`；未建 `paper` / `experiment` / `engineering` /
  `reviewer`（共享 research 能力；阶段 5 的 preset 粒度可被多 Profile 复用）
- [x] `--patch` 组合链验证：base → research policy → bgp research → experiment-specific patch
- [x] 命名定型 `dsh-routing-research`，内置领域词汇（README/脚本仍用 dsh research）
- [x] 一键部署：打包 `@basil/dsh-research`（npm）→
  `dsh plugin --profile research add @basil/dsh-research`（目前靠 deploy-profile.sh 本地 symlink）
- [x] 删除空占位 `patches/research-tools | policy | memory.yml`（随阶段 5 一并清理；
  policy / 模型注入改走 cordis.patch.yml + 插件行）

## 在研 · RPKI+BGPsec 安全缺口报告跟进（2026-10-08 已产出；`research/` 已 gitignore）

- [x] 归档：`research/` 三文件写回 Memory artifact store（报告自标 art-1…art-13）；
  `research/` 于 2026-10-09 加入 `.gitignore`，**不再 git add**
- [x] 修复 `research_campaign` 的 `attackClass` 透传缺陷（art-11）：`runAutomaticExperiment`
  构造默认 TopologyExecutor 时未传 `attack: opts.topologyConfig?.attack`，TO fallback 到
  `inferAttack(plan.scenario)` 覆盖显式 attackClass（`src/experiment/runner.ts:42`、
  `executors.ts:28-31`）；修复 = 显式透传 attack + 补测试
- [x] 真实网元验证：目标机安装 FRR（bgpd + RTR）+ BGPsec 后，`research_campaign env=frr` 复测
  同一 4 攻击 × 4 策略矩阵，替换 RouteEngineSim 机制先验；`executors.ts` 的 `simulated: true`
  目前硬编码，接入真实引擎后应随 engine 改写
- [x] 联网测量：补齐 ROA 覆盖 / ROV 强制落地 / BGPsec 部署占比真实观测，把 V7 / V8 / V9 从
  disputed（待外部验证的 Hypothesis）升级到 verified / rejected
- [x] ASPA / RFC 9319：路径政策场景加入拓扑抽象（`experiment/topology.ts`），量测其对
  "授权泄密/原主作恶"（V10）的增量收益
- [x] FRR / VPP 实时指标采集：vtysh / vppctl 解析实时 metrics；目前 Frr/VppTopology 只做二进制
  探测 + 渲染配置 + 回退 sim，无实时采样
- [x] V4 / V5 条件性 disputed 的展开：V4（ROV 高效但受 NotFound/覆盖前提限制）、V5（BGPsec 高效
  但受部分部署降级限制）需把"覆盖假设"参数化进 sim 网格再验证


## 在研 · 域间路由意图（AS Intent）调研跟进（2026-10-14 调研完成，报告 docs/domain-intent-survey.md）

- [ ] 真实网元复测：FRR/VPP 可用后复跑四攻击 × 四策略矩阵，把 rov/aspa 增量结论（subprefix
  +0.06、path-manip 0.65）从 sim 证据升级为真实网元证据（`executors.ts` simulated 随 engine 改写）
- [x] H-UNI 规模化扫描 · 网格复跑部分：AS 数 × 事件数网格（20 格 × 4 脚本，seed 20261016）
  已由 `run-sweep.ts` 完成并出报告 `docs/intent-sweep-report.md`（supportedRate 70% → 交叉尺度
  统一性 C 级 disputed；drift 统一态恒 0、分散随事件数增长；eventWrites/verify/audit 平均<1
  方向支持 T4-DS3；2026-10-16 归档 CHANGELOG）
- [ ] H-UNI 规模化扫描 · 剩余：论证统一/分散收益随规模变化与 ASPA「表达力↔可判定性」既有纪律的
  兼容性后再议 V3 是否升级（网格扫描 + CLI + 报告已完成，见上条）
- [ ] WeKnora 建库后正文级反证检索：RFC 9315/9234/ASPA/FC-BGP 全文检索「统一意图对象」
- [ ] 用户确认「跨 AS 安全意图」口径后，向 `src/domain/vocabulary.ts` GLOSSARY 增补
  「意图/intent」词条（唯一口径来源，未确认前不改）

## 里程碑

- [ ] 科研绘图（draw，2026-10-21 规划，用户确认后开工）= 只做**右侧栏「科研绘图」tab**（撤销 preset-draw / draw profile，TRIZ 同机制）+ research_draw 工具（paper 报告配图）+ 记录随会话持久化；图片后端双模式：**local**（mflux CLI 调 Qwen-Image-2.1）/ **api**（OpenAI 兼容 images API，侧边栏填 baseURL/apiKey/modelId），文本模型 dsv4；规划见文末「在研 · 科研绘图」小节。

- [ ] Paperclip dsh_local adapter 决策项（2026-10-15 备忘，未动工）= 可行性调研已完成：
  external adapter 插件机制 + `dsh --profile headless --json` 实测通过；推进路径与待核实点
  见文末「决策备忘 · Paperclip 接入」小节。用户明确本轮仅备忘、不做。

- [x] 问答 TRIZ 下线 · 侧边栏唯一化（2026-10-15）= 不再要求每个回答正文带「本回答对应的 TRIZ
  发明原理映射」（persona 原强制指令已移除），TRIZ 唯一展示面 = 右侧栏「TRIZ 发明原理说明」面板
  （research_triz 工具/自动映射 note，source=triz, confidence=0.5 待核验）；183/183 单测 + SMOKE
  PASS 无回归；真机「问答无 TRIZ 小节 + 侧栏面板正常」待用户确认
- [x] 阶段 9 完成（本轮）= TRIZa 闭环治理层（冻结评估契约+协议指纹 / 类型化变换契约 / FI-Ideality
  / 四类硬门晋升 / 可追溯记录 + 负证据保留，论文 docs/2610.04555v1.pdf）；183/183 单测 + SMOKE
  PASS（services 14/14, tools 15/15, engineering 8/8, triza=true）+ PACK OK；真机部署待用户
- [x] 联网搜索切换完成（部署侧，2026-10-15）= 弃用 dsh 内置 web 搜索，改 `dsh-web-search-plugin`
  （9 后端）；模板声明 + `deploy-profile.sh` 自动补装（与 weknora 同机制）+ 沙箱 SMOKE
  PASS（fresh deploy 自动装两插件 / 组合树 web.searchProvider=dsh-web-search +
  web-search-deepseek 禁用）；真机浏览器选后端待用户
- [x] 阶段 8 完成（`ce94b68`）= TRIZ 方法论接入（research_triz 工具 + triz skill）；146/146 单测 + SMOKE PASS（tools 14/14, engineering 7/7, triz=true）
- [x] 阶段 8.5 完成 = 右侧栏「TRIZ 发明原理」面板（host `/api/research.triz.notes` + client bundle `lib/client.js`）；151/151 单测 + SMOKE PASS（trizUi=true），暂无未完成子项
- [x] 阶段 8.7 完成（本轮）= 右侧栏面板可见性根因修复（client-modules 只认裸包名/两段 scope，
  首行改裸包名 `@basil/dsh-research` → 浏览器半边进 __DSH_BOOT__）+ 新增 research-triz-auto
  （每个最终回答 → session/event → mapResult → triz note → 右侧栏面板自动更新，每轮去重）+
  persona 每答自带 TRIZ 映射小节；168/168 单测 + SMOKE PASS（clientGraph=true, trizAuto=true），
  用户侧需重启 `dsh research` 生效
- [x] 阶段 8.6 完成 = 默认调用 TRIZ + 每次研究结果 ↔ 发明原理映射（`src/triz/result-map.ts` 双通道
  didactic/retrospective；autonomous 2.6 默认步骤写 triz note（右侧栏可见）；论文 §6 + 幻灯片 5c
  + research_triz resultText）；162/162 单测 + SMOKE PASS（autonomous triz entries: 3），暂无未完成子项
- [x] Phase 5 完成 = preset-research + 6 插件重构落地；SMOKE PASS 且 standard 会话无 research_*
- [x] Phase 4 完成（收尾）= 仅剩 16c real subagent、多 Profile、`--patch` 链、npm 一键部署、
  报告跟进
- [x] 全部完成 = `dsh research`（web 会话）一条指令跑完整科研流水线
  （RPKI+BGPsec 缺口 → 实验矩阵 → 核验 → 论文/幻灯片），且阶段 4/5 + 报告跟进全部关闭

## 在研 · 问答 TRIZ 下线 · 侧边栏唯一化（2026-10-15 起；沙箱已自测）

> 部署侧已落地（2026-10-15，本轮）：persona 不再要求每个回答正文带
> `### 本回答对应的 TRIZ 发明原理映射`（问答无 TRIZ 小节）；改为「可用 research_triz 工具产
> 假说（进右侧栏面板），但不得在回答正文追加 TRIZ 小节」，TRIZ 唯一展示面 = 右侧栏
> 「TRIZ 发明原理说明」面板（展示 research_triz 工具分析出的发明原理与推理链，全部为待核验
> 假说 source=triz, confidence=0.5）。`research-triz-auto` / `research_triz` 工具逻辑未动
> （侧边栏仍每轮自动/手动落 note）。沙箱已证：183/183 单测无回归；persona 块语法折叠正确。
> 以下真机验证依赖用户重启 `dsh research`（profile 配置 boot 时载入），沙箱无法开浏览器。

- [ ] 重启 `dsh research` 后，会话里跑一次普通问答，确认回答正文**不再出现**
  `本回答对应的 TRIZ 发明原理映射` 小节（问答干净，无 TRIZ 样板）
- [ ] 同一会话右侧栏「TRIZ 发明原理说明」面板**仍在且正常更新**：问一个研究问题 → 轮结束后
  面板出现该轮的 triz note（来源徽标 curated-matrix / heuristic-fallback + 候选原理 + 推导
  假说）；手动调用 `research_triz`（含 resultText）也能落 note 进面板
- [ ] 一致性确认：面板条目与问答正文不再「两套 TRIZ」冲突（问答不再自造 TRIZ 映射）

## 在研 · TRIZ 会话级持久化 + 中间生成结果逐段应用（阶段 10，2026-10-19 起；沙箱已自测 216/216 + SMOKE PASS）

> 沙箱侧已完成并提交 `af345ce`：统一 ArtifactStore（core.artifacts == memory.artifact）+ 5 profile
> `memory.dir` 落盘 + note meta 打 sessionId/step/final + triz-auto 按 step 逐段映射 + 侧边栏按会话
> 过滤/显示生成步序 + 每轮 persist()。持久化往返（boot→写→persist→重启→loadMemoryInto 还原）实测
> PASS。已存在部署需真机重跑 deploy + 重启 `dsh research` 生效，以下验证依赖用户侧。

- [ ] 真机重跑 `./dsh-research/scripts/deploy-profile.sh`（或 npm 一键部署）后重启 `dsh research`
- [ ] 同一会话问研究问题 → 轮内**每个实质中间 step + 最终答案**各落一条 triz note（侧边栏按会话
  过滤，卡片显示「生成步序：第 N 步（该轮最终答案 / 中间生成结果）」）
- [ ] 关闭 dsh 再重新打开（同一 profile / 工作目录的会话）→ 侧边栏「TRIZ 发明原理说明」记录仍在
  （随 `$DSH_HOME/profiles/<name>/memory/research-memory.json` 落盘 + 重启 loadMemoryInto 还原）；
  手动 `research_triz` 调用产生的无 sessionId note 在任意会话仍兼容可见
- [ ] 其它 profile（paper/experiment/engineering/reviewer）同样验证：重启后 TRIZ 记录不丢

## 在研 · TRIZa 真机部署验证（2026-10-15 起；沙箱已自测 183/183 + SMOKE PASS + PACK OK）

> 阶段 9 实现与沙箱自测已完成并提交。真机部署依赖用户在自己终端执行
> `DSH_HOME="$HOME/.dsh" ./dsh-research/scripts/deploy-profile.sh`（symlink 指向仓库，改
> dsh-research 立即生效）→ `dsh research` 启动 Web UI 会话（沙箱无法写 `~/.dsh` / 开浏览器）。

- [ ] 真机一键 deploy 后验证 `research_triza` 工具闭环：会话里传
  `problem/improving/worsening/candidateId/metrics/baselineMetrics/referenceUseful/
  referenceHarmful/gates(+integrity/safety/reproducibility/resource)/evidenceLevel/
  certifiedLevel` → 返回 64 位协议指纹 + promote/revise/reject/escalate 决策 + 追溯记录
  （triz_context.json / triz_strategy_plan.md / scores.jsonl / SHA256SUMS），落 artifact
  （kind=note, title^="triza: "）+ episodic（kind=triza）
- [ ] 验证「改任一评估协议绑定字段 → 新指纹」：同一 candidateId 改 split/preprocessing 后重跑
  `research_triza`，指纹变化、旧结果不被 silently 扩展（PROMOTE 到 incumbent 需走完整闭环）
- [ ] 阶段 8.5/8.7 右侧栏回归：research_triza 决策后 triz note 与 TRIZ 面板并存、面板正常更新
  （升级 `dsh research` 需重启生效）

## 在研 · WeKnora 对接真机验证（2026-10-10 起）

> 部署侧已落地（2026-10-10）：仓库模板声明 weknora（`profiles/research/package.json`
> bundles/dependencies + `cordis.patch.yml` 配置行），`deploy-profile.sh` 首次自动装插件、
> 重跑不丢（`DEPLOY_AUTO_PLUGINS=0` 可关）。沙箱已证：dump-config 组合树含配置行；插件在
> dsh 0.2.0-rc.2 加载并注册 4 工具；插件未装时 bundle/配置行被非致命丢弃不阻塞 boot。
> 以下真机验证依赖用户建库 + 配 API key，沙箱无法完成。

- [ ] 真机一键 deploy 后验证 `weknora_*` 四工具连通：
  `export WEKNORA_API_KEY='...'`（平台级 key 再加 `WEKNORA_TENANT_ID`）→
  `DSH_HOME="$HOME/.dsh" ./dsh-research/scripts/deploy-profile.sh`（首次自动装插件）→
  `dsh research` 会话里 `weknora_list_knowledge_bases` / `weknora_search` /
  `weknora_read_document` / `weknora_ask` 连通并带引用回答
  （先在建好知识库传 RFC/论文，步骤见 README「WeKnora」行动清单）
- [ ] dsh 0.2.0-rc.2 兼容性真机回归：沙箱已证插件在 0.2.0-rc.2 加载 + 4 工具注册；端到端检索
  仍需真机 WeKnora 服务确认（官方验证口径为 dsh 0.1.0-rc.8）；若工具契约破坏性变更，
  记录到 README / 反馈上游

## 在研 · 联网搜索切换 dsh-web-search-plugin（2026-10-15 起）

> 部署侧已落地（2026-10-15，本轮）：不再用 dsh 内置 web 搜索，改用插件
> `dsh-web-search-plugin`（v0.5.x，9 个后端）。仓库模板已声明
> `profiles/research/package.json` bundles/dependencies + `cordis.patch.yml` 配置行，
> `deploy-profile.sh` 首次自动装插件（weknora + web-search-plugin 同机制）、重跑不丢
> （`DEPLOY_AUTO_PLUGINS=0` 可关）。沙箱已证：fresh deploy 自动装两插件、已装跳过、
> 未装非致命警告不阻塞 boot；组合树 `web.searchProvider=dsh-web-search` +
> `web-search-deepseek` 禁用 + `dsh-web-search-plugin` 行就位；runtime-smoke SMOKE PASS。
> 以下真机验证依赖用户在浏览器操作，沙箱无法完成。

- [ ] 真机一键 deploy 后确认 `dsh research` 里 `web_search` 走插件后端：侧栏**插件**页可见
  `dsh-web-search-plugin` 组合包；**设置 → 网页搜索**卡片存在 9 个后端
  （DeepSeek 官方 / Tavily / Brave / Serper / SerpApi / Exa / SearXNG / Scavio / Firecrawl）
- [ ] 选定第三方后端（如 Tavily keyless 或 Exa）并保存后，会话里跑一次 `web_search`，确认
  返回真实结果且 `~/.dsh/logs` 无官方搜索模型调用（省官方 token）
- [ ] 恢复/切换验证：设置卡片切回 DeepSeek（官方）再切第三方，卡片保存即生效（无需重启插件）；
  宿主重置场景确认部署重跑后插件仍在（bundle 声明来自模板）

## 在研 · 域间路由意图调研 · 后续课题线（2026-10-15 三线合并综合报告后，可选）

> 已完成综合视角：`dsh-intent-survey/域间路由意图综合调研报告.md`（Track A/B/C 三线合并 +
> G1–G5 交叉缺口 + 课题建议 5 条 + 证据可追溯 E1–E16，check_references 29/29 通过，
> 归档于 CHANGELOG）；前置视角：`reports/域间路由意图全景调研-结论速览.md`、
> `reports/RPKI承载域间路由意图-调研报告.md`。以下为留出的可选深化线，勾选任一前接对应 claim
> 的关注证据。

- [ ] 跟踪 ASPA 状态：`draft-ietf-sidrops-aspa-*` 是否转 RFC，补「顾客 AS→上游传播授权」双向
  意图边（G2），并复核 RFC 9774 与 BCP 状态
- [ ] 对照 RFC 9871 BGP CAR / SCION path-authorization：把课题「三视图共识」表达模型做成可映射
  标准落点的 open schema（G3/G5）
- [ ] community 注入攻击面实验：恶意注入 well-known / NO_EXPORT / 自定义 community 对多源共识
  判定影响（G5/G4，可接 research_campaign 模拟验证）
- [ ] assurance 闭环指标：intent-compliance / drift 的输出口径加入课题建议 ③（G4，对齐 RFC 9315
  assurance 五部件）
- [ ] 轻核 claim：「RPKI 结构性不支持 RFC 9315 广义 IBN 意图（偏好/优化/时变/条件）」——
  research_verify 一票（G3 主线）

## 决策备忘 · Paperclip 接入（dsh_local adapter）可行性调研（2026-10-15 起；仅备忘，未动工）

> 需求：能否把 https://github.com/paperclipai/paperclip 在 dsh 中用起来（本质 multi-agent 交互）。
> 结论（证据分级：Paperclip 源码已读 + dsh headless 沙箱实测）：**可以，且是正统路线**——
> Paperclip = agent 团队编排/组织层（"公司"），dsh = 被管理的 agent runtime（"OS/运行时"），
> 两者互补不冲突，无需改 deepseek-harness / dsh-research 核心。
> - Paperclip 接入点 = **external adapter 插件**（独立 npm 包，启动自动加载，无需改其源码）：
>   `docs/adapters/creating-an-adapter.md` / `external-adapters.md`；注册与存储 =
>   `server/src/adapters/registry.ts`（buildExternalAdapters 并入内置表）+
>   `plugin-loader.ts` + `services/adapter-plugin-store.ts`（`~/.paperclip/adapter-plugins.json`）；
>   必实现 `src/index.ts(type/label/models/createServerAdapter)` +
>   `src/server/execute.ts(AdapterExecutionContext→AdapterExecutionResult)` + `test.ts`，可选 sessionCodec。
> - dsh 对应接口 = `dsh --profile headless [--json] [--session-id <id>] [<task>… | -]`：任务走 stdin、
>   `--json` 逐行事件流（session/status/text/thinking/tool_call/tool_result/error/final，
>   退出码随 turn_end.reason，usage 在 step_end），`--session-id` 续接持久化会话（cwd 须一致、
>   无日志报错不静默开新会话）——正好对上 Paperclip execute() 的 usage/sessionParams/clearSession。
>   沙箱实测：`--json -` 首行 session 事件 + turn_end.reason + final + stderr 只承载 `dsh:` 诊断。
> - 推荐路径 A：写独立 `dsh_local` adapter npm 包（约 150–300 行 TS，以 `codex_local`
>   `packages/adapters/codex-local/src/server/execute.ts` 为模板）+ profile 层组合
>   `base + dsh-headless + @basil/dsh-research`（= 阶段 3.5 时期 research profile 的 headless 形态，
>   research_*/TRIZ/preset-research 随 bundle patch 自动带上）→ Paperclip 管理多个 dsh research
>   会话（heartbeat 续聊/预算/治理/仪表盘）。路径 B（不引入 Paperclip）：multi-agent 交互 dsh 内部
>   已有（Research Director + 角色子 agent + 多 Profile），增量价值仅在跨 agent 组织/治理层。
> - 待核实（真的动工时一次实测即可）：① headless 复合 profile 下 preset 会话 resume 放行
>   （headless bundle 仅拒"无 preset roster"组合下的 preset 会话）；② headless profile 需叠加
>   `llm-pi-ai / local-interval-dsv4` 模型 overlay（否则默认 deepseek-official 缺 key 报错）；
>   ③ 真实模型下 step_end.usage 采样口径。
> 状态：本轮**未改动任何代码/仓库功能文件**，仅在 TODO.md 追加本条备忘（用户明确"先只添加这个，
> 先不做"）。

- [ ] 决策项：是否推进 Paperclip dsh_local adapter（路径 A）。若推进，顺序 =
  ① 本机装 Paperclip server 并跑通自带 codex_local 闭环 → ② profile 层建 headless+research 复合
  profile 验证会话 resume + 模型 overlay（不碰核心）→ ③ 写独立 `dsh_local` adapter 包并接入
  `~/.paperclip/adapter-plugins.json`

## 在研 · 科研绘图（draw，2026-10-21 规划；用户已确认「按规划修改 TODO.md 后开工」，已实现并自测，待真机验收）

> 需求与决策（用户 2026-10-21 确认）：
> - **不做独立 preset / profile**（preset-draw 撤销）：绘图只用**右侧栏「科研绘图」tab**
>   （TRIZ 同机制，两 tab 并列），不新增管理负担。
> - 侧边栏支持**模型/后端选择**：
>   - `local / Qwen-Image-2.1（mflux）` —— 本机 CLI 调 `~/llm/models/Qwen-Image-2.1`（**非驻留**）；
>   - `api（OpenAI 兼容 images API）` —— 侧边栏填 **baseURL / apiKey / modelId**（apiKey 支持
>     `${VAR}` 环境变量引用），走 `POST {baseURL}/images/generations`（Bearer 认证、
>     `{model, prompt, n:1, size, quality, response_format=b64_json|url 双处理}`；seed 可选）。
> - 参数口径：比例 10 种（默认 16:9）/ 分辨率**长边** 1K/2K/4K（默认 2K）/ 画质低20·中30·高50 步
>   （默认 高）。
> - 边界：垫图（1 张参考图）v1 **仅 local**（mflux edit 双模式：风格 0.4 / 内容 0.7 可滑），
>   api 模式标注「暂不支持垫图」；OpenAI 标准尺寸只固定几档，任意比例（21:10 等）先发精确
>   WxH、失败回退最近标准尺寸（尺寸策略开关）。ControlNet 列二期。
> - 文本模型 dsv4；`research_draw` / `research_draw_status` 两个 agent 工具供 **paper**
>   （research_paper 报告配图用）；research / experiment / engineering / reviewer 默认不出现
>   （tools `enableDraw: true` 一行可开，research-draw `config.enabled: false` 一行可关面板）。
> - 生成记录**随会话持久化**（复用阶段 10 ArtifactStore + persistMemory + 按 sessionId 过滤）。

### A · host 插件与路由（`src/plugin-draw.ts`，exports `./draw`）

- [x] `dsh-research/cordis.patch.yml`：`research-draw` 行（host 平面 9 → **10 行**，
  位于 research-triz-auto 与 research-director 之间），`config.enabled` 默认 true + 默认配置
  （local bin/model、outputRoot `~/Downloads/outputs`、sizePolicy `exact-then-fallback`）
- [x] **provider 抽象**：`DrawProvider` 双后端 —— local spawn mflux CLI（非驻留、并发 1）；
  api fetch OpenAI 兼容端点；统一 `DrawJobManager.submit → run → runLocal/runApi`
- [x] **4 条**鉴权 route（`ctx.connection.fetch.register`，inject ['connection']）：
  `POST /api/research.draw.generate`（provider + 参数 + 垫图 base64 → `{ jobId }`）、
  `GET /api/research.draw.status?jobId=`、`GET /api/research.draw.config`（enabled=false 仍挂）、
  `GET /api/research.draw.history?sessionId=`
- [x] `drawJobManager`：内存 job 表 + 并发上限 1 + disposer 终止（local 杀进程 / api AbortController）
- [x] 完成：输出 path + macOS `sips -Z 1024` 缩略图 base64（无 sips 回落整图）+ 写 artifact
  （kind=note, title^=`draw: `, meta.sessionId/params/outputPath）+ 会话持久化

### B · 参数计算与命令/请求组装（纯函数，单测覆盖）

- [x] `src/draw/dimensions.ts`：`sizeFor` —— 长边像素×比例、32 倍数对齐（local）/ api 尺寸
  字符串 + OpenAI 标准尺寸兜底表 + 越界校验 + 覆盖宽高
- [x] `src/draw/paths.ts`：`<outputRoot>/images/image-YYYYMMDDHHmmSS.png`（本地时区、固定格式、同秒序号）
- [x] `src/draw/local.ts`：mflux cmd 组装 —— txt2img / edit（+`--image-path --strength`）/
  可选负向、guidance、quantize + tqdm 进度解析
- [x] `src/draw/api.ts`：请求体组装（`images/generations`、Bearer、b64_json） + 响应处理
  （b64_json | url 双收）+ `${VAR}` 环境变量展开

### C · client 右栏面板（TRIZ 同机制；**无独立 preset/profile**）

- [x] `client/draw/definition.ts`：注册「科研绘图」tab（kind=draw-studio, id=@basil/dsh-research-draw-studio, order=2）
- [x] `client/draw/DrawTab.tsx`：prompt + 后端/模型选择 + api 折叠配置 + 垫图（仅 local）+
  比例/分辨率/画质分段 + 高级折叠 + 输出目录 + 生成/轮询/预览 + 会话级历史卡片
- [x] `client/draw/route.ts`：数据契约（config/generate/status/history parse + 兜底）
- [x] `/api/research.draw.config` 拉不到或 `enabled=false` → 空渲染
- [x] `client/index.ts`：注册 drawStudioDefinition + DrawTab body（与 TRIZ 同步两步注册）→ 重跑
  `scripts/build-client.mjs` 产出 `lib/client.js`（47391 bytes，含 draw-studio + triz-explainer）

### D · 记录持久化 + agent 工具

- [x] 生成记录落盘 + 重启 loadMemoryInto 还原 + 右栏按 sessionId 过滤（复用阶段 10；
  见 `collectDrawHistory` / `drawHistoryView`）
- [x] `src/plugin-tools.ts`：**两个**新工具 `research_draw`（提交 job + bounded 等待，超时返回
  jobId）+ `research_draw_status`（轮询）；仅 `enableDraw: true` 的 preset 注册
  （preset-paper：`enableDraw: true` + only 白名单 `+research_draw/+research_draw_status`，
  paper 10→**12**；research 保持 15、experiment 10 / engineering 8 / reviewer 8 不变）
- [x] `skills/draw/SKILL.md`：科研绘图纪律（图型规范/配色图例/分辨率字号/何时图何时表/
  research_draw → research_draw_status → 报告内嵌输出路径；local/api 模型选择说明）

### E · 测试 / 冒烟 / 文档 / 真机验收

- [x] 单测（`node --test "src/**/*.test.ts"`）**253/253 全绿**：`src/draw/*.test.ts` 24（dimensions
  各比例×分辨率 32 对齐 + 覆盖 + 越界 + api 尺寸回退；paths 时间戳格式；local txt2img/edit
  全参数断言；api 请求体 / b64_json+url 双响应）+ `plugin-draw.test.ts` 9（mock bin/mock fetch
  端到端、local/api/回退、持久化往返、history 过滤）+ `plugin-tools.test.ts` 4（draw 工具
  注册/惰性解析/execute）
- [x] `scripts/runtime-smoke.mjs` 待同步：services 14→15（researchDraw）、tools（research 15 /
  paper 10→12 / experiment 10 / engineering 8 / reviewer 8）、draw.config 路由可达、enabled=false
  无 research_draw、history 路由、trizAuto 面板回归（216→~230）
- [x] `scripts/pack.sh`：pack 必备条目 + plugin-draw.js + draw/{dimensions,paths,local,api}.js + skills/draw + client bundle
- [x] `AGENTS.md`（阶段 11 快照）/ `dsh-research/README.md` 口径更新（host 平面 **10 行** /
  services **15** / bundle 插件 **11**（host 10 = core/triz/triza/triz-ui/triz-auto/draw/
  director/experiment/writer/operations + preset tools 1）/ tools research **15**、paper **12**、
  experiment 10、engineering 8、reviewer 8；**无 draw profile、无 preset-draw**）
- [x] 白屏可见性（2026-10-21，提交 f3dafab）：点「生成」白屏 / CLI 无输出问题 ——
  浏览器端 error/unhandledrejection/面板渲染错误经 `POST /api/research.draw.debug` 上报，host 打印到
  `dsh research` 终端（前缀 `[dsh-research-draw]`）；DrawErrorBoundary 就地错误卡 + 重试；formatDate
  兜底防渲染崩溃；MAX_POLL_RETRY=6 轮询防永久卡死；5 条 route 挂载 + CLI 打印由 plugin-draw.test 新增
  的 apply() 路由测试锁定（254/254 全绿）。
- [x] 会话筛选 + 大图回读 + 侧边栏/TRIZ 滚动修复（2026-10-21 用户反馈「还是白屏」+ 三需求，5c68452）：
  host `src/plugin-draw.ts` 新增 `GET /api/research.draw.sessions`（`collectDrawSessions` 会话聚合
  `{sessionId,count,lastAt}` 降序，无会话归 `__no_session__`）+ `GET /api/research.draw.image?path=`
  （`readDrawImage` 回读本地图片：`~` 展开/扩展名校验/URL 编码容错/400·404·415）；DrawTab 会话筛选
  下拉（当前/全部/具体会话）+ 「清除历史」按筛选目标 + 完成卡/历史卡回读**原图** + 全屏大图遮罩 +
  fileExists=false 提示删除/重生成；`DrawTab.tsx`/`TrizTab.tsx` `styles.root` 补 `flex:1+minHeight:0+
  overflowY:auto` 修复 host CSS `.P3OORG_tabBody{overflow:hidden}` 导致的不滚动；route 6→**8 条**；
  单测 **260/260 全绿**（apply 路由测试 6→8 + collectDrawSessions/SESSIONS+IMAGE 路由/readDrawImage 3 例）。
- [x] 历史改 **stack 堆叠卡片**（2026-10-21，d825731）：每行 = 左 100×100 缩略图（原图回读 + 点击全屏
  大图）+ 右 `draw` 简要提示(title 单行省略) + 路径 + 尺寸/模型/日期 + 「查看大图」小按钮；host
  collectDrawHistory 按 createdAt 降序 = 最近在最上（后进先出），注释锁定；文件缺失左列红框
  「文件缺失」+ 删除/重新生成提示保留；lib/client.js 重建 66544 B；单测 260/260 全绿。
- [x] `skills/draw/SKILL.md` 新增「文字/图形错乱处理」（2026-10-21，1b70eee）：分类（文字是否关键）
  → 提示词纪律（≤2-3 标签/宁大勿小/4K+高步/多 seed/negativePrompt）→ 结构化 SVG/Mermaid 兜底 →
  两阶段混合（无文字底图 + PIL/SVG 叠字）→ 验收弃图规则。


- [ ] 真机（用户侧）：research 或 paper 会话右栏「科研绘图」→ local 默认参数 16:9/2K/高画质（**先重启
  `dsh research` 再操作**：点「生成」后观察 CLI 应依次出现 `[dsh-research-draw] submit → [start] →
  [done]/[failed]`；若仍白屏，CLI 会打出 `[client] [uncaught]/[unhandledrejection]/[tab-render]` 具体栈）
  出一张到 `~/Downloads/outputs/images/image-<ts>.png`；垫图风格/内容各一张；切 api 填
  baseURL/apiKey/modelId 出一张（按 OpenAI 兼容）；paper 会话 research_paper 流程里
  research_draw 出一张写入报告；重启会话记录仍在；experiment/engineering/reviewer 无此 tab
  扩展验收（本轮新功能）：**硬刷新浏览器**（Cmd+Shift+R — 旧白屏可能是缓存的旧 lib/client.js；若仍白屏，
  CLI 会打 `[dsh-research-draw] [client]` 具体栈）；右侧栏侧边栏与 TRIZ 面板**可滚动**；画一张后侧边栏
  出现会话下拉 → 切「全部会话 / 具体会话」看到记录、「清除历史」按会话清空、历史卡/完成卡点开**全屏大图**、
  删除本地图片文件后刷新历史出现「文件已缺失 → 删除记录 / 重新生成」提示。

- [x] 两阶段混合落地（2026-10-21，方案 C，提交 442925f）：`src/draw/overlay.ts`（parseOverlayLines /
  normalize / buildOverlayScript 内嵌 Python+Pillow / buildOverlayCommand / parseOverlayDims）+ 单测 8 例
  + `paths.ts` drawOverlayOutputName/Path + host 新增第 9 条 route `POST /api/research.draw.overlay`
  （探活 python3+Pillow → spawn 合成 → 缩略图 → 写 draw artifact 进历史 stack + episodic + persist），
  `DrawConfigView.overlay`（overlay.supported/pythonBin/reason）；client `route.ts`（drawOverlayUrl /
  DrawOverlayView / parseDrawOverlay）+ `DrawTab.tsx`（「无文字底图模式」checkbox 勾选自动追加无文字负约束 +
  「文字叠加」卡片：底图下拉（历史中仍存在）→ 标签多行输入 → 合成文字 → 预览/大图/错误）；lib/client.js
  重建；单测 **269/269 全绿**（261 基线 + overlay 纯函数 8 + OVERLAY route 假探活/假 spawn 端到端）。

- [ ] 真机验收（两阶段混合，方案 C 落地后）：重跑 `./dsh-research/scripts/deploy-profile.sh` → **硬刷新浏览器**
  （Cmd+Shift+R）→ research/paper 会话右栏「科研绘图」→ 勾选「两阶段混合：无文字底图模式（推荐）」生成一张
  无字底图 → 在「文字叠加」卡片选底图 → 输入 2-3 个标签（每行一个，如 `eBGP|x,20|@40|#ffffff|b`）→ 点
  「合成文字」→ 成品 `image-…-overlay.png` 进历史 stack、可点开**全屏大图**，放大逐字验收 **零错字**；
  本机无 python3+Pillow 时卡片应显示 `pip install Pillow` 提示；底图被删后下拉不可选该张（fileExists 探测）。
