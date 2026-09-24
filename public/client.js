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
  let lastLeaderboard = [];
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

  // ---- Lists ---------------------------------------------------------------
  function rankBadge(idx) {
    const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
    return idx < 3 ? medals[idx] : String(idx + 1);
  }
  function fillScoreList(listEl, list, rowClass) {
    listEl.innerHTML = '';
    if (!list.length) {
      const li = document.createElement('li');
      li.className = 'lb-empty';
      li.textContent = 'No pairs found yet';
      listEl.appendChild(li);
      return;
    }
    list.forEach((row, idx) => {
      const li = document.createElement('li');
      const rank = document.createElement('span');
      rank.className = rowClass ? 'round-end-rank' + (idx < 3 ? ' round-end-rank-medal' : '') : 'inline-rank' + (idx < 3 ? ' inline-rank-medal' : '');
      rank.textContent = rankBadge(idx);
      const name = document.createElement('span');
      name.className = rowClass ? 'round-end-name' : 'lb-name';
      name.textContent = row.user;
      const pts = document.createElement('span');
      pts.className = rowClass ? 'round-end-points' : 'lb-points';
      pts.textContent = row.score;
      li.appendChild(rank);
      li.appendChild(name);
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

  // ---- Recent guesses feed ------------------------------------------------
  function addFeedItem(r) {
    const pair = r.a != null ? r.a + ' & ' + r.b : '"' + r.text + '"';
    const outcomes = {
      match:   ['feed-correct', pair + ' \u2014 match! +1'],
      miss:    ['feed-wrong',   pair + ' \u2014 no match'],
      taken:   ['feed-info',    pair + ' \u2014 already flipped'],
      invalid: ['feed-wrong',   pair + ' \u2014 not a card'],
      busy:    ['feed-info',    pair + ' \u2014 too soon, cards still showing'],
      format:  ['feed-info',    pair + ' \u2014 not two card numbers'],
    };
    const o = outcomes[r.kind] || outcomes.format;
    const li = document.createElement('li');
    li.className = o[0];
    const who = document.createElement('span');
    who.className = 'feed-user';
    who.textContent = r.user + ': ';
    li.appendChild(who);
    li.appendChild(document.createTextNode(o[1]));
    feedListEl.insertBefore(li, feedListEl.firstChild);
    while (feedListEl.children.length > 40) feedListEl.removeChild(feedListEl.lastChild);
  }

  // ---- Overlays ---------------------------------------------------------------
  const roundEndOverlay = document.getElementById('roundEndOverlay');
  const roundEndList = document.getElementById('roundEndList');
  const roundEndSummary = document.getElementById('roundEndSummary');
  function hideRoundEnd() { roundEndOverlay.hidden = true; }
  function showRoundEnd(payload) {
    roundEndSummary.textContent = 'All ' + payload.totalPairs + ' pairs found on ' + payload.levelName + ' in ' + formatDuration(payload.elapsedMs) + '.';
    fillScoreList(roundEndList, (payload.leaderboard || []).slice(0, 10), true);
    roundEndOverlay.hidden = false;
  }
  document.getElementById('roundEndCloseBtn').addEventListener('click', hideRoundEnd);
  document.getElementById('roundEndNewGameBtn').addEventListener('click', () => startNewGame());

  const leaderboardOverlay = document.getElementById('leaderboardOverlay');
  const leaderboardModalList = document.getElementById('leaderboardModalList');
  function closeLeaderboardModal() { leaderboardOverlay.hidden = true; }
  function openLeaderboardModal() {
    fillScoreList(leaderboardModalList, lastLeaderboard.slice(0, 20), true);
    leaderboardOverlay.hidden = false;
  }
  document.getElementById('leaderboardTopBtn').addEventListener('click', openLeaderboardModal);
  document.getElementById('leaderboardModalCloseBtn').addEventListener('click', closeLeaderboardModal);
  [roundEndOverlay, leaderboardOverlay].forEach((ov) => {
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.hidden = true; });
  });

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
    }
    showMode(state.mode);
    renderGrid(state);
    renderTopline(state);
    renderDiagnostics(state);
  });

  socket.on('leaderboard', (list) => {
    lastLeaderboard = list || [];
    fillScoreList(leaderboardListEl, lastLeaderboard.slice(0, 20), false);
    if (!leaderboardOverlay.hidden) fillScoreList(leaderboardModalList, lastLeaderboard.slice(0, 20), true);
  });

  socket.on('guessResult', addFeedItem);
  socket.on('gameOver', showRoundEnd);

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
