#!/bin/sh

# RN 0.77 removed ReactPackage.getViewManagers; async-storage 1.23.1 still overrides it.
# Safe to remove after upgrading @react-native-async-storage/async-storage to 2.x.
#
# Must be POSIX-safe: package.json runs postinstall with `sh`.

DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"

if [ -f "$DIR/../../node_modules/@react-native-async-storage/async-storage/android/src/kotlinPackage/java/com/reactnativecommunity/asyncstorage/AsyncStoragePackage.kt" ]; then
  file_path="$DIR/../../node_modules/@react-native-async-storage/async-storage/android/src/kotlinPackage/java/com/reactnativecommunity/asyncstorage/AsyncStoragePackage.kt"
elif [ -f "$DIR/../../../node_modules/@react-native-async-storage/async-storage/android/src/kotlinPackage/java/com/reactnativecommunity/asyncstorage/AsyncStoragePackage.kt" ]; then
  file_path="$DIR/../../../node_modules/@react-native-async-storage/async-storage/android/src/kotlinPackage/java/com/reactnativecommunity/asyncstorage/AsyncStoragePackage.kt"
else
  echo "Android Warning: AsyncStoragePackage.kt not found; skipped getViewManagers patch."
  exit 0
fi 

python3 - "$file_path" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text()
needle = "    override fun getViewManagers(reactContext: ReactApplicationContext?): MutableList<ModuleSpec>? = null\n"
if needle not in text:
    if "getViewManagers" not in text:
        print("async-storage getViewManagers patch already applied.")
        raise SystemExit(0)
    print("Android Error: Unexpected AsyncStoragePackage.kt; getViewManagers patch failed.")
    raise SystemExit(1)

text = text.replace(needle, "")
# Drop unused import if present
text = text.replace("import com.facebook.react.bridge.ModuleSpec\n", "")
path.write_text(text)
print("async-storage getViewManagers patch applied.")
PY
