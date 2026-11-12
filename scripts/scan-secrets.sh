#!/usr/bin/env bash
# Scans every file git would commit (tracked + untracked-but-not-ignored) for
# secrets and personal/financial identifiers. Prints file:line and the kind of
# finding ONLY — never the matched text — so it is safe to run in CI logs.
#
#   bash scripts/scan-secrets.sh        # exit 1 if anything is found
set -u
cd "$(git rev-parse --show-toplevel)"

fail=0
report() { echo "  ✗ $1"; fail=1; }

files() { git ls-files --cached --others --exclude-standard | grep -v -E '(^|/)package-lock\.json$|^scripts/scan-secrets\.sh$'; }

scan() {  # scan <label> <extended-regex> [allowlist-regex]
  local label="$1" re="$2" allow="${3:-}" hits
  # xargs -I{} style loop keeps it portable (BSD + GNU grep).
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    hits=$(grep -nIE "$re" "$f" 2>/dev/null | { if [ -n "$allow" ]; then grep -vE "$allow"; else cat; fi; } | cut -d: -f1 | tr '\n' ',' | sed 's/,$//')
    [ -n "$hits" ] && report "$label — $f (line $hits)"
  done < <(files)
}

echo "Scanning for secrets and personal data…"

scan "JWT / Supabase key"        'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.'
scan "service_role key assigned" 'SERVICE_ROLE_KEY[[:space:]]*=[[:space:]]*[A-Za-z0-9._-]{12,}'
scan "Supabase project URL"      'https://[a-z0-9]{20}\.supabase\.co'
scan "Private key block"         '-----BEGIN [A-Z ]*PRIVATE KEY-----'
scan "PAN-like identifier"       '(^|[^A-Za-z0-9])[A-Z]{5}[0-9]{4}[A-Z]($|[^A-Za-z0-9])' 'ABCDE1234F|AAAAA0000A'
scan "GSTIN-like identifier"     '(^|[^A-Za-z0-9])[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]($|[^A-Za-z0-9])' '22AAAAA0000A1Z5'
scan "IFSC-like code"            '(^|[^A-Za-z0-9])[A-Z]{4}0[A-Z0-9]{6}($|[^A-Za-z0-9])' 'XXXX0000000|YESB0000000'

# Data files that must never be committed.
while IFS= read -r f; do
  case "$f" in
    *.env.local.example|*.env.example) ;;
    *.env|*.env.*|*.xls|*.xlsx|*.csv|*.pdf|*.ofx|*.qif|*.zip|*.docx|*.pem|*.key)
      report "data/secret file would be committed — $f" ;;
  esac
done < <(files)

if [ "$fail" -ne 0 ]; then
  echo; echo "Found potential secrets or personal data. Remove them (and rotate any real secret) before committing."
  exit 1
fi
echo "✓ Clean."
