/**
 * TikTok LIVE Memory Match — Server
 * ----------------------------------
 * Single-file server: Express (static hosting) + Socket.io (realtime state)
 * + tiktok-live-connector (reads real TikTok LIVE chat comments).
 *
 * Run locally:   npm install && npm start
 * Deploy:        push this folder to GitHub, deploy on Render.com as a
 *                "Web Service" (Node). Render sets process.env.PORT for you.
 */

'use strict';

const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// ---------------------------------------------------------------------------
// Crash prevention — never let one bad event kill the whole game/stream.
// ---------------------------------------------------------------------------
process.on('uncaughtException', (err) => {
  console.error('[FATAL-CAUGHT] uncaughtException:', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL-CAUGHT] unhandledRejection:', reason);
});

// ---------------------------------------------------------------------------
// tiktok-live-connector is optional at boot time — if it's not installed,
// or the version's export shape differs, we degrade gracefully instead of
// crashing the whole server (Test Mode / Offline Mode still work).
// ---------------------------------------------------------------------------
let TikTokLib = null;
try {
  TikTokLib = require('tiktok-live-connector');
} catch (e) {
  console.warn('[WARN] tiktok-live-connector not available yet. Run "npm install". Live Mode will be disabled until then.');
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (req, res) => res.send('ok'));

// ---------------------------------------------------------------------------
// GAME CONFIG
// ---------------------------------------------------------------------------
const LEVELS = {
  1: { name: 'Warmup', cols: 4, rows: 5, cards: 20 },
  2: { name: 'Easy', cols: 6, rows: 6, cards: 36 },
  3: { name: 'Medium', cols: 6, rows: 8, cards: 48 },
  4: { name: 'Hard', cols: 8, rows: 8, cards: 64 },
  5: { name: 'Chaos', cols: 8, rows: 12, cards: 96 },
};

// 48 distinct, high-contrast emojis -> enough for 96 cards (48 pairs) at Level 5.
const EMOJI_POOL = [
  '🐶', '🐱', '🦊', '🐻', '🐼', '🐨', '🦁', '🐯', '🐮', '🐷',
  '🐸', '🐵', '🐔', '🐧', '🐦', '🦄', '🐝', '🦋', '🐢', '🐙',
  '🦀', '🐳', '🐬', '🦈', '🐊', '🦉', '🦅', '🦜', '🐴', '🐘',
  '🍎', '🍊', '🍋', '🍉', '🍇', '🍓', '🍒', '🍑', '🍍', '🥝',
  '🍕', '🍔', '🍟', '🌮', '🍩', '🍪', '🎂', '🍭',
];

const MISMATCH_SHOW_MS = 1100;      // how long a wrong pair stays face-up
const AUTO_NEXT_DELAY_MS = 10000;   // pause before the next game starts by itself
const BOT_TICK_MS = 700;            // how often a test bot makes a guess
const BOT_CORRECT_CHANCE = 0.7;     // how often a bot picks a real pair

// Fake viewers used by Test Mode "Auto-Play (Bots)".
const BOTS = [
  { uniqueId: 'bot-alpha', name: 'Bot Alpha', avatar: null },
  { uniqueId: 'bot-bravo', name: 'Bot Bravo', avatar: null },
  { uniqueId: 'bot-charlie', name: 'Bot Charlie', avatar: null },
  { uniqueId: 'bot-delta', name: 'Bot Delta', avatar: null },
];
const HOST_PLAYER = { uniqueId: 'host', name: 'Host', avatar: null };

// ---------------------------------------------------------------------------
// GAME STATE (single shared match — everyone in chat plays together)
// ---------------------------------------------------------------------------
const state = {
  mode: 'offline',       // 'offline' | 'test' | 'live'
  level: 2,
  cols: LEVELS[2].cols,
  rows: LEVELS[2].rows,
  gameId: 0,              // goes up by 1 every time a new game starts
  startedAt: null,        // ms timestamp when this game started
  solvedAt: null,         // ms timestamp when the last pair was found
  cards: [],              // [{ id, emoji, flipped, matched }]
  locked: false,          // true while a mismatched pair is briefly shown
  scores: {},             // this game:  { uniqueId: { uniqueId, name, avatar, points } }
  allTimeScores: {},      // every game since the server started (same shape)
  autoNext: false,        // start the next game by itself after each win
  botsOn: false,          // Test Mode bots are playing
  rawEventCount: 0,
  lastEvent: { user: '', text: '' },
  tiktok: { connected: false, uniqueId: null, connecting: false, lastError: null },
};

