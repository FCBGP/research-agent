"""Harness 层(hooks / settings / events / permissions)。

类似 Claude Code 的 harness:
- hooks:before_tool / after_tool 回调,按工具名/正则触发
- settings:配置文件(.claude/settings.json 或 settings.toml)控制权限与 hooks
- events:agent 生命周期事件(模型轮/工具调用/报告)
- permissions:允许/拒绝工具访问
"""

from __future__ import annotations

import json
import re
from pathlib import Path

SETTINGS_PATH = Path(".claude/settings.json")


def _settings() -> dict:
    if not SETTINGS_PATH.exists():
        return {}
    try:
        return json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


# ----------------------------------------------------------------
# Hooks
# ----------------------------------------------------------------


def _hooks_for(tool: str, stage: str) -> list[dict]:
    """按工具名/正则匹配当前阶段( before_tool / after_tool )的 hooks。"""
    s = _settings()
    hooks = s.get("hooks", {})
    matches = []
    for h in hooks.get(stage, []):
        if "tools" in h and tool in h["tools"]:
            matches.append(h)
        elif "pattern" in h:
            try:
                if re.search(h["pattern"], tool):
                    matches.append(h)
            except re.error:
                continue
    return matches


def run_before_tool(tool: str, args: dict) -> dict:
    """执行 before_tool hooks(可修改参数/拦截)。"""
    for h in _hooks_for(tool, "before_tool"):
        if h.get("command"):
            from . import tools as _t
            return {"hook": "before_tool", "command": h["command"],
                    "args": args, "message": f"before_tool hook for {tool}"}
    return {"args": args}


def run_after_tool(tool: str, args: dict, result: str) -> dict:
    """执行 after_tool hooks(记录结果)。"""
    fired = []
    for h in _hooks_for(tool, "after_tool"):
        fired.append({"hook": "after_tool", "command": h.get("command", ""), "tool": tool})
    return {"fired": fired, "result_preview": result[:200]}


# ----------------------------------------------------------------
# Permissions
# ----------------------------------------------------------------


def tool_allowed(tool: str) -> bool:
    """按 settings 判断工具是否允许。默认允许。"""
    s = _settings()
    deny = s.get("permissions", {}).get("deny", [])
    if tool in deny:
        return False
    allow = s.get("permissions", {}).get("allow", [])
    if allow and tool not in allow:
        return False
    return True


# ----------------------------------------------------------------
# Events
# ----------------------------------------------------------------


def emit(event: str, payload: dict) -> None:
    """发出 agent 生命周期事件(可转发到日志/SSE)。"""
    import json as _json
    _json.dumps({event: payload})  # 序列化校验
    # 可写入事件日志(非阻塞)
    log = Path("output/memory/events.log")
    log.parent.mkdir(parents=True, exist_ok=True)
    with open(log, "a", encoding="utf-8") as f:
        f.write(_json.dumps({"event": event, "payload": payload}, ensure_ascii=False) + "\n")


def install_harness() -> dict:
    """把 harness 注入 tools.run_tool(前置/后置 hooks + 权限)。"""
    from . import tools as _tools

    _orig = _tools.run_tool

    def wrapped(name: str, args: dict) -> str:
        if not tool_allowed(name):
            return json.dumps({"error": f"工具被权限拒绝: {name}"})
        pre = run_before_tool(name, args)
        result = _orig(name, pre.get("args", args))
        run_after_tool(name, args, result)
        emit("tool", {"tool": name, "result_preview": result[:120]})
        return result

    _tools.run_tool = wrapped
    return {"ok": True, "hooks_active": bool(_settings().get("hooks")),
            "settings_path": str(SETTINGS_PATH)}