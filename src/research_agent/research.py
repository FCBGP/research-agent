"""科研流程层(Research Protocol)。

把研究任务变成分阶段的科学工作流,这才是"科研"与"聊天"的分界线:

  Stage 1  研究问题与假设   把任务拆成可回答的问题,形成可检验假设(H0/H1)
  Stage 2  文献综述         系统检索(arxiv/scholar/web)→精读→抽取主张/证据→识别空白
  Stage 3  研究方法         选方法(案例/比较/实验/综述),说明依据
  Stage 4  证据收集与分析    收集数据/证据→用工具分析→评估证据质量(来源/置信度)
  Stage 5  结论与报告        综合→写报告(含引用/证据链/置信度)
  Stage 6  自评/评审         辩论或批判视角,加固结论

证据链:每个主张绑定来源(URL/论文)与置信度,存外部记忆(SQLite)。
知识库:论文/事实/笔记跨会话累积,研究是累积的。
"""

from __future__ import annotations

import json

from . import config
from . import context, memory, tools
from .loop import _chat, _tool_calls_from, SYSTEM_PROMPT
from .debate import debate

RESEARCH_PROMPT = """你是科研智能体,按六阶段科研流程执行研究。每阶段用工具收集证据。

六阶段:
1 研究问题与假设:把任务拆成可回答的问题,形成假设。
2 文献综述:用 arxiv_search/scholar_search/web_search 找资料,web_fetch/read_pdf 精读,
   抽取主张与证据,识别研究空白。
3 研究方法:选择方法(案例/比较/实验/综述),说明依据。
4 证据收集与分析:收集数据/证据,评估来源与置信度。
5 结论与报告:综合证据,写报告(含引用/证据链/置信度),用 write_report 保存。
6 自评/评审:用批判视角(或辩论)加固结论。

证据链规则:每提出一个主张,注明来源(URL/论文)与置信度(高/中/低)。
证据存外部记忆:save_papers / save_fact。
"""


def _safe_json(result: str) -> dict:
    """宽容解析工具结果 JSON(清控制字符,截断则原样)。"""
    clean = "".join(ch for ch in result if ch >= " " or ch in "\t")
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        return {}


def run_research(query: str, max_stages: int = 8, session: str = "research") -> str:
    """执行六阶段科研流程,返回最终结论。

    max_stages: 最多模型调用轮数(每轮推进一个阶段或收证据)。
    """
    from openai import OpenAI

    client = OpenAI(**config.client_kwargs())
    messages: list[dict] = [{"role": "system", "content": RESEARCH_PROMPT}]
    messages.append({"role": "user", "content": query})

    evidence_trail: list[dict] = []
    final = ""
    for stage in range(max_stages):
        content, native_calls, text_calls = _chat(client, messages)
        print(f"\n[研究·阶段{stage+1}] {content}", end="", flush=True)
        calls = native_calls or text_calls
        if not calls:
            # 模型给出该阶段结论/最终结论
            final = content
            # 记录证据链
            _save_evidence(content, evidence_trail, query)
            break
        messages.append({"role": "assistant", "content": content})
        for call in calls:
            tool = call.get("tool")
            args = call.get("args", {})
            result = tools.run_tool(tool, args)
            print(f"\n[工具] {tool} → {result[:120]}", end="", flush=True)
            messages.append({"role": "tool", "name": tool, "content": result})
            if tool in ("arxiv_search", "scholar_search", "web_search"):
                papers = _safe_json(result).get("results", [])
                memory.save_papers(papers)
                for p in papers:
                    evidence_trail.append({"type": "paper", "source": p.get("url", ""),
                                           "claim": p.get("title", "")})
            if tool == "write_report":
                memory.checkpoint(session, "已生成报告")
    else:
        final = final or content  # noqa: F821

    # Stage 6 加固:用辩论/批判视角
    final = debate(query, rounds=1, session=session + "-review")
    memory.checkpoint(session, final)
    return final


def _save_evidence(content: str, trail: list[dict], query: str) -> None:
    """把模型结论里的主张存进外部记忆(带来源)。"""
    memory.save_fact(content, source=query)
    for e in trail:
        memory.save_fact(f"{e.get('type')}: {e.get('claim')}", source=e.get("source", ""))


def research_prompt() -> str:
    return RESEARCH_PROMPT