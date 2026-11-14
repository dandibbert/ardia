#!/bin/bash
# Makes the self-signed code signing certificate the CI test builds are signed with, so every build keeps the same
# signature (the keychain's Always Allow sticks, and a password manager added once keeps trusting it).
#
#   scripts/test-signing-cert.sh [output-dir]
#   scripts/test-signing-cert.sh -h | --help
#
# Writes ardia-test-signing.p12 and prints the two GitHub secrets to add (Settings › Secrets and variables › Actions):
#   TEST_SIGNING_P12           the .p12, base64
#   TEST_SIGNING_P12_PASSWORD  its password
# With gh installed and logged in, it offers to set them on the repository itself.
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "$0"
  exit 0
fi

out=${1:-$HOME/Desktop/ardia-test-signing}
mkdir -p "$out"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

password=$(openssl rand -hex 16)
openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
  -keyout "$work/key.pem" -out "$work/cert.pem" -subj "/CN=Ardia Test Signing" \
  -addext "basicConstraints=critical,CA:false" \
  -addext "keyUsage=critical,digitalSignature" \
  -addext "extendedKeyUsage=critical,codeSigning" >/dev/null 2>&1

legacy=()
if openssl pkcs12 -help 2>&1 | grep -q -- "-legacy"; then legacy=(-legacy); fi
openssl pkcs12 -export ${legacy[@]+"${legacy[@]}"} -inkey "$work/key.pem" -in "$work/cert.pem" \
  -name "Ardia Test Signing" -out "$out/ardia-test-signing.p12" -passout "pass:$password"

base64 < "$out/ardia-test-signing.p12" | tr -d '\n' > "$out/TEST_SIGNING_P12.txt"
printf '%s' "$password" > "$out/TEST_SIGNING_P12_PASSWORD.txt"

echo "Wrote $out/ardia-test-signing.p12"
echo "Secret TEST_SIGNING_P12          = contents of $out/TEST_SIGNING_P12.txt"
echo "Secret TEST_SIGNING_P12_PASSWORD = contents of $out/TEST_SIGNING_P12_PASSWORD.txt"

repo=${ARDIA_REPO:-dandibbert/ardia}
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  read -r -p "Set both secrets on $repo now with gh? [y/N] " answer
  if [[ "$answer" == "y" || "$answer" == "Y" ]]; then
    gh secret set TEST_SIGNING_P12 --repo "$repo" < "$out/TEST_SIGNING_P12.txt"
    gh secret set TEST_SIGNING_P12_PASSWORD --repo "$repo" < "$out/TEST_SIGNING_P12_PASSWORD.txt"
    echo "Both secrets are set on $repo."
  fi
fi
