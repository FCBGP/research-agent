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
    args = parser.parse_args(argv)

    if args.longdoc:
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
        result = run_agent(args.query, max_turns=args.turns, session=args.session)
        print(f"\n=== 最终结论 ===\n{result}", flush=True)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()