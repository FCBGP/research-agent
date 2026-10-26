## 2026-10-26 · 域间路由安全调研报告 分篇 01 扩写（提交 4307b0e）

需求（用户，2026-10-26）：推进《域间路由安全调研报告》分篇撰写——先并行复核 APNIC/SCION/IRV
三个待引用来源，随后以「扩写现有意图分篇 01」为起点开写分篇系列（不复用意图报告 [1]-[14]，
每分篇独立 [1]-[N] 编号）。

- **13 源核验（撰写前逐条完成）**：[1] BGP-4（RFC 4271）事实标准；[2] origin-hijack /
  path-forgery / route-leak 攻击分类；[3] BGP「属性+本地策略」网格＋IBN 意图定义；
  [4][5] P4 larus 部署现状（**二手转述**，正文与数据口径均明确标注）；[6] SLURM（RFC 8416）；
  [7] BGPsec（RFC 8205）；[8][9] ASPA profile-29 + verification-29（按 Internet-Draft 引用并
  注明「-29 尚未成为 RFC」）；[10] RFC 7115（BCP185）路由过滤；[11] RFC 9774 废弃
  AS_SET/AS_CONFED_SET；[12] BGP CAR（RFC 9871）；[13] SCION 专著（Perrig A, et al., Berlin:
  Springer, 2017，无 URL）。禁用过期数据（2021 年 ROA 覆盖率、HE RPKI rollout 等）确认未出现。
- **关键产物**：`docs/域间路由意图-分篇/01-背景与目标.md`（分篇草稿，0600 私有权限 + 拼装删
  标记，按 `.gitignore` 设计不入库；主报告 md 为唯一交付物）——研究背景 / 术语与口径两节；
  body 首现引用序 [1]-[13] 连续不跳号；正文按 Fact / Result / Hypothesis / Assumption /
  Interpretation 区分；含实验口径块（engine=sim、mulberry32 seed 20261016、evidence grade
  上限 C、supportThreshold=0.8）＋二手数据口径附注。
- **分篇系列口径（定稿）**：以「扩写现有意图分篇 01」为起点独立成系列；每分篇独立编号
  [1]-[N]（不延续意图报告 [1]-[14]）；每篇自含 `参考文献` 纯文本块、先跑
  `python3 scripts/check_references.py` 再过稿；后续机制分篇 02–08 按此口径复审，BGPsec
  （RFC 8205）为首个机制分篇、钉死槽位防编号漂移。
- **测试与 SMOKE**：`check_references.py` 对分篇 01 → **13/13 唯一引用 ↔ 13 条参考文献，
  REFERENCE CHECK OK**。功能提交 `4307b0e` 仅含 TODO.md（在研段置新：已确认口径 + 后续机制
  分篇轮）；分篇草稿按 .gitignore 不入库；`.gitignore` 自身仅余用户新增 `export/` 未提交。

---

## 2026-10-26 · TRIZ 侧边栏按「轮」聚合总览卡（提交 bcd0ab3）

需求（用户，2026-10-26）：选型「方案 3 · 需要总览卡片」——triz-auto 对一轮内每个实质 step
各落一条 note，而侧边栏只显示「最后两步」令人困惑 → 改为按「轮」聚合为一张总览卡，而非零散
step 碎片卡。

- **关键产物**：`client/TrizTab.tsx` 渲染 `TrizRoundCard`（本轮总览卡）+ `client/route.ts` 新增
  `aggregateTrizRounds()`；`src/plugin-triz-auto.ts` note meta 新增 `roundId`（`nextRoundId()`
  进程内单调）+ `isInternalUserText()`；`src/plugin-triz-ui.ts` `MAX_TRIZ_NOTES` 由 30→200
  （避免同 createdAt 多条轮在截断处被拆开）；`lib/client.js` 重建（76111→84243 B）。
- **总览卡语义**：一次 user 任务 = 一轮；卡 = 问题 + 全步骤原理合集（去重）+ 最终答案步结论
  + 可折叠各步骤明细；手动 `research_triz` 调用（无 step）保持逐条单卡；面板提示说明聚合语义
  （短步骤/工具调用不单独生成）。
- **根因修复**：内部控制/检查类 user 消息（`This is an automatically generated check` /
  `Time sampled while preparing` / `<goal_complete>`）不再写入「问题」、也不再重置轮——修复
  「问题标题失真」与「自主运行内部子轮碎片化」；旧数据（2026-10-21 同毫秒多轮混存快照）前端
  回落 `createdAt+sessionId+step` 相邻性启发式分组，`problemInternal` 问题标题脱敏为
  「（本轮问题为自动生成的内部检查消息…）」。
- **为何此前只显示两步**：`MIN_FINAL_ANSWER_LENGTH = 40` 字符阈值——40 步中仅最后两步有实质
  正文（≥40 字符），其余 1–38 步为工具调用/短文本被过滤；并非「取最后两步」。
- **测试与实测**：`node --test "dsh-research/src/**/*.test.ts"` = **278/278 全绿**（+4 auto、
  +5 aggregate）；`node --check lib/client.js` 通过。真实持久化数据验证：当前会话 step39/40
  两条 note → 聚合 1 张总览卡（原理合集 [1,2,24,23,6]，problemInternal=true 正确脱敏）；
  legacy 同毫秒多轮正确拆分为多轮。
- **部署**：`~/.dsh/profiles/research/node_modules/@basil/dsh-research` 为 symlink 指向仓库，
  新 lib/client.js 经 symlink 即时生效；用户浏览器硬刷新（Cmd+Shift+R）即可。真机确认留待
  用户验证（见 TODO）。

---

## 2026-10-22 · 域间路由意图调研报告 8 章重构版（提交 3a26af0）

需求（用户，2026-10-22）：主报告去掉独立「TRIZ 机制方向」章——该章内容多为未核验假说，不宜挂在
主报告正文里「看起来已成立」；实验核验并入正文第 5 章，报告收拢为「跨 AS 声明式安全策略的
表达、验证与实验核验」。

- **关键产物**：`docs/域间路由意图-调研报告.md`（**8 章**，9→8 重构版）+ `docs/output/域间路由意图-调研报告.docx`
  （REF 域版，29048 B，XML 剥离文本 16235 字符）。
- **结构调整**：删除独立「TRIZ 机制方向」整章 → 9→8 章；其内容**完整留存**于跟踪文件
  `docs/域间路由意图-调研与TRIZ机制方向.md`（111 行：意图三视图 / 三组矛盾 9 假说
  H1-1…H3-3（source=triz, confidence=0.5）/ 已有工作对照表 / 核验闭环 H1-2·H2-2
  disputed / 下一步验证计划 / 局限）。其余章节顺移：五 实验核验（原六，五指纹表重编号
  6-1-1-1→**5-1-1-1** … 6-4-1-1→**5-4-1-1**）、六 FC-BGP 专题（原八，含 表 6-1-1-1 与
  表 **6-2-1-1** 四载体比较矩阵）、七 局限与下一步、八 结论（原九，删 TRIZ 结论条目，
  剩 2 条）。副标题改「…表达、验证与实验核验」；§3.1/§4 交叉引用同步更新
  （「综合第三章与第六章」「第六章第 6.2 节」）；全章无残留旧编号/旧交叉引用。
- **诚实口径**（沿用实验战役绑定 artifact）：engine=sim（RouteEngineSim 确定性可复现）、
  mulberry32 种子 20261016、reps=3、supportThreshold=0.8；五指纹严重度检测率 0.093–0.650
  全低于 0.8、FP ≤ 0.022、ASPA subprefix 增益 +0.060、path-manipulation 0.650、20 格
  sweep supportedRate 70.0%（56/80）；正文明确「优先降低冒称可信风险、证据等级上限 C」，
  未把低于阈值的假说写成已验证结论。
- **其他**：三条未跟踪路径按用户处置全部纳入 `.gitignore` —— `.tmp-report-word-scripts/`
  （沙箱构建脚本暂存）、`docs/域间路由意图-分篇/`（8 个拼装草稿，私有权限 + 拼装删标记）、
  `ebgp-ibgp-科研绘图-prompts.md`（科研绘图 prompt 草稿，待绘图专题另行处理）。
- **测试与 SMOKE**：`check_references` OK（14 唯一引用 ↔ 14 条参考文献）；docx 8 章标题 +
  参考文献标题各 ×1、剥离文本 16235 字符；提交 = 纯文档 + 构建产物（md / docx / .gitignore
  各 1），无代码改动，无单测要求。提交号 **3a26af0**。

---

## 2026-10-21 · 科研绘图白屏回归修复 — DrawTab 组件体 const cfg TDZ（提交 66fe9fc）

现象（用户，2026-10-21，两阶段混合落地后）：科研绘图打开即白屏；DrawErrorBoundary 错误卡未出现。

- **根因**：`442925f` 新增文字叠加代码在组件函数体里
  `const overlaySupported = cfg?.overlay.supported ?? false` 引用 `cfg`，而组件体的
  `const cfg = cfgState.phase === 'ready' ? cfgState.cfg : undefined` 声明在其后 ——
  同名 `const` 存在 **TDZ（temporal dead zone）**，每次渲染抛
  `ReferenceError: Cannot access 'cfg' before initialization`。该异常发生在 DrawTab
  **自身函数体**（错误边界只包住 return 的 JSX children），DrawErrorBoundary 捕获不到
  → 面板整体白屏（「加载中…/数据源错误」都不出现，因为还没到 return）。
- **修复**：
  1. 组件体 `const cfg` 上移到函数体最上方（refs 之后、useEffect 之前），消除 TDZ；
  2. `overlaySupported` / `cfg.overlay.reason` 全部 optional-chain 兜底
     （`cfg?.overlay?.`，reason 补默认文案），不再裸依赖 config 形状缺失；
  3. DrawTab 重构为 **`DrawTabInner` + 导出 `DrawTab` 外层包 `DrawErrorBoundary`** ——
     组件函数体（useState/useEffect/render 主体）抛错也落入边界显示红色错误卡 + 经
     `POST /api/research.draw.debug` 上报 CLI，杜绝再出现「整体白屏、CLI 无输出」。
- **lib/client.js** 重建（75909 → 76111 B）；`node --check` 通过；括号/大括号平衡核对通过。
- 测试：`node --test "dsh-research/src/**/*.test.ts"` = **269/269 全绿**。
- 部署：`~/.dsh/profiles/research/node_modules/@basil/dsh-research` symlink 指向仓库，
  新 lib/client.js 即时生效，无需重跑 deploy；用户**硬刷新浏览器**（Cmd+Shift+R）即可。
  若仍有问题，CLI 会打印 `[dsh-research-draw] [client] [tab-render]` 具体栈（本轮已增强
  可捕获函数体错误）。

## 2026-10-21 · 科研绘图：两阶段混合落地 — 无文字底图 + PIL 精确文字叠加（方案 C，提交 442925f）

需求（用户，2026-10-21）：Qwen-Image-2.1 生成图**文字/图形错乱**，如何处理 → 按 SKILL.md 推荐
方案 C（两阶段混合）落成可用能力：① 图片模型出「无文字艺术底图」；② 本机 python3 + Pillow
精确叠加文字层（零错字）。

- **host**（`src/plugin-draw.ts`，route 8→**9 条**）：新增 `POST /api/research.draw.overlay` —
  body `{ imagePath, labels（数组或多行文本）, outputDir? }` → 校验底图存在/扩展名（404/415）→
  `probeOverlay` 探活 python3+Pillow（不可用 400 + 理由）→ spawn 合成 → 缩略图 + 写 draw artifact
  （`draw: overlay · N 文字`，meta 含 outputPath/thumbBase64 → 进历史 stack）+ episodic + persist →
  返回 `{ ok, outputPath, thumbnailBase64, width, height, basePath, artifactId }`。
  探活/缩略图均经 `DrawRuntimeDeps` 注入（测试可 mock）；`require` → ESM 顶部导入
  `execFileSync`（Node 24 strip-only 下 `require is not defined` 修复）。
