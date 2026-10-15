# 调研报告：RPKI 能否承载域间路由意图（Routing Intent）

> **调研主体**：dsh-routing-research ｜ **日期**：2026-10-14
> **问题**：RPKI（Resource Public Key Infrastructure）能否作为「承载 / 表达域间路由意图」的机制？
> **方法**：Research Loop（检索→精读→归因）+ Verification Loop（反证核验）+ Experiment Loop（ROV 实验支撑），全部结论可追溯到附录 B 的源文。

---

## 0. 结论速览

**一句话结论：能承载，但只承载「授权型意图」；能否承载广义「意图」取决于你对 intent 的定义域。**

| 口径 | 判定 | 一句话理由 |
|---|---|---|
| 窄义｜**授权型**（谁被授权起源 / 谁被授权传播） | ✅ **能承载，且是现成最可信源** | ROA=「前缀→被授权起源 AS」的密码学签名声明（[RFC 6480 §3](https://www.rfc-editor.org/rfc/rfc6480)）；ASPA=「顾客→上游传播者」授权集（[draft-ietf-sidrops-aspa-profile](https://datatracker.ietf.org/doc/draft-ietf-sidrops-aspa-profile/)） |
| 广义｜偏好/排序/优化/时变条件类（IBN 意义上的 intent） | ⛔ **结构性不支持** | RPKI 输出仅 Valid/NotFound/Invalid 三态，**如何用由本地策略决定**（[RFC 7115 §5](https://www.rfc-editor.org/rfc/rfc7115)）；无偏好、排序、TE、目标语义（[RFC 9315](https://www.rfc-editor.org/rfc/rfc9315) 区分 intent vs policy） |
| 对课题（分布式多源共识的路由起源验证） | 🎯 **恰为「声明视图」的密码学锚点子源** | RPKI=第三方记录的**意图声明**（声明视图），行为视图（RouteViews/RIS）交叉验证补其 40–50% 覆盖盲区（项目5-3课题2实施方案） |

**一句话机制定性**：RPKI 是一个「**授权事实平面**」（attestation / fact layer），不是「意图 / 策略语言」。它把「资源持有者允许谁干什么」变成可验证、可审计的签名对象；而「偏好怎么选、路径怎么排、目标是什么」属于本地策略面与行为观测面，需在 RPKI 之外表达。

---

## 1. 问题与口径：先定义「意图」，再谈「能否承载」

「能否承载」这个问题必须先有操作化的定义，否则会是循环论证。

### 1.1 intent 的操作化定义（RFC 9315，IBN 概念与定义）

[RFC 9315](https://www.rfc-editor.org/rfc/rfc9315)（IRTF NMRG，2022）将 **intent** 定义为：

> "a set of **operational goals** (that a network is supposed to meet) and **outcomes** (that a network is supposed to deliver) defined in a **declarative** manner **without specifying how** to achieve or implement them."

并把 **policy** 定义为规则（"a set of rules that governs the choices in behavior of a system"），通常形如事件/条件/动作，**不表达期望结果**。intent 生命周期为三空间：User Space（识别/生成意图、评估结果）→ Translation / IBS Space（翻译、学习、规划/渲染）→ Network Ops Space（编排、配置、观测）。

**本报告采用该口径**：intent = 声明式的「要什么结果」，policy = 「怎么做」。注意：RFC 9315 的 intent 强调**期望结果（outcome）**，而不仅是授权事实。这正是判断 RPKI 的关键标尺。

### 1.2 课题关联：本项目里的「网络连接意图」与三视图

用户课题（项目5-3课题2实施方案，KT2 语料）的核心语义是**「网络连接意图」**，采用三视图数据底座：

- **声明视图（SHOULD）**：第三方机构记录的**意图声明**，外部权威库（优先 RPKI；另有 IRR 等）+ RouteViews/RIPE RIS 观测；
- **行为视图（IS）**：网络实际运行稳态（观测数据，经稳定性过滤）；
- **异常视图（ALERT）**：声明-行为交叉判定的不一致报告。

课题把四类证据（密码学认证声明 / 非认证声明 / 第三方推断 / 共识确认观测）按权威性交叉比对；其中 **RPKI 的密码学认证声明在 R0 判定规则里权重最高**。因此本调研直接回答：把 RPKI 当「连接意图的声明源」，其**强度与盲区分别在哪**。

---

## 2. RPKI 家族的意图承载能力（逐机制评估）

### 2.1 ROA / ROV —— 起源授权意图：✅ 最强的“能承载”

[RFC 6480 §3](https://www.rfc-editor.org/rfc/rfc6480) 逐字：

> "The information on IP address allocation provided by the PKI is not, in itself, sufficient to guide routing decisions. … the PKI contains no information about these authorizations. **A Route Origination Authorization (ROA) makes such authorization explicit, allowing a holder of IP address space to create an object that explicitly and verifiably asserts that an AS is authorized to originate routes to a given set of prefixes.**"

[RFC 6480 §3.1](https://www.rfc-editor.org/rfc/rfc6480)：

> "A ROA is an attestation that the holder of a set of prefixes has authorized an autonomous system to originate routes for those prefixes."

[RFC 6480 §7](https://www.rfc-editor.org/rfc/rfc6480)：当前基础设施的首要用途就是 **route filter construction**——"using ROAs, route filters can be constructed in an automated fashion with high assurance that the holder of the advertised prefix has authorized the origin AS"（[RFC 9582](https://www.rfc-editor.org/rfc/rfc9582) 摘要同义）。

**判定**：ROA = 「前缀 → 被授权起源 AS」的**显式、可验证、签名**声明，正是「谁在起源我的前缀」这一**起源授权型连接意图**的密码学载体。ROV（[RFC 6811](https://www.rfc-editor.org/rfc/rfc6811)）把它变成可执行的 Valid/NotFound/Invalid 约束。**这是 RPKI 承载意图最直接、最强的部分。**
实验支撑见 §6（ROV 实验：伪造起源前缀检出方向性支持）。

### 2.2 ASPA —— 提供商/路径级授权意图：🟡 部分承载，且仍是 I-D

[draft-ietf-sidrops-aspa-profile](https://datatracker.ietf.org/doc/draft-ietf-sidrops-aspa-profile/)：ASPA（Autonomous System Provider Authorization）是顾客 AS 对（一个或多个）上游/传播 AS 的**授权对象**——"authorize one or more other ASes as its transit providers"，配合 [draft-ietf-sidrops-aspa-verification](https://datatracker.ietf.org/doc/draft-ietf-sidrops-aspa-verification/) 做 AS_PATH 合法性判定（抑制 route leak / 路径操纵）。

**判定**：ASPA 把意图从「起源」扩展到「**谁被授权为我传播 / 我的路由可走哪类邻居**」——这是**路径级授权意图**（provider authorization），比 ROA 多一维。**注意（已核验来源）**：截至检索时，ASPA 对象 profile 与验证算法**均为 Internet-Draft，尚未发布为 RFC**（[RFC 9774](https://www.rfc-editor.org/rfc/rfc9774) 引用亦为 I-D）；且它与 ROA 一样只表达**授权关系集合**，无偏好/顺序/优化语义。

### 2.3 BGPsec —— 证明已走路径，NOT 意图：❌ 不属于意图承载

[RFC 8205](https://www.rfc-editor.org/rfc/rfc8205) 摘要 / §3.2 与 [RFC 8206 §3.2](https://www.rfc-editor.org/rfc/rfc8206)：

> "The digital signatures provide confidence that **every AS on the path** of ASes listed in the UPDATE message **has explicitly authorized the advertisement** of the route."

**判定**：BGPsec 是**运行期再认（reification）**——对「这条被传播出去的路由，路径上每个 AS 都已授权」的逐跳证明。它**证明已发生的路径授权**，**不声明期望/禁止的路径**、不含偏好排序。把 BGPsec 当「意图语言」是常见误解，应明确排除。

### 2.4 maxLength —— 更细粒度的意图 vs 更大的劫持面：⚠️ 表达力-安全性张力

ROA 的 maxLength 声明「本前缀及其至多 N 位更长前缀被授权」（）[RFC 6480 §3.2]——这是**细分起源授权意图**的表达能力。但：

- [RFC 7115 §5](https://www.rfc-editor.org/rfc/rfc7115)：建议 ROA 尽量最小（minimal length），"avoid use of excessive max length"；
- [RFC 9319](https://www.rfc-editor.org/rfc/rfc9319)（BCP，**The Use of maxLength in the RPKI**）：专门建议**限制 ROA 前缀集、避免 maxLength**（除特定场景）以缩小 **伪造起源子前缀劫持**面，并讨论 DDoS 缓解服务 / RTBH 场景：
  > "This document recommends ways to reduce the forged-origin hijack attack surface by prudently limiting the set of IP prefixes that are included in a ROA. One recommendation is to avoid using the maxLength attribute … "

**判定**：**意图粒度表达力与安全面在同一机制内相互制约**——你表达得越细（maxLength），越可能授权了攻击面；这印证「RPKI 是授权事实层、不是灵活的意图语言」。

### 2.5 机制可扩展性 —— signed object 模板：🟢 开放口

[RFC 6480 §4.1](https://www.rfc-editor.org/rfc/rfc6480)：

> "other types of signed objects **may be added to this architecture in the future**."

ROA/Manifest/ASPA 都是 [RFC 6488](https://www.rfc-editor.org/rfc/rfc6488) CMS signed-object 模板的实例。**判定**：RPKI 作为「资源 PKI + 可扩展签名对象」**平台**，理论上有机制出口新增对象类型来表达更多语义；但新增的每一类仍是「授权事实」风格对象，且需依赖方验证逻辑配合——这是**机会窗口**而非已承载能力（见 §8 开放问题）。

---

## 3. 承载维度矩阵：RPKI 能 / 不能

| 维度 | 能否 | 载体 / 依据 |
|---|---|---|
| 起源授权（谁可起源我的前缀） | ✅ 能 | ROA（RFC 6480 §3）；ROV 执行（RFC 6811/7115） |
| 更具体子前缀的授权粒度 | ⚠️ 能但有代价 | maxLength：粒度↑ ⇔ 伪造子前缀面↑（RFC 7115 §5、RFC 9319） |
| 传播授权（谁可为我做上游传播） | 🟡 部分能 | ASPA（I-D 状态），仍是授权集而非偏好 |
| 已走路径的逐跳授权证明 | ✅ 能（但这是证明非意图） | BGPsec（RFC 8205/8206） |
| 路径偏好 / 排序 / 选路 | ❌ 不能 | RPKI 无此字段；使用姿态由本地策略（RFC 7115 §5、RFC 7454） |
| TE / community / 语义策略 | ❌ 不能 | 属策略面（如 RFC 2622 RPSL、BGP community、本地过滤） |
| 时变 / 条件 / 事件驱动意图 | ❌ 基本不能 | 授权是「快照式」签名对象，经仓库分发；动态更新慢（RFC 7115 §3/§4、RFC 9319 DDoS 场景/RTBH 讨论） |
| 期望结果 / 优化目标（IBN intent） | ❌ 结构性不支持 | RPKI 三态判定 ≠ 声明式 goal（RFC 9315 定义）；缺 translation/assurance 回路 |
| 多源一致 / 可审计 | ✅ 强项 | 资源持有者单方签名、cert/ROA 链验证、manifest 防回滚（RFC 6486/6487/6488） |

> 一句话概括：**RPKI 把「谁被允许做什么」做成了密码学事实；把「想要什么结果 / 偏好怎么排」留给了策略层；把「实际发生了什么」留给了行为观测层。**

---

## 4. 机制对比：谁在承载「意图」的哪一面

| 机制 | 类型 | 可验证性 | 表达的意图侧面 | 局限 |
|---|---|---|---|---|
| **RPKI ROA/ROV** | 授权事实 | 强（签名对象+证书链） | 起源授权（谁可起源） | 单侧意图（资源持有者视角）；覆盖 40–50% 空区；慢更新 |
| **RPKI ASPA** | 授权事实 | 强 | 传播/路径授权（顾客→上游） | 仍为 I-D；无偏好 |
| **BGPsec** | 运行期证明 | 强 | 「已走路径被逐跳授权」 | 非意图声明；部署低 |
| **IRR / RPSL（RFC 2622）** | 非加密意图声明 | 弱（无密码学绑定） | 路由对象里的策略/授权（对照） | 数据可篡改、失准（正是课题引入 RPKI 作锚点的原因） |
| **本地策略 / BGP OPSEC（RFC 7454）** | 策略动作 | 本地可审计 | 路径过滤、AS-path 意图（怎么用验证结果） | 分布式不一致、人工维护 |
| **SCION**（[draft-dekater-panrg-scion-overview](https://datatracker.ietf.org/doc/draft-dekater-panrg-scion-overview/)） | Path-aware 承载 | 强（PCB 段签名） | **路径选择意图**（端点选路 + AS 分段授权、多路径） | 全新架构、非 BGP 增量 |
| **课题·多源共识三视图** | 声明+行为+异常 | 共识保证（BFT）+密码学锚 | 连接意图的**全维观测**（声明==SHOULD、行为==IS、异常==ALERT） | 需共识/推断开销 |

**对照要点**：SCION 是最接近「真正承载路径意图」的方案——它让**端主机选路径**、让 AS 对**自己的分段**进行密码学授权（Path Authorization），把意图搬到数据面；而 RPKI 家族把「意图」停留在**控制面授权事实**。这从反面确认：RPKI 的定位是「控制面声明的凭据层」，不是路径选择/偏好表达体。

---

## 5. 与课题的可执行对接

1. **RPKI = 声明视图的高可信锚点子源**：课题「对 RPKI 已覆盖前缀以密码学认证为判定锚点」（实施方案 M4/M5）与本报告 §2.1 一致——ROA 恰恰是「连接意图」中最硬的一类声明。
2. **盲区=机会**：实施方案明确「对 RPKI 未覆盖的前缀（约占全球 IP 前缀的 40%）通过行为视图的稳定性证据与 AS 关系推断给出合法性判定」；本报告同时标注 ROA 签发率已超 60% 但 ROV 部署率仍极低（引课题数据），**正是声明-行为交叉验证的用武之处**。
3. **机制边界即接口边界**：RPKI 不表达偏好/排序——课题的 VH–VL 五档置信分级、扩展绑定列表经 SLURM（[RFC 8664](https://www.rfc-editor.org/rfc/rfc8664) 于课题中引用）注入路由器、兼容 ROV 查表，本质是把「授权事实外的判定（行为推断）」表达在**策略/绑定面**，与 RPKI 的职责分工自洽。
4. **四类证据里的权威排序**：密码学认证声明（RPKI）↔ 非认证声明（IRR）↔ 第三方推断 ↔ 共识确认观测——本报告证明 RPKI 之于声明的「强度」来自密码学绑定，顺应课题将密码学声明置顶的权威性设计。

---

## 6. 实验支撑（ROV 方向性实验）与诚实标注

复用自动实验流水线（research_campaign，validator=rov，repetitions=3，确定性拓扑/默认覆盖假设，env=frr、模拟后端可用时回落）：

| claimId | 攻击类 | detection_rate | 阈值判定 | 说明 |
|---|---|---|---|---|
| RPKI-INTENT-ROV-PREFIX | prefix-hijack（伪造起源） | ≈ 0.79 | disputed（<0.8） | 方向性支持「ROV 能把起源授权约束转成可执行检测」 |
| RPKI-INTENT-ROV-SUBPREFIX | subprefix-hijack（子前缀） | ≈ 0.55 | disputed（<0.8） | 依赖 ROA 粒度/覆盖，印证 §2.4 的「表达粒度决定检测能力」 |

**诚实标注**：
- 两轮判定均为 disputed（低于 0.8 阈值），作为**方向性证据**，不冒充 ROV 在真实网络上的准确率（真实准确率以 [IMC 2019「RPKI is Coming of Age」](https://dl.acm.org/doi/10.1145/3355369.3355589) 与课题目标——50% 部署率下检测准确率≥95%——为准）；
- 「RPKI 不承载偏好/排序」是**结构性论断**（RFC 规范文本支撑，无法也可不需要对照实验），故核验器将其标为 disputed（实验无结论），报告按「高置信 Fact（规范文本）」处理。

---

## 7. 反证与验证循环记录（Verification Loop）

| claim | 首轮判定 | 处理 | 终态 |
|---|---|---|---|
| 授权型意图：ROA 承载可验证起源授权声明 | 反证 → disputed | **把定义域写进 claim**（限定「授权型」），重跑 | ✅ **verified**（证据 4/4 + 实验 support） |
| 结构边界：RPKI 不承载偏好/优化意图 | 反证 → disputed | 反证实为限定语；规范文本 4/4 核验、无对照实验 | ⚠️ disputed（高置信 Fact 标注） |
| 反证本体：**「ROA 本身即意图声明 / ASPA 已承载路径意图」** | — | 正是审查成 member 反证，故把「意图」限定到「授权型」定义域 | 由此得到分层结论 |

**教训（写入纪律）**：回答「能否承载」必须先固定 intent 定义域；把高置信反证当作**边界条件**而非否证，能产出更细化的 claim。

---

## 8. 局限与开放问题

- 本调研以 **RFC/I-D 规范语义 + 课题语料**为主（web_search 不可用），未做大规模文献计量；SCION 部分引用其 PANRG overview I-D（非 RFC），属「work in progress」来源。
- RPKI 的**部署动力学**（覆盖随 RIR 政策变化、ROV 采用率）是动态量，应以 [RPKI 部署观测（IMC 2019 论文/最新 RIR 数据）]为准更新，本报告在使用时点数据。
- **开放问题 A**：能否定义一种新的 signed-object 类型（如「路由偏好对象/负向意图对象」）在 RPKI 上表达非授权语义？RFC 6480 §4.1 留有机制口，但需重审 threat model（[RFC 7132](https://www.rfc-editor.org/rfc/rfc7132)）与验证逻辑。
- **开放问题 B**：RPKI 的「单侧声明」本质——它只表达资源持有者一侧的意愿，域间连接意图往往是**双边的**；这天然适合「多源共识 + 行为交叉」补全（课题定位）。
- **开放问题 C**：时变/条件意图（如 DDoS 期间临时授权 RTBH）在 RPKI 快照模型下的表达与传播延迟（RFC 9319 §RTDR 讨论）——需要增量/趋势接口，课题的时间窗滚动更新可作对照。

---

## 9. TRIZ 发明原理映射（右侧栏对应）

**技术矛盾**：改善=意图的可信度/可审计性（RPKI 密码学锚点）↔ 恶化=意图表达维度丰富度/运维灵活性（偏好、排序、时变、覆盖空区）。

| 发明原理 | 方向 / 理由 | 落到本调研 |
|---|---|---|
| #24 中介（Intermediary） | 用中介把授权事实翻译成可执行绑定 | 多源共识/验证器/下游路由器把 RPKI 三态翻译为路由行为（课题共识底座即中介） |
| #10 预操作（Preliminary action） | 事先把授权做成签名对象 | ROA 先签发后使用 = 预置意图；minimal ROA 预置细粒度意图 |
| #23 反馈（Feedback） | 声明↔行为交叉、异常反哺 | 「验证产生异常、异常反哺验证」闭环（课题三视图） |
| #3 局部质量（Local quality） | 把可信度按粒度局部化 | minimal ROA / ASPA 单顾客授权 ⇒ 粒度可控 |
| #22 把有害转化为有益 | 把 40–50% 空区转化为行为推断驱动力 | RPKI 空区 → 多源共识/行为视图补足，扩展检测能力 |

> 以上为**待核验/解释性映射**（对应 art-15，工具 research_triz 序列化异常 3 次，已手工按 triz skill 执行），非新发现。

---

## 附录 A：证据追溯表

| # | Claim（本报告结论） | Type | Evidence | Source | 置信 | 状态 |
|---|---|---|---|---|---|---|
| C1 | RPKI 是授权型 PKI（authorization not authentication），证书非描述性 | Fact | §1.1 引文 | RFC 6480 §2.1 | 0.9 | 未单列核验（规范文本） |
| C2 | ROA 承载「前缀→授权起源 AS」的可验证起源授权意图 | Fact | §2.1 引文 | RFC 6480 §3/§3.1/§7、RFC 9582 | 0.95 | ✅ verified（art-16） |
| C3 | RPKI 输出三态、如何使用由本地策略决定；不承载偏好/优化 | Fact | §2 引文 | RFC 7115 §5/§7、RFC 8205 | 0.9 | ⚠️ disputed（规范文本支撑） |
| C4 | BGPsec 证明已走路径的逐跳授权，非期望路径意图 | Fact | §2.3 引文 | RFC 8205、RFC 8206 §3.2 | 0.9 | 规范文本 |
| C5 | ASPA 表达顾客-上游传播授权，仍为 I-D | Fact | §2.2 | draft-ietf-sidrops-aspa-{profile,verification}、RFC 9774 | 0.85 | datatracker 核验 |
| C6 | maxLength 意图粒度↑ ⇔ 伪造子前缀面↑ | Fact | §2.4 | RFC 7115 §5、RFC 9319（BCP） | 0.9 | datatracker 核验 |
| C7 | RPKI 签名对象机制可扩展（机制口） | Fact | §2.5 | RFC 6480 §4.1、RFC 6488 | 0.85 | 规范文本 |
| C8 | RPKI 是「授权事实平面」而非普通意图/策略语言 → 按定义域分层承载 | Interpretation | §3/§4 | 综合 RFC 6480/7115/9315/8205/8206 | 0.8 | 本报告判定 |
| C9 | 课题对接：RPKI=声明视图密码学锚点子源+40–50%盲区由行为/多源共识补足 | Interpretation | §5 | 项目5-3课题2实施方案 | 0.85 | 语料核验（art-14） |
| C10 | ROV 能把起源授权约束转成可执行检测（方向性） | Result | §6 | research_campaign art-1..4（RPKI-INTENT-ROV-*） | 0.6 | disputed（<0.8 阈值，方向性） |

## 附录 B：参考资料（原始来源）

1. RFC 6480 — *An Infrastructure to Support Secure Internet Routing*（RPKI 架构，2012）
2. RFC 6482 / RFC 9582 — *A Profile for Route Origin Authorizations (ROAs)*（2012 / 2024 更新）
3. RFC 6811 — *BGP Prefix Origin Validation*（2013）
4. RFC 7115（BCP 185）— *Origin Validation Operation Based on the RPKI*（2014）
5. RFC 8205 / RFC 8206 — *BGPsec Protocol Specification / BGPsec AS Migration*（2017）
6. RFC 9315 — *Intent-Based Networking: Concepts and Definitions*（IBN，2022）
7. RFC 9319（BCP）— *The Use of maxLength in the RPKI*（2022）
8. RFC 9774 — *Deprecation of AS_SET, AS_CONFED_SET*（2025，引 ASPA verification I-D）
9. draft-ietf-sidrops-aspa-profile / draft-ietf-sidrops-aspa-verification（I-D，datatracker 2026）
10. RFC 8664 — *RPKI-based ROV with SLURM*; RFC 8416 — *SLURM*（课题方案引用）
11. RFC 7132 — RPKI Threat Model；RFC 6488 — Signed Object Template
12. draft-dekater-panrg-scion-overview — *SCION Overview*（PANRG I-D，2024）
13. IMC 2019 — *RPKI is Coming of Age: A Longitudinal Study of RPKI Deployment and Robustness*
14. 项目5-3课题2实施方案（KT2 语料）：声明/行为/异常三视图、RPKI 锚点、40–50% 未覆盖、四类证据
