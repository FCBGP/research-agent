"""科研规划层(Planning)。

对 requirements.md 的高价值缺口:选题评分、研究图谱/空白区、引用校验、
实验设计、选刊匹配、审稿应答、多方案决策。每个任务 = 一条独立 LLM 调用
(仿 loop._chat),可选复用 tools / memory 作为证据,不塞进 agentic 主循环,
避免互相干扰。全部走 `_call_llm()` 通用辅助。
"""

from __future__ import annotations

import json

from . import config


def _call_llm(prompt: str, system: str = "") -> str:
    """调本地 LLM(OpenAI 兼容接口),返回文本。"""
    from openai import OpenAI

    client = OpenAI(**config.client_kwargs())
    msgs = []
    if system:
        msgs.append({"role": "system", "content": system})
    msgs.append({"role": "user", "content": prompt})
    resp = client.chat.completions.create(model=config.MODEL, messages=msgs, temperature=0.3)
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


def _json_instruction(template: str) -> str:
    """把 JSON 模板当普通字面量拼接(避免 f-string 表达式里含反斜杠)。"""
    return template


# ----------------------------------------------------------------
# 1. 选题评分与优先排序 (UC-2.2-1)
# ----------------------------------------------------------------


def topic_score(topic: str, constraints: str = "") -> dict:
    """对候选研究选题做多维评分与优先排序。

    维度:新颖度/影响力/可行性/数据可得性/资源与成本/时间窗口,各 0-100。
    """
    system = "你是选题评估器。对候选研究选题做 0-100 多维评分,并给优先级建议。"
    instruction = '输出 JSON:{"scores": {"新颖度": 0-100, "影响力": 0-100, "可行性": 0-100, "数据可得性": 0-100, "资源与成本": 0-100, "时间窗口": 0-100}, "priority": "高|中|低", "suggestion": "取舍与理由"}'
    prompt = ("【候选选题】\n" + topic + "\n\n【约束】\n" + (constraints or "无")
              + "\n\n" + instruction)
    out = _extract_json(_call_llm(prompt, system))
    return out or {"scores": {}, "priority": "中", "suggestion": "评分未解析"}


# ----------------------------------------------------------------
# 2. 研究图谱构建与空白区识别 (UC-2.1-2)
# ----------------------------------------------------------------


def research_map(domain: str, k: int = 12) -> dict:
    """从外部记忆论文建主题集群图,识别空白区/热点。

    复用 memory.recall_papers 检索领域论文,交给 LLM 归纳集群与空白。
    """
    from . import memory

    papers = memory.recall_papers(domain, k=k)
    titles = "\n".join(f"- {p.get('title','')} ({p.get('url','')})" for p in papers)
    if not titles:
        titles = "(外部记忆暂无该领域论文,可用 web_search/arxiv_search 先检索)"
    system = "你是研究图谱构建方。把论文归纳为主题集群,识别热点/空白与潜在突破点。"
    instruction = '输出 JSON:{"clusters": ["集群名"], "hotspots": ["热点"], "blanks": ["空白区"], "suggestions": ["突破点建议"]}'
    prompt = ("【领域】\n" + domain + "\n\n【论文清单】\n" + titles + "\n\n" + instruction)
    out = _extract_json(_call_llm(prompt, system))
    return out or {"clusters": [], "hotspots": [], "blanks": [], "suggestions": []}


# ----------------------------------------------------------------
# 3. 引用一致性校验与书目管理 (UC-2.1-3)
# ----------------------------------------------------------------


def citation_check(references: str) -> dict:
    """校验书目:元数据补全、风格(IEEE/ACM/APA)、重复/缺失、与正文引用一致。

    references: 可直接传引用列表文本,或指向含书目的文件路径(自动 read_file)。
    """
    from . import tools

    if "\n" not in references or "http" not in references:
        # 可能是文件路径,尝试读取
        result = tools.read_file(references)
        if "text" in result:
            references = result["text"]
    system = "你是书目校验方。检查引用列表:元数据是否完整、风格是否一致、有无重复/缺失,标注问题并给修复建议。"
    instruction = '输出 JSON:{"issues": ["问题"], "duplicates": ["重复项"], "missing": ["缺失项"], "style": "IEEE|ACM|APA|混合", "fixes": ["修复建议"]}'
    prompt = ("【引用列表】\n" + references[:4000] + "\n\n" + instruction)
    out = _extract_json(_call_llm(prompt, system))
    return out or {"issues": [], "duplicates": [], "missing": [], "style": "?", "fixes": []}