- **纯函数模块** `src/draw/overlay.ts`：`parseOverlayLines`（每行一个标签，`|` 分隔；
  `x,y` 锚点/像素/百分比、`@字号`、`#rrggbb`/命名色、`b` 加粗、`n` 无描边、`#` 行首注释；
  纯字母非锚点词→命名色，防误入位置段）+ `normalizeOverlayLabels`（size 10–300）+ 
  `buildOverlayScript`（内嵌 Python+Pillow：macOS 字体族 Arial Bold/PingFang/Helvetica 回落
  load_default；锚点/像素/百分比位置解析；黑描边 stroke_width=size/18；默认底部居中白字；
  打印 `IMG_DIMS:WxH`）+ `buildOverlayCommand` + `parseOverlayDims`。
- **paths**：`drawOverlayOutputName/Path` → `<outputRoot>/images/image-…-overlay.png`。
- **client**：`route.ts` 加 `drawOverlayUrl / DrawOverlayView / parseDrawOverlay` + `config.overlay`；
  `DrawTab.tsx` 加「两阶段混合：无文字底图模式（推荐）」checkbox（勾选后提交自动追加
  「图中不要出现任何文字、字母或数字，纯图形构图，留出干净区域」）+「文字叠加」卡片
  （底图下拉=历史中仍存在图片（fileExists 探测）、标签多行输入、合成文字、预览/大图/错误提示、
  不成名则提示 `pip install Pillow`）。
- **lib/client.js** 重建（75909 B）。
- 测试：`node --test "src/**/*.test.ts"` = **269/269 全绿**（261 基线 + overlay 纯函数 8 +
  OVERLAY route 端到端——假探活支持/假 spawn 出 `IMG_DIMS:2048x1152` → 200 成品+artifact 进历史 /
  缺 imagePath 400 / 底图不存在 404 / 非图片 415）；apply() 路由测试 8→9。
- 部署：重跑 `./dsh-research/scripts/deploy-profile.sh` 后**硬刷新浏览器**（Cmd+Shift+R）。
- 待真机验收（用户侧）：勾选无文字底图生成 → 文字叠加卡片选底图 → 输入 2-3 标签 → 合成 →
  放大逐字验收零错字；本机无 python3+Pillow 时应显示安装提示。

## 2026-10-21 · 科研绘图：文字/图形错乱处理纪律（提交 1b70eee）

需求（用户，2026-10-21）：Qwen-Image-2.1（local mflux）生成的图**文字错乱、图形错乱**，如何处理。

- **根因**：扩散模型按语义像素出图、不真正排版文字——小字号/密集/中文/技术符号（eBGP、AS…、IP…）
  与多框/箭头最易错乱；属模型固有局限，只能规避或结构化兜底。
- **skill** `skills/draw/SKILL.md` 新增「文字/图形错乱处理」节：
  - 分类：文字是否关键信息（≥4 处文字或任一处小字号中文/技术符号 → 判「文字关键」）。
  - 图片模型内兜底（装饰文字）：≤2-3 个短标签、宁大勿小、英文短词、明确文字负约束、
    2K→4K + 高步、固定 seed 多抽、negativePrompt 锦上添花；垫图 edit 不修错字。
  - 结构性示意图（文字关键首选）：SVG / Mermaid（markdown-mermaid、scientific-schematics 技能）
    程序控制字体位置，零错字；图注写实际产出通路，不冒充生图。
  - 两阶段混合（推荐）：无文字艺术底图 + PIL/SVG 程序叠字 → 既好看又零错字。
  - 验收：错字且为关键信息 → 弃图走结构/混合方案。
- 单测 **260/260 全绿**（skill 文档改动，代码零变化）；skill 经 symlink 即时生效，无需重装前端。

## 2026-10-21 · 科研绘图：历史改 stack 堆叠卡片（左 100×100 缩略图 + 右 draw/路径/查看大图，提交 d825731）

需求（用户，2026-10-21）：历史列表改为「**小图在左（100×100 缩略图）、右侧为简要提示
（draw + 路径）与查看大图按钮**」，顺序为 **stack / 后进先出 —— 最近的在最上**。

- **历史行布局重构**（`client/draw/DrawTab.tsx`）：历史卡改为水平 flex —— 左侧固定 100×100
  缩略图（`styles.thumb`，原图回读 `drawImageUrl`，cover 裁切，点击直接开全屏大图），右侧 =
  `h.title`（`draw: <提示词>` 简要提示，单行省略）+ 输出路径（单行省略，`title` 属性悬停看全）+
  尺寸/模型/日期 + 「查看大图」小按钮（`styles.smallButton`）。本地图片缺失 → 左列红框占位
  「文件缺失」（`styles.thumbBad`），下方「删除记录 / 重新生成」提示保留。
- **stack 语义显式化**：host `collectDrawHistory` 本就按 `createdAt` 降序 = 最近在最上（后进先出），
  补注释锁定；客户端原序渲染即为堆叠列表。
- **lib/client.js** 重跑 `scripts/build-client.mjs` 重建（66544 B）。
- 测试：`node --test "src/**/*.test.ts"` = **260/260 全绿**（UI 布局改动，host 逻辑零变化）。
- 部署：重跑 `./dsh-research/scripts/deploy-profile.sh` 后**硬刷新浏览器**生效。

## 2026-10-21 · 科研绘图：会话筛选 + 大图回读 + 侧边栏/TRIZ 滚动修复（提交 5c68452）

需求（用户，2026-10-21）：① 绘图的会话历史要能**选中 / 清除 / 在 dsh 内查看生成图片**；
② 本地图片文件被移除后提示删除或重新生成；③ 侧边栏与 TRIZ 面板**内容不可滚动**（越界不可见）——修复。

- **会话筛选与历史管理（用户 A–C）**：`DrawTab.tsx` 新增会话筛选下拉（当前会话 / 全部会话 /
  具体会话）；完成卡 + 历史卡直接回读 **原图**（`drawImageUrl(outputPath)`，不再只看缩略图），
  点击缩略图或「查看大图」按钮开**全屏遮罩**查看生成图；「清除历史」按当前筛选目标会话执行；
  生成/删除/清空后刷新会话聚合。fileExists=false 的「删除记录 / 重新生成」提示保留（用户需求）。
- **host**（`src/plugin-draw.ts`，route 6→**8 条**）：新增 `GET /api/research.draw.sessions`
  （`collectDrawSessions` 聚合全会话 `{sessionId,count,lastAt}` 降序，无会话记录归
  `__no_session__` 分组）+ `GET /api/research.draw.image?path=<abs>`
  （`readDrawImage` 回读本地图片：`~` 展开 / 扩展名校验 / 非法 URL 编码容错 / 400·404·415 语义）。
  两个 collect/read 抽象成纯函数便于单测；route 常量导出与 client 同名对齐。
- **滚动修复（根因）**：host CSS `.P3OORG_tabBody{height:100%;overflow:hidden}` —— tab 根节点若
  非滚动容器越界内容不可见。`DrawTab.tsx` 与 `TrizTab.tsx` 的 `styles.root` 统一补
  `flex:'1 1 auto' + minHeight:0 + overflowY:auto`（后续新增 tab 照此模式）。
- **客户端 bundle**：`lib/client.js` 重跑 `scripts/build-client.mjs` 重建（64597 B）。
- **部署**：重跑 `./dsh-research/scripts/deploy-profile.sh` 后**硬刷新浏览器**（Cmd+Shift+R，
  旧白屏可能是缓存的旧 lib/client.js；若仍白屏，CLI 会打 `[dsh-research-draw] [client]` 栈）。
- 测试：`node --test "src/**/*.test.ts"` = **260/260 全绿**（257 基线 + collectDrawSessions 聚合 /
  SESSIONS+IMAGE 路由端到端（200 png / 400 缺参 / 415 非图 / 404 缺失）/ readDrawImage 纯函数 3 例）；
  apply() 路由测试 6→8。

## 2026-10-21 · 科研绘图：白屏根因修复 + 历史管理（删除/预览/缺失提示）

### fix(dsh-research): 科研绘图白屏根因修复 + 历史管理（本回合）
- 白屏根因（本回合确定）：DrawTab.generate() 提交达标后 `setRun({ phase: 'running', jobId })` 缺 `logTail`，
  running 卡片渲染 `run.logTail.length` → TypeError → 面板/整页白屏；f3dafab 边界未捕获说明崩溃点在后续帧。
  修复为 `setRun({ ...logTail: [] })`，并对 running/failed 卡片 `(run.logTail ?? [])` 兜底（同类崩溃不再白屏）。
- 历史管理（用户需求 A–E）：历史卡片可点选显示详情（提示词/模型/尺寸/日期/输出路径/预览缩略图）；
  「清除历史」按会话 archive；完成时缩略图 base64 持久化进 artifact meta（重启后仍可预览）；
  history 接口实时探测输出文件是否仍在（fileExists）；文件已丢失 → 就地警示 + 「删除记录 / 重新生成」按钮。
- host（src/plugin-draw.ts）：新增 `POST /api/research.draw.delete`（{artifactId} 删单条 / {sessionId} 清空，
  archive 语义，缺参 400 / 不存在 404）；DrawHistoryView 增 thumbBase64/fileExists；
  drawHistoryView(a, fileExists) / collectDrawHistory(..., fileExistsCheck) 扩展 + archiveDrawArtifact/archiveDrawHistory。
- client（route.ts / DrawTab.tsx）：DRAW_DELETE_ROUTE + drawDeleteUrl；parseDrawHistory 透传 thumbBase64/fileExists；
  选中态详情 / 清除历史（确认）/ 缩略图预览 / fileExists=false 警示与删除/重生成回填（edit 垫图不可还原 → 按 txt2img）。
- 测试：`node --test "src/**/*.test.ts"` = 257/257 全绿（254 基线 + thumbBase64 持久化 / fileExists+archive 语义 /
  DELETE route 端到端 3 例，apply 路由 5→6）。
- 部署：重跑 `./dsh-research/scripts/deploy-profile.sh` 后重启 `dsh research` 生效（lib/client.js 已用 build-client.mjs 重建）。

# CHANGELOG.md — Research Agent OS 演进记录

> 维护规则（详见 `AGENTS.md` §10.1 文档卫生）：
> - 每轮完成的 TODO 项在收尾时**整条移入本文件**，按日期分节，逐条保留
>   「做了什么 / 关键产物 / 提交号(SHA) / 测试与 SMOKE 数字」，保证可追溯。
> - 未发布（repo 内自证）阶段用日期小节；正式对外发布后再引入 `## [x.y.z]` 版本头。
> - **本文件只放「已完成」**；未完成项一律留在 `TODO.md`，两边不重复。

---

## 2026-10-21 · 科研绘图白屏可见性修复（提交 `f3dafab`）

问题（用户）：右侧栏「科研绘图」点「生成」后**白屏**，`dsh research` 终端无任何输出，
无法定位原因。本轮把 draw 全链路错误打上 CLI，并让「白屏」本身**可见 / 自愈**。

- **关键产物**：
  - `src/plugin-draw.ts` —— 新增**恒挂** `POST /api/research.draw.debug` route：浏览器端
    error / unhandledrejection / 面板渲染错误转发 host，以 `console.log/warn/error` 打印到
    `dsh research` 终端（前缀 `[dsh-research-draw]`）；submit / `[start]` / `[done]` /
    `[failed]` / `GET config` 关键钩子补 CLI 日志（拿得到 provider/size/steps/seed/输出路径）。
  - `client/draw/route.ts` —— `DRAW_DEBUG_PATH` + `drawDebugUrl()`。
  - `client/draw/DrawTab.tsx` —— `DrawErrorBoundary`（渲染抛错不白屏，就地红色错误卡 +
    上报 CLI + 重试按钮）；全局 `error` / `unhandledrejection` 兜底上报（只装一次）；
    `formatDate()` 兜底（无效日期不再抛 RangeError 防渲染崩溃）；`MAX_POLL_RETRY=6`
    （状态不可解析 / 连续网络失败判失败，防「生成中…」永久卡死）；generate/status/config/
    history 各步骤 `postDebug` 打点。
  - `lib/client.js` —— 重跑 `scripts/build-client.mjs` 重建（51982 B，含全部新客户端代码）。
  - `src/draw/plugin-draw.test.ts` —— 新增 `apply()` 路由挂载测试：5 条 route（config/debug/
    generate/status/history）全注册、debug route 把客户端错误打到 CLI、`researchDraw` 服务
    provide、config GET 可用。
