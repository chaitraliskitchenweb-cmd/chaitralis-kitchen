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
# Sheet: ⚙️ Business Info, Column A = label, Column B = value (rows 4–17)
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
    "order_form_url": v(ws_biz, 15, 2),
    "free_delivery_over": v(ws_biz, 16, 2),
    "order_notes":    [line.strip() for line in v(ws_biz, 17, 2).splitlines() if line.strip()],
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

# ── 4. Event Menus ─────────────────────────────────────────────
# Sheet: 🎉 Event Menus
#
# Events are found by scanning, not by fixed row numbers, so any number of
# events, sections and dishes can be added from the admin page.
#
# An event starts at a row whose column A holds the event name and whose next
# row's column A begins with "Active on website?":
#
#     A                           B      C                 D
#   | 🪔 Diwali              |      | <subtitle>      |
#   | Active on website? (Y/N)  | Y/N  | Order-By Date   | <date>
#   | Section / Dish            | #    | Name            | ...
#   |   ▸ Appetizer             |                          <- section
#   | Appetizer                 | 1    | Mini Batata Vada| ...  <- dish
ws_ev = wb["🎉 Event Menus"]

def slugify(text):
    """'Custom Event' -> 'custom_event'; used as the key in menu.json."""
    out = []
    for ch in text.lower():
        if ch.isalnum():
            out.append(ch)
        elif out and out[-1] != "_":
            out.append("_")
    return "".join(out).strip("_")

def split_emoji(text):
    """'🪔 Diwali' -> ('🪔', 'Diwali'). Leading non-letter characters are the icon."""
    i = 0
    while i < len(text) and not (text[i].isalnum() or text[i] in "&'()"):
        i += 1
    return text[:i].strip(), text[i:].strip()

def is_event_header(row):
    """A name in column A, nothing beside it, and 'Active on website?' underneath."""
    if not v(ws_ev, row, 1):
        return False
    if any(v(ws_ev, row, c) for c in (2, 4, 5, 6, 7, 8)):
        return False
    return v(ws_ev, row + 1, 1).lower().startswith("active on website")

# Find where each event begins.
header_rows = [r for r in range(1, ws_ev.max_row + 1) if is_event_header(r)]

events = {}
for idx, head in enumerate(header_rows):
    raw_title = v(ws_ev, head, 1)
    emoji, rest = split_emoji(raw_title)

    # The header cell is merged across the row, so the subtitle rides along in
    # the same text after an em dash:  "🪔 Diwali — Festival of Lights Menu"
    if "—" in rest:
        title, subtitle = [part.strip() for part in rest.split("—", 1)]
    else:
        title, subtitle = rest.strip(), ""

    key = slugify(title)
    if not key:
        continue

    active_row = head + 1
    active     = v(ws_ev, active_row, 2).upper() == "Y"
    order_by   = v(ws_ev, active_row, 4)

    # Body runs until the next event header (or the end of the sheet).
    body_start = active_row + 2            # skip the column-header row
    body_end   = (header_rows[idx + 1] - 1) if idx + 1 < len(header_rows) else ws_ev.max_row

    sections  = {}
    sec_order = []
    for r in range(body_start, body_end + 1):
        col_a = v(ws_ev, r, 1)
        if not col_a:
            continue

        if "▸" in col_a:
            sec_name = col_a.replace("▸", "").strip()
            if sec_name and sec_name not in sections:
                sections[sec_name] = []
                sec_order.append(sec_name)
            continue

        dish_name = v(ws_ev, r, 3)
        if not dish_name:
            continue

        prices = []
        if v(ws_ev, r, 6):
            prices.append({"label": v(ws_ev, r, 5), "amount": v(ws_ev, r, 6)})
        if v(ws_ev, r, 8):
            prices.append({"label": v(ws_ev, r, 7), "amount": v(ws_ev, r, 8)})
        if not prices:
            prices = [{"label": "", "amount": ""}]

        dish = {"icon": "", "name": dish_name, "desc": v(ws_ev, r, 4), "prices": prices}

        if col_a in sections:
            sections[col_a].append(dish)
        elif sec_order:
            sections[sec_order[-1]].append(dish)

    events[key] = {
        "title":    title,
        "subtitle": subtitle,
        "emoji":    emoji,
        "order_by": order_by,
        "active":   active,
        "sections": [
            {"name": name, "style": "green", "dishes": sections[name]} for name in sec_order
        ],
    }

# ── 5. Weekly Order ───────────────────────────────────────────────────────────
# Sheet: 🛒 Weekly Order. Lists of any length, each under a "▸ <name>" row
# followed by one column-header row:
#
#   ▸ Combos          Combo | Size | Curries | Price
#   ▸ Add-ons         Item  | Option | Price
#   ▸ Specials        Dish  | Description | Price
#   ▸ Delivery Zones  Zone  | Areas / Address | Fee
#
# This week's curries are the This Week dishes on the Weekly Tiffin sheet.
ORDER_LISTS = {
    "combos":   ("combo",    ["name", "size", "curries", "price"]),
    "addons":   ("add",      ["name", "option", "price"]),
    "specials": ("special",  ["name", "desc", "price"]),
    "zones":    ("zone",     ["name", "areas", "fee"]),
}
weekly_order = {key: [] for key in ORDER_LISTS}
if "🛒 Weekly Order" in wb.sheetnames:
    ws_order = wb["🛒 Weekly Order"]
    current, skip_header = None, False
    for r in range(1, ws_order.max_row + 1):
        col_a = v(ws_order, r, 1)
        if col_a.startswith("▸"):
            label = col_a.replace("▸", "").strip().lower()
            current = next((k for k, (word, _) in ORDER_LISTS.items() if word in label), None)
            skip_header = True
            continue
        if not current or not col_a:
            continue
        if skip_header:                      # the column-header row under "▸ name"
            skip_header = False
            continue
        fields = ORDER_LISTS[current][1]
        weekly_order[current].append({f: v(ws_order, r, i + 1) for i, f in enumerate(fields)})

# ── 6. Assemble & Write ───────────────────────────────────────────────────────
menu = {
    "settings": settings,
    "carousel":  carousel,
    "tiffin":   tiffin,
    "events":   events,
    "weekly_order": weekly_order,
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
