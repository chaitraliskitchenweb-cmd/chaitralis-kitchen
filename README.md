# Chaitrali's Kitchen — Website

Pure vegetarian, homemade Indian food with Marathi touches. Weekly tiffin service and event catering.

**Live site:** enable GitHub Pages (see below), then `https://<username>.github.io/chaitralis-kitchen/`

## How it works

```
data/menu.xlsx   ← the ONLY file you edit week to week (Excel, locally)
      │
      ▼  (GitHub Action runs automatically on push, or run scripts/build_menu.py)
data/menu.json   ← generated — never edit by hand
      │
      ▼
index.html       ← reads menu.json and renders the site
```

No Google Sheets, no Gmail workflow. Everything lives in this repository.

## Weekly menu update (the routine)

1. Open `data/menu.xlsx` in Excel and update the **Tiffin Menu** tab (and the *Week Of* cell).
2. Save.
3. Commit and push — in GitHub Desktop: *Commit* → *Push origin*.
4. Done. The **Build menu.json** GitHub Action converts the Excel file and the site updates in about a minute.

Working without the Action? Run `python3 scripts/build_menu.py` before committing (needs `pip install openpyxl`).

## What's in the workbook

| Tab | Controls |
|---|---|
| Tiffin Menu | The weekly rotating tiffin menu |
| Catering Menu | Catering dishes, prices, allergen tags (`Available` = FALSE hides a dish) |
| Seasonal Specials | Festival items — set `Active` = TRUE during Ganesh Chaturthi, Diwali, etc. |
| Reviews | Customer testimonials shown on the site |
| Settings | Phone/WhatsApp, email, tiffin prices, delivery zones, payment (Zelle/Venmo), allergy disclosure |
| How To Update | This guide, inside the workbook |

## First-time setup checklist

1. **Create the GitHub repo** and push this folder:
   ```
   git remote add origin https://github.com/<username>/chaitralis-kitchen.git
   git push -u origin main
   ```
2. **Enable GitHub Pages:** repo → Settings → Pages → Source: *Deploy from a branch* → Branch: `main`, folder `/ (root)`.
3. **Allow the Action to push:** repo → Settings → Actions → General → Workflow permissions → *Read and write permissions*.
4. **Update the Settings tab** in `data/menu.xlsx` with the real WhatsApp number (`phone_whatsapp`, digits with country code, e.g. `16175551234`), Venmo handle, prices and delivery zones — placeholders are in there now.
5. Push once and confirm the Action turns green under the **Actions** tab.

## Repo layout

```
index.html                     the whole website (single file)
data/menu.xlsx                 editable menu workbook
data/menu.json                 auto-generated site data
scripts/build_menu.py          xlsx → json converter
.github/workflows/build-menu.yml   auto-build on push
archive/                       previous Google-Sheets version of the site
```
