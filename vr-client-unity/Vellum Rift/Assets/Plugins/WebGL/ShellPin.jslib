mergeInto(LibraryManager.library, {
  RegisterPinHandoffTarget: function (gameObjectNamePtr) {
    var gameObjectName = UTF8ToString(gameObjectNamePtr);
    window._vellumPinGameObject = gameObjectName;

    if (!window._vellumPinHandoffInstalled) {
      window._vellumPinHandoffInstalled = true;

      window.addEventListener("message", function (event) {
        try {
          var data = event.data;
          if (!data || typeof data !== "object") return;
          if (data.type !== "vellum-rift-pin-name-result") return;
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
          window._vellumDeliverPinNameResult(data);
        } catch (e) {
          console.warn("[VellumRift] Pin name message error: " + e);
        }
      });

      window._vellumDeliverPinNameResult = function (data) {
        var target = window._vellumPinGameObject;
        if (!target) return;
        var cancelled = Boolean(data.cancelled);
        var label = cancelled ? "" : String(data.label || "");
        var method = cancelled ? "OnPinNameCancelled" : "OnPinNameConfirmed";
        if (typeof unityInstance !== "undefined" && unityInstance && unityInstance.SendMessage) {
          unityInstance.SendMessage(target, method, label);
        } else if (typeof Module !== "undefined" && Module.SendMessage) {
          Module.SendMessage(target, method, label);
        }
      };

      window._vellumShowPinModal = function (payload) {
        var modal = document.getElementById("vellum-pin-modal");
        var input = document.getElementById("vellum-pin-input");
        var title = document.getElementById("vellum-pin-title");
        if (!modal || !input) {
          window._vellumDeliverPinNameResult({ cancelled: true });
          return;
        }
        if (title) {
          title.textContent =
            payload.mode === "rename" ? "Rename pin" : "Name this pin";
        }
        input.value = payload.currentLabel || "";
        modal.hidden = false;
        input.focus();
        input.select();
        window._vellumPendingPinPayload = payload;
      };

      var confirmBtn = document.getElementById("vellum-pin-confirm");
      var cancelBtn = document.getElementById("vellum-pin-cancel");
      var form = document.getElementById("vellum-pin-form");
      if (form) {
        form.addEventListener("submit", function (e) {
          e.preventDefault();
          var input = document.getElementById("vellum-pin-input");
          var label = input ? String(input.value || "").trim() : "";
          if (!label) label = "Pin";
          var modal = document.getElementById("vellum-pin-modal");
          if (modal) modal.hidden = true;
          window._vellumDeliverPinNameResult({ label: label });
        });
      }
      if (cancelBtn) {
        cancelBtn.addEventListener("click", function () {
          var modal = document.getElementById("vellum-pin-modal");
          if (modal) modal.hidden = true;
          window._vellumDeliverPinNameResult({ cancelled: true });
        });
      }
    }
  },

  RequestShellPinName: function (jsonPtr) {
    var json = UTF8ToString(jsonPtr);
    try {
      var payload = JSON.parse(json);
      var embed =
        new URLSearchParams(window.location.search).get("embed") === "1";
      if (embed && window.parent && window.parent !== window) {
        window.parent.postMessage(
          {
            type: "vellum-rift-pin-name-request",
            mode: payload.mode,
            x: payload.x,
            y: payload.y,
            z: payload.z,
            artifactId: payload.artifactId,
            currentLabel: payload.currentLabel,
          },
          "*"
        );
        return;
      }
      if (window._vellumShowPinModal) {
        window._vellumShowPinModal(payload);
      }
    } catch (e) {
      console.warn("[VellumRift] RequestShellPinName failed: " + e);
    }
  },
});