- **根因定位**：白屏根因尚未单点确定 —— 本轮先做**可见性 + 韧性加固**（错误边界 + 日期兜底
  + 轮询防卡死 + 全链路 CLI 日志）；若真机再复现，终端会直接打出 `[dsh-research-draw]`
  `[client] [uncaught]/[unhandledrejection]/[tab-render]` 的具体栈，据此可精准定位。
- **行为变更**：浏览器端任何 draw 异常都会同步出现在 `dsh research` 终端；已存在部署需
  重跑 `deploy-profile.sh` 并**重启 `dsh research`**（client bundle + 插件在 boot 加载）生效。

实测：`node --test "src/**/*.test.ts"` = **254/254 全绿**（253 + apply 路由测试 1）。
runtime-smoke 在本沙箱因**真实 mflux**（本机 `~/llm/models/Qwen-Image-2.1` + CLI 均存在）
长时间出图 / 挂起无法跑完 —— 属环境产物而非代码问题（`b01be2e` 已证 SMOKE PASS；draw 全
链路经 `plugin-draw.test.ts` 9 例端到端 + 本轮 apply() 路由测试覆盖）。真机「重启 dsh
→ 点生成 → 看 CLI 打点」验收步骤留 TODO「在研 · 科研绘图」节。


## 2026-10-21 · 科研绘图「科研绘图」tab + research_draw 工具（阶段 11，提交 `b01be2e`）

需求（用户）：dsh research 增加科研绘图。确认后的方案 = **不设独立 preset / profile**
（preset-draw 撤销）——只做**右侧栏「科研绘图」tab**（与 TRIZ 同机制、两 tab 并列，不新增
管理负担）；后续可换模型；生成记录随会话持久化；研究报告配图也走 research_draw
（research_paper 流程内嵌）。

- **关键产物**：
  - `src/plugin-draw.ts`（exports `./draw`）—— `DrawProvider` 双后端 + `DrawJobManager`
    （内存 job 表、并发上限 1、disposer 终止）+ 4 条鉴权 route
    （`POST /api/research.draw.generate` / `status?jobId=` / `config` / `history?sessionId=`）
    + macOS `sips -Z 1024` 缩略图 + artifact/memory 会话持久化。
  - `src/draw/{dimensions,paths,local,api}.ts` —— 纯函数：比例 10 种（默认 16:9）× 分辨率
    长边 1K/2K/4K（默认 2K）× 画质 低20/中30/高50 步（默认高）、32 倍数对齐 + OpenAI 标准
    尺寸兜底表；`<outputRoot>/images/image-YYYYMMDDHHmmSS.png` 固定命名；mflux txt2img/edit
    cmd 组装；api 请求体（`images/generations`、Bearer、b64_json|url 双收）+ `${VAR}` 展开。
  - `src/plugin-tools.ts` —— `research_draw` / `research_draw_status` 两工具，仅
    `enableDraw:true` 的 preset 注册（preset-paper：白名单 +2 → **12 个**）；research 保持
    15、experiment 10 / engineering 8 / reviewer 8 不变。
  - `client/draw/{definition,route,DrawTab}.tsx` —— 右栏「科研绘图」tab（后端/模型选择 +
    api 折叠配置 + 垫图仅 local + 比例/分辨率/画质分段 + 输出目录 + 生成/轮询/预览 +
    会话级历史卡片）；`lib/client.js` 重建 47391 B。
  - `skills/draw/SKILL.md` —— 科研绘图纪律；`cordis.patch.yml` host 平面 9→**10 行**。
- **根因修复**：plugin-tools 原先在 preset 组合阶段 `ctx.get('researchDraw')` 时服务未就绪
  （research-draw 依赖 connection，web 基座 boot 晚于 preset 组合）→ 即使 enableDraw=true
  也不注册 draw 工具。改为**注册与解析解耦**：enableDraw=true 即注册，execute 时惰性解析，
  未就绪返回 `phase:'failed', error:'researchDraw 服务未就绪…'`。
- **行为变更**：paper 会话才有 research_draw 工具；research/experiment/engineering/reviewer
  默认无；tab 经 `research-draw config.enabled:false` 一行可关；已存在部署**需重跑
  deploy-profile.sh 并重启 `dsh research`** 生效。

实测：`node --test "src/**/*.test.ts"` = **253/253 全绿**（基线 216 + draw 24 + plugin-draw 9
+ plugin-tools 4）。runtime-smoke → **SMOKE PASS**（services 15 / tools research 15、paper
12 / experiment 10 / engineering 8 / reviewer 8 / roles / draw=true；local/api providers、
aspects=10、defaults 16:9/2K/high）。真机验收（用户侧）留在 TODO「在研 · 科研绘图」节。
提交号 `b01be2e`。

## 2026-10-19 · 域间路由意图合并调研报告（提交 `ab85631`）

需求（用户）：把 `docs/domain-intent-survey.md` + `docs/域间路由意图-调研与TRIZ机制方向.md` 与
新增内容合并为单一 `docs/域间路由意图-调研报告.md`——保留全部已核验 claim、补三条待核验 TRIZ
假说、§3.5 补 NIST/工业界素材、文末按正文首次出现编号的 14 条参考文献表。

- **关键产物**：
  - `docs/域间路由意图-调研报告.md` —— 9 章 + 8 张三线表 + §2 无编号链接（标签含字母）+ 文末
    纯文本 `参考文献` 14 条（[1]–[14] 按正文首次出现编号，[R]×8 / [C]×2 / [EB/OL]×4；FC-BGP
    [9] 为个人 I-D 非 RFC、RFC 9582 [5] 为 ROA profile 非 ASPA、DECLARE [10] = SIGMOD 2006
    pp.97–108、draft-li [12] 已过期归档）。
  - `docs/output/域间路由意图-调研报告.docx` —— build_docx.sh（prepare_reference_docx →
    pandoc --reference-doc → postprocess：引用转 Word REF 字段、文献自动编号、三线表、正文宋体
    小四 1.5 倍行距）产出，34509 B。
- **新增待核验假说**（source=triz, confidence=0.5，永不升级；各带文献级反证）：H1-2（sidecar
  分离，#2 Taking out，反证 RFC 7115 同步/分叉窗口）、H2-2（预签署推断，#10 Preliminary action，
  反证推断过期→增量风暴、信任边界污染）、H3-2（威胁自适应，#15 Dynamization）；H-UNI 保持
  disputed。
- **诚实口径**：实验 engine=sim（RouteEngineSim 确定性，mulberry32 种子 20261016）、reps=3、
  supportThreshold=0.8（外部设定）、严重度范围 "0.55–0.79"（不写 0.8）；五指纹与 20 格 sweep
  全部绑定实验 artifact。
- **核验结论（§6.4）**：V1 Fact verified（文献 4/4 + datatracker asintent=0 + 实验支持）；V2
  Result verified（但「达到 0.8」不被支持）；C5 Result rejected（subprefix +0.060、path-manip
  0.650 独立覆盖 ROV 盲区）；V3 Hypothesis disputed（ASPA 仅编码 provider 关系保 O(1) 可判定、
  SIDR 偏好单机制增量部署、RFC 9315 未投射跨 AS 安全域）。

测试与 SMOKE 数字：`check_references.py` → **PASS**（citations 14 unique / entries 14 / 顺序一致，
未用 --fix）；`build_docx.sh` → **OK**（docx 34509 B）；纯文档+产物提交，无代码改动 → 无单测需求。
TODO.md 本轮无条目变更（无相关 `- [x]` 移入，Paperclip 备忘/决策项未触碰）。提交号 `ab85631`。

## 2026-10-19 · TRIZ 会话级持久化 + 中间生成结果逐段应用（阶段 10，提交 `af345ce`）

需求（用户）：① 侧边栏「TRIZ 发明原理说明」记录当前只存在于内存，关闭 dsh 重开后丢失——要求
随会话历史一起保存（答：可以做到，已实现）；② TRIZ 应对**每次中间生成结果**都应用发明原理（不只
轮末最终答案），并核实 `docs/2610.04555v1.pdf` 是否覆盖该粒度。

- **论文粒度核实结论**：TRIZa 只按「演化候选 proposal」声明矛盾 + 原理——§1「Each candidate
  must declare a contradiction and an operator … before its result is known」、§3.2 式(1) 的
  typed proposal record `π=(id(s), c, r, τ_r, Δ, κ)` 是 code-evolution 每个候选变换的粒度，
  **未覆盖** dsh 对话 agent 循环里的逐条中间 assistant 消息/step；故在自动映射层补此粒度。
- **统一 ArtifactStore（持久化根因修复）**：plugin-core 原先另建全内存 ArtifactStore（=core.artifacts，
  research_triz 工具 / triz-auto 的写入点），而 createMemory 内部又私有建一个（=memory.artifact，唯一被
  persistMemory 序列化的源）→ TRIZ note 永不落盘。改为 `createMemory(store?)` 注入同一 store：
  core.artifacts == memory.artifact.store_，persist 即覆盖 TRIZ note；`profiles/{research,paper,
  experiment,engineering,reviewer}/cordis.patch.yml` 给 research-core 整行覆盖
  `memory.dir=dshHomePath('profiles/<name>/memory')`（此前 memory.dir 未配置 = 全内存）；重启后
  plugin-core `if(memory.dir) loadMemoryInto()` 还原，侧边栏按 sessionId 过滤恢复。
- **会话级维度**：note meta 打 `sessionId`（session/event 的 session.id）；route
  `/api/research.triz.notes?sessionId=` 按会话过滤（无 sessionId 的兼容 note——research_triz 手动
  调用/旧数据——全会话可见）；TrizTab 取数带 sessionId（会话作用域）、依赖 [signal, sessionId] 重取。
- **中间生成结果逐段应用**：triz-auto 不再只在 turn/end 映射最终答案——按 step 键缓存
  （`Map<step,text>`，同一步流式多帧覆盖去重），turn/end 对**每个实质中间 step**（末步 final:true）
  逐一 `mapResult` 落 note；note meta 增 `step/final`；侧边栏卡片显示「生成步序：第 N 步（该轮
  最终答案 / 中间生成结果）」；每轮批量映射后调 `deps.persist()` 落盘。短文本仍按
  `MIN_FINAL_ANSWER_LENGTH=40` 阈值过滤；`MAX_TRIZ_NOTES` 10→30。
- **client bundle 重建**：`lib/client.js`（client/route.ts + client/TrizTab.tsx 的 step/final/sessionId
  透传与展示）。
- **行为变更**：research 族 5 profile 的 research-core 现落盘到
  `$DSH_HOME/profiles/<name>/memory/research-memory.json`；已存在部署**需重跑 deploy-profile.sh 并
  重启 `dsh research`** 生效（sandbox 已实测），旧无 sessionId note 兼容可见。

实测：`node --test "src/**/*.test.ts"` = **216/216 全绿**（基线 207 + plugin-triz-auto 4 +
plugin-triz-ui 4 + memory 1）。runtime-smoke → **SMOKE PASS**（services / tools 15/15 / roles /
standard=0 / triz / triza / trizUi / clientGraph / trizAuto 全 true）。持久化往返实测：
boot→core.artifacts 写 note→persist→独立进程重启→loadMemoryInto 还原（sessionId/step/final 保留）
**PASS**。提交号 `af345ce`。
## 2026-10-16 · H-UNI 参数扫描：Dispersed vs Unified 意图仓库（AS 数 × 事件数网格）（提交 `9abadf6`）

需求（承接 2026-10-15 H-UNI 最小原型后 TODO「H-UNI 规模化扫描」的第一步）：把 S1 单脚本对比升级为
**AS 数 × 事件数网格确定性扫描**，为 **T4-DS3**（分散多写仓库的 write amplification / drift）做参数化
动机演示。本轮范围 = 开发 `run-sweep.ts` CLI + 网格化确定性场景生成 + 测试 + markdown 报告；
**不上升 V3 认证**（ASPA「表达力↔可判定性」兼容论证与「V3 是否升级」议项保留在 TODO）。

