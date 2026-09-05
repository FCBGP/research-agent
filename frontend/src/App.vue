<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">Research Agent</div>
      <nav>
        <button v-for="v in views" :key="v.id" :class="['tab', { active: view === v.id }]"
                @click="view = v.id">{{ v.label }}</button>
      </nav>
    </header>

    <main>
      <!-- 聊天视图 -->
      <section v-if="view === 'chat'" class="panel">
        <div class="chatlog" ref="log">
          <div v-for="(m, i) in messages" :key="i" :class="['msg', m.role]">
            <strong>{{ m.roleLabel }}</strong>
            <pre>{{ m.text }}</pre>
          </div>
        </div>
        <form @submit.prevent="send" class="inputbar">
          <input v-model="prompt" placeholder="输入研究问题…" :disabled="busy" />
          <select v-model="mode">
            <option value="agent">研究</option>
            <option value="debate">辩论</option>
          </select>
          <button :disabled="busy">{{ busy ? "…" : "发送" }}</button>
        </form>
      </section>

      <!-- 工具视图 -->
      <section v-if="view === 'tools'" class="panel">
        <h2>工具</h2>
        <ul class="toolgrid">
          <li v-for="t in tools" :key="t">
            <button @click="runTool(t)">{{ t }}</button>
          </li>
        </ul>
        <pre class="result">{{ toolResult }}</pre>
      </section>

      <!-- 文件视图 -->
      <section v-if="view === 'files'" class="panel">
        <h2>文件</h2>
        <div class="filebar">
          <input v-model="path" placeholder="目录路径,默认 ." />
          <button @click="loadFiles">浏览</button>
          <input v-model="filePath" placeholder="读取文件路径" />
          <button @click="readFile">读取</button>
        </div>
        <pre class="entries">{{ entries }}</pre>
        <pre class="result">{{ fileResult }}</pre>
      </section>

      <!-- 文档视图 -->
      <section v-if="view === 'docs'" class="panel">
        <h2>Word 文档</h2>
        <div class="docbar">
          <input v-model="docTopic" placeholder="主题" />
          <input v-model="docFile" placeholder="输出 .docx,默认 out.docx" />
          <button @click="makeDoc">生成 Word 长文档</button>
        </div>
        <pre class="result">{{ docResult }}</pre>
      </section>

      <!-- 设置视图 -->
      <section v-if="view === 'settings'" class="panel">
        <h2>设置</h2>
        <pre>{{ configInfo }}</pre>
        <div class="docbar">
          <label>技能/MCP:</label>
          <button @click="refreshSkills">技能</button>
          <button @click="refreshMcp">MCP 工具</button>
        </div>
        <pre class="result">{{ skillMcpResult }}</pre>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, nextTick } from "vue";

const view = ref("chat");
const views = [
  { id: "chat", label: "聊天" },
  { id: "tools", label: "工具" },
  { id: "files", label: "文件" },
  { id: "docs", label: "文档" },
  { id: "settings", label: "设置" },
];

const messages = reactive([]);
const prompt = ref("");
const mode = ref("agent");
const busy = ref(false);
const log = ref(null);

const tools = ref([]);
const toolResult = ref("");
const toolArgs = ref("{}");

const path = ref(".");
const entries = ref("");
const filePath = ref("");
const fileResult = ref("");

const docTopic = ref("");
const docFile = ref("out.docx");
const docResult = ref("");

const configInfo = ref("");
const skillMcpResult = ref("");

const API = "http://127.0.0.1:8000";

function roleLabel(role) {
  return role === "user" ? "你" : role === "model" ? "模型" : role === "tool" ? "工具" : role;
}

async function send() {
  if (!prompt.value) return;
  busy.value = true;
  const q = prompt.value;
  prompt.value = "";
  messages.push({ role: "user", text: q, roleLabel: "你" });
  const body = JSON.stringify({ query: q, mode: mode.value, max_turns: 8 });
  // 用 fetch POST 读取 SSE 流(EventSource 只发 GET,后端是 POST 端点)
  const resp = await fetch(`${API}/agent/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // 解析 SSE 的 data: 行
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      try {
        const d = JSON.parse(line.slice(5).trim());
        messages.push({ role: d.type, text: d.content || d.tool || d.filename || d.result, roleLabel: roleLabel(d.type) });
        nextTick(() => log.value?.scrollTo({ top: log.value.scrollHeight }));
        if (d.type === "final") break;
      } catch (e) {
        /* ignore partial lines */
      }
    }
  }
  busy.value = false;
}

async function runTool(t) {
  const res = await fetch(`${API}/tool/run`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool: t, args: {} }),
  });
  toolResult.value = (await res.json()).result;
}

async function loadFiles() {
  const res = await fetch(`${API}/files?path=${path.value}`);
  entries.value = JSON.stringify((await res.json()).entries || [], null, 2);
}

async function readFile() {
  const res = await fetch(`${API}/file/read`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: filePath.value }),
  });
  fileResult.value = JSON.stringify(await res.json(), null, 2);
}

async function makeDoc() {
  const res = await fetch(`${API}/doc/word`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic: docTopic.value, filename: docFile.value, target_chars: 10000 }),
  });
  docResult.value = JSON.stringify(await res.json(), null, 2);
}

async function refreshSkills() {
  const res = await fetch(`${API}/skills`);
  skillMcpResult.value = JSON.stringify(await res.json(), null, 2);
}
async function refreshMcp() {
  const res = await fetch(`${API}/mcp/tools`);
  skillMcpResult.value = JSON.stringify(await res.json(), null, 2);
}

onMounted(async () => {
  tools.value = (await (await fetch(`${API}/tools`)).json()).tools;
  configInfo.value = JSON.stringify(await (await fetch(`${API}/config`)).json(), null, 2);
});
</script>