const avatarCache = {};   // uniqueId -> last known photo URL
let autoNextTimer = null;
let botTimer = null;

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function newGame(level) {
  cancelAutoNext();
  const key = Number(level) in LEVELS ? Number(level) : 2;
  const cfg = LEVELS[key];
  state.level = key;
  state.cols = cfg.cols;
  state.rows = cfg.rows;
  const pairCount = cfg.cards / 2;
  const emojis = shuffle(EMOJI_POOL.slice(0, pairCount).concat(EMOJI_POOL.slice(0, pairCount)));
  state.cards = emojis.map((emoji, idx) => ({
    id: idx + 1,
    emoji,
    flipped: false,
    matched: false,
  }));
  state.locked = false;
  state.scores = {};
  state.gameId += 1;
  state.startedAt = Date.now();
  state.solvedAt = null;
  broadcast();
  emitLeaderboards();
}

function broadcast() {
  io.emit('state', publicState());
}

// Never leak emoji identities for un-flipped, un-matched cards to the client.
function publicState() {
  const matchedCards = state.cards.filter((c) => c.matched).length;
  return {
    mode: state.mode,
    level: state.level,
    levelName: LEVELS[state.level].name,
    cols: state.cols,
    rows: state.rows,
    gameId: state.gameId,
    startedAt: state.startedAt,
    solvedAt: state.solvedAt,
    serverNow: Date.now(),
    matchedPairs: matchedCards / 2,
    totalPairs: state.cards.length / 2,
    locked: state.locked,
    autoNext: state.autoNext,
    botsOn: state.botsOn,
    rawEventCount: state.rawEventCount,
    lastEvent: state.lastEvent,
    tiktok: state.tiktok,
    cards: state.cards.map((c) => ({
      id: c.id,
      matched: c.matched,
      flipped: c.flipped,
      emoji: c.flipped || c.matched ? c.emoji : null,
    })),
  };
}

// ---- Scores ---------------------------------------------------------------
function ensurePlayer(table, p) {
  if (!table[p.uniqueId]) {
    table[p.uniqueId] = { uniqueId: p.uniqueId, name: p.name || p.uniqueId, avatar: p.avatar || null, points: 0 };
  }
  const row = table[p.uniqueId];
  if (p.name) row.name = p.name;
  if (p.avatar) row.avatar = p.avatar;
  return row;
}

function rankList(table, limit) {
  return Object.values(table)
    .filter((r) => r.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, limit)
    .map((r) => ({ uniqueId: r.uniqueId, name: r.name, avatar: r.avatar, points: r.points }));
}

function emitLeaderboards() {
  io.emit('leaderboard', {
    round: rankList(state.scores, 50),
    allTime: rankList(state.allTimeScores, 100),
  });
}

// ---- Auto next game -------------------------------------------------------
function cancelAutoNext() {
  if (autoNextTimer) {
    clearTimeout(autoNextTimer);
    autoNextTimer = null;
  }
}

function scheduleAutoNext() {
  cancelAutoNext();
  io.emit('autoNextCountdown', { seconds: Math.round(AUTO_NEXT_DELAY_MS / 1000) });
  autoNextTimer = setTimeout(() => {
    autoNextTimer = null;
    try { newGame(state.level); } catch (e) { console.error('[ERR] auto next game:', e); }
  }, AUTO_NEXT_DELAY_MS);
}

