"""MCP 客户端(官方 SDK, stdio 传输)。

用官方 MCP Python SDK 连接 MCP 服务器(stdio transport),列出工具、
调用工具,并把远端工具注册进 agent 的 TOOLS 注册表与 schema。

配置:环境变量 MCP_SERVERS 可传 "命令|参数1|参数2" 列表(逗号分隔),
每个服务器 = 一条启动命令。
"""

from __future__ import annotations

import asyncio
import json
import os
import subprocess

from . import config, tools

# 官方 SDK
from mcp import ClientSession, StdioServerParameters, stdio_client


def _servers() -> list[str]:
    raw = os.getenv("MCP_SERVERS", "")
    return [s.strip() for s in raw.split(",") if s.strip()]


def _stdio_params(server: str) -> StdioServerParameters:
    """把 "命令|arg1|arg2" 拆成 StdioServerParameters。"""
    parts = server.split("|")
    command = parts[0].strip()
    args = parts[1:]
    return StdioServerParameters(command=command, args=args)


async def _session_for(server: str) -> tuple[ClientSession, object]:
    """启动 stdio MCP 服务器进程,返回 (session, 进程)。"""
    params = _stdio_params(server)
    client = stdio_client(params)
    return client


def _run(coro):
    """在同步上下文跑 async 协程。"""
    try:
        return asyncio.run(coro)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(coro)
        finally:
            loop.close()


async def _list_tools_async(server: str) -> list[dict]:
    async with _session_for(server) as (read, write):
        async with ClientSession(read, write) as sess:
            res = await sess.list_tools()
            return [t.model_dump() for t in res.tools]


def list_remote_tools(server: str) -> list[dict]:
    """列出 MCP 服务器的工具(OpenAI 风格 schema 转写)。"""
    try:
        tools_data = _run(_list_tools_async(server))
        out = []
        for t in tools_data:
            name = t.get("name", "")
            desc = t.get("description", "") or ""
            schema = t.get("inputSchema", {}) or {}
            out.append({
                "name": name,
                "description": desc,
                "inputSchema": schema,
            })
        return out
    except Exception as exc:
        return []


async def _call_tool_async(server: str, tool_name: str, args: dict) -> str:
    async with _session_for(server) as (read, write):
        async with ClientSession(read, write) as sess:
            res = await sess.call_tool(tool_name, arguments=args)
            if res.isError:
                return json.dumps({"error": f"MCP 工具错误: {tool_name}"})
            # 提取文本内容
            parts = res.content
            if isinstance(parts, list):
                return "\n".join(p.get("text", "") for p in parts if isinstance(p, dict))
            return str(parts)


def call_remote_tool(server: str, tool_name: str, args: dict) -> str:
    """调用 MCP 服务器工具(经官方 SDK)。"""
    try:
        return _run(_call_tool_async(server, tool_name, args))
    except Exception as exc:
        return json.dumps({"error": f"MCP 调用失败: {exc}"})


def register_mcp_tools() -> dict:
    """把 MCP 服务器工具注册进 tools.TOOLS 与 schema。"""
    registered = []
    for srv in _servers():
        for t in list_remote_tools(srv):
            name = t.get("name", "")
            if not name or name in tools.TOOLS:
                continue
            tools.TOOLS[name] = _make_handler(srv, name)
            # 追加 OpenAI 风格 schema 供原生工具调用
            schema = t.get("inputSchema", {})
            tools_tool_schema = {
                "type": "function",
                "function": {
                    "name": name,
                    "description": t.get("description", "") or f"MCP 工具: {name}",
                    "parameters": schema or {"type": "object", "properties": {}},
                },
            }
            # 注入到 schema 列表(通过 tool_schemas 动态)
            _schemas_extra.append(tools_tool_schema)
            registered.append({"server": srv, "tool": name})
    return {"registered": registered}


_schemas_extra: list[dict] = []


def extra_tool_schemas() -> list[dict]:
    """返回 MCP 注册的额外工具 schema(供原生 tools 参数)。"""
    return _schemas_extra


def _make_handler(server: str, name: str):
    def handler(**kwargs):
        return call_remote_tool(server, name, kwargs)
    return handler