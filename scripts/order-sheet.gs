/**
 * Chaitrali's Kitchen — weekly tiffin orders → Google Sheet
 *
 * Paste this into a Google Sheet's Apps Script editor and deploy it as a web
 * app (README.md, "Taking orders on the website", has the steps). The Order
 * page posts each order here; this script re-prices it from the live menu,
 * adds a row to the "Orders" tab and emails Chaitrali (and the customer).
 *
 * Order numbers run per delivery: CK-<delivery date MMdd>-<001, 002…>, e.g.
 * every order for Tuesday 17 November is CK-1117-001, CK-1117-002… Orders
 * after the Sunday cutoff count toward the following delivery.
 *
 * Reports: the "Chaitrali's Kitchen" menu in the sheet builds a Weekly Report
 * tab, and "Email the report every week" sends it when orders close. The
 * admin page's Reports tab reads the same report with the report password
 * (set it from that menu; it is kept in the script's properties, not here).
 *
 * Nothing here is secret: the web-app link only lets people submit orders.
 */

const SITE_MENU = 'https://chaitraliskitchen.com/data/menu.json';
const SHEET_NAME = 'Orders';
const NOTIFY_EMAIL = '';                  // blank = the Google account that deployed this
const SEND_CUSTOMER_CONFIRMATION = true;  // email the customer a copy of their order
const TIME_ZONE = 'America/New_York';
const REPORT_SHEET = 'Weekly Report';
const DAY_MS = 86400000;

const HEADERS = ['Order ID', 'Received', 'Week', 'Name', 'Phone', 'Email', 'Delivery',
  'Address', 'Combo', 'Curries', 'Add-ons', 'Specials', 'Delivery fee', 'Subtotal',
  'Total', 'Notes', 'Status'];

