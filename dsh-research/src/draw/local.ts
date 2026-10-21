// src/draw/local.ts — local provider（mflux CLI 调 Qwen-Image-2.1）的命令组装 + 进度解析。
//
// 参考调用方式（用户提供，2026-10-21）：
//   mflux-generate-qwen-2.1 \
//     --model ~/llm/models/Qwen-Image-2.1 \
//     --steps 50 --seed 42 --width 768 --height 1024 \
//     --output ~/Downloads/outputs/images/test.png \
//     --prompt "科研绘图：bgp路由"
// edit 模式（垫图 1 张，v1 仅 local）：追加 --image-path <ref> --image-strength <strength>
// （mflux qwen21 的 image_to_image 参数；style 0.4 / content 0.7 预设由调用方换算）。
// 纯函数：只组装 spawn args，不执行进程；单测覆盖全参数断言。
import { expandHome } from './paths.ts';
import type { DrawMode, Quality } from './dimensions.ts';
import { QUALITY_STEPS } from './dimensions.ts';

/** local 端执行的最小必需配置。 */
export interface LocalConfig {
  /** mflux 生成 CLI 绝对/相对路径（默认解析 ~/.local/bin/mflux-generate-qwen-2.1）。 */
  bin?: string;
  /** Qwen-Image-2.1 本地模型目录（默认 ~/llm/models/Qwen-Image-2.1）。 */
  model?: string;
  /** 默认推理步数（画质档未显式给出时用）。 */
  defaultSteps?: number;
  /** 默认 seed（用户例 42）。 */
  defaultSeed?: number;
  /** 默认量化档（可选；如 8 = q8）。 */
  quantize?: number;
  /** 默认生成目录（输出根；固定再追加 images/ 子目录）。 */
  outputRoot?: string;
}

/** local txt2img / edit 的参数输入（resolved 已算好宽高压通用）。 */
export interface LocalArgsInput {
  prompt: string;
  mode: DrawMode;
  quality: Quality;
  steps?: number;
  seed?: number;
  width: number;
  height: number;
  outputPath: string;
  negativePrompt?: string;
  guidance?: number;
  quantize?: number;
  /** edit 模式：参考图路径（已由 host 落盘到临时文件）。 */
  imagePath?: string;
  /** edit 模式：强度 0.3–1.0（style 0.4 / content 0.7 预设由调用方换算）。 */
  imageStrength?: number;
}

/** 默认 local 配置（与用户参考调用一致：model 在 ~/llm/models、bin 在 ~/.local/bin）。 */
export function defaultLocalConfig(): LocalConfig {
  return {
    bin: 'mflux-generate-qwen-2.1',
    model: '~/llm/models/Qwen-Image-2.1',
    defaultSteps: 50,
    defaultSeed: 42,
    outputRoot: '~/Downloads/outputs',
  };
}

/**
 * 组装 mflux spawn args（不含进程启动）。
 * @param cfg   CLI 配置（bin/model/默认值）；model 的 `~/` 会展开。
 * @param input 本次生成参数（width/height/outputPath 已由调用方解析好）。
 */
export function buildLocalArgs(cfg: LocalConfig, input: LocalArgsInput): string[] {
  const model = expandHome(cfg.model ?? defaultLocalConfig().model!);
  const steps = input.steps ?? QUALITY_STEPS[input.quality] ?? cfg.defaultSteps ?? 50;
  const seed = input.seed ?? cfg.defaultSeed ?? 42;
  const args: string[] = [
    '--model', model,
    '--prompt', input.prompt,
    '--steps', String(steps),
    '--seed', String(seed),
    '--width', String(input.width),
    '--height', String(input.height),
    '--output', input.outputPath,
  ];
  if (input.mode === 'edit' && input.imagePath) {
    args.push('--image-path', input.imagePath);
    if (typeof input.imageStrength === 'number' && Number.isFinite(input.imageStrength)) {
      args.push('--image-strength', String(Math.min(1, Math.max(0.3, input.imageStrength))));
    }
  }
  if (input.negativePrompt && input.negativePrompt.trim()) args.push('--negative-prompt', input.negativePrompt.trim());
  if (typeof input.guidance === 'number' && Number.isFinite(input.guidance)) args.push('--guidance', String(input.guidance));
  const quantize = input.quantize ?? cfg.quantize;
  if (typeof quantize === 'number' && Number.isInteger(quantize) && quantize > 0) args.push('--quantize', String(quantize));
  return args;
}

/**
 * 从 mflux stderr/stdout 一行解析进度（0..1）。tqdm 输出形如 ` 50%|███ | 25/50 [...]`，
 * 也兼容 `Step: 25/50`；取「分母在 2..120 且与 numerator 匹配」的最后一组分数。无 → null。
 */
export function parseMfluxProgress(line: string): number | null {
  const re = /(\d{1,3})\s*\/\s*(\d{1,3})/g;
  let m: RegExpExecArray | null;
  let best: number | null = null;
  while ((m = re.exec(line)) !== null) {
    const n = Number(m[1]);
    const d = Number(m[2]);
    if (d >= 2 && d <= 120 && n >= 0 && n <= d) {
      const p = n / d;
      if (p > (best ?? -1)) best = p;
    }
  }
  return best;
}
