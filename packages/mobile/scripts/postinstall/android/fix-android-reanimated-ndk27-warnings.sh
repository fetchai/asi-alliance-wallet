#!/bin/sh

# Suppress NDK 27 / Clang 18 warnings that -Werror turns into build failures in
# react-native-reanimated 3.16.x (deprecated-this-capture, VLA extension).
# Safe to remove after upgrading Reanimated to a version that supports NDK 27 cleanly.

DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
if [ -f "$DIR/../../node_modules/react-native-reanimated/android/CMakeLists.txt" ]; then
  file_path="$DIR/../../node_modules/react-native-reanimated/android/CMakeLists.txt"
elif [ -f "$DIR/../../../node_modules/react-native-reanimated/android/CMakeLists.txt" ]; then
  file_path="$DIR/../../../node_modules/react-native-reanimated/android/CMakeLists.txt"
else
  echo "Android Error: react-native-reanimated android/CMakeLists.txt not found."
  exit 1
fi

python3 - "$file_path" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text()
marker = '-Wno-deprecated-this-capture'
if marker in text:
    print("reanimated NDK27 warning-suppress patch already applied.")
    raise SystemExit(0)

needle = 'string(APPEND CMAKE_CXX_FLAGS " -fexceptions -fno-omit-frame-pointer -frtti -fstack-protector-all -std=c++${CMAKE_CXX_STANDARD} -Wall -Werror")'
insert = needle + '\n\n# NDK 27 (Clang 18): keep -Werror but ignore new deprecations that break Reanimated 3.16.x\nstring(APPEND CMAKE_CXX_FLAGS " -Wno-deprecated-this-capture -Wno-vla-cxx-extension")'
if needle not in text:
    print("Android Error: Unexpected reanimated CMakeLists.txt contents; NDK27 warning patch failed.")
    raise SystemExit(1)

path.write_text(text.replace(needle, insert, 1))
print("reanimated NDK27 warning-suppress patch applied.")
PY
