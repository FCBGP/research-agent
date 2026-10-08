# profiles/ — 可部署的 dsh Profile 模板源

`$DSH_HOME/profiles/<name>/` 下的目录即为一个可启动的 profile。本目录保存 profile 模板
（独立于机器上的 `$DSH_HOME`）；**一键部署用 `dsh-research/scripts/deploy-profile.sh`**。

## research

`dsh.profile.bundles` = `@deepseek-ai/dsh-base` + `@basil/dsh-research`（顺序即叠加顺序）。
领域专用配置（模型路由、BGP/RPKI 词汇、policy）经 `cordis.patch.yml` 与
`dsh-research/patches/*.yml` 注入。

### 部署与验证

```bash
# 部署：复制模板 + symlink 本仓库 dsh-research 到 profile
DSH_HOME=/tmp/dsh-home ./dsh-research/scripts/deploy-profile.sh

# 组合验证：dump-config 应出现 `# == @basil/dsh-research` 与 `dsh-research-core` 行
DSH_HOME=/tmp/dsh-home dsh --profile research --dump-config | grep -A3 dsh-research

# 运行时验证（在 dsh 真实运行树内）：
DSH_HOME=/tmp/dsh-home node dsh-research/scripts/runtime-smoke.mjs   # → SMOKE PASS
```

> 说明：bundle 包 `@basil/dsh-research` 同时扮演两个角色 —— bundle（声明 patch）与
> 插件（`main` 指向 `src/plugin.ts`，Node 24 类型剥离直接运行）。运行时解析采用
> two-anchor：安装包优先，其次 profile 目录的 `node_modules`，因此 symlink 即可生效，
> 改代码无需重装。
