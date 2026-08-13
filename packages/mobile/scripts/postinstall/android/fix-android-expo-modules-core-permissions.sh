#!/bin/sh

# Fix expo-modules-core PermissionsService.kt for compileSdk 35/36.
# PackageInfo.requestedPermissions is nullable; Expo still uses !! / bare .contains.
# Safe to remove when upstream ships null-safe requestedPermissions handling.

DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
# Sourced from exec.sh → $0 is postinstall/exec.sh → ../../node_modules
# Run directly from android/ → ../../../node_modules
if [ -f "$DIR/../../node_modules/expo-modules-core/android/src/main/java/expo/modules/adapters/react/permissions/PermissionsService.kt" ]; then
  file_path="$DIR/../../node_modules/expo-modules-core/android/src/main/java/expo/modules/adapters/react/permissions/PermissionsService.kt"
elif [ -f "$DIR/../../../node_modules/expo-modules-core/android/src/main/java/expo/modules/adapters/react/permissions/PermissionsService.kt" ]; then
  file_path="$DIR/../../../node_modules/expo-modules-core/android/src/main/java/expo/modules/adapters/react/permissions/PermissionsService.kt"
else
  echo "Android Error: PermissionsService.kt not found under expo-modules-core."
  exit 1
fi

python3 - "$file_path" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text()
new = "return requestedPermissions?.contains(permission) ?: false"

if new in text:
    print("expo-modules-core PermissionsService null-safety patch already applied.")
    raise SystemExit(0)

# Expo 51 used bare .contains; Expo 52 uses !!.contains — both are unsafe on SDK 36.
for old in (
    "return requestedPermissions!!.contains(permission)",
    "return requestedPermissions.contains(permission)",
):
    if old in text:
        path.write_text(text.replace(old, new, 1))
        print("expo-modules-core PermissionsService null-safety patch applied.")
        raise SystemExit(0)

print("Android Error: Unexpected PermissionsService.kt contents; null-safety patch failed.")
raise SystemExit(1)
PY
