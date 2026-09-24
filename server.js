/**
 * TikTok LIVE Memory Match - Server
 * ----------------------------------
 * One file: Express (static hosting) + Socket.IO (realtime state)
 * + a hardened TikTok LIVE connector (reads real chat comments).
 *
 * Run locally:   npm install && npm start
 * Deploy:        push this folder to GitHub, deploy on Render.com as a
 *                "Web Service" (Node). Render sets process.env.PORT for you.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// Loads a local ".env" file (EULERSTREAM_SIGN_API_KEY, TIKTOK_USERNAME, ...)
// when running on your own computer. On Render the dashboard variables are
// already in process.env, so a missing dotenv/.env is fine.
try {
  require('dotenv').config();
} catch (err) {
  console.warn('[dotenv] Could not load .env file (this is fine on Render): ' + (err && err.message ? err.message : err));
}

// ---------------------------------------------------------------------------
// Crash prevention - never let one bad event kill the whole game/stream.
// ---------------------------------------------------------------------------
process.on('uncaughtException', (err) => {
  console.error('[FATAL-CAUGHT] uncaughtException:', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL-CAUGHT] unhandledRejection:', reason);
});

// ---------------------------------------------------------------------------
// TikTok defaults from environment variables, so the host does not have to
// paste the Sign API Key into the website every time. The key itself is
// never sent to the browser - only whether one is configured.
// ---------------------------------------------------------------------------
var DEFAULT_TIKTOK_USERNAME = String(process.env.TIKTOK_USERNAME || '').replace('@', '').trim();
var DEFAULT_SIGN_API_KEY = String(process.env.EULERSTREAM_SIGN_API_KEY || '').trim();

// ---------------------------------------------------------------------------
// TIKTOK LIVE CONNECTOR (ported from the Sudoku game, unchanged).
// Auto-reconnect watchdog, rate-limit backoff, de-duplication by message ID,
// broad comment/photo extraction and opt-in debug logging (CHAT_DEBUG_LOG).
// ---------------------------------------------------------------------------
function createTikTokConnector(onChat, onStatus, onRawEvent) {
  var TikTokLiveConnection = null;
  var WebcastEvent = null;
  var SignConfig = null;
  var activeConnection = null;
  var retryCount = 0;
  var MAX_INITIAL_RETRIES = 3;

  // ---- Connection-health tracking -----------------------------------------
  // The single biggest real-world failure mode of this kind of reverse-
  // engineered WebSocket connection is a "zombie" connection: the socket
  // never receives a clean close, so the library never fires 'disconnected'
  // or 'error', and the host console keeps showing "Connected!" forever even
  // though no viewer comment is getting through any more. The only reliable
  // way to catch this is to track when ANY data last arrived (not just chat -
  // the viewer-count/"roomUser" event alone pings in constantly on a healthy
  // connection) and force a fresh reconnect if it's gone quiet for too long.
  var desiredConnected = false; // true once the host asks to connect, until they explicitly disconnect
  var lastUsername = null;
  var lastSignApiKey = null;
  var lastActivityAt = 0;
  var reconnectTimer = null;
  var watchdogTimer = null;
  var reconnectAttempt = 0;
  var isConnecting = false; // guards against two connect() calls racing each other

  var WATCHDOG_CHECK_MS = 20000;    // how often we check for a stalled connection
  var WATCHDOG_STALE_MS = 120000;   // no data AT ALL for this long while "connected" = assume it's dead
  var RECONNECT_BASE_DELAY_MS = 3000;
  var RECONNECT_MAX_DELAY_MS = 30000;
  var RATE_LIMIT_DEFAULT_COOLDOWN_MS = 60000; // used when a 429 doesn't tell us how long to wait

  // ---------------------------------------------------------------------
  // FAILSAFE LOGGING: root-caused a real incident where the console only
  // ever showed `[TikTok connector] first time seeing event: "error"` on
  // repeat, with the actual reason invisible - because the underlying
  // error was only ever handed to onStatus() (which goes to the browser),
  // never to console.error(). That made a real bug (see below) look like
  // an unexplainable mystery from the Render logs alone.
  //
  // This helper is now the ONLY place that reports a connector failure,
  // and it always prints everything the error object has - message, name,
  // any HTTP status/retry-after info the library attaches, and the stack -
  // so the real cause is on the screen (Render logs) the moment it happens,
  // not just in a toast that scrolled away.
  // ---------------------------------------------------------------------
  function describeError(err) {
    if (!err) return { message: "Unknown error (no error object was provided).", retryAfterMs: null };
    var parts = [];
    var name = err.name || (err.constructor && err.constructor.name) || "Error";
    var message = err.message || String(err);
    parts.push(name + ": " + message);

    // tiktok-live-connector's SignatureRateLimitError (and similar) attach
    // rate-limit metadata under a few different possible shapes depending
    // on version. We check all of them rather than assuming one.
    var retryAfterMs = null;
    var candidates = [
      err.retryAfter, err.retry_after,
      err.response && err.response.headers && err.response.headers["retry-after"],
      err.headers && err.headers["retry-after"]
    ];
    for (var i = 0; i < candidates.length; i++) {
      var v = candidates[i];
      if (v !== undefined && v !== null && !isNaN(Number(v))) {
        retryAfterMs = Number(v) * 1000;
        parts.push("retry-after: " + v + "s");
        break;
      }
    }
    if (err.code) parts.push("code: " + err.code);
    if (err.response && err.response.status) parts.push("http status: " + err.response.status);

    var isRateLimit =
      /rate ?limit/i.test(name) || /rate ?limit/i.test(message) ||
      (err.response && err.response.status === 429) ||
      /429/.test(message);

    return {
      message: parts.join(" | "),
      retryAfterMs: retryAfterMs,
      isRateLimit: isRateLimit,
      stack: err.stack || null
    };
  }

  function reportFailure(context, err) {
    var info = describeError(err);
    // Always goes to the Render/console logs, in full - this is the fix for
    // "the real reason never showed up anywhere".
    console.error("[TikTok connector] " + context + ": " + info.message);
    if (info.stack) console.error(info.stack);
    return info;
  }

  async function loadLibrary() {
    if (TikTokLiveConnection) return;
    var lib = await import("tiktok-live-connector");
    var mod = lib && lib.default ? Object.assign({}, lib, lib.default) : lib;
    TikTokLiveConnection = mod.TikTokLiveConnection || mod.WebcastPushConnection;
    WebcastEvent = mod.WebcastEvent;
    SignConfig = mod.SignConfig || null;
    if (!TikTokLiveConnection) {
      throw new Error("Could not find a connection class in the tiktok-live-connector package.");
    }
  }

  // Pulls plain text out of whatever shape a "comment"-like field turns out
  // to be. Most of the time it's a plain string, but some payload variants
  // (rich text with mentions/stickers) represent it as an array of text
  // "runs" (e.g. [{type:"text", text:"A5 7"}]) or a single nested object
  // instead. Handling those here means a correctly-typed guess never gets
  // silently dropped just because it arrived in an unexpected wrapper.
  function coerceCommentText(value) {
    if (value === null || typeof value === "undefined") return null;
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
      var joined = value
        .map(function (part) {
          if (typeof part === "string") return part;
          if (part && typeof part.text === "string") return part.text;
          if (part && typeof part.content === "string") return part.content;
          return "";
        })
        .join("");
      return joined || null;
    }
    if (typeof value === "object") {
      if (typeof value.text === "string") return value.text;
      if (typeof value.content === "string") return value.content;
    }
    return null;
  }

  function extractChatFields(data) {
    if (!data) return null;
    var text = coerceCommentText(data.comment) ||
      coerceCommentText(data.text) ||
      coerceCommentText(data.message) ||
      coerceCommentText(data.content);
    // NOTE: this used to `return null` right here if no text field was
    // found, which silently discarded the WHOLE event - uniqueId, nickname,
    // everything - and meant it never showed up anywhere, not even as an
    // "unparsed" entry. Now we keep going and still return what we found,
    // with text left null; the caller treats a null text as an unparsed
    // guess but still counts and displays the event.

    // The exact shape of "who sent this" has changed across tiktok-live-
    // connector releases (nested under `.user`, flattened onto the message
    // itself, or both at once depending on version) so every known spot is
    // tried, in order, before giving up and lumping the viewer in as
    // "unknown" (their guess still counts, it just won't show a name).
    var uniqueId = "unknown";
    if (data.user && data.user.uniqueId) uniqueId = data.user.uniqueId;
    else if (data.user && data.user.id) uniqueId = data.user.id;
    else if (data.uniqueId) uniqueId = data.uniqueId;
    else if (data.userId) uniqueId = data.userId;

    var nickname = uniqueId;
    if (data.user && data.user.nickname) nickname = data.user.nickname;
    else if (data.user && data.user.nickName) nickname = data.user.nickName;
    else if (data.user && data.user.displayName) nickname = data.user.displayName;
    else if (data.nickname) nickname = data.nickname;
    else if (data.nickName) nickname = data.nickName;

    // TikTok's live-connector library has shipped several different shapes
    // for the viewer's profile picture across versions, so we try each of
    // the known spots and fall back to null (the client then draws a
    // generated circular initials avatar instead).
    var avatarUrl = null;
    function firstUrl(obj) {
      if (!obj) return null;
      if (typeof obj === "string") return obj;
      if (Array.isArray(obj) && obj.length) return obj[0];
      if (obj.urlList && obj.urlList.length) return obj.urlList[0];
      if (obj.url && Array.isArray(obj.url) && obj.url.length) return obj.url[0];
      if (obj.url && typeof obj.url === "string") return obj.url;
      if (obj.urls && obj.urls.length) return obj.urls[0];
      return null;
    }
    if (data.user) {
      avatarUrl = firstUrl(data.user.profilePicture) ||
        firstUrl(data.user.avatarThumbnail) ||
        firstUrl(data.user.avatarMedium) ||
        firstUrl(data.user.avatarLarger) ||
        (typeof data.user.avatarUrl === "string" ? data.user.avatarUrl : null) ||
        (typeof data.user.profilePictureUrl === "string" ? data.user.profilePictureUrl : null);
    }
    if (!avatarUrl && typeof data.avatarUrl === "string") avatarUrl = data.avatarUrl;
    if (!avatarUrl && typeof data.profilePictureUrl === "string") avatarUrl = data.profilePictureUrl;

    return { text: text === null ? null : String(text), uniqueId: String(uniqueId), nickname: String(nickname), avatarUrl: avatarUrl ? String(avatarUrl) : null };
  }

  // ---------------------------------------------------------------------
  // FAILSAFE: message de-duplication by a real ID, not object identity.
  //
  // The previous version used a WeakSet keyed on the raw event OBJECT to
  // avoid double-processing the same comment when it happened to fire
  // under two different event-name aliases. That only works if the
  // decoder always hands out a brand-new object per message - if any
  // version of the library ever reuses/mutates a buffer object across
  // consecutive messages (a common performance pattern in binary/protobuf
  // decoders), object-identity dedup would silently treat a second,
  // genuinely different comment as "already seen" and drop it. That is a
  // plausible explanation for "a correctly-formatted guess just never
  // showed up at all" - it wouldn't even a leave a console trace.
  //
  // This replaces it with dedup by the message's own ID (whichever field
  // the payload actually has), which is correct either way: it still
  // collapses true duplicate deliveries (a known behavior of at-least-once
  // WebSocket delivery, and of binding the same handler to multiple event
  // aliases), but it can never mistake two different comments for the same
  // one. IDs are remembered for a short TTL and the table is capped, so
  // this can never grow unbounded across a long stream.
  // ---------------------------------------------------------------------
  var seenMessageIds = new Map(); // id -> timestamp seen
  var DEDUP_TTL_MS = 15000;
  var DEDUP_MAX_ENTRIES = 2000;

  function extractMessageId(data) {
    if (!data) return null;
    var candidates = [
      data.msgId, data.messageId, data.id,
      data.common && data.common.msgId,
      data.common && data.common.msg_id
    ];
    for (var i = 0; i < candidates.length; i++) {
      var v = candidates[i];
      if (v !== undefined && v !== null && v !== "") return String(v);
    }
    return null; // no id available - caller falls back to processing it (never silently drops without one)
  }

  function isDuplicateMessage(id) {
    if (!id) return false; // nothing to key on - don't guess, just process it
    var now = Date.now();
    if (seenMessageIds.has(id)) {
      seenMessageIds.set(id, now); // refresh so a burst of true dupes stays deduped
      return true;
    }
    seenMessageIds.set(id, now);
    // Trim occasionally rather than every call - cheap amortized cleanup.
    if (seenMessageIds.size > DEDUP_MAX_ENTRIES) {
      for (var key of seenMessageIds.keys()) {
        if (now - seenMessageIds.get(key) > DEDUP_TTL_MS) seenMessageIds.delete(key);
      }
    }
    return false;
  }

  // FAILSAFE: full per-message payload dumps (JSON.stringify + two
  // console.log calls per comment) are useful while diagnosing a parsing
  // problem, but under a real, bursty live audience they add real CPU cost
  // on every single message - exactly when the event loop is busiest and
  // least able to spare it. Left on unconditionally, that's a plausible
  // contributor to "some correctly-formatted guesses just never registered"
  // under load. They're now opt-in via CHAT_DEBUG_LOG=true (set it in
  // Render's Environment tab, or a local .env, whenever you need to see
  // the raw payloads again) and OFF by default. The lightweight, always-on
  // path (rawEventCount/lastReceived/diagnostics panel) is untouched and
  // costs only a property assignment - that's the normal way to see what's
  // coming in.
  var CHAT_DEBUG_LOG = /^(1|true|yes)$/i.test(String(process.env.CHAT_DEBUG_LOG || ""));

  function markActivity() {
    lastActivityAt = Date.now();
  }

  // Newer tiktok-live-connector versions decode several protobuf fields
  // (userId, msgId, roomId, etc.) as native BigInt. JSON.stringify() throws
  // a hard TypeError ("Do not know how to serialize a BigInt") the instant
  // it meets one of those fields - it does not skip it or stringify it as
  // a number. A BigInt-aware replacer avoids that crash.
  function safeStringifyForLog(data) {
    try {
      return JSON.stringify(data, function (key, value) {
        return typeof value === "bigint" ? value.toString() : value;
      }).slice(0, 500);
    } catch (e) {
      return "[could not stringify chat payload for logging: " + (e && e.message ? e.message : e) + "]";
    }
  }

  // We previously bet everything on a single event name (WebcastEvent.CHAT,
  // falling back to the literal "chat"). If a future/older library build
  // fires chat messages under a different name than we expect, that single
  // listener silently never fires. So we bind the exact same handler to
  // every plausible alias: whatever WebcastEvent.CHAT resolves to, the
  // literal "chat", any other WebcastEvent key with "CHAT" in its name, and
  // a couple of literal names seen in other library forks.
  function collectChatAliases() {
    var aliases = ["chat"];
    if (WebcastEvent) {
      Object.keys(WebcastEvent).forEach(function (key) {
        if (!/chat/i.test(key)) return;
        var val = WebcastEvent[key];
        if (val && aliases.indexOf(val) === -1) aliases.push(val);
      });
    }
    ["WebcastChatMessage", "chatMessage", "member:chat"].forEach(function (name) {
      if (aliases.indexOf(name) === -1) aliases.push(name);
    });
    return aliases;
  }

  function wireEvents(connection) {
    // Diagnostic: logs the very first time we see each distinct event name
    // this connection ever emits. Confirmed working: Render logs showed
    // "chat" firing with real WebcastChatMessage payloads.
    try {
      var originalEmit = connection.emit.bind(connection);
      var seenEventNames = {};
      connection.emit = function (eventName) {
        if (!seenEventNames[eventName]) {
          seenEventNames[eventName] = true;
          console.log("[TikTok connector] first time seeing event: \"" + eventName + "\"");
        }
        return originalEmit.apply(null, arguments);
      };
    } catch (e) {
      console.error("[TikTok connector] could not install event-name logger - swallowed", e);
    }

    var chatAliases = collectChatAliases();
    chatAliases.forEach(function (chatEventName) {
      connection.on(chatEventName, function (data) {
        // See "FAILSAFE: message de-duplication by a real ID" above for why
        // this replaced the old WeakSet-by-object-identity check.
        var msgId = extractMessageId(data);
        if (isDuplicateMessage(msgId)) return;
      // THE REAL BUG, FOUND FROM YOUR LOGS: chat events were confirmed
      // arriving (you saw "[TikTok raw chat event]" lines), but the
      // diagnostics counter never moved. That only happens if
      // extractChatFields() was returning null for every one of them - and
      // the old code only called onChat()/incremented the counter
      // `if (extracted)`, so a real, arriving-but-unparseable event was
      // completely invisible from the UI. There was no way to tell "nothing
      // is arriving" apart from "things are arriving but failing to parse."
      //
      // Fix, in two parts:
      //   1. extractChatFields() below now NEVER returns null - if it can't
      //      find comment text, it still returns the uniqueId/nickname it
      //      found (or "unknown") with text left null, and parseGuess()
      //      already handles null text fine (reports "unparsed").
      //   2. onChat() is now called UNCONDITIONALLY for every real event,
      //      so rawEventCount/lastReceived in the Settings panel will light
      //      up for every single chat event that reaches this handler -
      //      giving you a true, unambiguous signal from now on.
      markActivity();

      var extracted = null;
      try {
        extracted = extractChatFields(data);
      } catch (err) {
        console.error("[chat extraction error - swallowed, server kept running]", err);
      }

      try {
        onChat(extracted || { text: null, uniqueId: "unknown", nickname: "unknown", avatarUrl: null });
      } catch (err) {
        console.error("[onChat handler error - swallowed, server kept running]", err);
      }

      try {
        onRawEvent(data);
      } catch (err) {
        console.error("[onRawEvent error - swallowed, server kept running]", err);
      }

      // Full payload dumps are opt-in (CHAT_DEBUG_LOG=true) - see the note
      // above CHAT_DEBUG_LOG's definition. They stay available for the next
      // time something needs diagnosing, without costing anything on every
      // single comment during a normal live show.
      if (CHAT_DEBUG_LOG) {
        try {
          console.log(
            "[chat field probe] topLevelKeys=" + JSON.stringify(Object.keys(data || {})) +
            " typeof(data.comment)=" + typeof (data && data.comment) +
            " data.comment=" + JSON.stringify(data && data.comment) +
            " typeof(data.user)=" + typeof (data && data.user) +
            " userKeys=" + JSON.stringify(data && data.user ? Object.keys(data.user) : null) +
            " data.user.uniqueId=" + JSON.stringify(data && data.user && data.user.uniqueId)
          );
        } catch (err) {
          console.error("[chat field probe error - swallowed]", err && err.message ? err.message : err);
        }

        try {
          console.log("[TikTok raw chat event]", safeStringifyForLog(data));
        } catch (err) {
          console.error("[chat debug log error - swallowed, server kept running]", err);
        }
      }
      });
    });

    // These don't need to be parsed - they only exist here so the watchdog
    // below can tell a genuinely healthy-but-quiet chat (no one has typed a
    // guess in a while, but viewer-count/like/join pings keep arriving)
    // apart from a truly dead connection (nothing at all arrives, ever,
    // because the underlying WebSocket died without a clean close event -
    // a well-known failure mode of unofficial/reverse-engineered TikTok
    // WebSocket libraries). Wrapped individually so an unknown/renamed event
    // in a future library version can never throw or block the others.
    ["roomUser", "member", "like", "social", "gift", "rawData", "decodedData", "websocketData"].forEach(function (name) {
      try { connection.on(name, markActivity); } catch (e) {}
    });

    connection.on("disconnected", function (info) {
      try {
        var reasonSuffix = info && info.reason ? " (" + info.reason + ")" : "";
        console.log("[TikTok connector] disconnected event" + reasonSuffix);
        onStatus("disconnected", "Disconnected from TikTok LIVE." + reasonSuffix);
      } catch (e) {}
      scheduleReconnect("the connection was closed");
    });
    connection.on("streamEnd", function () {
      try { onStatus("disconnected", "The TikTok LIVE stream ended. Watching for it to start again..."); } catch (e) {}
      scheduleReconnect("the stream ended");
    });
    connection.on("error", function (err) {
      var info = reportFailure("runtime error event", err);
      try { onStatus("error", "Runtime error: " + info.message); } catch (e) {}
      scheduleReconnect(info.isRateLimit ? "EulerStream rate-limited the request" : "a runtime error", info);
    });
  }

  // ---- Watchdog: catches a "zombie" connection --------------------------
  // If the status says "Connected!" but literally nothing has arrived from
  // TikTok - not a chat message, not a viewer-count update, nothing - for
  // more than WATCHDOG_STALE_MS, the underlying socket is almost certainly
  // dead without ever having fired a 'disconnected' or 'error' event. This
  // is exactly the situation described as "status shows connected but
  // guesses stop working": the fix is to notice it ourselves and force a
  // fresh reconnect instead of waiting forever for an event that will never
  // come.
  function stopWatchdog() {
    if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; }
  }

  function startWatchdog() {
    stopWatchdog();
    watchdogTimer = setInterval(function () {
      if (!desiredConnected || !activeConnection) return;
      var quietForMs = Date.now() - lastActivityAt;
      if (quietForMs > WATCHDOG_STALE_MS) {
        console.error("[TikTok watchdog] no data at all for " + Math.round(quietForMs / 1000) + "s while marked connected - forcing a reconnect");
        try { onStatus("retrying", "Connection went quiet - reconnecting..."); } catch (e) {}
        try { activeConnection.disconnect(); } catch (e) {}
        activeConnection = null;
        stopWatchdog();
        scheduleReconnect("no data was arriving");
      }
    }, WATCHDOG_CHECK_MS);
  }

  // ---- Reconnect scheduling ------------------------------------------------
  // Handles both "the connection dropped mid-stream" (watchdog/disconnected/
  // error above) and "the streamer isn't live yet / the first connect
  // attempt failed" (retry() below) with the same backing timer, so the game
  // can recover on its own - the whole point of "fully automated" - without
  // the host needing to notice and click Connect again.
  function cancelReconnectTimer() {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  }

  function scheduleReconnect(reasonPhrase, errorInfo) {
    if (!desiredConnected) return; // the host explicitly disconnected - stay off
    cancelReconnectTimer();
    reconnectAttempt++;
    var delayMs = Math.min(RECONNECT_BASE_DELAY_MS * reconnectAttempt, RECONNECT_MAX_DELAY_MS);

    // FAILSAFE: a rate-limit response means "you are asking too often, slow
    // down" - retrying on the same short linear schedule as a normal
    // dropped connection just re-triggers the same limit and can spin
    // forever (this was the actual cause of the incident this was written
    // after: a library bug turned 429s into opaque errors, and the old
    // schedule kept re-hitting the limit every few seconds). If the
    // provider told us how long to wait, honor that exactly; otherwise use
    // a much longer fixed cooldown for rate limits specifically.
    if (errorInfo && errorInfo.isRateLimit) {
      delayMs = errorInfo.retryAfterMs && errorInfo.retryAfterMs > 0
        ? errorInfo.retryAfterMs + 1000 // small buffer past what the server asked for
        : Math.max(RATE_LIMIT_DEFAULT_COOLDOWN_MS, delayMs);
    }

    try {
      onStatus("retrying", "Lost connection (" + reasonPhrase + "). Reconnecting in " + Math.round(delayMs / 1000) + "s...");
    } catch (e) {}
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      if (!desiredConnected) return;
      connect(lastUsername, lastSignApiKey, true);
    }, delayMs);
  }

  async function connect(username, signApiKey, isAutoReconnect) {
    // FAILSAFE: guard against overlapping connect() calls. Without this, a
    // host double-clicking Connect, or a manual click landing at the same
    // moment as a scheduled auto-reconnect, could open two TikTokLiveConnection
    // sockets at once - which burns twice the EulerStream sign requests for
    // one game and makes rate-limit errors (see below) more likely, not less.
    if (isConnecting) {
      console.warn("[TikTok connector] connect() called while a connection attempt was already in progress - ignoring the extra call.");
      return;
    }
    isConnecting = true;

    username = username || lastUsername || DEFAULT_TIKTOK_USERNAME;
    signApiKey = signApiKey || lastSignApiKey || DEFAULT_SIGN_API_KEY;
    lastUsername = username;
    lastSignApiKey = signApiKey;
    desiredConnected = true;
    cancelReconnectTimer();
    stopWatchdog();
    if (activeConnection) {
      try { activeConnection.disconnect(); } catch (e) {}
      activeConnection = null;
    }

    if (!signApiKey) {
      isConnecting = false;
      onStatus("error", "Missing Sign API Key. Get a free one at eulerstream.com and paste it in above, or set EULERSTREAM_SIGN_API_KEY in the environment.");
      return;
    }
    if (!username) {
      isConnecting = false;
      onStatus("error", "Missing TikTok username.");
      return;
    }
    try {
      onStatus("connecting", isAutoReconnect ? "Reconnecting to @" + username + " ..." : "Loading TikTok connector library...");
      await loadLibrary();
      if (SignConfig) SignConfig.apiKey = signApiKey; // covers versions that only read the global config
      onStatus("connecting", "Connecting to @" + username + " ...");
      var connection = new TikTokLiveConnection(username, { signApiKey: signApiKey });
      wireEvents(connection);
      var result = await connection.connect();
      activeConnection = connection;
      retryCount = 0;
      reconnectAttempt = 0;
      markActivity();
      startWatchdog();
      var roomId = result && result.roomId ? result.roomId : "";
      onStatus("connected", "Connected! Room ID: " + roomId);
    } catch (err) {
      var info = reportFailure("connect() failed for @" + username, err);
      onStatus("error", "Connection failed: " + info.message);
      if (isAutoReconnect) {
        scheduleReconnect("the reconnect attempt failed", info);
      } else if (info.isRateLimit) {
        // Don't burn the quick-retry budget hammering a rate limit three
        // times in a row - go straight to the slower cooldown schedule.
        scheduleReconnect("EulerStream rate-limited the request", info);
      } else {
        await retry(username, signApiKey);
      }
    } finally {
      isConnecting = false;
    }
  }

  async function retry(username, signApiKey) {
    if (retryCount >= MAX_INITIAL_RETRIES) {
      onStatus("error", "Gave up after " + MAX_INITIAL_RETRIES + " quick tries. Still watching in the background - it will connect on its own once @" + username + " goes live, or double-check the username/Sign API Key and click Connect again.");
      retryCount = 0;
      // Keep trying slowly forever in the background instead of giving up
      // for good - this is what lets the show "just start" the moment the
      // host goes live, with nobody needing to come back and click Connect.
      scheduleReconnect("the streamer may not be live yet");
      return;
    }
    retryCount++;
    var delayMs = 1500 * retryCount;
    onStatus("retrying", "Retry " + retryCount + " of " + MAX_INITIAL_RETRIES + " in " + (delayMs / 1000) + "s...");
    await new Promise(function (resolve) { setTimeout(resolve, delayMs); });
    await connect(username, signApiKey);
  }

  function disconnect() {
    desiredConnected = false;
    isConnecting = false;
    cancelReconnectTimer();
    stopWatchdog();
    try {
      if (activeConnection) activeConnection.disconnect();
    } catch (err) {
      console.error("[disconnect error - swallowed]", err);
    }
    activeConnection = null;
    onStatus("disconnected", "Disconnected.");
  }

  return { connect: connect, disconnect: disconnect };
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Plain health check. Point a free monitor (UptimeRobot, cron-job.org) at
// /healthz every 5-10 minutes while you are live so Render's free plan
// does not put the game (and the TikTok connection) to sleep.
app.get('/healthz', (req, res) => res.json({ ok: true, uptimeSeconds: process.uptime() }));

// No-cache headers so phones always fetch the newest files after a deploy.
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  },
}));

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

// ---------------------------------------------------------------------------
// CARD SYMBOL PACKS - the host picks one from Settings > Card Symbols. Each
// pack has 48 distinct emojis (and no picture is repeated in any other pack) so every difficulty, up to Level 5 "Chaos"
// (48 pairs / 96 cards), always has enough unique pictures. Switching packs
// starts a fresh game with the new set (same difficulty).
// ---------------------------------------------------------------------------
const EMOJI_PACKS = {
  kawaii: {
    label: 'Kawaii Stickers',
    // Picture cards (public/symbols/*.png). "img:name:hue" = that picture, colour-shifted by hue degrees,
    // so 12 drawn pictures give 48 clearly different ones for Chaos.
    emojis: [
      'img:heart:0', 'img:star:0', 'img:moon:0', 'img:drop:0', 'img:clover:0', 'img:cat:0',
      'img:gem:0', 'img:donut:0', 'img:cloud:0', 'img:frog:0', 'img:mushroom:0', 'img:ghost:0',
      'img:heart:120', 'img:star:120', 'img:moon:120', 'img:drop:120', 'img:clover:120', 'img:cat:120',
      'img:gem:120', 'img:donut:120', 'img:cloud:120', 'img:frog:120', 'img:mushroom:120', 'img:ghost:120',
      'img:heart:210', 'img:star:210', 'img:moon:210', 'img:drop:210', 'img:clover:210', 'img:cat:210',
      'img:gem:210', 'img:donut:210', 'img:cloud:210', 'img:frog:210', 'img:mushroom:210', 'img:ghost:210',
      'img:heart:300', 'img:star:300', 'img:moon:300', 'img:drop:300', 'img:clover:300', 'img:cat:300',
      'img:gem:300', 'img:donut:300', 'img:cloud:300', 'img:frog:300', 'img:mushroom:300', 'img:ghost:300',
    ],
  },
  classic: {
    label: 'Classic Mix',
    emojis: [
      '🌸', '🌷', '🌹', '🌻', '🌼', '🌺', '🍀', '🌵',
      '🌴', '🌳', '🍄', '🌾', '🍁', '🍂', '🌲', '💐',
      '🎀', '🧸', '🪁', '🎲', '🧩', '🎯', '🏆', '👑',
      '💎', '🎵', '🎸', '🎨', '🔑', '💡', '🔮', '🎩',
      '🧲', '🎺', '🥁', '🎹', '🎻', '📚', '⚽', '🏀',
      '🏈', '⚾', '🎾', '🏐', '🎱', '🏓', '🏸', '🥊',
    ],
  },
  animals: {
    label: 'Animals & Critters',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼',
      '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔',
      '🐧', '🐦', '🦆', '🦉', '🦇', '🐺', '🐗', '🐴',
      '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦂',
      '🐢', '🐍', '🦎', '🐙', '🦑', '🦀', '🐡', '🐠',
      '🐟', '🐬', '🐳', '🦈', '🐘', '🦒', '🦓', '🦘',
    ],
  },
  food: {
    label: 'Sweets & Treats',
    emojis: [
      '🍓', '🍒', '🍑', '🍉', '🍇', '🍈', '🍋', '🍊',
      '🍌', '🍍', '🥝', '🍅', '🥥', '🥑', '🍆', '🥕',
      '🌽', '🥦', '🥒', '🍕', '🍔', '🍟', '🌭', '🌮',
      '🌯', '🥪', '🍩', '🍪', '🎂', '🍰', '🧁', '🍮',
      '🍭', '🍬', '🍫', '🍿', '🍦', '🍧', '🍨', '🥧',
      '🍯', '🥞', '🧇', '🍗', '🍖', '🥓', '🥐', '🥨',
    ],
  },
  space: {
    label: 'Space & Sky',
    emojis: [
      '🌟', '⭐', '✨', '💫', '🌙', '🌛', '🌜', '🌚',
      '🌝', '🌞', '☀️', '🌤️', '⛅', '🌥️', '☁️', '🌦️',
      '🌧️', '⛈️', '🌩️', '🌨️', '❄️', '☃️', '⛄', '🌬️',
      '💨', '🌪️', '🌈', '☔', '💧', '💦', '🌊', '🪐',
      '🌍', '🌎', '🌏', '🌌', '🚀', '🛸', '🛰️', '👽',
      '👾', '🌠', '🔭', '⚡', '🌡️', '🌀', '🔥', '💥',
    ],
  },
  holiday: {
    label: 'Holiday & Celebration',
    emojis: [
      '🎄', '🎅', '🤶', '🎁', '🔔', '🦌', '🕯️', '🎆',
      '🎇', '🧨', '🎉', '🎊', '🎈', '🥳', '🎃', '👻',
      '💀', '☠️', '🧙', '🧛', '🧟', '🕷️', '🕸️', '🥚',
      '🎢', '🐣', '🎏', '🎐', '🧧', '🐉', '🏮', '💮',
      '💝', '❤️', '💕', '💖', '💘', '💗', '💓', '💞',
      '🎗️', '🎍', '🎎', '🎑', '🎋', '🎠', '🎡', '🎪',
    ],
  },
  faces: {
    label: 'Faces & Fun',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '🥹', '😅', '😂',
      '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍',
      '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝',
      '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥸', '🤩',
      '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️',
      '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤',
    ],
  },
  jobs: {
    label: 'Careers & Occupations',
    emojis: [
      '👨‍⚕️', '👩‍🌾', '👨‍🍳', '👩‍🎓', '👨‍🎤', '👩‍🏫', '👨‍🏭', '👩‍💻',
      '👨‍💼', '👩‍🔧', '👨‍🔬', '👩‍🎨', '👨‍🚒', '👩‍✈️', '👨‍🚀', '👩‍⚖️',
      '👮', '👷', '💂', '🕵️', '🩺', '💉', '🔨', '🔧',
      '🧰', '🚒', '🚑', '🚓', '✈️', '🚜', '🎬', '🎤',
      '🖥️', '⚖️', '🔬', '🧪', '📡', '📷', '📝', '✂️',
      '🧵', '🚌', '🚕', '🛠️', '🏗️', '📊', '💼', '🎓',
    ],
  },
};
const DEFAULT_EMOJI_PACK = 'kawaii';

// Host-adjustable timings shared by every screen (seconds): default, min, max.
const TIMING = {
  autoNext: { def: 10, min: 3, max: 300 },   // pause before the next game starts by itself
  mismatch: { def: 1.1, min: 0.5, max: 5 },  // how long a wrong pair stays face-up
  peek: { def: 3, min: 1, max: 10 },         // how long the Peek hint shows every card
};
const BOT_TICK_MS = 700;            // how often a test bot makes a guess
const BOT_CORRECT_CHANCE = 0.7;     // how often a bot picks a real pair

// Combo / streak bonus: extra points on top of the base 1 per pair, for
// consecutive matches (no miss in between) by the same viewer. Streak 1
// (a normal, non-combo match) earns no bonus; each additional match in a
// row adds 1 more point, up to this cap, so a very long streak is still
// exciting without letting one viewer run away with the whole round.
const STREAK_BONUS_CAP = 3;
function comboBonus(streak) {
  return Math.min(Math.max(streak - 1, 0), STREAK_BONUS_CAP);
}

// Fake viewers used by Test Mode "Auto-Play (Bots)".
const BOTS = [
  { uniqueId: 'bot-alpha', name: 'Bot Alpha', avatar: null },
  { uniqueId: 'bot-bravo', name: 'Bot Bravo', avatar: null },
  { uniqueId: 'bot-charlie', name: 'Bot Charlie', avatar: null },
  { uniqueId: 'bot-delta', name: 'Bot Delta', avatar: null },
];
const HOST_PLAYER = { uniqueId: 'host', name: 'Host', avatar: null };

function clampSeconds(value, cfg) {
  let n = parseFloat(value);
  if (Number.isNaN(n)) n = cfg.def;
  return Math.min(cfg.max, Math.max(cfg.min, n));
}

// ---------------------------------------------------------------------------
// GAME STATE (single shared match - everyone in chat plays together)
// ---------------------------------------------------------------------------
const state = {
  mode: 'offline',       // 'offline' | 'test' | 'live'
  emojiPack: DEFAULT_EMOJI_PACK,  // which EMOJI_PACKS set the board draws its pictures from
  level: 2,
  cols: LEVELS[2].cols,
  rows: LEVELS[2].rows,
  gameId: 0,              // goes up by 1 every time a new game starts
  startedAt: null,        // ms timestamp when this game started
  solvedAt: null,         // ms timestamp when the last pair was found
  cards: [],              // [{ id, emoji, flipped, matched }]
  locked: false,          // true while a mismatched pair is briefly shown
  scores: {},             // this game:  { uniqueId: { uniqueId, name, avatar, points } }
  allTimeScores: {},      // every game (saved to disk, see below)
  autoNext: false,        // start the next game by itself after each win
  autoNextDelaySeconds: TIMING.autoNext.def,
  mismatchSeconds: TIMING.mismatch.def,
  peekSeconds: TIMING.peek.def,
  botsOn: false,          // Test Mode bots are playing
  configured: false,      // true once a host has changed a setting since the server started
  rawEventCount: 0,
  lastEvent: { user: '', text: '', read: null, kind: null },
  tiktok: { connected: false, connecting: false, uniqueId: null, lastError: null, statusText: 'Not connected.' },
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

// ---------------------------------------------------------------------------
// ALL-TIME LEADERBOARD PERSISTENCE
// The all-time scores are saved to a JSON file so they survive the server
// restarting (Render's free plan puts the game to sleep after ~15 minutes
// without visitors and starts a fresh process on the next visit).
// HONEST CAVEAT: Render's free-plan disk is ephemeral - the file survives
// sleep/wake but is wiped by a brand-new deploy. For scores that survive
// deploys too, attach a Render Persistent Disk and set DATA_DIR (see
// render.yaml).
// ---------------------------------------------------------------------------
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ALLTIME_SCORES_FILE = path.join(DATA_DIR, 'alltime-scores.json');
const SAVE_DEBOUNCE_MS = 3000;
let saveScoresTimer = null;

function loadAllTimeScoresFromDisk() {
  try {
    if (fs.existsSync(ALLTIME_SCORES_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(ALLTIME_SCORES_FILE, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        const clean = {};
        Object.keys(parsed).forEach((id) => {
          const r = parsed[id];
          if (r && typeof r.points === 'number' && r.points > 0) {
            clean[id] = { uniqueId: id, name: String(r.name || id), avatar: r.avatar || null, points: r.points };
          }
        });
        console.log('[all-time scores] loaded ' + Object.keys(clean).length + ' player(s) from ' + ALLTIME_SCORES_FILE);
        return clean;
      }
    } else {
      console.log('[all-time scores] no existing file at ' + ALLTIME_SCORES_FILE + ' - starting fresh');
    }
  } catch (err) {
    console.warn('[all-time scores] could not load ' + ALLTIME_SCORES_FILE + ' - starting fresh: ' + (err && err.message ? err.message : err));
  }
  return {};
}

function saveAllTimeScoresNow() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(ALLTIME_SCORES_FILE, JSON.stringify(state.allTimeScores), 'utf8');
  } catch (err) {
    console.warn('[all-time scores] could not save to ' + ALLTIME_SCORES_FILE + ': ' + (err && err.message ? err.message : err));
  }
}

// Debounced: a burst of correct guesses causes one disk write shortly after.
function saveAllTimeScoresDebounced() {
  if (saveScoresTimer) clearTimeout(saveScoresTimer);
  saveScoresTimer = setTimeout(() => {
    saveScoresTimer = null;
    saveAllTimeScoresNow();
  }, SAVE_DEBOUNCE_MS);
}

// Flush on a normal shutdown / redeploy so the last few seconds are not lost.
function shutdownAndSave() {
  saveAllTimeScoresNow();
  process.exit(0);
}
process.on('SIGTERM', shutdownAndSave);
process.on('SIGINT', shutdownAndSave);

state.allTimeScores = loadAllTimeScoresFromDisk();

// ---------------------------------------------------------------------------
// GAMES
// ---------------------------------------------------------------------------
function newGame(level) {
  cancelAutoNext();
  const key = Number(level) in LEVELS ? Number(level) : 2;
  const cfg = LEVELS[key];
  state.level = key;
  state.cols = cfg.cols;
  state.rows = cfg.rows;
  const pairCount = cfg.cards / 2;
  const pack = EMOJI_PACKS[state.emojiPack] ? state.emojiPack : DEFAULT_EMOJI_PACK;
  state.emojiPack = pack;
  const pool = EMOJI_PACKS[pack].emojis;
  const emojis = shuffle(pool.slice(0, pairCount).concat(pool.slice(0, pairCount)));
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
    emojiPack: state.emojiPack,
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
    autoNextDelaySeconds: state.autoNextDelaySeconds,
    mismatchSeconds: state.mismatchSeconds,
    peekSeconds: state.peekSeconds,
    botsOn: state.botsOn,
    configured: state.configured,
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
    table[p.uniqueId] = { uniqueId: p.uniqueId, name: p.name || p.uniqueId, avatar: p.avatar || null, points: 0, streak: 0 };
  }
  const row = table[p.uniqueId];
  if (p.name) row.name = p.name;
  if (p.avatar) row.avatar = p.avatar;
  if (typeof row.streak !== 'number') row.streak = 0;
  return row;
}

// Combo / streak bonus: consecutive correct matches (no miss in between) by
// the SAME viewer earn extra points on top of the usual 1 per pair. Streak
// count and bonus size are only meaningful for the current round, so only
// the round leaderboard (withStreak) includes it - the all-time table is
// just a running point total.
function rankList(table, limit, opts) {
  const withStreak = !!(opts && opts.withStreak);
  return Object.values(table)
    .filter((r) => r.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, limit)
    .map((r) => {
      const row = { uniqueId: r.uniqueId, name: r.name, avatar: r.avatar, points: r.points };
      if (withStreak) row.streak = r.streak || 0;
      return row;
    });
}

function emitLeaderboards() {
  io.emit('leaderboard', {
    round: rankList(state.scores, 500, { withStreak: true }),
    allTime: rankList(state.allTimeScores, 1000),
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
  const ms = Math.round(state.autoNextDelaySeconds * 1000);
  io.emit('autoNextCountdown', { seconds: Math.round(ms / 1000) });
  autoNextTimer = setTimeout(() => {
    autoNextTimer = null;
    try { newGame(state.level); } catch (e) { console.error('[ERR] auto next game:', e); }
  }, ms);
}

// Tell everyone the game is over (a real win or a host "reveal all").
function finishGame() {
  saveAllTimeScoresNow();   // never lose the winning pair's points
  state.solvedAt = Date.now();
  state.locked = false;
  broadcast();
  emitLeaderboards();
  io.emit('gameOver', {
    leaderboard: rankList(state.scores, 500, { withStreak: true }),
    allTimeLeaderboard: rankList(state.allTimeScores, 1000),
    elapsedMs: state.solvedAt - state.startedAt,
    totalPairs: state.cards.length / 2,
    levelName: LEVELS[state.level].name,
  });
  if (state.autoNext) scheduleAutoNext();
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
      // Combo / streak bonus: this viewer's consecutive-match streak goes up
      // by one, and a longer streak earns extra points on top of the usual
      // 1 per pair (capped so one lucky run can't run away with the round).
      const roundRow = ensurePlayer(state.scores, player);
      roundRow.streak = (roundRow.streak || 0) + 1;
      const bonus = comboBonus(roundRow.streak);
      const gained = 1 + bonus;
      roundRow.points += gained;
      ensurePlayer(state.allTimeScores, player).points += gained;
      saveAllTimeScoresDebounced();
      if (state.cards.every((c) => c.matched)) {
        finishGame();
      } else {
        broadcast();
        emitLeaderboards();
      }
      return { kind: 'match', streak: roundRow.streak, bonus, gained };
    }

    // Wrong pair: this viewer's combo streak resets (their score is untouched).
    ensurePlayer(state.scores, player).streak = 0;

    state.locked = true;
    broadcast();
    emitLeaderboards();   // streak badge clears right away
    const gameAtFlip = state.gameId;
    setTimeout(() => {
      try {
        if (state.gameId !== gameAtFlip) return; // a new game started meanwhile
        if (!a.matched) a.flipped = false;       // (a host reveal may have matched them)
        if (!b.matched) b.flipped = false;
        state.locked = false;
        broadcast();
      } catch (e) {
        console.error('[ERR] unflip timeout handler:', e);
      }
    }, Math.round(state.mismatchSeconds * 1000));
    return { kind: 'miss' };
  } catch (e) {
    console.error('[ERR] attemptFlip:', e);
    return { kind: 'invalid' };
  }
}

// ---------------------------------------------------------------------------
// HOST HINTS & REVEALS - host-only tools, they never award points.
// ---------------------------------------------------------------------------
// Groups of two still-hidden cards that share a picture.
function hiddenPairs() {
  const byEmoji = {};
  state.cards.forEach((c) => {
    if (!c.matched && !c.flipped) (byEmoji[c.emoji] = byEmoji[c.emoji] || []).push(c);
  });
  return Object.values(byEmoji).filter((g) => g.length >= 2);
}

function revealPairs(count) {
  if (state.solvedAt) return 0;
  const chosen = shuffle(hiddenPairs()).slice(0, count);
  chosen.forEach((g) => {
    g[0].matched = g[1].matched = true;
    g[0].flipped = g[1].flipped = true;
  });
  if (!chosen.length) return 0;
  if (state.cards.every((c) => c.matched)) finishGame();
  else broadcast();
  io.emit('notice', { text: 'Host revealed ' + chosen.length + (chosen.length === 1 ? ' pair' : ' pairs') });
  return chosen.length;
}

function revealBoard() {
  if (state.solvedAt) return;
  state.cards.forEach((c) => { c.matched = true; c.flipped = true; });
  finishGame();
  io.emit('notice', { text: 'Host revealed the whole board' });
}

// Peek: every face-down card is shown for a few seconds, then hides again.
function peekBoard() {
  if (state.solvedAt) return;
  const cards = state.cards.filter((c) => !c.matched && !c.flipped).map((c) => ({ id: c.id, emoji: c.emoji }));
  if (!cards.length) return;
  io.emit('peek', { ms: Math.round(state.peekSeconds * 1000), cards });
}

// ---------------------------------------------------------------------------
// CHAT PARSING
// ---------------------------------------------------------------------------
// Full-width digits (some phone keyboards) become normal digits.
function normalizeText(text) {
  return String(text == null ? '' : text).replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
}

// "1 5", "1,5", "1-5", "1:5" and "card 1 and 5" all read as cards 1 and 5.
function parseTwoNumbers(text) {
  const matches = normalizeText(text).match(/\d+/g);
  if (!matches || matches.length < 2) return null;
  const a = parseInt(matches[0], 10);
  const b = parseInt(matches[1], 10);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return [a, b];
}

// player = { uniqueId, name, avatar }
function handleIncomingComment(player, text, { countsAsRawEvent = true } = {}) {
  try {
    text = text == null ? '' : String(text);
    if (player.avatar) avatarCache[player.uniqueId] = player.avatar;
    else player.avatar = avatarCache[player.uniqueId] || null;

    if (countsAsRawEvent) state.rawEventCount += 1;
    const pair = parseTwoNumbers(text);
    const result = pair ? attemptFlip(pair[0], pair[1], player) : { kind: 'format' };
    state.lastEvent = {
      user: player.name,
      text: text.slice(0, 80),
      read: pair ? pair[0] + ' & ' + pair[1] : null,
      kind: result.kind,
    };
    io.emit('guessResult', {
      uniqueId: player.uniqueId,
      name: player.name,
      avatar: player.avatar,
      text: text.slice(0, 60),
      kind: result.kind,
      a: pair ? pair[0] : null,
      b: pair ? pair[1] : null,
      streak: result.streak || 0,
      bonus: result.bonus || 0,
      gained: result.gained || 0,
    });
    broadcast();
  } catch (e) {
    console.error('[ERR] handleIncomingComment:', e);
  }
}

// ---------------------------------------------------------------------------
// TEST MODE BOTS - fake viewers that keep playing until the board is done,
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
    const pairs = hiddenPairs();
    if (pairs.length) {
      const pick = pairs[Math.floor(Math.random() * pairs.length)];
      a = pick[0].id;
      b = pick[1].id;
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

function setMode(mode) {
  if (!['offline', 'test', 'live'].includes(mode)) return;
  if (mode !== 'test' && state.botsOn) setBots(false);
  state.mode = mode;
  broadcast();
}

// Card Symbols picker (Settings): swap which emoji pack the board draws
// from, then start a fresh game at the current difficulty so every card
// shows the new set right away.
function setEmojiPack(pack) {
  if (!EMOJI_PACKS[pack] || pack === state.emojiPack) return;
  state.emojiPack = pack;
  newGame(state.level);
}

// ---------------------------------------------------------------------------
// TIKTOK LIVE (Live Mode) - the connector above does the heavy lifting
// (retry, watchdog, rate-limit backoff); this just feeds it into the game.
// ---------------------------------------------------------------------------
let currentTikTokUser = null;
let lastConnectorError = '';   // kept on screen while the connector retries, so the real reason is visible

function setTikTokStatus(status, message) {
  const t = state.tiktok;
  t.statusText = message || '';
  if (status === 'connected') {
    lastConnectorError = '';
    t.connected = true; t.connecting = false; t.lastError = null; t.uniqueId = currentTikTokUser;
  } else if (status === 'connecting' || status === 'retrying') {
    if (status === 'retrying' && lastConnectorError) t.statusText += '  [Last problem: ' + lastConnectorError + ']';
    t.connected = false; t.connecting = true; t.lastError = null;
  } else if (status === 'error') {
    lastConnectorError = String(message || '').slice(0, 220);
    t.connected = false; t.connecting = false; t.lastError = message || 'Connection error.';
  } else {
    if (status === 'disconnected' && /^Disconnected\.$/.test(message || '')) lastConnectorError = '';
    t.connected = false; t.connecting = false; t.lastError = null;
  }
  broadcast();
}

const tiktokConnector = createTikTokConnector(
  function onChat(fields) {
    // Viewer comments only count in Live mode (so Test/Offline stay private),
    // but the connection stays up so switching back to Live is instant.
    if (state.mode !== 'live') {
      state.rawEventCount += 1;
      return;
    }
    handleIncomingComment(
      { uniqueId: fields.uniqueId, name: fields.nickname, avatar: fields.avatarUrl },
      fields.text
    );
  },
  setTikTokStatus,
  function onRawEvent() { /* raw events are logged inside the connector when CHAT_DEBUG_LOG=true */ }
);

