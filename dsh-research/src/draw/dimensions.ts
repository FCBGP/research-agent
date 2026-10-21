// src/draw/dimensions.ts — 科研绘图参数口径：比例 × 分辨率（长边）→ 像素尺寸。
//
// 纯函数（无 IO），供 host 侧（plugin-draw）+ 单测直接复用：
//   - 比例 10 种（16:9 默认）、分辨率按**长边** 1K=1024 / 2K=2048 / 4K=4096（2K 默认）
//   - local：长边 × 比例算另一短边，再 32 倍数对齐（mflux/MLX 张量约束）
//   - api：OpenAI 兼容 images API 只认少量标准档位 → 先发精确 WxH，失败回退最近标准尺寸
//     （sizePolicy = exact-then-fallback | standard-only；"标准尺寸兜底表" + 最近邻选择）
export type AspectRatio = '21:10' | '21:9' | '16:10' | '16:9' | '4:3' | '3:2' | '1:1' | '2:3' | '3:4' | '9:16';
export type Resolution = '1K' | '2K' | '4K';
export type Quality = 'low' | 'medium' | 'high';
export type SizePolicy = 'exact-then-fallback' | 'standard-only';

/** 生成模式：文生图 / 以图生图（edit 垫图 v1 仅 local）。 */
export type DrawMode = 'txt2img' | 'edit';

/** 比例序（默认项 16:9 放首便于 UI 默认选中）。 */
export const ASPECT_RATIOS: readonly AspectRatio[] = [
  '16:9', '21:10', '21:9', '16:10', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16',
];

/** 分辨率枚举（按长边）。 */
export const RESOLUTIONS: readonly Resolution[] = ['1K', '2K', '4K'];

/** 分辨率 → 长边像素。 */
export const RESOLUTION_LONG_EDGE: Record<Resolution, number> = { '1K': 1024, '2K': 2048, '4K': 4096 };

/** 画质枚举 + 对应 mflux 推理步数（低20·中30·高50，默认 高=50）。 */
export const QUALITIES: readonly Quality[] = ['low', 'medium', 'high'];
export const QUALITY_STEPS: Record<Quality, number> = { low: 20, medium: 30, high: 50 };

/** 默认比例 / 分辨率 / 画质（侧边栏与工具兜底共用。 */
export const DEFAULT_ASPECT: AspectRatio = '16:9';
export const DEFAULT_RESOLUTION: Resolution = '2K';
export const DEFAULT_QUALITY: Quality = 'high';

/** 32 倍数对齐（mflux 像素约束：宽高需为 16/32 倍数）。 */
export function align32(value: number): number {
  return Math.max(32, Math.round(value / 32) * 32);
}

/** 解析 "w:h" 比例字符串 → [w, h]；非法返回 null。 */
export function parseAspect(aspect: string): [number, number] | null {
  const m = /^\s*(\d{1,5})\s*[:：/x]\s*(\d{1,5})\s*$/.exec(aspect);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return [w, h];
}

/** 比例字符串 → 横竖朝向（'landscape' | 'portrait' | 'square'）。 */
export function aspectOrientation(aspect: string): 'landscape' | 'portrait' | 'square' {
  const p = parseAspect(aspect);
  if (!p) return 'landscape';
  if (p[0] === p[1]) return 'square';
  return p[0] > p[1] ? 'landscape' : 'portrait';
}

/** 按长边 + 比例计算未对齐的 { width, height }（未做 32 对齐）。 */
export function baseSize(aspect: AspectRatio | string, longEdge: number): { width: number; height: number } {
  const p = parseAspect(aspect);
  if (!p) return { width: longEdge, height: longEdge };
  const [aw, ah] = p;
  if (aw >= ah) return { width: longEdge, height: Math.max(1, Math.round((longEdge * ah) / aw)) };
  return { width: Math.max(1, Math.round((longEdge * aw) / ah)), height: longEdge };
}

