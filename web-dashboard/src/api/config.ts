/** Empty / "relative" → same-origin (museum-kit edge proxy). Else absolute bake. */
function resolveApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000").trim();
  if (raw === "" || raw === "relative") {
    if (typeof window !== "undefined" && window.location?.origin)
      return window.location.origin.replace(/\/$/, "");
    return "";
  }
  return raw.replace(/\/$/, "");
}

export const API_BASE_URL = resolveApiBaseUrl();
