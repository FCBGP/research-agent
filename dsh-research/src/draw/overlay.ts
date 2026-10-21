// src/draw/overlay.ts — 两阶段混合（SKILL.md 方案 C，2026-10-21）。
//
// 背景：Qwen-Image-2.1（及多数图片模型）文字生成不可靠——错字、字形错乱、图形错乱。
// 推荐路线 = 两阶段混合：① 图片模型生成「无文字艺术底图」（提示词显式禁文字）；
// ② 用本机 python3 + Pillow 把程序控制的精确文字层合成到底图上（可指定字体/字号/位置/颜色/描边）。
// 整图字都对、位置不遮挡 → 进 paper；任一处错字 → 重抽底图或改走结构化 SVG 方案。
//
// 本文件只做纯函数（可单测、无进程/IO）：
//   - parseOverlayLines     —— 文本区多行标签 → OverlayLabel[]
//   - normalizeOverlayLabel(s) —— 数组标签归一化（裁剪/校验）
//   - buildOverlayScript    —— 内嵌 Python 脚本（静态，逐标签画文字 + 描边 + 位置解析）
//   - buildOverlayCommand   —— 组装 spawn ['-c', script, base, out, labelsJson]
//   - parseOverlayDims      —— 从脚本 stdout 解析 `IMG_DIMS:WxH`
// 进程执行在 plugin-draw.ts 的 /api/research.draw.overlay route（探活 + spawn）。
import { join } from 'node:path';

/** 单条文字标签（位置/样式均为可选；缺省 = 底部居中 + 自动字号 + 白色 + 黑色描边）。 */
export interface OverlayLabel {
  text: string;
  /** 水平锚点：'left' | 'center' | 'right' | 像素 | 百分比字符串（'12%'，相对图宽居中）。 */
  x?: 'left' | 'center' | 'right' | number | string;
  /** 垂直锚点：'top' | 'center' | 'bottom' | 像素 | 百分比字符串（'8%'，相对图高居中）。 */
  y?: 'top' | 'center' | 'bottom' | number | string;
  /** 字号（px）；缺省 ≈ 图宽 4%（自动）。 */
  size?: number;
  /** 颜色：#rrggbb 或命名色（'white'/'black'/…）；缺省白色。 */
  color?: string;
  /** 字体权重：bold 用 Arial Bold / PingFang 等；缺省 regular。 */
  weight?: 'regular' | 'bold';
  /** 是否加黑色描边（缺省 true —— 保证任意底色下文字可读）。 */
  stroke?: boolean;
}

/** 解析文本区多行标签。
 *  每行 = 一个标签，`|` 分隔；`#` 开头（行首）为注释。
 *  支持后缀段：
 *    `x,y`        位置（left/center/right/top/bottom 或像素或百分比，如 10%,8%）
 *    `@字号`      文本字号（px），如 @40
 *    `#颜色`      文本颜色，如 #ffcc00
 *    `b`          加粗（bold 字体族）
 *  例：
 *    BGP 域间路由
 *    自治系统 AS65000|20,15|@40|#ffffff|b
 *  纯函数；非法行跳过（不抛错），空/空行忽略。 */
export function parseOverlayLines(input: string): OverlayLabel[] {
  const out: OverlayLabel[] = [];
  for (const rawLine of String(input ?? '').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const segs = line.split('|').map((s) => s.trim());
    const text = (segs.shift() ?? '').trim();
    if (!text) continue;
    const label: OverlayLabel = { text };
    for (const seg of segs) {
      if (!seg) continue;
      if (seg.startsWith('@')) {
        const size = Number.parseInt(seg.slice(1), 10);
        if (Number.isFinite(size) && size > 0) label.size = size;
        continue;
      }
      if (seg.startsWith('#') && /^#[0-9a-fA-F]{3,8}$/.test(seg)) {
        label.color = seg;
        continue;
      }
      if (seg === 'b') { label.weight = 'bold'; continue; }
      if (seg === 'n') { label.stroke = false; continue; }
      if (seg === 'regular') { label.weight = 'regular'; continue; }
      // 位置段：'x,y' 或单个坐标（left/center/right 视为 x；top/bottom 视为 y；数值视为 x 像素；
      // 纯字母非锚点词视为命名颜色，如 white/black）。
      const anchors = new Set(['left', 'center', 'right', 'top', 'bottom']);
      const pos = seg.split(',').map((s) => s.trim()).filter(Boolean);
      if (pos.length === 1) {
        const v = pos[0];
        if (v === 'left' || v === 'center' || v === 'right') label.x = v;
        else if (v === 'top' || v === 'bottom') label.y = v;
        else if (/^[a-zA-Z][a-zA-Z-]*$/.test(v) && !anchors.has(v)) label.color = v;
        else label.x = v;
      } else {
        if (pos[0]) label.x = pos[0];
        if (pos[1]) {
          const v2 = pos[1];
          if (/^[a-zA-Z][a-zA-Z-]*$/.test(v2) && !anchors.has(v2)) label.color = v2;
          else label.y = v2;
        }
      }
    }
    out.push(label);
  }
  return out;
}

