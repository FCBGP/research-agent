"""agentic 工具调用循环。

模型每轮可以选择调用工具;循环执行工具、把结果反馈给模型,直到模型给出
最终答案或轮数用尽。全程使用本地 OpenAI 兼容 API。
"""

from __future__ import annotations

import json
import re

from . import config
from . import context, memory
from .tools import run_tool, tool_schemas

SYSTEM_PROMPT = """你是本地科研智能体。你的任务是帮用户做研究:查资料、读文件、
分析代码、写报告。

你可以调用这些工具(每次调用一个,用参数 JSON):
- web_search(query)        联网搜索资料
- web_fetch(url)           抓取网页内容阅读
- arxiv_search(query)      arXiv 学术搜索(找论文)
- scholar_search(query)    学术搜索(论文/摘要/链接)
- read_file(path)          读取本地文本文件
- read_pdf(path)           提取 PDF 文本
- list_dir(path)           浏览目录结构
- grep(pattern, path)      搜索文件内容
- write_report(content)    把研究成果存成 Markdown 报告
- save_note(topic,title,content) 保存研究笔记到外部记忆
- read_notes(topic)        读取笔记
- recall_facts(query)      检索已保存事实

规则:
1. 需要查资料时,先用 web_search 找到候选,再用 web_fetch 精读。
2. 读本地文件/PDF 用 read_file/read_pdf;浏览代码用 list_dir/grep。
3. 每一步工具调用都发一条消息,格式:{"tool":"工具名","args":{...}}。
4. 看工具返回结果后继续,直到信息足够。
5. 信息足够时,给出最终研究结论(中文),并调用 write_report 保存报告。
6. 保持简洁,不要反复问用户;有歧义就按合理默认处理。
"""

# Harness 注入:hooks + 权限(settings.json),包裹 run_tool
try:
    from .harness import install_harness
    install_harness()
except Exception:
    pass

# 技能注入:把 skills/ 目录技能并入系统提示
try:
    from .skills import skills_prompt
    _sp = skills_prompt()
    if _sp:
        SYSTEM_PROMPT = SYSTEM_PROMPT + "\n\n[可用技能]\n" + _sp
except Exception:
    pass

# 综述《科研智能体「漫游指南」》对应增强:
# 推理增强(自洽验证) / 记忆增强(原子事实蒸馏) / 基准评估(事实性评分)
VERIFY_PROMPT = """你是验证方。请对照下面的检索证据,复核最终研究结论:
1. 每条结论是否有证据支撑?无证据的标【不确定】。
2. 有证据但来源未标注的,标【缺来源】。
3. 证据与结论矛盾的,标【矛盾】并说明。
只输出复核结论,不要改写内容。"""

DISTILL_PROMPT = """你是知识蒸馏方。把最终研究结论提炼成 3-5 条原子事实。
每条格式:【事实】内容【来源】URL/论文/文件
只输出这些事实,不要解释。"""

EVALUATE_PROMPT = """你是科研评估器。请对以下研究结论做事实性评分(0-100)。
输出 JSON:{"score": 0-100整数, "issues": ["无证据/缺来源/矛盾的要点"]}"""


