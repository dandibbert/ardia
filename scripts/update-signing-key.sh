#!/bin/bash
# Makes the Sparkle update signing key the CI test builds sign their update feed with, so an installed Ardia Test
# updates itself from this repository's releases (Ardia › Check for Updates…, or automatically).
#
#   scripts/update-signing-key.sh [output-dir]
#   scripts/update-signing-key.sh -h | --help
#
# The key lives in your login keychain under the Sparkle account "ardia-test" (an existing one is reused). Writes
# SPARKLE_PRIVATE_KEY.txt and prints the GitHub secret to add (Settings › Secrets and variables › Actions):
#   SPARKLE_PRIVATE_KEY  the exported private key
# With gh installed and logged in, it offers to set it on the repository itself.
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "$0"
  exit 0
fi

out=${1:-$HOME/Desktop/ardia-update-key}
account=ardia-test
mkdir -p "$out"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

curl -fsSL --retry 3 -o "$work/sparkle.tar.xz" https://github.com/sparkle-project/Sparkle/releases/download/2.9.6/Sparkle-2.9.6.tar.xz
[ "$(shasum -a 256 "$work/sparkle.tar.xz" | awk '{ print $1 }')" = 52bf9e88cdd972fc0c81501377a880e90d47031bd8ca5462488f843e2609e192 ] \
  || { echo "Sparkle-2.9.6.tar.xz didn't match its pinned SHA-256" >&2; exit 1; }
tar -xJf "$work/sparkle.tar.xz" -C "$work" bin

"$work/bin/generate_keys" --account "$account" >/dev/null
"$work/bin/generate_keys" --account "$account" -x "$out/SPARKLE_PRIVATE_KEY.txt" >/dev/null
public=$("$work/bin/generate_keys" --account "$account" -p)

echo "Wrote $out/SPARKLE_PRIVATE_KEY.txt"
echo "Secret SPARKLE_PRIVATE_KEY = contents of $out/SPARKLE_PRIVATE_KEY.txt"
echo "Public key (the builds embed it themselves): $public"

repo=${ARDIA_REPO:-dandibbert/ardia}
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  read -r -p "Set SPARKLE_PRIVATE_KEY on $repo now with gh? [y/N] " answer
  if [[ "$answer" == "y" || "$answer" == "Y" ]]; then
    gh secret set SPARKLE_PRIVATE_KEY --repo "$repo" < "$out/SPARKLE_PRIVATE_KEY.txt"
    echo "SPARKLE_PRIVATE_KEY is set on $repo."
  fi
fi
