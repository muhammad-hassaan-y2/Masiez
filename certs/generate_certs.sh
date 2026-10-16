#!/usr/bin/env bash
set -euo pipefail

CERTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DAYS=3650
DOMAIN="game.local"
SANS="DNS:game.local,DNS:jupyter.local"

OPENSSL=(docker run --rm --user "$(id -u):$(id -g)" -v "$CERTS:/certs" -w /certs alpine/openssl)

if [[ "${1:-}" == "--new-ca" || ! -f "$CERTS/ca.key" ]]; then
    rm -f "$CERTS/ca.key" "$CERTS/ca.crt"
    "${OPENSSL[@]}" req -x509 -newkey rsa:2048 -nodes -days "$DAYS" -keyout ca.key -out ca.crt \
        -subj "/CN=Masiez Local Dev CA" \
        -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
        -addext "keyUsage=critical,keyCertSign,cRLSign"
    echo "Created new CA -> certs/ca.crt (trust this file in your system/browser store)"
else
    echo "Reusing existing CA certs/ca.crt"
fi

rm -f "$CERTS/dev.key" "$CERTS/dev.crt" "$CERTS/dev.csr" "$CERTS/ca.srl"
cat > "$CERTS/leaf.ext.cnf" <<EOF
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = $SANS
EOF

"${OPENSSL[@]}" req -new -newkey rsa:2048 -nodes -keyout dev.key -out dev.csr -subj "/CN=$DOMAIN" \
    -addext "subjectAltName=$SANS"
"${OPENSSL[@]}" x509 -req -in dev.csr -CA ca.crt -CAkey ca.key -CAcreateserial -days "$DAYS" \
    -out dev.crt -extfile leaf.ext.cnf
"${OPENSSL[@]}" verify -CAfile ca.crt dev.crt

rm -f "$CERTS/dev.csr" "$CERTS/leaf.ext.cnf" "$CERTS/ca.srl"
echo "Issued leaf for $SANS -> certs/dev.crt"
