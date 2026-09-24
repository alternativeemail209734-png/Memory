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

// ---------------------------------------------------------------------------
// GAME STATE (single shared match — everyone in chat plays together)
// ---------------------------------------------------------------------------
const state = {
  mode: 'offline',       // 'offline' | 'test' | 'live'
  level: 2,
  cols: LEVELS[2].cols,
  rows: LEVELS[2].rows,
  cards: [],              // [{ id, emoji, flipped, matched }]
  pendingFlip: null,      // { a, b, user } while a mismatch is on display
  locked: false,          // true while a mismatched pair is briefly shown
  scores: {},             // { username: matchCount }
  rawEventCount: 0,
  lastEvent: { user: '', text: '' },
  tiktok: { connected: false, uniqueId: null, connecting: false, lastError: null },
};

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function newGame(level) {
  const cfg = LEVELS[level] || LEVELS[2];
  state.level = Number(level) in LEVELS ? Number(level) : 2;
  state.cols = cfg.cols;
  state.rows = cfg.rows;
  const pairCount = cfg.cards / 2;
  const emojis = shuffle(EMOJI_POOL.slice(0, pairCount).concat(EMOJI_POOL.slice(0, pairCount)));
  shuffle(emojis);
  state.cards = emojis.map((emoji, idx) => ({
    id: idx + 1,
    emoji,
    flipped: false,
    matched: false,
  }));
  state.pendingFlip = null;
  state.locked = false;
  state.scores = {};
  broadcast();
}

function broadcast() {
  io.emit('state', publicState());
}

// Never leak emoji identities for un-flipped, un-matched cards to the client.
function publicState() {
  return {
    ...state,
    cards: state.cards.map((c) => ({
      id: c.id,
      matched: c.matched,
      flipped: c.flipped,
      emoji: c.flipped || c.matched ? c.emoji : null,
    })),
  };
}

function leaderboard() {
  return Object.entries(state.scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([user, score]) => ({ user, score }));
}

// ---------------------------------------------------------------------------
// CORE GAME LOGIC: flip two cards, check match, score, auto-unflip on miss
// ---------------------------------------------------------------------------
function attemptFlip(aId, bId, user) {
  try {
    if (state.locked) return; // a mismatch is mid-animation — ignore new input
    if (!Number.isInteger(aId) || !Number.isInteger(bId)) return;
    if (aId === bId) return;
    const a = state.cards.find((c) => c.id === aId);
    const b = state.cards.find((c) => c.id === bId);
    if (!a || !b) return;
    if (a.matched || b.matched || a.flipped || b.flipped) return;

    a.flipped = true;
    b.flipped = true;
    broadcast();

    if (a.emoji === b.emoji) {
      a.matched = true;
      b.matched = true;
      state.scores[user] = (state.scores[user] || 0) + 1;
      broadcast();
      maybeAnnounceWin();
    } else {
      state.locked = true;
      broadcast();
      setTimeout(() => {
        try {
          a.flipped = false;
          b.flipped = false;
          state.locked = false;
          broadcast();
        } catch (e) {
          console.error('[ERR] unflip timeout handler:', e);
        }
      }, 1100);
    }
  } catch (e) {
    console.error('[ERR] attemptFlip:', e);
  }
}

function maybeAnnounceWin() {
  const allMatched = state.cards.length > 0 && state.cards.every((c) => c.matched);
  if (allMatched) {
    io.emit('gameOver', { leaderboard: leaderboard() });
  }
}

// ---------------------------------------------------------------------------
// CHAT PARSING — fallback chain across plausible field names, since the
// live-connector's payload shape can vary by version.
// ---------------------------------------------------------------------------
function extractUser(evt) {
  return (
    (evt.user && (evt.user.uniqueId || evt.user.nickname)) ||
    evt.uniqueId ||
    evt.nickname ||
    evt.userId ||
    'viewer'
  );
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

function handleIncomingComment(user, text, { countsAsRawEvent = true } = {}) {
  try {
    if (countsAsRawEvent) state.rawEventCount += 1;
    state.lastEvent = { user, text };
    const pair = parseTwoNumbers(text);
    if (pair) attemptFlip(pair[0], pair[1], user);
    broadcast();
  } catch (e) {
    console.error('[ERR] handleIncomingComment:', e);
  }
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
            const user = extractUser(evt);
            const text = extractText(evt);
            console.log('[TIKTOK RAW CHAT]', JSON.stringify(evt).slice(0, 500));
            handleIncomingComment(user, text);
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
  socket.emit('leaderboard', leaderboard());

  socket.on('host:newGame', ({ level }) => {
    try { newGame(level); } catch (e) { console.error('[ERR] host:newGame', e); }
  });

  socket.on('host:setMode', ({ mode }) => {
    try {
      if (['offline', 'test', 'live'].includes(mode)) {
        if (mode !== 'live' && state.tiktok.connected) disconnectTikTok();
        state.mode = mode;
        broadcast();
      }
    } catch (e) { console.error('[ERR] host:setMode', e); }
  });

  // Manual chat simulation from the Host input box (works in any mode).
  socket.on('host:manualInput', ({ user, text }) => {
    try { handleIncomingComment(user || 'Host', text); } catch (e) { console.error('[ERR] host:manualInput', e); }
  });

  // Test Mode: server generates a plausible fake viewer comment.
  socket.on('test:simulate', () => {
    try {
      const fakeUsers = ['fan_88', 'tiktoker_x', 'lurker99', 'newbie123', 'catlover', 'giftgiver', 'anon_viewer'];
      const user = fakeUsers[Math.floor(Math.random() * fakeUsers.length)];
      const maxId = state.cards.length || 20;
      let a = 1 + Math.floor(Math.random() * maxId);
      let b = 1 + Math.floor(Math.random() * maxId);
      while (b === a) b = 1 + Math.floor(Math.random() * maxId);
      const text = Math.random() > 0.5 ? `${a} ${b}` : `${a}, ${b}`;
      handleIncomingComment(user, text);
    } catch (e) { console.error('[ERR] test:simulate', e); }
  });

  socket.on('tiktok:connect', ({ uniqueId, apiKey }) => {
    try { connectTikTok((uniqueId || '').replace(/^@/, ''), apiKey); } catch (e) { console.error('[ERR] tiktok:connect', e); }
  });

  socket.on('tiktok:disconnect', () => {
    try { disconnectTikTok(); } catch (e) { console.error('[ERR] tiktok:disconnect', e); }
  });

  socket.on('request:leaderboard', () => {
    socket.emit('leaderboard', leaderboard());
  });

  socket.on('disconnect', () => {});
});

// Push a fresh leaderboard alongside every state broadcast.
const originalBroadcast = broadcast;
broadcast = function patchedBroadcast() {
  originalBroadcast();
  io.emit('leaderboard', leaderboard());
};

// Boot with a default game so the screen is never empty.
newGame(2);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`TikTok Live Memory Match running on port ${PORT}`);
});
