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

  function renderGrid(state) {
    grid.style.setProperty('--cols', state.cols);
    grid.style.setProperty('--rows', state.rows);
    if (builtForGame !== state.gameId || cardEls.size !== state.cards.length) buildGrid(state);
    grid.classList.toggle('locked', !!state.locked);
    state.cards.forEach((card) => {
      const ref = cardEls.get(card.id);
      if (!ref) return;
      ref.el.classList.toggle('flipped', !!card.flipped);
      ref.el.classList.toggle('matched', !!card.matched);
      if (card.emoji) ref.front.textContent = card.emoji;
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
        cls = 'status-connecting'; mini = '\u25CF Connecting...'; full = 'Connecting to TikTok...';
      } else if (state.tiktok.connected) {
        cls = 'status-connected'; mini = '\u25CF Live @' + state.tiktok.uniqueId; full = 'Connected to @' + state.tiktok.uniqueId;
      } else if (state.tiktok.lastError) {
        cls = 'status-error'; mini = '\u25CF Not connected'; full = state.tiktok.lastError;
      } else {
        mini = '\u25CF Not connected';
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
      const pts = document.createElement('span');
      pts.className = windowRows ? 'round-end-points' : 'lb-points';
      pts.textContent = windowRows ? row.points + (row.points === 1 ? ' pt' : ' pts') : row.points;
      li.appendChild(pts);
      listEl.appendChild(li);
    });
  }

  function renderDiagnostics(state) {
    rawEventCountEl.textContent = state.rawEventCount;
    lastReceivedEl.textContent = state.lastEvent && state.lastEvent.text
      ? state.lastEvent.user + ': ' + state.lastEvent.text
      : '(none yet)';
  }

  // ---- Every guess: feed line + floating pill ---------------------------------
  const TOAST_MS = 4200;
  let toastTimer = null;

  function describeGuess(r) {
    const pair = r.a != null ? r.a + ' & ' + r.b : null;
    switch (r.kind) {
      case 'match':   return { tone: 'correct', text: 'found ' + pair, feed: pair + ' \u2014 match! +1', points: '+1' };
      case 'miss':    return { tone: 'wrong',   text: pair + ' \u2014 no match', feed: pair + ' \u2014 no match' };
      case 'taken':   return { tone: 'info',    text: pair + ' \u2014 already flipped', feed: pair + ' \u2014 already flipped' };
      case 'invalid': return { tone: 'wrong',   text: pair + ' \u2014 not a card', feed: pair + ' \u2014 not a card' };
      case 'busy':    return { tone: 'info',    text: 'too soon \u2014 cards still showing', feed: (pair || '') + ' \u2014 too soon, cards still showing' };
      default:        return { tone: 'format',  text: 'wrong format \u2014 try e.g. 1 5', feed: '"' + r.text + '" \u2014 not two card numbers' };
    }
  }

  function addFeedItem(r, d) {
    const li = document.createElement('li');
    li.className = d.tone === 'correct' ? 'feed-correct' : d.tone === 'wrong' ? 'feed-wrong' : 'feed-info';
    const who = document.createElement('span');
    who.className = 'feed-user';
    who.textContent = r.name + ': ';
    li.appendChild(who);
    li.appendChild(document.createTextNode(d.feed.trim()));
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
    toastTimer = setTimeout(() => {
      toast.classList.add('leaving');
      setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 350);
    }, TOAST_MS);
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
  const ROUND_WINDOW_MS = 5000;
  const ALLTIME_WINDOW_MS = 5000;
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
      roundEndTimers.push(setTimeout(() => { roundEndOverlay.hidden = true; }, ALLTIME_WINDOW_MS));
    }, ROUND_WINDOW_MS));
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
    }
    autoNextToggle.checked = !!state.autoNext;
    botsToggle.checked = !!state.botsOn;
    roundEndNewGameBtn.hidden = !!state.autoNext;
    if (!state.autoNext) clearAutoNextCountdown();
    showMode(state.mode);
    renderGrid(state);
    renderTopline(state);
    renderDiagnostics(state);
  });

  socket.on('leaderboard', (data) => {
    lastLeaderboard = { round: (data && data.round) || [], allTime: (data && data.allTime) || [] };
    fillScoreList(leaderboardListEl, lastLeaderboard.round.slice(0, 20), 'inline');
    fillScoreList(allTimeListEl, lastLeaderboard.allTime.slice(0, 50), 'inline');
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
  wireTextSend('testCustomText', 'testCustomBtn', (raw) => ({ user: 'Fake viewer', text: raw }));
  wireTextSend('offlineGuessInput', 'offlineGuessBtn', (raw) => ({ user: 'Host', text: raw }));
  // Host console also accepts "name: 1 5" to guess as a named viewer.
  wireTextSend('hostConsoleInput', 'hostConsoleBtn', (raw) => {
    const colon = raw.indexOf(':');
    if (colon > 0 && colon < 20) return { user: raw.slice(0, colon).trim(), text: raw.slice(colon + 1).trim() };
    return { user: 'Host', text: raw };
  });
})();
