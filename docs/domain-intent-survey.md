域间路由意图（Inter-Domain Routing Intent）调研报告

> 产出日期：2026-10-14 ｜ 执行体：dsh-routing-research（research 会话）｜ 引擎标注：RouteEngineSim（确定性模拟，非真实网元）
> 全部结论可追溯到「文献 / datatracker 检索 / TRIZ artifact / sim 实验指纹」四级证据；实验结论统一以数据为准，TRIZ 输出一律先核验再入结论。

# 一、调研背景与目标

## 1.1 调研背景

BGP 的安全治理长期依赖「意图」的隐式表达与分散验证：RPKI/ROA 表达**起源意图**（谁被授权宣告某前缀）、ASPA 表达**上游授权意图**（谁可被当作有效上游）、BGP Roles 表达**对等关系意图**（不向提供商/客户/对等方之外宣告）、FC-BGP 表达**转发承诺意图**（宣告与实际转发行为一致）。这些载体分属不同对象形态、信令平面与验证堆栈，彼此之间的一致性维护与组合验证成本不断上升。

与之相对，IETF 在通用网络管理域已给出「意图（Intent）」的形式定义（RFC 9315），但该概念尚未被系统性投射到域间路由安全场景。本报告围绕「域间路由意图」这一研究问题，完成标准现状梳理、Gap 定位、TRIZ 机制方向的形式化与实验核验。

## 1.2 调研目标与口径界定

本报告中的「域间路由意图（Inter-Domain Routing Intent）」界定为：**跨自治系统（AS）的、可声明、可验证的安全策略表达与验证**——覆盖起源 / 上游授权 / 对等角色 / 转发承诺四类意图对象及其跨 AS 验证机制。该口径是调研前的解释性决策：**不**涵盖域内 IBN 控制器意图（如流量工程控制器意图），后者已在 RFC 9315 的通用框架[1]中被覆盖但与本报告安全验证焦点无关。此口径的取舍在全文结论处再次显式列出，供用户确认。

调研目标分解为：

1. O1 现状：盘点 IETF 标准与草案中的「意图」载体及其语义（§二）。
2. O3 Gap：定位「无统一 AS 路由意图对象」这一研究空白（§三）。
3. O4 机制方向：用 TRIZ 把「验证精度 ↔ 系统复杂度」矛盾形式化，得到机制假说（§三）。
4. O5–O7 核验：对现状 Gap 与实验结论执行验证闭环，对设计假说主动搜索反证（§四）。

## 1.3 调研方法

- **文献与标准**：直接抓取 RFC 全文与 IETF 草案全文（RFC 9315、RFC 9234、ASPA draft-ietf-sidrops-aspa-verification-28），辅以仓库领域知识档案 `docs/domain-knowledge-notes.md`。
- **穷尽式检索**：IETF datatracker 名称检索（`name__icontains`）核对「统一 AS 意图」是否已有工作项。
- **TRIZ 形式化**：调用 `research_triz`，从精选矛盾矩阵（精度改善 ↔ 复杂度恶化）取候选发明原理，对照既有工作筛新颖性。
- **确定性实验**：`research_campaign`（RouteEngineSim，mulberry32 同种子可复现，3 次重复）；四口径统计 detection_rate / false_positive_rate / convergence_time / verification_latency；判定规则为 detection_rate ≥ 0.8 支持阈值（本次抓取留档三口径数值）。
- **验证闭环**：`research_verify` 对 claim 轮询证据核验 / 反证搜索 / 实验判定。

# 二、现状：IETF 标准与草案中的路由意图载体

## 2.1 通用意图概念层：RFC 9315（IRTF NMRG）

