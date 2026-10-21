window.__ModuleLoader__.load({
	id: "@basil/dsh-research",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);

// client/definition.ts
var TRIZ_EXPLAINER_KIND = "triz-explainer";
var TRIZ_EXPLAINER_ID = "@basil/dsh-research-triz-explainer";
var TRIZ_EXPLAINER_ADDRESS = "dsh-resource://triz-explainer/**";
function trizExplainerGuide() {
  return [{
    id: "triz-explainer",
    order: 1,
    title: () => "TRIZ \u53D1\u660E\u539F\u7406",
    description: () => "\u67E5\u770B\u672C\u6B21\u7814\u7A76\u7ED3\u679C\u7528\u5230\u7684 TRIZ\uFF08\u53D1\u660E\u95EE\u9898\u89E3\u51B3\u7406\u8BBA\uFF09\u53D1\u660E\u539F\u7406\u4E0E\u63A8\u7406\u94FE\u3002"
  }];
}
function trizExplainerDefinition() {
  return {
    id: TRIZ_EXPLAINER_ID,
    kind: TRIZ_EXPLAINER_KIND,
    patterns: [TRIZ_EXPLAINER_ADDRESS],
    priority: "extension",
    // 打开后保持挂载：会话切换/隐藏后不销毁，用户再次打开右侧栏立即可见。
    keepMounted: true,
    title: () => "TRIZ \u53D1\u660E\u539F\u7406",
    guide: trizExplainerGuide()
  };
}

// client/TrizTab.tsx
var import_react = require("react");

// client/route.ts
var TRIZ_NOTES_PATH = "/api/research.triz.notes";
var TRIZ_NOTES_ROUTE = TRIZ_NOTES_PATH.slice(1);
function trizNotesUrl(sessionId) {
  if (!sessionId) return TRIZ_NOTES_ROUTE;
  return `${TRIZ_NOTES_ROUTE}?${new URLSearchParams({ sessionId }).toString()}`;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isPrincipleView(value) {
  return isRecord(value) && typeof value.no === "number" && Number.isInteger(value.no) && typeof value.name === "string" && typeof value.summary === "string" && typeof value.routingHint === "string";
}
function parseTrizNotes(value) {
  if (!isRecord(value) || !Array.isArray(value.notes)) return [];
  const notes = [];
  for (const item of value.notes) {
    if (!isRecord(item)) continue;
    const { artifactId, title, problem, source, hypotheses, contradictionOrigin } = item;
    if (typeof artifactId !== "string" || typeof title !== "string" || typeof source !== "string") continue;
    const candidates = Array.isArray(item.candidates) ? item.candidates.filter(isPrincipleView) : [];
    const lines = Array.isArray(hypotheses) ? hypotheses.filter((h) => typeof h === "string") : [];
    const step = typeof item.step === "number" && Number.isInteger(item.step) ? item.step : void 0;
    const fin = typeof item.final === "boolean" ? item.final : void 0;
    notes.push({
      artifactId,
      title,
      problem: typeof problem === "string" && problem.length > 0 ? problem : title,
      source,
      contradictionOrigin: typeof contradictionOrigin === "string" ? contradictionOrigin : "default",
      candidates,
      hypotheses: lines,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
      step,
      final: fin
    });
  }
  return notes;
}
var SOURCE_LABEL = {
  "curated-matrix": "\u547D\u4E2D\u7CBE\u9009\u77DB\u76FE\u77E9\u9635",
  "heuristic-fallback": "\u542F\u53D1\u5F0F\u515C\u5E95",
  "unresolved": "\u53C2\u6570\u672A\u89E3\u6790"
};
var CONTRADICTION_ORIGIN_LABEL = {
  "tool": "\u663E\u5F0F\u77DB\u76FE\u53C2\u6570",
  "extracted": "\u6587\u672C\u89C4\u5219\u63D0\u53D6",
  "default": "\u9ED8\u8BA4\uFF08\u68C0\u6D4B\u2194\u590D\u6742\u5EA6\uFF09"
};

// client/TrizTab.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var styles = {
  root: {
    boxSizing: "border-box",
    width: "100%",
    minWidth: 0,
    // 滚动修复：host 的 tabBody 是 height:100% + overflow:hidden 的 flex 容器，
    // 本根节点必须 flex:1 + minHeight:0 才能收缩，overflowY:auto 提供滚动（2026-10-21 用户反馈 TRIZ 面板不可滚动）。
    flex: "1 1 auto",
    minHeight: 0,
    overflowY: "auto",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    fontFamily: "var(--ds-font-family, system-ui, sans-serif)",
    color: "var(--dsw-alias-label-primary, #20242c)",
    fontSize: "12px",
    lineHeight: "1.5"
  },
  header: {
    fontSize: "13px",
    fontWeight: 600,
    margin: 0
  },
  hint: {
    color: "var(--dsw-alias-label-tertiary, #6b7280)",
    fontSize: "11px",
    margin: 0
  },
  card: {
    border: "0.5px solid var(--dsw-alias-border-l2, #e5e7eb)",
    borderRadius: "10px",
    padding: "10px 12px",
    background: "var(--dsw-alias-bg-layer-1, #ffffff)",
    display: "flex",
    flexDirection: "column",
    gap: "8px"
  },
  cardTitle: {
    fontWeight: 600,
    margin: 0,
    fontSize: "12px",
    lineHeight: "1.4"
  },
  badge: {
    display: "inline-flex",
    alignSelf: "flex-start",
    borderRadius: "999px",
    padding: "1px 8px",
    fontSize: "10px",
    fontWeight: 500,
    background: "var(--dsw-alias-interactive-bg-subtle, #eef2ff)",
    color: "var(--dsw-alias-state-business-primary, #4f46e5)"
  },
  originLine: {
    margin: 0,
    fontSize: "10px",
    color: "var(--dsw-alias-label-tertiary, #6b7280)"
  },
  principle: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    padding: "6px 8px",
    borderRadius: "8px",
    background: "color-mix(in srgb, var(--dsw-static-neutral-00, #fff) 55%, transparent)"
  },
  principleHead: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontWeight: 600,
    fontSize: "11px"
  },
  principleNo: {
    flex: "none",
    minWidth: "18px",
    height: "18px",
    lineHeight: "18px",
    textAlign: "center",
    borderRadius: "6px",
    background: "var(--dsw-alias-state-business-primary, #4f46e5)",
    color: "#fff",
    fontSize: "10px"
  },
  summary: { margin: 0, color: "var(--dsw-alias-label-secondary, #4b5563)" },
  hintLine: { margin: 0, fontSize: "11px", color: "var(--dsw-alias-label-tertiary, #6b7280)" },
  ul: { margin: 0, paddingLeft: "16px", display: "flex", flexDirection: "column", gap: "4px" },
  empty: { color: "var(--dsw-alias-label-tertiary, #6b7280)", fontSize: "11px", margin: 0 },
  errored: { color: "var(--dsw-alias-state-error-primary, #dc2626)", fontSize: "11px", margin: 0 }
};
function sourceText(source) {
  return SOURCE_LABEL[source] ?? source;
}
function TrizNoteCard({ note }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { style: styles.card, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { style: styles.cardTitle, children: note.problem }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: styles.badge, children: sourceText(note.source) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: styles.originLine, children: [
      "\u77DB\u76FE\u6765\u6E90\uFF1A",
      CONTRADICTION_ORIGIN_LABEL[note.contradictionOrigin] ?? note.contradictionOrigin
    ] }),
    typeof note.step === "number" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { style: styles.originLine, children: [
      "\u751F\u6210\u6B65\u5E8F\uFF1A\u7B2C ",
      note.step,
      " \u6B65",
      note.final ? "\uFF08\u8BE5\u8F6E\u6700\u7EC8\u7B54\u6848\uFF09" : "\uFF08\u4E2D\u95F4\u751F\u6210\u7ED3\u679C\uFF09"
    ] }),
    note.candidates.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { style: styles.ul, children: note.candidates.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { style: styles.principle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: styles.principleHead, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { style: styles.principleNo, children: c.no }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: c.name })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.summary, children: c.summary }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.hintLine, children: c.routingHint })
    ] }, c.no)) }),
    note.hypotheses.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { style: styles.ul, children: note.hypotheses.map((h, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { style: styles.hintLine, children: h }, `${note.artifactId}-${i}`)) })
  ] });
}
function TrizTab(props) {
  const { useTabInfo } = props;
  const tabInfo = typeof useTabInfo === "function" ? useTabInfo() : void 0;
  const signal = tabInfo?.tab?.signal;
  const sessionId = props.sessionId;
  const [state, setState] = (0, import_react.useState)({ phase: "loading" });
  (0, import_react.useEffect)(() => {
    let alive = true;
    const controller = new AbortController();
    const abort = () => {
      controller.abort();
    };
    signal?.addEventListener("abort", abort, { once: true });
    void (async () => {
      try {
        const response = await fetch(trizNotesUrl(sessionId), { signal: controller.signal });
        if (!alive) return;
        if (!response.ok) {
          setState({ phase: "error" });
          return;
        }
        const notes = parseTrizNotes(await response.json());
        if (alive) setState({ phase: "ready", notes });
      } catch {
        if (alive) setState({ phase: "error" });
      }
    })();
    return () => {
      alive = false;
      controller.abort();
      signal?.removeEventListener("abort", abort);
    };
  }, [signal, sessionId]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: styles.root, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.header, children: "TRIZ \u53D1\u660E\u539F\u7406\u8BF4\u660E" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.hint, children: "\u5C55\u793A\u672C\u6B21\u7814\u7A76\u8FC7\u7A0B\u4E2D research_triz \u5DE5\u5177\u5206\u6790\u51FA\u7684\u53D1\u660E\u539F\u7406\u4E0E\u63A8\u7406\u94FE\u3002 \u6240\u6709\u63A8\u8350\u5747\u4E3A\u5F85\u6838\u9A8C\u5047\u8BF4\uFF08source=triz, confidence=0.5\uFF09\uFF0C\u987B\u7ECF research_verify / research_campaign \u9A8C\u8BC1\u540E\u624D\u6210\u4E3A\u7ED3\u8BBA\u3002" }),
    state.phase === "loading" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.empty, children: "\u52A0\u8F7D\u4E2D\u2026" }),
    state.phase === "error" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.errored, children: "\u6682\u65E0 TRIZ \u5206\u6790\u8BB0\u5F55\uFF0C\u6216\u6570\u636E\u6E90\u6682\u4E0D\u53EF\u7528\u3002" }),
    state.phase === "ready" && (state.notes.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.empty, children: "\u8FD8\u6CA1\u6709 TRIZ \u5206\u6790\u8BB0\u5F55\u3002\u53EF\u5728\u7814\u7A76\u4F1A\u8BDD\u4E2D\u8C03\u7528 research_triz \u5DE5\u5177\u751F\u6210\u3002" }) : state.notes.map((note) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TrizNoteCard, { note }, note.artifactId)))
  ] });
}

