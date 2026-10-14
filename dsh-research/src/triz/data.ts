// src/triz/data.ts — TRIZ 知识基（40 发明原理 / 39 技术参数 / 精选矛盾矩阵 / 分离原理 / 技术进化法则）。
//
// 定位：TRIZ（发明问题解决理论）是**假说生成 / 机制设计的方法论**，不属于 BGP/RPKI 等
// 领域知识（领域知识走 src/domain/vocabulary.ts 与 WeKnora 知识库）。本模块把 TRIZ 的
// **参考数据**做成可检索知识基，供 research_triz 服务（src/triz/index.ts）做矛盾分析。
//
// 口径（诚实标注，勿当权威转录）：
//   - 40 发明原理与 39 技术参数 = Altshuller 经典清单（名称/编号通用）。
//   - 矛盾矩阵 = **精选适配子集**（选路由安全最相关的参数对），其求解原理为**面向该领域
//     的适配推荐**，并非 39×39 全表的逐格转录；未收录的参数对走启发式兜底
//     （source: 'heuristic-fallback'）。调用方须按 Research Agent Policy 把输出当
//     **灵感与假说**对待，经实验/证据核验后才能成为 claim（勿把 TRIZ 推荐当事实）。
//
// 用法：research_triz 工具 / ResearchTrizService（见 index.ts）。

/** 发明原理条目：编号 + 规范名 + 别名 + 一句话摘要 + 路由安全机制提示。 */
export interface TrizPrinciple {
  no: number;
  name: string;
  aliases: string[];
  summary: string;
  /** 面向域间路由安全的机制方向提示（research_triz 假说映射用）。 */
  routingHint: string;
}

