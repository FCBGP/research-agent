# Research Agent 图形界面(GUI)

同一套 Vue3 源码,支持 **Electron 桌面版** 与 **浏览器版**,共用同一个
Python FastAPI 后端(localhost)。

## 后端

```bash
# 在本项目目录启动后端
uv run research-agent --serve --host 127.0.0.1 --port 8000
```

后端暴露:
- `POST /agent/stream`(SSE 流式聊天)、`POST /agent/run`
- `GET /tools`、`POST /tool/run`
- `GET /files`、`POST /file/read`
- `POST /doc/word`(Word 长文档)、`POST /doc/convert`(pandoc)
- `GET /skills`、`POST /mcp/register`、`GET /mcp/tools`

## 前端

```bash
cd frontend
npm install          # 首次
npm run dev          # 浏览器版(打开 http://localhost:5173)
npm run electron     # 桌面版(需 npm install electron)
```

## 视图
- 聊天:输入研究问题,SSE 实时显示模型/工具/结果/报告。
- 工具:列出/调用工具。
- 文件:浏览目录、读取文件(经后端代理)。
- 文档:生成 Word 长文档(pandoc 模板可后转换)。
- 设置:模型/后端配置、技能、MCP 工具。

## Skill / MCP / 自定义
- 技能:放 `skills/*.md` 或 `*.json`,后端自动加载进 agent 系统提示。
- MCP:设环境变量 `MCP_SERVERS=server1,server2`(HTTP JSON-RPC),后端注册远端工具。
- 自定义工具:在 `tools.py` 注册表加函数 + schema。