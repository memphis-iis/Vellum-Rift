/**
 * Standalone WebGL shell pins list (#163).
 */
(function () {
  var POLL_MS = 3000;
  var state = null;
  var timer = null;

  function $(id) {
    return document.getElementById(id);
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

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderPins(artifacts) {
    var list = $("vellum-pins-list");
    if (!list || !state) return;
    var mine = state.playerId;
    var pins = (artifacts || []).filter(function (a) {
      return !a.artifactType || a.artifactType === "waypoint";
    });
    if (!pins.length) {
      list.innerHTML = '<p class="vellum-pins-empty">No pins yet. Press F to place one.</p>';
      return;
    }
    var html = "";
    for (var i = 0; i < pins.length; i++) {
      var p = pins[i];
      var label = (p.label && String(p.label).trim()) || "Pin";
      var owned = mine && p.createdBy === mine;
      html +=
        '<div class="vellum-pins-row" data-id="' +
        escapeHtml(p.id) +
        '">' +
        '<span class="vellum-pins-label">' +
        escapeHtml(label) +
        "</span>";
      if (owned) {
        html +=
          '<span class="vellum-pins-actions">' +
          '<button type="button" class="vellum-pins-btn" data-action="rename" data-id="' +
          escapeHtml(p.id) +
          '" data-label="' +
          escapeHtml(label) +
          '">Rename</button>' +
          '<button type="button" class="vellum-pins-btn" data-action="delete" data-id="' +
          escapeHtml(p.id) +
          '">Delete</button>' +
          "</span>";
      }
      html += "</div>";
    }
    list.innerHTML = html;
  }

  function poll() {
    if (!state || !state.sessionId) return;
    fetch(apiBase() + "/api/game-state/" + encodeURIComponent(state.sessionId) + "/artifacts", {
      headers: headers(false),
      credentials: "omit",
    })
      .then(function (res) {
        if (!res.ok) throw new Error("pins poll failed");
        return res.json();
      })
      .then(renderPins)
      .catch(function () {
        /* best-effort */
      });
  }

  function patchLabel(id, label) {
    return fetch(
      apiBase() +
        "/api/game-state/" +
        encodeURIComponent(state.sessionId) +
        "/artifacts/" +
        encodeURIComponent(id),
      {
        method: "PATCH",
        headers: headers(true),
        credentials: "omit",
        body: JSON.stringify({ label: label }),
      }
    );
  }

  function deletePin(id) {
    return fetch(
      apiBase() +
        "/api/game-state/" +
        encodeURIComponent(state.sessionId) +
        "/artifacts/" +
        encodeURIComponent(id),
      {
        method: "DELETE",
        headers: headers(false),
        credentials: "omit",
      }
    );
  }

  function bindList() {
    var list = $("vellum-pins-list");
    if (!list) return;
    list.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-action]");
      if (!btn || !state) return;
      var action = btn.getAttribute("data-action");
      var id = btn.getAttribute("data-id");
      if (!id) return;
      if (action === "delete") {
        deletePin(id).then(poll).catch(function (err) {
          console.warn("[VellumRift] pin delete failed", err);
        });
        return;
      }
      if (action === "rename") {
        var current = btn.getAttribute("data-label") || "";
        var next = window.prompt("Rename pin", current);
        if (next === null) return;
        var label = String(next).trim() || "Pin";
        patchLabel(id, label).then(poll).catch(function (err) {
          console.warn("[VellumRift] pin rename failed", err);
        });
      }
    });
  }

  function onSession(detail) {
    state = detail || window._vellumShellSession;
    if (!state) return;
    if (timer) window.clearInterval(timer);
    poll();
    timer = window.setInterval(poll, POLL_MS);
  }

  window.addEventListener("vellum-shell-session", function (e) {
    onSession(e.detail);
  });

  if (window._vellumShellSession) onSession(window._vellumShellSession);

  bindList();
})();
