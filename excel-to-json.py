#!/usr/bin/env python3
"""
excel-to-json.py — Chaitrali's Kitchen
Reads ChaitralisKitchen_ContentPack.xlsx and writes data/menu.json

Usage (run from repo root):
    python3 excel-to-json.py
    python3 excel-to-json.py path/to/ContentPack.xlsx

After running: git add data/menu.json && git commit -m "Update menu" && git push origin main
"""

import sys, json, os
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("Installing openpyxl...")
    os.system("pip3 install openpyxl --break-system-packages -q")
    import openpyxl

# ── Paths ─────────────────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).parent
DEFAULT_XLSX = REPO_ROOT / "ChaitralisKitchen_ContentPack.xlsx"
OUTPUT_JSON  = REPO_ROOT / "data" / "menu.json"

xlsx_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
if not xlsx_path.exists():
    matches = list(REPO_ROOT.glob("*ContentPack*.xlsx")) + list(REPO_ROOT.glob("*Content*.xlsx"))
    if matches:
        xlsx_path = matches[0]
        print(f"Found: {xlsx_path.name}")
    else:
        print(f"ERROR: Could not find Excel file at {xlsx_path}")
        print("Usage: python3 excel-to-json.py [path/to/ContentPack.xlsx]")
        sys.exit(1)

print(f"Reading: {xlsx_path}")
wb = openpyxl.load_workbook(xlsx_path, data_only=True)

def v(ws, row, col):
    """Get cell value as stripped string, or empty string."""
    val = ws.cell(row=row, column=col).value
    if val is None: return ""
    return str(val).strip()

TAG_MAP = {
    "Spicy Gravy": "spicy", "Rassa": "rassa", "Usal": "usal",
    "Dry Sabzi": "dry", "Dal": "dal", "Rice": "rice",
    "Snack": "snack", "Festival Special": "special", "Chutney": "chutney",
    "Gravy": "gravy",
}

# ── 1. Business Settings ───────────────────────────────────────────────────────
# Sheet: ⚙️ Business Info, Column A = label, Column B = value (rows 4–14)
ws_biz = wb["⚙️ Business Info"]
settings = {
    "business_name":  v(ws_biz, 4,  2),
    "tagline":        v(ws_biz, 5,  2),
    "phone":          v(ws_biz, 6,  2),
    "phone_whatsapp": v(ws_biz, 7,  2),
    "email":          v(ws_biz, 8,  2),
    "location":       v(ws_biz, 9,  2),
    "tiffin_days":    v(ws_biz, 10, 2),
    "order_cutoff":   v(ws_biz, 11, 2),
    "payment_zelle":  v(ws_biz, 12, 2),
    "payment_venmo":  v(ws_biz, 13, 2),
    "allergy_note":   v(ws_biz, 14, 2),
}

# ── 2. Carousel Images ────────────────────────────────────────────────────────
# Sheet: 🖼️ Hero & Carousel Images, header row 4, data rows 5–8 (then blank)
ws_img = wb["🖼️ Hero & Carousel Images"]
carousel = []
for row in range(5, 20):
    num     = ws_img.cell(row=row, column=1).value
    fname   = ws_img.cell(row=row, column=2).value
    caption = ws_img.cell(row=row, column=3).value
    if not fname or str(fname).strip() == "":
        continue
    fname_str = str(fname).strip()
    if fname_str.startswith("#"):
        continue
    entry = {"file": fname_str}
    if caption and str(caption).strip():
        entry["name"] = str(caption).strip()
    carousel.append(entry)

if not carousel:
    carousel = [{"file": "maharashtrian-thali-hero.jpg", "name": "Maharashtrian Thali"}]

# ── 3. Weekly Tiffin ─────────────────────────────────────────────────────────
# Sheet: 📅 Weekly Tiffin Menu
# Last:  dates label row 4, header row 5, data rows 6–17
# This:  dates label row 20, header row 21, data rows 22–33
# Next:  dates label row 36, header row 37, data rows 38–49
ws_tiffin = wb["📅 Weekly Tiffin Menu"]

def read_tiffin_week(ws, date_label_row, data_start, data_end):
    # Date is stored in col B of the "Dates" label row (col A has the label text)
    dates = v(ws, date_label_row, 2) or v(ws, date_label_row, 1)
    if "Dates" in dates or "dates" in dates:
        dates = ""
    dishes = []
    for r in range(data_start, data_end + 1):
        name    = v(ws, r, 3)
        desc    = v(ws, r, 4)
        tag_lbl = v(ws, r, 5)
        if not name:
            continue
        tag_label = tag_lbl if tag_lbl else "Dry Sabzi"
        dishes.append({
            "name":      name,
            "desc":      desc,
            "tag":       TAG_MAP.get(tag_label, tag_label.lower().replace(" ", "_")),
            "tag_label": tag_label,
        })
    return {"dates": dates, "dishes": dishes}