# ----------------------------------------------------------------
# 4. 实验设计助手与功效分析 (UC-2.3-1)
# ----------------------------------------------------------------


def experiment_design(spec: str) -> dict:
    """实验设计:输入效应量/显著性(α)/功效(1-β)/变量与对照,输出样本量与设计蓝图。"""
    system = "你是实验设计助手。根据效应量/显著性/功效目标计算样本量,并给出设计蓝图(变量控制、随机化、盲法、Ablation)。"
    instruction = '输出 JSON:{"sample_size": 建议样本量, "power": 0.8, "alpha": 0.05, "design": ["设计要点"], "stat_method": "统计检验", "notes": "说明"}'
    prompt = ("【实验规格】\n" + spec + "\n\n" + instruction)
    out = _extract_json(_call_llm(prompt, system))
    return out or {"sample_size": 0, "power": 0.8, "alpha": 0.05, "design": [], "stat_method": "", "notes": ""}


# ----------------------------------------------------------------
# 5. 选刊匹配与命中率预测 (UC-2.5-1)
# ----------------------------------------------------------------


def journal_match(draft: str) -> dict:
    """选刊匹配:根据论文主题/关键词/方法与数据域,给出候选期刊/会议与命中率。"""
    system = "你是选刊匹配方。根据论文主题与关键词,推荐候选期刊/会议,给出匹配度与命中率理由。"
    instruction = '输出 JSON:{"candidates": [{"venue": "期刊/会议", "match": 0-100, "reason": "理由"}], "top": "首选", "notes": "投稿建议"}'
    prompt = ("【论文草稿】\n" + draft[:3000] + "\n\n" + instruction)
    out = _extract_json(_call_llm(prompt, system))
    return out or {"candidates": [], "top": "", "notes": ""}


# ----------------------------------------------------------------
# 6. 审稿意见分析与回复生成 (UC-2.5-4)
# ----------------------------------------------------------------


def reviewer_response(review: str) -> dict:
    """审稿应答:意见分类 → 关键问题提取 → 回复策略与修改建议。"""
    system = "你是审稿应答助手。对审稿意见分类、提取关键问题,生成回复策略与修改建议。"
    instruction = '输出 JSON:{"categories": ["分类"], "key_issues": ["关键问题"], "strategy": "回复策略", "revisions": ["修改建议"]}'
    prompt = ("【审稿意见】\n" + review[:4000] + "\n\n" + instruction)
    out = _extract_json(_call_llm(prompt, system))
    return out or {"categories": [], "key_issues": [], "strategy": "", "revisions": []}


# ----------------------------------------------------------------
# 7. 多方案比较与决策支持 (UC-2.3-4)
# ----------------------------------------------------------------


def decision_support(options: str) -> dict:
    """多方案比较:多维评估矩阵、风险、推荐。"""
    system = "你是决策支持方。对多个技术方案做多维评估矩阵、风险分析,给出推荐。"
    instruction = '输出 JSON:{"matrix": {"方案名": {"维度": 0-100}}, "risks": {"方案名": ["风险"]}, "recommendation": "推荐方案与理由"}'
    prompt = ("【候选方案】\n" + options + "\n\n" + instruction)
    out = _extract_json(_call_llm(prompt, system))
    return out or {"matrix": {}, "risks": {}, "recommendation": ""}


# ----------------------------------------------------------------
# 注册表(供 tools.py / server.py 调用)
# ----------------------------------------------------------------


PLANNING_TOOLS: dict[str, callable] = {
    "topic_score": topic_score,
    "experiment_design": experiment_design,
    "journal_match": journal_match,
}


def planning_prompt() -> str:
    return "可用规划任务:topic_score(选题评分)、research_map(图谱/空白)、citation_check(引用校验)、experiment_design(实验设计)、journal_match(选刊匹配)、reviewer_response(审稿应答)、decision_support(方案比较)。"