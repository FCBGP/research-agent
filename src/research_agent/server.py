"""FastAPI 后端服务。

封装 research-agent:agent 循环 / debate / longdoc / worddoc / tools / 文件 /
pandoc 转 Word / Skill / MCP。SSE 流式推送 agent 事件。本机 localhost 服务,
供 Electron / Vue 前端调用。

启动: uv run research-agent --serve
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel

from . import config, memory, tools
from . import md2docx
from .loop import agent_events
from .debate import debate
from .longdoc import generate_longdoc
from .worddoc import generate_worddoc, append_figures_to_docx

app = FastAPI(title="Research Agent API")


# ----------------------------------------------------------------
# 请求模型
# ----------------------------------------------------------------


class AgentRequest(BaseModel):
    query: str
    max_turns: int | None = None
    session: str = "default"
    mode: str = "agent"  # agent | debate | longdoc | worddoc


class WordRequest(BaseModel):
    topic: str
    target_chars: int = 10000
    filename: str = "out.docx"
    outline: str = ""
    domain: str = ""
    max_sections: int = 120


class ToolRequest(BaseModel):
    tool: str
    args: dict = {}


class FileRequest(BaseModel):
    path: str


class DocConvertRequest(BaseModel):
    md_file: str
    out_file: str = "out.docx"
    reference_doc: str = ""


# ----------------------------------------------------------------
# 基础端点
# ----------------------------------------------------------------


@app.get("/config")
def get_config() -> dict:
    return {
        "model": config.MODEL,
        "base_url": config.BASE_URL,
        "api_key_masked": config.API_KEY[:3] + "***",
        "tools": list(tools.TOOLS.keys()),
        "agent_models": config.AGENT_MODELS,
    }


@app.get("/tools")
def list_tools() -> dict:
    return {"tools": list(tools.TOOLS.keys())}


@app.post("/tool/run")
def run_tool_endpoint(req: ToolRequest) -> dict:
    try:
        return {"result": tools.run_tool(req.tool, req.args)}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ----------------------------------------------------------------
# Agent 循环
# ----------------------------------------------------------------


@app.post("/agent/run")
def agent_run(req: AgentRequest) -> dict:
    """一次性任务(非流式)。"""
    if req.mode == "debate":
        return {"result": debate(req.query, session=req.session)}
    if req.mode == "longdoc":
        return generate_longdoc(req.query, target_chars=100000) if False else \
            {"result": "longdoc 请用 /doc/longdoc"}
    result = run_agent_sync(req)
    return {"result": result}


def run_agent_sync(req: AgentRequest) -> str:
    from .loop import run_agent
    return run_agent(req.query, max_turns=req.max_turns, session=req.session)


@app.post("/agent/stream")
def agent_stream(req: AgentRequest) -> StreamingResponse:
    """SSE 流式:逐事件推送 model/tool/result/final/report。"""
    def gen():
        for ev in agent_events(req.query, req.max_turns, req.session):
            yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
    return StreamingResponse(gen(), media_type="text/event-stream")


# ----------------------------------------------------------------
# Word / 长文档
# ----------------------------------------------------------------


@app.post("/doc/word")
def doc_word(req: WordRequest) -> dict:
    result = generate_worddoc(req.topic, req.target_chars, req.filename,
                              req.max_sections, req.outline, req.domain)
    return {"result": result, "message": "若需 pandoc 模板排版,再用 /doc/convert"}


@app.post("/doc/convert")
def doc_convert(req: DocConvertRequest) -> dict:
    return md2docx.md_file_to_docx(req.md_file, req.out_file, req.reference_doc)


@app.post("/doc/append_figures")
def doc_append_figures(req: FileRequest) -> dict:
    return append_figures_to_docx(req.path, 3)


# ----------------------------------------------------------------
# 文件访问代理
# ----------------------------------------------------------------


@app.get("/files")
def list_files(path: str = ".") -> dict:
    return {"entries": tools.list_dir(path, depth=2)}


@app.post("/file/read")
def read_file(req: FileRequest) -> dict:
    p = Path(req.path)
    if p.suffix.lower() == ".pdf":
        return tools.read_pdf(req.path)
    return tools.read_file(req.path)


# ----------------------------------------------------------------
# 启动
# ----------------------------------------------------------------


def serve(host: str = "127.0.0.1", port: int = 8000) -> None:
    import uvicorn
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    serve()