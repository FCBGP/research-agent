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


def _interactive() -> None:
    from .loop import run_agent

    print("科研智能体(本地 LLM)。输入研究问题,空行退出。")
    while True:
        try:
            query = input("\n你: ")
        except (EOFError, KeyboardInterrupt):
            break
        if not query.strip():
            break
        print(f"\n=== 任务: {query} ===", flush=True)
        result = run_agent(query)
        print(f"\n=== 结论 ===\n{result}", flush=True)
    print("再见!")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="本地科研智能体")
    parser.add_argument("query", nargs="?", help="研究问题(一次性)")
    parser.add_argument("-i", "--interactive", action="store_true", help="交互式对话")
    parser.add_argument("-t", "--turns", type=int, default=None, help="工具调用轮数上限")
    args = parser.parse_args(argv)

    if args.interactive:
        _interactive()
    elif args.query:
        from .loop import run_agent

        print(f"\n=== 研究任务: {args.query} ===", flush=True)
        result = run_agent(args.query, max_turns=args.turns)
        print(f"\n=== 最终结论 ===\n{result}", flush=True)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()