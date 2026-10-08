---
name: rpki
description: RPKI（资源公钥基础设施）与 ROV 验证速查：ROA、依赖方、缓存、RPKI RTR 协议，用于源地址验证实验与综述写作。
---

# RPKI / ROV 速查

## 核心构件
- **ROA**（Route Origin Authorization）：RpkiSignedData 声明「前缀 → 合法来源 AS」。
- **依赖方 / Validator**（routinator、RPKI-RTR）：抓取仓库、校验签名、产出 VRP 表。
- **RPKI RTR 协议**：路由器从缓存拉 VRP（`research_campaign` 里 FRR 的
  `rpki rtr 192.0.2.1 port 8282` 即此路径，见 `topology.ts` renderFrrConfig）。
- 验证结果三态：Valid / Invalid / NotFound（AS0 为显式禁止）。

## 攻击与缺口
- 劫持者常利用 **NotFound** 状态（覆盖不全 / PDB 偏差）与 **sub-prefix** 细粒度绕过。
- ROA 生命周期：签发→传播→存活窗口；密钥/撤销/过期会引入验证时延（verification_latency）。
- ROV 策略强弱：reject Invalid > drop > 仅打 tag。

## 实验对照
`research_campaign` 用 `validator=none`（基线）vs `validator=rov`：ROV 应显著抬高
detection_rate 但略抬 false_positive_rate → 用 `summarizeDetection` 的 effectiveScore 权衡。
