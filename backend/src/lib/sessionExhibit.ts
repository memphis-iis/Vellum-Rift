/**
 * Read-only Try now exhibit Spaces (always-on kiosk demos).
 */

export const EXHIBIT_READONLY_KEY = "exhibitReadonly";
export const EXHIBIT_MODEL_ID_KEY = "exhibitModelId";

export function readExhibitReadonly(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return metadata?.[EXHIBIT_READONLY_KEY] === true;
}

export function readExhibitModelId(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  const raw = metadata?.[EXHIBIT_MODEL_ID_KEY];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export function writeExhibitFlags(
  metadata: Record<string, unknown>,
  modelId: string,
): Record<string, unknown> {
  return {
    ...metadata,
    [EXHIBIT_READONLY_KEY]: true,
    [EXHIBIT_MODEL_ID_KEY]: modelId,
  };
}
