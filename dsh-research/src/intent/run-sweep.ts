/**
 * H-UNI 参数扫描 CLI：跑「AS 数 × 事件数 × 多脚本」网格（确定性种子），
 * 渲染成 Markdown 报告（stdout，可选 --out 落盘）。
 *
 * 用法：
 *   node src/intent/run-sweep.ts
 *   node src/intent/run-sweep.ts --as 8,16,32,64 --events 8,16,32,64,96 --scripts 4 --seed 20261016 --out /tmp/h-uni-sweep.md
 */
import { writeFileSync } from 'node:fs';
import { runSweep, sweepToMarkdown, type SweepGridCell } from './sweep.ts';

const DEFAULT_AS = [8, 16, 32, 64];
const DEFAULT_EVENTS = [8, 16, 32, 64, 96];
const DEFAULT_SCRIPTS = 4;
const DEFAULT_SEED = 20261016;

interface CliOpts {
  asCounts: number[];
  eventCounts: number[];
  scriptCount: number;
  seed: number;
  out?: string;
}

function parseList(raw: string | undefined, fallback: readonly number[]): number[] {
  if (raw === undefined) return [...fallback];
  return raw.split(',').map((tok) => {
    const n = Number(tok.trim());
    if (!Number.isInteger(n) || n <= 0) throw new Error(`bad grid number: '${tok}'`);
    return n;
  });
}

function parseIntArg(raw: string | undefined, name: string, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`bad ${name}: '${raw}'`);
  return n;
}

function parseArgs(argv: readonly string[]): CliOpts {
  const opts: CliOpts = {
    asCounts: [...DEFAULT_AS],
    eventCounts: [...DEFAULT_EVENTS],
    scriptCount: DEFAULT_SCRIPTS,
    seed: DEFAULT_SEED,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string => {
      if (i + 1 >= argv.length) throw new Error(`missing value for ${a}`);
      return argv[++i];
    };
    switch (a) {
      case '--as': opts.asCounts = parseList(next(), DEFAULT_AS); break;
      case '--events': opts.eventCounts = parseList(next(), DEFAULT_EVENTS); break;
      case '--scripts': opts.scriptCount = parseIntArg(next(), '--scripts', DEFAULT_SCRIPTS); break;
      case '--seed': opts.seed = parseIntArg(next(), '--seed', DEFAULT_SEED); break;
      case '--out': opts.out = next(); break;
      case '--help':
      case '-h':
        console.log(
          '用法：node src/intent/run-sweep.ts' +
            ' [--as A,A...] [--events E,E...] [--scripts N] [--seed N] [--out FILE]',
        );
        process.exit(0);
      default:
        throw new Error(`unknown arg: ${a}`);
    }
  }
  return opts;
}

function main(): void {
  const o = parseArgs(process.argv.slice(2));
  const cells: SweepGridCell[] = o.asCounts.flatMap((asCount) =>
    o.eventCounts.map((eventCount) => ({ asCount, eventCount, scriptCount: o.scriptCount })),
  );
  const report = runSweep(cells, o.seed);
  const md = sweepToMarkdown(report);
  if (o.out) writeFileSync(o.out, md, 'utf8');
  console.log(md);
}

if (process.argv[1]?.endsWith('run-sweep.ts')) main();
