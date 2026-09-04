"""科研进化层(Evolve)—— 适配 ASI-Evolve 的 LEARN→DESIGN→EXPERIMENT→ANALYZE 环。

面向互联网网络/路由研究:每轮学习已知/空白 → 设计下一个假设与工具计划 →
收集证据(网络/路由文献)→ 蒸馏可复用经验,存外部记忆与试验谱系(trials)。

架构:单智能体进化环(不引入多角色 pipeline),复用现有 tools/memory/config;
每角色可用不同底层模型(config.agent_models / model_for)。可经 /agent/evolve 或
/agent/evolve/stream(SSE)调用。
"""

from __future__ import annotations

import json

from . import config
from . import memory, tools


def _llm(prompt: str, system: str = "", model: str | None = None) -> str:
    """调本地 LLM(OpenAI 兼容接口),可选 per-call model 覆盖。"""
    from openai import OpenAI

    client = OpenAI(**config.client_kwargs())
    msgs = []
    if system:
        msgs.append({"role": "system", "content": system})
    msgs.append({"role": "user", "content": prompt})
    resp = client.chat.completions.create(model=model or config.MODEL, messages=msgs, temperature=0.3)
    return resp.choices[0].message.content or ""


def _extract_json(s: str) -> dict:
    """宽容提取模型输出里的 JSON 对象。"""
    s = "".join(ch for ch in s if ch >= " " or ch in "\t")
    start = s.find("{")
    if start < 0:
        return {}
    depth = 0
    for i in range(start, len(s)):
        ch = s[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(s[start : i + 1])
                except json.JSONDecodeError:
                    return {}
    return {}


# 证据工具白名单(网络/路由研究)
EVIDENCE_TOOLS = ["web_search", "web_fetch", "arxiv_search", "scholar_search", "read_file", "grep"]


# ----------------------------------------------------------------
# Stage 1 LEARN — 学习已知/空白
# ----------------------------------------------------------------


def learn(topic: str, session: str = "evolve") -> dict:
    """检索外部记忆论文/事实/试验,提炼已知结论与研究空白。"""
    from . import memory as _mem

    papers = _mem.recall_papers(topic, k=3)
    facts = _mem.recall_facts(topic, k=3)
    trials = _mem.recall_trials(session, k=3)
    evidence = "\n".join(
        f"- {p.get('title','')} ({p.get('url','')})" for p in papers
    ) + "\n" + "\n".join(f"- {f.get('fact','')} ({f.get('source','')})" for f in facts) + "\n" + "\n".join(
        f"- [试验{round}] {t.get('lesson','')}" for t in trials
    )
    system = "你是网络/路由研究的学习方。检索已知论文/事实/试验,提炼已知结论与研究空白。"
    instruction = '输出 JSON:{"motivation": "研究动机", "known": ["已知结论"], "blanks": ["研究空白"]}'
    prompt = ("【主题】\n" + topic + "\n\n【已知】\n" + (evidence or "(暂无已知)") + "\n\n" + instruction)
    out = _extract_json(_llm(prompt, system, model=config.model_for("learner")))
    return out or {"motivation": "", "known": [], "blanks": []}


# ----------------------------------------------------------------
# Stage 2 DESIGN — 设计假设与工具计划
# ----------------------------------------------------------------


def design(topic: str, motivation: str, session: str = "evolve", round_no: int = 1) -> dict:
    """基于学习摘要提出下一个研究假设/方向与工具计划。"""
    system = "你是网络/路由研究的设计方。提出下一个可检验假设/方向,并给出证据收集工具计划(只限白名单)。"
    instruction = '输出 JSON:{"hypothesis": "假设", "direction": "方向", "tool_plan": ["工具名"]}'
    prompt = ("【主题】\n" + topic + "\n\n【动机】\n" + motivation + "\n\n【第" + str(round_no) + "轮】\n" + instruction)
    out = _extract_json(_llm(prompt, system, model=config.model_for("designer")))
    tool_plan = out.get("tool_plan", []) or []
    tool_plan = [t for t in tool_plan if t in EVIDENCE_TOOLS] or EVIDENCE_TOOLS[:2]
    out["tool_plan"] = tool_plan
    return out or {"hypothesis": "", "direction": "", "tool_plan": EVIDENCE_TOOLS[:2]}


# ----------------------------------------------------------------
# Stage 3 EXPERIMENT — 收集证据
# ----------------------------------------------------------------


def experiment(hypothesis: str, tool_plan: list[str], session: str = "evolve") -> dict:
    """逐个工具收集证据(网络/路由文献),搜到的论文存入外部记忆。"""
    evidence = []
    n_papers = 0
    for tool in tool_plan:
        if tool in ("web_search", "arxiv_search", "scholar_search"):
            args = {"query": hypothesis}
        elif tool == "grep":
            args = {"path": ".", "pattern": hypothesis, "max_results": 30}
        else:
            args = {"url": hypothesis}
        result = tools.run_tool(tool, args)
        evidence.append(f"[{tool}] {result[:400]}")
        if tool in ("web_search", "arxiv_search", "scholar_search"):
            try:
                papers = _extract_json(result).get("results", [])
                if papers:
                    memory.save_papers(papers)
                    n_papers += len(papers)
            except Exception:
                pass
    return {"evidence": evidence, "papers": n_papers}


# ----------------------------------------------------------------
# Stage 4 ANALYZE — 蒸馏可复用经验
# ----------------------------------------------------------------


def analyze(hypothesis: str, evidence: list[str], session: str = "evolve") -> dict:
    """对照假设与证据,蒸馏一条可复用经验,存入外部记忆。"""
    ev = "\n".join(e for e in evidence[:8])
    system = "你是网络/路由研究的分析方。对照假设与证据,蒸馏一条可复用经验。"
    instruction = '输出 JSON:{"lesson": "经验", "source": "来源", "confidence": "高|中|低"}'
    prompt = ("【假设】\n" + hypothesis + "\n\n【证据】\n" + (ev or "(无证据)") + "\n\n" + instruction)
    out = _extract_json(_llm(prompt, system, model=config.model_for("analyzer")))
    lesson = out.get("lesson", "")
    if lesson:
        memory.save_fact(lesson, source=out.get("source", ""))
        memory.save_note(topic="routing", title="经验", content=lesson)
    return out or {"lesson": "", "source": "", "confidence": "中"}


# ----------------------------------------------------------------
# 进化环(多轮)
# ----------------------------------------------------------------


def evolve(topic: str, max_rounds: int = 3, session: str = "evolve") -> dict:
    """执行 LEARN→DESIGN→EXPERIMENT→ANALYZE 进化环,存试验谱系并写报告。"""
    rounds = []
    lessons = []
    for rnd in range(1, max_rounds + 1):
        lrn = learn(topic, session)
        des = design(topic, lrn.get("motivation", ""), session, rnd)
        exp = experiment(des.get("hypothesis", ""), des.get("tool_plan", []), session)
        ana = analyze(des.get("hypothesis", ""), exp.get("evidence", []), session)
        rounds.append({"round": rnd, "hypothesis": des.get("hypothesis", ""),
                       "evidence": exp.get("evidence", []), "lesson": ana.get("lesson", "")})
        lessons.append(ana.get("lesson", ""))
        memory.save_trial(session, rnd, lrn.get("motivation", ""), des.get("hypothesis", ""),
                          "\n".join(exp.get("evidence", []))[:800], ana.get("lesson", ""))
        memory.checkpoint(session, f"{rnd} 轮完成")

    # 综合报告
    summary = "\n".join(f"- 第{rd['round']}轮: {rd['lesson']}" for rd in rounds)
    report = f"# 网络/路由进化研究\n\n主题: {topic}\n\n{summary}\n"
    filename = f"evolve_{topic}.md"
    tools.write_report(report, filename=filename)
    return {"rounds": rounds, "lessons": lessons,
            "final": lessons[-1] if lessons else "已完成进化研究",
            "report": filename}


def evolve_events(topic: str, max_rounds: int = 3, session: str = "evolve"):
    """生成器版进化环,逐事件 yield(供 SSE)。"""
    for rnd in range(1, max_rounds + 1):
        lrn = learn(topic, session)
        yield {"type": "learn", "content": lrn.get("motivation", "")}
        des = design(topic, lrn.get("motivation", ""), session, rnd)
        yield {"type": "design", "hypothesis": des.get("hypothesis", ""), "direction": des.get("direction", "")}
        exp = experiment(des.get("hypothesis", ""), des.get("tool_plan", []), session)
        yield {"type": "experiment", "evidence": exp.get("evidence", [])}
        ana = analyze(des.get("hypothesis", ""), exp.get("evidence", []), session)
        yield {"type": "analyze", "lesson": ana.get("lesson", "")}
        yield {"type": "trial", "round": rnd, "lesson": ana.get("lesson", "")}
    yield {"type": "final", "content": "进化研究完成"}