"""上下文管理器(Context Manager)。

核心原则(来自架构设计): 上下文窗口是"工作台",不是"数据库"。
模型永远只看一块**有界**的 Working Context(~15K),由分层构建:

  System           ~2K   系统提示
  Task State       ~1K   当前任务/目标
  Research Summary ~2K   已积累的结论摘要
  Retrieved Evi     ~4K   检索到的 top-K 证据
  Current Tool     ~2K   最近工具结果/状态
  Conversation     ~4K   最近几轮对话

长期知识(论文/笔记/实验)不塞进 context,而是进外部记忆(SQLite),
需要时通过 Retrieval 检索 top-K 证据回填。
"""

from __future__ import annotations

from . import config


def _truncate(text: str, budget: int) -> str:
    """按预算截断文本,超出时保留前缀并标注已截断。"""
    if len(text) <= budget:
        return text
    return text[:budget] + "\n[已截断]"


def build_messages(
    system: str,
    task_state: str,
    research_summary: str,
    evidence: str,
    current_tool: str,
    conversation: list[dict],
) -> list[dict]:
    """把分层内容组装成给模型的有界消息序列。

    - system: 系统提示(预算 2000)
    - task_state: 当前任务(预算 1000)
    - summary + evidence + current_tool 合并为一条 user 消息(预算 ~8000)
    - conversation: 最近轮数(预算 4000,按需裁剪)
    """
    state_block = f"【当前任务】\n{_truncate(task_state, 1000)}"
    summary_block = f"【研究摘要】\n{_truncate(research_summary, 2000)}"
    evidence_block = f"【检索证据】\n{_truncate(evidence, 4000)}"
    tool_block = f"【当前工具/最近结果】\n{_truncate(current_tool, 2000)}"

    context_user = "\n\n".join(x for x in (state_block, summary_block, evidence_block, tool_block) if x)
    messages: list[dict] = [{"role": "system", "content": _truncate(system, 2000)}]
    if context_user:
        messages.append({"role": "user", "content": context_user})

    # 对话层:保留最近若干轮,预算 4000
    conv_budget = 4000
    conv: list[dict] = []
    for m in reversed(conversation):
        mlen = len(m.get("content", ""))
        if mlen > conv_budget:
            conv.insert(0, {
                "role": m.get("role"),
                "content": m.get("content", "")[:1200] + "\n[历史已截断]",
            })
            conv_budget = 0
        else:
            conv.insert(0, m)
            conv_budget -= mlen
        if conv_budget <= 0:
            break
    messages.extend(conv)
    return messages


def estimate_tokens(messages: list[dict]) -> int:
    """粗略估算总字符数(用于调试/校验有界性)。"""
    return sum(len(m.get("content", "")) for m in messages)