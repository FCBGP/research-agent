# 域间路由意图（Inter-domain Routing Intent）调研 — TRIZ 视角

- 日期：2026-10-14
- 方法：`research_triz`（TRIZ 矛盾分析）→ 既有工作对照 → `research_verify` 核验 → `research_campaign` 实验闭环
- 相关 artifact：art-1（TRIZ）、art-3（实验 result）、art-4（本调研 note）

---

## 1. 问题定义

把域间路由意图（路径偏好 / 禁飞区 / ASPA 路径政策）表达得更精细、可机器验证，
但协议与配置复杂度随之上升——这是域间路由安全从「信任抽象」走向「意图契约」的核心两难。

- 改善（improving）：意图表达粒度与可验证性（TRIZ #28 测量精度）
- 恶化（worsening）：协议复杂度与配置负担（TRIZ #36 设备复杂度）
- TRIZ 命中：**curated-matrix**（精选矩阵）

## 2. TRIZ 机制方向（source=triz, confidence=0.5，均为待核验假说）

| # | 原理 | 机制方向 | 现状对照 |
|---|------|----------|----------|
| 23 | Feedback | 验证/检测结果反馈到策略生成与传播（自动收敛、隔离、blackhole 联动），形成意图验证闭环 | **信息增益最高**，路径政策（ASPA）语境下闭环方向探索最浅 |
| 2 | Taking out | 把验证逻辑抽离为旁路组件（RPKI 缓存、sidecar 验证器、控制/数据面分离） | **已有落地先例**：RFC 8210 RPKI-to-Router，非新方向 |
| 24 | Intermediary | 第三方验证服务 / 可信中介简化验证拓扑 | **已有先例**：RP 缓存/第三方验证服务 |

## 3. 文献/标准对照（Research Loop）

- RFC 8210（RPKI-to-Router Protocol, 2017）：验证逻辑已抽离为旁路 Cache，经 RTR 增量分发 VRP → Taking out/Intermediary 在 origin-validation 层已是落地机制。
- RFC 6811 + RFC 8481：ROV 状态机（Valid/Invalid/NotFound）与策略应用存在厂商实现分歧 →「验证→策略应用」环节本身有自动化空间，支撑 Feedback 方向。
- RFC 9774：AS_SET 在 ROV/BGPsec/ASPA 下均不可 Valid → 路径级判定结果可作为反馈信号源。
- RFC 8207：全局 RPKI 是松散一致视图，Cache 间存在时序差异 → 反馈机制的时序敏感性与部分部署可靠性是反证来源。

## 4. 核验闭环（Verification Loop）

**research_verify（聚焦 Feedback 方向）→ verdict: disputed**

反证（有效）：
- 验证结果反馈进传播会引入新攻击面：劫持者/错配可污染反馈信号，BGP 无全局时钟，
  反馈循环可能导致策略振荡与级联收敛不稳定。
- RPKI 松散一致视图（RFC 8207）下，时序敏感的反馈信号在部分部署中可靠性存疑。

结论：不能直接声称「Feedback 未被探索」，须把假说精炼为带稳定性约束的可测主张。

## 5. 实验闭环（Experiment Loop）

精炼主张 triz-feedback-01：ROV/ASPA 验证结果反馈进路径选择（对 Invalid 意图背离施以收紧），
显著提升前缀劫持检测率，且收敛时间不明显恶化（增幅 <10%）。

`research_campaign`（env=sim, validator=rov, attack=prefix-hijack, ×3）：

| 口径 | 值 |
|------|-----|
| detection_rate | **0.7917**（略低于 0.8 阈值 → inconclusive） |
| false_positive_rate | 0.0187 |
| convergence_time | 88.93（未见 <10% 恶化担忧被证实） |
| verification_latency | 1.34 |
| verdict | **inconclusive / disputed** |

## 6. 结论与下一步

1. **Taking out / Intermediary 不是新方向**——RFC 8210 与 RP 缓存已实现，调研时勿当新发现。
2. **Feedback 是真 Gap 候选**但需带稳定性约束：检测率 0.79 处于临界，方向有戏但实验未达阈值。
3. 下一步实验建议：
   - 加 `validator=rov+aspa`、提高收紧强度、增大 asCount，重跑 campaign 看 detection_rate 是否过 0.8；
   - 显式测**反馈污染/策略振荡**指标（收敛方差、振荡轮数），回应 disputed 反证；
   - FRR 真机复验（`env=frr`），验证 sim 结论在真实守护进程下是否成立。
4. 未决问题：意图「禁飞区/路径偏好」这类细粒度意图目前没有标准信道表达（ASPA 只覆盖 provider 授权），
   反馈闭环要建立在什么样的「意图语言」之上，仍是开放问题。
