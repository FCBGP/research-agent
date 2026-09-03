"""科研智能体工具集合。

每个工具 = 一个可调用的 Python 函数 + 一份 OpenAI 工具 schema(供模型选择)。
工具注册表让 agentic 循环可以通用地执行模型请求的工具调用。
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Callable

# ----------------------------------------------------------------
# Web 搜索与网页读取
# ----------------------------------------------------------------


def web_search(query: str, max_results: int = 5) -> dict:
    """网络搜索,返回标题/链接/摘要列表。"""
    from ddgs import DDGS

    results: list[dict[str, Any]] = []
    try:
        for r in DDGS().text(query, max_results=max_results):
            results.append({
                "title": r.get("title", ""),
                "url": r.get("href", ""),
                "snippet": r.get("snippet", ""),
            })
    except Exception as exc:  # 网络或解析失败
        return {"error": f"搜索失败: {exc}", "results": []}
    return {"query": query, "results": results}


def web_fetch(url: str, max_chars: int = 6000) -> dict:
    """抓取网页内容并转为纯文本。

    稳健性:首次失败自动重试一次(换稍长超时),仍失败则返回友好错误。
    """
    for attempt in (1, 2):
        try:
            import primp

            resp = primp.get(url, timeout=20.0 if attempt == 1 else 40.0)
            text = resp.text
            # 粗略去标签,保留可读文本
            text = re.sub(r"<script[\s\S]*?</script>", " ", text, flags=re.I)
            text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
            text = re.sub(r"<[^>]+>", " ", text)
            text = re.sub(r"\s+", " ", text).strip()
        except Exception as exc:
            if attempt == 1:
                continue  # 重试一次
            return {"error": f"抓取失败(已重试): {exc}"}
        break
    if len(text) > max_chars:
        text = text[:max_chars] + "\n[已截断]"
    return {"url": url, "text": text}


# ----------------------------------------------------------------
# 学术数据源
# ----------------------------------------------------------------


def arxiv_search(query: str, max_results: int = 5) -> dict:
    """arXiv 学术搜索,返回 标题/作者/摘要/链接。"""
    import re as _re
    import xml.etree.ElementTree as ET

    try:
        import primp
        url = f"https://export.arxiv.org/api/query?search_query={query}&max_results={max_results}"
        resp = primp.get(url, timeout=20.0)
        text = resp.text
        ns = {"a": "http://www.w3.org/2005/Atom"}
        root = ET.fromstring(text)
        results = []
        for entry in root.findall("a:entry", ns):
            title = (entry.findtext("a:title", default="", namespaces=ns) or "").strip()
            authors = (entry.findtext("a:author/a:name", default="", namespaces=ns) or "").strip()
            abstract = (entry.findtext("a:summary", default="", namespaces=ns) or "").strip()
            link = entry.find("a:link[@rel='alternate']", ns)
            url_ = link.get("href", "") if link is not None else ""
            results.append({"title": title, "authors": authors, "abstract": abstract, "url": url_})
    except Exception as exc:
        return {"error": f"arXiv 搜索失败: {exc}", "results": []}
    return {"query": query, "results": results[:max_results]}


def scholar_search(query: str, max_results: int = 5) -> dict:
    """Semantic Scholar 学术搜索,返回 标题/作者/摘要/链接。"""
    import json

    try:
        import primp
        url = (
            "https://api.semanticscholar.org/graph/v1/paper/search"
            f"?query={query}&limit={max_results}"
            "&fields=title,authors,abstract,year,url,openAccessPdf"
        )
        resp = primp.get(url, timeout=20.0)
        data = json.loads(resp.text)
        results = []
        for p in data.get("data", []):
            authors = ", ".join(a.get("name", "") for a in p.get("authors", []) or [])
            pdf = p.get("openAccessPdf")
            url_ = p.get("url", "") or (pdf.get("url", "") if pdf else "")
            results.append({
                "title": p.get("title", ""),
                "authors": authors,
                "abstract": p.get("abstract", ""),
                "url": url_,
                "year": p.get("year", ""),
            })
    except Exception as exc:
        return {"error": f"学术搜索失败: {exc}", "results": []}
    return {"query": query, "results": results[:max_results]}


# ----------------------------------------------------------------
# 本地文件与 PDF
# ----------------------------------------------------------------


def read_file(path: str, max_chars: int = 8000) -> dict:
    """读取本地文本文件(按编码自动识别)。"""
    p = Path(path)
    if not p.exists():
        return {"error": f"文件不存在: {path}"}
    try:
        data = p.read_bytes()
        # 尝试常见编码
        for enc in ("utf-8", "gbk", "latin-1"):
            try:
                text = data.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        else:
            return {"error": f"无法识别编码: {path}"}
    except OSError as exc:
        return {"error": f"读取失败: {exc}"}
    if len(text) > max_chars:
        text = text[:max_chars] + "\n[已截断]"
    return {"path": str(p), "text": text}


def read_pdf(path: str, max_chars: int = 8000) -> dict:
    """从 PDF 提取文本。"""
    from pypdf import PdfReader

    p = Path(path)
    if not p.exists():
        return {"error": f"文件不存在: {path}"}
    try:
        reader = PdfReader(str(p))
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception as exc:
        return {"error": f"PDF 读取失败: {exc}"}
    if len(text) > max_chars:
        text = text[:max_chars] + "\n[已截断]"
    return {"path": str(p), "text": text}


# ----------------------------------------------------------------
# 代码库浏览与搜索
# ----------------------------------------------------------------


def list_dir(path: str = ".", depth: int = 2) -> dict:
    """列出目录内容(顶层文件与子目录)。"""
    p = Path(path)
    if not p.exists() or not p.is_dir():
        return {"error": f"目录不存在: {path}"}
    try:
        entries = []
        for root, dirs, files in os.walk(p):
            rel = os.path.relpath(root, p)
            level = rel.count(os.sep)
            if level > depth - 1:
                dirs[:] = []  # 不再深入
            for name in dirs:
                entries.append(f"{'  ' * level}dir  {name}")
            for name in files:
                entries.append(f"{'  ' * level}file {name}")
    except OSError as exc:
        return {"error": f"列目录失败: {exc}"}
    return {"path": str(p), "entries": entries[:400]}


def grep(pattern: str, path: str = ".", max_results: int = 50) -> dict:
    """在文本文件中搜索正则表达式,返回 文件:行号:内容。"""
    p = Path(path)
    if not p.exists():
        return {"error": f"路径不存在: {path}"}
    compiled = None
    try:
        compiled = re.compile(pattern)
    except re.error as exc:
        return {"error": f"正则无效: {exc}"}
    hits: list[str] = []
    try:
        for root, dirs, files in os.walk(p):
            dirs[:] = [d for d in dirs if d not in (".git", ".venv", "node_modules")]
            for name in files:
                if not name.endswith((".py", ".txt", ".md", ".toml", ".json", ".yml", ".yaml")):
                    continue
                fpath = os.path.join(root, name)
                try:
                    for i, line in enumerate(open(fpath, "rb", errors="ignore"), 1):
                        line = line.decode("utf-8", errors="ignore").rstrip("\n")
                        if compiled.search(line):
                            hits.append(f"{fpath}:{i}: {line}")
                            if len(hits) >= max_results:
                                return {"pattern": pattern, "hits": hits, "truncated": True}
                except OSError:
                    continue
    except OSError as exc:
        return {"error": f"搜索失败: {exc}"}
    return {"pattern": pattern, "hits": hits}


# ----------------------------------------------------------------
# 报告生成
# ----------------------------------------------------------------


def write_report(content: str, filename: str = "research_report.md") -> dict:
    """将研究成果写入 Markdown 报告文件。"""
    from datetime import datetime

    p = Path(filename)
    header = f"# 研究报告\n\n> 生成时间: {datetime.now().isoformat(timespec='seconds')}\n"
    try:
        p.write_text(header + "\n" + content, encoding="utf-8")
    except OSError as exc:
        return {"error": f"写入失败: {exc}"}
    return {"filename": str(p), "wrote": len(content), "ok": True}


# ----------------------------------------------------------------
# 外部记忆工具(由 memory.py 提供)
# ----------------------------------------------------------------


def save_note(topic: str, title: str, content: str) -> dict:
    """保存研究笔记到外部记忆。"""
    from .memory import save_note as _save
    return _save(topic, title, content)


def read_notes(topic: str = "", k: int = 5) -> dict:
    """读取外部记忆中的笔记。"""
    from .memory import read_notes as _read
    return {"notes": _read(topic, k)}


def recall_facts(query: str, k: int = 3) -> dict:
    """从外部记忆检索事实/结论。"""
    from .memory import recall_facts as _recall
    return {"facts": _recall(query, k)}


# ----------------------------------------------------------------
# 工具注册表
# ----------------------------------------------------------------


TOOLS: dict[str, Callable] = {
    "web_search": web_search,
    "web_fetch": web_fetch,
    "arxiv_search": arxiv_search,
    "scholar_search": scholar_search,
    "read_file": read_file,
    "read_pdf": read_pdf,
    "list_dir": list_dir,
    "grep": grep,
    "write_report": write_report,
    "save_note": save_note,
    "read_notes": read_notes,
    "recall_facts": recall_facts,
}


def tool_schemas() -> list[dict]:
    """OpenAI 格式的工具 schema 列表,供 chat 接口使用。"""
    return [
        {
            "type": "function",
            "function": {
                "name": "web_search",
                "description": "联网搜索,返回标题/链接/摘要列表。用于查找资料。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "搜索关键词"},
                        "max_results": {"type": "integer", "description": "结果数(默认5)"},
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "web_fetch",
                "description": "抓取网页内容并转为纯文本。用于阅读指定链接。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": {"type": "string", "description": "要抓取的 URL"},
                        "max_chars": {"type": "integer", "description": "截断长度(默认6000)"},
                    },
                    "required": ["url"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "arxiv_search",
                "description": "arXiv 学术搜索,返回论文标题/作者/摘要/链接。用于找论文。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "关键词/论文主题"},
                        "max_results": {"type": "integer", "description": "结果数(默认5)"},
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "scholar_search",
                "description": "Semantic Scholar 学术搜索,返回论文标题/作者/摘要/链接。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "关键词"},
                        "max_results": {"type": "integer", "description": "结果数(默认5)"},
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "读取本地文本文件内容(按编码自动识别)。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "文件路径"},
                        "max_chars": {"type": "integer", "description": "截断长度(默认8000)"},
                    },
                    "required": ["path"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "read_pdf",
                "description": "从 PDF 文件提取文本。用于阅读论文/报告。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "PDF 路径"},
                        "max_chars": {"type": "integer", "description": "截断长度(默认8000)"},
                    },
                    "required": ["path"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "list_dir",
                "description": "列出目录内容。用于浏览文件结构。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "目录路径(默认当前目录)"},
                        "depth": {"type": "integer", "description": "遍历深度(默认2)"},
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "grep",
                "description": "在文本文件中搜索正则表达式,返回 文件:行号:内容。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "pattern": {"type": "string", "description": "正则表达式"},
                        "path": {"type": "string", "description": "搜索路径(默认当前目录)"},
                        "max_results": {"type": "integer", "description": "最多结果(默认50)"},
                    },
                    "required": ["pattern"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "write_report",
                "description": "将研究成果写入 Markdown 报告文件。研究结束前调用此工具保存报告。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "content": {"type": "string", "description": "报告正文(Markdown)"},
                        "filename": {"type": "string", "description": "文件名(默认 research_report.md)"},
                    },
                    "required": ["content"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "save_note",
                "description": "保存研究笔记到外部记忆(SQLite),跨会话可检索。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "topic": {"type": "string", "description": "主题/分类"},
                        "title": {"type": "string", "description": "笔记标题"},
                        "content": {"type": "string", "description": "笔记内容"},
                    },
                    "required": ["topic", "title", "content"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "read_notes",
                "description": "读取外部记忆中的研究笔记。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "topic": {"type": "string", "description": "按主题过滤(默认全部)"},
                        "k": {"type": "integer", "description": "最近 k 条(默认5)"},
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "recall_facts",
                "description": "从外部记忆检索已保存的事实/结论。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "检索关键词"},
                        "k": {"type": "integer", "description": "结果数(默认3)"},
                    },
                    "required": ["query"],
                },
            },
        },
    ]


def run_tool(name: str, args: dict) -> str:
    """执行工具调用,结果转为 JSON 字符串返回给模型。"""
    func = TOOLS.get(name)
    if func is None:
        return json.dumps({"error": f"未知工具: {name}"})
    try:
        result = func(**args)
    except TypeError as exc:
        return json.dumps({"error": f"参数错误: {exc}"})
    except Exception as exc:
        return json.dumps({"error": f"执行失败: {exc}"})
    # 截断大结果,避免撑爆上下文
    payload = json.dumps(result, ensure_ascii=False)
    if len(payload) > 4000:
        return payload[:4000] + "\n[已截断]"
    return payload


# ----------------------------------------------------------------
# 会话助手:控制上下文大小
# ----------------------------------------------------------------


def truncate_messages(messages: list[dict], max_chars: int) -> list[dict]:
    """裁剪消息数组,保留首条 system 与最近的若干轮,防止上下文超限。"""
    if sum(len(m.get("content", "")) for m in messages) <= max_chars:
        return messages
    keep_system = [m for m in messages if m.get("role") == "system"]
    keep_tail: list[dict] = []
    budget = max_chars - sum(len(m.get("content", "")) for m in keep_system)
    for m in reversed(messages):
        if m.get("role") == "system":
            continue
        mlen = len(m.get("content", ""))
        if mlen > budget:
            # 该消息是截断边界,保留其前缀提示
            keep_tail.insert(0, {
                "role": m.get("role"),
                "content": m.get("content", "")[:1500] + "\n[历史已截断]",
            })
            budget = 0
        else:
            keep_tail.insert(0, m)
            budget -= mlen
        if budget <= 0:
            break
    return keep_system + keep_tail