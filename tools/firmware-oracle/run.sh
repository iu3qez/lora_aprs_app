#!/bin/sh
# Compile the tracker firmware's KISS codec on the host and regenerate
# test/fixtures/firmware-oracle.json from it.
#
#   tools/firmware-oracle/run.sh <path-to-LoRa_APRS_Tracker-checkout>
set -eu

upstream=${1:?usage: run.sh <path-to-LoRa_APRS_Tracker-checkout>}
here=$(cd "$(dirname "$0")" && pwd)
bin=$(mktemp -d)/oracle

c++ -std=c++17 -Wall -I"$here/shim" -I"$upstream/include" \
    "$here/oracle.cpp" "$upstream/src/kiss_utils.cpp" -o "$bin"

node "$here/generate.mjs" "$bin" "$upstream"
