#!/usr/bin/env python3
"""Add fillable form fields to a PDF from its reviewed spec.

Specs live in scripts/form_fields/<name>.json (drafted by detect_blanks.py, then
hand-reviewed). Each field: page, name, label (tooltip), type text|checkbox,
rect [x0, y0, x1, y1] in PDF points from the top-left, optional multiline,
comb (one char per printed box; needs maxlen), maxlen, fontsize.
Existing widgets are removed first, so re-running is safe.

usage: make_fillable.py forms/<name>.pdf [more.pdf ...]
"""
import json, sys
from pathlib import Path

import pymupdf

SPECS = Path(__file__).resolve().parent / "form_fields"


def build(pdf):
    pdf = Path(pdf)
    spec = json.loads((SPECS / f"{pdf.stem}.json").read_text())
    doc = pymupdf.open(pdf)
    for page in doc:
        for w in list(page.widgets()):
            page.delete_widget(w)
    for f in spec["fields"]:
        page = doc[f["page"]]
        w = pymupdf.Widget()
        w.field_name = f["name"]
        w.field_label = f.get("label", f["name"])
        w.rect = pymupdf.Rect(f["rect"])
        w.border_width = 0
        w.border_color = None
        w.fill_color = None
        w.text_color = (0, 0, 0.55)
        if f["type"] == "checkbox":
            w.field_type = pymupdf.PDF_WIDGET_TYPE_CHECKBOX
            w.border_color = (0, 0, 0) if f.get("draw_box") else None
            w.border_width = 0.8 if f.get("draw_box") else 0
        else:
            w.field_type = pymupdf.PDF_WIDGET_TYPE_TEXT
            w.text_font = "Helv"
            w.text_fontsize = f.get("fontsize", 9 if f.get("multiline") else 10)
            if f.get("multiline"):
                w.field_flags |= pymupdf.PDF_TX_FIELD_IS_MULTILINE
            if f.get("comb"):                       # one character per printed box
                w.field_flags |= pymupdf.PDF_TX_FIELD_IS_COMB
                w.text_fontsize = f.get("fontsize", 11)
            if f.get("maxlen"):
                w.text_maxlen = f["maxlen"]
        page.add_widget(w)
    tmp = pdf.with_suffix(".tmp.pdf")
    doc.save(tmp, garbage=3, deflate=True)
    doc.close()
    tmp.replace(pdf)
    print(f"{pdf.name}: {len(spec['fields'])} fields")


if __name__ == "__main__":
    for p in sys.argv[1:]:
        build(p)