def _extract_json(s: str) -> str:
    """从模型文本中提取 JSON 对象(清理控制字符,宽容解析)。"""
    s = "".join(ch for ch in s if ch >= " " or ch in "\t")
    start = s.find("{")
    if start < 0:
        return "{}"
    depth = 0
    for i in range(start, len(s)):
        ch = s[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return s[start : i + 1]
    return s[start:]


def _tool_calls_from(msg: str) -> list[dict]:
    """从模型文本中解析 JSON 工具调用(宽容解析)。

    支持:整条消息就是纯 JSON;或文本中内嵌的 JSON 对象。
    用平衡括号扫描器提取完整的 {...} 块,正确处理嵌套 JSON。
    """
    try:
        data = json.loads(msg)
        if isinstance(data, dict) and "tool" in data:
            return [data]
    except json.JSONDecodeError:
        pass

    blocks: list[dict] = []
    i = 0
    while True:
        start = msg.find("{", i)
        if start < 0:
            break
        depth = 0
        j = start
        while j < len(msg):
            ch = msg[j]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    break
            elif ch == '"':
                # 跳过字符串内的 { } 干扰
                j += 1
                while j < len(msg) and msg[j] != '"':
                    esc = msg[j] == "\\" and j + 1 < len(msg) and msg[j + 1] == '"'
                    j += 1
                    if esc:
                        j += 1
                    if not esc and msg[j] == '"':
                        break
            j += 1
        if depth == 0:
            block = msg[start : j + 1]
            # 清理 JSON 中的全部非法控制字符,宽容解析
            block = "".join(ch for ch in block if ch >= " " or ch in "\t")
            try:
                d = json.loads(block)
                if isinstance(d, dict) and "tool" in d:
                    blocks.append(d)
            except json.JSONDecodeError:
                pass
        i = max(j + 1, start + 1)
    return blocks


def _chat(client, messages: list[dict]) -> tuple[str, list[dict], list[dict]]:
    """调用本地 LLM,返回 (内容, 原生工具调用, 文本工具调用)。

    优先用 OpenAI 原生 tools 参数;模型不返回 tool_calls 时,
    回退解析文本中内嵌的 JSON 工具调用(稳健性)。
    """
    resp = client.chat.completions.create(
        model=config.MODEL,
        messages=messages,
        temperature=config.TEMPERATURE,
        tools=tool_schemas(),
    )
    message = resp.choices[0].message if resp.choices else None
    if message is None:
        return "", [], []
    content = message.content or ""
    native_calls: list[dict] = []
    for tc in getattr(message, "tool_calls", None) or []:
        fn = tc.function
        native_calls.append({"tool": fn.name, "args": json.loads(fn.arguments or "{}")})
    text_calls = _tool_calls_from(content)
    return content, native_calls, text_calls


def _distill_facts(client, final: str, evidence: str) -> list[dict]:
    """把最终结论提炼成原子事实并存入外部记忆(记忆增强)。"""
    msgs = [
        {"role": "system", "content": DISTILL_PROMPT},
        {"role": "user", "content": f"【最终结论】\n{final[:2500]}\n\n【检索证据】\n{evidence[:1500]}"},
    ]
    resp = client.chat.completions.create(model=config.MODEL, messages=msgs, temperature=0.3)
    content = resp.choices[0].message.content or ""
    facts = []
    for line in content.splitlines():
        if "【事实】" in line:
            fact = line.split("【事实】", 1)[1]
            source = ""
            if "【来源】" in line:
                fact, _, source = line.partition("【来源】")
            fact = fact.strip()
            if fact:
                facts.append({"fact": fact, "source": source.strip()})
                memory.save_fact(fact, source)
    return facts


def _evaluate_inline(client, final: str, evidence: str) -> dict:
    """事实性评分:让模型对照证据给结论打分(基准/评估)。"""
    msgs = [
        {"role": "system", "content": EVALUATE_PROMPT},
        {"role": "user", "content": f"【最终结论】\n{final[:2500]}\n\n【检索证据】\n{evidence[:1500]}"},
    ]
    resp = client.chat.completions.create(model=config.MODEL, messages=msgs, temperature=0.2)
    content = resp.choices[0].message.content or ""
    try:
        d = json.loads(_extract_json(content))
        return {"score": int(d.get("score", 50)), "issues": d.get("issues", [])}
    except Exception:
        return {"score": 50, "issues": ["无法解析评分"]}


def evaluate_report(report: str, query: str = "") -> dict:
    """事实性评分端点用:对研究结论做证据支撑评分(独立评估)。"""
    from openai import OpenAI

    client = OpenAI(**config.client_kwargs())
    prompt = ("【研究结论】\n" + report[:3000]
              + "\n\n输出 JSON:{\"score\": 0-100整数, \"issues\": [\"无证据/缺来源/矛盾的要点\"]}")
    msgs = [
        {"role": "system", "content": EVALUATE_PROMPT},
        {"role": "user", "content": prompt},
    ]
    resp = client.chat.completions.create(model=config.MODEL, messages=msgs, temperature=0.2)
    content = resp.choices[0].message.content or ""
    try:
        d = json.loads(_extract_json(content))
        return {"score": int(d.get("score", 50)), "issues": d.get("issues", [])}
    except Exception:
        return {"score": 50, "issues": ["无法解析评分"]}


def run_agent(user_query: str, max_turns: int | None = None, session: str = "default") -> str:
    """执行完整 agentic 循环,返回最终研究结论。

    架构:有界工作上下文(Active Context) + 外部记忆(External Memory)。
    模型每轮只看分层构建的 ~15K 工作台,不把全部历史塞进 messages[]。
    研究摘要/证据来自外部记忆(SQLite)检索;每步进展做 Checkpoint。
    """
    from openai import OpenAI

    max_turns = max_turns or config.MAX_TOOL_TURNS
    client = OpenAI(**config.client_kwargs())

    # 分层状态
    task_state = user_query                      # 当前任务(持久)
    research_summary = memory.resume(session)    # 跨会话恢复摘要
    conversation: list[dict] = []
    current_tool = ""

    final_answer = ""
    for turn in range(max_turns):
        # 检索 top-K 证据(论文/事实,与任务相关)
        evidence_parts = memory.recall_papers(user_query, k=3)
        evidence_parts += memory.recall_facts(user_query, k=3)
        evidence = "\n".join(
            f"- {p['title']} ({p['url']})" for p in evidence_parts
        )

        messages = context.build_messages(
            system=SYSTEM_PROMPT,
            task_state=task_state,
            research_summary=research_summary,
            evidence=evidence,
            current_tool=current_tool,
            conversation=conversation,
        )
        content, native_calls, text_calls = _chat(client, messages)
        print(f"\n[模型] {content}", end="", flush=True)

        calls = native_calls or text_calls
        if not calls:
            # 模型直接给出了最终答案
            final_answer = content
            research_summary = content
            memory.checkpoint(session, content)
            break

        conversation.append({"role": "assistant", "content": content})
        for call in calls:
            tool = call.get("tool")
            args = call.get("args", {})
            print(f"\n[工具] {tool}({json.dumps(args, ensure_ascii=False)})", flush=True)
            result = run_tool(tool, args)
            print(f"\n[结果] {result[:240]}", end="", flush=True)
            current_tool = f"{tool}: {result[:800]}"
            conversation.append({"role": "tool", "name": tool, "content": result})
            # 有意义的中间结论进外部记忆
            if tool in ("web_search", "arxiv_search", "scholar_search"):
                memory.save_papers(json.loads(_extract_json(result)).get("results", []) if _extract_json(result).startswith("{") else [])
            if tool == "write_report":
                memory.checkpoint(session, "已生成报告")

    else:
        final_answer = final_answer or content  # noqa: F821 (content 已在上轮赋值)
        research_summary = research_summary or content
        memory.checkpoint(session, content or research_summary)

    # 收尾:保存报告(仍用有界上下文)
    messages = context.build_messages(
        system=SYSTEM_PROMPT,
        task_state=task_state,
        research_summary=research_summary,
        evidence=evidence,
        current_tool=current_tool,
        conversation=conversation,
    )
    messages.append({"role": "user", "content": "请把上述研究结论整理成一份 Markdown 报告,调用 write_report 保存。"})
    content, native_calls, text_calls = _chat(client, messages)
    print(f"\n[模型] {content}", end="", flush=True)
    for call in native_calls or text_calls:
        tool = call.get("tool")
        args = call.get("args", {})
        if tool == "write_report":
            run_tool(tool, args)
            print(f"\n[工具] {tool} 已执行", flush=True)

    # 综述《科研智能体「漫游指南」》增强:
    # 推理增强(自洽验证) + 记忆增强(原子事实蒸馏) + 基准评估(事实性评分)
    verify_msgs = context.build_messages(
        system=VERIFY_PROMPT,
        task_state=task_state,
        research_summary=research_summary,
        evidence=evidence,
        current_tool=current_tool,
        conversation=[{"role": "user", "content": f"最终结论:\n{final_answer[:1500]}"}],
    )
    verified, _, _ = _chat(client, verify_msgs)
    print(f"\n[验证] {verified}", end="", flush=True)
    facts = _distill_facts(client, final_answer, evidence)
    print(f"\n[事实] 已提炼 {len(facts)} 条", end="", flush=True)
    eval_ = _evaluate_inline(client, final_answer, evidence)
    print(f"\n[评分] {eval_.get('score')}/100", end="", flush=True)

    return final_answer


def agent_events(user_query: str, max_turns: int | None = None, session: str = "default"):
    """生成器版 agent 循环:逐事件 yield,供后端 SSE 流式推送。

    yield {"type": "model"|"tool"|"result"|"final"|"report", ...}
    """
    from openai import OpenAI

    max_turns = max_turns or config.MAX_TOOL_TURNS
    client = OpenAI(**config.client_kwargs())

    task_state = user_query
    research_summary = memory.resume(session)
    conversation: list[dict] = []
    current_tool = ""
    final_answer = ""

    for turn in range(max_turns):
        evidence_parts = memory.recall_papers(user_query, k=3)
        evidence_parts += memory.recall_facts(user_query, k=3)
        evidence = "\n".join(f"- {p['title']} ({p['url']})" for p in evidence_parts)
        messages = context.build_messages(
            system=SYSTEM_PROMPT, task_state=task_state,
            research_summary=research_summary, evidence=evidence,
            current_tool=current_tool, conversation=conversation,
        )
        content, native_calls, text_calls = _chat(client, messages)
        yield {"type": "model", "content": content}
        calls = native_calls or text_calls
        if not calls:
            final_answer = content
            research_summary = content
            memory.checkpoint(session, content)
            break
        conversation.append({"role": "assistant", "content": content})
        for call in calls:
            tool = call.get("tool")
            args = call.get("args", {})
            yield {"type": "tool", "tool": tool, "args": args}
            result = run_tool(tool, args)
            yield {"type": "result", "content": result}
            current_tool = f"{tool}: {result[:800]}"
            conversation.append({"role": "tool", "name": tool, "content": result})
            if tool in ("web_search", "arxiv_search", "scholar_search"):
                memory.save_papers(json.loads(_extract_json(result)).get("results", []) if _extract_json(result).startswith("{") else [])
            if tool == "write_report":
                memory.checkpoint(session, "已生成报告")

    # 收尾:保存报告
    messages = context.build_messages(
        system=SYSTEM_PROMPT, task_state=task_state,
        research_summary=research_summary, evidence=evidence,
        current_tool=current_tool, conversation=conversation,
    )
    messages.append({"role": "user", "content": "请把上述研究结论整理成一份 Markdown 报告,调用 write_report 保存。"})
    content, native_calls, text_calls = _chat(client, messages)
    yield {"type": "model", "content": content}
    for call in native_calls or text_calls:
        if call.get("tool") == "write_report":
            args = call.get("args", {})
            res = run_tool("write_report", args)
            yield {"type": "report", "filename": args.get("filename", "research_report.md"), "content": res}

    # 综述《科研智能体「漫游指南」》增强:验证 / 事实蒸馏 / 评分,在 final 前推送
    verify_msgs = context.build_messages(
        system=VERIFY_PROMPT,
        task_state=task_state,
        research_summary=research_summary,
        evidence=evidence,
        current_tool=current_tool,
        conversation=[{"role": "user", "content": f"最终结论:\n{final_answer[:1500]}"}],
    )
    verified, _, _ = _chat(client, verify_msgs)
    yield {"type": "verified", "content": verified}

    facts = _distill_facts(client, final_answer, evidence)
    yield {"type": "facts", "count": len(facts), "facts": facts[:5],
           "content": f"已提炼 {len(facts)} 条原子事实"}

    eval_ = _evaluate_inline(client, final_answer, evidence)
    yield {"type": "evaluate", "score": eval_.get("score", 50),
           "issues": eval_.get("issues", []), "content": f"事实性评分 {eval_.get('score', 50)}/100"}

    # final 兜底:若循环用尽仍无直接答案,回退到最近摘要
    final_answer = final_answer or research_summary or "已完成研究(未生成明确结论)"
    yield {"type": "final", "content": final_answer}