- **关键产物**：
  - `dsh-research/src/intent/sweep.ts` —— 确定性网格引擎：`generateScenario`（事件种类权重
    addProvider 0–0.18 / removeProvider 0.18–0.28 / addRole 0.28–0.44 / removeRole 0.44–0.52 /
    addForwarding 0.52–0.72 / splitPrefix 0.72–0.86 / revokeAll 0.86–1.0；6 条路由、path 长 2..3；
    每事件索引在 `events.push` 前按 `events.length` 写入 `failurePlan[key]=1`，仅 splitPrefix / revokeAll
    可注入、值恒 1、事件自身不带 failAfterWrite；splitPrefix 注入只「ROA 搬家 + FC 改写中止（漂移窗口）」、
    revokeAll 注入保守镜像不动）+ `mixSeed`（imul-mix 逐格/逐脚本错开）+ `runSweepCell` /
    `runSweep` / `summaryVerdict`（supportedRate≥0.8）/ `sweepToMarkdown`（逐格表 + 反例表）。
  - `dsh-research/src/intent/run-sweep.ts` —— CLI：`--as/--events/--scripts/--seed/--out`，
    默认 20 格（AS=[8,16,32,64] × E=[8,16,32,64,96]）× 每格 4 脚本 × 全局种子 20261016。
  - `dsh-research/src/intent/sweep.test.ts` —— 13 用例：生成确定性（fingerprint 含 name，异种子必异指纹）/
    事件不带 failAfterWrite 且子种子互异 / failurePlan 注入纪律（值 1、键=事件索引、仅 splitPrefix/revokeAll）/
    全网格至少一次注入（按脚本 seed 重生成验证）/ runSweep 整体确定性（JSON 相等）/
    `driftSum.unified===0` 且每脚本 driftUnified===0 / 每维计数不变量 `perDimOk[dim]+|cx(dim)|===scriptCount` /
    `supportedCount===scriptCount-唯一失败脚本数` / 范围检查 / 聚合一致性（avg/max/drift/coherent/compliant
    由脚本重算吻合）/ 流水线不抛 / Markdown 冒烟 / 脚本合计一致性。
  - `docs/intent-sweep-report.md` —— 报告（含 globalSeed 20261016，全报告可复现）。
- **关键数值（20 格 × 4 = 80 脚本）**：聚合 supportedRate **70%（56/80）** → 交叉尺度统一性 **C 级
  disputed**。drift（统一/分散）= **0/N**：分散随事件数单调增长（最大 36 @16×96、35 @32×96），统一态恒 0；
  eventWrites/verify/audit 平均比值基本 **<1**（统一更省，方向性支持 T4-DS3 写放大/审计开销动机）；
  verifyOps 个别格比值 >1（8×96 avg 1.94 / max 2.75）→ 反例 24 条（verifyOps 12 + violations 12）如实
  列出，不作升格。四维平均比值「全部 <1」未成立。
- **行为变更**：无（`src/intent/` 纯 TS、确定性、未接任何插件/host）。
- **测试**：`node --test "src/**/*.test.ts"` = **207/207 全绿**（基线 194 + sweep 13）。
- **TODO 同步**：L118「H-UNI 规模化扫描」拆为——已完成「AS×事件网格复跑 + CLI + 报告」；保留「ASPA
  可判定性兼容论证」与「V3 是否升级」议项。

---

需求（承接「域间路由意图综合调研」在研项）：为设计假说 **V3（disputed）**「H-UNI 统一意图中介层可
降低一致性维护开销」补最小原型实证——此前仅有文献级可行性论证（`docs/domain-intent-survey.md` §5.1-⑤
「H-UNI 无直接实验」）。本轮采用**窄口径**：只量化「对象级操作次数」+ 跨家族一致（coherent）+ 漂移
窗口（drift），明确不覆盖表达力↔可判定性 / 增量部署 / 缓存失效 / 信令等 V3 反证维度 → 仅 **C 级证据，
V3 维持 disputed，不升级**。

- **关键产物**（`dsh-research/src/intent/`，纯 TS、确定性、未接插件）：
  - `types.ts` —— CanonicalIntent / IntentEvent（7 种，可带 `failAfterWrite` 演示多写部分生效）/
    CostCounters / RouteVerdict（coherent=`!(forwarding=committed && origin≠valid)` 自相矛盾检测）/
    IntentRepo 接口 / `totalWriteSteps` / `isPartialFailure`。
  - `dispersed.ts` —— 分散载体基线（ROA/ASPA/Roles/FC 四独立对象）；本轮修正 revokeAll：只有「被
    take 的步骤」真正落库（原删除无条件落库、漂移只计不演示），与 splitPrefix 一致后部分失败才真实
    产生陈旧跨家族引用。
  - `unified.ts` —— 每 AS 单一 AsIntentObject 四面共居，变更原子 1 write+1 signOp，audit 对象内核查。
  - `compare.ts` —— S1（4-AS / 7 事件 / 2 处部分失败 / 3 条路由）三态（分散含失败 / 分散无失败基线 /
    统一）同脚本对比 + `evaluateV3Narrow` + `toReportMarkdown`。
  - `intent.test.ts` —— 6 用例：种子等价 / S1 漂移与 coherent / splitPrefix 替换与悬空 FC /
    revokeAll 部分失败陈旧引用 / addRole 角色判定 / 步骤口径。
- **关键数值（S1）**：验证+审计 lookups 23→8（0.35×）、验签 verifyOps 6→3（0.5×）、审计 lookups
  3→1、drift 2→0、审计违规 2→0；事件阶段写放大（无失败基线）11→8（0.73×）；writes/signOps 打平 14。
  R2 直接演示分散态自相矛盾（ROA 已迁移、FC 仍引用旧前缀 → origin notFound 却 forwarding committed）。
  V3 窄口径六维全过 → **supported，方向性支持**（C 级）；报告 `dsh-intent-survey/huni-min-proto-report.md`。
- **行为变更**：无（新模块未接线任何插件/host；只读文档口径不动）。
- **测试**：`node --test "src/**/*.test.ts"` = **194/194 全绿**（基线 188 + intent 6）。
- **TODO 同步**：H-UNI 最小原型检掉，转记「H-UNI 规模化扫描（AS×事件网格 + ASPA 可判定性纪律）」。

---

## 2026-10-15 · TRIZ 侧边栏广度 + 矛盾来源标注（1+2+3 轮）（提交 `d5ea578`）

需求（用户，承接「问答 TRIZ 下线 · 侧边栏唯一化」e2f767c）：侧边栏「TRIZ 发明原理说明」调研半天只
涉及 3 个发明原理，质疑是否要换更强模型。结论：**非模型问题**——起因是 `mapResultToTriz` 只展示
didactic（矛盾分析命中），而默认矛盾恒为 detection↔complexity，精选矩阵 cell (28,36) 固定返回
[23,2,24] 三个。本轮三管齐下，侧边栏在不换模型的前提下展示随内容变化的更多原理：

- **矛盾不再固定**（`src/triz/index.ts`）：新增 `extractContradiction()` 规则词表
  （`CONTRADICTION_LEXICON`，收益类→improving / 代价类→worsening）+ 精选矩阵优先匹配——可靠性↔收敛、
  抗劫持↔延迟、吞吐↔开销…不再恒为 detection↔complexity。
- **特征词反演放宽**（`src/triz/result-map.ts`）：`matchedTerms()` 增加英文规范名词干分片 +
  `TERM_SYNONYMS` 中文同义扩充表（预计算→#10、闭环→#23、旁路→#2、蜜罐→#22、纵深→#40、冗余路径→#14…），
  didactic+retrospective 补足至 **5 条上限**。
- **矛盾来源如实标注**：`contradictionOrigin` 三态（tool=显式参数 / extracted=文本规则提取 /
  default=默认检测↔复杂度）经 `plugin-triz-auto.ts`/`plugin-triz-ui.ts`/`plugin-tools.ts`/
  `autonomous/index.ts`/`client/route.ts`/`client/TrizTab.tsx` 全链路透传，侧边栏卡片显示「矛盾来源」；
  `meta.candidates` 全量收录（didactic+retrospective）使卡片条数与正文一致；旧 note 无字段回落 default
  兼容不破坏。
- **修复 2 条错误测试断言**（先复现再改，均非代码 bug）：`(27,25)` 精选矩阵 cell 本就含 #23 →
  改断言结果文本「旁路」反演 #2 以 retrospective 入卡；样例「参数化可调」致 #35 双词命中（score 2）
  抢占 #14 名额 → 调整样例文本使 #11/#14 均在 5 条上限内。
- **测试与 SMOKE**：`node --test "src/**/*.test.ts"` = **188/188 全绿**（基线 186 修复 → 188）；
  runtime-smoke 复核见本轮（SMOKE PASS 确认中）。提交号 `d5ea578`。

## 2026-10-15 · 域间路由意图综合调研（三线合并 + 交叉缺口 G1–G5）（提交见本轮）

需求（用户）：Web GUI 发起「域间路由意图调研」，经确认选择**综合调研** = 三条调研线 + 交叉缺口
分析：① 意图驱动域间路由 / IBN；② 路由·策略意图语义与合规（含 ASPA / ROV 路径意图）；③ 域间路由
安全中的意图（来源 / 所有权意图）。交付物 = 中文调研报告（`research-report-word` 规范，纯表格、
零 media 图片），不做幻灯片、不做 research_paper 输出。

- **关键产物**（`dsh-intent-survey/`，本会话新建）：
  - `域间路由意图综合调研报告.md` —— 摘要 → 引言（术语表 / 速览表）→ Track A/B/C → 交叉缺口
    G1–G5 + 全景对照（含「性质」列）→ 课题建议 5 条 → 结论（核心 Claim 表）→ 局限 7 条 →
    证据可追溯（E1–E16）→ 参考文献 29 条（首现顺序严格一致）。
  - `sources/rfc-status-notes.md` —— 定稿口径表 + 20 条逐条外部核验 + 纠错历史 + docx 修正记录。
  - `sources/survey-evidence-log.md` —— E1–E16 证据→claim 映射表（ID/claim/Type/置信/来源/核验方法）
    + 使用说明（WeKnora 未命中声明 + E15 窄证据限定）。
- **关键判定（已落报告表 5-2-1-1，含「性质」列）**：RPKI / ASPA / BGP Roles = 密码授权事实（强锚）；
  BGP Community / RPSL = 策略信令（弱载体、碎片化、劫持者可注入，RFC 1997/7999/8092，无 9047）；
  BGPsec = 运行时证明非意图语言（RFC 8205/8206，明示排除）；SCION path-authorization = 唯一数据面
  路径意图载体（IRTF PANRG I-D）；RFC 9871 BGP CAR = 最近似域间 IBN 但受限（AIGP/RFC 7311 参与
  bestpath）；RFC 9774 = AS_SET 弃用新证据（Track B）。缺口 G1（声明盲区：ROA 声明 ≥60% vs 有效
  ROV ≈6.5%）、G2（单侧 vs 双向意图边）、G3（广义 IBN 意图不支持）、G4（无保证闭环 SHOULD vs IS）、
  G5（权威层级混合：RPKI 认证 vs IRR 未认证 vs Community 可注入）。
- **口径纠错（本轮，4 处 edit）**：`docs/` 三文件（domain-intent-survey / 域间路由意图-调研与TRIZ
  机制方向 / research-agent-migration-plan）中「ASPA≈RFC 9319」误标全部更正 —— ASPA 验证算法 =
  `draft-ietf-sidrops-aspa-verification-28`、对象 profile = `draft-ietf-sidrops-aspa-profile-29`，
  双组件均为活跃 I-D、**无 RFC**、与 RFC 9319（maxLength 承载 BCP 185）无关；RFC 9047 剔除
  （EVPN ARP/ND，勿列 BGP community）。`reports/` 两份报告本身无此误标，未动。
- **验证**：`check_references.py` → **REFERENCE CHECK OK（citations: 29 unique / bibliography
  entries: 29，未触发 --fix）**；证据层级拆分 A=标准原文事实 / B=部署测量与检索 / C=实验窄证据
  （全部 disputed，不支撑广泛 claim）。
