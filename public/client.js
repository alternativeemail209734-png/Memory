(function () {
  'use strict';

  const socket = io();

  // ---------------------------------------------------------------------
  // Mobile viewport height fix — never trust raw 100vh on mobile browsers.
  // ---------------------------------------------------------------------
  function setAppHeight() {
    document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
  }
  setAppHeight();
  window.addEventListener('resize', setAppHeight);
  window.addEventListener('orientationchange', setAppHeight);

  // ---------------------------------------------------------------------
  // DOM refs
  // ---------------------------------------------------------------------
  const grid = document.getElementById('grid');
  const gridWrap = document.getElementById('gridWrap');
  const rawEventCountEl = document.getElementById('rawEventCount');
  const lastEventLineEl = document.getElementById('lastEventLine');
  const leaderboardList = document.getElementById('leaderboardList');
  const modeLabel = document.getElementById('modeLabel');
  const tiktokStatus = document.getElementById('tiktokStatus');

  const levelSelect = document.getElementById('levelSelect');
  const newGameBtn = document.getElementById('newGameBtn');
  const modeSelect = document.getElementById('modeSelect');
  const simulateBtn = document.getElementById('simulateBtn');
  const tiktokConnectRow = document.getElementById('tiktokConnectRow');
  const tiktokUsername = document.getElementById('tiktokUsername');
  const tiktokApiKey = document.getElementById('tiktokApiKey');
  const tiktokConnectBtn = document.getElementById('tiktokConnectBtn');
  const tiktokDisconnectBtn = document.getElementById('tiktokDisconnectBtn');
  const hostGuessInput = document.getElementById('hostGuessInput');
  const hostSendBtn = document.getElementById('hostSendBtn');
  const toggleHostPanel = document.getElementById('toggleHostPanel');
  const hostPanelBody = document.getElementById('hostPanelBody');

  const winOverlay = document.getElementById('winOverlay');
  const winLeaderboard = document.getElementById('winLeaderboard');
  const winCloseBtn = document.getElementById('winCloseBtn');

  let currentState = null;

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------
  function renderGrid(state) {
    grid.style.gridTemplateColumns = `repeat(${state.cols}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${state.rows}, 1fr)`;

    // Rebuild only if card count changed (new game); otherwise patch in place.
    if (grid.childElementCount !== state.cards.length) {
      grid.innerHTML = '';
      state.cards.forEach((card) => {
        const el = document.createElement('div');
        el.className = 'card';
        el.dataset.id = card.id;
        el.innerHTML = `
          <div class="cardFace cardBack">${card.id}</div>
          <div class="cardFace cardFront"></div>
        `;
        grid.appendChild(el);
      });
    }

    state.cards.forEach((card) => {
      const el = grid.querySelector(`.card[data-id="${card.id}"]`);
      if (!el) return;
      el.classList.toggle('flipped', !!card.flipped);
      el.classList.toggle('matched', !!card.matched);
      const front = el.querySelector('.cardFront');
      if (card.emoji) front.textContent = card.emoji;
    });

    scaleCardFont(state.cols, state.rows);
  }

  // Scale the number/emoji font to fit any grid size, based on available
  // cell dimensions rather than a fixed px value.
  function scaleCardFont(cols, rows) {
    const w = gridWrap.clientWidth / cols;
    const h = gridWrap.clientHeight / rows;
    const cell = Math.min(w, h);
    const fontPx = Math.max(8, Math.floor(cell * 0.38));
    document.documentElement.style.setProperty('--card-font-size', fontPx + 'px');
  }

  function renderLeaderboard(list) {
    leaderboardList.innerHTML = '';
    if (!list.length) {
      leaderboardList.innerHTML = '<li style="opacity:.5">No matches yet</li>';
      return;
    }
    list.forEach((row) => {
      const li = document.createElement('li');
      li.textContent = `${row.user} — ${row.score}`;
      leaderboardList.appendChild(li);
    });
  }

  function renderDebug(state) {
    rawEventCountEl.textContent = state.rawEventCount;
    lastEventLineEl.textContent = state.lastEvent && state.lastEvent.text
      ? `Last: ${state.lastEvent.user}: ${state.lastEvent.text}`
      : 'Last: —';
  }

  function renderMeta(state) {
    modeLabel.textContent = state.mode.toUpperCase();
    if (state.mode === 'live') {
      if (state.tiktok.connecting) {
        tiktokStatus.textContent = '🟡 Connecting to TikTok...';
      } else if (state.tiktok.connected) {
        tiktokStatus.textContent = `🟢 Live: @${state.tiktok.uniqueId}`;
      } else if (state.tiktok.lastError) {
        tiktokStatus.textContent = '🔴 ' + state.tiktok.lastError;
      } else {
        tiktokStatus.textContent = '⚪ Not connected';
      }
    } else {
      tiktokStatus.textContent = '';
    }
    tiktokConnectRow.style.display = state.mode === 'live' ? 'flex' : 'none';
    if (modeSelect.value !== state.mode) modeSelect.value = state.mode;
    if (levelSelect.value != state.level) levelSelect.value = state.level;
  }

  // ---------------------------------------------------------------------
  // Socket events
  // ---------------------------------------------------------------------
  socket.on('state', (state) => {
    currentState = state;
    renderGrid(state);
    renderDebug(state);
    renderMeta(state);
  });

  socket.on('leaderboard', renderLeaderboard);

  socket.on('gameOver', (payload) => {
    winLeaderboard.innerHTML = '';
    payload.leaderboard.forEach((row) => {
      const li = document.createElement('li');
      li.textContent = `${row.user} — ${row.score}`;
      winLeaderboard.appendChild(li);
    });
    winOverlay.classList.remove('hidden');
  });

  winCloseBtn.addEventListener('click', () => {
    winOverlay.classList.add('hidden');
    socket.emit('host:newGame', { level: levelSelect.value });
  });

  window.addEventListener('resize', () => {
    if (currentState) scaleCardFont(currentState.cols, currentState.rows);
  });

  // ---------------------------------------------------------------------
  // Host control wiring
  // ---------------------------------------------------------------------
  newGameBtn.addEventListener('click', () => {
    socket.emit('host:newGame', { level: levelSelect.value });
  });

  modeSelect.addEventListener('change', () => {
    socket.emit('host:setMode', { mode: modeSelect.value });
  });

  simulateBtn.addEventListener('click', () => {
    socket.emit('test:simulate');
  });

  tiktokConnectBtn.addEventListener('click', () => {
    socket.emit('tiktok:connect', {
      uniqueId: tiktokUsername.value.trim(),
      apiKey: tiktokApiKey.value.trim(),
    });
  });

  tiktokDisconnectBtn.addEventListener('click', () => {
    socket.emit('tiktok:disconnect');
  });

  function sendHostInput() {
    const raw = hostGuessInput.value.trim();
    if (!raw) return;
    let user = 'Host';
    let text = raw;
    const colonIdx = raw.indexOf(':');
    if (colonIdx > 0 && colonIdx < 20) {
      user = raw.slice(0, colonIdx).trim();
      text = raw.slice(colonIdx + 1).trim();
    }
    socket.emit('host:manualInput', { user, text });
    hostGuessInput.value = '';
  }
  hostSendBtn.addEventListener('click', sendHostInput);
  hostGuessInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendHostInput();
  });

  toggleHostPanel.addEventListener('click', () => {
    const hidden = hostPanelBody.classList.toggle('hidden');
    toggleHostPanel.textContent = (hidden ? '▸' : '▾') + ' Host Controls';
  });
})();