// client/draw/definition.ts
var DRAW_STUDIO_KIND = "draw-studio";
var DRAW_STUDIO_ID = "@basil/dsh-research-draw-studio";
var DRAW_STUDIO_ADDRESS = "dsh-resource://draw-studio/**";
function drawStudioGuide() {
  return [{
    id: "draw-studio",
    order: 2,
    title: () => "\u79D1\u7814\u7ED8\u56FE",
    description: () => "\u751F\u6210/\u7F16\u8F91\u79D1\u7814\u914D\u56FE\uFF08Qwen-Image-2.1 \u672C\u673A or OpenAI \u517C\u5BB9 API\uFF09\uFF1B\u652F\u6301\u6BD4\u4F8B/\u5206\u8FA8\u7387/\u753B\u8D28\u4E0E 1 \u5F20\u53C2\u8003\u57AB\u56FE\u3002"
  }];
}
function drawStudioDefinition() {
  return {
    id: DRAW_STUDIO_ID,
    kind: DRAW_STUDIO_KIND,
    patterns: [DRAW_STUDIO_ADDRESS],
    priority: "extension",
    // 打开后保持挂载：会话切换/隐藏后不销毁，用户再次打开右侧栏立即可见。
    keepMounted: true,
    title: () => "\u79D1\u7814\u7ED8\u56FE",
    guide: drawStudioGuide()
  };
}

// client/draw/DrawTab.tsx
var import_react2 = require("react");

