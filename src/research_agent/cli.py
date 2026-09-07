"""CLI 入口:research-agent 命令。

用法:
  research-agent "你的研究问题"
  research-agent --interactive      # 交互式对话
"""

from __future__ import annotations

import argparse


def _run_once(query: str) -> None:
    from .loop import run_agent

    print(f"\n=== 研究任务: {query} ===", flush=True)
    result = run_agent(query)
    print(f"\n=== 最终结论 ===\n{result}", flush=True)


def _interactive(session: str = "interactive") -> None:
    from . import memory
    from .loop import run_agent

    print("科研智能体(本地 LLM)。输入研究问题,空行退出。")
    print("每轮结论自动存入外部记忆,下一轮可延续。")
    while True:
        try:
            query = input("\n你: ")
        except (EOFError, KeyboardInterrupt):
            break
        if not query.strip():
            break
        # 跨会话延续:注入上轮摘要作任务背景
        prior = memory.resume(session)
        if prior:
            query = f"(延续上一轮摘要: {prior[:400]})\n新问题: {query}"
        print(f"\n=== 任务: {query} ===", flush=True)
        result = run_agent(query, session=session)
        print(f"\n=== 结论 ===\n{result}", flush=True)
    print("再见!")


# --type 输出格式:把已生成的 md 报告按需再转成 docx/pptx/code。
_FORMAT_ALIASES = {"doc": "docx", "ppt": "pptx", "image": "figures", "slide": "pptx", "word": "docx"}


def _normalize_formats(typestr: str) -> list[str]:
    """把 --type 字符串规范化成格式列表,支持逗号多选与别名。"""
    out = []
    for tok in typestr.split(","):
        tok = tok.strip().lower()
        if not tok:
            continue
        tok = _FORMAT_ALIASES.get(tok, tok)
        if tok not in out and tok in ("md", "docx", "pptx", "code", "figures"):
            out.append(tok)
    return out or ["md"]


def _emit_code(md_text: str, stem: str) -> None:
    """从 md 报告抽取 fenced code blocks 到 output/codes/<stem>.*。"""
    import re
    from pathlib import Path
    from . import config as _cfg
    blocks = re.findall(r"```(?:(\w+)[^\n]*\n)?(.*?)```", md_text, re.S)
    if not blocks:
        return
    codes_dir = Path(_cfg.output_path("codes", stem))
    codes_dir.mkdir(parents=True, exist_ok=True)
    for i, (lang, body) in enumerate(blocks, 1):
        ext = {"py": "py", "python": "py", "sh": "sh", "bash": "sh", "c": "c",
               "cpp": "cpp", "go": "go", "js": "js", "sql": "sql"} \
            .get(lang.strip().lower(), "txt")
        p = codes_dir / f"{stem}_{i}.{ext}"
        p.write_text(body.strip() + "\n", encoding="utf-8")
        print(f"[报告] code 已写入 output/codes/{stem}/{stem}_{i}.{ext}", flush=True)


