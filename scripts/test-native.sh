#!/bin/sh
set -eu
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/jaipur-ai-test.XXXXXX")
trap 'rm -f "$test_dir/ai-native"; rmdir "$test_dir"' EXIT
if [ "$(uname -s)" = Darwin ]; then
  set -- -isystem "$(xcrun --show-sdk-path)/usr/include/c++/v1"
fi
"${CXX:-c++}" -std=c++20 -O2 "$@" tests/ai-native.cpp -o "$test_dir/ai-native"
"$test_dir/ai-native"