tiffin = {
    "last_week": read_tiffin_week(ws_tiffin, 4,  6,  17),
    "this_week": read_tiffin_week(ws_tiffin, 20, 22, 33),
    "next_week": read_tiffin_week(ws_tiffin, 36, 38, 49),
}

# ── 4. Event Menus ────────────────────────────────────────────────────────────
# Sheet: 🎉 Event Menus
# Ganpati: header row 3, active B4, order-by D4, col headers row 5, data rows 6–57
# Diwali:  header row 60, active B61, data rows 63–71
# Holi:    header row 72, active B73, data rows 75–83
# Custom:  header row 84, active B85, data rows 87–100
ws_ev = wb["🎉 Event Menus"]

EVENT_BLOCKS = {
    "ganpati": {"title": "Ganpati",      "subtitle": "Special Festival Menu",                      "active_row": 4,  "data_start": 6,  "data_end": 58},
    "diwali":  {"title": "Diwali",       "subtitle": "Festival of Lights Menu",                   "active_row": 61, "data_start": 63, "data_end": 71},
    "holi":    {"title": "Holi",         "subtitle": "Festival of Colors Menu",                   "active_row": 73, "data_start": 75, "data_end": 83},
    "custom":  {"title": "Custom Event", "subtitle": "Birthday · Anniversary · Puja · Gathering", "active_row": 85, "data_start": 87, "data_end": 100},
}

events = {}
for key, block in EVENT_BLOCKS.items():
    active_val = v(ws_ev, block["active_row"], 2)
    active     = active_val.upper() == "Y"
    order_by   = v(ws_ev, block["active_row"], 4)

    sections   = {}
    sec_order  = []

    for r in range(block["data_start"], block["data_end"] + 1):
        col_a = ws_ev.cell(row=r, column=1).value
        if col_a is None:
            continue
        col_a_str = str(col_a).strip()

        # Section header: "  ▸ SectionName"
        if "▸" in col_a_str:
            sec_name = col_a_str.replace("▸", "").strip()
            if sec_name not in sections:
                sections[sec_name] = []
                sec_order.append(sec_name)
            continue

        # Dish row: col A = section name it belongs to
        dish_num  = ws_ev.cell(row=r, column=2).value
        dish_name = v(ws_ev, r, 3)
        if not dish_name:
            continue

        dish_desc = v(ws_ev, r, 4)
        p_lbl1    = v(ws_ev, r, 5)
        p_amt1    = v(ws_ev, r, 6)
        p_lbl2    = v(ws_ev, r, 7)
        p_amt2    = v(ws_ev, r, 8)

        prices = []
        if p_amt1:
            prices.append({"label": p_lbl1, "amount": p_amt1})
        if p_amt2:
            prices.append({"label": p_lbl2, "amount": p_amt2})
        if not prices:
            prices = [{"label": "", "amount": ""}]

        dish = {"icon": "", "name": dish_name, "desc": dish_desc, "prices": prices}

        # Add to the section this dish belongs to (col A name matches sec_order)
        if col_a_str in sections:
            sections[col_a_str].append(dish)
        elif sec_order:
            sections[sec_order[-1]].append(dish)

    section_list = [
        {"name": sname, "style": "green", "dishes": sections[sname]}
        for sname in sec_order
    ]

    events[key] = {
        "title":    block["title"],
        "subtitle": block["subtitle"],
        "order_by": order_by,
        "active":   active,
        "sections": section_list,
    }

# ── 5. Assemble & Write ───────────────────────────────────────────────────────
menu = {
    "settings": settings,
    "carousel":  carousel,
    "tiffin":   tiffin,
    "events":   events,
}

OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
    json.dump(menu, f, ensure_ascii=False, indent=2)

print(f"✓ Written: {OUTPUT_JSON}")
print(f"  Settings fields: {sum(1 for v in settings.values() if v)}/{len(settings)}")
print(f"  Carousel images: {len(carousel)}")
print(f"  Tiffin — last:{len(tiffin['last_week']['dishes'])}  this:{len(tiffin['this_week']['dishes'])}  next:{len(tiffin['next_week']['dishes'])} dishes")
for k, ev in events.items():
    total = sum(len(s['dishes']) for s in ev['sections'])
    print(f"  Event {k}: active={ev['active']}  sections={len(ev['sections'])}  dishes={total}")

print()
print("Next steps:")
print("  git add data/menu.json")
print('  git commit -m "Update menu from Excel"')
print("  git push origin main")
