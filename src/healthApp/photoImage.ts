/**
 * Server side of meal photos: whatever the phone sent becomes an image the vision model accepts.
 *
 * The app normally shrinks a photo to a ~1280 px JPEG before upload. When the phone's browser
 * can't open the file (HEIC/HEIF from phones set to "high efficiency" photos, or a very large
 * camera JPEG), the app sends the original bytes instead and this converts them here:
 * HEIC/HEIF is decoded and re-encoded as JPEG, and anything too big is scaled down. The type is
 * read from the bytes, not trusted from the browser, which often reports "" or the wrong type.
 * Pure JS/WASM decoders, so no native build and no paid service.
 */
import decodeHeic from "heic-decode";
import jpeg from "jpeg-js";

export type VisionMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
export type SniffedType = VisionMediaType | "image/heic" | "image/avif";

/** Longest edge the vision model uses without scaling it down itself. */
export const VISION_MAX_PX = 1568;
/** The vision API's per-image limit is 5 MB; stay under it. */
export const VISION_MAX_BYTES = 4_500_000;
/** Biggest photo we'll decode (a 108 MP sensor is ~108). Guards server memory. */
const MAX_DECODE_MP = 120;

export type PreparedPhoto =
  | { ok: true; image: string; mediaType: VisionMediaType; converted: boolean }
  | { ok: false; error: "photo_format" | "photo_too_large"; message: string };

const FORMAT_MESSAGE = "I couldn't open that photo's format. Try taking it again with the camera button, or pick a JPEG.";
const TOO_LARGE_MESSAGE = "That photo is too large to send. Try taking it again with the camera button.";

/** Image type from the first bytes ("magic numbers"), or null if it isn't an image we know. */
export function sniffImageType(buf: Uint8Array): SniffedType | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  const ascii = (from: number, to: number) => String.fromCharCode(...buf.subarray(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  // ISO base media file: [size]["ftyp"][major brand]… HEIC/HEIF and AVIF share this shape.
  if (ascii(4, 8) === "ftyp") {
    const boxEnd = Math.min(buf.length, Math.max(16, (buf[0]! << 24) | (buf[1]! << 16) | (buf[2]! << 8) | buf[3]!));
    const brands: string[] = [ascii(8, 12)];
    for (let i = 16; i + 4 <= boxEnd; i += 4) brands.push(ascii(i, i + 4));
    if (brands.some((b) => b === "avif" || b === "avis")) return "image/avif";
    if (brands.some((b) => ["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"].includes(b))) return "image/heic";
  }
  return null;
}

/** Area-average downscale of RGBA pixels so the longest edge is at most `maxPx`. */
export function downscaleRgba(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  maxPx: number,
): { data: Uint8Array; width: number; height: number } {
  const scale = Math.min(1, maxPx / Math.max(width, height));
  if (scale === 1) return { data: data instanceof Uint8Array ? data : new Uint8Array(data.buffer, data.byteOffset, data.byteLength), width, height };
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const out = new Uint8Array(w * h * 4);
  const sx = width / w;
  const sy = height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.min(height, Math.floor((y + 1) * sy)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.min(width, Math.floor((x + 1) * sx)));
      let r = 0, g = 0, b = 0, a = 0;
      for (let yy = y0; yy < y1; yy++) {
        let i = (yy * width + x0) * 4;
        for (let xx = x0; xx < x1; xx++, i += 4) {
          r += data[i]!; g += data[i + 1]!; b += data[i + 2]!; a += data[i + 3]!;
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      const o = (y * w + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
    }
  }
  return { data: out, width: w, height: h };
}

function toJpeg(px: { data: Uint8Array | Uint8ClampedArray; width: number; height: number }): Buffer {
  const small = downscaleRgba(px.data, px.width, px.height, VISION_MAX_PX);
  return jpeg.encode({ data: small.data, width: small.width, height: small.height }, 82).data;
}

/**
 * Turns the uploaded base64 into something the vision model takes: JPEG/PNG/WebP/GIF under the
 * size limit pass through untouched; HEIC/HEIF is converted; an oversized JPEG is scaled down.
 */
export async function preparePhotoForVision(base64: string, opts: { maxBytes?: number } = {}): Promise<PreparedPhoto> {
  const maxBytes = opts.maxBytes ?? VISION_MAX_BYTES;
  const buf = Buffer.from(base64, "base64");
  const type = sniffImageType(buf);
  if (!type || type === "image/avif") return { ok: false, error: "photo_format", message: FORMAT_MESSAGE };
  if (type !== "image/heic" && buf.length <= maxBytes) return { ok: true, image: base64, mediaType: type, converted: false };
  try {
    if (type === "image/heic") {
      const img = await decodeHeic({ buffer: buf });
      if (img.width * img.height > MAX_DECODE_MP * 1_000_000) return { ok: false, error: "photo_too_large", message: TOO_LARGE_MESSAGE };
      return { ok: true, image: toJpeg(img).toString("base64"), mediaType: "image/jpeg", converted: true };
    }
    if (type === "image/jpeg") {
      const img = jpeg.decode(buf, { useTArray: true, maxResolutionInMP: MAX_DECODE_MP, maxMemoryUsageInMB: 1024 });
      return { ok: true, image: toJpeg(img).toString("base64"), mediaType: "image/jpeg", converted: true };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/maxResolutionInMP|maxMemoryUsage/i.test(message)) return { ok: false, error: "photo_too_large", message: TOO_LARGE_MESSAGE };
    return { ok: false, error: "photo_format", message: FORMAT_MESSAGE };
  }
  // A PNG/WebP/GIF over the limit: the app always sends those as small JPEGs, so this is rare.
  return { ok: false, error: "photo_too_large", message: TOO_LARGE_MESSAGE };
}
