"""本地科研智能体 (research-agent)。

由本地 LLM(OpenAI 兼容接口)驱动的通用多工具研究智能体:
联网搜索 + 网页/PDF 阅读 + 代码库浏览 + 报告生成。
"""

from __future__ import annotations

from .cli import main as cli_main  # noqa: E402
from .loop import run_agent  # noqa: E402
from .tools import (  # noqa: E402
    grep,
    list_dir,
    read_file,
    read_pdf,
    run_tool,
    web_fetch,
    web_search,
    write_report,
)

__all__ = ["main", "run_agent", "web_search", "web_fetch", "read_file", "read_pdf",
           "list_dir", "grep", "write_report", "run_tool"]


# pyproject 脚本指向 research_agent:main —— 直接调用 CLI
def main() -> None:
    cli_main()