/** 40 发明原理（Altshuller 经典清单；routingHint 为本仓库对路由安全的适配）。 */
export const TRIZ_PRINCIPLES: readonly TrizPrinciple[] = [
  { no: 1, name: 'Segmentation', aliases: ['分割'], summary: '把对象/过程分成相互独立的部分。', routingHint: '把验证/信任按前缀、会话、AS、消息细分粒度，局部化决策与影响面。' },
  { no: 2, name: 'Taking out', aliases: ['抽取'], summary: '从对象中抽出有害或需要的部分/属性。', routingHint: '分离控制面与数据面；把验证逻辑抽离为旁路组件（RPKI 缓存、sidecar 验证器）。' },
  { no: 3, name: 'Local quality', aliases: ['局部质量'], summary: '让对象各部分各得其所、各具职能。', routingHint: '关键前缀/关键对等体强验证、普通流量低开销；策略按对象局部差异化。' },
  { no: 4, name: 'Asymmetry', aliases: ['非对称'], summary: '用非对称形式替代对称形式。', routingHint: '单向优先验证（宣告方自证 vs 接收方验证不对称），不对称信任模型。' },
  { no: 5, name: 'Merging', aliases: ['合并'], summary: '合并同类/相邻/并行操作。', routingHint: '联合机制（ROV+BGPsec+ASPA+FC-BGP 复合）；合并验证数据源与缓存。' },
  { no: 6, name: 'Universality', aliases: ['通用性'], summary: '让对象以同一结构执行多种功能。', routingHint: '单一凭证/签名同时满足来源+路径+策略验证；统一信任锚。' },
  { no: 7, name: 'Nested doll', aliases: ['嵌套'], summary: '一个对象套在另一个对象内。', routingHint: '层次化信任/嵌套验证（逐级聚合），复用 RPKI 证书层级。' },
  { no: 8, name: 'Anti-weight', aliases: ['配重', '抵消'], summary: '用反向力量抵消不利作用。', routingHint: '蜜罐/事态对冲欺骗者，用低成本反向验证抵消误报。' },
  { no: 9, name: 'Preliminary anti-action', aliases: ['事先反作用'], summary: '预先施加反作用以防不利事件。', routingHint: '先置 fail-closed 安全默认再放开；预告警/预声明。' },
  { no: 10, name: 'Preliminary action', aliases: ['预操作'], summary: '提前完成全部或部分工作。', routingHint: '预计算验证结果、离线预签署与缓存（ROA/签名运行期零延迟）——FC-BGP/RPKI 预验证方向。' },
  { no: 11, name: 'Beforehand cushioning', aliases: ['事先缓冲'], summary: '预先设置冗余以补偿低可靠性。', routingHint: 'NotFound 缺省安全；多源冗余验证路径与后备依赖方；签名过期缓冲。' },
  { no: 12, name: 'Equipotentiality', aliases: ['等势'], summary: '在无需提升的情况下改变工作条件。', routingHint: '使各 AS 验证能力对等齐平，消除验证盲区/短板。' },
  { no: 13, name: 'Inversion', aliases: ['反向'], summary: '反过来做：动→静、过程倒置。', routingHint: '验证从接收方推给宣告方（AS 自证转发承诺，ASPA/FC-BGP 方向）；由「挑毛病」转「自证清白」。' },
  { no: 14, name: 'Spheroidality', aliases: ['曲率'], summary: '直线改曲线/旋转，引入多维。', routingHint: '网状冗余路径与多归属多样性，避免单点/线状依赖。' },
  { no: 15, name: 'Dynamicity', aliases: ['动态化'], summary: '让对象/环境随工况自适应变化。', routingHint: '按检测威胁强度动态切换验证策略/ROV 强弱/收敛模式。' },
  { no: 16, name: 'Partial or excessive action', aliases: ['部分或过度作用'], summary: '只做一点点或留有余量。', routingHint: '渐进式部署（先标记后拒绝）；过度验证的打击面控制。' },
  { no: 17, name: 'Another dimension', aliases: ['多维'], summary: '引入新维度/新视角。', routingHint: '增加验证维度：不只来源（是谁），也看路径（怎么走）与转发行为（实际怎么传）。' },
  { no: 18, name: 'Mechanical vibration', aliases: ['机械振动'], summary: '用周期性振荡/扰动。', routingHint: '周期性抽样监测、主动轮询 VRP 与路径变化探测。' },
  { no: 19, name: 'Periodic action', aliases: ['周期性作用'], summary: '周期性动作替代连续动作。', routingHint: '周期轮换密钥、周期全量审计 + 平时增量。' },
  { no: 20, name: 'Continuity of useful action', aliases: ['连续有用作用'], summary: '消除中断/空转，动作连续。', routingHint: '持续流式验证、流水线化，不让验证出现空窗。' },
  { no: 21, name: 'Skipping', aliases: ['跃过'], summary: '高速跳过有害或无益的阶段。', routingHint: '绕过不可信中介直达验证；跳过不必要的全路径重放/级联重验。' },
  { no: 22, name: 'Blessing in disguise', aliases: ['变害为利'], summary: '把有害因素转为有益。', routingHint: '把攻击面变成检测信号（honeypot）；把误报用于异常感知而非丢弃。' },
  { no: 23, name: 'Feedback', aliases: ['反馈'], summary: '引入反馈回路改进动作。', routingHint: '劫持检测结果反馈到策略/传播：自动收敛、隔离与协商（blackhole 联动）。' },
  { no: 24, name: 'Intermediary', aliases: ['中介'], summary: '用中间载体/中介传递动作。', routingHint: 'RPKI 依赖方/缓存、第三方验证服务、可信中介简化验证拓扑。' },
  { no: 25, name: 'Self-service', aliases: ['自服务'], summary: '让对象自我服务、自动维护。', routingHint: '自动密钥轮换、ROA 自审计、验证系统自愈。' },
  { no: 26, name: 'Copying', aliases: ['复制'], summary: '用廉价拷贝替代昂贵原件。', routingHint: '影子缓存/复制验证状态；数据面实测副本做事态研判。' },
  { no: 27, name: 'Cheap disposable objects', aliases: ['廉价易耗'], summary: '用廉价、短命的一次性对象。', routingHint: '一次性短命密钥/一次性签名，降低长期暴露（BGPsec 密钥轮换）。' },
  { no: 28, name: 'Mechanics substitution', aliases: ['机制替换'], summary: '用一种作用机制替代另一种。', routingHint: '从「信任谁」换成「验证什么」；从预共享信任换到签密/承诺机制。' },
  { no: 29, name: 'Pneumatics and hydraulics', aliases: ['气动液压'], summary: '用气体/液体部件替代固体。', routingHint: '用松耦合、可流动的信任传播替代刚性静态配置。' },
  { no: 30, name: 'Flexible shells and thin films', aliases: ['柔性薄层'], summary: '用柔性薄层替代三维结构。', routingHint: '透明前置过滤层（轻量封装/边车层），对现有 BGP 无侵入。' },
  { no: 31, name: 'Porous materials', aliases: ['多孔'], summary: '让对象多孔/有选择得可渗透。', routingHint: '稀疏采样验证：关键子集全检、其余低密度抽查。' },
  { no: 32, name: 'Color changes', aliases: ['颜色变化'], summary: '改变对象的颜色/可观察属性。', routingHint: '用状态着色/标记让异常可见（ROA 状态可视化、攻击高亮）。' },
  { no: 33, name: 'Homogeneity', aliases: ['同质'], summary: '让相互作用的对象同质化。', routingHint: '统一验证接口与数据格式，消除机制间转换缺口。' },
  { no: 34, name: 'Discarding and recovering', aliases: ['抛弃与再生'], summary: '抛弃已无用的部分并即时再生。', routingHint: '及时废弃失效凭据/缓存，自动回收再生成（ROA 过期清理、VRP 刷新）。' },
  { no: 35, name: 'Parameter change', aliases: ['参数改变'], summary: '改变对象的状态/参数/浓度等。', routingHint: '验证强度做成可调参；信任从二元变连续（信誉分）；从静态到流式表达。' },
  { no: 36, name: 'Phase transition', aliases: ['相变'], summary: '利用相态变化触发跃变。', routingHint: '攻击阈值触发「相变」：越界自动进入强验证/隔离模式。' },
  { no: 37, name: 'Thermal expansion', aliases: ['热膨胀'], summary: '利用材料受热膨胀。', routingHint: '验证资源按负载/威胁「膨胀收缩」——按需放大验证强度。' },
  { no: 38, name: 'Strong oxidants', aliases: ['强氧化'], summary: '用更强的作用剂快速完成（代价高）。', routingHint: '高强度深检只在关键时窗/事件期启用，平时轻检控成本。' },
  { no: 39, name: 'Inert atmosphere', aliases: ['惰性环境'], summary: '在惰性环境中进行过程。', routingHint: '用隔离沙箱/黑名单隔离区承载高风险流量与不可信输入。' },
  { no: 40, name: 'Composite materials', aliases: ['复合材料'], summary: '用复合材料替代均质材料。', routingHint: '纵深防御复合：ROV+BGPsec+ASPA+FC-BGP 多层组合抵消单点缺陷。' },
];