- **附注**：RFC 9315 / ASPA 双 I-D / RFC 9871 / SCION overview 未全在 WeKnora RFC KB（检索 None），
  报告 §8 已如实声明，判定以标准原文 + IETF datatracker + LARUS/APNIC 线索立证；`deepseek-harness/`
  submodule 零改动；profiles/*/cordis.patch.yml 为模型层 contextWindow/maxTokens 调参（web GUI 保存），一并提交保留。

---

## 2026-10-15 · 问答 TRIZ 下线 · 侧边栏唯一化：TRIZ 只留右侧栏「发明原理说明」面板（提交 `e2f767c`）

需求（用户）：侧边栏与问答中的 TRIZ 表现不一致——问答的「本回答对应的 TRIZ 发明原理映射」是
persona 让**模型自写**（从记忆中的 40 原理脑补，可能与确定性分析冲突）；侧边栏是**确定性代码**
（`mapResult`：精选矩阵 + 特征词，来源徽标三态）。用户明确：**问答可以不要 TRIZ，侧边栏必须有**。
修改后口径：TRIZ 唯一展示面 = 右侧栏「TRIZ 发明原理说明」面板（展示 research_triz 工具分析出的
发明原理与推理链，全部为待核验假说 source=triz, confidence=0.5，须经 research_verify /
research_campaign 验证后才成为结论），问答正文不再出现 TRIZ 小节。

- **关键产物**：
  - `dsh-research/presets/research.patch.yml` —— persona 移除「EVERY final answer MUST end
    with 本回答对应的 TRIZ 发明原理映射」（含矛盾种子 (28,36)→#23/#2/#24、逐条理由格式），改为
    「可用 `research_triz` 工具产假说（进右侧栏面板，source=triz, confidence=0.5 待核验），
    但**不得在回答正文追加 TRIZ 小节**——TRIZ 的唯一展示面 = 右侧栏面板」。
  - 侧边栏零改动：`client/TrizTab.tsx` 标题「TRIZ 发明原理说明」+ 文案「展示本次研究过程中
    research_triz 工具分析出的发明原理与推理链。所有推荐均为待核验假说（source=triz,
    confidence=0.5），须经 research_verify / research_campaign 验证后才成为结论」即用户口径；
    `research-triz-auto`（每轮自动落 note）/ `research_triz` 工具 / `/api/research.triz.notes`
    均未动——侧边栏仍每轮自动/手动更新。
  - `README.md`（「TRIZ 方法论接入」第 8.7 条改写 + 新增修订说明）；`dsh-research/README.md`
    （阶段 8.7 追加 2026-10-15 修订段落，历史实现保留、行为口径现改为侧边栏唯一）。
- **验证（沙箱，dsh 0.2.0-rc.2 / Node 24）**：单测 **183/183 全绿（无回归**，persona 不在任何
  单测/冒烟断言中）；persona 折叠标量（`>-`）缩进一致（全部 16 空格），问答强制 TRIZ 指令残留
  计数 = 0。persona 属 profile 配置（boot 时载入），沙箱与既有 runtime-smoke 口径一致。
- **待办（真机，已列 TODO「在研 · 问答 TRIZ 下线 · 侧边栏唯一化」）**：重启 `dsh research` 后
  确认问答正文不再出现 TRIZ 映射小节、右侧栏「TRIZ 发明原理说明」面板仍在且每轮更新、手动
  `research_triz` 仍能落 note——两套 TRIZ 不再冲突。

---

## 2026-10-15 · 域间路由意图全景调研 · 结论速览（简报式交付）（提交 `6f9b5fe`）

需求（用户）：原请求「域间路由意图调研」；消歧后确认 scope=**全景调研**、deliverable=**简报式结论速览**
（判定表 + 关键缺口 + 课题建议，**不做**全流水线论文/幻灯片/实验）。已取消选型未执行。

- **做了什么**：把「路由意图」从 RFC 9315（IRTF NMRG 2022，intent=声明式期望结果 vs policy=约束行为的规则）
  口径出发，逐机制判定其是否承载 IBN 式意图：ROA/ROV ✅（强·单侧授权事实）、ASPA 🟡（I-D·顾客→上游
  传播路径授权·无偏好）、BGPsec ❌（运行期逐跳证明非意图语言，RFC 8205/8206）、IRR/RPSL 🟡（声明型弱权威）、
  BGP community 🟡（本地语义·可被劫持者注入，RFC 1997/2622/7999）、SLURM 🟡（RP 本地定制 RPKI 视图=本地意图
  例外层，RFC 8416）、SCION ✅（数据面 hop-field+MAC 链·唯一真路径意图）、IBN 域间线 ⚠️（无标准意图语言/
  assurance 环，Princeton BGP 配置验证佐证）、RFC 9871 BGP CAR 🟡（最接近 IBN 域间落点·场景受限）、
  课题「多源共识三视图」✅（补缺口接缝）。
- **关键缺口 G1–G5**：G1 声明盲区 40–50% + partial deployment；G2 单侧 vs 双向（ASPA 顾客→上游，无接收偏好）
  往语义；G3 广义意图（偏好/优化/时变/条件）结构性不支持（快照式签名+慢更新，maxLength 授权粒度↔伪造子前缀
  面张力，RFC 6480 §3.2/§4.1、RFC 7115、RFC 9319）；G4 缺 SHOULD↔IS assurance 闭环（RFC 9315 assurance 五部件，
  RFC 7908 仅事后行为告警）；G5 权威层级混排（RPKI 强/IRR 弱/community 无语义）→ 多源共识为自然解法。
- **课题建议 5 条**：① 锚点分级 + 盲区显式 `UNKNOWN` 态兜底；② 补双向意图边；③ assurance 闭环指标
  （intent-compliance/drift）；④ community 注入攻击面列入异常视图；⑤ 表达模型可翻译（对接 ASPA/RFC 9871/SCION）。
- **关键产物**：
  - `reports/域间路由意图全景调研-结论速览.md` —— 交付物（§0 一句话结论 + §1 RFC 9315 口径表 + §2 逐机制
    判定表 11 行 + §3 G1–G5 + §4 课题建议 5 条 + §5 证据追溯 12 条，各条标来源属性与复核口径）。
  - artifact store（kind=evidence-log）：**art-1** RFC 8416 SLURM=本地化意图载体 / **art-2** community+RPSL=
    运营信号型弱意图载体 / **art-3** SCION 路径意图 + RFC 9871 CAR + APNIC IRV；落盘
    `artifacts/domain-routing-intent-survey/research-memory.json`。
  - 证据底座复用既有 `reports/RPKI承载域间路由意图-调研报告.md`（RW 全表，terabytes 形态无需重复检索）。
- **证据约束（如实标注）**：RFC 9315 / ASPA I-D / RFC 9871 不在 WeKnora RFC 知识库检索命中范围内，判定以
  「既有报告 + RFC 原文 + 外网线索」立证，简报 §0 顶部显式声明，未冒充 KB 检索；「更新 RFC 4271 默认不导入
  导出」未挂编号。
- **测试与 SMOKE**：文件已写入并复核结构（§0–§5 齐全）；无代码改动、无测试。提交号 SHA 提交后回填。

---

## 2026-10-15 · 联网搜索切换：弃用 dsh 内置 web 搜索 → `dsh-web-search-plugin`（提交 `86b730f`）

需求（用户）：不再使用 dsh 内置的 web 搜索（base 的 `web-search-deepseek` host 插件，DeepSeek
官方后端），改用社区插件 `dsh-web-search-plugin`（v0.5.x，9 个后端：DeepSeek 官方默认 / Tavily /
Brave / Serper / SerpApi / Exa / SearXNG / Scavio / Firecrawl），且**在 deploy 时与
`@wxg-prc-cpg/dsh-weknora` 一样自动检测并安装**。`web_search` 工具沿用不变，只换底层 provider；
插件 bundle 自带 patch 覆盖 `web` 行 `searchProvider=dsh-web-search` + 禁用内置
`web-search-deepseek` + 插入插件行（默认 `provider: deepseek-official`，第三方后端在
Web UI → 设置 → 网页搜索 卡片运行时切换，免改 YAML/免重启）。

- **关键产物**：
  - `profiles/research/package.json` —— `dsh.profile.bundles` 与 `dependencies` 追加
    `dsh-web-search-plugin`（`^0.5.1`），description 同步（重跑 deploy 不丢插件）。
  - `profiles/research/cordis.patch.yml` —— 追加 `- id: dsh-web-search-plugin` 配置行
    （默认 `provider: deepseek-official`；插件未装时该行被静默丢弃，非致命，装上即生效）。
  - `dsh-research/scripts/deploy-profile.sh` —— weknora 单块补装改为**通用插件循环**
    `for plugin_spec in "@wxg-prc-cpg/dsh-weknora" "dsh-web-search-plugin"`：grep package.json
    声明 → node_modules 缺失自动 `dsh plugin add` → 已装跳过 → 失败仅 warn；
    `DEPLOY_AUTO_PLUGINS=0` 打印手动命令。
  - `README.md` 新增「联网搜索切换」章节（deploy 生命周期 / 选后端 / 排查表 / 兼容性）；
    `profiles/README.md` bundle 清单补两插件。
- **验证（沙箱，dsh 0.2.0-rc.2 / Node 24，DSH_HOME=/tmp/dsh-home）**：
  - Fresh deploy 自动补装 weknora + dsh-web-search-plugin；重跑打 `already installed`；
    `DEPLOY_AUTO_PLUGINS=0` 打两条手动命令；`bash -n` 通过。
  - `--dump-config`：组合树 `web.searchProvider=dsh-web-search` + `fetchProvider=http`、
    内置 `web-search-deepseek` `disabled: true`、插件行 `provider: deepseek-official`。
  - 未装场景仅非致命 `skipping profile bundle ... cannot resolve` / `patch: entry not found`，
    boot 正常退出（exit=0）。
  - runtime-smoke → **SMOKE PASS**（services 15/15, tools 15/15, standard=0, roles 10/10/8/8）；
    单测 **183/183 全绿**（无回归）。
- **待办（真机，已列 TODO「在研 · 联网搜索切换」）**：浏览器侧栏插件页可见、设置→网页搜索卡片
  选第三方后端、`web_search` 不再耗官方搜索模型 token。沙箱无法开浏览器，留待用户
  `DSH_HOME="$HOME/.dsh" ./dsh-research/scripts/deploy-profile.sh && dsh research` 确认。

---

## 2026-10-15 · 阶段 9 · TRIZa 闭环：冻结契约 → 类型化变换 → FI/Ideality → 硬门晋升 → 可追溯（提交 `566bd7c`）

需求（用户）：继续读论文 `docs/2610.04555v1.pdf`（TRIZa: Guiding Agent Evolution from Pattern
Recognition to Solution Invention，arXiv:2610.04555v1），把 TRIZa 从「理念」落成 `dsh research`
的**可执行闭环**。定位（AGENTS.md §7）：TRIZa = 方法论/程序性能力 → 服务 + skill，不是领域知识。
与阶段 8 衔接：`researchTriz` = 事前/正演想法（矛盾 → 原理 → 假说，confidence=0.5）；
`researchTriza` = 事后/治理（冻结评估契约 → 类型化变换契约 → FI/Ideality → 四类硬门 → 晋升决策
→ 追溯记录）。铁律：**指标提升是观察，晋升是被治理的决策**；硬门任一失败 FI 不可覆盖。

- **新模块 `src/triza/`（8 文件）**：
  - `contract.ts` —— 冻结评估协议 κ（数据集版本/划分/预处理/feature-fit/种子/预算/主次指标/
    useful·harmful 合格事件/资源上限/缺失值行为/停止规则 + 晋升阈值）；**协议指纹 = SHA-256 of
    规范化绑定字段序列化**（改任一绑定字段 → 新指纹，silently 扩展旧结果不被允许；claimId/task/
    contradiction/frozenAt 不参与指纹，同协议可多 claim 复用）。
  - `typed.ts` —— 40 原理整表（论文 Table 4）→ 类型化变换类 + **精选路由安全子集 14 条**
    （原理 1/2/3/5/10/11/13/15/22/23/24/25/35/40）详细契约（输入/输出类型、允许参数、禁止变更、
    证据义务）；其余 26 条 generic 占位（诚实标注非权威）。
  - `functional-information.ts` —— 公式(2)/(3) useful/harmful **位口径分开报告**（useful 提升不能
    数值抵消 harmful 增加），Wilson 比分区间给保守界（useful 上界偏小不夸大、harmful 下界偏大不
    低估），公式(5) Ideality `J = IU_LB/(IH_UB + λ·cost)`（描述性打平指标，不决定认证）。
  - `promotion.ts` —— 证据阶梯 L0–L3 + 认证等级 Lcert（公式 4）+ 四类硬门（integrity/safety/
    reproducibility/resource，可自定义 extra）；决策顺序：硬门任一失败 → reject/escalate（高风险
    待人工授权）→ 认证 < 施加等级 → revise → 相对增益 < 冻结阈值 或 次级硬门槛不过 → **reject 且
    保留完整负证据**（论文 CICIoT 形式化 V2 语义）→ 全过 → promote；不同决策边界不打平（Table 2）。
  - `trace.ts` / `audit.ts` —— 追溯包（triz_context.json / triz_strategy_plan.md / scores.jsonl
    追加式 / 逐文件 SHA256SUMS，论文 Appendix A.1）+ 控制器策略审计（balanced vs safety-first，
    Figure 2B 语义：promotion F1/recall/specificity 描述性聚合，嵌套决策不给 p 值）。
  - `index.ts` —— `ResearchTrizaService`（freezeContract / typedPlans / evaluate / audit），
    evaluate = 冻结契约 → 原理（显式给定或经 researchTriz.analyzeProblem 推导）→ typed 变换 →
    FI/Ideality → 硬门 → 晋升决策 → 追溯包完整闭环。
- **新 host 插件 `src/plugin-triza.ts`**（exports `./triza`，`name='dsh-research-triza'`，
  `ctx.provide('researchTriza', …)`）；`cordis.patch.yml` host 平面 core 服务 **6 → 7 行**
  （core/triz/**triza**/director/experiment/writer/operations + triz-ui/triz-auto，共 9 行）。
