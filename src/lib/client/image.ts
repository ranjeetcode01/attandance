"use client";

export type Photo = { dataUrl: string; rawHash: string | null };

async function sha256Hex(data: BufferSource): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Draws the source scaled down, stamps a watermark band and encodes a small JPEG (~30–60 KB).
function encode(source: CanvasImageSource, sw: number, sh: number, lines: string[], maxSide: number, mirror: boolean) {
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, 0, 0, w, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const fontPx = Math.max(11, Math.round(w / 34));
  const pad = Math.round(fontPx * 0.5);
  const band = lines.length * (fontPx + 3) + pad * 2;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, h - band, w, band);
  ctx.fillStyle = "#fff";
  ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
  ctx.textBaseline = "top";
  lines.forEach((line, i) => ctx.fillText(line, pad, h - band + pad + i * (fontPx + 3), w - pad * 2));
  return { canvas, raw: ctx.getImageData(0, 0, w, Math.max(1, h - band)).data };
}

export async function photoFromVideo(video: HTMLVideoElement, lines: string[], opts: { maxSide?: number; mirror?: boolean } = {}): Promise<Photo> {
  const { canvas, raw } = encode(video, video.videoWidth, video.videoHeight, lines, opts.maxSide ?? 480, opts.mirror ?? false);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.6), rawHash: await sha256Hex(raw.buffer as ArrayBuffer) };
}

export async function photoFromFile(file: File, lines: string[], opts: { maxSide?: number } = {}): Promise<Photo> {
  const bytes = await file.arrayBuffer();
  const bitmap = await createImageBitmap(new Blob([bytes]));
  const { canvas } = encode(bitmap, bitmap.width, bitmap.height, lines, opts.maxSide ?? 480, false);
  bitmap.close();
  // Hash the original file so re-uploading the same gallery photo is detected.
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.6), rawHash: await sha256Hex(bytes) };
}