function doGet() {
  return json({ ok: true, service: "Chaitrali's Kitchen orders" });
}

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (data.action === 'report') return json(reportRequest(data));
    if (data.website) return json({ ok: true, order_id: 'CK' });   // honeypot: a bot filled the hidden field

    const menu = liveMenu();
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
    let id, week;
    try {
      const sheet = ordersSheet();
      const now = new Date();
      week = isoDay(deliveryFor(now, menu.settings || {}));
      id = nextOrderId(sheet, week);
      sheet.appendRow([
        id, Utilities.formatDate(now, TIME_ZONE, 'yyyy-MM-dd HH:mm'), "'" + week,
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

    const summary = summaryText(id, order, customer, 'delivery ' + niceDay(week));
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

function liveMenu() {
  return JSON.parse(UrlFetchApp.fetch(SITE_MENU + '?t=' + Date.now()).getContentText());
}

/* ── Delivery weeks ──
   The delivery an order is for: the first delivery day (from "Tuesday delivery
   · 6–9 PM") after the next order cutoff (from "Sunday 5 PM"), in Eastern time.
   Dates are handled as UTC midnights of the Eastern calendar day. */
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
function weekday(t) {
  const s = String(t || '').toLowerCase();
  return WEEKDAYS.findIndex(d => s.indexOf(d) >= 0);
}
function cutoffMinutes(t) {
  const m = String(t || '').match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!m) return 24 * 60;
  return (+m[1] % 12 + (/pm/i.test(m[3]) ? 12 : 0)) * 60 + (+m[2] || 0);
}
function deliveryFor(date, settings) {
  const p = Utilities.formatDate(date, TIME_ZONE, 'yyyy-MM-dd-HH-mm').split('-').map(Number);
  const today = Date.UTC(p[0], p[1] - 1, p[2]);
  const cutDay = weekday(settings.order_cutoff), delDay = weekday(settings.tiffin_days);
  if (cutDay < 0 || delDay < 0) return new Date(today);
  let ahead = (cutDay - new Date(today).getUTCDay() + 7) % 7;
  if (ahead === 0 && p[3] * 60 + p[4] >= cutoffMinutes(settings.order_cutoff)) ahead = 7;
  return new Date(today + (ahead + ((delDay - cutDay + 7) % 7 || 7)) * DAY_MS);
}
function isoDay(d) { return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd'); }
function niceDay(iso) { return Utilities.formatDate(new Date(iso + 'T00:00:00Z'), 'UTC', 'EEE d MMM'); }
function shiftWeek(iso, weeks) { return isoDay(new Date(Date.parse(iso + 'T00:00:00Z') + weeks * 7 * DAY_MS)); }

/* A cell read back from the sheet as a yyyy-MM-dd day, whether Sheets kept it as text or a date. */
function cellDay(v) {
  if (v instanceof Date) return Utilities.formatDate(v, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  const m = String(v || '').match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : '';
}

function nextOrderId(sheet, week) {
  const prefix = 'CK-' + week.slice(5, 7) + week.slice(8, 10) + '-';
  let last = 0;
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues().forEach(r => {
      const id = String(r[0]);
      if (id.indexOf(prefix) === 0 && cellDay(r[2]) === week) last = Math.max(last, parseInt(id.slice(prefix.length), 10) || 0);
    });
  }
  return prefix + String(last + 1).padStart(3, '0');
}

/* ── Reports ──
   One report per delivery: order count, sales, a cooking list and a delivery
   list. Cancelled orders (Status contains "cancel") are listed but not counted. */
function readOrders(settings) {
  const sheet = ordersSheet();
  const rows = sheet.getDataRange().getValues();
  const head = rows.shift() || [];
  const col = name => head.indexOf(name);
  return rows.filter(r => r[col('Order ID')]).map(r => {
    const get = name => (col(name) >= 0 ? r[col(name)] : '');
    let week = cellDay(get('Week'));
    if (!week) {
      const rec = get('Received');
      const when = rec instanceof Date ? rec : Utilities.parseDate(String(rec), TIME_ZONE, 'yyyy-MM-dd HH:mm');
      week = isoDay(deliveryFor(when, settings));
    }
    return {
      id: String(get('Order ID')), week: week, name: String(get('Name')), phone: String(get('Phone')),
      email: String(get('Email')), zone: String(get('Delivery')), address: String(get('Address')),
      combo: String(get('Combo')), curries: String(get('Curries')), addons: String(get('Add-ons')),
      specials: String(get('Specials')), fee: amount(get('Delivery fee')), subtotal: amount(get('Subtotal')),
      total: amount(get('Total')), notes: String(get('Notes')), status: String(get('Status'))
    };
  });
}

function buildReport(week, settings) {
  const all = readOrders(settings);
  const orders = all.filter(o => o.week === week);
  const live = orders.filter(o => !/cancel/i.test(o.status));
  const tally = {}, add = (group, key, n) => {
    if (!key) return;
    tally[group] = tally[group] || {};
    tally[group][key] = (tally[group][key] || 0) + n;
  };
  live.forEach(o => {
    const parts = o.combo.split(' · '), size = parts[1] || '';
    add('Combos', parts.slice(0, 2).join(' · '), 1);
    o.curries.split(/,\s*/).forEach(c => add('Curries', c.trim() + (size ? ' · ' + size : ''), 1));
    o.addons.split(/;\s*/).forEach(a => add('Add-ons', a.replace(/\s+\$[\d.]+$/, '').trim(), 1));
    o.specials.split(/;\s*/).forEach(sp => {
      const m = sp.match(/^(.*?)\s*×\s*(\d+)$/);
      if (m) add('Specials', m[1], +m[2]);
    });
  });
  const cooking = ['Combos', 'Curries', 'Add-ons', 'Specials'].map(g => ({
    group: g, items: Object.keys(tally[g] || {}).map(k => [k, tally[g][k]]).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  }));
  const weeks = Array.from(new Set(all.map(o => o.week))).sort().reverse();
  return {
    ok: true, week: week, label: niceDay(week), weeks: weeks,
    count: live.length, cancelled: orders.length - live.length,
    subtotal: round(live.reduce((t, o) => t + o.subtotal, 0)),
    fees: round(live.reduce((t, o) => t + o.fee, 0)),
    sales: round(live.reduce((t, o) => t + o.total, 0)),
    cooking: cooking,
    orders: orders.sort((a, b) => (a.zone < b.zone ? -1 : a.zone > b.zone ? 1 : a.id < b.id ? -1 : 1))
  };
}

/* The admin page asks for a report with the report password. */
function reportRequest(data) {
  const key = PropertiesService.getScriptProperties().getProperty('REPORT_KEY');
  if (!key) return { ok: false, error: 'Reports are not switched on yet: set a report password from the sheet\'s Chaitrali\'s Kitchen menu.' };
  if (String(data.key || '') !== key) return { ok: false, error: 'That report password is not right.' };
  const settings = liveMenu().settings || {};
  const upcoming = isoDay(deliveryFor(new Date(), settings));
  const week = /^\d{4}-\d{2}-\d{2}$/.test(data.week || '') ? data.week : upcoming;
  const r = buildReport(week, settings);
  r.upcoming = upcoming;
  return r;
}

function reportText(r) {
  const lines = ['Weekly report — delivery ' + r.label, '',
    'Orders: ' + r.count + (r.cancelled ? ' (+' + r.cancelled + ' cancelled)' : ''),
    'Sales: ' + money(r.sales) + '  (food ' + money(r.subtotal) + ', delivery ' + money(r.fees) + ')'];
  r.cooking.forEach(g => {
    if (!g.items.length) return;
    lines.push('', g.group.toUpperCase());
    g.items.forEach(i => lines.push('  ' + i[1] + ' × ' + i[0]));
  });
  lines.push('', 'DELIVERIES');
  r.orders.forEach(o => lines.push('  ' + o.id + ' · ' + o.zone + ' · ' + o.name + ' · ' + o.phone +
    (o.address ? ' · ' + o.address : '') + ' · ' + money(o.total) + (o.status ? ' · ' + o.status : '') +
    (o.notes ? '\n      Note: ' + o.notes : '')));
  return lines.join('\n');
}

function writeReportSheet(r) {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = book.getSheetByName(REPORT_SHEET) || book.insertSheet(REPORT_SHEET);
  sheet.clear();
  const rows = [['Weekly report — delivery ' + r.label, '', '', '', '', '', ''],
    ['Orders', r.count, 'Cancelled', r.cancelled, '', '', ''],
    ['Sales', r.sales, 'Food', r.subtotal, 'Delivery fees', r.fees, ''], ['', '', '', '', '', '', '']];
  r.cooking.forEach(g => {
    if (!g.items.length) return;
    rows.push([g.group, 'How many', '', '', '', '', '']);
    g.items.forEach(i => rows.push([i[0], i[1], '', '', '', '', '']));
    rows.push(['', '', '', '', '', '', '']);
  });
  rows.push(['Deliveries', '', '', '', '', '', '']);
  rows.push(['Order ID', 'Delivery', 'Name', 'Phone', 'Address', 'Total', 'Status / notes']);
  r.orders.forEach(o => rows.push([o.id, o.zone, o.name, o.phone, o.address, o.total,
    [o.status, o.notes].filter(String).join(' · ')]));
  sheet.getRange(1, 1, rows.length, 7).setValues(rows.map(row => row.map(safeCell)));
  sheet.getRange(1, 1).setFontWeight('bold').setFontSize(14);
  rows.forEach((row, i) => {
    if (['Combos', 'Curries', 'Add-ons', 'Specials', 'Deliveries', 'Order ID'].indexOf(row[0]) >= 0) {
      sheet.getRange(i + 1, 1, 1, 7).setFontWeight('bold');
    }
  });
  sheet.autoResizeColumns(1, 7);
  return sheet;
}

/* ── The "Chaitrali's Kitchen" menu in the sheet ── */
function onOpen() {
  SpreadsheetApp.getUi().createMenu("Chaitrali's Kitchen")
    .addItem('Weekly report — next delivery', 'reportNextDelivery')
    .addItem('Weekly report — last delivery', 'reportLastDelivery')
    .addItem('Weekly report — choose a delivery date…', 'reportChooseDelivery')
    .addSeparator()
    .addItem('Email the report every week when orders close', 'setUpWeeklyEmail')
    .addItem('Set the report password for the admin page…', 'setReportPassword')
    .addToUi();
}
function showReport(week) {
  const sheet = writeReportSheet(buildReport(week, liveMenu().settings || {}));
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sheet);
}
function reportNextDelivery() { showReport(isoDay(deliveryFor(new Date(), liveMenu().settings || {}))); }
function reportLastDelivery() { showReport(shiftWeek(isoDay(deliveryFor(new Date(), liveMenu().settings || {})), -1)); }
function reportChooseDelivery() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Weekly report', 'Delivery date, e.g. 2026-11-17', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const week = res.getResponseText().trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return ui.alert('Please type the date as yyyy-mm-dd, e.g. 2026-11-17.');
  showReport(week);
}

/* Runs an hour after the order cutoff each week: emails the report for the
   delivery that just closed and refreshes the Weekly Report tab. */
function emailWeeklyReport() {
  const settings = liveMenu().settings || {};
  const r = buildReport(shiftWeek(isoDay(deliveryFor(new Date(), settings)), -1), settings);
  writeReportSheet(r);
  MailApp.sendEmail(NOTIFY_EMAIL || Session.getEffectiveUser().getEmail(),
    'Weekly report — delivery ' + r.label + ' — ' + r.count + ' orders, ' + money(r.sales), reportText(r));
}
function setUpWeeklyEmail() {
  const settings = liveMenu().settings || {};
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'emailWeeklyReport').forEach(t => ScriptApp.deleteTrigger(t));
  const day = weekday(settings.order_cutoff), hour = Math.floor(cutoffMinutes(settings.order_cutoff) / 60) + 1;
  const days = [ScriptApp.WeekDay.SUNDAY, ScriptApp.WeekDay.MONDAY, ScriptApp.WeekDay.TUESDAY, ScriptApp.WeekDay.WEDNESDAY,
    ScriptApp.WeekDay.THURSDAY, ScriptApp.WeekDay.FRIDAY, ScriptApp.WeekDay.SATURDAY];
  ScriptApp.newTrigger('emailWeeklyReport').timeBased().onWeekDay(days[day < 0 ? 0 : day])
    .atHour(Math.min(hour, 23)).inTimezone(TIME_ZONE).create();
  SpreadsheetApp.getUi().alert('Done. The weekly report will be emailed every ' +
    WEEKDAYS[day < 0 ? 0 : day].toUpperCase() + ' after ' + (settings.order_cutoff || 'the cutoff') +
    '. If you change the cutoff on the admin page, run this again.');
}
function setReportPassword() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Report password', 'Choose a password for the Reports tab on the admin page (at least 8 characters).', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const key = res.getResponseText().trim();
  if (key.length < 8) return ui.alert('Please use at least 8 characters.');
  PropertiesService.getScriptProperties().setProperty('REPORT_KEY', key);
  ui.alert('Saved. Enter the same password on the admin page\'s Reports tab.');
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