/** 39 技术参数（Altshuller 经典清单）。 */
export interface TrizParameter {
  no: number;
  name: string;
}

/** 39 技术参数（编号与规范名，经典口径）。 */
export const TRIZ_PARAMETERS: readonly TrizParameter[] = [
  { no: 1, name: 'Weight of moving object' },
  { no: 2, name: 'Weight of stationary object' },
  { no: 3, name: 'Length of moving object' },
  { no: 4, name: 'Length of stationary object' },
  { no: 5, name: 'Area of moving object' },
  { no: 6, name: 'Area of stationary object' },
  { no: 7, name: 'Volume of moving object' },
  { no: 8, name: 'Volume of stationary object' },
  { no: 9, name: 'Speed' },
  { no: 10, name: 'Force' },
  { no: 11, name: 'Stress or pressure' },
  { no: 12, name: 'Shape' },
  { no: 13, name: 'Stability of the object' },
  { no: 14, name: 'Strength' },
  { no: 15, name: 'Duration of action of moving object' },
  { no: 16, name: 'Duration of action of stationary object' },
  { no: 17, name: 'Temperature' },
  { no: 18, name: 'Illumination intensity' },
  { no: 19, name: 'Use of energy by moving object' },
  { no: 20, name: 'Use of energy by stationary object' },
  { no: 21, name: 'Power' },
  { no: 22, name: 'Loss of energy' },
  { no: 23, name: 'Loss of substance' },
  { no: 24, name: 'Loss of information' },
  { no: 25, name: 'Loss of time' },
  { no: 26, name: 'Quantity of substance' },
  { no: 27, name: 'Reliability' },
  { no: 28, name: 'Measurement accuracy' },
  { no: 29, name: 'Manufacturing precision' },
  { no: 30, name: 'Object-affected harmful factors' },
  { no: 31, name: 'Object-generated harmful factors' },
  { no: 32, name: 'Ease of manufacture' },
  { no: 33, name: 'Ease of operation' },
  { no: 34, name: 'Ease of repair' },
  { no: 35, name: 'Adaptability or versatility' },
  { no: 36, name: 'Device complexity' },
  { no: 37, name: 'Difficulty of detecting and measuring' },
  { no: 38, name: 'Extent of automation' },
  { no: 39, name: 'Productivity' },
];

