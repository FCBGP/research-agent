# 调研证据日志（sources/survey-evidence-log.md）

> 本文档把「域间路由意图综合调研」的证据→claim 映射固化为可追溯日志，配合综合调研报告 §八证据索引使用。
> 核验时间：2026-10-15。类型：Fact / Hypothesis / Interpretation / Result。

## 证据→claim 映射

| ID | 证据 claim | Type | 置信 | 原始来源 | 核验方法 |
| --- | --- | --- | --- | --- | --- |
| E1 | RFC 9315：intent = wanted outcome；IBN = 持续保证范式；逻辑环路五部件 | Fact | 0.95 | rfc-editor.org/info/rfc9315 | 原文核验 |
| E2 | ASPA 验证算法 `draft-ietf-sidrops-aspa-verification`（rev 28）与对象 profile `draft-ietf-sidrops-aspa-profile`（rev 29）均为活跃 I-D，**未 RFC 化** | Fact | 0.95 | datatracker API | 状态核验 2026-10-15 |
| E3 | RFC 9319 = *The Use of maxLength in the RPKI*（BCP 185），与 ASPA 无关 | Fact | 0.95 | rfc-editor.org/info/rfc9319 | 原文核验（纠错） |
| E4 | RFC 9234：Roles + OTC（属性码 35），route leak 预防与检测 | Fact | 0.95 | rfc-editor.org/info/rfc9234 | 原文核验（题名精确化） |
| E5 | RFC 9047 = EVPN ARP/ND Flags，与 BGP 意图无关（已剔除）；BGP community = RFC 1997/7999/8092 三件 | Fact | 0.95 | rfc-editor.org | 原文核验（纠错） |
| E6 | BGP Community：well-known + 私有语义碎片化、无统一注册表、可被劫持者注入 | Fact + Interpretation | 0.8 | RFC 1997/7999/8092 | 属性格式 + 语义分析 |
| E7 | RPSL/IRR：表达力强但无密码学签名、声明可伪造 | Fact + Interpretation | 0.85 | RFC 2622/4012 | 原文核验 |
| E8 | ROA/ROV 家族：ROA = 前缀→被授权起源 AS 的签名声明；ROV 判 Valid/Invalid/NotFound | Fact | 0.95 | RFC 6480/6482/9582/6811/7115/8210/9319 | 原文核验 |
| E9 | BGPsec = 运行时路径证明，不表达"意图语言"，排除在意图载体之外 | Interpretation | 0.85 | RFC 8205/8206 | 原文核验 |
| E10 | RFC 9774 弃用 AS_SET/AS_CONFED_SET（Obsoletes RFC 6472），涉 RPKI-ROV 起源 AS 歧义 | Fact | 0.9 | rfc-editor.org/info/rfc9774 | 原文核验 |
| E11 | RFC 7908 定义并分类 route leak（问题定义与检测），无意图声明/反馈闭环 | Fact | 0.9 | rfc-editor.org/info/rfc7908 | 原文核验 |
| E12 | SCION overview = I-D（非 RFC）；数据面显式路径段选择 = 唯一数据面路径意图载体 | Fact | 0.8 | datatracker draft-dekater-panrg-scion-overview-06 | 状态核验 |
| E13 | BGP CAR（RFC 9871，Color + AIGP RFC 7311）＝最近似域间 IBN 的标准机制，但受场景限制；SR（RFC 8402）为数据面路径指令 | Fact + Interpretation | 0.75 | rfc-editor.org | 原文核验 |
| E14 | RPKI 部署测量：ROA Valid IPv4 60.3% / IPv6 60.9%；有效 ROV 部署 ≈6.5%（声明—行为落差） | Fact | 0.7 | larus.foundation / APNIC 2026 | 页面核验 |
| E15 | 实验侧窄证据：RPKI-INTENT-ROV-*（≈0.79/0.55）、triz-feedback-01（det 0.7917/fp 0.0187），全部 disputed | Result（窄） | 0.6 | RouteEngineSim 确定性模拟 | 实验归档 |
| E16 | datatracker 名称检索 asintent → 0；as-intent → 过期 draft；无统一路由意图对象工作项 | Fact | 0.9 | datatracker 检索 | 检索核验 |

## 使用说明

- 本日志证据按「综合调研报告：域间路由意图综合调研报告.md」§八证据索引（表 8-1-1-1）组织；RFC/草案状态见 `rfc-status-notes.md`。
- **证据可得性说明**：RFC 9315、ASPA 双 I-D、RFC 9871、SCION overview 不在本项目 WeKnora RFC 库检索命中范围内（多次检索 Nothing），相关判定以标准原文 + datatracker + 外部线索立证，如实标注，不冒充库内检索结果。
- E15 仅为**窄假设实验证据**：确定性模拟（RouteEngineSim）单点/低复现，不能支撑广泛调研结论；后续须在 FRR/VPP 真机或更高复现轮次上核验。
