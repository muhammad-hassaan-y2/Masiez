#!/usr/bin/env bash
set -euo pipefail

CERTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DAYS=3650
DOMAIN="game.local"
SANS="DNS:game.local,DNS:jupyter.local"

OPENSSL=(docker run --rm --user "$(id -u):$(id -g)" -v "$CERTS:/certs" -w /certs alpine/openssl)

# drop leftovers from earlier layouts (CA + leaf pair, dev.* naming)
rm -f "$CERTS"/dev.key "$CERTS"/dev.crt "$CERTS"/dev.csr "$CERTS"/ca.srl "$CERTS"/leaf.ext.cnf
rm -f "$CERTS/ca.key" "$CERTS/ca.crt"

"${OPENSSL[@]}" req -x509 -newkey rsa:2048 -nodes -days "$DAYS" \
    -keyout ca.key -out ca.crt \
    -subj "/CN=$DOMAIN" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
    -addext "extendedKeyUsage=serverAuth" \
    -addext "subjectAltName=$SANS"

echo "Self-signed certificate for $SANS -> certs/ca.crt (import it into your system/browser trust store)"
