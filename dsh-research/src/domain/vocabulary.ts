// src/domain/vocabulary.ts — dsh-routing-research 命名定型 + 内置领域词汇（唯一口径来源）。
//
// 使命：把 **dsh-routing-research** 定型为域间路由安全研究 Agent 的规范名称（对应
// prompts/dsh.md §11「我反而建议你不要叫它 research」与 AGENTS.md §3/§10 的 Profile 视图），
// 并把领域词汇（BGP / RPKI / BGPsec / ASPA / VRO / CRC / FC-BGP / FRR / VPP）**内置**为
// 本模块常量，供 persona / preset 描述 / research_search 种子检索 / 插件服务域统一引用——
// 保证「README 与脚本仍用 `dsh research`（操作命令）」的前提下，产品名与领域词汇只有
// 一个来源（本文件），不散落、不走样。
//
// 命名口径（定型，2026-10-09）：
//   - Profile 定型名称：dsh-routing-research —— 域间路由安全（inter-domain routing security）
//     研究专用，不再用泛化的 "research" 自指。
//   - 操作命令不变：`dsh research` == `dsh --profile research`（README/scripts 仍用 dsh research）。
//   - 多 Profile 角色：research 之外还有 paper / experiment / engineering / reviewer，
//     共享同一 @basil/dsh-research bundle，仅默认 preset 不同（见 profiles/）。

/** Profile 定型名称：域间路由安全研究专用 Agent（产品/Profile 语义名）。 */
export const PRODUCT_NAME = 'dsh-routing-research';

/** 操作命令（不变）：`dsh research`。 */
export const COMMAND = 'dsh research';

/** 等价命令：`dsh --profile research`。 */
export const PROFILE_FLAG = 'dsh --profile research';

/** Profile 目录名（$DSH_HOME/profiles/<name>/，部署模板位于 profiles/<name>/）。 */
export const PROFILE_NAME = 'research';

/** 命名综述：定型名 + 操作命令一次讲清。 */
export const NAMING = `${PRODUCT_NAME} —— 域间路由安全研究 Agent（操作命令 ${COMMAND}，即 ${PROFILE_FLAG}）`;

/** 领域研究范围（AGENTS.md §1 口径）：路由安全技术栈。 */
export const DOMAIN_SCOPE = ['BGP', 'RPKI', 'BGPsec', 'ASPA', 'VRO', 'CRC', 'FC-BGP'] as const;

/** 领域执行器（Executor 层，接入真实网元用；沙箱缺二进制时回退确定性模拟）。 */
export const DOMAIN_EXECUTORS = ['FRR', 'VPP'] as const;

/** 内置检索种子词：literature / research_search 的冷启动领域词表（research_search 缺 query 时兜底）。 */
export const DOMAIN_KEYWORDS: readonly string[] = [
  'bgp', 'rpki', 'bgpsec', 'aspa', 'vro', 'crc', 'fc-bgp',
  'rov', 'roa', 'origin validation', 'as path', 'path manipulation',
  'prefix hijack', 'subprefix hijack', 'as-set injection',
  'route leak', 'hijack', 'routing security',
];

export type DomainTermKind = 'protocol' | 'mechanism' | 'executor' | 'concept' | 'scope';

/** 领域词汇条目：term / 别名 / 类别 / 一句话定义。 */
export interface DomainTerm {
  term: string;
  aliases: string[];
  kind: DomainTermKind;
  def: string;
}

/**
 * 内置领域词汇表（GLOSSARY）。定义口径尽量保守：
 * 有公开标准/RFC 的术语给精准一句话定义；VRO / CRC 在仓库范围内仅作研究范围代号
 * （详见 AGENTS.md §1 领域范围），不给未经验证的展开，避免「把合理误认为正确」。
 */
export const GLOSSARY: readonly DomainTerm[] = [
  { term: 'BGP', aliases: ['Border Gateway Protocol'], kind: 'protocol', def: '域间路由协议，承载前缀可达性与 AS_PATH 传递，本身不做「该 AS 是否有权宣告」验证。' },
  { term: 'RPKI', aliases: ['Resource Public Key Infrastructure'], kind: 'mechanism', def: '资源公钥基础设施：以 PKI 证书绑定前缀/AS 资源，产出 ROA 支撑来源验证（RFC 6480）。' },
  { term: 'BGPsec', aliases: ['RFC 8205'], kind: 'mechanism', def: '对 AS_PATH 逐跳签名的 BGP 安全扩展，防路径篡改，无法约束与来源授权的配合问题。' },
  { term: 'ASPA', aliases: ['AS Provider Authorization', 'RFC 9319'], kind: 'mechanism', def: '声明 AS 的合法上游集合，用于缓解路由泄露与「授权 AS 作恶」的路径政策验证。' },
  { term: 'VRO', aliases: [], kind: 'scope', def: '域间路由安全研究范围代号（AGENTS.md §1 领域列表，仓库未给出公开展开，不作猜测性定义）。' },
  { term: 'CRC', aliases: [], kind: 'scope', def: '域间路由安全研究范围代号（AGENTS.md §1 领域列表，仓库未给出公开展开，不作猜测性定义）。' },
  { term: 'FC-BGP', aliases: ['Forwarding Commitment BGP', 'Forwarding Commitments'], kind: 'mechanism', def: '基于「转发承诺（Forwarding Commitment）」的 BGP 安全研究（IETF SIDR/IDR 方向、草案阶段非 RFC）：AS 声明实际转发行为承诺，供下游验证 AS_PATH/转发一致性，缓解路由泄露与劫持。' },
  { term: 'FRR', aliases: ['FRRouting'], kind: 'executor', def: '真实网元执行器（bgpd + RTR 适配器），沙箱缺二进制时由 RouteEngineSim 回退。' },
  { term: 'VPP', aliases: ['FD.io VPP'], kind: 'executor', def: '真实网元执行器（Vector Packet Processing 适配器），沙箱缺二进制时由 RouteEngineSim 回退。' },
];

/** 领域范围拼串（如 "BGP / RPKI / BGPsec / ASPA / VRO / CRC / FC-BGP"）。 */
export function scopeList(): string {
  return DOMAIN_SCOPE.join(' / ');
}

/** 执行器拼串（如 "FRR / VPP"）。 */
export function executorList(): string {
  return DOMAIN_EXECUTORS.join(' / ');
}

/** 领域自我介绍（persona / preset description 可复用的口径渲染）。 */
export function describeDomain(): string {
  return `${PRODUCT_NAME}：面向域间路由安全（${scopeList()}）的科研 Agent；`
    + `真实网元执行器 ${executorList()}，沙箱缺二进制时回退确定性模拟。`;
}

/** 按 term 精确查词；找不到返回 undefined。 */
export function lookupTerm(term: string): DomainTerm | undefined {
  const t = term.trim().toUpperCase();
  return GLOSSARY.find((g) => g.term.toUpperCase() === t || g.aliases.some((a) => a.toUpperCase() === t));
}
