#!/bin/sh

# Rebuild react-native-scrypt prebuilt JNI libs for 16 KB page sizes (Play requirement).
# Upstream ships old 4 KB-aligned .so files and disables ndk-build in Gradle.
# Safe to remove after replacing react-native-scrypt with a 16 KB-aware package.
#
# Must be POSIX-safe: package.json runs postinstall with `sh`.

DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"

if [ -d "$DIR/../../node_modules/react-native-scrypt/android/src/main/jni" ]; then
  SCRYPT_MAIN="$DIR/../../node_modules/react-native-scrypt/android/src/main"
elif [ -d "$DIR/../../../node_modules/react-native-scrypt/android/src/main/jni" ]; then
  SCRYPT_MAIN="$DIR/../../../node_modules/react-native-scrypt/android/src/main"
else
  echo "Android Error: react-native-scrypt android/src/main/jni not found."
  exit 1
fi

JNI_DIR="$SCRYPT_MAIN/jni"
LIBS_DIR="$SCRYPT_MAIN/libs"
JNI_C="$JNI_DIR/libscrypt-jni.c"

# NDK 27 Clang rejects implicit malloc/free declarations.
python3 - "$JNI_C" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text()
if "#include <stdlib.h>" in text:
    print("scrypt jni: stdlib.h already present.")
else:
    needle = "#include <errno.h>"
    if needle not in text:
        print("Android Error: Unexpected libscrypt-jni.c; stdlib patch failed.")
        raise SystemExit(1)
    path.write_text(text.replace(needle, needle + "\n#include <stdlib.h>", 1))
    print("scrypt jni: added #include <stdlib.h>.")
PY

cat > "$JNI_DIR/Application.mk" <<'EOF'
APP_PLATFORM := android-21
APP_ABI := armeabi-v7a arm64-v8a x86 x86_64
APP_SUPPORT_FLEXIBLE_PAGE_SIZES := true
EOF

# Resolve NDK r27.2 (same version pinned in android/build.gradle).
NDK_DIR=""
if [ -n "${ANDROID_NDK_HOME:-}" ] && [ -x "${ANDROID_NDK_HOME}/ndk-build" ]; then
  NDK_DIR="$ANDROID_NDK_HOME"
elif [ -n "${ANDROID_HOME:-}" ] && [ -x "${ANDROID_HOME}/ndk/27.2.12479018/ndk-build" ]; then
  NDK_DIR="${ANDROID_HOME}/ndk/27.2.12479018"
elif [ -n "${ANDROID_SDK_ROOT:-}" ] && [ -x "${ANDROID_SDK_ROOT}/ndk/27.2.12479018/ndk-build" ]; then
  NDK_DIR="${ANDROID_SDK_ROOT}/ndk/27.2.12479018"
elif [ -x "$HOME/Android/Sdk/ndk/27.2.12479018/ndk-build" ]; then
  NDK_DIR="$HOME/Android/Sdk/ndk/27.2.12479018"
fi

if [ -z "$NDK_DIR" ]; then
  echo "Android Warning: NDK 27.2.12479018 not found; skipped scrypt 16 KB rebuild."
  echo "  Install ndk;27.2.12479018 or set ANDROID_NDK_HOME, then re-run this script."
  exit 0
fi

# Drop obsolete ABIs that NDK no longer builds (and would keep 4 KB prebuilts).
rm -rf "$LIBS_DIR/armeabi" "$LIBS_DIR/mips" "$LIBS_DIR/mips64"

echo "Rebuilding react-native-scrypt JNI with NDK at $NDK_DIR ..."
(
  CDPATH=
  cd -- "$JNI_DIR" || exit 1
  "$NDK_DIR/ndk-build" -j"$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 2)"
) || {
  echo "Android Error: scrypt ndk-build failed."
  exit 1
}

python3 - "$LIBS_DIR" <<'PY'
import struct
import sys
from pathlib import Path

libs = Path(sys.argv[1])
required = ("arm64-v8a", "x86_64")
failed = False
for abi in required:
    so = libs / abi / "libscrypt_jni.so"
    if not so.is_file():
        print(f"Android Error: missing rebuilt {so}")
        failed = True
        continue
    data = so.read_bytes()
    if data[4] != 2:
        print(f"Android Error: expected ELF64 for {abi}")
        failed = True
        continue
    e_phoff = struct.unpack_from("<Q", data, 32)[0]
    e_phentsize = struct.unpack_from("<H", data, 54)[0]
    e_phnum = struct.unpack_from("<H", data, 56)[0]
    max_align = 0
    for i in range(e_phnum):
        off = e_phoff + i * e_phentsize
        p_type = struct.unpack_from("<I", data, off)[0]
        if p_type != 1:
            continue
        p_align = struct.unpack_from("<Q", data, off + 48)[0]
        max_align = max(max_align, p_align)
    status = "OK" if max_align >= 0x4000 else "FAIL"
    print(f"scrypt {abi}: LOAD align={max_align} ({status})")
    if max_align < 0x4000:
        failed = True
if failed:
    raise SystemExit(1)
print("scrypt 16 KB rebuild completed successfully.")
PY