def _emit_formats(md_path: str, formats: list[str], template: str = "") -> None:
    """按 --type 把 md 报告转成 docx/pptx/code;md 本身已由 run_agent 产出。"""
    from pathlib import Path
    from . import config as _cfg
    md_path = Path(md_path)
    stem = md_path.name.replace(".md", "")
    for fmt in formats:
        if fmt == "docx":
            from .md2docx import md_file_to_docx
            docx_path = _cfg.output_path("docs", stem + ".docx")
            md_file_to_docx(str(md_path), docx_path, template)
            print(f"[报告] docx 已写入 output/docs/{stem}.docx", flush=True)
        elif fmt == "pptx":
            import subprocess
            pptx_path = _cfg.output_path("slides", stem + ".pptx")
            subprocess.run(["pandoc", str(md_path), "-o", str(pptx_path)], check=True)
            print(f"[报告] pptx 已写入 output/slides/{stem}.pptx", flush=True)
        elif fmt == "code":
            _emit_code(md_path.read_text(encoding="utf-8"), stem)
        # figures:图已由章节生成({{fig|...}}→PNG)落 output/figures/,无需额外动作


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="本地科研智能体")
    parser.add_argument("query", nargs="?", help="研究问题(一次性)")
    parser.add_argument("-i", "--interactive", action="store_true", help="交互式对话")
    parser.add_argument("-t", "--turns", type=int, default=None, help="工具调用轮数上限")
    parser.add_argument("-s", "--session", type=str, default="default", help="会话名(外部记忆/跨会话延续)")
    parser.add_argument("-d", "--debate", type=str, help="对一个 idea 多智能体辩论(反复讨论到定论)")
    parser.add_argument("-r", "--rounds", type=int, default=None, help="辩论轮数")
    parser.add_argument("-l", "--longdoc", type=str, help="长文档生成主题(分段生成)")
    parser.add_argument("-c", "--chars", type=int, default=100000, help="长文档目标字数(默认10万)")
    parser.add_argument("-f", "--file", type=str, default="long_report.md", help="长文档输出文件")
    parser.add_argument("-w", "--worddoc", type=str, help="Word 长文档主题(固定模板 .docx,图文并茂)")
    parser.add_argument("-wc", "--wchars", type=int, default=10000, help="Word 文档目标字数(默认≥1万)")
    parser.add_argument("-wf", "--wfile", type=str, default="out.docx", help="Word 文档输出文件")
    parser.add_argument("-wo", "--outline", type=str, default="", help="Word 文档必填章节结构")
    parser.add_argument("-wd", "--domain", type=str, default="", help="领域/专业上下文")
    parser.add_argument("-wt", "--wtemplate", type=str, default="", help="Word 参考模板(pandoc --reference-doc)")
    parser.add_argument("--md2docx", type=str, help="把 Markdown 文件转成 Word .docx")
    parser.add_argument("-o", "--out", type=str, default="out.docx", help="md2docx 输出文件")
    parser.add_argument("--template", type=str, default="", help="Word 参考模板(pandoc --reference-doc)")
    parser.add_argument("--serve", action="store_true", help="启动 FastAPI 后端服务")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="后端监听地址")
    parser.add_argument("--port", type=int, default=8000, help="后端端口")
    parser.add_argument("--research", type=str, help="科研任务(走六阶段科研流程)")
    parser.add_argument("-rc", "--rchars", type=int, default=None, help="研究报告目标 hanzi 字数(0/None=自然长度;用 scripts/chcount.py 数)")
    parser.add_argument("--prompt", type=str, default="", help="从 prompts/ 加载完整研究 prompt(文件路径或按主题自动匹配 prompts/<topic>.md)")
    parser.add_argument("--rtemplate", type=str, default="", help="研究报告 Word 模板(指定 templates/<name>.docx 逐项填充;无则自建)")
    parser.add_argument("-m", "--model", type=str, default=None, help="运行时切换模型(覆盖 config.yaml;如 gpt-4o/claude-3-5-sonnet/deepseek-chat)")
    parser.add_argument("-p", "--provider", type=str, default=None, help="运行时切换供应商(openai|claude|gemini|deepseek|glm|kimi|relay|local;覆盖 config.yaml)")
    parser.add_argument("--type", type=str, default="md", help="研究输出格式(逗号分隔): md|docx|pptx|code|figures;默认 md;如 md,docx 同时生成 md 与 Word")
    args = parser.parse_args(argv)

    # 运行时模型/供应商切换:先于任务执行生效
    if args.provider or args.model:
        from . import config as _cfg
        _cfg.set_provider(args.provider or "local", args.model)

    if args.research:
        from .research import run_research
        print(f"\n=== 科研任务(六阶段): {args.research} ===", flush=True)
        result = run_research(args.research, session=args.session,
                              chars=args.rchars, prompt=args.prompt, template=args.rtemplate)
        print(f"\n=== 最终结论 ===\n{result}", flush=True)
        from . import config as _cfg
        _emit_formats(_cfg.report_path("research_" + (args.research[:20].strip() or "agent").replace(" ", "_").replace("?", "") + ".md"),
                      _normalize_formats(args.type), template=args.rtemplate or args.template)
    elif args.md2docx:
        from .md2docx import md_file_to_docx
        print(f"\n=== pandoc 转 Word: {args.md2docx} → {args.out} ===", flush=True)
        result = md_file_to_docx(args.md2docx, args.out, args.template)
        print(f"\n=== 结果 ===\n{result}", flush=True)
    elif args.serve:
        from .server import serve
        serve(host=args.host, port=args.port)
    elif args.worddoc:
        from .worddoc import generate_worddoc_pandoc
        print(f"\n=== Word 文档生成(pandoc 模板): {args.worddoc} (目标 {args.wchars} 字,图文) ===", flush=True)
        result = generate_worddoc_pandoc(args.worddoc, target_chars=args.wchars, filename=args.wfile,
                                         reference_doc=args.wtemplate,
                                         outline=args.outline, domain=args.domain)
        print(f"\n=== 结果 ===\n{result}", flush=True)
    elif args.longdoc:
        from .longdoc import generate_longdoc
        print(f"\n=== 长文档生成: {args.longdoc} (目标 {args.chars} 字) ===", flush=True)
        result = generate_longdoc(args.longdoc, target_chars=args.chars, filename=args.file)
        print(f"\n=== 结果 ===\n{result}", flush=True)
    elif args.debate:
        from .debate import debate
        print(f"\n=== 辩论 idea: {args.debate} ===", flush=True)
        result = debate(args.debate, rounds=args.rounds, session=args.session)
        print(f"\n=== 定论 ===\n{result}", flush=True)
    elif args.interactive:
        _interactive(session=args.session)
    elif args.query:
        from .loop import run_agent

        print(f"\n=== 研究任务: {args.query} ===", flush=True)
        result = run_agent(args.query, max_turns=args.turns, session=args.session,
                           chars=args.rchars, prompt=args.prompt, template=args.rtemplate)
        print(f"\n=== 最终结论 ===\n{result}", flush=True)
        from . import config as _cfg
        _emit_formats(_cfg.report_path("research_" + (args.query[:20].strip() or "agent").replace(" ", "_").replace("?", "") + ".md"),
                      _normalize_formats(args.type), template=args.rtemplate or args.template)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()