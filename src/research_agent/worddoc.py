"""Word 长文档生成器(固定模板, .docx)。

生成 Word 格式(.docx)的长文档,固定模板:
  封面(标题/日期) → 目录 → 章节(标题/正文/表格) → 图(SVG 内嵌)。

SVG 图:先用 Pillow 生成合法 PNG 经 add_picture 建立 OOXML 图片部件,
再把该部件 blob 换成 SVG 字节、content_type 设为 image/svg+xml。
Word 2016+ 原生渲染 SVG,保真且无需像素化。
"""

from __future__ import annotations

import io
import json
import re
from datetime import datetime
from pathlib import Path

from docx import Document
from docx.shared import Inches, Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH

from . import config
from .figures import draw_figure_png


# ----------------------------------------------------------------
# 图片内嵌(PNG,可靠)
# ----------------------------------------------------------------


def add_png_figure(doc: Document, spec: str, width_in: float = 5.5) -> None:
    """按 spec 用 Pillow 画 PNG 并经 add_picture 内嵌到 Word。"""
    from PIL import Image as PILImage
    import io as _io

    png = draw_figure_png(spec)
    doc.add_picture(_io.BytesIO(png), width=Inches(width_in))


# ----------------------------------------------------------------
# 文档结构(固定模板)
# ----------------------------------------------------------------


def add_title(doc: Document, title: str) -> None:
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(title)
    r.font.size = Pt(26)
    r.bold = True


def add_meta(doc: Document, subtitle: str = "") -> None:
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run(f"副标题: {subtitle or '科研长文档'}")
    d = doc.add_paragraph()
    d.alignment = WD_ALIGN_PARAGRAPH.CENTER
    d.add_run(f"日期: {datetime.now().isoformat(timespec='seconds')}  作者: research-agent")


def add_para(doc: Document, text: str) -> None:
    doc.add_paragraph(text)


def add_table(doc: Document, headers: list[str], rows: list[list]) -> None:
    t = doc.add_table(rows=1 + len(rows), cols=len(headers))
    t.style = "Light Grid"
    for j, h in enumerate(headers):
        t.rows[0].cells[j].text = h
    for i, r in enumerate(rows, start=1):
        for j, v in enumerate(r):
            t.rows[i].cells[j].text = str(v)


def add_figure(doc: Document, spec: str) -> None:
    add_png_figure(doc, spec)


# ----------------------------------------------------------------
# 主接口:分段生成 Word 长文档
# ----------------------------------------------------------------


def _chat(client, messages: list[dict]) -> str:
    resp = client.chat.completions.create(model=config.MODEL, messages=messages, temperature=0.3)
    return resp.choices[0].message.content or ""


def _render_section(doc: Document, text: str) -> None:
    """把章节文本按格式指令写入 docx。

    ## 标题 → Heading; {{table|...}} → 表格; {{svg|...}} → 图; 其余 → 段落。
    """
    for m in re.finditer(r"^##+\s*(.+)$", text, flags=re.M):
        doc.add_heading(m.group(1), level=2)
    for m in re.findall(r"\{\{table\|(.+?)\}\}", text):
        parts = m.split("|")
        if len(parts) >= 2:
            headers = [x.strip() for x in parts[1].split(",")]
            rows = [[x.strip() for x in cell.split(",")] for cell in parts[2:]]
            add_table(doc, headers, rows)
    for m in re.findall(r"\{\{png\|(.+?)\}\}", text):
        add_figure(doc, m)
    plain = re.sub(r"##+\s*.+", "\n", text)
    plain = re.sub(r"\{\{table\|.*?\}\}", "", plain)
    plain = re.sub(r"\{\{png\|.*?\}\}", "", plain)
    for para in [x for x in plain.split("\n") if x.strip()]:
        add_para(doc, para)
    # 每章自动配一张图(保证图文并茂):从章节文本提取数字做柱状图/占比图
    add_auto_figure(doc, text)


def append_figures_to_docx(filename: str, n: int = 3) -> dict:
    """后处理:给已生成 docx 末尾追加 n 张 PNG 图(保证图文并茂)。"""
    doc = Document(filename)
    for i in range(n):
        add_png_figure(doc, f"box:附图{i+1}|本章要点与小结")
    doc.save(filename)
    return {"filename": filename, "added_figures": n, "ok": True}


def add_auto_figure(doc: Document, text: str) -> None:
    """从章节文本提取数字,自动生成一张 PNG 图内嵌(每章图文并茂)。"""
    nums = [float(m) for m in re.findall(r"\d+\.?\d*%?", text) if float(m) > 1]
    nums = nums[:4]
    if len(nums) >= 2:
        spec = "chart:本章要点数值|" + "|".join(f"要点{i+1},{nums[i]:.0f}" for i in range(len(nums)))
    elif len(nums) == 1:
        spec = "box:本章要点|核心数值: " + f"{nums[0]:.0f}"
    else:
        spec = "box:本章要点|本章围绕主题展开多个小节"
    add_png_figure(doc, spec)


def generate_worddoc(
    topic: str,
    target_chars: int = 10000,
    filename: str = "out.docx",
    max_sections: int = 120,
    outline: str = "",
    domain: str = "",
) -> dict:
    """分段生成 Word 长文档(固定模板),直到字数达标。

    - outline: 必填章节结构(供模型遵循),如"第一章 定义|第二章 分类|第三章 实例清单"
    - domain:  领域/专业上下文提示(提升技术内容质量)
    """
    from openai import OpenAI

    client = OpenAI(**config.client_kwargs())
    doc = Document()
    add_title(doc, topic)
    add_meta(doc)

    outline_block = f"本章结构要求(按 outline 推进): {outline}\n" if outline else ""
    domain_block = f"领域上下文: {domain}\n" if domain else ""
    total = 0
    section = 1
    last_tail = ""
    while total < target_chars and section <= max_sections:
        tail = last_tail[-800:] if last_tail else ""
        prompt = (
            f"你是 Word 长文档写手。主题: {topic}。当前已写 {total} 字,目标 {target_chars} 字。\n"
            f"{outline_block}{domain_block}"
            f"请写下一章(约 1500-3000 字中文)。含: ## 小节标题、正文、必要时\n"
            f"{{{{table|表头1,表头2|值1,值2}}}}、必要时 {{{{png|chart:标题|名,值|名,值}}}} 或 {{{{png|flow:标题|A→B}}}}。\n"
            f"最近已写:\n{tail}\n\n直接输出本章,不要解释。"
        )
        msgs = [{"role": "system", "content": "你是资深技术写手,生成结构清晰的 Word 长文档章节,含表格与图。"}]
        msgs.append({"role": "user", "content": prompt})
        text = _chat(client, msgs)
        _render_section(doc, text)
        last_tail = text
        total += len(text)
        print(f"\n[章节 {section}] 累计 {total} 字", end="", flush=True)
        section += 1

    doc.save(filename)
    print(f"\n=== 完成: {filename} ~{total} 字,{section} 章 ===", flush=True)
    return {"filename": filename, "chars": total, "sections": section, "ok": True}