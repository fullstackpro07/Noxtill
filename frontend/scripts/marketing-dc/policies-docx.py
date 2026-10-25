"""docs/policies/*.docx (the owner's 2026-10-25 policy pack) → scripts/marketing-dc/sets/pp-policies.json.

The pp set's registry patch (sets/pp.js) merges the result into pp-legal.json, so the Legal Reader shows
each document's current text without any change to the design. Re-run after the owner edits a .docx:

    python -I scripts/marketing-dc/policies-docx.py && node scripts/marketing-dc/convert.js pp

Mapping: title → doc.title, the line under it → doc.desc, the "Item | Detail" table → "At a glance"
(doc.keyPoints; Version goes to doc.version), each "N. Heading" → a section, sub-headings → "h"
blocks, bullet lists → "ul", numbered lists → numbered paragraphs, tables → "table" (a one-column
callout box becomes a one-column table: its heading row, then its text). The pack's internal
drafting notes are not published: italic paragraphs ("Before publication, …"), callouts headed
"Action required …" and the Trust Center's "Suggested URL structure" section.
"""
import json
import os
import re
import sys
import zipfile
from datetime import datetime
from xml.etree import ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(os.path.dirname(ROOT), "docs", "policies")
OUT = os.path.join(ROOT, "scripts", "marketing-dc", "sets", "pp-policies.json")
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

# file name prefix → registry key (existing documents keep their key and route; new ones get both here)
FILES = {
    "Noxtill_AI_Transparency_Policy": "ai-transparency",
    "Noxtill_API_Developer_Terms": "api-terms",
    "Noxtill_Acceptable_Use_Policy": "acceptable-use",
    "Noxtill_Accessibility_Statement": "accessibility",
    "Noxtill_Cookie_Settings": "cookie-settings",
    "Noxtill_Copyright_DMCA_Policy": "intellectual-property",
    "Noxtill_Data_Retention_Schedule": "data-retention",
    "Noxtill_Do_Not_Sell_or_Share": "do-not-sell",
    "Noxtill_HIPAA_Business_Associate_Agreement": "hipaa-baa",
    "Noxtill_Law_Enforcement_Guidelines": "law-enforcement",
    "Noxtill_Legal_and_Trust_Center": "trust-overview",
    "Noxtill_Messaging_Compliance_Policy": "messaging-consent",
    "Noxtill_Security": "security",
    "Noxtill_Service_Level_Agreement": "sla",
    "Noxtill_Support_Policy": "support-policy",
    "Noxtill_US_Cookie_Policy": "cookies",
    "Noxtill_US_Data_Processing_Agreement": "dpa",
    "Noxtill_US_Privacy_Policy": "privacy",
    "Noxtill_US_Refund_Policy": "refunds",
    "Noxtill_Vulnerability_Disclosure_Policy": "responsible-disclosure",
    "Noxtill_Your_Privacy_Choices": "privacy-choices",
}
NEW = {
    "cookie-settings": {"route": "/privacy/cookie-settings", "category": "Privacy",
                        "audiences": ["Visitor", "Prospect", "Data Subject"], "related": ["cookies", "privacy-choices", "privacy"]},
    "hipaa-baa": {"route": "/legal/baa", "category": "Compliance",
                  "audiences": ["Business Owner", "Admin", "Enterprise Customer"], "related": ["dpa", "security", "terms"]},
    "law-enforcement": {"route": "/legal/law-enforcement", "category": "Legal",
                        "audiences": ["Visitor", "Data Subject"], "related": ["privacy", "data-retention", "terms"]},
    "support-policy": {"route": "/legal/support-policy", "category": "Enterprise",
                       "audiences": ["Paid Subscriber", "Business Owner", "Admin", "Enterprise Customer"], "related": ["sla", "terms", "refunds"]},
    "trust-overview": {"route": "/trust/overview", "category": "Legal",
                       "audiences": ["Visitor", "Prospect", "Paid Subscriber", "Enterprise Customer"], "related": ["terms", "privacy", "security", "dpa"]},
}
DROP_SECTIONS = {"trust-overview": ["Suggested URL structure"]}


def ptext(p):
    out = ""
    for n in p.iter():
        if n.tag == W + "t":
            out += n.text or ""
        elif n.tag == W + "tab":
            out += " "
        elif n.tag == W + "br" and n.get(W + "type") != "page":
            out += " "
    return unbracket(re.sub(r"\s+", " ", out).strip())


def italic(p):
    runs = [r for r in p.findall(W + "r") if "".join(t.text or "" for t in r.findall(W + "t")).strip()]
    return bool(runs) and all(r.find(W + "rPr") is not None and r.find(W + "rPr").find(W + "i") is not None for r in runs)


def style(p):
    ppr = p.find(W + "pPr")
    s = ppr.find(W + "pStyle") if ppr is not None else None
    return s.get(W + "val") if s is not None else ""


