---
name: triz
description: TRIZ（发明问题解决理论）研究 workflow：把机制矛盾形式化为「改善↔恶化」技术矛盾，用 research_triz 查 40 发明原理/精选矩阵得到机制方向，产出待核验假说并接研究核验闭环。
---

# TRIZ 假设生成工作流（Hazard → Contradiction → Principle → Hypothesis → Verify）

## 定位
TRIZ 是**假说生成 / 机制设计方法**，不是领域知识（领域知识走 vocabulary.ts + WeKnora）。
本 skill 定义在 Research Loop 里何时、怎么用 `research_triz`，以及为什么输出只是**假说**。

## 何时用
- 研究卡在「两难」上：想提升 A 却必然恶化 B（如检测率 ↔ 收敛延迟、安全强度 ↔ 开销/复杂度、覆盖率 ↔ 部署成本）。
- 机制设计需要**新方向**而不是微调：现有 ROV/BGPsec/ASPA/FC-BGP 各自的短板正是典型的技术矛盾。
- 论文 Related Work 后想找 Gap → 用 TRIZ 把 Gap 转成矛盾再反推机制。

## 标准流程
1. **写矛盾**：一句话 problem + 两个参数
   - `improving`：想改善的方面（中英皆可：reliability / 检测 / 抗劫持 / 收敛 / 自动化…）
   - `worsening`：可接受的恶化方面（latency / 复杂度 / 开销 / CPU / 部署成本…）
   - 例：`research_triz problem="ROV 提升劫持检测率但跨长收敛" improving="检测" worsening="收敛"`
2. **读候选**：返回 `candidates`（40 原理中含路由提示的子集，如预操作/反馈/反向/中介/局部质量…）、
   `separation`（空间/时间/条件/系统级分离）、`evolution`（技术进化法则视角）、`ideality`（IFR 理想解）。
3. **产假说**：`hypotheses` 是 type=Hypothesis、source=triz、confidence=0.5 的**机制方向陈述**，
   `record` 自动写入 artifact + 情景记忆。
4. **接核验闭环（必须）**：假说 ≠ claim。挑 1–3 条最有信息增益的方向：
   - 用 `research_verify` 核证据/反证；
   - 能落实验的用 `research_campaign`（validator=rov/bgpsec/rov+bgpsec/aspa…）跑四口径；
   - 与既有机制对照（FC-BGP/ASPA 已含「反向/自证」思想；RPKI 预验证是「预操作」）——
     **别把 TRIZ 方向当新发现**，先查已有工作再声称 new。
5. **归档**：核验后的结论用 `research_record` / `research_paper` 落地；假说库留档（episodic + artifact）。

## 常见的路由安全矛盾 ↔ 原理映射（示例，具体以 research_triz 输出为准）
| 矛盾 | 典型原理方向 | 实例 |
|------|--------------|------|
| 检测率 ↑ ↔ 收敛延迟 ↑ | 预操作(10)、反馈(23)、向缓冲(11) | RPKI 预验证缓存；劫持检测→自动收敛联动 |
| 安全强度 ↑ ↔ 复杂度/部署成本 ↑ | 中介(24)、合并(5)、局部质量(3) | 依赖方缓存/中介；关键前缀强验证 |
| 覆盖率 ↑ ↔ 运维开销 ↑ | 自服务(25)、动态化(15)、参数变(35) | 自动密钥轮换、威胁驱动策略 |
| 抗劫持 ↑ ↔ 自身引入危害 ↑ | 反馈(23)、复合(40)、惰性环境(39) | 隔离重验、纵深防御复合 |

## 纪律（对齐 Research Agent Policy）
- TRIZ 输出 = 灵感，不是事实；`confidence=0.5`，未经核验不得写进论文结论。
- 矩阵是**精选适配子集**（非 39×39 全表转录），`source=heuristic-fallback/unresolved` 时更要保守。
- 与领域正交：TRIZ 给「怎么想」，BGP/RPKI/ASPA/FC-BGP 的真相以 RFC/论文/实验为准。
