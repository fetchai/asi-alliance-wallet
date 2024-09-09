#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

ROOT=${DIR//\/packages\/mobile\/scripts/}

watchman watch-del "${ROOT}" ; watchman watch-project "${ROOT}"

cd "$DIR/../ios"
xcodebuild clean | true

rm -rf "$DIR/../ios/Pods"

cd "$DIR/../android"
./gradlew clean | true

rm -rf "$DIR/../android/.gradle"
rm -rf "$DIR/../android/build"
rm -rf "$DIR/../android/app/build"

rm -rf "$DIR/../node_modules"
rm -rf "$DIR/../build"