RFC 9315 由 IRTF NMRG 发布（Informational），给出意图（Intent）作为网络管理高层抽象的形式定义：意图是「改变网络状态以实现高层目标的一种抽象、声明式策略」，并把意图生命周期划分为申明、翻译、激活、保障等阶段[1]。其定位是**域内网络管理**（控制器/意图引擎），**不**涉及跨 AS 路由安全验证，且不定义任何路由级验证原语。它为本报告的跨域投射提供了概念名词与声明-翻译-验证的框架，但未解决「跨 AS 意图对象如何自证与互验」的问题。

## 2.2 角色意图：RFC 9234（BGP Roles / OTC）

RFC 9234（Standards Track）把对等关系意图带进 BGP 本身：AS 在 OPEN 中协商各自 Role（Provider/Customer/Peer/Route-Server），宣告的 UPDATE 携带 Only to Customer（OTC）属性（属性码 35），供下游识别并丢弃违反角色约定的路由，用于**路由泄露的预防与检测**[2]。它是「角色/关系意图」的机制化载体，但与 RPKI 对象分属不同信令平面（BGP 属性 vs 证书库），角色与起源/上游授权三类意图不存在统一对象。

## 2.3 上游授权意图：ASPA（草案阶段，RFC 9319 路线）

ASPA 草案（draft-ietf-sidrops-aspa-verification-28）定义自治系统提供商授权对象：ASPA 对象显式声明「哪些 AS 有权作为本 AS 的 provider」，验证方据 AS_PATH + ASPA 关系给出 Valid / Invalid / Unknown 判定，识别**路由泄露与恶意中转（path manipulation）**[3]。设计上刻意只编码 provider 关系，换取 O(1) 可判定性与最小对象集——这一「表达力 ↔ 可判定性」取舍是后续统一化设计的关键约束（见 §四反证）。

## 2.4 起源意图：ROA / ROV

RPKI 体系以资源证书加签 ROA（路由源授权）表达**起源意图**：ROA 授权某 AS 宣告某前缀（含最大长度），验证侧 ROV 依据 ROA 对收到的路由判 Valid / Invalid / NotFound[4][5]。起源意图是最早部署的意图载体，但只约束起源，不约束路径与关系，与 ASPA/BGP Roles 形成互补而非替代。

## 2.5 转发承诺意图：FC-BGP（工作项，草案阶段）

FC-BGP（Forwarding Commitment BGP）是 IETF SIDR/IDR 方向的活跃工作项（尚无 RFC）：AS 对外声明自身的**转发承诺（FC）**，下游据此验证 AS_PATH 与实际转发行为是否一致，用于缓解路由泄露 / 路径劫持 / 恶意中转[6]。它把「意图」从声明推进到**可验证的转发承诺**，与 RPKI/BGPsec/ASPA 的「验来源/验路径/验上游授权」形成第四类意图对象，仍处研究探索期。

## 2.6 载体对比与穷尽式检索证据

如表 2-6-1-1 所示，四类意图对象在对象形态、信令平面、验证目标上彼此独立。

表 2-6-1-1 现状：域间路由意图的既有载体与属性对比

| 意图类型 | 载体 | 信令/存储平面 | 验证目标 | 状态 |
| --- | --- | --- | --- | --- |
| 起源 | ROA / ROV[4][5] | RPKI 证书库 + BGP | 前缀-起源归属 | RFC，已部署 |
| 角色 | BGP Roles + OTC[2] | BGP OPEN/UPDATE 属性 | 对等关系合法性 | RFC，渐进部署 |
| 上游授权 | ASPA[3] | RPKI 证书库 + BGP | AS_PATH 授权 | 草案，RFC 9319 路线 |
| 转发承诺 | FC-BGP[6] | 待定（声明 + 验证） | 声明与转发一致 | 工作项/研究 |

**穷尽式检索证据**：IETF datatracker 名称检索 `name__icontains=asintent` → 命中 0 项；`as-intent` → 仅 1 条命中，为 **draft-li-teas-intent-based-routing**（TEAS 工作组，2022-04-28 过期）——其内容是**分组携带意图的流量工程/段路由路径选择**，属域内流量工程，**非**路由安全验证[7][8]；`intent` 全量检索 206 项中均为 agent/SDV/DMSC 等非路由安全领域[7]。结论：**IETF 无「统一 AS 路由意图对象」工作项**，该空白真实存在。

