"""外部记忆层(External Memory)。

科研智能体的知识库可以无限增长(论文/笔记/事实/实验),
但工作上下文(Working Context)必须有界。本模块用 SQLite 持久化
长期记忆,提供检索(top-K)回填工作上下文。上下文窗口是"工作台",
不是"数据库"。

表:
- papers   已检索的论文(标题/作者/摘要/链接)
- notes    研究笔记(按主题)
- facts    提取的事实/结论(检索用)
- summary  每步的 Checkpoint 摘要(跨会话恢复)
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path

DB_PATH = Path("output/memory/research.db")


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _init(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS papers(
            id INTEGER PRIMARY KEY,
            title TEXT, authors TEXT, abstract TEXT, url TEXT,
            findings TEXT,
            added_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS notes(
            id INTEGER PRIMARY KEY,
            topic TEXT, title TEXT, content TEXT,
            added_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS facts(
            id INTEGER PRIMARY KEY,
            fact TEXT, source TEXT,
            added_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS summary(
            id INTEGER PRIMARY KEY,
            session TEXT, summary TEXT,
            added_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    conn.commit()
    # 迁移:旧库 papers 表补 findings 列(已存在则跳过)
    try:
        conn.execute("ALTER TABLE papers ADD COLUMN findings TEXT")
        conn.commit()
    except Exception:
        pass


# ----------------------------------------------------------------
# 论文(papers)
# ----------------------------------------------------------------


def save_papers(papers: list[dict]) -> int:
    """把学术搜索结果存进外部记忆,返回新增条数。

    每条论文同时存一条「要点」(findings,默认取标题),让检索证据更丰富。
    """
    conn = _conn()
    _init(conn)
    added = 0
    for p in papers:
        url = p.get("url", "")
        title = p.get("title", "")
        findings = p.get("findings", "") or title
        conn.execute(
            "INSERT OR IGNORE INTO papers(title, authors, abstract, url, findings) VALUES (?,?,?,?,?)",
            (title, p.get("authors", ""), p.get("abstract", ""), url, findings),
        )
        if conn.total_changes:
            added += 1
    conn.commit()
    conn.close()
    return added


def recall_papers(query: str, k: int = 3) -> list[dict]:
    """按关键词从外部记忆检索论文(相关度优先 + 最近优先)。

    标题命中分最高,摘要/要点其次,作者再次;同分保持最近优先。
    返回含摘要切片(abstract_slice)与要点(findings),让证据更丰富。
    """
    conn = _conn()
    _init(conn)
    q = f"%{query}%"
    rows = conn.execute(
        """
        SELECT title, authors, abstract, url, findings FROM papers
        WHERE title LIKE ? OR abstract LIKE ? OR authors LIKE ?
        ORDER BY added_at DESC
        """,
        (q, q, q),
    ).fetchall()
    conn.close()
    ql = query.lower()
    scored = []
    for r in rows:
        d = dict(r)
        title = d.get("title", "") or ""
        abstract = d.get("abstract", "") or ""
        authors = d.get("authors", "") or ""
        findings = d.get("findings", "") or ""
        score = 0
        if ql in title.lower():
            score += 3
        if ql in abstract.lower():
            score += 2
        if ql in findings.lower():
            score += 2
        if ql in authors.lower():
            score += 1
        scored.append((score, d))
    scored.sort(key=lambda x: x[0], reverse=True)  # 稳定排序:同分保持最近优先
    out = [d for _, d in scored[:k]]
    for d in out:
        if d.get("abstract"):
            d["abstract_slice"] = d["abstract"][:400]
    return out


# ----------------------------------------------------------------
# 笔记(notes)
# ----------------------------------------------------------------


def save_note(topic: str, title: str, content: str) -> dict:
    """保存一条研究笔记。"""
    conn = _conn()
    _init(conn)
    conn.execute(
        "INSERT INTO notes(topic, title, content) VALUES (?,?,?)",
        (topic, title, content),
    )
    conn.commit()
    conn.close()
    return {"topic": topic, "title": title, "ok": True}


def read_notes(topic: str = "", k: int = 5) -> list[dict]:
    """读取笔记列表;按主题过滤则取最近 k 条。"""
    conn = _conn()
    _init(conn)
    if topic:
        rows = conn.execute(
            "SELECT topic, title, content FROM notes WHERE topic=? ORDER BY added_at DESC LIMIT ?",
            (topic, k),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT topic, title, content FROM notes ORDER BY added_at DESC LIMIT ?",
            (k,),
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ----------------------------------------------------------------
# 事实/结论(facts)
# ----------------------------------------------------------------


def save_fact(fact: str, source: str = "") -> dict:
    """保存一条可检索的事实/结论。"""
    conn = _conn()
    _init(conn)
    conn.execute("INSERT INTO facts(fact, source) VALUES (?,?)", (fact, source))
    conn.commit()
    conn.close()
    return {"fact": fact, "ok": True}


def recall_facts(query: str, k: int = 3) -> list[dict]:
    """按关键词检索事实(相关度优先 + 最近优先)。"""
    conn = _conn()
    _init(conn)
    q = f"%{query}%"
    rows = conn.execute(
        "SELECT fact, source FROM facts WHERE fact LIKE ? OR source LIKE ? ORDER BY added_at DESC",
        (q, q),
    ).fetchall()
    conn.close()
    ql = query.lower()
    scored = []
    for r in rows:
        d = dict(r)
        fact = d.get("fact", "") or ""
        source = d.get("source", "") or ""
        score = 3 if ql in fact.lower() else (1 if ql in source.lower() else 0)
        scored.append((score, d))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [d for _, d in scored[:k]]


# ----------------------------------------------------------------
# Checkpoint 摘要(summary)
# ----------------------------------------------------------------


def checkpoint(session: str, summary: str) -> dict:
    """保存当前研究进度摘要(跨会话恢复)。"""
    conn = _conn()
    _init(conn)
    conn.execute(
        "INSERT INTO summary(session, summary) VALUES (?,?)", (session, summary)
    )
    conn.commit()
    conn.close()
    return {"session": session, "ok": True}


def resume(session: str) -> str:
    """恢复最近一次会话摘要。"""
    conn = _conn()
    _init(conn)
    row = conn.execute(
        "SELECT summary FROM summary WHERE session=? ORDER BY added_at DESC LIMIT 1",
        (session,),
    ).fetchone()
    conn.close()
    return row["summary"] if row else ""


# ----------------------------------------------------------------
# 工具接口(tools.py 注册用)
# ----------------------------------------------------------------


def memory_tools() -> dict:
    """返回可在 agentic 循环中注册的记忆工具。"""
    return {
        "save_note": save_note,
        "read_notes": read_notes,
        "recall_facts": recall_facts,
        "checkpoint": checkpoint,
        "resume": resume,
    }