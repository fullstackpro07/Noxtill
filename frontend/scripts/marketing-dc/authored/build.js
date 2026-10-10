/* eslint-disable @typescript-eslint/no-require-imports */
// Writes the authored pages as .dc.html design files into ./pages (read by the converter's "np" set).
//   node scripts/marketing-dc/authored/build.js && node scripts/marketing-dc/convert.js np
// Every page is individually designed: one file per page in ./platform and ./ai, each with its own
// layout and a coded mock-up of its module. Only kit.js (head, icons, pills, buttons) is shared.
const fs = require("fs");
const path = require("path");

const out = path.join(__dirname, "pages");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const dir of ["platform", "ai"]) {
  for (const f of fs.readdirSync(path.join(__dirname, dir)).filter((f) => f.endsWith(".js")).sort()) {
    const p = require("./" + dir + "/" + f);
    // every image a page uses must already exist under public/
    for (const m of p.html.matchAll(/(?:src="|url\(')(\/marketing\/[^"')]+)/g)) {
      if (!fs.existsSync(path.join(__dirname, "../../../public", decodeURIComponent(m[1])))) throw new Error(p.slug + ": missing image " + m[1]);
    }
    fs.writeFileSync(path.join(out, p.slug + ".dc.html"), p.html);
    console.log(p.slug.padEnd(34), dir + "/" + f);
  }
}
