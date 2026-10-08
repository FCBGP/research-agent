# dsh research — 域间路由安全研究 Agent

在 **DeepSeek Harness（dsh）** 之上构建的领域专用科研 Agent，面向
**域间路由安全（BGP / RPKI / BGPsec / ASPA / VRO / CRC / FC-BGP）**，
实现「检索 → 阅读 → 假设 → 实验 → 验证 → 反证 → 成文」的科研流水线
（Research Loop / Verification Loop / Experiment Loop）。

本仓库只做 dsh 的**上层叠加**：`dsh` 是运行时（操作系统底座），
我们的成果 = **profile + bundle + 插件 + skills**，**绝不修改 `deepseek-harness/` 内部代码**。

## 目录结构

```
research-agents/
├── deepseek-harness/      # 官方上游 git submodule（只读，禁止改动）
├── dsh-research/          # 核心 TS bundle：领域层 + 运行时插件 + skills + 脚本
│   ├── src/core/                 # 核心领域对象：goal / dag / claim / evidence / verification / artifact
│   ├── src/memory/               # 五类 Research Memory（semantic/episodic/artifact/hypothesis/evidence）
│   ├── src/agents/               # Literature / Reviewer / Experiment 三角色
│   ├── src/research-director/ + 三个 loop/   # 调度与三条循环
│   ├── src/experiment/           # 实验层：stats / RouteEngineSim / FRR·VPP 适配器 / 自动战役
│   ├── src/plugin.ts             # dsh 运行时插件入口（Cordis）
│   ├── patches/                  # bundle patch（组合树注入）
│   ├── skills/                   # 领域技能：bgp / rpki / bgpsec / fcbgp / paper-review / experiment
│   └── scripts/                  # deploy-profile.sh / runtime-smoke.mjs
├── profiles/              # 可部署 Profile 模板（research）
├── research/              # 研究产出（报告 / 实验数据 / 实验脚本）
├── AGENTS.md / TODO.md    # dsh research 操作手册与路线图
└── .gitmodules            # 声明 deepseek-harness 为 submodule
```

## 快速开始

前置：已全局安装 `dsh`（npm），可从 `$DSH_HOME`（默认 `~/.dsh`）启动 profile。

```bash
# 1. 部署 research profile 到 $DSH_HOME（symlink 指向本仓库，改代码免重装）
cd /Users/basil/2500/agents/research-agents
DSH_HOME="$HOME/.dsh" ./dsh-research/scripts/deploy-profile.sh

# 2. 验证组合树（应出现 web + dsh-research-core 等行）
DSH_HOME="$HOME/.dsh" dsh --profile research --dump-config | grep -E "web|dsh-research-core"

# 3. 运行（dsh research 即 dsh --profile research；research profile 基于 web，启动 Web UI）
dsh research
#   → 浏览器打开 DeepSeek Harness Web UI（默认 http://127.0.0.1:3080/），
#     web 基座不接受位置参数，科研任务在浏览器会话里交互执行。
#     research 层（reviewer/experiment/autonomous 服务 + 13 个 research_* 工具）挂在会话里。
#   不想自动开浏览器：dsh research --no-open；改端口：dsh research --port 8080

```

> 若提示 `profile "research" does not exist`：profile 尚未部署到 `$DSH_HOME`，
> 先执行第 1 步的 `deploy-profile.sh`。重跑 deploy 会刷新 `package.json` 与
> `cordis.patch.yml`。

## Profile 前端

`profiles/research` 在 **web 基座**上实现（与 `dsh --profile web` 同构，仅多叠
`@basil/dsh-research` 领域层）：bundle = `@deepseek-ai/dsh-base` +
`@deepseek-ai/dsh-web-app` + `@basil/dsh-research`。因此 `dsh research` 启动的是
**Web UI**（浏览器会话），而非 headless 一次性 CLI——位置参数任务已不再支持，
科研交互（research_autonomous / research_campaign 等）在 web 会话中完成。

## 模型路由（401 问题）

dsh 生态分两层模型默认值：

- **base 默认** `deepseek-official` 使用环境变量 / credential-ref `DEEPSEEK_API_KEY`；
  若该 key 是占位值（如本机 `.credentials.yaml` 里的 `0731`），会 401。
- **本 profile** 与 dsh web 一致，走本地 **interval DSV4 网关**：
  `llm-pi-ai` 提供 provider `local-interval-dsv4`（OpenAI 兼容，
  `baseURL http://10.2.165.201:8232/v1`），key 取自 credential-ref
  `LOCAL_INTERVAL_DSV4_API_KEY`；`agent-default-model` 把默认模型切到 `dsv4flash`。

两层 overlay 已固化在 `profiles/research/cordis.patch.yml`（web 同款）。
`baseURL` 是本机内网地址，改配置只需编辑该文件后重跑 deploy。
若其他 profile（如 `dsh headless`）报 401，把同样的两层 overlay 加到
对应 profile（如 `~/.dsh/profiles/headless/cordis.patch.yml`）即可。

## 验证

不依赖 dsh 的单元测试：

```bash
cd dsh-research
node --test "src/**/*.test.ts"   # core + memory + agents + director + experiment + writer + jobs + scheduler + self-improve + plugin 全绿（69/69）
```

dsh 真实运行树内的冒烟测试：

```bash
DSH_HOME=/tmp/dsh-home ./dsh-research/scripts/deploy-profile.sh
DSH_HOME=/tmp/dsh-home node dsh-research/scripts/runtime-smoke.mjs   # → SMOKE PASS
```

## 开发约定（黄金规则）

1. **不 fork、不修改 `deepseek-harness/`**，只当只读 submodule 参考。
2. 新能力 = 独立 bundle / plugin / profile / patch 层；只消费 dsh 的公开 seam。
3. 模型是 provider，不是 agent 本体；保持 provider-neutral，随时切换。
4. 研究产出与实验 artifact 必须可追溯、可归档。
5. 详细开发规范见 `AGENTS.md`，路线图见 `TODO.md`。