// client/draw/route.ts
var DRAW_GENERATE_PATH = "/api/research.draw.generate";
var DRAW_STATUS_PATH = "/api/research.draw.status";
var DRAW_CONFIG_PATH = "/api/research.draw.config";
var DRAW_HISTORY_PATH = "/api/research.draw.history";
var DRAW_DELETE_PATH = "/api/research.draw.delete";
var DRAW_DEBUG_PATH = "/api/research.draw.debug";
var DRAW_SESSIONS_PATH = "/api/research.draw.sessions";
var DRAW_IMAGE_PATH = "/api/research.draw.image";
var DRAW_NO_SESSION = "__no_session__";
var DRAW_GENERATE_ROUTE = DRAW_GENERATE_PATH.slice(1);
var DRAW_STATUS_ROUTE = DRAW_STATUS_PATH.slice(1);
var DRAW_CONFIG_ROUTE = DRAW_CONFIG_PATH.slice(1);
var DRAW_HISTORY_ROUTE = DRAW_HISTORY_PATH.slice(1);
var DRAW_DELETE_ROUTE = DRAW_DELETE_PATH.slice(1);
var DRAW_DEBUG_ROUTE = DRAW_DEBUG_PATH.slice(1);
var DRAW_SESSIONS_ROUTE = DRAW_SESSIONS_PATH.slice(1);
var DRAW_IMAGE_ROUTE = DRAW_IMAGE_PATH.slice(1);
function drawUrl(route, sessionId, extra) {
  const params = new URLSearchParams();
  if (sessionId) params.set("sessionId", sessionId);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `${route}?${qs}` : route;
}
function drawGenerateUrl(sessionId) {
  return drawUrl(DRAW_GENERATE_ROUTE, sessionId);
}
function drawStatusUrl(jobId) {
  return drawUrl(DRAW_STATUS_ROUTE, void 0, { jobId });
}
function drawConfigUrl() {
  return DRAW_CONFIG_ROUTE;
}
function drawHistoryUrl(sessionId) {
  return drawUrl(DRAW_HISTORY_ROUTE, sessionId);
}
function drawDeleteUrl() {
  return DRAW_DELETE_ROUTE;
}
function drawDebugUrl() {
  return DRAW_DEBUG_ROUTE;
}
function drawSessionsUrl() {
  return DRAW_SESSIONS_ROUTE;
}
function drawImageUrl(path) {
  return drawUrl(DRAW_IMAGE_ROUTE, void 0, { path });
}
function fallbackDrawConfig() {
  return {
    enabled: false,
    providers: [],
    aspects: ["16:9", "21:10", "21:9", "16:10", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16"],
    resolutions: ["1K", "2K", "4K"],
    qualities: ["low", "medium", "high"],
    qualitySteps: { low: 20, medium: 30, high: 50 },
    resolutionLongEdge: { "1K": 1024, "2K": 2048, "4K": 4096 },
    defaults: {
      aspect: "16:9",
      resolution: "2K",
      quality: "high",
      provider: "local",
      steps: 50,
      seed: 42,
      width: 0,
      height: 0,
      outputRoot: "~/Downloads/outputs",
      editPresets: { style: { label: "\u98CE\u683C\u53C2\u8003", strength: 0.4 }, content: { label: "\u5185\u5BB9\u53C2\u8003", strength: 0.7 } }
    },
    outputRoot: "~/Downloads/outputs",
    sizePolicy: "exact-then-fallback",
    local: { bin: "mflux-generate-qwen-2.1", model: "~/llm/models/Qwen-Image-2.1", defaultSteps: 50, defaultSeed: 42 },
    api: { baseURL: "", modelId: "", keyProvided: false },
    thumbMax: 1024,
    maxRefBytes: 20 * 1024 * 1024
  };
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseDrawConfig(value) {
  const d = fallbackDrawConfig();
  if (!isRecord2(value)) return d;
  const enabled = typeof value.enabled === "boolean" ? value.enabled : d.enabled;
  const defaults = isRecord2(value.defaults) ? value.defaults : {};
  return {
    enabled,
    providers: Array.isArray(value.providers) ? value.providers.filter((x) => x === "local" || x === "api") : d.providers,
    aspects: Array.isArray(value.aspects) ? value.aspects.map(String) : d.aspects,
    resolutions: Array.isArray(value.resolutions) ? value.resolutions.map(String) : d.resolutions,
    qualities: Array.isArray(value.qualities) ? value.qualities.map(String) : d.qualities,
    qualitySteps: isRecord2(value.qualitySteps) ? Object.fromEntries(Object.entries(value.qualitySteps).map(([k, v]) => [k, Number(v) || 0])) : d.qualitySteps,
    resolutionLongEdge: isRecord2(value.resolutionLongEdge) ? Object.fromEntries(Object.entries(value.resolutionLongEdge).map(([k, v]) => [k, Number(v) || 0])) : d.resolutionLongEdge,
    defaults: {
      aspect: typeof defaults.aspect === "string" ? defaults.aspect : d.defaults.aspect,
      resolution: typeof defaults.resolution === "string" ? defaults.resolution : d.defaults.resolution,
      quality: typeof defaults.quality === "string" ? defaults.quality : d.defaults.quality,
      provider: defaults.provider === "api" ? "api" : "local",
      steps: typeof defaults.steps === "number" ? defaults.steps : d.defaults.steps,
      seed: typeof defaults.seed === "number" ? defaults.seed : d.defaults.seed,
      width: typeof defaults.width === "number" ? defaults.width : d.defaults.width,
      height: typeof defaults.height === "number" ? defaults.height : d.defaults.height,
      outputRoot: typeof defaults.outputRoot === "string" ? defaults.outputRoot : d.defaults.outputRoot,
      editPresets: {
        style: { label: "\u98CE\u683C\u53C2\u8003", strength: 0.4 },
        content: { label: "\u5185\u5BB9\u53C2\u8003", strength: 0.7 }
      }
    },
    outputRoot: typeof value.outputRoot === "string" ? value.outputRoot : d.outputRoot,
    sizePolicy: value.sizePolicy === "standard-only" ? "standard-only" : "exact-then-fallback",
    local: {
      bin: isRecord2(value.local) && typeof value.local.bin === "string" ? value.local.bin : d.local.bin,
      model: isRecord2(value.local) && typeof value.local.model === "string" ? value.local.model : d.local.model,
      defaultSteps: isRecord2(value.local) && typeof value.local.defaultSteps === "number" ? value.local.defaultSteps : d.local.defaultSteps,
      defaultSeed: isRecord2(value.local) && typeof value.local.defaultSeed === "number" ? value.local.defaultSeed : d.local.defaultSeed
    },
    api: {
      baseURL: isRecord2(value.api) && typeof value.api.baseURL === "string" ? value.api.baseURL : d.api.baseURL,
      modelId: isRecord2(value.api) && typeof value.api.modelId === "string" ? value.api.modelId : d.api.modelId,
      keyProvided: isRecord2(value.api) && typeof value.api.keyProvided === "boolean" ? value.api.keyProvided : d.api.keyProvided
    },
    thumbMax: typeof value.thumbMax === "number" ? value.thumbMax : d.thumbMax,
    maxRefBytes: typeof value.maxRefBytes === "number" ? value.maxRefBytes : d.maxRefBytes
  };
}
function parseDrawJob(value) {
  if (!isRecord2(value) || typeof value.id !== "string") return null;
  const phase = value.phase === "succeeded" || value.phase === "failed" || value.phase === "running" ? value.phase : "queued";
  const result = isRecord2(value.result) ? value.result : void 0;
  let parsedResult;
  if (result && typeof result.outputPath === "string") {
    parsedResult = {
      outputPath: result.outputPath,
      thumbnailBase64: typeof result.thumbnailBase64 === "string" ? result.thumbnailBase64 : void 0,
      width: typeof result.width === "number" ? result.width : 0,
      height: typeof result.height === "number" ? result.height : 0,
      provider: typeof result.provider === "string" ? result.provider : "",
      model: typeof result.model === "string" ? result.model : "",
      mode: typeof result.mode === "string" ? result.mode : "txt2img",
      size: typeof result.size === "string" ? result.size : "",
      steps: typeof result.steps === "number" ? result.steps : 0,
      seed: typeof result.seed === "number" ? result.seed : 0
    };
  }
  return {
    id: value.id,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
    phase,
    progress: typeof value.progress === "number" ? value.progress : void 0,
    logTail: Array.isArray(value.logTail) ? value.logTail.filter((x) => typeof x === "string") : [],
    error: typeof value.error === "string" ? value.error : void 0,
    result: parsedResult,
    artifactId: typeof value.artifactId === "string" ? value.artifactId : void 0
  };
}
function parseDrawHistory(value) {
  if (!isRecord2(value) || !Array.isArray(value.items)) return [];
  const out = [];
  for (const item of value.items) {
    if (!isRecord2(item) || typeof item.artifactId !== "string") continue;
    out.push({
      artifactId: item.artifactId,
      title: typeof item.title === "string" ? item.title : "",
      createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
      outputPath: typeof item.outputPath === "string" ? item.outputPath : void 0,
      prompt: typeof item.prompt === "string" ? item.prompt : void 0,
      provider: typeof item.provider === "string" ? item.provider : void 0,
      model: typeof item.model === "string" ? item.model : void 0,
      size: typeof item.size === "string" ? item.size : void 0,
      mode: typeof item.mode === "string" ? item.mode : void 0,
      thumbBase64: typeof item.thumbBase64 === "string" ? item.thumbBase64 : void 0,
      fileExists: typeof item.fileExists === "boolean" ? item.fileExists : void 0
    });
  }
  return out;
}
function parseDrawSessions(value) {
  if (!isRecord2(value) || !Array.isArray(value.sessions)) return [];
  const out = [];
  for (const item of value.sessions) {
    if (!isRecord2(item) || typeof item.sessionId !== "string") continue;
    out.push({
      sessionId: item.sessionId,
      count: typeof item.count === "number" ? item.count : 0,
      lastAt: typeof item.lastAt === "string" ? item.lastAt : ""
    });
  }
  return out;
}

// client/draw/DrawTab.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function postDebug(level, msg, meta) {
  try {
    void fetch(drawDebugUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level,
        msg,
        meta: meta === void 0 ? void 0 : typeof meta === "string" ? meta : JSON.stringify(meta)
      })
    });
  } catch {
  }
}
function formatDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value || "\u2014" : d.toLocaleString();
}
function formatSessionLabel(sn) {
  const sid = sn.sessionId;
  if (sid.length <= 20) return sid;
  return `${sid.slice(0, 12)}\u2026${sid.slice(-4)}`;
}
if (typeof window !== "undefined" && !window.__dshDrawDebugInstalled) {
  ;
  window.__dshDrawDebugInstalled = true;
  window.addEventListener("error", (e) => {
    const msg = `[uncaught] ${String(e.message ?? "")} @ ${String(e.filename ?? "")}:${e.lineno ?? ""}:${e.colno ?? ""}`;
    postDebug("error", msg);
    console.error("[dsh-research-draw]", msg);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    const msg = `[unhandledrejection] ${r instanceof Error ? r.stack ?? r.message : String(r)}`;
    postDebug("error", msg);
    console.error("[dsh-research-draw]", msg);
  });
}
var DrawErrorBoundary = class extends import_react2.Component {
  constructor() {
    super(...arguments);
    __publicField(this, "state", { error: null });
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    postDebug("error", `[tab-render] ${error.message}
${error.stack ?? ""}`);
    console.error("[dsh-research-draw] tab render error:", error);
  }
  render() {
    if (this.state.error) {
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { padding: 12, color: "#dc2626", fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: { fontWeight: 600, margin: "0 0 6px" }, children: "\u79D1\u7814\u7ED8\u56FE\u9762\u677F\u6E32\u67D3\u51FA\u9519\uFF08\u5DF2\u4E0A\u62A5 CLI/\u7EC8\u7AEF\uFF09" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("pre", { style: { whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0, fontSize: 11 }, children: String(this.state.error.stack ?? this.state.error) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", style: { marginTop: 8 }, onClick: () => this.setState({ error: null }), children: "\u91CD\u8BD5" })
      ] });
    }
    return this.props.children;
  }
};
var MAX_POLL_RETRY = 6;
var SESSION_CURRENT = "__current__";
var SESSION_ALL = "__all__";
var styles2 = {
  root: {
    boxSizing: "border-box",
    width: "100%",
    minWidth: 0,
    // 滚动修复：host 的 tabBody 是 height:100% + overflow:hidden 的 flex 容器，
    // 本根节点必须 flex:1 + minHeight:0 才能收缩，overflowY:auto 提供滚动（2026-10-21 用户反馈侧边栏不可滚动）。
    flex: "1 1 auto",
    minHeight: 0,
    overflowY: "auto",
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    fontFamily: "var(--ds-font-family, system-ui, sans-serif)",
    color: "var(--dsw-alias-label-primary, #20242c)",
    fontSize: "12px",
    lineHeight: "1.5"
  },
  header: { fontSize: "13px", fontWeight: 600, margin: 0 },
  hint: { color: "var(--dsw-alias-label-tertiary, #6b7280)", fontSize: "11px", margin: 0 },
  label: { display: "flex", flexDirection: "column", gap: "4px", fontSize: "11px", color: "var(--dsw-alias-label-secondary, #4b5563)" },
  segment: { display: "flex", flexWrap: "wrap", gap: "4px" },
  segBtn: (active) => ({
    border: "0.5px solid var(--dsw-alias-border-l2, #e5e7eb)",
    borderRadius: "8px",
    padding: "2px 8px",
    fontSize: "11px",
    cursor: "pointer",
    background: active ? "var(--dsw-alias-state-business-primary, #4f46e5)" : "var(--dsw-alias-bg-layer-1, #ffffff)",
    color: active ? "#fff" : "var(--dsw-alias-label-secondary, #4b5563)"
  }),
  input: {
    border: "0.5px solid var(--dsw-alias-border-l2, #e5e7eb)",
    borderRadius: "8px",
    padding: "5px 8px",
    fontSize: "12px",
    width: "100%",
    boxSizing: "border-box",
    background: "var(--dsw-alias-bg-layer-1, #ffffff)",
    color: "inherit"
  },
  textarea: {
    border: "0.5px solid var(--dsw-alias-border-l2, #e5e7eb)",
    borderRadius: "8px",
    padding: "6px 8px",
    fontSize: "12px",
    width: "100%",
    minHeight: "64px",
    boxSizing: "border-box",
    resize: "vertical",
    fontFamily: "inherit",
    background: "var(--dsw-alias-bg-layer-1, #ffffff)",
    color: "inherit"
  },
  card: {
    border: "0.5px solid var(--dsw-alias-border-l2, #e5e7eb)",
    borderRadius: "10px",
    padding: "10px 12px",
    background: "var(--dsw-alias-bg-layer-1, #ffffff)",
    display: "flex",
    flexDirection: "column",
    gap: "8px"
  },
  cardTitle: { fontWeight: 600, margin: 0, fontSize: "12px", lineHeight: "1.4" },
  button: (primary) => ({
    border: "none",
    borderRadius: "8px",
    padding: "6px 12px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    background: primary ? "var(--dsw-alias-state-business-primary, #4f46e5)" : "var(--dsw-alias-interactive-bg-subtle, #eef2ff)",
    color: primary ? "#fff" : "var(--dsw-alias-state-business-primary, #4f46e5)"
  }),
  img: { maxWidth: "100%", borderRadius: "8px", border: "0.5px solid var(--dsw-alias-border-l2, #e5e7eb)", cursor: "zoom-in" },
  imgClickable: { maxWidth: "100%", borderRadius: "8px", border: "0.5px solid var(--dsw-alias-border-l2, #e5e7eb)", cursor: "pointer" },
  // 历史列表（stack，后进先出）左列：固定 100×100 缩略图（原图回读，cover 裁切）。
  thumb: { width: 100, height: 100, objectFit: "cover", objectPosition: "center", borderRadius: "8px", border: "0.5px solid var(--dsw-alias-border-l2, #e5e7eb)", flexShrink: 0, cursor: "zoom-in", background: "var(--dsw-alias-bg-layer-2, #f3f4f6)" },
  // 本地图片缺失时占位（红框提示，替代缩略图）。
  thumbBad: { width: 100, height: 100, flexShrink: 0, borderRadius: "8px", border: "0.5px dashed var(--dsw-alias-state-error-primary, #dc2626)", background: "var(--dsw-alias-bg-layer-1, #ffffff)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dsw-alias-state-error-primary, #dc2626)", fontSize: "11px", textAlign: "center" },
  // 紧凑小按钮（历史行「查看大图」）。
  smallButton: (primary) => ({
    border: "none",
    borderRadius: "6px",
    padding: "3px 10px",
    fontSize: "11px",
    fontWeight: 600,
    cursor: "pointer",
    background: primary ? "var(--dsw-alias-state-business-primary, #4f46e5)" : "var(--dsw-alias-interactive-bg-subtle, #eef2ff)",
    color: primary ? "#fff" : "var(--dsw-alias-state-business-primary, #4f46e5)"
  }),
  select: {
    border: "0.5px solid var(--dsw-alias-border-l2, #e5e7eb)",
    borderRadius: "8px",
    padding: "4px 6px",
    fontSize: "11px",
    width: "100%",
    boxSizing: "border-box",
    background: "var(--dsw-alias-bg-layer-1, #ffffff)",
    color: "inherit"
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 17, 21, 0.82)",
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "18px"
  },
  overlayImg: {
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
    borderRadius: "8px",
    boxShadow: "0 12px 40px rgba(0,0,0,0.5)"
  },
  mono: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "10px", wordBreak: "break-all", margin: 0 },
  empty: { color: "var(--dsw-alias-label-tertiary, #6b7280)", fontSize: "11px", margin: 0 },
  errored: { color: "var(--dsw-alias-state-error-primary, #dc2626)", fontSize: "11px", margin: 0 },
  details: { borderTop: "0.5px solid var(--dsw-alias-border-l2, #e5e7eb)", paddingTop: "8px", display: "flex", flexDirection: "column", gap: "6px" },
  progressBar: { height: "6px", borderRadius: "99px", background: "var(--dsw-alias-interactive-bg-subtle, #eef2ff)", overflow: "hidden" },
  progressFill: (width) => ({ height: "100%", borderRadius: "99px", background: "var(--dsw-alias-state-business-primary, #4f46e5)", width })
};
function Field({ label, children }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { style: styles2.label, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: label }),
    children
  ] });
}
function Segments({ options, value, onChange }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: styles2.segment, children: options.map((o) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", style: styles2.segBtn(o === value), onClick: () => onChange(o), children: o }, o)) });
}
function DrawTab(props) {
  const { useTabInfo } = props;
  const tabInfo = typeof useTabInfo === "function" ? useTabInfo() : void 0;
  const signal = tabInfo?.tab?.signal;
  const sessionId = props.sessionId;
  const [cfgState, setCfgState] = (0, import_react2.useState)({ phase: "loading" });
  const [history, setHistory] = (0, import_react2.useState)([]);
  const [run, setRun] = (0, import_react2.useState)({ phase: "idle" });
  const [selectedId, setSelectedId] = (0, import_react2.useState)(void 0);
  const [sessionFilter, setSessionFilter] = (0, import_react2.useState)(SESSION_CURRENT);
  const [sessions, setSessions] = (0, import_react2.useState)([]);
  const [viewer, setViewer] = (0, import_react2.useState)(void 0);
  const [prompt, setPrompt] = (0, import_react2.useState)("");
  const [provider, setProvider] = (0, import_react2.useState)("local");
  const [mode, setMode] = (0, import_react2.useState)("txt2img");
  const [aspect, setAspect] = (0, import_react2.useState)("16:9");
  const [resolution, setResolution] = (0, import_react2.useState)("2K");
  const [quality, setQuality] = (0, import_react2.useState)("high");
  const [steps, setSteps] = (0, import_react2.useState)("");
  const [seed, setSeed] = (0, import_react2.useState)("");
  const [width, setWidth] = (0, import_react2.useState)("");
  const [height, setHeight] = (0, import_react2.useState)("");
  const [negativePrompt, setNegativePrompt] = (0, import_react2.useState)("");
  const [guidance, setGuidance] = (0, import_react2.useState)("");
  const [quantize, setQuantize] = (0, import_react2.useState)("");
  const [outputDir, setOutputDir] = (0, import_react2.useState)("");
  const [apiBaseURL, setApiBaseURL] = (0, import_react2.useState)("");
  const [apiKey, setApiKey] = (0, import_react2.useState)("");
  const [apiModel, setApiModel] = (0, import_react2.useState)("");
  const [refData, setRefData] = (0, import_react2.useState)("");
  const [refName, setRefName] = (0, import_react2.useState)("");
  const [editPreset, setEditPreset] = (0, import_react2.useState)("style");
  const [editStrength, setEditStrength] = (0, import_react2.useState)(0.4);
  const pollTimer = (0, import_react2.useRef)(void 0);
  const runningRef = (0, import_react2.useRef)(null);
  (0, import_react2.useEffect)(() => {
    let alive = true;
    const controller = new AbortController();
    const abort = () => {
      controller.abort();
    };
    signal?.addEventListener("abort", abort, { once: true });
    void (async () => {
      try {
        const configRes = await fetch(drawConfigUrl(), { signal: controller.signal });
        const cfg2 = parseDrawConfig(configRes.ok ? await configRes.json() : null);
        if (!alive) return;
        if (!cfg2.enabled) {
          setCfgState({ phase: "disabled" });
          return;
        }
        setCfgState({ phase: "ready", cfg: cfg2 });
        setAspect((prev) => prev === "16:9" ? cfg2.defaults.aspect : prev);
        setResolution((prev) => prev === "2K" ? cfg2.defaults.resolution : prev);
        setQuality((prev) => prev === "high" ? cfg2.defaults.quality : prev);
        setSteps(String(cfg2.defaults.steps));
        setSeed(String(cfg2.defaults.seed));
        setOutputDir(cfg2.defaults.outputRoot);
        setEditStrength(cfg2.defaults.editPresets.style.strength);
        if (cfg2.api.baseURL) setApiBaseURL(cfg2.api.baseURL);
        if (cfg2.api.modelId) setApiModel(cfg2.api.modelId);
      } catch {
        postDebug("error", "[config] \u62C9\u53D6\u79D1\u7814\u7ED8\u56FE\u914D\u7F6E\u5931\u8D25/\u6570\u636E\u6E90\u4E0D\u53EF\u7528");
        if (alive) setCfgState({ phase: "error" });
      }
    })();
    return () => {
      alive = false;
      controller.abort();
      signal?.removeEventListener("abort", abort);
    };
  }, [signal]);
  const historyTarget = () => sessionFilter === SESSION_CURRENT ? sessionId : sessionFilter === SESSION_ALL ? void 0 : sessionFilter;
  const loadHistory = () => {
    void (async () => {
      try {
        const res = await fetch(drawHistoryUrl(historyTarget()));
        if (!res.ok) return;
        setHistory(parseDrawHistory(await res.json()));
      } catch {
        postDebug("error", "[history] \u62C9\u53D6\u7ED8\u56FE\u5386\u53F2\u5931\u8D25\uFF08\u9759\u9ED8\uFF09");
      }
    })();
  };
  (0, import_react2.useEffect)(() => {
    loadHistory();
  }, [sessionId, sessionFilter]);
  const refreshSessions = () => {
    void (async () => {
      try {
        const res = await fetch(drawSessionsUrl());
        if (!res.ok) return;
        setSessions(parseDrawSessions(await res.json()));
      } catch {
      }
    })();
  };
  (0, import_react2.useEffect)(() => {
    refreshSessions();
  }, [sessionId]);
  const deleteRecord = (artifactId) => {
    void (async () => {
      try {
        const res = await fetch(drawDeleteUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artifactId })
        });
        if (!res.ok) {
          postDebug("warn", `[delete] \u5220\u9664\u5931\u8D25 ${res.status}`);
          return;
        }
        postDebug("log", `[delete] \u5DF2\u5220\u9664\u8BB0\u5F55 ${artifactId}`);
        setSelectedId((prev) => prev === artifactId ? void 0 : prev);
        loadHistory();
        refreshSessions();
      } catch (err) {
        postDebug("error", `[delete] \u5F02\u5E38: ${String(err?.message ?? err)}`);
      }
    })();
  };
  const clearHistoryFor = () => {
    const target = sessionFilter !== SESSION_CURRENT && sessionFilter !== SESSION_ALL ? sessionFilter : sessionId;
    if (!target) return;
    const scopeLabel = target === sessionId ? "\u672C\u4F1A\u8BDD" : "\u9009\u4E2D\u7684\u4F1A\u8BDD";
    if (!window.confirm(`\u786E\u5B9A\u6E05\u7A7A${scopeLabel}\u7684 ${history.length} \u6761\u7ED8\u56FE\u8BB0\u5F55\uFF1F
\u4EC5\u79FB\u9664\u8BB0\u5F55\uFF0C\u4E0D\u4F1A\u5220\u9664\u672C\u5730\u56FE\u7247\u6587\u4EF6\u3002`)) return;
    void (async () => {
      try {
        const res = await fetch(drawDeleteUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: target })
        });
        if (!res.ok) {
          postDebug("warn", `[delete] \u6E05\u7A7A\u5931\u8D25 ${res.status}`);
          return;
        }
        postDebug("log", `[delete] \u5DF2\u6E05\u7A7A\u4F1A\u8BDD ${target} \u8BB0\u5F55`);
        setSelectedId(void 0);
        loadHistory();
        refreshSessions();
      } catch (err) {
        postDebug("error", `[delete-clear] \u5F02\u5E38: ${String(err?.message ?? err)}`);
      }
    })();
  };
  const regenerate = (h) => {
    if (h.prompt) setPrompt(h.prompt);
    if (h.provider === "api") setProvider("api");
    const wasEdit = h.mode === "edit";
    setMode("txt2img");
    setRun({ phase: "idle" });
    setSelectedId(void 0);
    window.scrollTo?.({ top: 0, behavior: "smooth" });
    postDebug("log", `[regen] \u5386\u53F2 ${h.artifactId} \u63D0\u793A\u8BCD\u5DF2\u56DE\u586B${wasEdit ? "\uFF08\u539F\u4E3A edit\uFF0C\u57AB\u56FE\u4E0D\u53EF\u8FD8\u539F \u2192 \u6309 txt2img\uFF09" : ""}\uFF0C\u8BF7\u786E\u8BA4\u540E\u518D\u6B21\u751F\u6210`);
  };
  const poll = (jobId) => {
    runningRef.current = { jobId };
    let retryCount = 0;
    const tick = async () => {
      if (runningRef.current?.jobId !== jobId) return;
      try {
        const res = await fetch(drawStatusUrl(jobId));
        if (!res.ok) return;
        const raw = await res.json();
        const view = parseDrawJob(raw);
        if (!view || runningRef.current?.jobId !== jobId) {
          const msg = typeof raw?.error === "string" && raw.error ? raw.error : "job \u72B6\u6001\u89E3\u6790\u5931\u8D25";
          runningRef.current = null;
          postDebug("error", `[status] job=${jobId} ${msg}`);
          setRun({ phase: "failed", error: msg, logTail: [] });
          return;
        }
        if (view.phase === "succeeded" && view.result) {
          runningRef.current = null;
          postDebug("log", `[done] job=${jobId} \u2192 ${view.result.outputPath}`);
          setRun({ phase: "done", result: view.result, artifactId: view.artifactId });
          loadHistory();
          refreshSessions();
          return;
        }
        if (view.phase === "failed") {
          runningRef.current = null;
          postDebug("error", `[failed] job=${jobId} ${view.error ?? "\u751F\u6210\u5931\u8D25"}`);
          setRun({ phase: "failed", error: view.error ?? "\u751F\u6210\u5931\u8D25", logTail: view.logTail });
          return;
        }
        if (view.phase === "queued" || view.phase === "running") {
          retryCount = 0;
          setRun({ phase: "running", jobId, progress: view.progress, logTail: view.logTail });
          pollTimer.current = window.setTimeout(() => void tick(), 2500);
        }
      } catch (err) {
        retryCount += 1;
        if (retryCount > MAX_POLL_RETRY) {
          runningRef.current = null;
          const msg = `\u8F6E\u8BE2\u5931\u8D25 ${retryCount} \u6B21\uFF1A${String(err?.message ?? err)}`;
          postDebug("error", `[status] job=${jobId} ${msg}`);
          setRun({ phase: "failed", error: msg, logTail: [] });
          return;
        }
        if (runningRef.current?.jobId === jobId) pollTimer.current = window.setTimeout(() => void tick(), 3e3);
      }
    };
    void tick();
  };
  const canGenerate = cfgState.phase === "ready" && prompt.trim().length > 0 && run.phase !== "running" && run.phase !== "submitting";
  const generate = () => {
    if (!canGenerate) return;
    const cfg2 = cfgState.phase === "ready" ? cfgState.cfg : void 0;
    const body = {
      prompt,
      provider,
      mode,
      aspect,
      resolution,
      quality
    };
    if (steps.trim()) body.steps = Number(steps);
    if (seed.trim()) body.seed = Math.floor(Number(seed));
    if (width.trim()) body.width = Number(width);
    if (height.trim()) body.height = Number(height);
    if (negativePrompt.trim()) body.negativePrompt = negativePrompt;
    if (guidance.trim()) body.guidance = Number(guidance);
    if (quantize.trim()) body.quantize = Number(quantize);
    if (outputDir.trim()) body.outputDir = outputDir;
    if (provider === "api") {
      if (apiBaseURL.trim()) body.apiBaseURL = apiBaseURL;
      if (apiKey.trim()) body.apiKey = apiKey;
      if (apiModel.trim()) body.apiModel = apiModel;
    }
    if (mode === "edit") {
      if (!refData) return;
      body.imageData = refData;
      if (refName) body.imageName = refName;
      body.editPreset = editPreset;
      body.editStrength = editStrength;
    }
    setRun({ phase: "submitting" });
    postDebug("log", `[generate] \u63D0\u4EA4 provider=${provider} mode=${mode} ${aspect}/${resolution}/${quality} session=${sessionId ?? "\u2205"}`);
    void (async () => {
      try {
        const res = await fetch(drawGenerateUrl(sessionId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const json = await res.json();
        if (!res.ok || !json.jobId) {
          const msg = json.error ?? `\u63D0\u4EA4\u5931\u8D25 (${res.status})`;
          postDebug("error", `[generate] \u63D0\u4EA4\u88AB\u62D2\uFF1A${msg}`);
          setRun({ phase: "failed", error: msg, logTail: [] });
          return;
        }
        postDebug("log", `[generate] \u5DF2\u53D7\u7406 job=${json.jobId}`);
        setRun({ phase: "running", jobId: json.jobId, logTail: [] });
        poll(json.jobId);
      } catch (err) {
        postDebug("error", `[generate] \u7F51\u7EDC/\u89E3\u6790\u5F02\u5E38: ${String(err?.message ?? err)}`);
        setRun({ phase: "failed", error: String(err?.message ?? err), logTail: [] });
      }
    })();
  };
  const onPickRef = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const data = typeof reader.result === "string" ? reader.result : "";
      setRefData(data);
      setRefName(file.name);
    };
    reader.readAsDataURL(file);
  };
  const cfg = cfgState.phase === "ready" ? cfgState.cfg : void 0;
  const useEdit = mode === "edit" && provider === "local";
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(DrawErrorBoundary, { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: styles2.root, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: styles2.header, children: "\u79D1\u7814\u7ED8\u56FE" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { style: styles2.hint, children: [
      "\u751F\u6210/\u7F16\u8F91\u79D1\u7814\u914D\u56FE\uFF1AQwen-Image-2.1\uFF08\u672C\u673A mflux\uFF0C\u975E\u9A7B\u7559\uFF09\u6216 OpenAI \u517C\u5BB9 API\u3002 \u8F93\u51FA\u56FA\u5B9A\u5230 ",
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { children: "images/image-YYYYMMDDHHmmSS.png" }),
      "\uFF0C\u8BB0\u5F55\u968F\u4F1A\u8BDD\u6301\u4E45\u5316\u3001\u53EF\u7528\u4E8E paper \u62A5\u544A\u914D\u56FE\uFF08research_draw\uFF09\u3002"
    ] }),
    cfgState.phase === "loading" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: styles2.empty, children: "\u52A0\u8F7D\u4E2D\u2026" }),
    cfgState.phase === "error" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: styles2.errored, children: "\u79D1\u7814\u7ED8\u56FE\u6570\u636E\u6E90\u6682\u4E0D\u53EF\u7528\uFF0C\u6216\u672A\u88AB\u542F\u7528\u3002" }),
    cfgState.phase === "disabled" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: styles2.empty, children: "\u79D1\u7814\u7ED8\u56FE\u672A\u542F\u7528\uFF08host research-draw config.enabled=false\uFF09\u3002" }),
    cfg && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: "\u63D0\u793A\u8BCD\uFF08\u79D1\u7814\u7ED8\u56FE\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("textarea", { style: styles2.textarea, value: prompt, onChange: (e) => setPrompt(e.target.value), placeholder: "\u4F8B\uFF1A\u79D1\u7814\u7ED8\u56FE\uFF1ABGP \u52AB\u6301\u68C0\u6D4B\u65F6\u5E8F\u56FE\uFF0C\u6A2A\u8F74\u65F6\u95F4\uFF0C\u7EB5\u8F74\u7F6E\u4FE1\u5EA6\uFF0C\u51B7\u8272\u8C03\uFF0C\u6807\u6CE8 RPKI \u4E8B\u4EF6" }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: "\u540E\u7AEF / \u6A21\u578B", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Segments,
        {
          options: ["local", "api"],
          value: provider,
          onChange: (v) => {
            setProvider(v);
            if (v === "api") setMode("txt2img");
          }
        }
      ) }),
      provider === "local" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { style: styles2.hint, children: [
        "local = \u672C\u673A mflux \u8C03 ",
        cfg.local.model,
        "\uFF08\u975E\u9A7B\u7559\u3001\u5E76\u53D1 1\uFF0C\u652F\u6301 1 \u5F20\u57AB\u56FE edit\uFF09\u3002"
      ] }),
      provider === "api" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: styles2.details, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: "API Base URL\uFF08OpenAI \u517C\u5BB9\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { style: styles2.input, value: apiBaseURL, onChange: (e) => setApiBaseURL(e.target.value), placeholder: "https://\u2026/v1" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: "API Key\uFF08\u652F\u6301 ${VAR} \u73AF\u5883\u53D8\u91CF\u5F15\u7528\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { style: styles2.input, value: apiKey, onChange: (e) => setApiKey(e.target.value), placeholder: cfg.api.keyProvided ? "\u5DF2\u914D\u7F6E\uFF08\u53EF\u7559\u7A7A\uFF09" : "sk-\u2026 / ${MY_KEY}" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: "\u6A21\u578B id", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { style: styles2.input, value: apiModel, onChange: (e) => setApiModel(e.target.value), placeholder: cfg.api.modelId || "qwen-image-2.1" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: styles2.hint, children: "api \u6A21\u5F0F\u6682\u4E0D\u652F\u6301\u57AB\u56FE v1\uFF1B\u4EFB\u610F\u6BD4\u4F8B\u5148\u53D1\u7CBE\u786E WxH\uFF0C\u5931\u8D25\u56DE\u9000\u6700\u8FD1\u6807\u51C6\u6863\u3002" })
      ] }),
      provider === "local" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: "\u6A21\u5F0F", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Segments,
        {
          options: ["txt2img", "edit"],
          value: mode,
          onChange: (v) => setMode(v)
        }
      ) }),
      useEdit && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: styles2.details, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: "\u53C2\u8003\u56FE\uFF081 \u5F20\uFF0Cv1 \u4EC5 local\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "input",
          {
            type: "file",
            accept: "image/*",
            style: styles2.input,
            onChange: (e) => onPickRef(e.target.files?.[0])
          }
        ) }),
        refData && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("img", { style: styles2.img, src: refData, alt: "\u53C2\u8003\u56FE\u9884\u89C8" }),
        refData && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", style: styles2.button(false), onClick: () => {
          setRefData("");
          setRefName("");
        }, children: "\u6E05\u9664\u53C2\u8003\u56FE" }),
        refData && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: "\u53C2\u8003\u8BED\u4E49", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            Segments,
            {
              options: ["style", "content"],
              value: editPreset,
              onChange: (v) => {
                setEditPreset(v);
                setEditStrength(v === "style" ? cfg.defaults.editPresets.style.strength ?? 0.4 : cfg.defaults.editPresets.content.strength ?? 0.7);
              }
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: `\u5F3A\u5EA6\uFF1A${Math.round(editStrength * 100)}%`, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "range", min: 0.3, max: 1, step: 0.05, value: editStrength, onChange: (e) => setEditStrength(Number(e.target.value)), style: { width: "100%" } }) })
        ] }),
        !refData && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: styles2.hint, children: "\u4E0A\u4F20 1 \u5F20\u53C2\u8003\u56FE\u4EE5\u542F\u7528 edit\uFF08\u98CE\u683C 0.4 / \u5185\u5BB9 0.7\uFF09\u3002" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: "\u6BD4\u4F8B\uFF08\u9ED8\u8BA4 16:9\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Segments,
        {
          options: cfg.aspects,
          value: aspect,
          onChange: (v) => setAspect(v)
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: "\u5206\u8FA8\u7387\uFF08\u957F\u8FB9\uFF0C\u9ED8\u8BA4 2K\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Segments,
        {
          options: cfg.resolutions,
          value: resolution,
          onChange: (v) => setResolution(v)
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: "\u753B\u8D28\uFF08\u6B65\u6570\uFF1A\u4F4E20/\u4E2D30/\u9AD850\uFF0C\u9ED8\u8BA4 \u9AD8\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Segments,
        {
          options: cfg.qualities,
          value: quality,
          onChange: (v) => setQuality(v)
        }
      ) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("details", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("summary", { style: { fontSize: "11px", color: "var(--dsw-alias-state-business-primary, #4f46e5)", cursor: "pointer" }, children: "\u9AD8\u7EA7\u53C2\u6570" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: styles2.details, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: "\u63A8\u7406\u6B65\u6570\uFF08\u8986\u76D6\u753B\u8D28\u6863\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { style: styles2.input, type: "number", min: 1, max: 200, value: steps, onChange: (e) => setSteps(e.target.value) }) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", gap: "6px", alignItems: "flex-end" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: "\u968F\u673A\u79CD\u5B50", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { style: styles2.input, type: "number", value: seed, onChange: (e) => setSeed(e.target.value) }) }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", style: styles2.button(false), onClick: () => setSeed(String(Math.floor(Math.random() * 1e9))), children: "\u968F\u673A" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", gap: "6px" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: "\u5BBD\u8986\u76D6", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { style: styles2.input, type: "number", value: width, onChange: (e) => setWidth(e.target.value) }) }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: "\u9AD8\u8986\u76D6", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { style: styles2.input, type: "number", value: height, onChange: (e) => setHeight(e.target.value) }) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: "\u8D1F\u5411\u63D0\u793A", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { style: styles2.input, value: negativePrompt, onChange: (e) => setNegativePrompt(e.target.value) }) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", gap: "6px" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: "guidance\uFF08\u53EF\u9009\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { style: styles2.input, type: "number", value: guidance, onChange: (e) => setGuidance(e.target.value) }) }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: "quantize\uFF08\u53EF\u9009\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { style: styles2.input, type: "number", value: quantize, onChange: (e) => setQuantize(e.target.value) }) })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Field, { label: "\u8F93\u51FA\u76EE\u5F55\uFF08\u56FA\u5B9A\u8FFD\u52A0 images/ \u5B50\u76EE\u5F55\uFF09", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { style: styles2.input, value: outputDir, onChange: (e) => setOutputDir(e.target.value), placeholder: cfg.outputRoot }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", style: styles2.button(true), disabled: !canGenerate || useEdit && !refData, onClick: generate, children: run.phase === "submitting" ? "\u63D0\u4EA4\u4E2D\u2026" : run.phase === "running" ? `\u751F\u6210\u4E2D\u2026 ${run.progress ? Math.round(run.progress * 100) : ""}%` : "\u751F\u6210" }),
      run.phase === "running" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: styles2.card, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: styles2.cardTitle, children: "\u751F\u6210\u4E2D\u2026" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: styles2.progressBar, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: styles2.progressFill(`${Math.round((run.progress ?? 0) * 100)}%`) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { style: styles2.mono, children: [
          "jobId: ",
          run.jobId
        ] }),
        (run.logTail ?? []).length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: styles2.mono, children: (run.logTail ?? []).slice(-4).map((l, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: { ...styles2.mono, margin: 0, whiteSpace: "pre-wrap" }, children: l }, `${run.jobId}-${i}`)) })
      ] }),
      run.phase === "done" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: styles2.card, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: styles2.cardTitle, children: "\u5B8C\u6210" }),
        run.result.outputPath ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("img", { style: styles2.imgClickable, src: drawImageUrl(run.result.outputPath), alt: "\u751F\u6210\u7ED3\u679C\u9884\u89C8", onClick: () => setViewer(drawImageUrl(run.result.outputPath)) }) : run.result.thumbnailBase64 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("img", { style: styles2.img, src: run.result.thumbnailBase64, alt: "\u751F\u6210\u7ED3\u679C\u9884\u89C8" }),
        run.result.outputPath && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", style: styles2.button(false), onClick: () => setViewer(drawImageUrl(run.result.outputPath)), children: "\u67E5\u770B\u5927\u56FE" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: styles2.mono, children: run.result.outputPath }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { style: styles2.hint, children: [
          run.result.size,
          " \xB7 ",
          run.result.model,
          " \xB7 steps=",
          run.result.steps,
          " \xB7 seed=",
          run.result.seed
        ] })
      ] }),
      run.phase === "failed" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: styles2.card, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: { ...styles2.cardTitle, color: "var(--dsw-alias-state-error-primary, #dc2626)" }, children: "\u5931\u8D25" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: styles2.errored, children: run.error }),
        (run.logTail ?? []).length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: styles2.mono, children: (run.logTail ?? []).slice(-4).map((l, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: { ...styles2.mono, margin: 0 }, children: l }, i)) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { style: { ...styles2.cardTitle, margin: 0 }, children: [
            "\u7ED8\u56FE\u5386\u53F2\uFF08",
            history.length,
            "\uFF09"
          ] }),
          history.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", style: styles2.button(false), onClick: clearHistoryFor, children: "\u6E05\u9664\u5386\u53F2" })
        ] }),
        sessions.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { marginBottom: "8px" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontSize: "10px", color: "var(--dsw-alias-label-tertiary, #6b7280)" }, children: "\u6309\u4F1A\u8BDD\u7B5B\u9009\uFF1A" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("select", { style: styles2.select, value: sessionFilter, onChange: (e) => setSessionFilter(e.target.value), children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: SESSION_CURRENT, children: "\u5F53\u524D\u4F1A\u8BDD" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: SESSION_ALL, children: "\u5168\u90E8\u4F1A\u8BDD" }),
            sessions.map((sn) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("option", { value: sn.sessionId, children: [
              sn.sessionId === DRAW_NO_SESSION ? "(\u65E0\u4F1A\u8BDD)" : formatSessionLabel(sn),
              " \xB7 ",
              sn.count,
              " \u6761"
            ] }, sn.sessionId))
          ] })
        ] }),
        history.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: styles2.empty, children: "\u8FD8\u6CA1\u6709\u7ED8\u56FE\u8BB0\u5F55\uFF08\u5173\u95ED\u540E\u91CD\u542F\u4ECD\u4F1A\u4FDD\u7559\uFF0C\u6309\u4F1A\u8BDD\u8FC7\u6EE4\uFF09\u3002" }),
        history.map((h) => {
          const selected = selectedId === h.artifactId;
          const realImg = h.outputPath && h.fileExists !== false ? drawImageUrl(h.outputPath) : void 0;
          return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
            "section",
            {
              style: { ...styles2.card, cursor: "pointer", borderColor: selected ? "var(--dsw-alias-state-business-primary, #4f46e5)" : "var(--dsw-alias-border-l2, #e5e7eb)" },
              onClick: () => setSelectedId(selected ? void 0 : h.artifactId),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", gap: "10px", alignItems: "flex-start", minWidth: 0 }, children: [
                  realImg ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("img", { style: styles2.thumb, src: realImg, alt: "\u5386\u53F2\u9884\u89C8", onClick: (e) => {
                    e.stopPropagation();
                    setViewer(realImg);
                  } }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: styles2.thumbBad, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
                    "\u6587\u4EF6",
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("br", {}),
                    "\u7F3A\u5931"
                  ] }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: "4px", minWidth: 0, flex: 1 }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: { ...styles2.mono, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: h.title }),
                    h.outputPath && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: { ...styles2.mono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, title: h.outputPath, children: h.outputPath }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { style: styles2.hint, children: [
                      h.size ?? "",
                      h.model ? ` \xB7 ${h.model}` : "",
                      " \xB7 ",
                      formatDate(h.createdAt)
                    ] }),
                    realImg && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", style: styles2.smallButton(false), onClick: (e) => {
                      e.stopPropagation();
                      setViewer(realImg);
                    }, children: "\u67E5\u770B\u5927\u56FE" }) })
                  ] })
                ] }),
                h.fileExists === false && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { borderTop: "0.5px solid var(--dsw-alias-border-l2, #e5e7eb)", paddingTop: "6px", display: "flex", flexDirection: "column", gap: "6px" }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: styles2.errored, children: "\u672C\u5730\u56FE\u7247\u6587\u4EF6\u5DF2\u4E0D\u5B58\u5728 \u2014\u2014 \u53EF\u5220\u9664\u8BB0\u5F55\u6216\u91CD\u65B0\u751F\u6210" }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", gap: "6px" }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", style: styles2.button(false), onClick: (e) => {
                      e.stopPropagation();
                      deleteRecord(h.artifactId);
                    }, children: "\u5220\u9664\u8BB0\u5F55" }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", style: styles2.button(false), onClick: (e) => {
                      e.stopPropagation();
                      regenerate(h);
                    }, children: "\u91CD\u65B0\u751F\u6210" })
                  ] })
                ] }),
                selected && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: styles2.details, children: [
                  h.prompt && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { style: styles2.mono, children: [
                    "\u63D0\u793A\u8BCD\uFF1A",
                    h.prompt
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { style: styles2.hint, children: [
                    h.mode === "edit" ? "edit\uFF08\u57AB\u56FE\uFF09" : "txt2img",
                    " \xB7 ",
                    h.size ?? "",
                    h.provider ? ` \xB7 ${h.provider}` : "",
                    h.model ? ` \xB7 ${h.model}` : ""
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { style: styles2.hint, children: "\u70B9\u51FB\u5361\u7247\u53EF\u6536\u8D77\u8BE6\u60C5" })
                ] })
              ]
            },
            h.artifactId
          );
        })
      ] })
    ] }),
    viewer && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
      "div",
      {
        onClick: () => setViewer(void 0),
        style: styles2.overlay,
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("img", { src: viewer, alt: "\u751F\u6210\u56FE\u5927\u56FE", style: styles2.overlayImg }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "button",
            {
              type: "button",
              onClick: (e) => {
                e.stopPropagation();
                setViewer(void 0);
              },
              style: {
                position: "absolute",
                top: 14,
                right: 14,
                border: "none",
                borderRadius: 8,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                background: "var(--dsw-alias-bg-layer-1, #ffffff)",
                color: "var(--dsw-alias-label-primary, #20242c)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.3)"
              },
              children: "\u5173\u95ED"
            }
          )
        ]
      }
    )
  ] }) });
}

// client/index.ts
var name = "dsh-research-tabs";
var inject = ["slots", "sidebarRightTabs"];
function apply(ctx) {
  ctx.effect(() => ctx.sidebarRightTabs.register(trizExplainerDefinition()), "dsh-research: triz-explainer tab type");
  ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
    name: "sidebar.right.pane.tab",
    key: TRIZ_EXPLAINER_ID
  }, TrizTab)), "dsh-research: triz-explainer tab body");
  ctx.effect(() => ctx.sidebarRightTabs.register(drawStudioDefinition()), "dsh-research: draw-studio tab type");
  ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
    name: "sidebar.right.pane.tab",
    key: DRAW_STUDIO_ID
  }, DrawTab)), "dsh-research: draw-studio tab body");
}

		return module.exports;
	}
});
