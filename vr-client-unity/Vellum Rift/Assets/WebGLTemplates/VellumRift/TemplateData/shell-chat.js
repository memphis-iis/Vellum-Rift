/**
 * Standalone WebGL shell chat (#159). Unity calls NotifyShellSession after join.
 */
(function () {
  var POLL_MS = 2000;
  var state = null;
  var timer = null;
  var seenCount = 0;
  var unread = 0;

  function $(id) {
    return document.getElementById(id);
  }

  function formatTime(iso) {
    var t = Date.parse(iso);
    if (!Number.isFinite(t)) return "";
    return new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function headers(json) {
    var h = { Accept: "application/json" };
    if (json) h["Content-Type"] = "application/json";
    if (state && state.accessToken) h.Authorization = "Bearer " + state.accessToken;
    return h;
  }

  function apiBase() {
    return (state && state.backendUrl) || "";
  }

  function isChatCollapsed() {
    return document.body.classList.contains("vellum-chat-collapsed");
  }

  function setUnread(count) {
    unread = count;
    if (window.VellumShellChrome && window.VellumShellChrome.setChatUnread) {
      window.VellumShellChrome.setChatUnread(count);
    }
  }

  function clearUnread() {
    seenCount = state ? state._messageCount || seenCount : seenCount;
    setUnread(0);
  }

  function setReady(ready) {
    var input = $("vellum-chat-input");
    var send = $("vellum-chat-send");
    if (input) input.disabled = !ready;
    if (send) send.disabled = !ready;
  }

  function renderMessages(messages) {
    var log = $("vellum-chat-log");
    if (!log || !state) return;

    var mine = state.playerId;
    var html = "";
    if (!messages || !messages.length) {
      html = '<p class="vellum-chat-empty">No messages yet. Say hello to the room.</p>';
    } else {
      for (var i = 0; i < messages.length; i++) {
        var m = messages[i];
        var isMine = m.playerId === mine;
        var meta = formatTime(m.sentAt);
        if (!isMine && !m.system && m.displayName) meta += " · " + m.displayName;
        var bubbleClass = "vellum-chat-bubble";
        if (isMine) bubbleClass += " vellum-chat-bubble--mine";
        if (m.system) bubbleClass += " vellum-chat-bubble--system";
        var wrapClass = "vellum-chat-bubble-wrap";
        if (isMine) wrapClass += " vellum-chat-bubble-wrap--mine";
        html +=
          '<div class="' +
          wrapClass +
          '">' +
          '<span class="vellum-chat-bubble-meta">' +
          meta +
          "</span>" +
          '<div class="' +
          bubbleClass +
          '">' +
          escapeHtml(m.text) +
          "</div></div>";
      }
    }
    var atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 48;
    log.innerHTML = html;
    if (atBottom) log.scrollTop = log.scrollHeight;

    if (isChatCollapsed()) {
      var newUnread = 0;
      for (var j = seenCount; j < messages.length; j++) {
        if (messages[j].playerId !== mine) newUnread++;
      }
      if (newUnread > 0) setUnread(newUnread);
    } else {
      seenCount = messages.length;
      setUnread(0);
    }
    state._messageCount = messages.length;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function poll() {
    if (!state || !state.sessionId) return;
    fetch(apiBase() + "/api/game-state/" + encodeURIComponent(state.sessionId) + "/chat", {
      headers: headers(false),
      credentials: "omit",
    })
      .then(function (res) {
        if (!res.ok) throw new Error("chat poll failed");
        return res.json();
      })
      .then(function (data) {
        renderMessages(data.messages || []);
      })
      .catch(function () {
        /* best-effort */
      });
  }

  function sendMessage(text) {
    if (!state || !state.sessionId || !state.playerId) return Promise.resolve();
    return fetch(
      apiBase() + "/api/game-state/" + encodeURIComponent(state.sessionId) + "/chat",
      {
        method: "POST",
        headers: headers(true),
        credentials: "omit",
        body: JSON.stringify({ playerId: state.playerId, text: text }),
      }
    )
      .then(function (res) {
        if (!res.ok) throw new Error("send failed");
        return res.json();
      })
      .then(function () {
        poll();
      });
  }

  function bindForm() {
    var form = $("vellum-chat-form");
    var input = $("vellum-chat-input");
    if (!form || !input) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = input.value.trim();
      if (!text) return;
      input.value = "";
      setReady(false);
      sendMessage(text)
        .catch(function (err) {
          console.warn("[VellumRift] chat send failed", err);
        })
        .finally(function () {
          setReady(true);
          input.focus();
        });
    });
  }

  function onSession(detail) {
    state = detail || window._vellumShellSession;
    if (!state) return;
    setReady(true);
    seenCount = 0;
    setUnread(0);
    if (timer) window.clearInterval(timer);
    poll();
    timer = window.setInterval(poll, POLL_MS);
  }

  window.addEventListener("vellum-shell-session", function (e) {
    onSession(e.detail);
  });

  window.VellumShellChat = { clearUnread: clearUnread };

  if (window._vellumShellSession) onSession(window._vellumShellSession);

  bindForm();
})();