export interface SizeResult {
  /** 实际请求宽高（local 已 32 对齐；api 为精确值）。 */
  width: number;
  height: number;
  /** 分辨率长边像素（覆盖宽高后可能不再是实际长边，如实标注）。 */
  longEdge: number;
  /** 宽高覆盖时原始尺寸（用于校验边界）。 */
  aspect: string;
  orientation: 'landscape' | 'portrait' | 'square';
  /** api 侧请求尺寸字符串（"WxH"）。 */
  apiSize: string;
  /** api 侧兜底标准尺寸（sizePolicy=standard-only 时直接用它；exact-then-fallback 失败也用它）。 */
  apiFallback: string;
}

/** OpenAI 兼容 images API 的标准尺寸档位（不同模型支持档各异；覆盖常见横/竖/方）。 */
export const OPENAI_STANDARD_SIZES: readonly string[] = [
  '256x256', '512x512', '1024x1024',
  '1792x1024', '1024x1792', // 横/竖 16:9 档
  '1536x1024', '1024x1536', // 横/竖 3:2 档
];

/** 在标准尺寸表里找与 {w,h} 欧氏距离最近的一档。 */
export function nearestStandardSize(w: number, h: number): string {
  let best = '1024x1024';
  let bestDist = Infinity;
  for (const size of OPENAI_STANDARD_SIZES) {
    const [sw, sh] = size.split('x').map(Number);
    const d = (sw - w) ** 2 + (sh - h) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = size;
    }
  }
  return best;
}

/** 越界校验：宽高须落在 [min,max]（本项目下限 256、上限 4096，与分辨率档位一致）。 */
export function clampSize(value: number, min = 256, max = 4096): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * sizeFor —— 核心尺寸计算。
 * @param aspect   比例（默认 16:9）
 * @param resolution 分辨率长边档（默认 2K）
 * @param overrides 可选宽高覆盖 { width, height }；提供时以覆盖为准（先 clamp，local 再 32 对齐）
 * @param mode     'local'（32 对齐）| 'api'（精确 + 标准兜底）
 * @param policy   api 尺寸策略（exact-then-fallback | standard-only；默认 exact-then-fallback）
 */
export function sizeFor(
  aspect: AspectRatio | string = DEFAULT_ASPECT,
  resolution: Resolution = DEFAULT_RESOLUTION,
  overrides?: { width?: number; height?: number },
  mode: 'local' | 'api' = 'local',
  policy: SizePolicy = 'exact-then-fallback',
): SizeResult {
  const longEdge = RESOLUTION_LONG_EDGE[resolution] ?? RESOLUTION_LONG_EDGE[DEFAULT_RESOLUTION];
  const p = parseAspect(aspect);
  const [aw, ah] = p ?? [1, 1];
  const base = baseSize(aspect, longEdge);
  let width = base.width;
  let height = base.height;
  if (overrides?.width && overrides.width > 0) {
    width = clampSize(Math.round(overrides.width));
    // 只覆盖宽 → 高按原始比例重算（未提供侧仍按比例）
    if (!(overrides.height && overrides.height > 0)) {
      height = Math.max(1, Math.round((width * ah) / aw));
    }
  }
  if (overrides?.height && overrides.height > 0) {
    height = clampSize(Math.round(overrides.height));
    // 只覆盖高 → 宽按原始比例重算
    if (!(overrides.width && overrides.width > 0)) {
      width = Math.max(1, Math.round((height * aw) / ah));
    }
  }
  if (mode === 'local') {
    width = align32(width);
    height = align32(height);
  }
  const apiSize = `${width}x${height}`;
  const apiFallback = nearestStandardSize(width, height);
  return {
    width,
    height,
    longEdge,
    aspect,
    orientation: aspectOrientation(aspect),
    apiSize: policy === 'standard-only' ? apiFallback : apiSize,
    apiFallback,
  };
}
