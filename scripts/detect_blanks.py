#!/usr/bin/env python3
"""Find the fill-in blanks on a PDF form and write a draft field spec.

Blanks are found three ways: runs of "_" in the text layer, thin horizontal
vector lines, and (for scanned pages) horizontal pixel runs in a render.
Squares of checkbox size become checkbox candidates. The draft goes to
scripts/form_fields/<name>.json for hand review, then make_fillable.py applies it.

usage: detect_blanks.py forms/<name>.pdf [--overlay out_dir]
"""
import json, re, sys
from pathlib import Path

import numpy as np
import pymupdf

MIN_LEN = 18          # pt; shorter lines are underlines/decoration, not blanks
FIELD_H = 13          # pt; text field height, sitting on the line


def underscore_runs(page):
    out = []
    for b in page.get_text("rawdict")["blocks"]:
        for line in b.get("lines", []):
            for span in line["spans"]:
                chars = span["chars"]
                i = 0
                while i < len(chars):
                    if chars[i]["c"] == "_":
                        j = i
                        while j + 1 < len(chars) and chars[j + 1]["c"] == "_":
                            j += 1
                        x0, x1 = chars[i]["bbox"][0], chars[j]["bbox"][2]
                        if x1 - x0 >= MIN_LEN:
                            out.append((x0, x1, span["bbox"][3] - 2))
                        i = j + 1
                    else:
                        i += 1
    return out


BOX_GLYPHS = {("wingdings", "\uf072"), ("wingdings", "r"), ("wingdings", "\uf06f"), ("wingdings", "o"),
              ("zapfdingbats", "r"), ("zapfdingbats", "q"), ("zapfdingbats", "o"), ("zapfdingbats", "n")}


def glyph_boxes(page):
    """Checkbox squares drawn with a dingbat font character (Wingdings/Zapf ❒)."""
    out = []
    for b in page.get_text("rawdict")["blocks"]:
        for line in b.get("lines", []):
            for span in line["spans"]:
                font = span["font"].lower().replace(" ", "")
                fam = next((f for f in ("wingdings", "zapfdingbats") if f in font), None)
                if not fam:
                    continue
                for ch in span["chars"]:
                    if (fam, ch["c"]) in BOX_GLYPHS:
                        x0, x1 = ch["bbox"][0], ch["bbox"][2]
                        side = min(x1 - x0, span["size"] * 0.8)
                        oy = ch["origin"][1]
                        out.append((x0, oy - side, x0 + side, oy))
    return out


def label_right(x1, yc, words):
    right = sorted((w for w in words if w[1] - 3 < yc < w[3] + 3 and 0 <= w[0] - x1 < 120), key=lambda w: w[0])
    txt = []
    for w in right:
        if txt and w[0] - prev > 12:
            break
        txt.append(w[4]); prev = w[2]
        if len(txt) == 5:
            break
    return " ".join(txt).strip(" :") or "option"


def vector_lines(page):
    out, boxes = [], []
    for d in page.get_drawings():
        for it in d["items"]:
            if it[0] == "l":
                p, q = it[1], it[2]
                if abs(p.y - q.y) < 1 and abs(q.x - p.x) >= MIN_LEN:
                    out.append((min(p.x, q.x), max(p.x, q.x), p.y))
            elif it[0] == "re":
                r = it[1]
                if r.height < 2.5 and r.width >= MIN_LEN:
                    out.append((r.x0, r.x1, r.y1))
                elif 6 <= r.width <= 16 and 6 <= r.height <= 16 and abs(r.width - r.height) < 3:
                    boxes.append(tuple(r))
    return out, boxes


def raster_lines(page, zoom=3):
    pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), colorspace=pymupdf.csGRAY)
    a = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width) < 110
    # scanned underscores leave small gaps between characters: bridge them
    b = a.copy()
    for k in range(1, 2 * zoom):
        b[:, k:] |= a[:, :-k]
    a = b
    out = []
    minpx = int(MIN_LEN * zoom)
    for y in range(a.shape[0]):
        row = a[y]
        if row.sum() < minpx:
            continue
        # a blank line is dark here but light a few px above (so it's not text)
        above = a[max(0, y - 4 * zoom)]
        d = np.diff(np.concatenate(([0], row.view(np.int8), [0])))
        starts, ends = np.where(d == 1)[0], np.where(d == -1)[0]
        for s, e in zip(starts, ends):
            if e - s >= minpx and above[s:e].mean() < 0.3:
                out.append((s / zoom, e / zoom, y / zoom))
    return out


def merge(lines):
    lines = sorted(lines, key=lambda l: (round(l[2]), l[0]))
    out = []
    for x0, x1, y in lines:
        for m in out:
            if abs(m[2] - y) < 3 and x0 <= m[1] + 3 and x1 >= m[0] - 3:
                m[0], m[1], m[2] = min(m[0], x0), max(m[1], x1), max(m[2], y)
                break
        else:
            out.append([x0, x1, y])
    return out


def is_underline(x0, x1, y, words):
    """A line hugging the bottom of real text is that text's underline (links, headings)."""
    cover = sum(max(0, min(x1, w[2]) - max(x0, w[0])) for w in words
                if 0 <= y - w[3] < 4 and w[4].strip("_"))
    return cover > 0.5 * (x1 - x0)


