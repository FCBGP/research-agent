"""本地科研智能体 (research-agent)。

由本地 LLM(OpenAI 兼容接口)驱动的通用多工具研究智能体:
联网搜索 + 网页/PDF 阅读 + 代码库浏览 + 学术搜索 + 外部记忆 +
多智能体辩论 + 长文档生成(SVG 插图)。
工作上下文有界(~15K),长期知识存外部记忆(SQLite)。
"""

from __future__ import annotations

from .cli import main as cli_main  # noqa: E402
from .debate import debate  # noqa: E402
from .longdoc import generate_longdoc  # noqa: E402
from .loop import run_agent  # noqa: E402
from .tools import (  # noqa: E402
    arxiv_search,
    grep,
    list_dir,
    read_file,
    read_pdf,
    run_tool,
    scholar_search,
    svg_draw,
    web_fetch,
    web_search,
    write_report,
)

__all__ = ["main", "run_agent", "debate", "generate_longdoc",
           "web_search", "web_fetch", "arxiv_search", "scholar_search",
           "read_file", "read_pdf", "list_dir", "grep", "write_report",
           "svg_draw", "run_tool"]


# pyproject 脚本指向 research_agent:main —— 直接调用 CLI
def main() -> None:
    cli_main()