/**
 * 路由安全关注点 → 技术参数编号的别名表（research_triz 的 improving/worsening 解析用）。
 * 键小写化匹配，中英双语。
 */
export const ROUTING_PARAMETER_ALIASES: Record<string, number> = {
  // 时间 / 速度
  '收敛': 25, 'convergence': 25, '延迟': 25, 'latency': 25, 'delay': 25, 'speed': 9, '速度': 9, 'converge': 25,
  // 检测 / 可观测
  '检测': 28, 'detection': 28, 'detect': 28, '可见性': 28, 'visibility': 28, 'observability': 28, '监控': 28, 'monitoring': 28,
  // 攻击面 / 安全（外部有害因素）
  '攻击面': 30, 'attack surface': 30, '安全': 30, 'security': 30, '劫持': 30, 'hijack': 30, '抗攻击': 30, '抵御': 30,
  // 自身引入危害
  '危害': 31, 'harm': 31, '副作用': 31, 'side effect': 31,
  // 可靠性 / 可用性
  '可靠性': 27, 'reliability': 27, '可用性': 27, 'availability': 27, 'uptime': 27, '稳定': 27, 'stable': 27,
  // 适应性 / 灵活
  '适应': 35, 'adapt': 35, 'adaptability': 35, '灵活': 35, 'flexible': 35, 'versatility': 35,
  // 复杂度
  '复杂度': 36, 'complex': 36, 'complexity': 36, 'device complexity': 36, '繁琐': 36, 'complicated': 36,
  // 开销 / 带宽 / 消息
  '开销': 22, 'overhead': 22, '带宽': 22, 'bandwidth': 22, '消息': 22, 'message': 22, 'energy': 22, '能耗': 22, '资源': 22, 'cost': 22, '成本': 32, // cost→部署成本 更贴 32，见下
  // CPU / 计算 / 签名
  'cpu': 21, '计算': 21, 'compute': 21, '签名开销': 21, 'verification cost': 21, '加密开销': 21, 'power': 21,
  // 自动化
  '自动化': 38, 'automation': 38, 'automatic': 38,
  // 吞吐 / 效率
  '吞吐': 39, 'throughput': 39, '效率': 39, 'productivity': 39,
  // 部署 / 实施
  '部署': 32, 'deploy': 32, 'implementation': 32, '制造难度': 32, 'ease of manufacture': 32, '实施成本': 32, '成本': 32,
  // 运维 / 易用
  '运维': 33, 'operation': 33, '易用': 33, 'ease of operation': 33, 'easier to use': 33,
  // 可维护
  '维护': 34, 'repair': 34, '可修复': 34, 'ease of repair': 34,
  // 信息完整性 / 丢失
  '信息丢失': 24, 'loss of information': 24, '完整性': 24, 'integrity': 24, '信息损失': 24,
  // 测量精度 / 验证精度
  '精度': 28, 'accuracy': 28, 'measurement': 28, '测量': 28, 'precision': 28, 'verification': 28, '验证': 28,
  // 物质数量
  '数量': 26, 'quantity': 26, 'substance': 26, '表项': 26, 'route entries': 26,
};

