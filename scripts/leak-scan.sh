#!/usr/bin/env bash
# Fails if personal data from the original app reaches the public repo or the built site.
set -u
TERMS='nocodb|NocoDB|xc-token|W1984|Israel |Israel Wall|Wall Budget|IW Budget|thewalls|114f9c45|sk-ant|nfp_|VITE_NOCODB|mw5c5zbl5veyr33|m73tko87q6clzqs|mgkvjloqi706mre|ml06f4esm5ueosd|mvvsukr3tqexprl|mf5cdigma8wn9m6|m3kpgwhu42qpq5w|mw1q9tnx90mxfi3|mreldrtbmnnw1zk'
hits=$(grep -rEn "$TERMS" src public index.html ${1:-} --exclude=privacy.html 2>/dev/null)
if [ -n "$hits" ]; then echo "LEAK SCAN FAILED:"; echo "$hits"; exit 1; fi
echo "leak scan clean"
