"""Skill 加载器。

从 `skills/` 目录加载 Markdown/JSON 技能,注册为系统提示片段或工具。
每个技能 = 一个 .md 或 .json 文件(名称、描述、指令)。

类似 Claude Code 的 skills:skills 目录下的技能可被 agent 调用/遵循。
"""

from __future__ import annotations

import json
from pathlib import Path

SKILLS_DIR = Path("skills")


def _load_markdown(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    # 提取 frontmatter 或首行标题
    name = path.stem
    desc = ""
    if text.startswith("---"):
        import re
        m = re.search(r"^---\s*\n(.*?)\n---", text, flags=re.S)
        if m:
            fm = m.group(1)
            name = re.search(r"name:\s*(\S+)", fm).group(1) if re.search(r"name:\s*(\S+)", fm) else path.stem
            desc = re.search(r"description:\s*(.+)", fm).group(1) if re.search(r"description:\s*(.+)", fm) else ""
            text = text[m.end():]
    return {"name": name, "description": desc or "", "instructions": text[:4000]}


def _load_json(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    return {
        "name": data.get("name", path.stem),
        "description": data.get("description", ""),
        "instructions": json.dumps(data.get("instructions", data), ensure_ascii=False)[:4000],
    }


def load_skills() -> list[dict]:
    """扫描 skills/ 目录,返回技能列表。"""
    skills = []
    if not SKILLS_DIR.exists():
        return skills
    for p in sorted(SKILLS_DIR.glob("*")):
        if p.suffix.lower() == ".md":
            skills.append(_load_markdown(p))
        elif p.suffix.lower() == ".json":
            skills.append(_load_json(p))
    return skills


def skills_prompt() -> str:
    """把技能合并成系统提示片段(供 agent 遵循)。"""
    skills = load_skills()
    if not skills:
        return ""
    lines = []
    for s in skills:
        lines.append(f"### 技能:{s['name']}\n描述:{s['description']}\n指令:\n{s['instructions']}")
    return "\n\n".join(lines)


def install_skills() -> dict:
    """把技能指令注册进 SYSTEM_PROMPT(通过 config 拼接)。"""
    return {"skills": load_skills(), "prompt": skills_prompt()}