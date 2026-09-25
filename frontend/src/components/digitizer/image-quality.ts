/**
 * Real, in-browser measurements of a photo *before* it is uploaded — nothing here is estimated by
 * a model or typed in. Each check reads the actual pixels:
 *
 *   sharpness   variance of the Laplacian over the luminance channel (higher is sharper)
 *   glare       share of pixels that are blown out to pure white
 *   lighting    spread between the brightest and darkest region's paper level
 *   resolution  the image's own pixel size
 *
 * Perspective tilt and cut-off text cannot be judged from pixels alone, so those are left to the
 * reader after upload and are reported as such.
 */

export type CheckState = "passed" | "warning" | "failed" | "later";

export interface QualityCheck {
  key: "blur" | "glare" | "shadow" | "resolution" | "perspective" | "cutoff";
  label: string;
  state: CheckState;
  detail: string;
}

export interface ImageAnalysis {
  width: number;
  height: number;
  checks: QualityCheck[];
}

const MAX_SIDE = 900;
export const MIN_ADEQUATE_SIDE = 800;

// Thresholds — documented so a reading is explainable: below SEVERE the text edges are smeared,
// below MILD they are soft.
const SHARPNESS_SEVERE = 40;
const SHARPNESS_MILD = 110;
const GLARE_WARN = 0.35;
const GLARE_FAIL = 0.6;
const LIGHTING_WARN = 0.3;
const LIGHTING_FAIL = 0.5;

function draw(source: CanvasImageSource, w: number, h: number): ImageData | null {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function luminance(img: ImageData): Float32Array {
  const out = new Float32Array(img.width * img.height);
  for (let i = 0, p = 0; i < out.length; i += 1, p += 4) {
    out[i] = 0.299 * img.data[p] + 0.587 * img.data[p + 1] + 0.114 * img.data[p + 2];
  }
  return out;
}

function sharpness(lum: Float32Array, w: number, h: number): number {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const lap = lum[i - w] + lum[i + w] + lum[i - 1] + lum[i + 1] - 4 * lum[i];
      sum += lap;
      sumSq += lap * lap;
      n += 1;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

function blownOut(img: ImageData): number {
  let hot = 0;
  const total = img.width * img.height;
  for (let p = 0; p < img.data.length; p += 4) {
    if (img.data[p] >= 253 && img.data[p + 1] >= 253 && img.data[p + 2] >= 253) hot += 1;
  }
  return total ? hot / total : 0;
}

/** Paper level per region (mean of each cell's brightest 40%), then how far apart the regions are. */
function lightingSpread(lum: Float32Array, w: number, h: number): number {
  const GRID = 4;
  const levels: number[] = [];
  for (let gy = 0; gy < GRID; gy += 1) {
    for (let gx = 0; gx < GRID; gx += 1) {
      const x0 = Math.floor((gx * w) / GRID);
      const x1 = Math.floor(((gx + 1) * w) / GRID);
      const y0 = Math.floor((gy * h) / GRID);
      const y1 = Math.floor(((gy + 1) * h) / GRID);
      const cell: number[] = [];
      for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) cell.push(lum[y * w + x]);
      if (!cell.length) continue;
      cell.sort((a, b) => b - a);
      const top = cell.slice(0, Math.max(1, Math.floor(cell.length * 0.4)));
      levels.push(top.reduce((s, v) => s + v, 0) / top.length);
    }
  }
  const max = Math.max(...levels);
  const min = Math.min(...levels);
  return max > 0 ? (max - min) / max : 0;
}

export function checksFromPixels(img: ImageData, width: number, height: number): QualityCheck[] {
  const lum = luminance(img);
  const sharp = sharpness(lum, img.width, img.height);
  const glare = blownOut(img);
  const spread = lightingSpread(lum, img.width, img.height);
  const adequate = Math.min(width, height) >= MIN_ADEQUATE_SIDE;

  return [
    {
      key: "blur",
      label: "Blur",
      state: sharp < SHARPNESS_SEVERE ? "failed" : sharp < SHARPNESS_MILD ? "warning" : "passed",
      detail:
        sharp < SHARPNESS_SEVERE
          ? `Very soft — sharpness ${Math.round(sharp)} (below ${SHARPNESS_SEVERE}). Hold steady and retake.`
          : sharp < SHARPNESS_MILD
            ? `A little soft — sharpness ${Math.round(sharp)}. Small handwriting may be misread.`
            : `Sharp enough to read — sharpness ${Math.round(sharp)}`,
    },
    {
      key: "glare",
      label: "Glare",
      state: glare >= GLARE_FAIL ? "failed" : glare >= GLARE_WARN ? "warning" : "passed",
      detail:
        glare >= GLARE_WARN
          ? `${Math.round(glare * 100)}% of the photo is blown out to pure white`
          : `${Math.round(glare * 100)}% blown-out highlights`,
    },
    {
      key: "shadow",
      label: "Lighting",
      state: spread >= LIGHTING_FAIL ? "failed" : spread >= LIGHTING_WARN ? "warning" : "passed",
      detail:
        spread >= LIGHTING_WARN
          ? `Uneven — the darkest part is ${Math.round(spread * 100)}% dimmer than the brightest`
          : `Even — regions differ by ${Math.round(spread * 100)}%`,
    },
    {
      key: "resolution",
      label: "Resolution",
      state: adequate ? "passed" : "warning",
      detail: `${width} × ${height} px · ${adequate ? "adequate" : `low — the shorter side is under ${MIN_ADEQUATE_SIDE}px`}`,
    },
    { key: "perspective", label: "Perspective", state: "later", detail: "Judged by the reader after upload" },
    { key: "cutoff", label: "Cut-off text", state: "later", detail: "Judged by the reader after upload" },
  ];
}

/** Measures an image file. Returns null for anything the browser cannot decode (e.g. a PDF). */
export async function analyzeImageFile(file: File): Promise<ImageAnalysis | null> {
  if (!file.type.startsWith("image/")) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const img = draw(bitmap, bitmap.width, bitmap.height);
    const analysis = img ? { width: bitmap.width, height: bitmap.height, checks: checksFromPixels(img, bitmap.width, bitmap.height) } : null;
    bitmap.close();
    return analysis;
  } catch {
    return null;
  }
}

/** Measures one frame of the live camera preview. */
export function analyzeVideoFrame(video: HTMLVideoElement): ImageAnalysis | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const img = draw(video, video.videoWidth, video.videoHeight);
  return img ? { width: video.videoWidth, height: video.videoHeight, checks: checksFromPixels(img, video.videoWidth, video.videoHeight) } : null;
}

/** Rotates an image file a quarter turn clockwise, returning a new file (the source file is untouched). */
export async function rotateImageFile(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.height;
  canvas.height = bitmap.width;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot rotate images.");
  ctx.translate(canvas.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
  if (!blob) throw new Error("Could not rotate this image.");
  return new File([blob], file.name, { type, lastModified: Date.now() });
}

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_BYTES = 20 * 1024 * 1024;

/** Why a file cannot be uploaded, or null if it can — the same limits the server enforces. */
export function fileProblem(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return /heic|heif/i.test(file.type + file.name)
      ? "HEIC photos are not supported — export as JPG, or take the photo in JPG mode."
      : `${file.name} is not a supported format (JPG, PNG, WEBP or PDF).`;
  }
  const limit = file.type === "application/pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (file.size > limit) return `${file.name} is larger than the ${limit / 1024 / 1024} MB limit.`;
  return null;
}
