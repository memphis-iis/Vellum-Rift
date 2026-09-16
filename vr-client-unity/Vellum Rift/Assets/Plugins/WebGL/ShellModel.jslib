mergeInto(LibraryManager.library, {
  RegisterModelHandoffTarget: function (gameObjectNamePtr) {
    var gameObjectName = UTF8ToString(gameObjectNamePtr);
    window._vellumModelGameObject = gameObjectName;

    if (!window._vellumModelHandoffInstalled) {
      window._vellumModelHandoffInstalled = true;

      window.addEventListener("message", function (event) {
        try {
          var data = event.data;
          if (!data || typeof data !== "object") return;
          if (data.type !== "vellum-rift-model-pick-result") return;
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
          window._vellumDeliverModelPickResult(data);
        } catch (e) {
          console.warn("[VellumRift] Model pick message error: " + e);
        }
      });

      window._vellumDeliverModelPickResult = function (data) {
        var target = window._vellumModelGameObject;
        if (!target) return;
        var cancelled = Boolean(data.cancelled);
        var modelId = cancelled ? "" : String(data.modelId || "");
        var method = cancelled ? "OnModelPickCancelled" : "OnModelPickConfirmed";
        if (typeof unityInstance !== "undefined" && unityInstance && unityInstance.SendMessage) {
          unityInstance.SendMessage(target, method, modelId);
        } else if (typeof Module !== "undefined" && Module.SendMessage) {
          Module.SendMessage(target, method, modelId);
        }
      };
    }
  },

  RequestShellModelPick: function () {
    try {
      var embed =
        new URLSearchParams(window.location.search).get("embed") === "1";
      if (embed && window.parent && window.parent !== window) {
        window.parent.postMessage(
          { type: "vellum-rift-model-pick-request" },
          "*"
        );
      }
    } catch (e) {
      console.warn("[VellumRift] RequestShellModelPick failed: " + e);
    }
  },
});