/**
 * 精选矛盾矩阵（适配子集，非全表转录）。
 * 每个条目：(improve, worsen) → 推荐发明原理编号。理由：
 *   选路由安全最相关的参数对（可靠性/检测精度/抗攻击/适应性/自动化/吞吐 vs
 *   时间/复杂度/开销/自身危害/易用），原理为面向该领域的适配推荐（见 data.ts 头注释）。
 */
export const TRIZ_CURATED_MATRIX: ReadonlyArray<{ improve: number; worsen: number; principles: number[] }> = [
  // 提高可靠性而收敛/验证时限允许适度劣化（验证成本 vs 收敛速度）
  { improve: 27, worsen: 25, principles: [11, 10, 23] },
  // 提高检测/测量精度而复杂度上升（可见性 vs 部署复杂度）
  { improve: 28, worsen: 36, principles: [23, 2, 24] },
  // 提高抗外部有害因素（抗劫持）而不显著增加延迟
  { improve: 30, worsen: 25, principles: [11, 10, 23] },
  // 提升自适应能力而不损失易操作性（策略灵活 vs 运维简单）
  { improve: 35, worsen: 33, principles: [1, 15, 25] },
  // 提高自动化程度而不增加系统复杂度（自动化 vs 实现复杂度）
  { improve: 38, worsen: 36, principles: [24, 25, 5] },
  // 提升生产率/吞吐而不增加消息/计算开销
  { improve: 39, worsen: 22, principles: [2, 13, 6, 35] },
  // 提升可靠性而自身引入更多有害因素（机制越多 → 脆弱面越多）
  { improve: 27, worsen: 31, principles: [23, 11, 15, 40] },
  // 降低信息损失而不严重拖慢处理速度（信息完整 vs 速度）
  { improve: 24, worsen: 9, principles: [23, 10, 1] },
];

/** 启发式兜底：参数 → 常见适配原理（矩阵未收录的参数对走这里，source: heuristic-fallback）。 */
export const HEURISTIC_PRINCIPLES_BY_PARAMETER: Record<number, number[]> = {
  9: [10, 20, 23],          // speed
  22: [2, 35, 13],          // energy loss
  24: [23, 24, 32],         // information loss
  25: [10, 23, 20],         // time loss
  27: [23, 11, 15, 40],     // reliability
  28: [23, 24, 6],          // measurement accuracy
  30: [11, 22, 2, 40],      // external harmful
  31: [11, 22, 2, 40],      // generated harmful
  32: [1, 2, 24],           // ease of manufacture
  33: [1, 15, 25, 32],      // ease of operation
  35: [1, 15, 32, 6],       // adaptability
  36: [1, 2, 24, 6],        // device complexity
  38: [5, 24, 25],          // automation
  39: [2, 6, 13],           // productivity
};

/** 未识别参数时的启动原理集（source: unresolved）。 */
export const STARTER_PRINCIPLES: number[] = [1, 2, 10, 13, 23, 24];
