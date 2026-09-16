mergeInto(LibraryManager.library, {
  RegisterPlayerHandoffTarget: function (gameObjectNamePtr) {
    var gameObjectName = UTF8ToString(gameObjectNamePtr);
    window._vellumPlayerGameObject = gameObjectName;

    if (!window._vellumPlayerHandoffInstalled) {
      window._vellumPlayerHandoffInstalled = true;

      window.addEventListener("message", function (event) {
        try {
          var data = event.data;
          if (!data || typeof data !== "object") return;
          var embed =
            new URLSearchParams(window.location.search).get("embed") === "1";
          var trusted = false;
          if (
            window._vellumIsTrustedHandoffOrigin &&
            window._vellumIsTrustedHandoffOrigin(event.origin)
          ) {
            trusted = true;
          } else if (
            embed &&
            window.parent &&
            event.source === window.parent
          ) {
            trusted = true;
          }
          if (!trusted) return;

          var target = window._vellumPlayerGameObject;
          if (!target) return;

          var send = function (method, arg) {
            if (
              typeof unityInstance !== "undefined" &&
              unityInstance &&
              unityInstance.SendMessage
            ) {
              unityInstance.SendMessage(target, method, arg);
            } else if (typeof Module !== "undefined" && Module.SendMessage) {
              Module.SendMessage(target, method, arg);
            }
          };

          if (data.type === "vellum-rift-respawn") {
            send("OnShellRespawn", "");
          } else if (data.type === "vellum-rift-control-layout") {
            var layout = String(data.layout || "gamer");
            send("OnShellControlLayout", layout);
          } else if (data.type === "vellum-rift-flashlight-toggle") {
            send("OnShellFlashlightToggle", "");
          } else if (data.type === "vellum-rift-manuscript-cycle") {
            var delta = data.delta != null ? String(data.delta) : "1";
            send("OnShellManuscriptCycle", delta);
          }
        } catch (e) {
          console.warn("[VellumRift] Player handoff message error: " + e);
        }
      });
    }
  },
});
