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


## 里程碑


- [x] 阶段 8 完成（`ce94b68`）= TRIZ 方法论接入（research_triz 工具 + triz skill）；146/146 单测 + SMOKE PASS（tools 14/14, engineering 7/7, triz=true）
- [x] Phase 5 完成 = preset-research + 6 插件重构落地；SMOKE PASS 且 standard 会话无 research_*
- [x] Phase 4 完成（收尾）= 仅剩 16c real subagent、多 Profile、`--patch` 链、npm 一键部署、
  报告跟进
- [x] 全部完成 = `dsh research`（web 会话）一条指令跑完整科研流水线
  （RPKI+BGPsec 缺口 → 实验矩阵 → 核验 → 论文/幻灯片），且阶段 4/5 + 报告跟进全部关闭

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