def unbracket(t):
    """'[To be completed before … EEA. Insert appointed firm's name, …]' → 'To be appointed before … EEA.'
    (the pack's own public wording, as the Trust Center uses it); the owner's fill-in instruction goes."""
    def fix(m):
        inner = re.sub(r"\s*Insert [^.]*\.", "", m.group(1)).strip()
        return inner.replace("To be completed", "To be appointed")
    return re.sub(r"\[(To be (?:appointed|completed)[^\]]*)\]", fix, t)


def slug(t):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", t.lower())).strip("-")


def iso(date):
    try:
        return datetime.strptime(date, "%B %d, %Y").strftime("%Y-%m-%d")
    except ValueError:
        return None


def convert(path, key):
    body = ET.fromstring(zipfile.ZipFile(path).read("word/document.xml")).find(W + "body")
    els = [e for e in body if e.tag in (W + "p", W + "tbl")]
    head, sections, sec, num = [], [], None, 0
    meta = None
    for el in els:
        if el.tag == W + "tbl":
            rows = [[" ".join(ptext(p) for p in tc.iter(W + "p") if ptext(p)) for tc in tr.findall(W + "tc")]
                    for tr in el.findall(W + "tr")]
            paras = [[ptext(p) for p in tc.iter(W + "p") if ptext(p)] for tr in el.findall(W + "tr") for tc in tr.findall(W + "tc")]
            if sec is None:
                if rows and rows[0] == ["Item", "Detail"]:
                    meta = rows[1:]
                continue
            num = 0
            if len(rows[0]) == 1:  # callout box: heading, then its paragraphs
                title, text = paras[0][0], paras[0][1:] + [x for c in paras[1:] for x in c]
                if title.startswith("Action required"):
                    continue
                sec["blocks"].append({"t": "table", "rows": [[title]] + [[x] for x in text]})
            else:
                sec["blocks"].append({"t": "table", "rows": rows})
            continue
        t = ptext(el)
        if not t:
            continue
        st = style(el)
        if st == "Heading1":
            title = re.sub(r"^\d+\.\s+", "", t)
            sec = {"title": title, "blocks": [], "id": slug(title)}
            sections.append(sec)
            num = 0
            continue
        if sec is None:
            head.append(t)
            continue
        if italic(el):  # internal drafting note for the owner, not policy text
            continue
        if st in ("Heading2", "Heading3"):
            sec["blocks"].append({"t": "h", "x": t}); num = 0
        elif st == "ListBullet":
            if sec["blocks"] and sec["blocks"][-1]["t"] == "ul" and num == 0:
                sec["blocks"][-1]["items"].append(t)
            else:
                sec["blocks"].append({"t": "ul", "items": [t]})
            num = 0
        elif st == "ListNumber":
            num += 1
            sec["blocks"].append({"t": "p", "x": f"{num}. {t}"})
        else:
            sec["blocks"].append({"t": "p", "x": t}); num = 0
    drop = DROP_SECTIONS.get(key, [])
    sections = [s for s in sections if s["title"] not in drop and s["blocks"]]
    seen = {}
    for s in sections:  # unique section anchors
        n = seen.get(s["id"], 0); seen[s["id"]] = n + 1
        if n: s["id"] += f"-{n + 1}"
    meta = meta or []
    get = lambda k: next((v for i, v in meta if i == k), None)
    version = (get("Version") or "1.0").split(" ")[0]
    effective = iso(get("Effective date") or "")
    key_points = [{"t": i, "x": v} for i, v in meta if i != "Version"]
    words = sum(len((b.get("x") or " ".join(b.get("items") or sum(b.get("rows") or [], []))).split())
                for s in sections for b in s["blocks"])
    # head = ["NOXTILL", title, subtitle]
    doc = {"key": key, "title": head[1], "desc": head[2], "keyPoints": key_points, "version": version,
           "effective": effective, "readMin": max(1, round(words / 220)), "sections": sections}
    doc.update(NEW.get(key, {}))
    return doc


def main():
    out = []
    files = sorted(f for f in os.listdir(SRC) if f.endswith(".docx"))
    for prefix, key in FILES.items():
        match = [f for f in files if re.sub(r"(\s*\(\d+\))?\.docx$", "", f) == prefix]
        if len(match) != 1:
            sys.exit(f"{prefix}: expected one .docx in docs/policies, found {match}")
        out.append(convert(os.path.join(SRC, match[0]), key))
    unknown = [f for f in files if re.sub(r"(\s*\(\d+\))?\.docx$", "", f) not in FILES]
    if unknown:
        sys.exit(f"unmapped policy files: {unknown}")
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    for d in out:
        print(f"{d['key']:24} v{d['version']:4} {d['effective']}  {len(d['sections']):2} sections  {d['readMin']:2} min  {d['title']}")


if __name__ == "__main__":
    main()
