#!/usr/bin/env bash
# Build Vellum-Wall-Observer-x86_64.AppImage (UDP discover, HTTP, no preset API).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC="${ROOT}/observer-appimage"
OUT_DIR="${OUT_DIR:-${ROOT}/dist}"
ARCH="$(uname -m)"
[[ "$ARCH" == "x86_64" ]] || { echo "Only x86_64 AppImage supported (got ${ARCH})" >&2; exit 1; }

APPDIR="${OUT_DIR}/VellumWallObserver.AppDir"
NAME="Vellum-Wall-Observer-${ARCH}.AppImage"
TOOL_DIR="${OUT_DIR}/.tools"
APPIMAGETOOL="${APPIMAGETOOL:-${TOOL_DIR}/appimagetool-${ARCH}.AppImage}"

mkdir -p "${OUT_DIR}" "${TOOL_DIR}"
rm -rf "${APPDIR}"
mkdir -p "${APPDIR}/usr/bin" "${APPDIR}/usr/share/icons/hicolor/256x256/apps"

install -m 0755 "${SRC}/AppRun" "${APPDIR}/AppRun"
install -m 0644 "${SRC}/vellum-observer.desktop" "${APPDIR}/vellum-observer.desktop"
# AppImage runtime expects Exec basename matching AppRun name or symlink
ln -sf AppRun "${APPDIR}/usr/bin/vellum-observer"

# Simple SVG → PNG optional; ship SVG as icon fallback via .DirIcon symlink to desktop Icon
if command -v convert >/dev/null 2>&1; then
  convert -size 256x256 xc:'#0b1220' -fill '#5eead4' -gravity center \
    -pointsize 48 -annotate 0 'VR' "${APPDIR}/usr/share/icons/hicolor/256x256/apps/vellum-observer.png" 2>/dev/null \
    || true
fi
if [[ -f "${APPDIR}/usr/share/icons/hicolor/256x256/apps/vellum-observer.png" ]]; then
  cp -f "${APPDIR}/usr/share/icons/hicolor/256x256/apps/vellum-observer.png" "${APPDIR}/vellum-observer.png"
  ln -sfn vellum-observer.png "${APPDIR}/.DirIcon"
else
  # Minimal valid 1x1 PNG
  printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82' \
    > "${APPDIR}/vellum-observer.png"
  ln -sfn vellum-observer.png "${APPDIR}/.DirIcon"
fi

pack_with_runtime() {
  local runtime="${TOOL_DIR}/runtime-${ARCH}"
  local sqfs="${TOOL_DIR}/VellumWallObserver.squashfs"
  if [[ ! -s "${runtime}" ]]; then
    echo "[build] fetching type2 runtime…"
    curl -fsSL -o "${runtime}" \
      "https://github.com/AppImage/type2-runtime/releases/download/continuous/runtime-${ARCH}"
  fi
  command -v mksquashfs >/dev/null 2>&1 || {
    echo "[build] mksquashfs required (squashfs-tools)" >&2
    return 1
  }
  rm -f "${sqfs}" "${OUT_DIR}/${NAME}"
  mksquashfs "${APPDIR}" "${sqfs}" -root-owned -noappend -comp zstd -Xcompression-level 3
  cat "${runtime}" "${sqfs}" > "${OUT_DIR}/${NAME}"
  chmod +x "${OUT_DIR}/${NAME}"
}

export ARCH
cd "${OUT_DIR}"
# Prefer appimagetool; fall back to runtime+mksquashfs when FUSE is blocked.
if [[ ! -x "${APPIMAGETOOL}" ]]; then
  echo "[build] fetching appimagetool…"
  curl -fsSL -o "${APPIMAGETOOL}" \
    "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-${ARCH}.AppImage" \
    || true
  [[ -f "${APPIMAGETOOL}" ]] && chmod +x "${APPIMAGETOOL}"
fi

if [[ -x "${APPIMAGETOOL}" ]] && \
   APPIMAGE_EXTRACT_AND_RUN=1 "${APPIMAGETOOL}" "${APPDIR}" "${NAME}" 2>/dev/null; then
  :
elif [[ -x "${APPIMAGETOOL}" ]] && "${APPIMAGETOOL}" --appimage-extract-and-run "${APPDIR}" "${NAME}" 2>/dev/null; then
  :
else
  echo "[build] appimagetool unavailable/FUSE blocked — packing with type2 runtime"
  pack_with_runtime
fi

chmod +x "${OUT_DIR}/${NAME}"
echo "[build] OK → ${OUT_DIR}/${NAME}"
ls -la "${OUT_DIR}/${NAME}"
