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

// client/index.ts
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);

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
    title: () => "TRIZ \u53D1\u660E\u539F\u7406",
    guide: trizExplainerGuide()
  };
}

// client/TrizTab.tsx
var import_react = require("react");

// client/route.ts
var TRIZ_NOTES_PATH = "/api/research.triz.notes";
var TRIZ_NOTES_ROUTE = TRIZ_NOTES_PATH.slice(1);
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
    const { artifactId, title, problem, source, hypotheses } = item;
    if (typeof artifactId !== "string" || typeof title !== "string" || typeof source !== "string") continue;
    const candidates = Array.isArray(item.candidates) ? item.candidates.filter(isPrincipleView) : [];
    const lines = Array.isArray(hypotheses) ? hypotheses.filter((h) => typeof h === "string") : [];
    notes.push({
      artifactId,
      title,
      problem: typeof problem === "string" && problem.length > 0 ? problem : title,
      source,
      candidates,
      hypotheses: lines,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : ""
    });
  }
  return notes;
}
var SOURCE_LABEL = {
  "curated-matrix": "\u547D\u4E2D\u7CBE\u9009\u77DB\u76FE\u77E9\u9635",
  "heuristic-fallback": "\u542F\u53D1\u5F0F\u515C\u5E95",
  "unresolved": "\u53C2\u6570\u672A\u89E3\u6790"
};

// client/TrizTab.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var styles = {
  root: {
    boxSizing: "border-box",
    width: "100%",
    minWidth: 0,
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
        const response = await fetch(TRIZ_NOTES_ROUTE, { signal: controller.signal });
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
  }, [signal]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: styles.root, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.header, children: "TRIZ \u53D1\u660E\u539F\u7406\u8BF4\u660E" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.hint, children: "\u5C55\u793A\u672C\u6B21\u7814\u7A76\u8FC7\u7A0B\u4E2D research_triz \u5DE5\u5177\u5206\u6790\u51FA\u7684\u53D1\u660E\u539F\u7406\u4E0E\u63A8\u7406\u94FE\u3002 \u6240\u6709\u63A8\u8350\u5747\u4E3A\u5F85\u6838\u9A8C\u5047\u8BF4\uFF08source=triz, confidence=0.5\uFF09\uFF0C\u987B\u7ECF research_verify / research_campaign \u9A8C\u8BC1\u540E\u624D\u6210\u4E3A\u7ED3\u8BBA\u3002" }),
    state.phase === "loading" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.empty, children: "\u52A0\u8F7D\u4E2D\u2026" }),
    state.phase === "error" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.errored, children: "\u6682\u65E0 TRIZ \u5206\u6790\u8BB0\u5F55\uFF0C\u6216\u6570\u636E\u6E90\u6682\u4E0D\u53EF\u7528\u3002" }),
    state.phase === "ready" && (state.notes.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: styles.empty, children: "\u8FD8\u6CA1\u6709 TRIZ \u5206\u6790\u8BB0\u5F55\u3002\u53EF\u5728\u7814\u7A76\u4F1A\u8BDD\u4E2D\u8C03\u7528 research_triz \u5DE5\u5177\u751F\u6210\u3002" }) : state.notes.map((note) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TrizNoteCard, { note }, note.artifactId)))
  ] });
}

// client/index.ts
var name = "dsh-research-triz-explainer";
var inject = ["slots", "sidebarRightTabs"];
function apply(ctx) {
  ctx.effect(() => ctx.sidebarRightTabs.register(trizExplainerDefinition()), "dsh-research: triz-explainer tab type");
  ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
    name: "sidebar.right.pane.tab",
    key: TRIZ_EXPLAINER_ID
  }, TrizTab)), "dsh-research: triz-explainer tab body");
}

		return module.exports;
	}
});
