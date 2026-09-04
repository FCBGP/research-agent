"""多智能体辩论(Multi-Agent Debate)。

对一个 idea 反复讨论直到形成定论:proposer(主张) → critic(质疑) →
synthesizer(综合/定论),循环 N 轮。每个角色可配不同底层模型
(默认相同,经 AGENT_MODELS 配置)。

架构沿用"有界工作上下文":每轮只给该角色看当前讨论摘要,
不把全部历史塞进 context。
"""

from __future__ import annotations

import json

from . import config
from . import context
from . import memory

ROLE_PROMPTS = {
    "proposer": "你是主张方。对给定 idea 提出有力主张:阐述价值、可行性、最佳方案。",
    "critic": "你是质疑方。对主张方观点挑错/质疑:指出漏洞、风险、反面证据,并给改进建议。",
    "synthesizer": "你是综合方。综合主张与质疑,权衡利弊,给出一个定论(共识)与最终建议。",
}

OPENAI_BASE = {"base_url": config.BASE_URL, "api_key": config.API_KEY}


def _chat(model: str, messages: list[dict]) -> str:
    """调用指定模型的 OpenAI 兼容接口,返回文本。"""
    from openai import OpenAI

    client = OpenAI(**OPENAI_BASE)
    resp = client.chat.completions.create(model=model, messages=messages, temperature=0.3)
    return resp.choices[0].message.content or ""


def debate(idea: str, rounds: int | None = None, session: str = "debate") -> str:
    """对一个 idea 多轮辩论,返回综合定论。

    rounds: 讨论轮数(config.DEBATE_ROUNDS 默认)。每轮 = proposer→critic→synthesizer。
    """
    rounds = rounds or config.DEBATE_ROUNDS
    transcript: list[dict] = []
    prior = memory.resume(session)
    if prior:
        transcript.append({"role": "user", "content": f"(延续上次讨论摘要: {prior[:400]})"})

    for rnd in range(1, rounds + 1):
        # proposer
        msgs = [{"role": "system", "content": ROLE_PROMPTS["proposer"]}]
        msgs.append({"role": "user", "content": f"idea: {idea}\n讨论摘要: {_summary(transcript)}"})
        proposal = _chat(config.AGENT_MODELS["proposer"], msgs)
        transcript.append({"role": "user", "content": f"[主张方·第{rnd}轮] {proposal}"})
        print(f"\n[主张方·{rnd}] {proposal}", end="", flush=True)

        # critic
        msgs = [{"role": "system", "content": ROLE_PROMPTS["critic"]}]
        msgs.append({"role": "user", "content": f"idea: {idea}\n主张: {proposal}\n讨论摘要: {_summary(transcript)}"})
        critique = _chat(config.AGENT_MODELS["critic"], msgs)
        transcript.append({"role": "user", "content": f"[质疑方·第{rnd}轮] {critique}"})
        print(f"\n[质疑方·{rnd}] {critique}", end="", flush=True)

        # synthesizer
        msgs = [{"role": "system", "content": ROLE_PROMPTS["synthesizer"]}]
        msgs.append({"role": "user", "content": f"idea: {idea}\n主张: {proposal}\n质疑: {critique}\n讨论摘要: {_summary(transcript)}"})
        verdict = _chat(config.AGENT_MODELS["synthesizer"], msgs)
        transcript.append({"role": "user", "content": f"[综合方·第{rnd}轮] {verdict}"})
        print(f"\n[综合方·{rnd}] {verdict}", end="", flush=True)

    # 最终定论:综合方结合全部讨论
    msgs = [{"role": "system", "content": ROLE_PROMPTS["synthesizer"]}]
    msgs.append({"role": "user", "content": f"idea: {idea}\n全部讨论: {_summary(transcript)}\n请给出最终定论(共识与建议)。"})
    final = _chat(config.AGENT_MODELS["synthesizer"], msgs)
    print(f"\n[定论] {final}", flush=True)

    memory.checkpoint(session, final)
    return final


def _summary(transcript: list[dict], budget: int = 800) -> str:
    """把讨论记录压缩成摘要(有界,不塞全文)。"""
    joined = "\n".join(m.get("content", "") for m in transcript)
    if len(joined) <= budget:
        return joined
    return joined[-budget:] + "\n[更早讨论已压缩]"