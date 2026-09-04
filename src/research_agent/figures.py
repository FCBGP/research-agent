"""Pillow 直接绘制 PNG 图(纯 Python,可靠,可嵌入 Word)。

替代 SVG 方案:Pillow 无需原生依赖,能画 bar/pie/flow/box 图,
直接输出 PNG 供 python-docx add_picture 内嵌。Word 图文并茂且稳定。

spec 格式(与 svg_draw 一致):
  chart:<标题>|名:值,名:值...    → 柱状图
  pie:<标题>|名:值,名:值...      → 饼图
  flow:<标题>|A→B→C              → 流程
  box:<标题>|内容                 → 说明框
  其他                          → 标题 + 说明框
"""

from __future__ import annotations

import io
import math
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 800, 500
BG = (250, 250, 250)
INK = (40, 40, 40)
BAR = (74, 144, 226)   # 蓝
PIE = [(74,144,226), (80,184,72), (226,107,74), (184,74,226), (226,184,74), (74,226,184)]


def _font(size: int = 28):
    """取可用字体(优先常见中文字体,否则默认)。"""
    for path in ("/System/Library/Fonts/Hiragino Sans GB.ttc",
                 "/System/Library/Fonts/STHeiti Light.ttc",
                 "/Library/Fonts/Arial Unicode.ttf"):
        p = Path(path)
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size)
            except Exception:
                continue
    try:
        return ImageFont.load_default(size)
    except Exception:
        return ImageFont.load_default()


def _text(d, xy, s, font, fill=INK, anchor="mm"):
    d.text(xy, s, font=font, fill=fill, anchor=anchor)


def _num(v) -> float:
    try:
        return float(v)
    except (ValueError, TypeError):
        return 0.0


def _title_parts(spec: str) -> tuple[str, str, str]:
    kind = "box"
    if spec.startswith("chart:"):
        kind = "bar"
    elif spec.startswith("pie:"):
        kind = "pie"
    elif spec.startswith("flow:"):
        kind = "flow"
    elif spec.startswith("box:"):
        kind = "box"
    parts = spec.split("|")
    title = parts[0].split(":", 1)[-1].strip() if ":" in parts[0] else spec
    data = parts[1].strip() if len(parts) > 1 else ""
    return kind, title, data


def draw_bar(d, title, data, W=W, H=H):
    font_t = _font(32)
    font_v = _font(22)
    d.rectangle([0, 0, W, H], fill=BG)
    _text(d, (W/2, 40), title, font_t)
    items = [x.split(",") for x in data.split("|") if x]
    n = len(items) or 1
    base, top = 60, 400
    bw = (W - base*2) / n
    for i, (name, val) in enumerate(items):
        name = name or "项"
        v = _num(val)
        h = max(40, v / 100 * (top - 100))
        x = base + i*bw
        d.rectangle([x, top-h, x+bw-20, top], fill=BAR, outline=INK)
        _text(d, (x+bw/2, top+30), name, font_v)
        _text(d, (x+bw/2, top-h-20), f"{v:.0f}", font_v)


def draw_pie(d, title, data, W=W, H=H):
    font_t = _font(32)
    font_v = _font(20)
    d.rectangle([0, 0, W, H], fill=BG)
    _text(d, (W/2, 40), title, font_t)
    items = [x.split(",") for x in data.split("|") if x]
    total = sum(_num(v) for _, v in items) or 1
    cx, cy, r = W/2, H*0.55, H*0.30
    start = -90
    for i, (name, val) in enumerate(items):
        name = name or "项"
        frac = _num(val) / total
        end = start + frac*360
        d.pieslice([cx-r, cy-r, cx+r, cy+r], start, end, fill=PIE[i % len(PIE)], outline=INK)
        mid = (start+end)/2
        _text(d, (cx + r*0.55*math.cos(math.radians(mid)),
                  cy + r*0.55*math.sin(math.radians(mid))), name, font_v, fill=(255,255,255))
        start = end


def draw_flow(d, title, data, W=W, H=H):
    font_t = _font(32)
    font_v = _font(22)
    d.rectangle([0, 0, W, H], fill=BG)
    _text(d, (W/2, 40), title, font_t)
    steps = [s.strip() for s in data.split("→") if s.strip()]
    n = len(steps) or 1
    bw, bh = 140, 60
    y = 150
    for i, s in enumerate(steps):
        x = 80 + i*(bw+40)
        d.rounded_rectangle([x, y, x+bw, y+bh], radius=8, outline=INK, width=3, fill=(255,255,255))
        _text(d, (x+bw/2, y+30), s, font_v)
        if i < n-1:
            d.line([x+bw, y+30, x+bw+40, y+30], fill=INK, width=3)
            d.polygon([(x+bw+40, y+25), (x+bw+48, y+30), (x+bw+40, y+35)], fill=INK)


def draw_box(d, title, data, W=W, H=H):
    font_t = _font(32)
    font_v = _font(24)
    d.rectangle([0, 0, W, H], fill=BG)
    _text(d, (W/2, 40), title, font_t)
    d.rounded_rectangle([80, 80, W-80, H-120], radius=12, outline=INK, width=3, fill=(255,255,255))
    _text(d, (W/2, 220), data or title, font_v)


def draw_figure_png(spec: str) -> bytes:
    """按 spec 生成 PNG bytes(800x500)。"""
    kind, title, data = _title_parts(spec)
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    if kind == "bar":
        draw_bar(d, title, data)
    elif kind == "pie":
        draw_pie(d, title, data)
    elif kind == "flow":
        draw_flow(d, title, data)
    else:
        draw_box(d, title, data)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# 别名(与 svg_draw 接口一致)
def svg_draw_png(spec: str) -> dict:
    png = draw_figure_png(spec)
    return {"png_bytes": png, "len": len(png)}