def sublabel_groups(x0, x1, y, words):
    """Captions printed just under a line ("First Name   Middle Initial   Last Name")."""
    under = sorted((w for w in words if 0 < w[1] - y < 7 and x0 - 30 <= w[0] < x1 and w[4].strip("_")),
                   key=lambda w: w[0])
    groups = []
    for w in under:
        if groups and w[0] - groups[-1][2] < 12:
            groups[-1][2], groups[-1][3] = w[2], groups[-1][3] + " " + w[4]
        else:
            groups.append([w[0], w[1], w[2], w[4]])
    return groups


def split_by_sublabels(lines, words):
    out = []
    for x0, x1, y, lab in lines:
        g = sublabel_groups(x0, x1, y, words)
        if len(g) < 2:
            out.append((x0, x1, y, g[0][3] if g else lab))
            continue
        cuts = [x0] + [max(x0, gg[0] - 6) for gg in g[1:]] + [x1]
        for i, gg in enumerate(g):
            out.append((cuts[i], cuts[i + 1] - 4, y, gg[3]))
    return out


def multiline(lines, used_labels):
    """Stack of same-width lines under one label -> one multi-line box."""
    out = []
    for l in lines:
        p = out[-1] if out else None
        if (p and abs(p["x0"] - l[0]) < 4 and abs(p["x1"] - l[1]) < 4
                and 10 < l[2] - p["y"] < 30 and l[3] in ("field", p["label"])):
            p["y"], p["rows"] = l[2], p["rows"] + 1
        else:
            out.append({"x0": l[0], "x1": l[1], "y": l[2], "top": l[2], "label": l[3], "rows": 1})
    return out


def label_for(page, x0, y, words):
    words = [(w[0], w[1], w[2], w[3], w[4].replace("_", "")) for w in words]
    left = [w for w in words if abs(w[3] - y) < 8 and w[2] <= x0 + 2 and x0 - w[2] < 160 and w[4]]
    if left:
        left.sort(key=lambda w: w[0])
        txt = " ".join(w[4] for w in left[-4:])
    else:
        above = [w for w in words if 0 < y - w[3] < 22 and w[0] < x0 + 150 and w[2] > x0 - 10 and w[4]]
        above.sort(key=lambda w: (w[1], w[0]))
        txt = " ".join(w[4] for w in above[:5])
    return txt.strip(" :") or "field"


def slug(s, used):
    base = re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")[:40] or "field"
    name, n = base, 2
    while name in used:
        name, n = f"{base}_{n}", n + 1
    used.add(name)
    return name


def detect(pdf):
    doc = pymupdf.open(pdf)
    spec = {"source": Path(pdf).name, "fields": []}
    used = set()
    for pno, page in enumerate(doc):
        words = page.get_text("words")
        scanned = len(page.get_text().strip()) < 50
        lines = underscore_runs(page)
        vl, boxes = vector_lines(page)
        lines += vl
        if scanned:
            lines += raster_lines(page)
        wide = page.rect.width * 0.9
        lines = [l for l in merge(lines) if not is_underline(*l, words) and l[1] - l[0] < wide]
        lines = [(x0, x1, y, label_for(page, x0, y, words)) for x0, x1, y in sorted(lines, key=lambda l: (l[2], l[0]))]
        lines = split_by_sublabels(lines, words)
        for b in multiline(lines, used):
            f = {"page": pno, "name": slug(b["label"], used), "label": b["label"], "type": "text",
                 "rect": [round(b["x0"] + 1, 1), round(b["top"] - FIELD_H, 1), round(b["x1"] - 1, 1), round(b["y"] - 0.5, 1)]}
            if b["rows"] > 1:
                f["multiline"] = True
            spec["fields"].append(f)
        for r in boxes + glyph_boxes(page):
            lab = label_right(r[2], (r[1] + r[3]) / 2, words)
            spec["fields"].append({"page": pno, "name": slug("cb_" + lab, used), "label": lab, "type": "checkbox",
                                   "rect": [round(v, 1) for v in r]})
    return doc, spec


def overlay(doc, spec, out_dir, stem):
    out_dir.mkdir(parents=True, exist_ok=True)
    for pno, page in enumerate(doc):
        for f in spec["fields"]:
            if f["page"] == pno:
                page.draw_rect(pymupdf.Rect(f["rect"]), color=(1, 0, 0) if f["type"] == "text" else (0, 0, 1), width=0.8)
                page.insert_text((f["rect"][0], f["rect"][1] - 1), f["name"][:30], fontsize=5, color=(1, 0, 0))
        page.get_pixmap(dpi=int(sys.argv[sys.argv.index("--dpi") + 1]) if "--dpi" in sys.argv else 90).save(out_dir / f"{stem}-{pno + 1}.png")


if __name__ == "__main__":
    pdf = Path(sys.argv[1])
    doc, spec = detect(pdf)
    fields_dir = Path(__file__).resolve().parent / "form_fields"
    fields_dir.mkdir(exist_ok=True)
    (fields_dir / f"{pdf.stem}.json").write_text(json.dumps(spec, indent=1))
    print(f"{pdf.name}: {len(spec['fields'])} candidates")
    if "--overlay" in sys.argv:
        overlay(doc, spec, Path(sys.argv[sys.argv.index("--overlay") + 1]), pdf.stem)