// ---------------------------------------------------------------------------
// CORE GAME LOGIC: flip two cards, check match, score, auto-unflip on miss.
// Always returns { kind } so the screen can say what happened to each guess:
//   match | miss | busy | taken | invalid
// ---------------------------------------------------------------------------
function attemptFlip(aId, bId, player) {
  try {
    if (state.solvedAt) return { kind: 'busy' };            // game already finished
    if (state.locked) return { kind: 'busy' };              // a mismatch is on display
    if (!Number.isInteger(aId) || !Number.isInteger(bId)) return { kind: 'invalid' };
    if (aId === bId) return { kind: 'invalid' };
    const a = state.cards.find((c) => c.id === aId);
    const b = state.cards.find((c) => c.id === bId);
    if (!a || !b) return { kind: 'invalid' };
    if (a.matched || b.matched || a.flipped || b.flipped) return { kind: 'taken' };

    a.flipped = true;
    b.flipped = true;

    if (a.emoji === b.emoji) {
      a.matched = true;
      b.matched = true;
      ensurePlayer(state.scores, player).points += 1;
      ensurePlayer(state.allTimeScores, player).points += 1;
      const won = state.cards.every((c) => c.matched);
      if (won) state.solvedAt = Date.now();
      broadcast();
      emitLeaderboards();
      if (won) {
        io.emit('gameOver', {
          leaderboard: rankList(state.scores, 50),
          allTimeLeaderboard: rankList(state.allTimeScores, 100),
          elapsedMs: state.solvedAt - state.startedAt,
          totalPairs: state.cards.length / 2,
          levelName: LEVELS[state.level].name,
        });
        if (state.autoNext) scheduleAutoNext();
      }
      return { kind: 'match' };
    }

    state.locked = true;
    broadcast();
    const gameAtFlip = state.gameId;
    setTimeout(() => {
      try {
        if (state.gameId !== gameAtFlip) return; // a new game started meanwhile
        a.flipped = false;
        b.flipped = false;
        state.locked = false;
        broadcast();
      } catch (e) {
        console.error('[ERR] unflip timeout handler:', e);
      }
    }, MISMATCH_SHOW_MS);
    return { kind: 'miss' };
  } catch (e) {
    console.error('[ERR] attemptFlip:', e);
    return { kind: 'invalid' };
  }
}

// ---------------------------------------------------------------------------
// CHAT PARSING — fallback chain across plausible field names, since the
// live-connector's payload shape can vary by version.
// ---------------------------------------------------------------------------
function firstUrl(obj) {
  if (!obj) return null;
  if (typeof obj === 'string') return obj;
  if (Array.isArray(obj) && obj.length) return typeof obj[0] === 'string' ? obj[0] : null;
  if (obj.urlList && obj.urlList.length) return obj.urlList[0];
  if (Array.isArray(obj.url) && obj.url.length) return obj.url[0];
  if (typeof obj.url === 'string') return obj.url;
  if (obj.urls && obj.urls.length) return obj.urls[0];
  return null;
}

// Who sent this comment: id, display name and (when TikTok gives one) photo.
function extractPlayer(evt) {
  const u = (evt && evt.user) || {};
  const uniqueId = String(u.uniqueId || evt.uniqueId || u.userId || u.id || evt.userId || 'viewer');
  const name = String(u.nickname || u.nickName || evt.nickname || u.uniqueId || evt.uniqueId || uniqueId);
  const avatar =
    firstUrl(u.profilePicture) ||
    firstUrl(u.avatarThumbnail) ||
    firstUrl(u.avatarMedium) ||
    firstUrl(u.avatarLarger) ||
    (typeof u.avatarUrl === 'string' ? u.avatarUrl : null) ||
    (typeof u.profilePictureUrl === 'string' ? u.profilePictureUrl : null) ||
    (typeof evt.profilePictureUrl === 'string' ? evt.profilePictureUrl : null) ||
    null;
  return { uniqueId, name, avatar };
}

function extractText(evt) {
  return evt.comment || evt.text || evt.msg || evt.content || evt.message || '';
}

function parseTwoNumbers(text) {
  if (!text) return null;
  const matches = String(text).match(/-?\d+/g);
  if (!matches || matches.length < 2) return null;
  const a = parseInt(matches[0], 10);
  const b = parseInt(matches[1], 10);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return [a, b];
}

// player = { uniqueId, name, avatar }
function handleIncomingComment(player, text, { countsAsRawEvent = true } = {}) {
  try {
    if (player.avatar) avatarCache[player.uniqueId] = player.avatar;
    else player.avatar = avatarCache[player.uniqueId] || null;

    if (countsAsRawEvent) state.rawEventCount += 1;
    state.lastEvent = { user: player.name, text };
    const pair = parseTwoNumbers(text);
    const result = pair ? attemptFlip(pair[0], pair[1], player) : { kind: 'format' };
    io.emit('guessResult', {
      uniqueId: player.uniqueId,
      name: player.name,
      avatar: player.avatar,
      text: String(text || '').slice(0, 60),
      kind: result.kind,
      a: pair ? pair[0] : null,
      b: pair ? pair[1] : null,
    });
    broadcast();
  } catch (e) {
    console.error('[ERR] handleIncomingComment:', e);
  }
}

