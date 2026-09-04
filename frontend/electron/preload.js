const { contextBridge } = require("electron");

// 预加载:暴露后端 API 地址供渲染进程使用
contextBridge.exposeInMainWorld("agentAPI", {
  base: "http://127.0.0.1:8000",
});