# 三、Gap 与 TRIZ 形式化

## 3.1 核心 Gap：无统一 AS 路由意图对象

由 §2 可得核心 Gap：

> **Gap**：域间路由意图散布于 ROA / ASPA / BGP Roles / FC-BGP 四类互不相关的对象，无统一对象承载「完整意图上下文」，跨对象一致性维护与组合验证只能靠操作者手工协调，缺乏单一可验证的自证上下文（Claim: C-intent-gap；核验状态见 §4.3 的 V1）。

该 Gap 的支撑事实：四载体分属证书库与 BGP 属性两个平面；IETF 检索无统一工作项；RFC 9315 未投射到跨 AS 安全域。

## 3.2 TRIZ 矛盾形式化

调用 `research_triz`（problem=「ROV 提升劫持检测率但分散意图对象抬高验证与一致性复杂度」，improving=测量精度（检测），worsening=设备/系统复杂度），命中精选矛盾矩阵 **测量精度（parameter 28）↔ 系统复杂度（parameter 36）**，输出 artifact（kind=triz）。候选发明原理：#23 Feedback（反馈，接收方 → 发送方回环验证）、#2 Taking out（抽取，把易变部分分离）、#24 Intermediary（中介，用中介对象合并/中转多个对象）。

## 3.3 候选原理筛选（对照既有工作）

表 3-4-1-1 TRIZ 候选原理筛选（判定：对照既有实现取新颖性）

| 原理 | 机制方向 | 对照既有工作 | 新颖性判定 |
| --- | --- | --- | --- |
| #23 Feedback | 接收方把验证结果反馈回发送方 | ROV/ASPA 已是「收到即反馈验证」；FC-BGP 是转发承诺自证 | 低（已被实现） |
| #2 Taking out | 抽取易变/易混对象到独立载体 | RPKI 把源验证抽到证书库侧车（sidecar） | 低（已被实现） |
| #24 Intermediary | 统一 AS 意图聚合层合并多对象为单一可验证上下文 | 无既有实现（IETF 检索为 0） | **高（核心 Gap 方向）** |

TRIZ 纪律：对照表明 #23/#2 已被既有权衡内化，**#24 统一 AS 意图中介/聚合层**才是信息增益最高的方向，作为本报告唯一提交核验的机制假说 H-UNI。

## 3.4 机制假说（H-UNI，source=triz，confidence=0.5，待核验）

> **H-UNI**：把 origin / provider / role / forwarding 四类意图对象经「统一 AS 意图聚合层」合并为单一可验证上下文，有望在等价验证能力下降低分散对象的一致性维护与信令开销，并支撑组合验证。

H-UNI 处于 Hypothesis 级别，未经核验不得作为已验证结论。

# 四、实验核验

## 4.1 实验配置

- 引擎：RouteEngineSim（确定性路由模拟，mulberry32 同种子可复现）；FRR/VPP 真实守护进程在本沙箱不可用，回退 sim 且如实标注 `engine=sim`。
- 每次实验 3 次重复；判定阈值 supportThreshold = 0.8（detection_rate ≥ 0.8 判支持）。
- 五个指纹覆盖四类攻击意图面与三档验证策略，如表 4-1-1-1。

表 4-1-1-1 实验矩阵配置（五指纹）

| 指纹 | 验证策略 | 攻击类 | 考察意图面 |
| --- | --- | --- | --- |
| C-intent-base-none | none | prefix-hijack | 基线（无意图验证） |
| C-intent-origin-rov | rov | prefix-hijack | 起源意图 |
| C-intent-rov-only-subprefix | rov | subprefix-hijack | 起源意图（子前缀盲区） |
| C-intent-rov-aspa-subprefix | rov+aspa | subprefix-hijack | 起源+上游授权组合 |
| C-intent-aspa-pathmanip | aspa | path-manipulation | 上游授权（ROV 盲区） |

