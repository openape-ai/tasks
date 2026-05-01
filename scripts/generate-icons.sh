#!/usr/bin/env bash
#
# Render the PWA raster icons (192/512 + 512 maskable) from
# app/public/icon.svg. Run once and commit the resulting PNGs — they
# only need to regenerate when the source SVG changes.
#
# Prefers macOS qlmanage + sips because rsvg-convert / ImageMagick lack
# Apple Color Emoji and would render the ✅ glyph as tofu. Falls back to
# rsvg-convert / magick / convert if qlmanage is unavailable.
#
# iOS Safari note: apple-touch-icon must be PNG; SVG is silently ignored.

set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
SVG="${ROOT}/app/public/icon.svg"
OUT="${ROOT}/app/public"

if [ ! -f "$SVG" ]; then
  echo "Source not found: $SVG" >&2
  exit 1
fi

QL_TMP=""
ensure_ql_tmp() {
  if [ -z "$QL_TMP" ]; then
    QL_TMP=$(mktemp -d)
    trap 'rm -rf "$QL_TMP"' EXIT
    qlmanage -t -s 512 -o "$QL_TMP" "$SVG" >/dev/null 2>&1
    if [ ! -s "$QL_TMP/icon.svg.png" ]; then
      echo "qlmanage failed to render $SVG" >&2
      exit 1
    fi
  fi
}

render() {
  local size="$1"
  local target="$2"
  if [ "$(uname)" = "Darwin" ] && command -v qlmanage >/dev/null 2>&1 && command -v sips >/dev/null 2>&1; then
    ensure_ql_tmp
    sips -z "$size" "$size" "$QL_TMP/icon.svg.png" --out "$target" >/dev/null 2>&1
  elif command -v rsvg-convert >/dev/null 2>&1; then
    rsvg-convert -w "$size" -h "$size" "$SVG" -o "$target"
  elif command -v magick >/dev/null 2>&1; then
    magick -background none -density 384 "$SVG" -resize "${size}x${size}" "$target"
  elif command -v convert >/dev/null 2>&1; then
    convert -background none -density 384 "$SVG" -resize "${size}x${size}" "$target"
  else
    echo "No raster renderer available." >&2
    exit 1
  fi
  echo "  ${target}"
}

echo "→ Rendering PWA icons from ${SVG}"
render 192 "${OUT}/icon-192.png"
render 512 "${OUT}/icon-512.png"
render 512 "${OUT}/icon-512-maskable.png"
echo "✓ Done."
