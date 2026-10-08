# profiles/ — 可部署的 dsh Profile 模板源

`$DSH_HOME/profiles/<name>/` 下的目录即为一个可启动的 profile。
本目录保存 profile 模板（独立于机器上的 `$DSH_HOME`），部署时复制或链接到
`$DSH_HOME/profiles/<name>`，再运行 `dsh plugin add` / `pnpm install` 让
profile 的 out-of-tree 依赖可用。

## research

`dsh.profile.bundles` = `@deepseek-ai/dsh-base` + `@basil/dsh-research`。
领域专用配置（模型路由、BGP/RPKI 词汇、policy）经 `cordis.patch.yml` 与
`dsh-research/patches/*.yml` 注入。