- **`research_triza` 工具**（第 **15** 个 research_* 工具，preset 作用域；engineering 白名单
  **7 → 8** 含 research_triza；paper/experiment/reviewer 不变 10/10/8）：入参
  `problem/improving/worsening/candidateId/parentId/principleNos/metrics/baselineMetrics/
  referenceUseful/referenceHarmful/evidenceLevel/certifiedLevel/gates/relativeGainPct/
  requiresAuthorization/record`；输出 claimId + 64 位协议指纹 + typedPlans + decision
  （promotion/admissible/gateFailures/certification/fi/relativeGainPct/…）+ traceSummary +
  artifactId；`record` 默认写 artifact（kind=note, title^="triza: "）+ episodic（kind=triza），
  **负证据保留**。
- **`scripts/pack.sh` / `runtime-smoke.mjs` / 单测同步**：REQUIRED 增 `plugin-triza.js`；
  EXPECTED 15、ROLE_TOOLS.engineering 8、servicesOk 含 researchTriza、triza 冒烟（64 位指纹 /
  promote 决策 / 追溯包 ≥3 文件）。
- **验证（沙箱）**：单测 **183/183 全绿**（基线 168 + `src/triza/triza.test.ts` 14：指纹确定性 /
  FI 公式手工核对 / 类型化契约 / 四条晋升决策路径 / 审计语义 / 追溯包 / 服务 evaluate+audit /
  collectGates + `plugin.test.ts` 阶段 9 工具闭环冒烟）；runtime-smoke → **SMOKE PASS**
  （services 14/14 含 researchTriza、tools 15/15、engineering 8/8、triza=true）；`scripts/pack.sh`
  → **PACK OK**（basil-dsh-research-0.2.1.tgz，91 条、无 src/*.ts）。真机部署与实测待用户
  （沙箱无法写 `~/.dsh` / 开浏览器）。
- **关键产物**：`docs/2610.04555v1.pdf`（论文源）+ `dsh-research/src/triza/`（闭环实现）+
  `dsh-research/README.md`（阶段 9 章节）+ `research_triza` 工具（第 15 个）+ `dsh-research-triza`
  插件（exports `./triza`）。

---

## 2026-10-14 · 阶段 8.7 · 右侧栏面板可见性根因修复 + 每个最终回答自动映射 TRIZ

需求（用户，最新一轮）：① 部署后**右侧栏看不到「TRIZ 发明原理」面板**——「我要的应该不是
TRIZ skill，而是你每次给出的结果都要对应到 TRIZ 发明原理，解释在右侧栏那一栏」；② 不要
「写进文件才解释」——**每个回答都要有 TRIZ 解释**。本阶段 = 修面板可见性 + 让「每个最终
回答」在右侧栏自动多一条 TRIZ 映射。

- **面板可见性根因（为什么部署后看不到）**：`@deepseek-ai/dsh-client-modules` 扫描 host
  Loader 条目找声明 `dsh.client` 的包，`exactPackageSpecifier()` **只认裸包名 / 两段
  `@scope/name`**，三段子路径（如 `@basil/dsh-research/core`）一律 `void 0` → `@basil/
  dsh-research` 的 `package.json`（含 `dsh.client` 声明与 `exports["./client"]`）**永远发现
  不了** → 浏览器半边 `client/index.ts`（右侧栏 TRIZ Tab）**从未进入 `window.__DSH_BOOT__`
  组合图** → 面板必然不可见（非 UI 问题，是 bootstrap 根本没带它）。
- **修复**：`cordis.patch.yml` 首行 `research-core` 的 `name` 由 `@basil/dsh-research/core`
  改为**裸包名 `@basil/dsh-research`**（`main`=src/plugin-core.ts，与 `./core` 同入口，
  host 行为零变化）；其余 6 行子路径不动（各自 cached negative，安全）。`lib/client.js`
  重新 build（10657B，含 `keepMounted:true`——面板打开后会话切换/隐藏不销毁）。
- **`research-triz-auto`（新 host 插件，`@basil/dsh-research/triz-auto`，exports `./triz-auto`）**：
  订阅公开 `session/event` 事件总线——`user/message` 缓存问题、`assistant/message` 缓存答案
  （同轮多 step 覆盖、`interrupted:true` 跳过）、`turn/end` 判定**最终答案** →
  `researchTriz.mapResult`（缺省矛盾 改善 detection ↔ 恶化 complexity → 精选矩阵 (28,36)
  → #23/#2/#24）→ 写 `researchCore.artifacts`（`kind=note, title^="triz: ", meta.auto=true`，
  即右侧栏面板数据源）+ `researchMemory.episodic`（kind=triz）→ **面板自动更新**；每轮至多
  1 条（turn/end 清缓存，天然去重）。依赖 `ctx.get` 惰性读取、缺失安全跳过；不注册工具、
  不 provide 服务。对 research 族全部 profile（research/paper/experiment/engineering/reviewer）
  会话生效——这就是「研究时默认就调用 TRIZ」的全会话语义。
- **persona 纪律**（`presets/research.patch.yml`）：EVERY final answer 必须以标题
  **`### 本回答对应的 TRIZ 发明原理映射`** 收尾，逐条 `「原理#N Name — 一句理由」`（1~5 条），
  优先矛盾推理（改善 detection ↔ 恶化 complexity → cell (28,36) → #23/#2/#24；不适用则写
  `直接应用原理 #N Name`），一律标注待核验假说（source=triz, confidence=0.5），**无需额外
  调用工具**（从已知 40 原理推理）。
- **面板位置 / 生效要求（写给用户）**：右侧栏 → guide 页 → **「TRIZ 发明原理」** 条目；
  打开后 `keepMounted` 常驻。**改完必须重启 `dsh research`**（client-modules 对「非 client
  包」的 negative 判定按 source 缓存；重启前旧进程仍 401/无面板）。
- **验证**：单测 **168/168 全绿**（基线 162 + `plugin-triz-auto.test.ts` 6）；runtime-smoke
  → **SMOKE PASS** 新增 `client-graph=true`（graph.entries 含 `@basil/dsh-research` =
  面板可见性根因回归）＋ `triz-auto=true`（真实 services 驱动 createAutoTrizMiddleware，
  user→assistant→turn/end 恰好 1 条 auto note，source=curated-matrix, entries=3）。
- **文档 / 卫生**：README（root+TRIZ 小节）、`dsh-research/README.md`（host 7→8 行、插件
  8→9、阶段 8.7 小节）、CHANGELOG、TODO 里程碑同步。

## 2026-10-14 · 阶段 8.6 · 默认调用 TRIZ + 每次研究结果 ↔ 发明原理映射（论文§6 / 幻灯片 / 右侧栏）

需求（用户，三条）：① **git 每轮收尾完整提交一次并说明改了什么**；② research 时**默认就调用
TRIZ**（不是可选项）；③ 不要 TRIZ skill，要**每次给出的结果都对应到 TRIZ 发明原理**——即研究
产出（问题 / 假设 / claim / 实验结论）要反演映射回其体现的发明原理并给出理由，右侧栏一栏解释
「最终结果用了 TRIZ 的什么原理 / 为什么这么做」。承接阶段 8（research_triz 正演矛盾分析）与
8.5（右侧栏面板），本阶段把 TRIZ 从「手动工具」升级为「**默认自动 + 结果反演映射**」。

- **`src/triz/result-map.ts`（新）**：`mapResultToTriz` 双通道映射引擎——
  `didactic`（前置 `analyzeProblem` 矛盾分析命中的候选，永远在场）＋ `retrospective`
  （结果文本对原理 name/aliases（中英）做特征词打分补足，最多 `MAX_RESULT_MAPPING=5` 条、
  无命中不硬凑）；每条 = `[原理N Name] + kind + 理由`；输出全为**待核验假说**
  （source=triz, confidence=0.5），须经 research_verify / research_campaign 验证后才成结论
  （诚实标注，不作事实断言）。
- **`src/triz/index.ts`**：`ResearchTrizService` 新增 `mapResult`；service 缺省矛盾
  `improving:'detection' ↔ worsening:'complexity'`（命中精选矩阵 cell (28,36) → #23/2/24），
  接受调用方 override。
- **`src/autonomous/index.ts`**：`runAutonomousResearch` 新增 **2.6 默认 TRIZ 步骤**
  （`input.triz !== false`，即默认开启，`triz:false` 可关）：把 topic + hypothesis +
  claim + campaign 统计 + 矩阵拼成结果文本 → `mapResult` → 写 `kind=note, title^="triz: "`
  artifact（右侧栏面板**自动可见**）+ episodic（kind=triz）→ 映射进论文 §6 + 幻灯片页；
  `AutonomousReport.triz`、summary 统计「N 条 TRIZ 原理映射（待核验）」。
- **`src/writer/paper.ts`**：新增 `PaperTrizMapping` / `TRIZ_SOURCE_LABEL` / `TRIZ_KIND_LABEL`；
  新增 **§6 TRIZ 发明原理映射**（问题 / 来源 / 矛盾 / 原理表）+ 局限顺延 **§7**（无 TRIZ 映射
  时局限回退 §6，编号不跳号）；摘要统计映射条数。
- **`src/writer/slides.ts`**：新增 **5c «TRIZ 发明原理映射（本结果对应）»** 页（问题 / 来源 /
  矛盾 / 逐条 `#N Name（类型）：理由` / 待核验标注），插在实验矩阵页之后、结论页之前。
- **`src/plugin-tools.ts`**：`research_triz` 入参新增 `resultText`——传时输出 `mapping` 并写
  进 artifact body（正演假说行 → 映射行），episodic 注明条数；`research_autonomous` 输出新增
  `triz`（render 展示 source/contradiction/entries）。
- **文档**：`docs/survey-interdomain-routing-intent-triz.md`（TRIZ 视角的域间路由意图调研，
  与既有 intent-survey 配套）。
- **验证**：单测 **162/162 全绿**（+ `result-map.test.ts` 7；triz + mapResult 2；writer 补
  TRIZ §6/幻灯片 2；autonomous 默认 TRIZ + `triz:false` 关闭 2）；runtime-smoke → **SMOKE PASS**
  新增 `triz entries: 3`（默认流水线即产出 3 条映射，论文含 §6、幻灯片 10 页）。
## 2026-10-14 · 域间路由意图（AS Intent）调研 + TRIZ 核验闭环

需求：`research_triz` + 调研域间路由意图（inter-domain routing intent）——把「意图」作为跨 AS
声明式安全策略表达/验证的调研题目：现状盘点 → Gap 定位 → TRIZ 机制方向 → 核验闭环 → 中文调研报告。

- **现状盘点**：RFC 9315（意图通用概念，IRTF NMRG，域内管理域）、RFC 9234（BGP Roles/OTC =
  角色意图）、ASPA draft-28（上游授权意图）、ROA/ROV（起源意图，RFC 6811/6480）、FC-BGP
  （转发承诺意图，SIDR/IDR 工作项、草案期非 RFC）四类载体 + 通用概念层。
- **Gap 实证**：datatracker `name__icontains=asintent` → 0 命中；`as-intent` → 仅 1 条过期
  TEAS 草案（流量工程，非安全验证）；`intent` 全量 206 项均非路由安全 →「无统一 AS 路由
  意图对象」成立（V1 verified）。
- **TRIZ**：`research_triz`（测量精度 28 ↔ 系统复杂度 36，curated-matrix）→ 候选 #23 反馈 /
  #2 抽取 / #24 中介；对照既有工作 #23/#2 已被内化，**#24 统一 AS 意图中介层 = 核心 Gap 方向
  （假说 H-UNI, source=triz, confidence=0.5）**。
- **实验（RouteEngineSim, reps=3, 阈值 0.8, 五指纹）**：base/prefix det=0.093；rov/prefix=0.792；
  rov+aspa/subprefix=0.610 vs rov/subprefix=0.55（ASPA +0.06，C5 被证伪）；aspa/path-manip=0.650
  （覆盖 ROV 盲区）；FP≤0.022。五指纹配置指纹 fp-2047234355 / fp-483651690 / fp-2040600629 /
  fp-873252011 / fp-84288830。
- **核验闭环**（research_verify）：V1 verified（无统一意图对象 Gap）；V2 verified（意图验证
  0.093→0.55–0.79、FP≤0.022，「达 0.8」部分被数据否定）；C5 rejected（ASPA 在原子上 +0.06 且
  独立覆盖路径操纵）；V3 disputed（H-UNI 受「表达力↔可判定性」取舍与 SIDR 单机制偏好约束，
  仅设计假说，未实证）。
- **产出**：`docs/domain-intent-survey.md`（中文调研报告：8 条文献按首次出现编号、表题前置、
  逐条可追溯）+ `docs/output/domain-intent-survey.docx`（Word 版，report-word 转换管线）+
  artifact 证据日志 art-5。
- **口径决策（待用户确认）**：域间路由意图 = 跨 AS 声明式安全策略（origin/provider/role/
  forwarding 四类意图对象 + 跨 AS 验证），**不**含域内 IBN 控制器意图；已在报告 §1.2 / §六
  显式列明，用户认可后再将「意图/intent」词条增补进 vocabulary.ts。

---

## 2026-10-14 · 阶段 8.5 · 右侧栏「TRIZ 发明原理」面板（Web UI 可视化）

需求（用户）：`dsh research` 的研究结果要在 **Web UI 右侧栏有一栏**，解释「最终结果用了 TRIZ
的什么发明原理 / 为什么这么做」。承接 `research_triz` 工具（每次分析写 kind=note artifact），
把 TRIZ 分析从「工具返回」升级为「右侧栏可视化的解释层」。分层：host 半边只读数据、浏览器半边
只渲染，不进 Research Loop，不新增 `research_*` 工具。

- **host 半边** `src/plugin-triz-ui.ts`（exports `./triz-ui`，inject `['connection']`）：
  `cordis.patch.yml` 第 3 行（host 6 → **7 行**），在 connection 鉴权栅栏内挂**只读 GET**
  `/api/research.triz.notes` —— 从 `researchCore.artifacts` 过滤 TRIZ note（kind=note /
  !archived / source ∈ curated-matrix|heuristic-fallback|unresolved / title^="triz: "），
  `createdAt` 降序取最近 10 条，回填 40 原理明细（no/name/summary/routingHint）+ 逐行假说。
- **浏览器半边** `client/`：`dsh.client.platform: web` + `inject: @deepseek-ai/dsh-client-ui-sidebar-right`
  两步注册 —— `definition.ts`（Tab 类型定义 kind=triz-explainer + guide 条目）+
  `TrizTab.tsx`（按 tab 生命周期 signal 拉数据渲染）+ `route.ts`（client↔host 契约）。
  `scripts/build-client.mjs`（esbuild）→ `lib/client.js`（ModuleLoader wrapper，已入库；
  client-modules 按 `dsh.client` 声明自动加载）。
- **面板内容**：问题 + 来源徽标 + 候选发明原理（编号/名称/摘要/路由提示）+ 推导假说；
  UI 文案如实标注**待核验假说（source=triz, confidence=0.5）**，须验证后才成结论
  （Research Agent Policy：不把工具生成当事实）。
- **验证**：单测 **151/151 全绿**（+ `plugin-triz-ui.test.ts` 5）；runtime-smoke → **SMOKE PASS**
  新增 `trizUi=true`（`research-triz-ui` 在组合树 + `connection.fetch` 可用）；build-client 复现
  `lib/client.js`；dump-config 组合树含 `research-triz-ui` 行。

---

## 2026-10-14 · 阶段 8 · TRIZ 方法论接入（`ce94b68`）

需求：把 TRIZ（发明问题解决理论）加入 `dsh research`，作为**假说生成 / 机制设计方法**
（研究卡在「两难」时的机制方向来源）。定位：TRIZ = 程序性方法论 → **服务 + skill**（AGENTS.md §7），
不是领域知识（领域知识仍走 vocabulary.ts + WeKnora）；输出永远是**待核验假说**。

- **知识基 + 分析引擎**（`src/triz/`）：`data.ts` —— 40 发明原理（每条含路由安全提示
  routingHint）/ 39 技术参数 / 路由参数中英别名表（reliability・检测・收敛・抗劫持 ↔ 参数号）/
  **精选矛盾矩阵**（适配子集，诚实标注非 39×39 全表转录）/ 启发式兜底原理表 / 启动原理集；
  `index.ts` —— `resolveParameter`（中/英/别名/包含模糊）→ `principlesFor`（三态如实标注
  `curated-matrix | heuristic-fallback | unresolved`）→ `separationFor`（空间/时间/条件/系统级）/
  `evolutionFor`（进化法则视角）/ `idealityFraming`（IFR 理想解 / 有害作用 / 可用资源 / 增益）/
  `toHypotheses`（`type=Hypothesis, source=triz, confidence=0.5`）。
- **host 插件** `src/plugin-triz.ts`（package.json `exports` 加 `./triz`）：`ctx.provide('researchTriz')`；
  `cordis.patch.yml` host 平面 **5 → 6 行**：`research-core` / **`research-triz`** / `research-director` /
  `research-experiment` / `research-writer` / `research-operations`。
- **第 14 个工具 `research_triz`**（`src/plugin-tools.ts`）：入参 `problem / improving / worsening /
  record`（record 默认 true → 写 artifact + episodic, kind=triz），输出 `source / contradiction /
  candidates / separation / evolution / ideality / hypotheses / artifactId`；仅在 research（14 全量）
  与 engineering（白名单 +triz = **7**）会话可见。
- **skill** `skills/triz/SKILL.md`：矛盾 → 原理 → 假说 → 核验闭环 + 常见路由安全矛盾 ↔ 原理映射表
  （检测率↔收敛延迟 → 预操作/反馈/向缓冲；安全强度↔复杂度 → 中介/合并/局部质量…）；纪律 = 别把
  TRIZ 方向当新发现，先对照既有工作（FC-BGP/ASPA 已含「反向/自证」、RPKI 预验证是「预操作」）。
- **打包 / 冒烟同步**：`pack.sh` REQUIRED 加 `src/plugin-triz.js` + `skills/triz/SKILL.md`；
  `runtime-smoke.mjs` EXPECTED 14、ROLE_TOOLS.engineering +triz、servicesOk +researchTriz、triz 冒烟块。
- **文档**：README.md / dsh-research/README.md（新增「阶段 8」小节）/ profiles/README.md /
  AGENTS.md（§7 skills 加 triz + 追加阶段 8 快照）同步；工具口径 13→14、host 5→6 行、插件 6→7、
  engineering 6→7。

**验证（沙箱，`DSH_HOME=/tmp/dsh-home`）：**
- 单测 `node --test "src/**/*.test.ts"` = **146/146 全绿**（基线 137 + TRIZ 9：resolveParameter 中英
  别名 / curated-matrix 命中 / heuristic-fallback / unresolved / separation+evolution / toHypotheses /
  idealityFraming / createTrizService 端到端 / plugin-tools + triz）。
