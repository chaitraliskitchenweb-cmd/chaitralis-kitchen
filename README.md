# Chaitrali's Kitchen

A responsive website for homemade vegetarian Maharashtrian food, weekly tiffin and celebration catering.

## Update the website without editing code

1. Open `admin.html` on the website and sign in.
2. Edit the business details, this week's curries, the weekly order (combos, add-ons, specials, delivery zones), events or carousel.
3. Choose **Save Changes**. The site updates in a minute or two.

Saving writes `data/ChaitralisKitchen_ContentPack.xlsx` on GitHub. A GitHub Action (`.github/workflows/rebuild-menu.yml`) then runs `excel-to-json.py` to rebuild `data/menu.json`, which every page reads.

## Taking orders on the website

The Order page has its own order form: customers pick a combo, its curries, add-ons, specials and a delivery zone, see the total (free delivery over the amount set on the admin page), and send the order. Each order becomes a row in a Google Sheet, and Chaitrali gets an email for it. Because the form reads the same menu as the website, there is nothing to keep in sync.

Until the Orders sheet is connected, the Order buttons open the Google Form set under **Business Info → Order Form Link**.

### One-time setup (about 10 minutes, in Chaitrali's Google account)

1. Create a new Google Sheet, for example **Tiffin Orders**.
2. In the sheet, choose **Extensions → Apps Script**.
3. Delete what is in the editor, paste in everything from [`scripts/order-sheet.gs`](scripts/order-sheet.gs), and save.
4. Choose **Deploy → New deployment**. Under **Select type** pick **Web app**, then set
   - **Execute as:** Me
   - **Who has access:** Anyone
5. Choose **Deploy**, then **Authorize access** and allow it with the same Google account. (Google warns that the app is unverified because you wrote it yourself: choose **Advanced → Go to … (unsafe)**.)
6. Copy the **Web app URL** (it ends in `/exec`).
7. On the website's admin page, paste it into **Business Info → Order Sheet Link** and choose **Save Changes**.

The Order page switches to the built-in form a minute or two later. The first order adds an **Orders** tab with a header row; the last column, **Status**, is for Chaitrali's own notes (Invoiced, Paid…).

To stop taking orders on the website, clear the **Order Sheet Link** and save: the buttons go back to the Google Form.

**If you edit the script later,** use **Deploy → Manage deployments → ✏️ → Version: New version → Deploy** so the same link keeps working.

Settings at the top of the script: `NOTIFY_EMAIL` (blank = the account that deployed it) and `SEND_CUSTOMER_CONFIRMATION` (emails the customer a copy).

## Site content

- `index.html` is the public home page; `pages/` holds the tiffin menu, order and events pages.
- `data/menu.json` holds the menu, settings and events every page reads. It is generated: edit through the admin page.
- `admin.html` is the browser-based editor.
- `scripts/site.js` and `scripts/site.css` are shared by every page (settings, countdown, festival mode).
- `scripts/order-sheet.gs` is the Google Apps Script behind the order form.