// ---------------------------------------------------------------------------
// TEST MODE BOTS — fake viewers that keep playing until the board is done,
// so you can watch whole rounds (and the auto next game) without touching
// anything.
// ---------------------------------------------------------------------------
function botTick() {
  if (state.mode !== 'test' || state.solvedAt || state.locked) return;
  const open = state.cards.filter((c) => !c.matched && !c.flipped);
  if (open.length < 2) return;
  const bot = BOTS[Math.floor(Math.random() * BOTS.length)];
  let a = null;
  let b = null;
  if (Math.random() < BOT_CORRECT_CHANCE) {
    const byEmoji = {};
    open.forEach((c) => { (byEmoji[c.emoji] = byEmoji[c.emoji] || []).push(c.id); });
    const pairs = Object.values(byEmoji).filter((ids) => ids.length >= 2);
    if (pairs.length) {
      const pick = pairs[Math.floor(Math.random() * pairs.length)];
      a = pick[0];
      b = pick[1];
    }
  }
  if (a === null) {
    const ids = shuffle(open.map((c) => c.id));
    a = ids[0];
    b = ids[1];
  }
  handleIncomingComment({ ...bot }, `${a} ${b}`, { countsAsRawEvent: false });
}

function setBots(enabled) {
  state.botsOn = !!enabled;
  if (botTimer) {
    clearInterval(botTimer);
    botTimer = null;
  }
  if (state.botsOn) {
    botTimer = setInterval(() => {
      try { botTick(); } catch (e) { console.error('[ERR] bot tick:', e); }
    }, BOT_TICK_MS);
  }
  broadcast();
}

// ---------------------------------------------------------------------------
// TIKTOK LIVE CONNECTION (Live Mode) — auth key required, retry w/ backoff
// ---------------------------------------------------------------------------
let tiktokConnection = null;

function disconnectTikTok() {
  try {
    if (tiktokConnection && typeof tiktokConnection.disconnect === 'function') {
      tiktokConnection.disconnect();
    }
  } catch (e) {
    console.error('[ERR] disconnectTikTok:', e);
  }
  tiktokConnection = null;
  state.tiktok = { connected: false, uniqueId: null, connecting: false, lastError: null };
  broadcast();
}

function connectTikTok(uniqueId, apiKey, attemptsLeft = 3) {
  if (!TikTokLib) {
    state.tiktok.lastError = 'tiktok-live-connector is not installed on the server.';
    broadcast();
    return;
  }
  if (!apiKey) {
    state.tiktok.lastError = 'A signing/auth key (e.g. from eulerstream.com) is required for Live Mode.';
    broadcast();
    return;
  }

  const Ctor = TikTokLib.TikTokLiveConnection || TikTokLib.WebcastPushConnection;
  if (!Ctor) {
    state.tiktok.lastError = 'Unsupported tiktok-live-connector version installed.';
    broadcast();
    return;
  }

  state.tiktok.connecting = true;
  state.tiktok.lastError = null;
  broadcast();

  let conn;
  try {
    conn = new Ctor(uniqueId, {
      processInitialData: false,
      enableExtendedGiftInfo: false,
      signProviderOptions: { apiKey },
      // Fallback: some versions read the key from this top-level field instead.
      signApiKey: apiKey,
    });
  } catch (e) {
    console.error('[ERR] creating TikTok connection:', e);
    state.tiktok.connecting = false;
    state.tiktok.lastError = 'Failed to construct connection: ' + e.message;
    broadcast();
    return;
  }

  tiktokConnection = conn;

  // Any event at all increments the on-screen "All Raw Events" counter,
  // even if it's not a chat message — this proves the connection is alive.
  const rawEventTypes = ['chat', 'member', 'gift', 'like', 'social', 'roomUser', 'emote', 'follow', 'share'];
  rawEventTypes.forEach((type) => {
    try {
      conn.on(type, (evt) => {
        try {
          if (type === 'chat') {
            const player = extractPlayer(evt);
            const text = extractText(evt);
            console.log('[TIKTOK RAW CHAT]', JSON.stringify(evt).slice(0, 500));
            handleIncomingComment(player, text);
          } else {
            state.rawEventCount += 1;
            broadcast();
          }
        } catch (innerErr) {
          console.error(`[ERR] handling "${type}" event:`, innerErr);
        }
      });
    } catch (e) {
      console.error(`[ERR] registering listener for "${type}":`, e);
    }
  });

  conn.connect()
    .then(() => {
      state.tiktok = { connected: true, uniqueId, connecting: false, lastError: null };
      broadcast();
      console.log(`[TIKTOK] Connected to @${uniqueId}`);
    })
    .catch((err) => {
      console.error('[ERR] TikTok connect failed:', err && err.message ? err.message : err);
      if (attemptsLeft > 1) {
        const delay = (4 - attemptsLeft) * 2000 + 1000; // short backoff
        console.log(`[TIKTOK] Retrying in ${delay}ms (${attemptsLeft - 1} attempts left)...`);
        setTimeout(() => connectTikTok(uniqueId, apiKey, attemptsLeft - 1), delay);
      } else {
        state.tiktok = {
          connected: false,
          uniqueId: null,
          connecting: false,
          lastError: 'Could not connect after 3 attempts: ' + (err && err.message ? err.message : String(err)),
        };
        broadcast();
      }
    });
}

