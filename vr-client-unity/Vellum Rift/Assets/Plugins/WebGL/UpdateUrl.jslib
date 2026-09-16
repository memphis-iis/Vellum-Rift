// Unity WebGL plugin:
//  1. Puts the created session id into the page URL for shareable joins.
//  2. Bluekey portal popup → postMessage → SendMessage(OnBluekeyTokenReceived).
//  3. Dashboard auth handoff: notify opener when ready; accept
//     { type: "vellum-rift-auth-handoff", accessToken, email } with origin checks.
//  4. Queue early handoffs until Unity registers the target (#247).
mergeInto(LibraryManager.library, {
  UpdateUrlWithSession: function (sessionIdPtr) {
    var sessionId = UTF8ToString(sessionIdPtr);
    try {
      var url = new URL(window.location.href);
      url.searchParams.set("session", sessionId);
      window.history.replaceState({}, "", url.toString());
    } catch (e) {
      console.warn("[VellumRift] Failed to update URL with session id: " + e);
    }
  },

  RegisterAuthHandoffTarget: function (gameObjectNamePtr) {
    var gameObjectName = UTF8ToString(gameObjectNamePtr);
    window._vellumAuthGameObject = gameObjectName;

    if (!window._vellumAuthHandoffInstalled) {
      window._vellumAuthHandoffInstalled = true;
      window._vellumAuthDelivered = false;
      window._vellumPendingAuth = window._vellumPendingAuth || null;

      window._vellumIsTrustedHandoffOrigin = function (origin) {
        if (!origin) return false;
        if (origin === window.location.origin) return true;
        try {
          if (window.opener && window.opener.location && origin === window.opener.location.origin)
            return true;
        } catch (e) {
          /* cross-origin opener */
        }
        var allow = window.VELLUM_AUTH_HANDOFF_ORIGINS || "";
        if (typeof allow === "string" && allow.length) {
          var parts = allow.split(",");
          for (var i = 0; i < parts.length; i++) {
            if (parts[i].trim() === origin) return true;
          }
        }
        try {
          var o = new URL(origin);
          var here = new URL(window.location.href);
          if (o.hostname === here.hostname) return true;
          if (o.hostname.endsWith(".memphis.edu") && here.hostname.endsWith(".memphis.edu"))
            return true;
        } catch (e2) { /* ignore */ }
        return false;
      };

      window._vellumAckAuthHandoff = function () {
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(
              { type: "vellum-rift-auth-handoff-ack" },
              "*"
            );
          }
        } catch (e) { /* ignore */ }
      };

      window._vellumDeliverAuthPayload = function (payload) {
        if (window._vellumAuthDelivered) return;
        var target = window._vellumAuthGameObject;
        if (!target) {
          window._vellumPendingAuth = payload;
          console.log("[VellumRift] Auth handoff queued until Unity registers");
          return;
        }
        var json = JSON.stringify(payload);
        var sent = false;
        try {
          if (typeof unityInstance !== "undefined" && unityInstance && unityInstance.SendMessage) {
            unityInstance.SendMessage(target, "OnBluekeyTokenReceived", json);
            sent = true;
          }
        } catch (e) { /* try next */ }
        if (!sent) {
          try {
            if (typeof Module !== "undefined" && Module.SendMessage) {
              Module.SendMessage(target, "OnBluekeyTokenReceived", json);
              sent = true;
            }
          } catch (e2) { /* try next */ }
        }
        if (!sent) {
          window._vellumPendingAuth = payload;
          console.warn("[VellumRift] Could not SendMessage auth payload into Unity yet — queued");
          return;
        }
        window._vellumAuthDelivered = true;
        window._vellumPendingAuth = null;
        window._vellumAckAuthHandoff();
        console.log("[VellumRift] Auth token delivered to Unity");
      };

      window.addEventListener("message", function (event) {
        try {
          var data = event.data;
          if (!data || typeof data !== "object") return;

          if (data.type === "vellum-rift-auth-handoff") {
            if (window._vellumAuthDelivered) return;
            if (!window._vellumIsTrustedHandoffOrigin(event.origin)) {
              console.warn("[VellumRift] Ignoring auth handoff from origin " + event.origin);
              return;
            }
            if (!data.accessToken) {
              console.warn("[VellumRift] Auth handoff missing accessToken");
              return;
            }
            window._vellumDeliverAuthPayload({
              accessToken: data.accessToken,
              email: data.email || ""
            });
            return;
          }

          if (data.type === "bluekey-login-success") {
            if (!data.accessToken) {
              console.warn("[VellumRift] Bluekey popup message missing accessToken");
              return;
            }
            window._vellumDeliverAuthPayload({
              accessToken: data.accessToken,
              email: data.email || "",
              accountId: data.accountId || ""
            });
          }
        } catch (e) {
          console.warn("[VellumRift] Auth message handling error: " + e);
        }
      });

      // Same-tab / opener-less: pick up token from sessionStorage (#254).
      try {
        if (!window._vellumAuthDelivered && !window._vellumPendingAuth) {
          var stored = sessionStorage.getItem("vellum_rift_access_token");
          if (stored && stored !== "local-dev") {
            window._vellumDeliverAuthPayload({
              accessToken: stored,
              email: sessionStorage.getItem("vellum_rift_user_email") || ""
            });
          }
        }
      } catch (e3) { /* ignore */ }

      try {
        var bc = new BroadcastChannel("vellum-rift-auth");
        bc.onmessage = function (ev) {
          var d = ev && ev.data;
          if (!d || typeof d !== "object") return;
          if (d.type !== "vellum-rift-auth-handoff" || !d.accessToken) return;
          if (window._vellumAuthDelivered) return;
          window._vellumDeliverAuthPayload({
            accessToken: d.accessToken,
            email: d.email || ""
          });
        };
      } catch (e4) { /* ignore */ }
    }

    // Flush anything queued before Unity registered (#247).
    if (window._vellumPendingAuth && !window._vellumAuthDelivered) {
      var pending = window._vellumPendingAuth;
      window._vellumPendingAuth = null;
      window._vellumDeliverAuthPayload(pending);
    }

    // Tell the dashboard opener we can receive a handoff.
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(
          { type: "vellum-rift-webgl-ready" },
          "*"
        );
      }
    } catch (e) {
      console.warn("[VellumRift] Failed to notify opener of WebGL ready: " + e);
    }
  },

  OpenBluekeyPopup: function (portalUrlPtr, gameObjectNamePtr) {
    var portalUrl = UTF8ToString(portalUrlPtr);
    var gameObjectName = UTF8ToString(gameObjectNamePtr);
    window._vellumAuthGameObject = gameObjectName;

    var popup = window.open(portalUrl, "bluekeyLogin", "width=520,height=700");
    if (!popup) {
      console.warn("[VellumRift] Bluekey popup blocked. Allow popups for this site and retry.");
    }
  },

  ReloadPage: function () {
    window.location.reload();
  },

  NavigateToUrl: function (urlPtr) {
    var url = UTF8ToString(urlPtr);
    try {
      window.location.href = url;
    } catch (e) {
      console.warn("[VellumRift] NavigateToUrl failed: " + e);
    }
  },
});
