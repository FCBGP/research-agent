# 领域知识笔记（Domain Knowledge Notes）

> **状态：暂存归档（2026-10-10）**。领域知识（「某机制是什么」）**不是 Skill**——
> Skill 是程序性能力（experiment 实验纪律 / paper-review 审稿工作流，见 `dsh-research/skills/`）。
> 2026-10-10 起把原 `dsh-research/skills/{bgp,bgpsec,fcbgp,rpki}` 这 4 张「参考速查」从 skill 目录
> 迁入本笔记：一句话口径以 `dsh-research/src/domain/vocabulary.ts`（GLOSSARY）为准；
> 详细知识最终迁入 **WeKnora 知识库**（Knowledge Plane，RAG 检索，见仓库 README「WeKnora 知识库对接」）。

> ⚠️ 本笔记为**非权威速记**，仅供研究起步参考；写论文/下结论前请以**原始来源**为准
> （RFC、IETF 草案、顶会论文，上传到 WeKnora 知识库后由 `research_search` / `weknora_search` 溯源）。

---

## BGP（边界网关协议）

- BGP 是路径向量协议：AS 间传递最佳路径，通过 AS_PATH / NEXT_HOP 等属性。
- 前缀公告可信度依赖**信任链**：BGP 本身不做「该 AS 是否有权宣告」验证 → 劫持根源。
- 常见攻击面：
  - prefix / sub-prefix hijack（未授权宣告他人前缀）
  - AS_PATH 操纵（伪造路径、缩短路径制造"更优"）
  - AS_SET 注入、路由泄漏（局部泄漏 / 跨社区泄漏）
- 检测角色分工：
  - **源验证**：RPKI / ROV（ROA 限定来源 AS）→ `research_campaign validator=rov`
  - **路径验证**：BGPsec（AS 签名链）→ `research_campaign validator=bgpsec`
  - 运行/事态检测：BGPStream / Artemis / 数据平面探测
- Metrics（与 `src/experiment/stats.ts` 四口径对齐）：detection_rate / false_positive_rate /
  convergence_time / verification_latency。

## RPKI / ROV（资源公钥基础设施与源验证）

- **ROA**（Route Origin Authorization）：RpkiSignedData 声明「前缀 → 合法来源 AS」。
- **依赖方 / Validator**（Routinator、RPKI-RTR）：抓取仓库、校验签名、产出 VRP 表。
- **RPKI RTR 协议**：路由器从缓存拉 VRP（FRR 的 `rpki rtr 192.0.2.1 port 8282` 即此路径，
  见 `src/experiment/topology.ts` renderFrrConfig）。
- 验证结果三态：Valid / Invalid / NotFound（AS0 为显式禁止）。
- 攻击与缺口：劫持者常利用 **NotFound**（覆盖不全 / PDB 偏差）与 **sub-prefix** 细粒度绕过；
  ROA 生命周期（签发→传播→存活窗口；密钥撤销/过期引入 verification_latency）；
  ROV 策略强弱：reject Invalid > drop > 仅打 tag。
- 实验对照：`validator=none`（基线）vs `validator=rov`——ROV 抬高 detection_rate 但略抬
  false_positive_rate → 用 `summarizeDetection` 的 effectiveScore 权衡。

## BGPsec（RFC 8205，路径验证）

- 为目标前缀与 AS_PATH 中每个 AS 提供**数字签名链**。
- 路由器开启 BGPsec 后只接受签名字段完整且有效的 AS_PATH
  （`bgp bestpath bgpsec-as-path`，见 topology.ts FrrTopology 渲染）。
- 防御侧重**路径操纵**：无法仅靠伪造 AS_PATH 把路由"变好"。
- 部署现状与局限：需逐 AS 升级（签名/验签 CPU、密钥轮换）→ 实际部署稀疏，覆盖率是短板。
- 与 ROV 互补：ROV 管「来源是否授权」，BGPsec 管「路径是否被篡改」；
  联合 `rov+bgpsec` 对 prefix-hijack / path-manipulation 均有最高 detection 区间。
- 实验对照：`validator=bgpsec` 对 `attackClass=path-manipulation` 应显著优于 `validator=rov`
  （ROV 对路径操纵检测率低）。

## FC-BGP（Forwarding Commitment BGP）※ 2026-10-10 概念修正

> **旧定义错误**（已废弃）：此前仓库写「FC-BGP = Function-Composed BGP，功能组合式 BGP，
> 无人机群组网、4 功能平面」——**这是错的**，与领域研究无关。

- **正确定义**：FC-BGP = **Forwarding Commitment BGP**，基于「转发承诺（Forwarding
  Commitment, FC）」的 BGP 安全研究方向：AS 对外**声明自己实际的转发行为承诺**，
  使下游/其他 AS 可据此**验证 AS_PATH 与转发行为是否一致**，用于缓解**路由泄露 /
  路径劫持 / 恶意中转**。
- **出处（权威参考）**：IETF **SIDR / IDR** 工作组方向的活跃工作项（**草案阶段，尚非 RFC**）：
  - IETF 122 IDR/SIDR 幻灯：*FC-BGP: Towards Secure Inter-domain Routing via Verifiable
    Routing Commitments*（Progress Update）
  - IETF 123 SIDR：*Forwarding Commitment BGP Testbed and Deployment Experience*
  - IETF 122 SIDR（hackathon）：*Using Forwarding Commitments (FCs) to Verify BGP AS_PATH*；
    *Enhancing Inter-domain routing security with Forwarding Commitment-based BGP (FC-BGP)*
  - 相关概念常与「可验证路由承诺 / 数据面验证」一同出现；论文与草案原文请上传
    WeKnora 知识库后检索（`weknora_search` / `research_search` 关键词
    `forwarding commitment`、`forwarding commitments (FCs)`、`FC-BGP`、`verifiable routing commitments`）。
- **与 RPKI/BGPsec/ASPA 的关系**：RPKI 验来源、BGPsec 验路径、ASPA 验上游授权；
  FC 是**声明+验证转发行为**的一类补充/备选思路，仍处研究探索期，结论须绑定
  实验与原文证据（Verification Loop），不可当已部署事实。

---

*迁移记录：2026-10-10 由 dsh-research/skills/{bgp,bgpsec,fcbgp,rpki}/SKILL.md 迁入；
skill 目录仅保留程序性 skill（experiment / paper-review）。*