// ---------------------------------------------------------------------------
// SOCKET.IO — realtime bridge to the browser (overlay + host controls)
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  socket.emit('state', publicState());
  socket.emit('leaderboard', {
    round: rankList(state.scores, 50),
    allTime: rankList(state.allTimeScores, 100),
  });

  socket.on('host:newGame', (payload) => {
    try { newGame((payload || {}).level); } catch (e) { console.error('[ERR] host:newGame', e); }
  });

  socket.on('host:setMode', (payload) => {
    try {
      const mode = (payload || {}).mode;
      if (['offline', 'test', 'live'].includes(mode)) {
        if (mode !== 'live' && state.tiktok.connected) disconnectTikTok();
        if (mode !== 'test' && state.botsOn) setBots(false);
        state.mode = mode;
        broadcast();
      }
    } catch (e) { console.error('[ERR] host:setMode', e); }
  });

  socket.on('host:setAutoNext', (payload) => {
    try {
      state.autoNext = !!(payload && payload.enabled);
      if (!state.autoNext) cancelAutoNext();
      else if (state.solvedAt && !autoNextTimer) scheduleAutoNext();
      broadcast();
    } catch (e) { console.error('[ERR] host:setAutoNext', e); }
  });

  socket.on('host:setBots', (payload) => {
    try { setBots(!!(payload && payload.enabled) && state.mode === 'test'); } catch (e) { console.error('[ERR] host:setBots', e); }
  });

  // Manual chat from the Host console / Offline box / Test box (any mode).
  socket.on('host:manualInput', (payload) => {
    try {
      const p = payload || {};
      const name = String(p.user || 'Host').slice(0, 30);
      const player = name === 'Host' ? { ...HOST_PLAYER } : { uniqueId: 'named-' + name.toLowerCase(), name, avatar: null };
      handleIncomingComment(player, p.text);
    } catch (e) { console.error('[ERR] host:manualInput', e); }
  });

  // Test Mode: server generates a plausible fake viewer comment, picking
  // only from cards that are still face-down so every click does something.
  socket.on('test:simulate', () => {
    try {
      const fake = BOTS[Math.floor(Math.random() * BOTS.length)];
      const open = state.cards.filter((c) => !c.matched && !c.flipped).map((c) => c.id);
      if (open.length < 2) return;
      shuffle(open);
      const [a, b] = open;
      const text = Math.random() > 0.5 ? `${a} ${b}` : `${a}, ${b}`;
      handleIncomingComment({ ...fake }, text);
    } catch (e) { console.error('[ERR] test:simulate', e); }
  });

  socket.on('tiktok:connect', (payload) => {
    try {
      const p = payload || {};
      connectTikTok(String(p.uniqueId || '').replace(/^@/, ''), p.apiKey);
    } catch (e) { console.error('[ERR] tiktok:connect', e); }
  });

  socket.on('tiktok:disconnect', () => {
    try { disconnectTikTok(); } catch (e) { console.error('[ERR] tiktok:disconnect', e); }
  });
});

// Boot with a default game so the screen is never empty.
newGame(2);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`TikTok Live Memory Match running on port ${PORT}`);
});
