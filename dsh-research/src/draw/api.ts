// src/draw/api.ts — api provider（OpenAI 兼容 images API）的请求组装 + 响应解析（纯函数）。
//
// 侧边栏填 baseURL / apiKey / modelId（apiKey 支持 `${VAR}` 环境变量引用）：
//   POST {baseURL}/images/generations
//   headers: Authorization: Bearer <apiKey>, Content-Type: application/json
//   body: { model, prompt, n: 1, size, quality, response_format: 'b64_json', seed? }
// 响应双收：data[0].b64_json（base64）或 data[0].url（下载）；size 失败（400/422）时
// 由调用方按 sizePolicy 回退最近标准档（见 dimensions.nearestStandardSize）。
// 本文件只做组装/解析，IO（fetch/落盘）由 host 插件注入执行。
import type { Quality } from './dimensions.ts';
import { QUALITY_STEPS } from './dimensions.ts';

/** api 端运行配置（侧边栏可覆盖）。 */
export interface ApiConfig {
  baseURL?: string;
  apiKey?: string;
  modelId?: string;
  outputRoot?: string;
  /** OpenAI 兼容端点失败时的重试模式（默认由尺寸策略驱动）。 */
  quality?: Quality;
}

/** api 请求输入（尺寸已由 dimensions.sizeFor 解析好）。 */
export interface ApiRequestInput {
  prompt: string;
  quality: Quality;
  size: string;
  seed?: number;
  negativePrompt?: string;
}

export interface ApiRequestSpec {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** 展开 `${VAR}` 环境变量引用（apiKey 等可写 `${LOCAL_DSV4_KEY}`）；未定义保持原样。 */
export function expandEnvVar(value: string, env: Record<string, string | undefined> = process.env): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (raw, name: string) => env[name] ?? raw);
}

/** 拼 images/generations 端点：baseURL 已以 /images/generations 结尾则原样，否则追加。 */
export function imagesGenerationsUrl(baseURL: string): string {
  const b = baseURL.trim().replace(/\/+$/, '');
  if (b.endsWith('/images/generations')) return b;
  return `${b}/images/generations`;
}

/** 组装 openai-compatible 请求体（n 恒 1；seed 可选透传；负向可选 negative_prompt）。 */
export function buildApiPayload(input: ApiRequestInput, modelId: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: modelId,
    prompt: input.prompt,
    n: 1,
    size: input.size,
    quality: input.quality,
    response_format: 'b64_json',
  };
  if (typeof input.seed === 'number' && Number.isFinite(input.seed)) payload.seed = input.seed;
  if (input.negativePrompt && input.negativePrompt.trim()) payload.negative_prompt = input.negativePrompt.trim();
  return payload;
}

/** 组装完整请求（URL + headers + body）。 */
export function buildApiRequest(cfg: ApiConfig, input: ApiRequestInput): ApiRequestSpec {
  const modelId = (cfg.modelId ?? '').trim() || 'qwen-image-2.1';
  const apiKey = expandEnvVar((cfg.apiKey ?? '').trim());
  const url = imagesGenerationsUrl(cfg.baseURL ?? 'http://localhost/v1');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  return { url, headers, body: buildApiPayload(input, modelId) };
}

/** API 响应里解析出图片数据（b64_json | url 双收）；无 → null。 */
export function resolveApiResponseData(value: unknown): { kind: 'b64'; data: string; format?: string } | { kind: 'url'; url: string } | null {
  if (typeof value !== 'object' || value === null) return null;
  const data = (value as Record<string, unknown>).data;
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0];
  if (typeof first !== 'object' || first === null) return null;
  const b64 = (first as Record<string, unknown>).b64_json;
  if (typeof b64 === 'string' && b64.length > 0) return { kind: 'b64', data: b64, format: typeof (first as Record<string, unknown>).format === 'string' ? (first as Record<string, unknown>).format as string : undefined };
  const url = (first as Record<string, unknown>).url;
  if (typeof url === 'string' && url.length > 0) return { kind: 'url', url };
  return null;
}

/** 解析 base64 PNG/JPEG 为 Buffer（默认输出用 PNG 文件名；format=jpeg 时也按内容写）。 */
export function base64ToBuffer(b64: string): Buffer {
  const clean = b64.replace(/^data:[^;]+;base64,/, '');
  return Buffer.from(clean, 'base64');
}

/** 从 OpenAI 兼容响应 JSON 提取图片 buffer + 内容类型（fallback 到指定扩展名）。 */
export function resolveImageBuffer(value: unknown, fallbackExt: 'png' | 'jpg' = 'png'): { buffer: Buffer; contentType: string; ext: 'png' | 'jpg' } | null {
  const data = resolveApiResponseData(value);
  if (!data) return null;
  if (data.kind === 'b64') {
    const ext = data.format === 'jpeg' || /^image\/(jpeg|jpg)$/.test(data.format ?? '') ? 'jpg' : fallbackExt;
    return { buffer: base64ToBuffer(data.data), contentType: `image/${ext === 'jpg' ? 'jpeg' : 'png'}`, ext };
  }
  return null;
}

/** 画质步骤（供 UI 展示 api 模式的 "steps≈quality" 口径；api 请求本身不带 steps 字段）。 */
export function qualityApproxSteps(quality: Quality): number {
  return QUALITY_STEPS[quality] ?? 50;
}
