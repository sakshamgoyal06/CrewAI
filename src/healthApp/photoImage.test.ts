import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import jpeg from "jpeg-js";
import { describe, expect, it } from "vitest";

import { downscaleRgba, preparePhotoForVision, sniffImageType, VISION_MAX_PX } from "./photoImage.js";

/** 64×48 HEIC, the format phones save "high efficiency" camera photos in. */
const HEIC = readFileSync(fileURLToPath(new URL("./__fixtures__/tiny.heic", import.meta.url)));

function solidJpeg(width: number, height: number): Buffer {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = 200; data[i + 1] = 120; data[i + 2] = 40; data[i + 3] = 255; }
  return jpeg.encode({ data, width, height }, 90).data;
}

function ftyp(major: string, compatible: string[] = []): Buffer {
  const size = 16 + compatible.length * 4;
  const b = Buffer.alloc(Math.max(size, 32));
  b.writeUInt32BE(size, 0);
  b.write("ftyp", 4, "ascii");
  b.write(major, 8, "ascii");
  compatible.forEach((c, i) => b.write(c, 16 + i * 4, "ascii"));
  return b;
}

describe("sniffImageType", () => {
  it("reads the type from the bytes, whatever the browser called it", () => {
    expect(sniffImageType(solidJpeg(4, 4))).toBe("image/jpeg");
    expect(sniffImageType(Buffer.from("89504e470d0a1a0a0000000d", "hex"))).toBe("image/png");
    expect(sniffImageType(Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "latin1"))).toBe("image/webp");
    expect(sniffImageType(HEIC)).toBe("image/heic");
    expect(sniffImageType(ftyp("heic"))).toBe("image/heic");
    expect(sniffImageType(ftyp("mif1", ["mif1", "heic"]))).toBe("image/heic");
    expect(sniffImageType(ftyp("avif", ["mif1", "avif"]))).toBe("image/avif");
    expect(sniffImageType(ftyp("isom", ["mp41"]))).toBeNull();
    expect(sniffImageType(Buffer.from("hello, not an image at all"))).toBeNull();
  });
});

describe("downscaleRgba", () => {
  it("keeps the aspect ratio and averages colours", () => {
    const src = new Uint8Array(4 * 2 * 4);
    for (let i = 0; i < src.length; i += 8) { src.set([255, 0, 0, 255], i); src.set([0, 0, 255, 255], i + 4); }
    const r = downscaleRgba(src, 4, 2, 2);
    expect([r.width, r.height]).toEqual([2, 1]);
    expect(Array.from(r.data.subarray(0, 4))).toEqual([127, 0, 127, 255]);
  });

  it("leaves small images alone", () => {
    const src = new Uint8Array(16);
    expect(downscaleRgba(src, 2, 2, 100).width).toBe(2);
  });
});

describe("preparePhotoForVision", () => {
  it("passes a normal JPEG through untouched", async () => {
    const b64 = solidJpeg(32, 24).toString("base64");
    expect(await preparePhotoForVision(b64)).toEqual({ ok: true, image: b64, mediaType: "image/jpeg", converted: false });
  });

  it("converts a phone's HEIC photo to JPEG", async () => {
    const r = await preparePhotoForVision(HEIC.toString("base64"));
    expect(r).toMatchObject({ ok: true, mediaType: "image/jpeg", converted: true });
    if (!r.ok) return;
    const out = jpeg.decode(Buffer.from(r.image, "base64"));
    expect([out.width, out.height]).toEqual([64, 48]);
    // The fixture is an orange plate colour: the pixels survive the round trip.
    expect(out.data[0]).toBeGreaterThan(150);
  });

  it("scales a JPEG that is over the size limit down to the vision size", async () => {
    const big = solidJpeg(3200, 2400);
    const r = await preparePhotoForVision(big.toString("base64"), { maxBytes: 1000 });
    expect(r).toMatchObject({ ok: true, mediaType: "image/jpeg", converted: true });
    if (!r.ok) return;
    const out = jpeg.decode(Buffer.from(r.image, "base64"));
    expect(Math.max(out.width, out.height)).toBe(VISION_MAX_PX);
    expect(out.width / out.height).toBeCloseTo(4 / 3, 2);
  });

  it("says plainly when it can't open the file", async () => {
    expect(await preparePhotoForVision(Buffer.from("x".repeat(200)).toString("base64"))).toMatchObject({ ok: false, error: "photo_format" });
    expect(await preparePhotoForVision(ftyp("heic").toString("base64"))).toMatchObject({ ok: false, error: "photo_format" });
  });
});