/** 数组标签归一化：逐条裁剪非法、剔除空文本；失效返回 undefined。 */
export function normalizeOverlayLabel(l: OverlayLabel): OverlayLabel | undefined {
  if (!l || typeof l !== 'object') return undefined;
  const text = String(l.text ?? '').trim();
  if (!text) return undefined;
  const label: OverlayLabel = { text };
  if (typeof l.size === 'number' && Number.isFinite(l.size)) label.size = Math.min(300, Math.max(10, Math.round(l.size)));
  if (typeof l.x === 'number') label.x = Math.max(0, l.x);
  else if (typeof l.x === 'string' && l.x.trim()) label.x = l.x.trim();
  else if (typeof l.x === 'string' || typeof l.x === 'number') label.x = l.x;
  if (typeof l.y === 'number') label.y = Math.max(0, l.y);
  else if (typeof l.y === 'string' && l.y.trim()) label.y = l.y.trim();
  if (typeof l.color === 'string' && l.color.trim()) label.color = l.color.trim();
  if (l.weight === 'bold' || l.weight === 'regular') label.weight = l.weight;
  if (typeof l.stroke === 'boolean') label.stroke = l.stroke;
  return label;
}

/** 归一化整组标签（剔除无效项）。 */
export function normalizeOverlayLabels(labels: OverlayLabel[]): OverlayLabel[] {
  return (Array.isArray(labels) ? labels : [])
    .map((l) => normalizeOverlayLabel(l))
    .filter((l): l is OverlayLabel => l !== undefined);
}

/**
 * 内嵌 Python（python3 + Pillow）合成脚本（静态字符串，标签经 argv JSON 传入）。
 * 流程：读底图 → 逐条画文字（字体族 macOS 内置：Arial Bold / PingFang / Helvetica，
 * 缺省回落 PIL load_default）→ 位置解析（锚点/像素/百分比）→ 黑色描边 → 存回新文件 →
 * 打印 `IMG_DIMS:WxH`（host 解析成品宽高）。纯函数：无 IO，仅返回源码文本。
 */
export function buildOverlayScript(): string {
  return `import json, os, sys
from PIL import Image, ImageDraw, ImageFont

def _find_font(bold):
    names = [
        '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
        '/System/Library/Fonts/Supplementary/Arial Bold.ttf',
        '/System/Library/Fonts/PingFang.ttc' if not bold else '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
        '/System/Library/Fonts/Helvetica.ttc',
        '/System/Library/Fonts/Supplemental/Arial.ttf',
        '/System/Library/Fonts/PingFang.ttc',
    ]
    return next((p for p in names if p and os.path.exists(p)), None)

def _font(size, bold):
    p = _find_font(bold)
    if p:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    try:
        return ImageFont.load_default(size)
    except Exception:
        return ImageFont.load_default()

def _resolve(v, extent, text_len, default):
    if v is None:
        return default
    s = str(v).strip()
    if s in ('left', 'top'):
        return 0
    if s == 'center':
        return max(0, (extent - text_len) // 2)
    if s in ('right', 'bottom'):
        return max(0, extent - text_len - 1)
    if s.endswith('%'):
        try:
            f = float(s[:-1]) / 100.0
        except Exception:
            return default
        return max(0, int(f * extent - text_len / 2))
    try:
        return max(0, int(float(s)))
    except Exception:
        return default

base, out, labels_json = sys.argv[1], sys.argv[2], sys.argv[3]
labels = json.loads(labels_json)
img = Image.open(base).convert('RGB')
W, H = img.size
draw = ImageDraw.Draw(img)
margin = max(12, int(H * 0.025))
for L in labels:
    text = str(L.get('text', '')).strip()
    if not text:
        continue
    size = int(L.get('size') or max(16, int(W * 0.035)))
    bold = L.get('weight') == 'bold'
    font = _font(size, bold)
    color = str(L.get('color') or '#ffffff')
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = _resolve(L.get('x'), W, tw, (W - tw) // 2)
    y = _resolve(L.get('y'), H, th, max(0, H - th - margin))
    x = max(0, x - bbox[0])
    y = max(0, y - bbox[1])
    if L.get('stroke', True):
        draw.text((x, y), text, font=font, fill=color,
                  stroke_width=max(1, size // 18), stroke_fill='#000000')
    else:
        draw.text((x, y), text, font=font, fill=color)
os.makedirs(os.path.dirname(out), exist_ok=True)
img.save(out)
print('IMG_DIMS:%dx%d' % (W, H))
`;
}

/** 组装合成命令（pythonBin 已由探活决定）：`-c <script> <base> <out> <labelsJson>`。 */
export function buildOverlayCommand(
  pythonBin: string,
  basePath: string,
  outputPath: string,
  labels: OverlayLabel[],
): { bin: string; args: string[] } {
  const script = buildOverlayScript();
  return {
    bin: pythonBin,
    args: ['-c', script, basePath, outputPath, JSON.stringify(labels)],
  };
}

/** 从脚本 stdout 解析成品宽高（`IMG_DIMS:WxH`；无 → null）。 */
export function parseOverlayDims(stdout: string): { width: number; height: number } | null {
  const m = /IMG_DIMS:(\d+)[xX](\d+)/.exec(String(stdout ?? ''));
  if (!m) return null;
  const width = Number.parseInt(m[1], 10);
  const height = Number.parseInt(m[2], 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}
