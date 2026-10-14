#!/usr/bin/env node
/**
 * build-client.mjs — 打包右侧栏「TRIZ 发明原理」Tab 的浏览器 bundle 到 lib/client.js。
 *
 * 用 esbuild 把 dsh-research/client/（TS/TSX）打成 CJS 单文件，再套上 DeepSeek 浏览器
 * 模块加载器 ModuleLoader wrapper（与 @deepseek-ai/dsh-client-ui-deliverables/lib/client.js
 * 同构：window.__ModuleLoader__.load({ id, factory })）。浏览器端只依赖宿主模块表提供的
 * react / react/jsx-runtime，@deepseek-ai/* 全部 external（且源码侧都只 import type，
 * 构建时已被剥除）；esbuild 只在文件系统层面读取源码，无需安装 @deepseek-ai 包。
 *
 * esbuild 定位顺序：$ESBUILD_BIN（直接给二进制路径）→ 本地动态 import('esbuild')
 * （dsh-research 装了 devDependency esbuild）→ PATH 里的 esbuild / npx --no-install esbuild。
 * 产出 lib/client.js 提交入库；profile 部署后由 client-modules 扫描 package.json 的
 * dsh.client 声明自动加载。
 */
import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url))) // dsh-research/
const outFile = join(root, 'lib', 'client.js')

/** 浏览器端 external：react 全家桶由宿主模块表提供，@deepseek-ai/* 不进 bundle。 */
const EXTERNALS = ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/*']

/** CLI 兜底：本机没有本地 esbuild 模块时用二进制（$ESBUILD_BIN / PATH / npx）。 */
function buildViaCli() {
  const bin = process.env.ESBUILD_BIN ?? 'esbuild'
  const args = [
    join(root, 'client', 'index.ts'),
    '--bundle', '--format=cjs', '--platform=browser', '--target=es2020',
    '--jsx=automatic', '--loader:.ts=ts', '--loader:.tsx=tsx',
    ...EXTERNALS.flatMap((e) => ['--external:' + e]),
    '--log-level=info',
  ]
  const result = spawnSync(bin, args, { encoding: 'utf8', cwd: root })
  if (result.status !== 0) {
    throw new Error(`esbuild CLI failed (${bin}, status ${result.status ?? 'signal'}):\n${result.stderr ?? result.stdout}`)
  }
  return result.stdout
}

async function main() {
  let body
  try {
    const { build } = await import('esbuild')
    const result = await build({
      entryPoints: [join(root, 'client', 'index.ts')],
      bundle: true,
      format: 'cjs',
      platform: 'browser',
      target: 'es2020',
      jsx: 'automatic',
      loader: { '.ts': 'ts', '.tsx': 'tsx' },
      external: EXTERNALS,
      write: false,
      sourcemap: false,
      logLevel: 'info',
    })
    body = result.outputFiles[0].text
  } catch (moduleOrBuildError) {
    console.warn(`esbuild module unavailable (${moduleOrBuildError instanceof Error ? moduleOrBuildError.message : String(moduleOrBuildError)}); falling back to CLI`)
    body = buildViaCli()
  }
  const wrapped = [
    'window.__ModuleLoader__.load({',
    '\tid: "@basil/dsh-research",',
    '\tfactory: (require) => {',
    '\t\tvar module = { exports: {} };',
    '\t\tvar exports = module.exports;',
    '\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
    body,
    '\t\treturn module.exports;',
    '\t}',
    '});',
    '',
  ].join('\n')
  await mkdir(dirname(outFile), { recursive: true })
  await writeFile(outFile, wrapped, 'utf8')
  console.log(`built: ${outFile} (${wrapped.length} bytes)`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
