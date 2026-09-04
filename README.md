# 本地科研智能体 (research-agent)

由本地 LLM(OpenAI 兼容接口)驱动的**通用多工具研究智能体**:
联网搜索、网页/PDF 阅读、本地文件/代码库浏览、研究报告生成。

## 依赖环境

- **uv** 管理 Python 项目(`uv init` / `uv add`)
- 本地模型服务:omlx 提供的 OpenAI 兼容接口
  - Base URL: `http://127.0.0.1:8080/v1`
  - API Key: `0731`
  - 模型: `DeepSeek-V4-Flash-0731-2.4bit-mixed`

## 使用

```bash
# 一次性研究任务
uv run research-agent "什么是多智能体系统?联网调研并写报告"

# 交互式对话(跨轮延续,外部记忆)
uv run research-agent --interactive

# 限制工具调用轮数
uv run research-agent "调研 RAG" --turns 8

# 指定会话名(跨会话延续)
uv run research-agent "继续上次研究" --session myproject

# 多智能体辩论(对一个 idea 反复讨论到定论)
uv run research-agent --debate "本地科研智能体是否该用SQLite?" --rounds 3

# 长文档生成(分段章节,图文并茂 SVG)
uv run research-agent --longdoc "多智能体系统" --chars 100000 --file long_report.md

# 直接作为 Python 模块使用
uv run python -c "from research_agent import run_agent; print(run_agent('...'))"
```

## 工具

| 工具 | 作用 |
|---|---|
| `web_search` | 联网搜索,返回标题/链接/摘要 |
| `web_fetch` | 抓取网页内容转纯文本 |
| `read_file` | 读取本地文本文件(自动识别编码) |
| `read_pdf` | 提取 PDF 文本 |
| `list_dir` | 浏览目录结构 |
| `grep` | 搜索文件内容(正则) |
| `write_report` | 把研究成果保存为 Markdown 报告 |
| `arxiv_search` | arXiv 学术搜索(论文) |
| `scholar_search` | Semantic Scholar 学术搜索 |
| `save_note` / `read_notes` | 外部记忆笔记 |
| `recall_facts` | 检索已保存事实 |
| `svg_draw` | 生成 SVG 插图(长文档图文并茂) |

## 外部记忆(SQLite)

- `memory/research.db` 持久化论文/笔记/事实/摘要。
- 工作上下文始终有界(~15K),长期知识存外部记忆,检索 top-K 回填。

## 配置(环境变量)

| 变量 | 默认 |
|---|---|
| `LLM_BASE_URL` | `http://127.0.0.1:8080/v1` |
| `LLM_API_KEY` | `0731` |
| `LLM_MODEL` | `DeepSeek-V4-Flash-0731-2.4bit-mixed` |
| `MAX_TOOL_TURNS` | `12` |
| `MAX_CONTEXT_CHARS` | `12000` |
| `LLM_TEMPERATURE` | `0.3` |

## 结构

```
src/research_agent/
  config.py      # LLM 连接 + AGENT_MODELS 等配置
  tools.py       # 工具实现 + 工具注册表 + schema
  loop.py        # agentic 工具调用循环(有界上下文)
  context.py     # 上下文管理器(分层有界工作台)
  memory.py      # 外部记忆(SQLite 论文/笔记/事实/摘要)
  debate.py      # 多智能体辩论(主张/质疑/综合到定论)
  longdoc.py     # 长文档生成(分段章节 + SVG 插图)
  cli.py         # CLI 入口
```

## agentic 循环原理

1. 系统提示 + 用户问题 → 本地 LLM。
2. 模型输出含 `{"tool":"工具名","args":{...}}` 时,循环执行该工具、把结果回传。
3. 反复直到模型给出最终结论,再自动调用 `write_report` 保存报告。
4. 上下文超限时自动裁剪历史,保留 system 提示与最近几轮。