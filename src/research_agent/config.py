"""本地 LLM 连接配置。

通过 OpenAI 兼容接口访问本地运行的模型(omlx)。
"""

from __future__ import annotations

import os


# 本地模型服务配置(可用环境变量覆盖)
BASE_URL = os.getenv("LLM_BASE_URL", "http://127.0.0.1:8080/v1")
API_KEY = os.getenv("LLM_API_KEY", "0731")
MODEL = os.getenv("LLM_MODEL", "DeepSeek-V4-Flash-0731-2.4bit-mixed")

# 多智能体辩论:各角色可配不同底层模型(默认全部相同,可用环境变量覆盖)
AGENT_MODELS = {
    "proposer": os.getenv("AGENT_PROPOSER_MODEL", MODEL),
    "critic": os.getenv("AGENT_CRITIC_MODEL", MODEL),
    "synthesizer": os.getenv("AGENT_SYNTHESIZER_MODEL", MODEL),
}
DEBATE_ROUNDS = int(os.getenv("DEBATE_ROUNDS", "3"))

# 对话控制参数
MAX_TOOL_TURNS = int(os.getenv("MAX_TOOL_TURNS", "12"))
MAX_CONTEXT_CHARS = int(os.getenv("MAX_CONTEXT_CHARS", "12000"))
TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.3"))

# 输出组织:所有 agent 产物进 output/ 分门别类;output/ 整体 gitignore
OUTPUT_ROOT = os.getenv("OUTPUT_ROOT", "output")
OUTPUT_SUBDIRS = {
    "docs": "docs",    # Word/Markdown 长文档、报告
    "slides": "slides",  # 演示文稿(未来)
    "codes": "codes",   # 实验/分析代码、脚本
    "figures": "figures",  # 图表/图片
    "notes": "notes",   # 研究笔记
    "memory": "memory",  # 外部记忆 DB
}


def client_kwargs() -> dict:
    """返回用于 OpenAI 客户端的连接参数。"""
    return {
        "base_url": BASE_URL,
        "api_key": API_KEY,
        "default_headers": {"Authorization": f"Bearer {API_KEY}"},
    }


def output_path(category: str, filename: str) -> str:
    """把产物放进 output/<category>/ 子目录(自动建目录)。"""
    from pathlib import Path
    cat = OUTPUT_SUBDIRS.get(category, category)
    p = Path(OUTPUT_ROOT) / cat
    p.mkdir(parents=True, exist_ok=True)
    return str(p / filename)