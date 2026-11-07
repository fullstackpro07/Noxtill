/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string) {
  const c = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c(1) + 0.7152 * c(3) + 0.0722 * c(5);
}

export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Readable label colour on a filled background (same rule the backend contrast check uses). */
export function onColor(background: string) {
  return contrast(background, "#ffffff") >= contrast(background, "#111111") ? "#ffffff" : "#111111";
}