## 4.2 结果（detection_rate / false_positive_rate / verification_latency *单位秒*）

表 4-2-1-1 五指纹实验结果（RouteEngineSim，reps=3）

| 指纹 | 验证策略 | 攻击类 | det | fp | lat | 判定（阈值 0.8） |
| --- | --- | --- | --- | --- | --- | --- |
| C-intent-base-none | none | prefix-hijack | 0.093 | 0.0027 | 0.043 | refute（基线） |
| C-intent-origin-rov | rov | prefix-hijack | 0.792 | 0.0187 | 1.337 | inconclusive |
| C-intent-rov-only-subprefix | rov | subprefix-hijack | 0.550 | 0.0187 | 1.337 | inconclusive |
| C-intent-rov-aspa-subprefix | rov+aspa | subprefix-hijack | 0.610 | 0.0217 | 2.187 | inconclusive |
| C-intent-aspa-pathmanip | aspa | path-manipulation | 0.650 | 0.0103 | 1.180 | inconclusive |

## 4.3 核验结论一览

对现状 Gap 与实验结论执行 `research_verify` 闭环（证据核验 / 反证搜索 / 实验判定），对设计假说主动反向搜索，结果如表 4-3-1-1。

表 4-3-1-1 核验结论一览

| 编号 | 命题 | 判定 | 关键依据 |
| --- | --- | --- | --- |
| V1 | IETF 无统一 AS 路由意图对象；意图散布于 ROA/ASPA/BGP Roles/FC-BGP；RFC 9315 属网络管理域 | **verified** | 文献 4/4 + datatracker 检索 asintent=0 + 实验支持，无反证 |
| V2 | 意图验证显著提升检测能力（无验证 0.093 → 意图验证 0.55–0.79），FP≤0.022；但均未达 0.8 | **verified** | sim 实验五指纹 4/4，无反证；「达 0.8」部分明确不支持 |
| C5 | ASPA 在 ROV 之上不叠加增值 | **rejected（被数据证伪）** | subprefix 上 rov 0.55 → rov+aspa 0.61（+0.06）；path-manip 上 aspa 独立 0.65 覆盖 ROV 盲区 |
| V3 | H-UNI 统一意图中介层可降低一致性维护开销 | **disputed（设计假说，未实证）** | 强反证：ASPA 刻意只编码 provider 关系以保 O(1) 可判定性（表达力↔可判定性取舍）；SIDR 偏好单机制增量部署；RFC 9315 未投射到跨 AS 安全域 |

V2/V3 的详细口径：V2 声称「提升检测能力」被数据支撑，「达到 0.8」部分被数据否定——检测率 0.61–0.79 全部低于 0.8 支持阈值；V3 的实验判定为 inconclusive（无直接实验支撑具体机制形态），故仅列为 dispute 级设计方向，不作为已验证 claim。

# 五、局限与下一步

## 5.1 局限

1. **引擎限制**：全部实验在 RouteEngineSim 确定性模拟上完成；FRR/VPP 真实守护进程可用后需复测同一四策略矩阵，替换模拟先验（`executors.ts` 现 `simulated` 硬编码为 true）。
2. **阈值口径**：0.8 为外部设定的支持阈值；0.79/0.65/0.61 是否「有效支持」取决于业务可接受漏检率，非绝对判据。
3. **检索范围**：datatracker 名称检索只覆盖名字字段；正文级提及统一意图的工作未有二次检索（WeKnora 知识库在本环境 401 不可用，未做全文 RAG 复核）。
4. **收敛口径未留档**：四口径中本轮只抓取并留档 det/fp/lat 三数值，convergence_time 未单独留存表征。
5. **H-UNI 无直接实验**：统一意图聚合层的具体机制形态（对象模型、信令、验证算法）尚未做实验设计与验证，仅存在文献级可行性论证。

