/* Shared by every page. Loads data/menu.json once and:
   - fills any element marked data-setting="<key>" with settings[key]
     (the HTML text stays as the fallback if the file can't load);
   - runs the nav's order countdown from settings.order_cutoff, so the
     cutoff typed in the admin page is the only one the site uses.
   Pages that need the rest of the menu can use window.ckMenu (a promise). */
(function () {
  'use strict';

  var src = document.currentScript && document.currentScript.src;
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
  };

  window.ckMenu.then(function (menu) {
    settings = menu.settings || {};
    window.ckFillSettings();
    startCountdown(parseCutoff(settings.order_cutoff));
  }).catch(function () { startCountdown(null); });

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

    function tick() {
      var now = nowInEastern();
      var left = ((cutoff.day - now.day + 7) % 7) * 86400 + (cutoff.secs - now.secs);
      if (left <= 0) left += 7 * 86400;
      var d = Math.floor(left / 86400), h = Math.floor(left % 86400 / 3600),
          m = Math.floor(left % 3600 / 60), s = left % 60;
      el.textContent = d > 0 ? d + 'd ' + pad(h) + 'h ' + pad(m) + 'm'
                             : pad(h) + 'h ' + pad(m) + 'm ' + pad(s) + 's';
      badge.classList.toggle('cd-urgent', left < 6 * 3600);
    }
    tick();
    setInterval(tick, 1000);
  }
})();
