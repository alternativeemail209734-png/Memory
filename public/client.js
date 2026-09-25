// client.js - runs in the browser. Talks to the server over Socket.IO.
(function () {
  'use strict';

  // ---- Mobile-safe viewport height (avoid raw 100vh on phones) ----------
  function setViewportHeight() {
    document.documentElement.style.setProperty('--vh', window.innerHeight * 0.01 + 'px');
  }
  window.addEventListener('resize', setViewportHeight);
  setViewportHeight();

  // ---- Theme (8 themes). Follows the device's light/dark setting until a
  //      theme is picked; the choice is then remembered on this device. ----
  const THEME_STORAGE_KEY = 'memoryLiveTheme';
  const THEME_META = {
    dark: 'Dark', light: 'Light', cream: 'Cream', sky: 'Sky Blue',
    meadow: 'Meadow Green', blossom: 'Blossom Pink', lavender: 'Lavender Violet', honey: 'Honey Gold',
  };
  const themeChoiceButtons = document.querySelectorAll('.theme-choice-btn');
  const themeDropdownIcon = document.getElementById('themeDropdownIcon');
  const themeDropdownBtn = document.getElementById('themeDropdownBtn');
  const themeDropdownMenu = document.getElementById('themeDropdownMenu');

  function updateThemeUI(key) {
    themeChoiceButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-theme-choice') === key);
    });
    themeDropdownMenu.querySelectorAll('li').forEach((li) => {
      const active = li.getAttribute('data-value') === key;
      li.classList.toggle('dd-active', active);
      li.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    themeDropdownIcon.className = 'theme-swatch swatch-' + key;
    const label = THEME_META[key] || key;
    themeDropdownBtn.title = 'Theme: ' + label;
    themeDropdownBtn.setAttribute('aria-label', 'Theme: ' + label);
  }
  function applyTheme(theme) {
    if (THEME_META[theme]) document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
    updateThemeUI(theme);
  }
  function getEffectiveThemeKey() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr && THEME_META[attr]) return attr;
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    return prefersLight ? 'light' : 'dark';
  }
  function selectTheme(choice) {
    if (!THEME_META[choice]) return;
    applyTheme(choice);
    try { localStorage.setItem(THEME_STORAGE_KEY, choice); } catch (e) { /* storage unavailable */ }
  }
  themeChoiceButtons.forEach((btn) => {
    btn.addEventListener('click', () => selectTheme(btn.getAttribute('data-theme-choice')));
  });
  (function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem(THEME_STORAGE_KEY); } catch (e) { /* ignore */ }
    if (saved && THEME_META[saved]) applyTheme(saved);
    else updateThemeUI(getEffectiveThemeKey());
  })();

  // ---- Toolbar dropdowns (difficulty + theme) ---------------------------
  // Menus live inside .app-shell (not <body>) so they still show in Full
  // Screen, and use fixed positioning so the scrolling toolbar can't clip them.
  const openDropdowns = [];
  function closeAllDropdowns() { openDropdowns.forEach((d) => d.close()); }
  function setupToolbarDropdown(rootId, btnId, menuId, onSelect) {
    const root = document.getElementById(rootId);
    const btn = document.getElementById(btnId);
    const menu = document.getElementById(menuId);
    if (!root || !btn || !menu) return;
    document.querySelector('.app-shell').appendChild(menu);

    function positionMenu() {
      const rect = btn.getBoundingClientRect();
      const menuWidth = Math.max(menu.offsetWidth, 176);
      let left = rect.right - menuWidth;
      if (left < 8) left = 8;
      menu.style.left = left + 'px';
      menu.style.top = Math.min(rect.bottom + 6, window.innerHeight - 12) + 'px';
    }
    function close() {
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }
    function open() {
      closeAllDropdowns();
      menu.hidden = false;
      positionMenu();
      btn.setAttribute('aria-expanded', 'true');
    }
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (menu.hidden) open(); else close();
    });
    menu.addEventListener('click', (e) => e.stopPropagation());
    menu.querySelectorAll('li[role="option"]').forEach((li) => {
      li.addEventListener('click', () => {
        close();
        onSelect(li.getAttribute('data-value'));
      });
    });
    window.addEventListener('resize', () => { if (!menu.hidden) positionMenu(); });
    openDropdowns.push({ close, root, menu });
  }
  document.addEventListener('click', (e) => {
    openDropdowns.forEach((d) => {
      if (!d.root.contains(e.target) && !d.menu.contains(e.target)) d.close();
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeAllDropdowns();
    closeSettings();
    hideRoundEnd();
    closeLeaderboardModal();
  });
  setupToolbarDropdown('themeDropdown', 'themeDropdownBtn', 'themeDropdownMenu', selectTheme);

  // ---- Host console collapse/expand (remembered on this device) ---------
  const HOST_CONSOLE_STORAGE_KEY = 'memoryLiveHostConsoleCollapsed';
  const hostConsoleBar = document.getElementById('hostConsoleBar');
  const hostConsoleRow = document.getElementById('hostConsoleRow');
  const hostConsoleToggle = document.getElementById('hostConsoleToggle');
  const hostConsoleShowBtn = document.getElementById('hostConsoleShowBtn');

  function updateHostConsoleOffset() {
    document.documentElement.style.setProperty('--host-console-offset', hostConsoleBar.offsetHeight + 'px');
  }
  function setHostConsoleCollapsed(collapsed) {
    hostConsoleBar.classList.toggle('collapsed', collapsed);
    hostConsoleRow.hidden = collapsed;
    hostConsoleShowBtn.hidden = !collapsed;
    try { localStorage.setItem(HOST_CONSOLE_STORAGE_KEY, collapsed ? '1' : '0'); } catch (e) { /* ignore */ }
    updateHostConsoleOffset();
  }
  hostConsoleToggle.addEventListener('click', () => setHostConsoleCollapsed(true));
  hostConsoleShowBtn.addEventListener('click', () => setHostConsoleCollapsed(false));
  window.addEventListener('resize', updateHostConsoleOffset);
  (function initHostConsole() {
    let saved = null;
    try { saved = localStorage.getItem(HOST_CONSOLE_STORAGE_KEY); } catch (e) { /* ignore */ }
    setHostConsoleCollapsed(saved === '1');
  })();

  // ---- Full Screen toggle (button hidden if the browser can't do it) ----
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const appShellEl = document.querySelector('.app-shell');
  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
  }
  function updateFullscreenBtn() {
    const active = isFullscreen();
    fullscreenBtn.classList.toggle('active', active);
    fullscreenBtn.innerHTML = active ? '&#10005;' : '&#9974;';
    fullscreenBtn.title = active ? 'Exit Full Screen' : 'Full Screen';
    fullscreenBtn.setAttribute('aria-label', active ? 'Exit Full Screen' : 'Full Screen');
  }
  const fsSupported = !!(appShellEl.requestFullscreen || appShellEl.webkitRequestFullscreen || appShellEl.msRequestFullscreen);
  if (!fsSupported) {
    fullscreenBtn.hidden = true;
  } else {
    fullscreenBtn.addEventListener('click', () => {
      try {
        if (isFullscreen()) {
          (document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen).call(document);
        } else {
          (appShellEl.requestFullscreen || appShellEl.webkitRequestFullscreen || appShellEl.msRequestFullscreen).call(appShellEl);
        }
      } catch (e) { /* some browsers need a fresh tap */ }
    });
    ['fullscreenchange', 'webkitfullscreenchange', 'msfullscreenchange'].forEach((evt) => {
      document.addEventListener(evt, () => { updateFullscreenBtn(); setViewportHeight(); });
    });
    updateFullscreenBtn();
  }

  // ---------------------------------------------------------------------
  // Game screen
  // ---------------------------------------------------------------------
  const socket = io();

  const grid = document.getElementById('memoryGrid');
  const rawEventCountEl = document.getElementById('rawEventCount');
  const lastReceivedEl = document.getElementById('lastReceived');
  const leaderboardListEl = document.getElementById('leaderboardList');
  const feedListEl = document.getElementById('feedList');
  const pairsCounterEl = document.getElementById('pairsCounter');
  const solvedBannerEl = document.getElementById('solvedBanner');
  const allTimeListEl = document.getElementById('allTimeLeaderboardList');
  const toastAreaEl = document.getElementById('liveGuessToastArea');
  const autoNextCountdownEl = document.getElementById('autoNextCountdown');
  const autoNextToggle = document.getElementById('autoNextToggle');
  const botsToggle = document.getElementById('botsToggle');
  const stopwatchEl = document.getElementById('stopwatch');
  const liveStatusMiniEl = document.getElementById('liveStatusMini');
  const liveStatusEl = document.getElementById('liveStatus');

  const LEVEL_META = {
    1: 'Warmup', 2: 'Easy', 3: 'Medium', 4: 'Hard', 5: 'Chaos',
  };

  let currentState = null;
  let currentLevel = 2;            // level the host has picked for the NEXT game
  let lastGameId = null;
  let builtForGame = null;
  let serverClockOffset = 0;       // server time minus this device's time
  const liveRoundEl = document.getElementById('liveRoundList');
  const liveAllEl = document.getElementById('liveAllTimeList');
  let lastLeaderboard = { round: [], allTime: [] };
  const cardEls = new Map();       // card id -> { el, front }

  // ---- Board ------------------------------------------------------------
  function buildGrid(state) {
    grid.innerHTML = '';
    cardEls.clear();
    state.cards.forEach((card) => {
      const el = document.createElement('div');
      el.className = 'card';
      const inner = document.createElement('div');
      inner.className = 'card-inner';
      const back = document.createElement('div');
      back.className = 'card-face card-back';
      back.textContent = card.id;
      const front = document.createElement('div');
      front.className = 'card-face card-front';
      inner.appendChild(back);
      inner.appendChild(front);
      el.appendChild(inner);
      grid.appendChild(el);
      cardEls.set(card.id, { el, front });
    });
    builtForGame = state.gameId;
  }

  // Peek hint: the server sends every hidden card's picture for a moment.
  let peekCards = null;      // Map: card id -> emoji while a peek is showing
  let peekTimer = null;
  function endPeek() {
    if (peekTimer) { clearTimeout(peekTimer); peekTimer = null; }
    peekCards = null;
    if (currentState) renderGrid(currentState);
  }

  // Draws a card's picture: normal emoji text, or a Kawaii Stickers picture ("img:name:hue").
  function setFace(front, sym) {
    if (front.dataset.sym === sym) return;
    front.dataset.sym = sym;
    if (typeof sym === 'string' && sym.indexOf('img:') === 0) {
      const p = sym.split(':');
      const img = document.createElement('img');
      img.src = '/symbols/' + p[1] + '.png';
      img.alt = '';
      img.draggable = false;
      if (+p[2]) img.style.filter = 'hue-rotate(' + p[2] + 'deg)';
      front.textContent = '';
      front.appendChild(img);
    } else {
      front.textContent = sym;
    }
  }

  function renderGrid(state) {
    grid.style.setProperty('--cols', state.cols);
    grid.style.setProperty('--rows', state.rows);
    if (builtForGame !== state.gameId || cardEls.size !== state.cards.length) buildGrid(state);
    grid.classList.toggle('locked', !!state.locked);
    grid.classList.toggle('peeking', !!peekCards);
    state.cards.forEach((card) => {
      const ref = cardEls.get(card.id);
      if (!ref) return;
      const peeked = !!(peekCards && peekCards.has(card.id) && !card.matched);
      ref.el.classList.toggle('flipped', !!card.flipped || peeked);
      ref.el.classList.toggle('matched', !!card.matched);
      if (card.emoji) setFace(ref.front, card.emoji);
      else if (peeked) setFace(ref.front, peekCards.get(card.id));
    });
    scaleCardFont(state.cols);
  }

  // Number/emoji size follows the real card size, whatever the grid.
  function scaleCardFont(cols) {
    const cell = (grid.clientWidth - 10) / cols;
    const px = Math.max(10, Math.min(34, Math.floor(cell * 0.4)));
    document.documentElement.style.setProperty('--card-font-size', px + 'px');
  }
  if (window.ResizeObserver) {
    new ResizeObserver(() => { if (currentState) scaleCardFont(currentState.cols); }).observe(grid);
  }
  window.addEventListener('resize', () => { if (currentState) scaleCardFont(currentState.cols); });

  // ---- Top line: connection status, pairs found, stopwatch ---------------
  function formatDuration(ms) {
    if (ms == null || ms < 0 || isNaN(ms)) ms = 0;
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function tickStopwatch() {
    if (!currentState || !currentState.startedAt) return;
    const end = currentState.solvedAt || (Date.now() + serverClockOffset);
    stopwatchEl.innerHTML = '&#9201; ' + formatDuration(end - currentState.startedAt);
  }
  setInterval(tickStopwatch, 500);

  function renderTopline(state) {
    const solved = !!state.solvedAt;
    pairsCounterEl.hidden = solved;
    solvedBannerEl.hidden = !solved;
    pairsCounterEl.textContent = '\u{1F0CF} ' + state.matchedPairs + '/' + state.totalPairs + ' pairs';
    tickStopwatch();

    // Small status pill (top line) + full status line (settings drawer).
    let cls = 'status-idle';
    let mini = '\u25CF Offline';
    let full = 'Not connected.';
    if (state.mode === 'test') {
      mini = '\u25CF Test mode';
    } else if (state.mode === 'live') {
      if (state.tiktok.connecting) {
        cls = 'status-connecting'; mini = '\u25CF Connecting...'; full = state.tiktok.statusText || 'Connecting to TikTok...';
      } else if (state.tiktok.connected) {
        cls = 'status-connected'; mini = '\u25CF Live @' + state.tiktok.uniqueId; full = 'Connected to @' + state.tiktok.uniqueId;
      } else if (state.tiktok.lastError) {
        cls = 'status-error'; mini = '\u25CF Not connected'; full = state.tiktok.lastError;
      } else {
        mini = '\u25CF Not connected'; full = state.tiktok.statusText || 'Not connected.';
      }
    }
    liveStatusMiniEl.className = 'live-status-mini ' + cls;
    liveStatusMiniEl.textContent = mini;
    liveStatusEl.className = 'status-line ' + cls;
    liveStatusEl.textContent = full;
  }

  // ---- Avatars: real TikTok photo when known, initials circle otherwise --
  function hashStringToHue(str) {
    let hash = 0;
    str = String(str || '?');
    for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    return hash % 360;
  }
  function initialsFor(name) {
    const parts = String(name || '?').trim().split(/\s+/);
    let initials = (parts[0] || '?').charAt(0);
    if (parts.length > 1) initials += parts[parts.length - 1].charAt(0);
    initials = initials.toUpperCase();
    return /^[\p{L}\p{N}]+$/u.test(initials) ? initials : '?';
  }
  function generatedAvatarDataUri(seed, name) {
    const bg = 'hsl(' + hashStringToHue(seed || name) + ', 55%, 45%)';
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<circle cx="32" cy="32" r="32" fill="' + bg + '"/>' +
      '<text x="32" y="41" font-family="Segoe UI, Arial, sans-serif" font-size="26" ' +
      'font-weight="700" fill="#ffffff" text-anchor="middle">' + initialsFor(name) + '</text></svg>';
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }
  function makeAvatarImg(avatarUrl, uniqueId, name, sizeClass) {
    const img = document.createElement('img');
    img.className = 'avatar-circle' + (sizeClass ? ' ' + sizeClass : '');
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    const fallback = generatedAvatarDataUri(uniqueId, name);
    img.src = avatarUrl || fallback;
    // An expired or blocked photo link falls back to the initials circle.
    img.addEventListener('error', () => { if (img.src !== fallback) img.src = fallback; });
    return img;
  }

  // ---- Lists ---------------------------------------------------------------
  function rankBadge(idx) {
    const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
    return idx < 3 ? medals[idx] : String(idx + 1);
  }
  // kind 'window' = big rows for the pop-up windows, 'inline' = compact rows.
  function fillScoreList(listEl, list, kind) {
    const windowRows = kind === 'window';
    listEl.innerHTML = '';
    if (!list || !list.length) {
      const li = document.createElement('li');
      li.className = 'lb-empty';
      li.textContent = windowRows ? 'No scorers yet.' : 'No pairs found yet';
      listEl.appendChild(li);
      return;
    }
    list.forEach((row, idx) => {
      const li = document.createElement('li');
      const rank = document.createElement('span');
      const medal = idx < 3 ? (windowRows ? ' round-end-rank-medal' : ' inline-rank-medal') : '';
      rank.className = (windowRows ? 'round-end-rank' : 'inline-rank') + medal;
      rank.textContent = rankBadge(idx);
      li.appendChild(rank);
      li.appendChild(makeAvatarImg(row.avatar, row.uniqueId, row.name, windowRows ? 'lg' : ''));
      const name = document.createElement('span');
      name.className = windowRows ? 'round-end-name' : 'lb-name';
      name.textContent = row.name;
      li.appendChild(name);
      // Live combo streak (This Round leaderboard only - the server only
      // attaches `streak` to that table, never to All-Time).
      if (row.streak >= 2) {
        const streakBadge = document.createElement('span');
        streakBadge.className = 'streak-badge';
        streakBadge.textContent = '\u{1F525}' + row.streak;
        streakBadge.title = row.streak + '-pair streak';
        li.appendChild(streakBadge);
      }
      const pts = document.createElement('span');
      pts.className = windowRows ? 'round-end-points' : 'lb-points';
      pts.textContent = windowRows ? row.points + (row.points === 1 ? ' pt' : ' pts') : row.points;
      li.appendChild(pts);
      listEl.appendChild(li);
    });
  }

  function renderDiagnostics(state) {
    rawEventCountEl.textContent = state.rawEventCount;
    const ev = state.lastEvent;
    if (!ev || !ev.text) {
      lastReceivedEl.textContent = '(none yet)';
      return;
    }
    const KIND_WORDS = { match: 'match', miss: 'no match', taken: 'already flipped', invalid: 'not a card', busy: 'too soon' };
    lastReceivedEl.textContent = ev.user + ': ' + ev.text +
      (ev.read ? '  \u2192  read as cards ' + ev.read + ' (' + (KIND_WORDS[ev.kind] || ev.kind) + ')' : '  \u2192  not two card numbers');
  }

  // ---- Every guess: feed line + floating pill ---------------------------------
  // Timing preferences. The first three live on this device only; the other
  // three (next game delay, wrong-pair time, peek length) are shared with every
  // screen, so they are sent to the server.
  const TIMING_DEFAULTS = {
    toastSeconds: 4.2, roundWindowSeconds: 5, allTimeWindowSeconds: 5,
    autoNextDelaySeconds: 10, mismatchSeconds: 1.1, peekSeconds: 3,
  };
  const TIMING_STORAGE_KEY = 'memoryLiveTiming';
  function loadTimingPrefs() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(TIMING_STORAGE_KEY) || 'null'); } catch (e) { /* ignore */ }
    const pick = (key) => (saved && typeof saved[key] === 'number' ? saved[key] : TIMING_DEFAULTS[key]);
    return { toastSeconds: pick('toastSeconds'), roundWindowSeconds: pick('roundWindowSeconds'), allTimeWindowSeconds: pick('allTimeWindowSeconds') };
  }
  function saveTimingPrefs(prefs) {
    try { localStorage.setItem(TIMING_STORAGE_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ }
  }
  let timingPrefs = loadTimingPrefs();
  let toastTimer = null;

  // Combo / streak: a match on streak 2+ shows a small flame + count next
  // to the points gained, e.g. "+3 \u{1F525}x3", both in the floating pill
  // and the recent-guesses feed.
  function streakSuffix(r) {
    return r && r.streak >= 2 ? ' \u{1F525}\u00D7' + r.streak : '';
  }
  function describeGuess(r) {
    const pair = r.a != null ? r.a + ' & ' + r.b : null;
    switch (r.kind) {
      case 'match': {
        const gained = r.gained || 1;
        const suffix = streakSuffix(r);
        return {
          tone: 'correct',
          text: 'found ' + pair,
          feed: pair + ' \u2014 match! +' + gained + suffix,
          points: '+' + gained,
        };
      }
      case 'miss':    return { tone: 'wrong',   text: pair + ' \u2014 no match', feed: pair + ' \u2014 no match' };
      case 'taken':   return { tone: 'info',    text: pair + ' \u2014 already flipped', feed: pair + ' \u2014 already flipped' };
      case 'invalid': return { tone: 'wrong',   text: pair + ' \u2014 not a card', feed: pair + ' \u2014 not a card' };
      case 'busy':    return { tone: 'info',    text: 'too soon \u2014 cards still showing', feed: (pair || '') + ' \u2014 too soon, cards still showing' };
      default:        return { tone: 'format',  text: 'wrong format \u2014 try e.g. 1 5', feed: '"' + r.text + '" \u2014 not two card numbers' };
    }
  }

  function addFeedItem(r, d) {
    const li = document.createElement('li');
    li.className = 'feed-row ' + (d.tone === 'correct' ? 'feed-correct' : d.tone === 'wrong' ? 'feed-wrong' : 'feed-info');
    // Same real TikTok photo (or the generated initials fallback) used
    // everywhere else - leaderboards, the round-end window and the guess
    // toast - so a viewer's exact profile picture is recognizable here too.
    li.appendChild(makeAvatarImg(r.avatar, r.uniqueId, r.name, 'sm'));
    const text = document.createElement('span');
    text.className = 'feed-text';
    const who = document.createElement('span');
    who.className = 'feed-user';
    who.textContent = r.name + ': ';
    text.appendChild(who);
    text.appendChild(document.createTextNode(d.feed.trim()));
    li.appendChild(text);
    feedListEl.insertBefore(li, feedListEl.firstChild);
    while (feedListEl.children.length > 40) feedListEl.removeChild(feedListEl.lastChild);
  }

  // One pill at a time: a new guess replaces whatever is showing.
  function pushGuessToast(r, d) {
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
    while (toastAreaEl.firstChild) toastAreaEl.removeChild(toastAreaEl.firstChild);
    const toast = document.createElement('div');
    toast.className = 'guess-toast toast-' + d.tone;
    toast.appendChild(makeAvatarImg(r.avatar, r.uniqueId, r.name));
    const name = document.createElement('span');
    name.className = 'guess-name';
    name.textContent = r.name;
    toast.appendChild(name);
    if (r.kind === 'match' && r.streak >= 2) {
      const streakBadge = document.createElement('span');
      streakBadge.className = 'streak-badge';
      streakBadge.textContent = '\u{1F525}' + r.streak;
      streakBadge.title = r.streak + '-pair streak';
      toast.appendChild(streakBadge);
    }
    const detail = document.createElement('span');
    detail.className = 'guess-detail';
    detail.textContent = d.text;
    toast.appendChild(detail);
    if (d.points) {
      const pts = document.createElement('span');
      pts.className = 'guess-points';
      pts.textContent = d.points;
      toast.appendChild(pts);
    }
    toastAreaEl.appendChild(toast);
    scheduleToastRemoval(toast);
  }

  function scheduleToastRemoval(toast) {
    toastTimer = setTimeout(() => {
      toast.classList.add('leaving');
      setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 350);
    }, Math.round(timingPrefs.toastSeconds * 1000));
  }

  // A plain host notice (peek / reveal) shown in the same pop-up spot.
  function pushNoticeToast(text) {
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
    while (toastAreaEl.firstChild) toastAreaEl.removeChild(toastAreaEl.firstChild);
    const toast = document.createElement('div');
    toast.className = 'guess-toast toast-notice';
    const name = document.createElement('span');
    name.className = 'guess-name';
    name.textContent = text;
    toast.appendChild(name);
    toastAreaEl.appendChild(toast);
    scheduleToastRemoval(toast);
  }

  function handleGuess(r) {
    const d = describeGuess(r);
    addFeedItem(r, d);
    pushGuessToast(r, d);
  }

  // ---- Auto next game countdown -------------------------------------------------
  const roundEndCountdownEl = document.getElementById('roundEndCountdown');
  let countdownTimer = null;
  function clearAutoNextCountdown() {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    autoNextCountdownEl.hidden = true;
    roundEndCountdownEl.hidden = true;
  }
  function showCountdownText(remaining) {
    autoNextCountdownEl.hidden = false;
    autoNextCountdownEl.textContent = 'Next game starts in ' + remaining + 's...';
    roundEndCountdownEl.hidden = false;
    roundEndCountdownEl.textContent = 'Next game starts in ' + remaining + 's...';
  }
  function startAutoNextCountdown(seconds) {
    let remaining = Math.max(0, Math.round(seconds));
    clearAutoNextCountdown();
    showCountdownText(remaining);
    countdownTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) clearAutoNextCountdown();
      else showCountdownText(remaining);
    }, 1000);
  }

  // ---- Round-end window: this round's scorers, then all-time, then closes ----
  const roundEndOverlay = document.getElementById('roundEndOverlay');
  const roundEndTitle = document.getElementById('roundEndTitle');
  const roundEndList = document.getElementById('roundEndList');
  const roundEndSummary = document.getElementById('roundEndSummary');
  const roundEndNewGameBtn = document.getElementById('roundEndNewGameBtn');
  let roundEndTimers = [];

  function clearRoundEndTimers() {
    roundEndTimers.forEach((t) => clearTimeout(t));
    roundEndTimers = [];
  }
  function hideRoundEnd() {
    clearRoundEndTimers();
    roundEndOverlay.hidden = true;
  }
  function showRoundEndSequence(payload) {
    clearRoundEndTimers();
    roundEndTitle.textContent = 'This Round\u2019s Top Scorers';
    roundEndSummary.hidden = false;
    roundEndSummary.textContent = 'All ' + payload.totalPairs + ' pairs found on ' + payload.levelName + ' in ' + formatDuration(payload.elapsedMs) + '.';
    roundEndList.classList.remove('capped-20');
    fillScoreList(roundEndList, payload.leaderboard || [], 'window');
    roundEndOverlay.hidden = false;
    roundEndTimers.push(setTimeout(() => {
      roundEndTitle.textContent = 'All-Time Top Scorers';
      roundEndSummary.hidden = true;
      roundEndList.classList.add('capped-20');
      fillScoreList(roundEndList, payload.allTimeLeaderboard || [], 'window');
      roundEndTimers.push(setTimeout(() => { roundEndOverlay.hidden = true; }, Math.round(timingPrefs.allTimeWindowSeconds * 1000)));
    }, Math.round(timingPrefs.roundWindowSeconds * 1000)));
  }
  document.getElementById('roundEndCloseBtn').addEventListener('click', hideRoundEnd);
  roundEndNewGameBtn.addEventListener('click', () => startNewGame());

  // ---- Leaderboard window (trophy button): This Round / All-Time tabs ----------
  const leaderboardOverlay = document.getElementById('leaderboardOverlay');
  const modalRoundList = document.getElementById('leaderboardModalRoundList');
  const modalAllTimeList = document.getElementById('leaderboardModalAllTimeList');
  const lbTabs = document.querySelectorAll('.lb-modal-tab');
  function renderLeaderboardModal() {
    fillScoreList(modalRoundList, lastLeaderboard.round, 'window');
    fillScoreList(modalAllTimeList, lastLeaderboard.allTime, 'window');
  }
  function closeLeaderboardModal() { leaderboardOverlay.hidden = true; }
  function openLeaderboardModal() {
    renderLeaderboardModal();
    leaderboardOverlay.hidden = false;
  }
  lbTabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      lbTabs.forEach((b) => b.classList.toggle('active', b === btn));
      const tab = btn.getAttribute('data-lb-tab');
      modalRoundList.hidden = tab !== 'round';
      modalAllTimeList.hidden = tab !== 'alltime';
    });
  });
  document.getElementById('leaderboardTopBtn').addEventListener('click', openLeaderboardModal);
  document.getElementById('leaderboardModalCloseBtn').addEventListener('click', closeLeaderboardModal);
  // Clicking the dim area outside a window closes it.
  roundEndOverlay.addEventListener('click', (e) => { if (e.target === roundEndOverlay) hideRoundEnd(); });
  leaderboardOverlay.addEventListener('click', (e) => { if (e.target === leaderboardOverlay) closeLeaderboardModal(); });

  const settingsOverlay = document.getElementById('settingsOverlay');
  function openSettings() { settingsOverlay.hidden = false; }
  function closeSettings() { settingsOverlay.hidden = true; }
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('closeSettingsBtn').addEventListener('click', closeSettings);
  document.getElementById('settingsBackdrop').addEventListener('click', closeSettings);

  const detailsToggle = document.getElementById('detailsToggle');
  const detailsPanel = document.getElementById('detailsPanel');
  detailsToggle.addEventListener('click', () => {
    const open = detailsPanel.hidden;
    detailsPanel.hidden = !open;
    detailsToggle.innerHTML = open ? '&#9650; Hide Leaderboard &amp; Activity' : '&#9660; Leaderboard &amp; Activity';
  });

  // ---- Card Symbols picker (Settings): pack list comes from the server, so
  //      it's built dynamically rather than hard-coded in index.html. -------
  const emojiPackGridEl = document.getElementById('emojiPackGrid');
  let currentEmojiPack = null;
  function syncEmojiPackUI() {
    emojiPackGridEl.querySelectorAll('.emoji-pack-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-pack') === currentEmojiPack);
    });
  }
  socket.on('emojiPacks', (packs) => {
    emojiPackGridEl.innerHTML = '';
    (packs || []).forEach((p) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emoji-pack-btn';
      btn.setAttribute('data-pack', p.id);
      btn.textContent = p.label;
      btn.addEventListener('click', () => socket.emit('host:setEmojiPack', { pack: p.id }));
      emojiPackGridEl.appendChild(btn);
    });
    syncEmojiPackUI();
  });

  // ---- Mode tabs ---------------------------------------------------------------
  const modeBtns = document.querySelectorAll('.mode-btn');
  const panels = {
    live: document.querySelector('[data-panel="live"]'),
    test: document.querySelector('[data-panel="test"]'),
    offline: document.querySelector('[data-panel="offline"]'),
  };
  function showMode(mode) {
    modeBtns.forEach((btn) => btn.classList.toggle('active', btn.getAttribute('data-mode') === mode));
    Object.keys(panels).forEach((key) => { panels[key].hidden = key !== mode; });
  }
  modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode');
      showMode(mode);
      socket.emit('host:setMode', { mode });
    });
  });

  // ---- Difficulty + new game -----------------------------------------------------
  const difficultySelectEl = document.getElementById('difficultySelect');
  const difficultyDropdownIcon = document.getElementById('difficultyDropdownIcon');
  const difficultyDropdownBtn = document.getElementById('difficultyDropdownBtn');
  const difficultyDropdownMenu = document.getElementById('difficultyDropdownMenu');

  function syncDifficulty(value) {
    const level = Number(value);
    if (!LEVEL_META[level]) return;
    currentLevel = level;
    difficultySelectEl.value = String(level);
    difficultyDropdownIcon.className = 'diff-badge level-' + level;
    difficultyDropdownIcon.textContent = level;
    difficultyDropdownBtn.title = 'Difficulty: ' + LEVEL_META[level];
    difficultyDropdownBtn.setAttribute('aria-label', 'Difficulty: ' + LEVEL_META[level]);
    difficultyDropdownMenu.querySelectorAll('li').forEach((li) => {
      const active = Number(li.getAttribute('data-value')) === level;
      li.classList.toggle('dd-active', active);
      li.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }
  difficultySelectEl.addEventListener('change', () => syncDifficulty(difficultySelectEl.value));
  setupToolbarDropdown('difficultyDropdown', 'difficultyDropdownBtn', 'difficultyDropdownMenu', syncDifficulty);

  function startNewGame() {
    socket.emit('host:newGame', { level: currentLevel });
    hideRoundEnd();
    clearAutoNextCountdown();
    closeSettings();
  }
  document.getElementById('newGameBtn').addEventListener('click', startNewGame);
  document.getElementById('newGameTopBtn').addEventListener('click', startNewGame);

  // ---- Socket events ---------------------------------------------------------------
  socket.on('state', (state) => {
    currentState = state;
    serverClockOffset = state.serverNow - Date.now();
    // Only follow the server's level when a NEW game starts, so a level the
    // host just picked (but has not started yet) is not overwritten.
    if (state.gameId !== lastGameId) {
      lastGameId = state.gameId;
      syncDifficulty(state.level);
      hideRoundEnd();
      clearAutoNextCountdown();
      endPeek();
    }
    if (state.emojiPack !== currentEmojiPack) {
      currentEmojiPack = state.emojiPack;
      syncEmojiPackUI();
    }
    autoNextToggle.checked = !!state.autoNext;
    botsToggle.checked = !!state.botsOn;
    roundEndNewGameBtn.hidden = !!state.autoNext;
    if (!state.autoNext) clearAutoNextCountdown();
    showMode(state.mode);
    renderGrid(state);
    renderTopline(state);
    renderDiagnostics(state);
    syncSharedTimingInputs(state);
    applyHostDefaultsOnce(state);
  });

  socket.on('leaderboard', (data) => {
    lastLeaderboard = { round: (data && data.round) || [], allTime: (data && data.allTime) || [] };
    fillScoreList(leaderboardListEl, lastLeaderboard.round, 'inline');
    fillScoreList(allTimeListEl, lastLeaderboard.allTime, 'inline');
    fillScoreList(liveRoundEl, lastLeaderboard.round.slice(0, 5), 'inline');
    fillScoreList(liveAllEl, lastLeaderboard.allTime.slice(0, 5), 'inline');
    if (!leaderboardOverlay.hidden) renderLeaderboardModal();
  });

  socket.on('guessResult', handleGuess);
  socket.on('gameOver', showRoundEndSequence);
  socket.on('autoNextCountdown', (d) => startAutoNextCountdown(d && d.seconds ? d.seconds : 10));

  autoNextToggle.addEventListener('change', () => {
    socket.emit('host:setAutoNext', { enabled: autoNextToggle.checked });
    if (!autoNextToggle.checked) clearAutoNextCountdown();
  });
  botsToggle.addEventListener('change', () => {
    socket.emit('host:setBots', { enabled: botsToggle.checked });
  });

  socket.on('peek', (d) => {
    if (!d || !d.cards) return;
    peekCards = new Map(d.cards.map((c) => [c.id, c.emoji]));
    if (currentState) renderGrid(currentState);
    if (peekTimer) clearTimeout(peekTimer);
    peekTimer = setTimeout(endPeek, d.ms || 3000);
    pushNoticeToast('Peek! Memorize the cards');
  });
  socket.on('notice', (d) => { if (d && d.text) pushNoticeToast(d.text); });

  // ---- Server has a Sign API Key / username already: skip asking for them -------------
  socket.on('liveConfig', (cfg) => {
    cfg = cfg || {};
    const keyInput = document.getElementById('tiktokApiKey');
    const userInput = document.getElementById('tiktokUsername');
    document.getElementById('liveKeyHintDefault').hidden = !cfg.hasDefaultSignApiKey;
    document.getElementById('liveKeyHintManual').hidden = !!cfg.hasDefaultSignApiKey;
    keyInput.hidden = !!cfg.hasDefaultSignApiKey;
    if (cfg.defaultUsername && !userInput.value) userInput.value = cfg.defaultUsername;
  });

  // ---- Live connect / test / offline / host console --------------------------------
  document.getElementById('connectLiveBtn').addEventListener('click', () => {
    socket.emit('tiktok:connect', {
      uniqueId: document.getElementById('tiktokUsername').value.trim(),
      apiKey: document.getElementById('tiktokApiKey').value.trim(),
    });
  });
  document.getElementById('disconnectLiveBtn').addEventListener('click', () => socket.emit('tiktok:disconnect'));
  document.getElementById('simulateBtn').addEventListener('click', () => socket.emit('test:simulate'));

  function wireTextSend(inputId, btnId, makePayload) {
    const input = document.getElementById(inputId);
    function send() {
      const raw = input.value.trim();
      if (!raw) return;
      socket.emit('host:manualInput', makePayload(raw));
      input.value = '';
    }
    document.getElementById(btnId).addEventListener('click', send);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  }
  // ---- Hints & reveals (host-only, no points) -----------------------------------------
  function hostHint(eventName, payload, closeDrawer) {
    socket.emit(eventName, payload);
    if (closeDrawer) closeSettings();
  }
  function confirmRevealBoard(closeDrawer) {
    if (window.confirm('Reveal the whole board? This ends the current game.')) hostHint('host:revealBoard', undefined, closeDrawer);
  }
  function confirmReset(kind) {
    const all = kind === 'alltime';
    const msg = all ? 'Reset the ALL-TIME leaderboard for everyone? This cannot be undone.' : 'Reset the THIS ROUND leaderboard? Everyone starts again from 0 this game.';
    if (window.confirm(msg)) socket.emit(all ? 'host:resetAllTimeScores' : 'host:resetRoundScores');
  }
  document.getElementById('resetRoundBtn').addEventListener('click', () => confirmReset('round'));
  document.getElementById('resetAllTimeBtn').addEventListener('click', () => confirmReset('alltime'));
  document.getElementById('lbResetBtn').addEventListener('click', () => {
    const t = document.querySelector('.lb-modal-tab.active');
    confirmReset(t && t.getAttribute('data-lb-tab') === 'alltime' ? 'alltime' : 'round');
  });
  document.getElementById('peekTopBtn').addEventListener('click', () => hostHint('host:peek'));
  document.getElementById('revealPairTopBtn').addEventListener('click', () => hostHint('host:revealPair', { count: 1 }));
  document.getElementById('peekBtn').addEventListener('click', () => hostHint('host:peek', undefined, true));
  document.getElementById('revealPairBtn').addEventListener('click', () => hostHint('host:revealPair', { count: 1 }, true));
  document.getElementById('revealThreeBtn').addEventListener('click', () => hostHint('host:revealPair', { count: 3 }, true));
  document.getElementById('revealBoardBtn').addEventListener('click', () => confirmRevealBoard(true));

  // ---- Timing controls -------------------------------------------------------------------
  const toastInput = document.getElementById('toastDurationInput');
  const roundWindowInput = document.getElementById('roundWindowDurationInput');
  const allTimeWindowInput = document.getElementById('allTimeWindowDurationInput');
  const autoNextDelayInput = document.getElementById('autoNextDelayInput');
  const mismatchInput = document.getElementById('mismatchDelayInput');
  const peekInput = document.getElementById('peekDurationInput');

  function clampNumber(value, fallback, min, max) {
    let n = parseFloat(value);
    if (isNaN(n)) n = fallback;
    return Math.min(max, Math.max(min, n));
  }
  function applyLocalTimingInputs() {
    toastInput.value = timingPrefs.toastSeconds;
    roundWindowInput.value = timingPrefs.roundWindowSeconds;
    allTimeWindowInput.value = timingPrefs.allTimeWindowSeconds;
  }
  applyLocalTimingInputs();

  function wireLocalTiming(input, key, min, max) {
    input.addEventListener('change', () => {
      const v = clampNumber(input.value, TIMING_DEFAULTS[key], min, max);
      input.value = v;
      timingPrefs[key] = v;
      saveTimingPrefs(timingPrefs);
    });
  }
  wireLocalTiming(toastInput, 'toastSeconds', 1, 20);
  wireLocalTiming(roundWindowInput, 'roundWindowSeconds', 2, 60);
  wireLocalTiming(allTimeWindowInput, 'allTimeWindowSeconds', 2, 60);

  function wireSharedTiming(input, key, min, max) {
    input.addEventListener('change', () => {
      const v = clampNumber(input.value, TIMING_DEFAULTS[key], min, max);
      input.value = v;
      socket.emit('host:setTiming', { [key]: v });
    });
  }
  wireSharedTiming(autoNextDelayInput, 'autoNextDelaySeconds', 3, 300);
  wireSharedTiming(mismatchInput, 'mismatchSeconds', 0.5, 5);
  wireSharedTiming(peekInput, 'peekSeconds', 1, 10);

  // Keeps the shared inputs in step with the server (unless being typed in).
  function syncSharedTimingInputs(state) {
    [[autoNextDelayInput, state.autoNextDelaySeconds], [mismatchInput, state.mismatchSeconds], [peekInput, state.peekSeconds]]
      .forEach(([input, value]) => {
        if (typeof value === 'number' && document.activeElement !== input) input.value = value;
      });
  }

  document.getElementById('resetTimingBtn').addEventListener('click', () => {
    timingPrefs = {
      toastSeconds: TIMING_DEFAULTS.toastSeconds,
      roundWindowSeconds: TIMING_DEFAULTS.roundWindowSeconds,
      allTimeWindowSeconds: TIMING_DEFAULTS.allTimeWindowSeconds,
    };
    saveTimingPrefs(timingPrefs);
    applyLocalTimingInputs();
    socket.emit('host:setTiming', {
      autoNextDelaySeconds: TIMING_DEFAULTS.autoNextDelaySeconds,
      mismatchSeconds: TIMING_DEFAULTS.mismatchSeconds,
      peekSeconds: TIMING_DEFAULTS.peekSeconds,
    });
  });

  // ---- Save & Apply Settings / Save & Apply as Default ---------------------------------
  // Every field already saves itself when it changes; "Save & Apply" is the explicit
  // "commit everything now" button. "Save as Default" bundles the host setup into one
  // snapshot on this device. When this page loads and the game server has just
  // restarted (nobody has configured it yet), the snapshot is applied once. If a show
  // is already running, it is never touched, so opening the page on a second device
  // cannot reset the game.
  const DEFAULTS_STORAGE_KEY = 'memoryLiveHostDefaultsV1';
  let hostDefaultsApplied = false;
  const saveConfirmEl = document.getElementById('saveSettingsConfirm');
  let saveConfirmTimer = null;

  function showSaveConfirm(message) {
    saveConfirmEl.textContent = message;
    saveConfirmEl.hidden = false;
    if (saveConfirmTimer) clearTimeout(saveConfirmTimer);
    saveConfirmTimer = setTimeout(() => { saveConfirmEl.hidden = true; }, 2500);
  }
  function flushFocusedField() {
    const el = document.activeElement;
    if (el && el !== document.body && typeof el.blur === 'function') el.blur();
  }
  function commitLocalSettings() {
    flushFocusedField();
    saveTimingPrefs(timingPrefs);
    try { localStorage.setItem(THEME_STORAGE_KEY, getEffectiveThemeKey()); } catch (e) { /* ignore */ }
    try { localStorage.setItem(HOST_CONSOLE_STORAGE_KEY, hostConsoleBar.classList.contains('collapsed') ? '1' : '0'); } catch (e) { /* ignore */ }
  }
  function saveHostDefaults() {
    const s = currentState || {};
    const defaults = {
      theme: getEffectiveThemeKey(),
      mode: s.mode,
      level: currentLevel,
      autoNext: !!autoNextToggle.checked,
      autoNextDelaySeconds: parseFloat(autoNextDelayInput.value),
      mismatchSeconds: parseFloat(mismatchInput.value),
      peekSeconds: parseFloat(peekInput.value),
      bots: !!botsToggle.checked,
    };
    const user = document.getElementById('tiktokUsername').value.trim();
    if (user) defaults.tiktokUsername = user;
    try { localStorage.setItem(DEFAULTS_STORAGE_KEY, JSON.stringify(defaults)); } catch (e) { /* ignore */ }
  }
  function loadHostDefaults() {
    try { return JSON.parse(localStorage.getItem(DEFAULTS_STORAGE_KEY) || 'null'); } catch (e) { return null; }
  }
  function applyHostDefaultsOnce(state) {
    if (hostDefaultsApplied) return;
    hostDefaultsApplied = true;
    const d = loadHostDefaults();
    if (!d) return;
    const userInput = document.getElementById('tiktokUsername');
    if (d.tiktokUsername && !userInput.value) userInput.value = d.tiktokUsername;
    if (state.configured) return;   // a show is already set up on the server - leave it alone
    socket.emit('host:applyDefaults', {
      mode: d.mode, level: d.level, autoNext: d.autoNext, autoNextDelaySeconds: d.autoNextDelaySeconds,
      mismatchSeconds: d.mismatchSeconds, peekSeconds: d.peekSeconds, bots: d.bots,
    });
  }

  document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    commitLocalSettings();
    showSaveConfirm('\u2713 Settings saved & applied');
  });
  document.getElementById('saveDefaultSettingsBtn').addEventListener('click', () => {
    commitLocalSettings();
    saveHostDefaults();
    showSaveConfirm('\u2713 Saved as default - loads again after a restart');
  });
  document.getElementById('clearDefaultSettingsBtn').addEventListener('click', () => {
    try { localStorage.removeItem(DEFAULTS_STORAGE_KEY); } catch (e) { /* ignore */ }
    showSaveConfirm('Saved default cleared');
  });

  wireTextSend('testCustomText', 'testCustomBtn', (raw) => ({ user: 'Fake viewer', text: raw }));
  wireTextSend('offlineGuessInput', 'offlineGuessBtn', (raw) => ({ user: 'Host', text: raw }));
  // Host console also accepts "name: 1 5" to guess as a named viewer.
  wireTextSend('hostConsoleInput', 'hostConsoleBtn', (raw) => {
    const colon = raw.indexOf(':');
    if (colon > 0 && colon < 20) return { user: raw.slice(0, colon).trim(), text: raw.slice(colon + 1).trim() };
    return { user: 'Host', text: raw };
  });
})();
