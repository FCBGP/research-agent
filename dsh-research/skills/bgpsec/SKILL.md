---
name: bgpsec
description: BGPsec（RFC 8205）路径验证速查：AS 签名、路径属性、部署现状与局限，用于路径完整性实验与综述写作。
---

# BGPsec 速查

## 机制
- BGPsec 为目标前缀与 AS_PATH 中每个 AS 提供**数字签名链**（RTR-SIG / ASPA 相关验证）。
- 路由器开启 BGPsec 后，只接受签名字段完整且有效的 AS_PATH（`bgp bestpath bgpsec-as-path`，
  见 `topology.ts` FrrTopology 渲染）。
- 防御侧重**路径操纵**：无法仅靠伪造 AS_PATH 把路由"变好"。

## 部署现状与局限
- 需逐 AS 升级（签名/验签 CPU 开销、密钥轮换）→ 实际部署稀疏，覆盖率是主要短板。
- 与 ROV 互补：ROV 管「来源是否授权」，BGPsec 管「路径是否被篡改」；
  联合 `rov+bgpsec` 对 prefix-hijack / path-manipulation 均有最高 detection 区间
  （见 `topology.ts` EFFECT 表）。

## 实验对照
`research_campaign validator=bgpsec` 对 `attackClass=path-manipulation` 应显著优于
`validator=rov`（ROV 对路径操纵检测率低）。用四口径统计 + effectiveScore 对比。
