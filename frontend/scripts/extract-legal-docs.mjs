// One-off tool: converts the 4 legal docx files in d:\Noxtil\docs into HTML so their
// real content can be hand-transcribed into the /privacy, /terms, /cookie-policy,
// /refund-policy pages. Not wired into any build step — safe to re-run if the docs change.
import mammoth from "mammoth";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.resolve(__dirname, "../../docs");
const outDir = path.resolve(__dirname, "../.legal-extract");

const files = [
  "Noxtill_Privacy_Policy.docx",
  "Noxtill_Terms_of_Service.docx",
  "Noxtill_Cookie_Policy.docx",
  "Noxtill_Refund_Policy.docx",
];

fs.mkdirSync(outDir, { recursive: true });

for (const file of files) {
  const srcPath = path.join(docsDir, file);
  const { value: html, messages } = await mammoth.convertToHtml({ path: srcPath });
  const outPath = path.join(outDir, file.replace(/\.docx$/, ".html"));
  fs.writeFileSync(outPath, html, "utf8");
  console.log(`${file} -> ${outPath} (${html.length} chars, ${messages.length} messages)`);
  for (const m of messages) console.log(`  [${m.type}] ${m.message}`);
}