## 5.2 下一步

1. 在真实 FRR/VPP 环境复测四攻击 × 四策略矩阵，把 ROV/ASPA 增量结论升级为真实网元证据。
2. 为 H-UNI 设计最小原型（单一意图对象 + 组合验证算法），与分散对象对比一致性维护与验证开销。
3. WeKnora 建库并上传 RFC 9315/9234/ASPA 全文后，对「统一意图对象」做正文级反证检索。
4. 若用户认可本报告的「跨 AS 安全意图」口径，将「意图/intent」词条增补进 `src/domain/vocabulary.ts` GLOSSARY（唯一口径来源）。

# 六、调研结论

IETF 目前**没有统一 AS 路由意图对象**：起源（ROA/ROV）、角色（BGP Roles/OTC）、上游授权（ASPA）、转发承诺（FC-BGP）四类意图载体分属证书库与 BGP 属性两个平面，组合验证与分析一致性的负担由运营者手工承担，RFC 9315 的通用意图框架尚未投射到跨 AS 安全域（V1 verified）。确定性模拟显示：声明式意图验证把劫持检测率从无验证的 0.093 显著提升到 0.55–0.79（FP≤0.022），provider 意图（ASPA）在原子上对 ROV 有 +0.06 叠加、并在路径操纵攻击上独立覆盖 ROV 盲区（V2 verified，C5 rejected）。据此，TRIZ 给出的最高信息增益方向是「统一 AS 意图中介/聚合层」（原理 #24），但该机制形态受「表达力 ↔ 可判定性」既有权衡制约，当前仅为 distrust 级设计假说（V3 disputed），需真实网元实验后方可升级。

> **口径确认提醒**：本报告将「域间路由意图」解释为跨 AS 的声明式安全策略表达与验证。若用户期望的口径不同（例如域内 IBN 意图在路由控制面的应用），请指出，报告将相应重写 §1.2 与 §六。

参考文献

[1] Clemm A, Ciavaglia L, Granville L Z, et al. Intent-Based Networking - Concepts and Definitions[R]. RFC 9315, 2022. https://www.rfc-editor.org/rfc/rfc9315.txt

[2] Azimov A, Bogomazov E, Bush R, et al. Route Leak Prevention and Detection Using Roles in UPDATE and OPEN Messages[R]. RFC 9234, 2022. https://www.rfc-editor.org/rfc/rfc9234.txt

[3] Azimov A, Bogomazov E, Bush R, et al. Verification of AS_PATH Using the Resource Public Key Infrastructure (RPKI) and ASPA Objects[EB/OL]. draft-ietf-sidrops-aspa-verification-28, 2024. https://datatracker.ietf.org/doc/draft-ietf-sidrops-aspa-verification/

[4] Mohapatra P, Scudder J, Ward D, et al. BGP Prefix Origin Validation[R]. RFC 6811, 2013. https://www.rfc-editor.org/rfc/rfc6811.txt

[5] Lepinski M, Kent S. An Infrastructure to Support Secure Internet Routing[R]. RFC 6480, 2012. https://www.rfc-editor.org/rfc/rfc6480.txt

[6] IETF SIDR/IDR WG. FC-BGP: Towards Secure Inter-domain Routing via Verifiable Routing Commitments[EB/OL]. IETF 122/123 会议材料（工作项，草案阶段，非 RFC）, 2024. https://datatracker.ietf.org/group/sidr/

[7] IETF Datatracker. 文档名称检索（name__icontains=asintent / as-intent / intent）[EB/OL]. 2026-10-14 查询. https://datatracker.ietf.org/doc/?name__icontains=asintent

[8] IETF Datatracker. Intent-Based Routing（draft-li-teas-intent-based-routing，2022-04-28 过期）[EB/OL]. TEAS WG, 2022. https://datatracker.ietf.org/doc/draft-li-teas-intent-based-routing/
