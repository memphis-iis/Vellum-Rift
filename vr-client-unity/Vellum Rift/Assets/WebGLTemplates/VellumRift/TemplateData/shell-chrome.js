/**
 * Collapsible shell panels for standalone WebGL (nav + chat tabs).
 */
(function () {
  var STORAGE_NAV = "vellum.shell.navCollapsed";
  var STORAGE_CHAT = "vellum.shell.chatCollapsed";

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

  function bind() {
    var navCollapse = $("vellum-nav-collapse");
    var navTab = $("vellum-nav-tab");
    var chatCollapse = $("vellum-chat-collapse");
    var chatTab = $("vellum-chat-tab");

    applyNav(readBool(STORAGE_NAV, false));
    applyChat(readBool(STORAGE_CHAT, false));

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
