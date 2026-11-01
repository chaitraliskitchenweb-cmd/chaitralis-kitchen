# Chaitrali's Kitchen

The website for Chaitrali's Kitchen: homemade vegetarian Maharashtrian food from Shrewsbury, MA, with a weekly tiffin and festival and event catering.

Live at **https://chaitraliskitchen.com**. It is a static site served by GitHub Pages from the `main` branch. Anything pushed to `main` is live a minute or two later.

## The pages

| Page | File | What it shows |
|---|---|---|
| Home | `index.html` | Hero, this week's curries, the delivery schedule and order cutoff, favourites, contact |
| Weekly Tiffin | `pages/weekly-menu.html` | This week's combos, curries, add-ons and specials, delivery zones, notes and FAQ |
| Order | `pages/order.html` | The online order form for the weekly tiffin; festival and custom events go to WhatsApp or a call |
| Events | `pages/event-menu.html` | Festival menus (Ganpati, Diwali, Holi) and custom event catering |
| Admin | `admin.html` | Password-protected editor for everything above (not linked from the site, hidden from search engines) |

Every page reads its menu, prices and settings from `data/menu.json`, so a change made on the admin page shows up everywhere at once.

## Updating the menu each week (no code)

1. Open **chaitraliskitchen.com/admin.html** and enter the admin password.
2. Change what you need:
   - **⚙️ Business Info:** phone, WhatsApp, email, delivery day and time, order cutoff, free-delivery amount, what every combo includes (e.g. *complimentary rice*), payment details, allergen note, order notes, and the two order links below.
   - **📅 This Week's Curries:** the delivery date and this week's curries (name, description, tag).
   - **🛒 Weekly Order:** combos (size, number of curries, price), add-ons, specials and delivery zones with their fees.
   - **🎉 Events:** festival menus, their order-by dates and whether each is shown.
   - **🖼 Carousel:** *not used by any page at the moment*. The home page photo strip is written into `index.html`.
3. Choose **Save Changes**. The site updates in a minute or two (refresh the page to see it).

How it works: saving writes `data/ChaitralisKitchen_ContentPack.xlsx` to GitHub. A GitHub Action (`.github/workflows/rebuild-menu.yml`) then runs `excel-to-json.py`, which regenerates `data/menu.json` and commits it. Don't edit `menu.json` by hand: the next save overwrites it.

The admin password is a GitHub fine-grained token with write access to this one repository. If it stops working, create a new one under GitHub → Settings → Developer settings → Fine-grained tokens (Contents: Read and write, this repository only).

### Dish photos

The Weekly Tiffin page shows a photo for a dish when `images/menu-items/` has a file named after the dish in lower case with dashes, e.g. *Saoji Masala Vangi* → `saoji-masala-vangi.jpg`. Dishes without a photo are simply left out of the photo strip.

## Orders

### How a customer orders

On the Order page the customer picks a combo and size, exactly the number of curries the combo includes, any add-ons and specials, and delivery or pickup. They see the total as they go, with free delivery above the **Free Delivery Over** amount. They then add their name, phone, email and address and choose **Place order**.

Each order:
- is checked and re-priced against the live menu by the Google Apps Script, so the prices can't be changed in the browser;
- becomes a row in the **Orders** tab of the order Google Sheet, with an order number like `CK-1030-002`;
- sends an email to Chaitrali, and a confirmation email to the customer.

The last column in the sheet, **Status**, is for Chaitrali's own notes (Invoiced, Paid, Delivered…). If an order can't be sent, the page offers to send it on WhatsApp instead.

### Order links on the admin page

- **Order Sheet Link (website order form):** the Apps Script web app URL (ends in `/exec`). While it is set, every Order button on the site opens the built-in form.
- **Order Form Link (Google Form):** the fallback. If the Order Sheet Link is cleared, the Order buttons open this Google Form instead.

### Setting up the order sheet (already done; for reference)

1. Create a Google Sheet (e.g. **Tiffin Orders**) in Chaitrali's Google account and choose **Extensions → Apps Script**.
2. Replace the editor's contents with [`scripts/order-sheet.gs`](scripts/order-sheet.gs) and save.
3. Choose **Deploy → New deployment → Web app**, with **Execute as: Me** and **Who has access: Anyone**.
4. Choose **Deploy → Authorize access**. Google warns the app is unverified because you wrote it; choose **Advanced → Go to … (unsafe)**.
5. Copy the **Web app URL**, paste it into **Order Sheet Link** on the admin page and save.

**After editing the script,** use **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**, so the same link keeps working. A new deployment would get a new link.

Settings at the top of the script: `NOTIFY_EMAIL` (blank means the account that deployed it) and `SEND_CUSTOMER_CONFIRMATION`.

To check the script is up, open the `/exec` link in a browser: it should show `{"ok":true,…}`.

## Things that happen on their own

- **Order countdown:** the nav shows the time left until the **Order Cutoff** (US Eastern time). In the last hour a pressure cooker whistles.
- **Festival mode:** from 21 days before an active Ganpati, Diwali or Holi event's order-by date until 7 days after it, the site dresses up for that festival: a toran, lights or gulal under the nav, plus a festival banner on the home page. With no order-by date, the festival's own date is used instead (listed in `scripts/site.js`; Diwali 2026 is set to 8 November, so add next year's there).
- **Festival flyers:** put a flyer at `images/events/<festival>/flyer.jpg` (e.g. `images/events/diwali/flyer.jpg`). It then shows large at the top of that festival's menu with a **Download the menu flyer** button, and during festival mode it takes the logo's place at the top of the home page.
- **Dark mode:** pages follow the visitor's phone or computer setting.

To preview these looks, add `?festival=ganpati`, `?festival=diwali`, `?festival=holi` (or `?festival=off`) or `?whistle` to any page's address.

## Files

```
index.html                 Home page
pages/                     weekly-menu.html, order.html, event-menu.html
admin.html                 Content editor
data/
  ChaitralisKitchen_ContentPack.xlsx   The content (edited through admin.html)
  menu.json                Generated from the spreadsheet; read by every page
excel-to-json.py           Spreadsheet → menu.json converter (run by the GitHub Action)
scripts/
  site.js, site.css        Shared by every page: settings, nav, countdown, festival mode
  order-sheet.gs           Google Apps Script behind the order form
images/                    hero/, carousel/, menu-items/, weekly-menu/, events/, favourites/, general/
Logo/                      Logo files
.github/workflows/         rebuild-menu.yml (spreadsheet → menu.json)
CNAME                      Custom domain (chaitraliskitchen.com)
robots.txt, sitemap.xml    Search engine settings
```

## Working on the code

Preview locally from the repository root:

```bash
python3 -m http.server 8123
```

Then open http://localhost:8123. The pages fetch `data/menu.json`, so opening the HTML files directly from disk won't load the menu.

To rebuild `menu.json` locally after changing the spreadsheet or the converter:

```bash
pip install openpyxl && python3 excel-to-json.py data/ChaitralisKitchen_ContentPack.xlsx
```

Before pushing layout changes, check a phone width (320–390px), a tablet and a laptop, in light and dark mode. The nav collapses into the ☰ menu below 780px.
