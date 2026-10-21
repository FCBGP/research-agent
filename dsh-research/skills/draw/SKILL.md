---
name: draw
description: 科研绘图 workflow：用 research_draw / research_draw_status 生成/编辑论文/报告配图（Qwen-Image-2.1 本机 mflux 或 OpenAI 兼容 API），输出固定 images/image-YYYYMMDDHHmmSS.png；定义何时图何时表、图型规范与配色/字号纪律，并把生成记录/输出路径回填进 research_paper 报告。
---

# 科研绘图工作流（Prompt → Draw → Status → Embed）

## 定位
绘图是**paper 报告产出环节**的配套能力，不是领域知识也不是研究结论。
本 skill 定义在 paper/report 流程里怎么生成可信、可追溯、可排版入稿的配图，
以及为什么图片必须绑定**输出路径 + 生成参数**（随会话持久化，能回跳重生成）。

## 何时用
- 论文/报告需要示意/概念图（架构、报文时序、矛盾映射、机制对比、数据流）。
- 已有实验结果想“以图释文”，但绝对不拿生成图**冒充**实验数据曲线
  （实验统计图必须来自 research_campaign 的四口径结果，不是本 skill；本 skill 只产出
  插图/示意图/封面类）。
- 需要垫图改稿：以既有图作参考（风格参考 0.4 / 内容参考 0.7），生成变体。
- 何时图、何时表：能一句话说清的趋势/类型/架构 → 图；需要精确数值/多列对比/逐项追溯 → 表。
  一张图只讲一件事；讲不清就拆图或改表，绝不一张大杂烩。

## 标准流程
1. **写提示词**（科研绘图 paradigm，建议中英皆可）：
   `科研绘图：<主题>，<图型：架构图/时序图/对比图/机制示意>，<元素清单>，<配色：冷色/统一色系>，<用途：论文 Figure X / 报告配图>`
   - 图型规范：架构图 → 分层/方框+箭头；时序图 → 时间轴+报文标注；对比图 → 明确横纵轴与类别色；
     机制示意 → 因果链+关键标签。
   - 配色：优先统一色系（如冷色系蓝绿灰），同语义同色，避免彩虹渐变；深色底慎用于打印。
   - 分辨率/字号：按用途选 2K（报告配图常用）→ 4K（论文大图）；文字/标签要可读（宁大勿小）。
2. **调参数**（research_draw）：
   - `provider`：local（本机 Qwen-Image-2.1，mflux，非驻留、并发 1；**唯一支持垫图 edit**）
     或 api（OpenAI 兼容 images API，需 baseURL/apiKey/modelId，key 支持 ${VAR} 引用）。
   - `aspect`（默认 16:9）/ `resolution`（长边 1K/2K/4K，默认 2K）/ `quality`（低20/中30/高50步，默认高）。
   - `seed` 固定可复现；垫图 mode=edit 时给 editPreset=style|content + 强度。
3. **轮询**：research_draw 提交后 bounded 等待；长任务返回 jobId → 用 research_draw_status
   轮询 phase（queued→running→succeeded/failed），拿 `outputPath`（固定
   `images/image-YYYYMMDDHHmmSS.png`）与 `artifactId`。
4. **回填报告**：把 `outputPath` 与生成参数（prompt 摘要/尺寸/seed/模型）作为 traceable 图注
   写进 research_paper 报告；无法内嵌外部图片的场景至少附路径 + 参数，保证可复现。
5. **归档**：每次生成随会话持久化（artifact draw: note，可按 sessionId 过滤）；结论性图表仍须
   绑定实验 artifact（policy：没有实验数据不得声称“实验验证”）。

## 纪律（对齐 Research Agent Policy）
- 生成图 = 插图/示意，不是证据：涉及数字/曲线的图必须来自实验/测量的原始数据。
- 配图需可追溯：报告里每个配图注明 prompt/参数/输出路径，复盘可重生成。
- 垫图仅 local（v1）；api 模式不支持垫图——需要改稿时切 local 或改提示词重画。
- host research-draw `config.enabled=false` 时面板与工具均不可用：别硬调，先检查 profile 配置。
