// Unity WebGL plugin: put the created session id into the page URL so the
// host can copy the address bar and share a ready-to-join link.
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
});