- runtime-smoke → **SMOKE PASS**：`services=true`、`tools(14/14)=true`、`standard=0`、
  `engineering:OK[7/7]`、`triz=true`（命中 curated-matrix：#11 Beforehand cushioning / #10 Preliminary
  action / #23 Feedback，生成 3 条 Hypothesis，confidence=0.5）。
- pack.sh → **PACK OK**：`src/plugin-triz.js` + `src/triz/{data,index}.js` + `skills/triz/SKILL.md`
  进 tarball，包内 0 个 `src/*.ts`。

**口径变更（自本阶段起）**：`research_*` 工具 = 14 全量（research）/ engineering 7；host 平面 6 行 /
13 服务；bundle 插件 7 个（host 6 + preset tools 1）。阶段 4.5/5/6 快照里的 13 / 5 行 / 6 插件属当时
口径，以本段为准。

---

## 2026-10-10 · FC-BGP 概念修正 + 领域知识分层 + WeKnora 对接（6e2307f）

- **FC-BGP 概念修正**：确认 FC-BGP = **Forwarding Commitment BGP**（基于「转发承诺（Forwarding
  Commitment）」的 BGP 安全研究，IETF SIDR/IDR 工作项、草案阶段非 RFC；datatracker 多份
  slides / Progress Update 佐证），废弃旧「Function-Composed BGP（无人机组网）」定义。
  同步修正 `src/domain/vocabulary.ts` GLOSSARY 词条（aliases + def 双改）。
- **领域知识 ≠ Skill 分层**：bgp / rpki / bgpsec / fcbgp 4 张「参考速查」从
  `dsh-research/skills/` 迁出 → `docs/domain-knowledge-notes.md`（暂存归档：标注非权威、
  指向 RFC / 草案原始来源；FC-BGP 段落含修正后定义与出处清单）；skill 目录只保留程序性
  skill（experiment / paper-review）。
  同步：`pack.sh` REQUIRED（bgp/rpki → paper-review / experiment）、
  `presets/research.patch.yml` / `presets/roles.patch.yml` 注释、AGENTS.md §7（Skill 组织与
  领域知识分层）、README「领域知识分层」、dsh-research/README 措辞。
- **WeKnora 知识库对接（方案 → 落地 deploy 生命周期）**：调研官方插件
  `@wxg-prc-cpg/dsh-weknora`（npm v0.1.0，零运行时依赖、仅用 `ctx.tools.register` /
  `inject=['tools']`，与仓库 6 个 research 插件同类 seam），`dsh research` 可连
  http://10.2.165.201/api/v1（4 个只读工具：list / search / read / ask）。
  落地三件套（日后升级重跑 deploy 不再丢插件 / 不再手写 `$DSH_HOME` 侧配置）：
  - **A. `profiles/research/package.json`**：bundles + dependencies 声明
    `@wxg-prc-cpg/dsh-weknora`（与 `dsh plugin add` 写出的形状一致，幂等收敛）；
  - **B. `profiles/research/cordis.patch.yml`**：末尾追加 `- id: weknora` 配置行
    （baseUrl 钉死 10.2.165.201/api/v1、resourceUrls: public、knowledgeBaseIds: []、
    apiKey / tenantId 走 env，key 不进仓库）；
  - **C. `deploy-profile.sh`**：模板声明了但 node_modules 未装 → 自动
    `dsh plugin --profile <name> add @wxg-prc-cpg/dsh-weknora`
    （`DEPLOY_AUTO_PLUGINS=0` 关、只打印手动命令；已装则跳过；安装失败不阻断 deploy）。
  - **沙箱实证**（`/tmp/dsh-home*`）：① 插件已装 → profile overlay 整行覆盖插件自带
    env 默认行（dump-config 只留模板 config）；② 插件未装 → bundle 与配置行均被
    **非致命**丢弃（`skipping profile bundle ... cannot resolve` /
    `patch: entry "weknora" not found`，exit 0，不阻塞启动）→ 修正旧「不改模板以免
    boot 失败」的保守做法，配置行可长期留在模板；③ e2e：deploy 到全新 `$DSH_HOME`
    自动 pnpm 装 weknora、package.json 收敛为模板形状、`@basil/dsh-research` symlink 存活。
  - README「WeKnora 行动清单」改写：一键 deploy 全搞定 + 升级不丢 + 配置来源说明；
    排查 / 兼容性表照旧。真机建库 + 配 key + 验证 4 工具仍待用户（TODO「在研」）。
