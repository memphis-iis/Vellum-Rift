mergeInto(LibraryManager.library, {
  NotifyShellSession: function (jsonPtr) {
    var json = UTF8ToString(jsonPtr);
    try {
      var payload = JSON.parse(json);
      window._vellumShellSession = payload;
      window.dispatchEvent(
        new CustomEvent("vellum-shell-session", { detail: payload })
      );
    } catch (e) {
      console.warn("[VellumRift] NotifyShellSession failed: " + e);
    }
  },
});
