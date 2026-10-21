// src/draw/paths.ts — 科研绘图输出路径解析：固定 `images/image-YYYYMMDDHHmmSS.png`。
//
// 输出目录规则（用户确认）：outputRoot 可由侧边栏/工具指定（默认 ~/Downloads/outputs），
// 但固定自动追加一个 images/ 子目录；文件命名固定 `image-YYYYMMDDHHmmSS.png`
// （本地时区、秒级时间戳，保证同秒多次生成不覆盖可加序号）。纯函数、无 IO。
import { join } from 'node:path';

/** 输出目录固定子目录名。 */
export const DRAW_OUTPUT_SUBDIR = 'images';

/** 输出文件名前缀 + 扩展名。 */
export const DRAW_OUTPUT_PREFIX = 'image-';
export const DRAW_OUTPUT_EXT = '.png';

/** `image-YYYYMMDDHHmmSS` 的时间戳正则（供测试/校验）。 */
export const DRAW_TIMESTAMP_PATTERN = /^image-(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\.png$/;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * 生成输出文件名（固定格式，本地时区）。
 * @param date 可选时间（测试注入）；缺省 `new Date()`。
 * @param seq  同秒冲突时的序号（0 省略）。
 */
export function drawOutputName(date: Date = new Date(), seq = 0): string {
  const y = date.getFullYear();
  const mo = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  const h = pad2(date.getHours());
  const mi = pad2(date.getMinutes());
  const s = pad2(date.getSeconds());
  return `${DRAW_OUTPUT_PREFIX}${y}${mo}${d}${h}${mi}${s}${seq > 0 ? `-${seq}` : ''}${DRAW_OUTPUT_EXT}`;
}

/** 展开 `~/` 用户主目录前缀（仅路径解析；不访问文件系统）。 */
export function expandHome(path: string, home = process.env.HOME ?? ''): string {
  if (path === '~') return home;
  if (path.startsWith('~/')) return join(home, path.slice(2));
  return path;
}

/**
 * 计算输出文件完整路径：`<outputRoot>/images/image-YYYYMMDDHHmmSS.png`。
 * outputRoot 可含 `~/` 前缀（展开为 HOME）。保证 images/ 子目录固定附加。
 */
export function drawOutputPath(outputRoot: string, date: Date = new Date(), home = process.env.HOME ?? ''): string {
  return join(expandHome(outputRoot, home), DRAW_OUTPUT_SUBDIR, drawOutputName(date));
}
