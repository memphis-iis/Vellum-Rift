/**
 * Collapsible shell panels for standalone WebGL (nav + chat tabs).
 * H toggles all chrome (#318); key shared with the dashboard embed.
 */
(function () {
  var STORAGE_NAV = "vellum.shell.navCollapsed";
  var STORAGE_CHAT = "vellum.shell.chatCollapsed";
  var STORAGE_CHROME_HIDDEN = "vellum.chromeHidden";

  function $(id) {
    return document.getElementById(id);
  }

  function readBool(key, fallback) {
    try {
      var v = sessionStorage.getItem(key);
      if (v === "1") return true;
      if (v === "0") return false;
    } catch (e) {
      /* ignore */
    }
    return fallback;
  }

  function writeBool(key, value) {
    try {
      sessionStorage.setItem(key, value ? "1" : "0");
    } catch (e) {
      /* ignore */
    }
  }

  function setBadge(el, count) {
    if (!el) return;
    var badge = el.querySelector(".vellum-shell-tab__badge");
    if (!count) {
      if (badge) badge.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "vellum-shell-tab__badge";
      badge.setAttribute("aria-hidden", "true");
      el.appendChild(badge);
    }
    badge.textContent = count > 9 ? "9+" : String(count);
  }

  function applyNav(collapsed) {
    var panel = $("vellum-nav");
    var tab = $("vellum-nav-tab");
    if (panel) panel.hidden = collapsed;
    if (tab) tab.hidden = !collapsed;
    writeBool(STORAGE_NAV, collapsed);
    document.body.classList.toggle("vellum-nav-collapsed", collapsed);
  }

  function applyChat(collapsed) {
    var panel = $("vellum-chat");
    var tab = $("vellum-chat-tab");
    if (panel) panel.hidden = collapsed;
    if (tab) tab.hidden = !collapsed;
    writeBool(STORAGE_CHAT, collapsed);
    document.body.classList.toggle("vellum-chat-collapsed", collapsed);
    if (!collapsed && window.VellumShellChat && window.VellumShellChat.clearUnread) {
      window.VellumShellChat.clearUnread();
    }
  }

  function applyChromeHidden(hidden) {
    writeBool(STORAGE_CHROME_HIDDEN, hidden);
    document.body.classList.toggle("vellum-chrome-hidden", hidden);
  }

  function isTypingTarget(el) {
    if (!el || !el.tagName) return false;
    var tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
  }

  function onHideChromeKey(e) {
    if (e.key !== "h" && e.key !== "H") return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (isTypingTarget(e.target)) return;
    if (document.body.classList.contains("vellum-embed")) {
      // Dashboard iframe: parent owns the chrome, so forward the toggle.
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "vellum:toggle-chrome" }, "*");
      }
      return;
    }
    applyChromeHidden(!document.body.classList.contains("vellum-chrome-hidden"));
  }

  function bind() {
    var navCollapse = $("vellum-nav-collapse");
    var navTab = $("vellum-nav-tab");
    var chatCollapse = $("vellum-chat-collapse");
    var chatTab = $("vellum-chat-tab");

    applyNav(readBool(STORAGE_NAV, false));
    applyChat(readBool(STORAGE_CHAT, false));
    applyChromeHidden(readBool(STORAGE_CHROME_HIDDEN, false));
    document.addEventListener("keydown", onHideChromeKey);

    if (navCollapse) {
      navCollapse.addEventListener("click", function () {
        applyNav(true);
      });
    }
    if (navTab) {
      navTab.addEventListener("click", function () {
        applyNav(false);
      });
    }
    if (chatCollapse) {
      chatCollapse.addEventListener("click", function () {
        applyChat(true);
      });
    }
    if (chatTab) {
      chatTab.addEventListener("click", function () {
        applyChat(false);
      });
    }

    window.VellumShellChrome = {
      setChatUnread: function (count) {
        setBadge(chatTab, count);
        if (readBool(STORAGE_NAV, false)) setBadge(navTab, count);
      },
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
