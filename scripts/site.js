/* Shared by every page. Loads data/menu.json once and:
   - fills any element marked data-setting="<key>" with settings[key]
     (the HTML text stays as the fallback if the file can't load);
   - runs the nav's order countdown from settings.order_cutoff, so the
     cutoff typed in the admin page is the only one the site uses.
   Pages that need the rest of the menu can use window.ckMenu (a promise). */
(function () {
  'use strict';

  var src = document.currentScript && document.currentScript.src;

  // Phone menu: say whether it is open, and close it once a link is chosen.
  var nav = document.getElementById('ck-nav');
  var burger = nav && nav.querySelector('.ck-burger');
  if (burger) {
    burger.setAttribute('aria-expanded', 'false');
    burger.addEventListener('click', function () {
      burger.setAttribute('aria-expanded', String(nav.classList.contains('open')));
    });
    nav.querySelectorAll('.ck-links a').forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
  }
  var url = new URL('../data/menu.json', src || location.href).href;

  window.ckMenu = fetch(url)
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });

  var settings = null;

  /* Also called by pages that rebuild markup after load (order.html's steps). */
  window.ckFillSettings = function (root) {
    if (!settings) return;
    (root || document).querySelectorAll('[data-setting]').forEach(function (el) {
      var v = settings[el.getAttribute('data-setting')];
      if (v != null && String(v).trim()) el.textContent = String(v).trim();
    });
    // Order buttons go to the order form on the Order page once its Orders
    // sheet is connected (order_endpoint), else to the Google Form, else they
    // keep their href.
    var links = (root || document).querySelectorAll('a[data-order-form]');
    var endpoint = String(settings.order_endpoint || '').trim();
    var form = String(settings.order_form_url || '').trim();
    if (/^https:\/\/script\.google(usercontent)?\.com\//.test(endpoint)) {
      var build = new URL('../pages/order.html#build', src || location.href).href;
      links.forEach(function (a) { a.href = build; a.removeAttribute('target'); });
    } else if (/^https:\/\//.test(form)) {
      links.forEach(function (a) {
        a.href = form;
        a.target = '_blank';
        a.rel = 'noopener';
      });
    }
  };

  /* Preview switches for trying the looks out: ?festival=ganpati|diwali|holi|off
     and ?whistle (the cooker as if it were the last hour). */
  var params = new URLSearchParams(location.search);

  window.ckMenu.then(function (menu) {
    settings = menu.settings || {};
    window.ckFillSettings();
    startCountdown(parseCutoff(settings.order_cutoff));
    startFestival(menu.events || {});
  }).catch(function () { startCountdown(null); startFestival({}); });

  /* "Sunday Noon", "Sunday 9 PM", "Fri 6:30pm", "Saturday midnight" →
     { day: 0–6, secs: seconds after midnight }, or null if no weekday. */
  var DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  function parseCutoff(text) {
    var t = String(text || '').toLowerCase();
    var day = -1;
    DAYS.forEach(function (d, i) { if (day < 0 && new RegExp('\\b' + d).test(t)) day = i; });
    if (day < 0) return null;

    var secs = 23 * 3600 + 59 * 60;               // no time given: end of that day
    var m = t.match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m|p\.?m)?/);
    if (/\bnoon\b/.test(t)) secs = 12 * 3600;
    else if (/\bmidnight\b/.test(t)) secs = 23 * 3600 + 59 * 60;
    else if (m) {
      var h = parseInt(m[1], 10) % 12, min = parseInt(m[2] || '0', 10);
      if (m[3] && m[3].charAt(0) === 'p') h += 12;
      else if (!m[3] && h < 7) h += 12;            // "Sunday 6" means 6 PM
      secs = h * 3600 + min * 60;
    }
    return { day: day, secs: secs };
  }

  /* Weekday and time of day right now in Shrewsbury, whatever the visitor's zone. */
  function nowInEastern() {
    var parts = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', weekday: 'short',
      hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23'
    }).formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    return {
      day: DAYS.indexOf(parts.weekday.slice(0, 3).toLowerCase()),
      secs: (+parts.hour) * 3600 + (+parts.minute) * 60 + (+parts.second)
    };
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function startCountdown(cutoff) {
    var badge = document.getElementById('ck-countdown');
    var el = document.getElementById('cd-time');
    if (!badge || !el) return;
    if (!cutoff) { badge.style.display = 'none'; return; }

    // The clock icon gives way to a whistling cooker in the last hour.
    var clock = badge.querySelector('.cd-dot') || badge.firstElementChild;
    if (clock) clock.classList.add('cd-clock');
    var cooker = document.createElement('span');
    cooker.className = 'cd-cooker';
    cooker.setAttribute('aria-hidden', 'true');
    cooker.innerHTML = '<span class="cd-puff"></span><span class="cd-puff"></span>' +
      '<svg width="22" height="22" viewBox="0 0 34 34"><rect x="15" y="3" width="4" height="7" rx="1.5" fill="#4b5563"/>' +
      '<path d="M6 13 Q17 7 28 13 Z" fill="#9ca3af"/><rect x="5" y="13" width="24" height="16" rx="5" fill="#cbd5e1" stroke="#64748b" stroke-width="1.5"/>' +
      '<rect x="27" y="12" width="7" height="3" rx="1.5" fill="#1f2937"/></svg>';
    badge.insertBefore(cooker, badge.firstChild);
    var forceWhistle = params.has('whistle');

    function tick() {
      var now = nowInEastern();
      var left = ((cutoff.day - now.day + 7) % 7) * 86400 + (cutoff.secs - now.secs);
      if (left <= 0) left += 7 * 86400;
      var d = Math.floor(left / 86400), h = Math.floor(left % 86400 / 3600),
          m = Math.floor(left % 3600 / 60), s = left % 60;
      el.textContent = d > 0 ? d + 'd ' + pad(h) + 'h ' + pad(m) + 'm'
                             : pad(h) + 'h ' + pad(m) + 'm ' + pad(s) + 's';
      badge.classList.toggle('cd-urgent', forceWhistle || left < 6 * 3600);
      badge.classList.toggle('cd-whistle', forceWhistle || left < 3600);
    }
    tick();
    setInterval(tick, 1000);
  }

  /* ── Festival mode ──
     A festival's look is on while its event is marked Active in the content
     pack and today falls between three weeks before its Order-By date and a
     week after it. Diwali and Holi switch on the same way once they are made
     Active with a date. */
  var FESTIVALS = {
    ganpati: { match: /ganpati|ganesh/, greet: 'गणपती बाप्पा मोरया!', name: 'Ganpati' },
    diwali:  { match: /diwali|deepavali/, greet: 'शुभ दीपावली', name: 'Diwali' },
    holi:    { match: /holi/, greet: 'होळीच्या शुभेच्छा!', name: 'Holi' }
  };
  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  /* "10 September", "Sept 10", "10 Sep 2027" → the nearest such date to today. */
  function parseOrderBy(text, today) {
    var t = String(text || '').toLowerCase();
    var mon = -1;
    MONTHS.forEach(function (m, i) { if (mon < 0 && t.indexOf(m) >= 0) mon = i; });
    var day = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
    if (mon < 0 || !day) return null;
    var year = t.match(/\b(20\d\d)\b/);
    var years = year ? [+year[1]] : [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1];
    var best = null;
    years.forEach(function (y) {
      var d = new Date(y, mon, +day[1]);
      if (!best || Math.abs(d - today) < Math.abs(best - today)) best = d;
    });
    return best;
  }

  function pickFestival(events) {
    var forced = params.get('festival');
    if (forced) return FESTIVALS[forced] ? { key: forced, ev: findEvent(events, forced) || {} } : null;
    var today = new Date(), DAY = 86400000;
    for (var key in FESTIVALS) {
      var ev = findEvent(events, key);
      if (!ev || !ev.active) continue;
      var due = parseOrderBy(ev.order_by, today);
      if (due && today >= due - 21 * DAY && today <= +due + 7 * DAY) return { key: key, ev: ev };
    }
    return null;
  }

  function findEvent(events, key) {
    for (var k in events) {
      if (FESTIVALS[key].match.test(k + ' ' + (events[k].title || '').toLowerCase())) return events[k];
    }
    return null;
  }

  function el(tag, cls, style) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (style) e.style.cssText = style;
    return e;
  }

  function startFestival(events) {
    var pick = pickFestival(events);
    if (!pick) return;
    var key = pick.key, fest = FESTIVALS[key], ev = pick.ev;
    document.documentElement.classList.add('ck-fest', 'ck-fest-' + key);

    // Hang the decoration under the fixed header on every page.
    var host = document.getElementById('topstack') || document.getElementById('ck-nav');
    if (host) {
      var hang = el('div', 'fest-hang');
      hang.setAttribute('aria-hidden', 'true');
      var i, n = Math.ceil(window.innerWidth / 20) + 2;
      if (key === 'ganpati') {
        var toran = el('div', 'fest-toran');
        for (i = 0; i < n; i++) {
          var x = i * 20 - 6, y = Math.sin(((i % 9) / 8) * Math.PI) * 16;
          toran.appendChild(el('span', 'fest-flower ' + (i % 2 ? 'f2' : 'f1'), 'left:' + x + 'px;top:' + y + 'px'));
          if (i % 3 === 1) toran.appendChild(el('span', 'fest-leaf', 'left:' + (x + 5) + 'px;top:' + (y + 13) + 'px;transform:rotate(' + (i % 2 ? 14 : -14) + 'deg)'));
        }
        hang.appendChild(toran);
      } else if (key === 'diwali') {
        hang.appendChild(el('div', 'fest-wire'));
        for (i = 0; i < n / 2; i++) {
          hang.appendChild(el('span', 'fest-bulb b' + (i % 3 + 1), 'left:' + (i * 40 + 14) + 'px;animation-delay:' + ((i % 5) * 0.35) + 's'));
        }
      } else {
        var cols = ['#ec4899', '#a855f7', '#3b82f6', '#22c55e', '#facc15', '#f97316'];
        for (i = 0; i < n / 5; i++) {
          hang.appendChild(el('span', 'fest-dust', 'left:' + (i * 100 - 20) + 'px;width:90px;height:30px;background:' +
            cols[i % cols.length] + ';animation-delay:' + (i % 4) * 0.8 + 's'));
        }
      }
      host.appendChild(hang);
    }

    // Home page: a greeting ribbon to the festival menu, plus the hero's look.
    var right = document.querySelector('.hero-right');
    if (!right) return;
    var ribbon = el('a', 'fest-ribbon');
    ribbon.href = 'pages/event-menu.html';
    var greet = el('span', 'fest-greet');
    greet.lang = 'mr';
    greet.textContent = fest.greet;
    var title = (ev.title || fest.name) + ' menu' + (ev.order_by ? ' · Book by ' + ev.order_by : '') + ' →';
    ribbon.appendChild(greet);
    ribbon.appendChild(document.createTextNode(title));
    var btns = right.querySelector('.hero-btns');
    right.insertBefore(ribbon, btns || null);

    var layer = el('div', 'fest-layer');
    layer.setAttribute('aria-hidden', 'true');
    if (key === 'diwali') {
      for (i = 0; i < 18; i++) {
        var sz = 4 + (i % 3) * 2;
        layer.appendChild(el('span', 'fest-star', 'left:' + ((i * 37) % 96 + 2) + '%;top:' + ((i * 23) % 70 + 4) + '%;width:' + sz + 'px;height:' + sz + 'px;animation-delay:' + ((i % 7) * 0.3) + 's'));
      }
      var diyas = el('div', 'fest-diyas');
      diyas.setAttribute('aria-hidden', 'true');
      var count = window.innerWidth < 700 ? 5 : 9;
      for (i = 0; i < count; i++) {
        var diya = el('div', 'fest-diya');
        diya.appendChild(el('span', 'glow', 'animation-delay:' + (i % 3) * 0.4 + 's'));
        diya.appendChild(el('span', 'flame', 'animation-delay:' + (i % 4) * 0.27 + 's'));
        diya.appendChild(el('span', 'bowl'));
        diyas.appendChild(diya);
      }
      right.closest('.hero').appendChild(diyas);
    } else if (key === 'holi') {
      var w = right.offsetWidth, h = right.offsetHeight;
      var spots = [[.05, .05, .45], [.7, 0, .5], [.35, .55, .4], [.75, .6, .42], [-.1, .6, .45], [.5, -.15, .4], [.6, .35, .3], [.15, -.1, .35]];
      var colours = ['#ec4899', '#a855f7', '#3b82f6', '#22c55e', '#facc15', '#f97316', '#ec4899', '#06b6d4'];
      spots.forEach(function (p, k) {
        var size = p[2] * Math.max(w, h), left = p[0] * w, top = p[1] * h;
        layer.appendChild(el('span', 'fest-gulal', 'left:' + left + 'px;top:' + top + 'px;width:' + size + 'px;height:' + size + 'px;' +
          'background:radial-gradient(circle,' + colours[k] + ' 0%,' + colours[k] + '00 68%);' +
          '--sx:' + (w / 2 - left - size / 2) + 'px;--sy:' + (h / 2 - top - size / 2) + 'px;animation-delay:' + (k * 0.06) + 's,' + (1.4 + k * 0.4) + 's'));
      });
    }
    right.insertBefore(layer, right.firstChild);
  }
})();