- 验证：`node --test "src/**/*.test.ts"` = **137/137 全绿**（词汇表改动不破坏既有断言）。

## 2026-10-09 · 命名定型 `dsh-routing-research` + 内置领域词汇（6e2307f）

- 命名定型：`dsh-research/src/domain/vocabulary.ts` 作唯一口径来源——`PRODUCT_NAME='dsh-routing-research'`、
  `COMMAND='dsh research'`、`PROFILE_FLAG='dsh --profile research'`、`PROFILE_NAME='research'`；
  README / 脚本仍用 `dsh research`（操作命令不变）。
- 内置领域词汇：`DOMAIN_SCOPE`（BGP / RPKI / BGPsec / ASPA / VRO / CRC / FC-BGP）+ `DOMAIN_EXECUTORS`
  （FRR / VPP）+ `DOMAIN_KEYWORDS`（15+ 检索种子词，research_search 无 query 兜底）+ `GLOSSARY`
  （9 词条，VRO/CRC 按范围代码）+ `describeDomain/scopeList/executorList/lookupTerm`。
- 运行时挂接：`plugin-core.ts` 提供服务 `researchCore.domain`（领域词汇单一口径）；
  `research_search` 缺省/空 query 用领域词汇兜底检索，返回 `seeded` 标记并写入输出 schema；
  `presets/research.patch.yml` persona / preset 描述改用定型名。
- 文档同步：README.md / dsh-research/README.md / profiles/README.md / AGENTS.md / src/README.md /
  docs/research-agent-migration-plan.md；`dsh-research/package.json` 与 `profiles/research/package.json`
  description 带上定型名。
- 验证：`node --test "src/**/*.test.ts"` = **93/93 全绿**（新增 src/domain 6 用例）；
  runtime-smoke **SMOKE PASS**（`domain=true` / `search=true`）；verify-patch-chain **CHAIN VERIFY PASS**。

## 2026-10-09 · 阶段 4b · jobs / scheduler / self-improve（`574e051`）

- 16a. 五角色注册表 + 任务分派表：`src/roles/`，覆盖六种 task kind。
- 16b. 角色级模型路由：`src/model-router/`，默认 `local-interval-dsv4/dsv4flash`，可角色级覆盖。
- 17. autonomous research loop：`src/autonomous/` buildGoal(5 任务 DAG) + runAutonomousResearch
  一键流水线（Director → 实验战役 → 验证折入 → Writer → 归档），插件 `research_autonomous`
  工具；ROV 对 prefix-hijack verified / path-manipulation rejected 两项语义自测。
- 18. long-running jobs：`src/jobs/` JobRunner
  （submit({kind:'research'|'campaign', title, run})→Job，同步/异步执行体，get / list / cancel
  仅未开始可取消，完成/失败归档 episodic + artifact；research_job 工具 + 7 自测用例）。
- 19. scheduled research：`src/scheduler/` nextOccurrence 纯函数（at ISO / daily HH:MM /
  everyMs）+ ResearchScheduler（可注入时钟；一次性 at 到期 enabled=false）；research_schedule
  工具 + 9 自测用例。
- 20. self-improvement：`src/self-improve/` SelfImprover，reflect()→ReflectionReport
  （at / summary / snapshot / observations[] / recommendations[]）；research_reflect 工具 + 3 自测用例。
- 阶段 4b 恢复绿：`node --test "src/**/*.test.ts"` = **69/69 全绿**；runtime-smoke **SMOKE PASS**
  （services 11 + tools 13/13：research_job / research_schedule / research_reflect 一致）。

## 2026-10-09 · 阶段 4.5 · Profile 前端：headless → 基于 web（`574e051` 等）

- `profiles/research/package.json`：`dsh.profile.bundles` 改为
  `["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@basil/dsh-research"]`
  （丢弃 headless 一次性 CLI，research 跑在 web 之上）。
- `profiles/research/cordis.patch.yml`：合并 web 同款 overlay——`ui-settings-general` +
  `llm-pi-ai`（provider `local-interval-dsv4`，credential-ref `LOCAL_INTERVAL_DSV4_API_KEY`）+
  `agent-default-model`（dsv4flash）。
- `dsh-research/scripts/deploy-profile.sh`：部署清单与 verify 行更新（base + web + dsh-research）。
- `dsh-research/scripts/runtime-smoke.mjs`：适配 web 基座（web startup 拒绝位置参数，只给
  `--no-open` 等 flag；SMOKE_PASS：boot 出 `dsh web: http://127.0.0.1:3080/`）。
- 组合树核实：`dsh --profile research --dump-config` 含 web-startup / webserver / web-runtime
  + dsh-research-core（无 headless-startup / headless-runner）。
- `dsh research` 在 web 之上可启动：沙箱实测 boot 出 Web UI URL，13/13 research 工具 +
  11 服务全挂载。

## 2026-10-08 · 模型路由落地（`455ff5e`）

- research profile 模型层接本地 interval DSV4 网关：`llm-pi-ai` provider
  `local-interval-dsv4`（openai-completions，baseURL `http://10.2.165.201:8232/v1`，key 走
  credential-ref `LOCAL_INTERVAL_DSV4_API_KEY`）+ `agent-default-model` 默认 `dsv4flash`；
  真机端到端：`dsh --profile research --json "RPKI 的作用?"` → dsv4flash 正确作答并输出
  final（`reason.kind: completed`）。
- `94bba87`：research profile 获得 headless one-shot 前端（阶段 3.5，后被阶段 4.5 web 化取代）。

## 2026-10-08 · 阶段 3 · Executors 与产出（`634dbc6`）

- 11. FRR/VPP executor：`src/experiment/topology.ts` RouteEngineSim（mulberry32 同 seed 可复现）
  + Frr/VppTopology 真实守护进程适配器/回退；`executors.ts` TopologyExecutor 实现 Executor 契约
  （缺失时 fallbackToSim 回退确定性模拟并如实标记 engine）。
- 12. automatic experiment：`runner.ts` runAutomaticExperiment / runCampaign 实现
  deploy → run(×repetitions) → collect → analyze → verify → archive，写回 episodic+artifact，
  插件 `research_campaign` 工具 + `researchExperiment` 服务。
- 13. statistical analysis：`experiment/stats.ts` 四口径均值 / 样本标准差 / 95%CI +
  summarizeDetection（effectiveScore = det.mean − fp.mean）；`metricsFor` 收敛四口径。
- 14. paper generation：`src/writer/paper.ts` 六章节 + 摘要 + 附录 A 证据追溯 + `research_paper` 工具。
- 15. PPT generation：`src/writer/slides.ts` 8 页 Marp 科研汇报 + `research_slides` 工具。

## 2026-10-08 · 阶段 2 · Agent 与 Memory（`40f807e` / `f9532e3`）

- 7. Research Memory：Semantic / Episodic / Artifact / Hypothesis / Evidence 五类（`src/memory/`，
  createMemory 门面 + persistMemory / loadMemoryInto 可选 JSON 落盘）。
- 8. Literature Agent：`src/agents/literature.ts` + 种子语料 `corpus.ts`（9 篇 RPKI/BGPsec 经典
  文献，LiteratureSource 可注入真实检索）。
- 9. Reviewer Agent：`src/agents/reviewer.ts` research-paper-review 8 步清单 → 评分 → 判定 + 建议。
- 10. Experiment Agent：`src/agents/experiment.ts` plan → executor → analyze（多重复统计）。
- Director + 三条循环：`src/research-director|research-loop|verification-loop|experiment-loop/`，
  Goal → 任务 DAG → 按角色分派 → 记忆写入 → 产出归档。
- 插件扩展：researchCore / researchMemory / researchAgents / researchDirector 服务 +
  research_verify / research_record / research_search / research_review / research_experiment 工具。

## 2026-10-08 · 阶段 1 · 核心六件 + 运行时挂载（`e09c8c1` / `5225704` / `12d9ed4`）

- 1. ResearchGoal（Objectives = hypothesis / tasks / evidence / experiments / results /
  verification / counterexamples / status）；2. ResearchTask DAG（`src/core/dag.ts`，按依赖已满足
  + 信息增益最高选节点）；3. ResearchClaim（Type ∈ {Fact, Hypothesis, Assumption, Result,
  Interpretation}）；4. ResearchEvidence；5. Verification Loop（Evidence Check / Counter Search /
  Experiment Test → verdict，`src/core/verification.ts`）；6. Artifact Store（`src/core/artifact-store.ts`）。
- 端到端冒烟：BGP 用例跑通 claim → 实验 → verdict → artifact（`src/core/core.test.ts`）。
- 运行时插件挂载：`src/plugin.ts`（researchCore + research_verify / research_record）in-dsh
  **SMOKE PASS**；bundle patch（`patches/research-agent.yml`）以行 `dsh-research-core` 插入组合树。

## 2026-10-08 · 阶段 0 · 架构迁移分析（`ee00fa9` / `f670fec` / `8fddf37`）

- 阶段 0 基线：vendored `deepseek-harness` 跑 `dsh --profile web --dump-config` 与
  `--dump-config-schema`（`docs/baseline/` 2026-10-08 瘦身删除，结论保留在
  `docs/research-agent-architecture.md`）。
- 产出 `docs/research-agent-architecture.md`（TL;DR 三黄金规则 + 结构保证 + 已验证挂载路径附录，
  含 capability map / reuse map / extension points / 禁改组件 / data model / 三条循环）。
- 现状盘点：旧 Python agent 栈（planning/evolve/memory/tools/debate/harness）2026-10-08 移除；
  Executor / Knowledge Plane 全部走 dsh bundle / skills 层。
- 仓库瘦身：`8fddf37` 重写 README，drop 旧 Python 栈，只保留 dsh research 上层叠加。

## 里程碑（已达成）

- Phase 1 完成 = ResearchGoal / DAG / Claim / Evidence / Verification Loop / Artifact Store
  + BGP 冒烟 + 运行时挂载（SMOKE PASS）
- Phase 2 完成 = 五类 Memory + Literature/Reviewer/Experiment 三角色 + Director/三循环
- Phase 3 完成 = Executors + 自动实验 + 统计 + paper/PPT 产出
- Phase 4a 完成 = writer / policy / roles / model-router / autonomous 一键流水线 + 端到端报告
- Phase 4b 完成 = jobs / scheduler / self-improve 三模块 + 插件三工具 + 69/69 单测绿 + SMOKE PASS
- Profile 前端 web 化 = headless 一次性 CLI → `@deepseek-ai/dsh-web-app` Web UI 基座，
  `dsh research` 跑在 web 之上

## 在研产出（已产出内容；跟进项见 TODO.md「在研」节）

- 2026-10-08 产出 `research/RPKI-BGPsec-security-gaps.md`（G1–G11 缺口清单 + 4×4 实验矩阵 +
  V1–V10 核验闭环）/ `research/sim-grid.ts`（4 攻击类 × 4 策略 × n=8 规范网格）/
  `research/sim-grid-results.json`（32 格数据）。
- 注：`research/` 于 2026-10-09 加入 `.gitignore`（与 `logs/` 一起），不再入库；
  后续归档走 Memory artifact store。
