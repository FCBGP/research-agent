"""长文档生成(Long Document Generation)。

生成至少 target 字数(默认 100000)的图文并茂 Markdown 文档。
因为不能一次塞进模型上下文,采用**分段生成**:写手智能体每轮写一章,
追加到文件,循环直到字数达标。SVG 插图经 svg_draw 内嵌,图文并茂。

架构原则:每次只给模型看"写作指引 + 已写章节摘要"(有界工作台),
不把全文塞进 context。
"""

from __future__ import annotations

import json
import math
from pathlib import Path

from . import config
from .tools import run_tool, svg_draw


def _chat(client, messages: list[dict]) -> str:
    """调用本地 LLM 返回文本。"""
    resp = client.chat.completions.create(
        model=config.MODEL,
        messages=messages,
        temperature=0.3,
    )
    return resp.choices[0].message.content or ""


def _chars_of(text: str) -> int:
    """粗略字符数(含标记)。"""
    return len(text)


def _append(file: Path, text: str) -> None:
    with open(file, "a", encoding="utf-8") as f:
        f.write(text)


def _tail_chars(file: Path, n: int = 800) -> str:
    """读取文件末尾 n 字符(给模型看最近写作,保持连续性)。"""
    try:
        data = file.read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""
    return data[-n:] if len(data) > n else data


def generate_longdoc_pandoc(
    topic: str,
    target_chars: int = 100000,
    filename: str = "long_report.docx",
    reference_doc: str = "",
    max_sections: int = 200,
) -> dict:
    """长文档 pandoc 模板管线:分段写 md → pandoc 转 .docx(模板定义格式)。"""
    from openai import OpenAI
    from .md2docx import md_to_docx

    client = OpenAI(**config.client_kwargs())
    md_path = Path(filename).with_suffix(".md")
    md_path.write_text(f"# {topic}\n\n", encoding="utf-8")

    total = 0
    section = 1
    while total < target_chars and section <= max_sections:
        tail = _tail_chars(md_path, 800)
        prompt = (
            f"你是长文档写手。主题: {topic}。当前已写 {total} 字,目标 {target_chars} 字。\n"
            f"请写下一章(约 2000-4000 字,Markdown,含小节标题与正文)。\n"
            f"最近已写:\n{tail}\n\n直接输出本章 Markdown,不要解释。"
        )
        msgs = [{"role": "system", "content": "你是资深技术写手,生成结构清晰的长文档章节。"}]
        msgs.append({"role": "user", "content": prompt})
        text = _chat(client, msgs)
        text = _resolve_svg(text)
        with open(md_path, "a", encoding="utf-8") as f:
            f.write(text + "\n")
        total = _chars_of(md_path.read_text(encoding="utf-8"))
        print(f"\n[章节 {section}] 累计 {total} 字", end="", flush=True)
        section += 1

    total = _chars_of(md_path.read_text(encoding="utf-8"))
    result = md_to_docx(md_path.read_text(encoding="utf-8"), filename, reference_doc)
    print(f"\n=== 完成: {filename} ~{total} 字,pandoc {result.get('ok')} ===", flush=True)
    return {"filename": filename, "chars": total, "sections": section, "pandoc": result, "ok": True}


def generate_longdoc(
    topic: str,
    target_chars: int = 100000,
    filename: str = "long_report.docx",
    max_sections: int = 200,
) -> dict:
    """分段生成长文档,直到字数≥target 或章节数用尽。

    - topic: 文档主题
    - target_chars: 目标字数(默认 10 万)
    - filename: 输出 Markdown 文件
    - max_sections: 最多章节数(防死循环)
    """
    from openai import OpenAI

    client = OpenAI(**config.client_kwargs())
    out = Path(filename)
    out.write_text(f"# {topic}\n\n", encoding="utf-8")  # 初始化

    total = len(topic) + 2
    section = 1
    while total < target_chars and section <= max_sections:
        tail = _tail_chars(out, 800)
        prompt = (
            f"你是长文档写手。主题: {topic}。当前已写 {total} 字,目标 {target_chars} 字。\n"
            f"请写下一章(约 2000-4000 字,Markdown 小节)。内容要充实、有标题、有实例;\n"
            f"如合适,可用 svg_draw 生成插图(调用工具格式 {{\"tool\":\"svg_draw\",\"args\":{{\"spec\":\"chart:标题|名:值,名:值\"}}}},把返回的 svg 嵌进文档)。\n"
            f"最近已写:\n{tail}\n\n直接输出本章正文,不要解释。"
        )
        msgs = [{"role": "system", "content": "你是资深技术写手,生成结构清晰的长文档章节。"}]
        msgs.append({"role": "user", "content": prompt})
        text = _chat(client, msgs)
        # 处理章节内可能的 svg_draw 调用
        text = _resolve_svg(text)
        _append(out, text + "\n")
        total = _chars_of(out.read_text(encoding="utf-8"))
        print(f"\n[章节 {section}] 累计 {total} 字", end="", flush=True)
        section += 1

    total = _chars_of(out.read_text(encoding="utf-8"))
    print(f"\n=== 完成: 共 {total} 字,{section} 章 ===", flush=True)
    return {"filename": str(out), "chars": total, "sections": section, "ok": True}


def _resolve_svg(text: str) -> str:
    """把章节文本中内嵌的 svg_draw 调用替换为实际 SVG。"""
    import re

    while True:
        m = re.search(r'\{[\s\S]*?"tool"\s*:\s*"svg_draw"[\s\S]*?\}', text)
        if not m:
            break
        block = m.group()
        try:
            d = json.loads(block)
            spec = d.get("args", {}).get("spec", "")
        except json.JSONDecodeError:
            break
        result = svg_draw(spec)
        svg = result.get("svg", "")
        text = text.replace(block, svg)
    return text


# CLI 入口便捷函数
def main_long(topic: str, target: int = 100000, filename: str = "long_report.md") -> None:
    generate_longdoc(topic, target_chars=target, filename=filename)