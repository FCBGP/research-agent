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


def client_kwargs() -> dict:
    """返回用于 OpenAI 客户端的连接参数。"""
    return {
        "base_url": BASE_URL,
        "api_key": API_KEY,
        "default_headers": {"Authorization": f"Bearer {API_KEY}"},
    }