// ---------------------------------------------------------------------------
// SOCKET.IO - realtime bridge to the browser (overlay + host controls)
// ---------------------------------------------------------------------------
// Wraps a handler so an error is logged, never crashes the server. `host`
// handlers also remember that a host has already configured this server run.
function safe(fn, isHostAction) {
  return function (payload) {
    try {
      if (isHostAction) state.configured = true;
      fn(payload || {});
    } catch (err) {
      console.error('[handler error - swallowed, server kept running]', err);
    }
  };
}

io.on('connection', (socket) => {
  socket.emit('state', publicState());
  socket.emit('leaderboard', {
    round: rankList(state.scores, 500, { withStreak: true }),
    allTime: rankList(state.allTimeScores, 1000),
  });
  // Lets the page skip asking for the Sign API Key when the server has one.
  socket.emit('liveConfig', {
    hasDefaultSignApiKey: !!DEFAULT_SIGN_API_KEY,
    defaultUsername: DEFAULT_TIKTOK_USERNAME || '',
  });
  // Card Symbols picker: static list of packs, sent once per connection.
  socket.emit('emojiPacks', Object.keys(EMOJI_PACKS).map((id) => ({ id, label: EMOJI_PACKS[id].label })));

  socket.on('host:newGame', safe((p) => newGame(p.level), true));
  socket.on('host:setMode', safe((p) => setMode(p.mode), true));
  socket.on('host:setEmojiPack', safe((p) => setEmojiPack(String(p.pack || '')), true));

  socket.on('host:setAutoNext', safe((p) => {
    state.autoNext = !!p.enabled;
    if (!state.autoNext) cancelAutoNext();
    else if (state.solvedAt && !autoNextTimer) scheduleAutoNext();
    broadcast();
  }, true));

  socket.on('host:setBots', safe((p) => setBots(!!p.enabled && state.mode === 'test'), true));

  // Shared timings: any of these can be sent, each is clamped to a sane range.
  socket.on('host:setTiming', safe((p) => {
    if (p.autoNextDelaySeconds !== undefined) state.autoNextDelaySeconds = clampSeconds(p.autoNextDelaySeconds, TIMING.autoNext);
    if (p.mismatchSeconds !== undefined) state.mismatchSeconds = clampSeconds(p.mismatchSeconds, TIMING.mismatch);
    if (p.peekSeconds !== undefined) state.peekSeconds = clampSeconds(p.peekSeconds, TIMING.peek);
    broadcast();
  }, true));

  // Hints & reveals (no points for anyone).
  socket.on('host:peek', safe(() => peekBoard(), true));
  socket.on('host:revealPair', safe((p) => { revealPairs(Math.max(1, Math.min(10, parseInt(p.count, 10) || 1))); }, true));
  socket.on('host:revealBoard', safe(() => revealBoard(), true));

  // "Save & Apply as Default" from the browser: applied ONCE, and only while
  // nobody has configured this server run yet (e.g. right after Render woke
  // it up). This way opening the page on a second device mid-show can never
  // reset the game that is running.
  socket.on('host:applyDefaults', safe((p) => {
    if (state.configured) return;
    state.configured = true;
    const t = state.tiktok;
    const tiktokActive = t.connected || t.connecting;
    if (!tiktokActive && ['offline', 'test', 'live'].includes(p.mode)) setMode(p.mode);
    if (typeof p.autoNext === 'boolean') state.autoNext = p.autoNext;
    if (p.autoNextDelaySeconds !== undefined) state.autoNextDelaySeconds = clampSeconds(p.autoNextDelaySeconds, TIMING.autoNext);
    if (p.mismatchSeconds !== undefined) state.mismatchSeconds = clampSeconds(p.mismatchSeconds, TIMING.mismatch);
    if (p.peekSeconds !== undefined) state.peekSeconds = clampSeconds(p.peekSeconds, TIMING.peek);
    if (EMOJI_PACKS[p.emojiPack]) state.emojiPack = p.emojiPack;
    if (Number(p.level) in LEVELS && Number(p.level) !== state.level) newGame(p.level);
    if (typeof p.bots === 'boolean') setBots(p.bots && state.mode === 'test');
    broadcast();
  }));

  // Manual chat from the Host console / Offline box / Test box (any mode).
  socket.on('host:manualInput', safe((p) => {
    const name = String(p.user || 'Host').slice(0, 30);
    const player = name === 'Host' ? { ...HOST_PLAYER } : { uniqueId: 'named-' + name.toLowerCase(), name, avatar: null };
    handleIncomingComment(player, p.text);
  }));

  // Test Mode: a plausible fake viewer comment, picking only cards that are
  // still face-down so every click does something.
  socket.on('test:simulate', safe(() => {
    const fake = BOTS[Math.floor(Math.random() * BOTS.length)];
    const open = state.cards.filter((c) => !c.matched && !c.flipped).map((c) => c.id);
    if (open.length < 2) return;
    shuffle(open);
    const [a, b] = open;
    const text = Math.random() > 0.5 ? `${a} ${b}` : `${a}, ${b}`;
    handleIncomingComment({ ...fake }, text);
  }));

  socket.on('tiktok:connect', safe((p) => {
    const username = String(p.uniqueId || '').replace('@', '').trim() || DEFAULT_TIKTOK_USERNAME;
    const apiKey = String(p.apiKey || '').trim() || DEFAULT_SIGN_API_KEY;
    currentTikTokUser = username;
    if (state.mode !== 'live') setMode('live');
    tiktokConnector.connect(username, apiKey);
  }, true));

  socket.on('tiktok:disconnect', safe(() => tiktokConnector.disconnect(), true));
});

// Boot with a default game so the screen is never empty.
newGame(2);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`TikTok Live Memory Match running on port ${PORT}`);

  // If both TIKTOK_USERNAME and EULERSTREAM_SIGN_API_KEY are set (a local
  // .env file, or Render's Environment tab), connect to TikTok LIVE by
  // itself the moment the server boots - including right after Render wakes
  // the free plan up - instead of waiting for someone to click Connect.
  if (DEFAULT_TIKTOK_USERNAME && DEFAULT_SIGN_API_KEY) {
    console.log('[startup] TIKTOK_USERNAME and EULERSTREAM_SIGN_API_KEY are set - connecting automatically...');
    currentTikTokUser = DEFAULT_TIKTOK_USERNAME;
    state.mode = 'live';
    tiktokConnector.connect(DEFAULT_TIKTOK_USERNAME, DEFAULT_SIGN_API_KEY);
  }
});
