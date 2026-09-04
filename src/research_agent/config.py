"""本地 LLM 连接配置(经 config.yaml,env 覆盖,per-call 可换模型)。

支持多供应商模型切换:openai/claude/gemini/deepseek/glm/kimi/中转站(relay)/本地(local)。
优先级:环境变量 > config.yaml;调用时 model 参数最高。

config.yaml 结构: api 块(provider/base_url/api_key/model/temperature) +
providers 预设(每供应商 base_url/api_key/model,${VAR} 由同名环境变量填充) +
agent_models(辩论/进化各角色可配不同模型)。

环境变量覆盖(保留): LLM_BASE_URL / LLM_API_KEY / LLM_MODEL / LLM_TEMPERATURE,
以及 AGENT_PROPOSER_MODEL / AGENT_CRITIC_MODEL / AGENT_SYNTHESIZER_MODEL /
AGENT_LEARNER_MODEL / AGENT_DESIGNER_MODEL / AGENT_ANALYZER_MODEL。
"""

from __future__ import annotations

import os
from pathlib import Path

# 包内默认 config.yaml 路径(仓库根或包目录)
CONFIG_PATH = Path("config.yaml")
_PKG_CONFIG = Path(__file__).parent.parent.parent / "config.yaml"
if not CONFIG_PATH.exists() and _PKG_CONFIG.exists():
    CONFIG_PATH = _PKG_CONFIG


def _load_yaml() -> dict:
    """容错读取 config.yaml,失败返回 {}。"""
    try:
        import yaml
        if CONFIG_PATH.exists():
            return yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8")) or {}
    except Exception:
        pass
    return {}


def _resolve_env(s: str) -> str:
    """替换字符串里的 ${VAR} 为同名环境变量值。"""
    if not s or "${" not in s:
        return s
    import re
    return re.sub(r"\$\{(\w+)\}", lambda m: os.getenv(m.group(1), ""), s)


def _resolve() -> None:
    """解析 config.yaml:providers[api.provider] 预设 → api 合并 → env 覆盖。"""
    global BASE_URL, API_KEY, MODEL, TEMPERATURE, AGENT_MODELS, DEBATE_ROUNDS, MAX_TOOL_TURNS, MAX_CONTEXT_CHARS, OUTPUT_ROOT, PROVIDER
    cfg = _load_yaml()
    api = cfg.get("api", {}) or {}
    provider = api.get("provider", "local")
    preset = cfg.get("providers", {}).get(provider, {}) or {}

    # 预设 → api 覆盖 → env 覆盖
    base = _resolve_env(preset.get("base_url", ""))
    key = _resolve_env(preset.get("api_key", ""))
    model = _resolve_env(preset.get("model", ""))
    base = os.getenv("LLM_BASE_URL", api.get("base_url", base) or base) or base
    key = os.getenv("LLM_API_KEY", api.get("api_key", key) or key) or key
    model = os.getenv("LLM_MODEL", api.get("model", model) or model) or model

    BASE_URL = base or "http://127.0.0.1:8080/v1"
    API_KEY = key or "0731"
    MODEL = model or "DeepSeek-V4-Flash-0731-2.4bit-mixed"
    TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", api.get("temperature", 0.3) or 0.3))
    PROVIDER = provider

    # 各角色模型:agent_models 默认沿用 MODEL,env 覆盖
    am = cfg.get("agent_models", {}) or {}
    AGENT_MODELS = {
        "proposer": os.getenv("AGENT_PROPOSER_MODEL", am.get("proposer", MODEL) or MODEL),
        "critic": os.getenv("AGENT_CRITIC_MODEL", am.get("critic", MODEL) or MODEL),
        "synthesizer": os.getenv("AGENT_SYNTHESIZER_MODEL", am.get("synthesizer", MODEL) or MODEL),
        "learner": os.getenv("AGENT_LEARNER_MODEL", am.get("learner", MODEL) or MODEL),
        "designer": os.getenv("AGENT_DESIGNER_MODEL", am.get("designer", MODEL) or MODEL),
        "analyzer": os.getenv("AGENT_ANALYZER_MODEL", am.get("analyzer", MODEL) or MODEL),
    }

    DEBATE_ROUNDS = int(os.getenv("DEBATE_ROUNDS", str(cfg.get("debate", {}).get("rounds", 3) or 3)))
    MAX_TOOL_TURNS = int(os.getenv("MAX_TOOL_TURNS", str(cfg.get("max_tool_turns", 12) or 12)))
    MAX_CONTEXT_CHARS = int(os.getenv("MAX_CONTEXT_CHARS", str(cfg.get("max_context_chars", 12000) or 12000)))
    OUTPUT_ROOT = os.getenv("OUTPUT_ROOT", cfg.get("output_root", "output") or "output")


_resolve()


# 输出组织:所有 agent 产物进 output/ 分门别类;output/ 整体 gitignore
OUTPUT_SUBDIRS = {
    "docs": "docs",    # Word/Markdown 长文档、报告
    "slides": "slides",  # 演示文稿(未来)
    "codes": "codes",   # 实验/分析代码、脚本
    "figures": "figures",  # 图表/图片
    "notes": "notes",   # 研究笔记
    "memory": "memory",  # 外部记忆 DB
}


def client_kwargs() -> dict:
    """返回用于 OpenAI 客户端的连接参数(仅构造器安全字段)。"""
    return {
        "base_url": BASE_URL,
        "api_key": API_KEY,
        "default_headers": {"Authorization": f"Bearer {API_KEY}"},
    }


def model_for(role: str) -> str:
    """返回指定角色的模型(辩论/进化各角色可配不同模型)。"""
    return AGENT_MODELS.get(role, MODEL)


def output_path(category: str, filename: str) -> str:
    """把产物放进 output/<category>/ 子目录(自动建目录)。"""
    cat = OUTPUT_SUBDIRS.get(category, category)
    p = Path(OUTPUT_ROOT) / cat
    p.mkdir(parents=True, exist_ok=True)
    return str(p / filename)