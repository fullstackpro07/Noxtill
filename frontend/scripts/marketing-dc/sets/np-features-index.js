// /features (Features.dc.html) fixes, applied by sets/np.js `transform.features` on every np build.
//  - The design drew hatched placeholder boxes where the sample order's product thumbnails and the
//    Social Media card's post previews go; they become real pictures already published on the site
//    (Quick Checkout product shots, Beauty & Personal Care industry photos — no new images).
//  - The closing call to action said "All 25 modules"; the platform has 40+ (owner, 2026-11-14).

const HATCH = /repeating-linear-gradient/;
const ORDER_THUMBS = [
  ["/assets/ref/qc-p1.jpg", "Hydrating Shampoo bottle"],
  ["/assets/ref/qc-p5.jpg", "Repair Serum dropper bottle"],
  ["/marketing/np/pasted-1790459443756-0-muixboqn-3bzb.png", "Stylist blow-drying a client's hair"],
];
const POSTS = [
  ["/marketing/np/pasted-1790457847416-0-muiwdguo-pmeo.png", "Salon interior with styling chairs and round mirrors"],
  ["/marketing/np/pasted-1790458565272-0-muiwsuvn-hody.png", "Nail salon appointment"],
  ["/marketing/np/pasted-1790458998602-0-muix253z-o9aw.png", "Beauty clinic treatment"],
  ["/marketing/np/pasted-1790458614334-0-muiwtwou-vrjo.png", "Spa bath in a bright room"],
];

function fill(tree) {
  const thumbs = [...ORDER_THUMBS], posts = [...POSTS];
  const text = (n) => (typeof n === "string" ? n : Array.isArray(n) ? n[2].map(text).join("") : "");
  const walk = (nodes) => {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (!Array.isArray(n)) continue;
      const st = n[1].style || "";
      if (n[0] === "span" && HATCH.test(st) && /width:\s*34px/.test(st) && thumbs.length) {
        const [src, alt] = thumbs.shift();
        nodes[i] = ["img", { src, alt, width: "34", height: "34", loading: "lazy", decoding: "async", style: "display: block; width: 34px; height: 34px; border-radius: 8px; flex: none; object-fit: cover; background: #F3F5F3;" }, []];
      } else if (n[0] === "span" && /aspect-ratio:\s*1/.test(st) && (HATCH.test(st) || (/dashed/.test(st) && text(n).trim() === "post")) && posts.length) {
        const [src, alt] = posts.shift();
        nodes[i] = ["img", { src, alt, loading: "lazy", decoding: "async", style: "display: block; width: 100%; aspect-ratio: 1; border-radius: 9px; object-fit: cover; background: #EFF2EE;" }, []];
      } else if (n[0] === "h2" && text(n).trim() === "All 25 modules, one subscription.") {
        nodes[i] = [n[0], n[1], ["All 40+ modules, one subscription."]];
      } else walk(n[2]);
    }
  };
  walk(tree);
  if (thumbs.length || posts.length) throw new Error(`np-features-index: ${thumbs.length} thumbnail(s), ${posts.length} post(s) not placed — design changed?`);
  return tree;
}

module.exports = { fill };
