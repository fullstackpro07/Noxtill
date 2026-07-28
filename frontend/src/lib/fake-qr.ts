/** Deterministic pseudo-QR — a stand-in for a real QR encoder, just enough to read as a scannable code in preview. */
export function fakeQrCells(seed: string, gridSize = 7): boolean[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return Array.from({ length: gridSize * gridSize }, (_, i) => ((hash >> (i % 24)) & 1) === 1);
}
