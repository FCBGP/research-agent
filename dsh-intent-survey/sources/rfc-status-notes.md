# 关键标准状态核验记录（sources/rfc-status-notes.md）

> 本文档记录「域间路由意图综合调研」本轮全部关键标准的核验事实与纠错决定，供综合调研报告与证据可追溯使用。
> 核验时间：2026-10-15；核验来源：RFC Editor（rfc-editor.org）、IETF Datatracker（datatracker.ietf.org）一手页面。

## 1. 定稿表述（一句话口径）

| 主题 | 定稿表述 | 状态 |
| --- | --- | --- |
| ASPA 验证算法 | `draft-ietf-sidrops-aspa-verification`，rev 28，题名 "BGP AS_PATH Verification Based on Autonomous System Provider Authorization (ASPA) Objects"；`rfc: null`；expires 2027-02-25；IETF 待定走向 Proposed Standard | 活跃 I-D，**非 RFC** |
| ASPA 对象 profile | `draft-ietf-sidrops-aspa-profile`，rev 29，IESG 阶段；`rfc: null`；expires 2027-01-31 | 活跃 I-D，**非 RFC** |
| RFC 9319 | *The Use of maxLength in the Resource Public Key Infrastructure (RPKI)*（Y. Gilad / S. Goldberg / K. Sriram / J. Snijders / B. Maddison，2022；BCP 185） | RFC（**与 ASPA 无关**，仅作 maxLength/伪造面引证） |
| RFC 9234 | *Route Leak Prevention and Detection Using Roles in UPDATE and OPEN Messages*（A. Azimov / E. Bogomazov / R. Bush / K. Patel / K. Sriram，2022；Proposed Standard；OTC 属性码 35） | RFC |

## 2. 逐条核验记录

1. **ASPA 验证算法**（datatracker API，2026-10-15）：`draft-ietf-sidrops-aspa-verification-28`，SIDROPS 工作组，intended RFC status = Proposed Standard，`rfc: null`，expires 2027-02-25 → **仍为 I-D，非 RFC**。
2. **ASPA 对象 profile**：`draft-ietf-sidrops-aspa-profile-29`，SIDROPS，IESG 阶段，`rfc: null`，expires 2027-01-31 → **仍为 I-D，非 RFC**（援引前次核验；本轮未重复 fetch）。
3. **RFC 9319**：题名验证 = maxLength in the RPKI；作者四项如上；BCP 185。→ **与 ASPA 无任何关系**；只用于 G3「maxLength 粒度 vs 伪造面」引证；BCP 185 同时含 RFC 7115 与 RFC 9319。
4. **RFC 9234**：精确题名 = …Prevention and **Detection** Using Roles in UPDATE and OPEN Messages（旧写 "…Mitigation…" 属错误）；作者 Azimov/Bogomazov/Bush/Patel/Sriram；Proposed Standard；2022；OTC 属性（code 35）；摘要直接引用 RFC 7908 的 route leak 定义。
5. **RFC 9047 剔除**：= *EVPN ARP/ND Flags*（2021），与 BGP 意图无关；已从社区语境删除。BGP community 只保留 RFC 1997（BGP Communities）+ RFC 7999（BLACKHOLE）+ RFC 8092（Large Communities）。
6. **RFC 7115**：*Origin Validation Operation Based on the RPKI*（R. Bush，2014-01；BCP 185）✓。
7. **RFC 9582**：*A Profile for Route Origin Authorizations (ROAs)*（2024-05；Obsoletes RFC 6482）✓。
8. **RFC 8092**：*BGP Large Communities Attribute*（2017-02）✓。
9. **RFC 9774**：*Deprecation of AS_SET and AS_CONFED_SET in BGP*（2025；Obsoletes RFC 6472）；摘要涉及 RPKI-ROV（RFC 6811/6907/9319）起源 AS 歧义 ✓。
10. **RFC 7908**：*Problem Definition and Classification of BGP Route Leaks*（Informational，2016-06）✓。
11. **RFC 9871**：*BGP Color-Aware Routing (CAR)*（2025）；AIGP（RFC 7311）参与 bestpath ✓。
12. **RFC 9329/2024 版 ROA…**（不适用，无此条目）。
13. **RFC 9315**：*Intent-Based Networking - Concepts and Definitions*（IRTF NMRG Informational，2022-10）✓。intent = wanted outcome；逻辑环路五部件（表达/翻译/解析/激活/保证）。
14. **RFC 8205 / 8206**：BGPsec 协议 / 部署考量（2017）→ 运行时路径证明，非意图语言，明确排除 ✓。
15. **SCION**：`draft-dekater-panrg-scion-overview-06`（IRTF PANRG overview，作者含 Rustignoli/Perrig，非 RFC）→ 唯一数据面路径意图载体（表述保留"最近"）。
16. **RFC 2622 / 4012**：RPSL / RPSLng ✓。
17. **RFC 6811 / 8210**：BGP Prefix Origin Validation（2013）/ RPKI-to-Router Protocol v1（2017）✓。
18. **RFC 6480 / 6482**：RPKI 基础设施（2012）/ ROA profile v1（2012）✓。
19. **RFC 4271**：BGP-4（2006）✓。
20. **检索证据**：datatracker 文档检索 `name__icontains=asintent` → 0 命中；`as-intent` → 仅 draft-li-teas-intent-based-routing（TEAS，2022-04-28 过期）；`intent` 全量 206 项均非路由安全领域。

## 3. 纠错历史（本轮与前序累计）

- 「ASPA 验证算法已 RFC 9319 化」——**错误，已纠正**。实测 ASPA 验证算法仍为 I-D（rev 28），`rfc: null`；RFC 9319 是 maxLength BCP，与 ASPA 无关。
- RFC 9047 曾误记为「BGP community 可注入信令之一」——**错误，已删除**。实测为 EVPN ARP/ND Flags（2021）。
- RFC 9234 旧写「…Mitigation Using Roles…」——**题名精确化**为 "…Prevention and Detection Using Roles in UPDATE and OPEN Messages"。
- RFC 9583 曾疑似 = ASPA——**禁引**：实为 *Application Scenarios for the Quantum Internet*（IRTF QIRG，2024）。

## 4. Doc 层旧表述修正（git 可查）

- `docs/域间路由意图-调研与TRIZ机制方向.md` §2 意图 2 ：「ASPA（RFC 9319 路径政策验证）」→「ASPA（双 I-D，未 RFC 化；与 RFC 9319 maxLength BCP 无关）」。
- `docs/domain-intent-survey.md` §2.3 标题与表 2-6-1-1「草案，RFC 9319 路线」→「I-D（验证算法 + 对象 profile，均未 RFC 化）」。
- `docs/research-agent-migration-plan.md`（ASPA·RFC 9319 场景）→「ASPA 场景（双 I-D，未 RFC 化）」。
- 注：`reports/` 两份既有报告已采用修正后口径（ASPA 双 I-D、RFC 9319 = maxLength），无需再改。
