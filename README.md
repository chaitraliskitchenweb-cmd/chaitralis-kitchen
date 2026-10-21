# Chaitrali's Kitchen

A responsive website for homemade vegetarian Maharashtrian food, weekly tiffin and celebration catering.

## Update the website without editing code

1. Open the website and choose **Update menu** in the footer (or open `admin.html`).
2. Edit the weekly menu, catering, seasonal specials, reviews or business details.
3. Choose **Save Changes**, then **Download menu.json**.
4. Sign in to GitHub, open this repository's `data` folder and upload the downloaded file, replacing the existing `menu.json`.
5. Confirm **Commit changes**. GitHub Pages publishes the update in a few minutes.

The menu editor saves a draft only in the browser where you are using it. Download the file and commit it to publish the update. The editor itself does not require a password; publishing is controlled by your GitHub sign-in.

## Site content

- `index.html` is the public website.
- `data/menu.json` holds menu, contact and business information used by the website.
- `admin.html` is the browser-based menu editor.
- `data/menu.xlsx` is an optional spreadsheet source. It does not automatically publish changes; the browser editor workflow above is the simplest update path.
- `scripts/build_menu.py` converts the spreadsheet to JSON for someone maintaining the site.

Before launch, review the phone number, menu dates, prices, delivery areas, seasonal availability and customer reviews in `data/menu.json`.
