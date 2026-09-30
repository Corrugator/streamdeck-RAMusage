#!/bin/sh
# Builds the universal (arm64 + x86_64) sensor helper into the plugin's bin/.
set -e
cd "$(dirname "$0")/.."
OUT=com.corrugator.systemusage.sdPlugin/bin/sensors
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
for arch in arm64 x86_64; do
  swiftc -O -target "$arch-apple-macos12" native/sensors.swift -o "$TMP/sensors-$arch"
done
lipo -create "$TMP/sensors-arm64" "$TMP/sensors-x86_64" -output "$OUT"
codesign --force --sign - "$OUT"
echo "built $OUT"
