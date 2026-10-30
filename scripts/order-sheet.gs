/**
 * Chaitrali's Kitchen — weekly tiffin orders → Google Sheet
 *
 * Paste this into a Google Sheet's Apps Script editor and deploy it as a web
 * app (README.md, "Taking orders on the website", has the steps). The Order
 * page posts each order here; this script re-prices it from the live menu,
 * adds a row to the "Orders" tab and emails Chaitrali (and the customer).
 *
 * Nothing here is secret: the web-app link only lets people submit orders.
 */

const SITE_MENU = 'https://chaitraliskitchen.com/data/menu.json';
const SHEET_NAME = 'Orders';
const NOTIFY_EMAIL = '';                  // blank = the Google account that deployed this
const SEND_CUSTOMER_CONFIRMATION = true;  // email the customer a copy of their order
const TIME_ZONE = 'America/New_York';

const HEADERS = ['Order ID', 'Received', 'Week', 'Name', 'Phone', 'Email', 'Delivery',
  'Address', 'Combo', 'Curries', 'Add-ons', 'Specials', 'Delivery fee', 'Subtotal',
  'Total', 'Notes', 'Status'];

function doGet() {
  return json({ ok: true, service: "Chaitrali's Kitchen orders" });
}

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (data.website) return json({ ok: true, order_id: 'CK' });   // honeypot: a bot filled the hidden field

    const menu = JSON.parse(UrlFetchApp.fetch(SITE_MENU + '?t=' + Date.now()).getContentText());
    const order = priceOrder(data.order || {}, menu);
    const c = data.customer || {};
    const customer = {
      name: text(c.name, 80), phone: text(c.phone, 30), email: text(c.email, 120),
      address: text(c.address, 300), notes: text(c.notes, 600)
    };
    if (!customer.name || !customer.phone || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customer.email)) {
      throw new Error('Please fill in your name, phone and a valid email.');
    }
    if (!order.pickup && !customer.address) throw new Error('Please add a delivery address.');

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    let id;
    try {
      const sheet = ordersSheet();
      const now = new Date();
      id = 'CK-' + Utilities.formatDate(now, TIME_ZONE, 'MMdd') + '-' + String(sheet.getLastRow()).padStart(3, '0');
      sheet.appendRow([
        id, Utilities.formatDate(now, TIME_ZONE, 'yyyy-MM-dd HH:mm'), text(data.week, 60),
        customer.name, customer.phone, customer.email,
        order.zone.name + (order.zone.fee ? ' (' + order.zone.fee + ')' : ''), customer.address,
        order.combo.name + ' · ' + order.combo.size + ' · ' + order.combo.price,
        order.curries.join(', '),
        order.addons.map(a => a.name + ': ' + a.option + ' ' + a.price).join('; '),
        order.specials.map(s => s.name + ' × ' + s.qty).join('; '),
        order.deliveryFee, order.subtotal, order.total, customer.notes, ''
      ].map(safeCell));
    } finally {
      lock.releaseLock();
    }

    const summary = summaryText(id, order, customer, data.week);
    MailApp.sendEmail(NOTIFY_EMAIL || Session.getEffectiveUser().getEmail(),
      'New tiffin order ' + id + ' — ' + customer.name + ' — ' + money(order.total), summary);
    if (SEND_CUSTOMER_CONFIRMATION) {
      MailApp.sendEmail(customer.email, "Chaitrali's Kitchen — we got your order " + id,
        'Thank you, ' + customer.name + '!\n\n' + summary +
        '\n\nWe will send your invoice shortly. Payment confirms the order.');
    }
    return json({ ok: true, order_id: id, total: order.total });
  } catch (err) {
    return json({ ok: false, error: String((err && err.message) || err) });
  }
}

/* Re-price the order from the live menu, so the sheet never trusts the browser's numbers. */
function priceOrder(o, menu) {
  const wo = menu.weekly_order || {}, s = menu.settings || {};
  const curriesOnMenu = ((menu.tiffin || {}).this_week || {}).dishes || [];

  const combo = (wo.combos || []).find(c => c.name === (o.combo || {}).name && c.size === (o.combo || {}).size);
  if (!combo) throw new Error('Please choose a combo from this week\'s menu.');

  const need = parseInt(combo.curries, 10) || 0;
  const curries = Array.from(new Set((o.curries || []).map(String)));
  if (curries.length !== need) throw new Error('Your ' + combo.name + ' combo needs ' + need + ' curries.');
  curries.forEach(name => {
    if (!curriesOnMenu.some(d => d.name === name)) throw new Error(name + ' is not on this week\'s menu.');
  });

  const addons = (o.addons || []).map(a => {
    const row = (wo.addons || []).find(x => x.name === a.name && x.option === a.option);
    if (!row) throw new Error('An add-on is no longer on the menu.');
    return row;
  });

  const specials = (o.specials || []).map(sp => {
    const row = (wo.specials || []).find(x => x.name === sp.name);
    const qty = parseInt(sp.qty, 10);
    if (!row || !(qty >= 1 && qty <= 10)) throw new Error('A special is no longer on the menu.');
    return { name: row.name, price: row.price, qty: qty };
  });

  const zone = (wo.zones || []).find(z => z.name === (o.zone || {}).name);
  if (!zone) throw new Error('Please choose a delivery zone or pickup.');
  const pickup = isPickup(zone);

  const subtotal = round(amount(combo.price) +
    addons.reduce((t, a) => t + amount(a.price), 0) +
    specials.reduce((t, sp) => t + amount(sp.price) * sp.qty, 0));
  const freeOver = amount(s.free_delivery_over);
  const deliveryFee = pickup || (freeOver && subtotal > freeOver) ? 0 : amount(zone.fee);

  return { combo, curries, addons, specials, zone, pickup, subtotal, deliveryFee, total: round(subtotal + deliveryFee) };
}

function summaryText(id, o, c, week) {
  const lines = [
    'Order ' + id + (week ? ' — ' + week : ''),
    '',
    'Combo: ' + o.combo.name + ', ' + o.combo.size + ' — ' + o.combo.price,
    'Curries: ' + o.curries.join(', ')
  ];
  o.addons.forEach(a => lines.push('Add-on: ' + a.name + ', ' + a.option + ' — ' + a.price));
  o.specials.forEach(sp => lines.push('Special: ' + sp.name + ' × ' + sp.qty + ' — ' + money(amount(sp.price) * sp.qty)));
  lines.push(o.pickup ? 'Pickup: ' + o.zone.areas : 'Delivery: ' + o.zone.name + ' — ' + (o.deliveryFee ? money(o.deliveryFee) : 'free'));
  lines.push('', 'Total: ' + money(o.total), '', 'Name: ' + c.name, 'Phone: ' + c.phone, 'Email: ' + c.email);
  if (!o.pickup) lines.push('Address: ' + c.address);
  if (c.notes) lines.push('Notes: ' + c.notes);
  return lines.join('\n');
}

function ordersSheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = book.getSheetByName(SHEET_NAME) || book.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

function isPickup(zone) {
  return /pick\s*-?\s*up/i.test(zone.name) || /^free$/i.test(String(zone.fee).trim());
}
function amount(t) { const n = parseFloat(String(t || '').replace(/[^0-9.]/g, '')); return isNaN(n) ? 0 : n; }
function round(n) { return Math.round(n * 100) / 100; }
function money(n) { return '$' + Number(n).toFixed(2); }
function text(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }
// A cell starting with = + - @ would be read as a formula.
function safeCell(v) { return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v; }
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
