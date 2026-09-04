"""MCP 客户端(轻量)。

连接 MCP 服务器,把远端工具以工具 schema 暴露进 agent 循环。
默认走 HTTP JSON-RPC(MCP server 暴露 /tools 与 /call)。配置经 MCP_SERVERS。

支持:list_tools(server)、call_tool(server, tool, args)、
注册远端工具进 TOOLS 注册表。
"""

from __future__ import annotations

import json
import os
import urllib.request

from . import config


def _servers() -> list[str]:
    raw = os.getenv("MCP_SERVERS", "")
    return [s.strip() for s in raw.split(",") if s.strip()]


def _rpc(base: str, method: str, params: dict) -> dict:
    """调用 MCP 服务器的 JSON-RPC 方法。"""
    payload = json.dumps({"jsonrpc": "2.0", "method": method, "params": params}).encode()
    req = urllib.request.Request(f"{base.rstrip('/')}/rpc", data=payload,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)


def list_remote_tools(server: str) -> list[dict]:
    """列出 MCP 服务器的可用工具(OpenAI 风格 schema)。"""
    try:
        data = _rpc(server, "tools/list", {})
        return data.get("result", {}).get("tools", [])
    except Exception:
        return []


def call_remote_tool(server: str, tool_name: str, args: dict) -> str:
    """调用 MCP 服务器上的工具,返回文本结果。"""
    try:
        data = _rpc(server, "tools/call", {"name": tool_name, "arguments": args})
        content = data.get("result", {}).get("content", [])
        if isinstance(content, list):
            return "\n".join(c.get("text", "") for c in content)
        return str(content)
    except Exception as exc:
        return json.dumps({"error": f"MCP 调用失败: {exc}"})


def register_mcp_tools() -> dict:
    """把 MCP 服务器工具注册进 tools.TOOLS 与 schema。"""
    from . import tools as _tools

    registered = []
    for srv in _servers():
        for t in list_remote_tools(srv):
            name = t.get("name", "")
            if not name or name in _tools.TOOLS:
                continue
            _tools.TOOLS[name] = _make_handler(srv, name)
            registered.append({"server": srv, "tool": name})
    return {"registered": registered}


def _make_handler(server: str, name: str):
    def handler(**kwargs):
        return call_remote_tool(server, name, kwargs)
    return handler