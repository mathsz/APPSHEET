#!/usr/bin/env bash
set -euo pipefail

echo "Scanning workflow files for unguarded 'npm ci' calls..."
UNGUARDED=0
for f in .github/workflows/*.yml .github/workflows/*.yaml; do
  [ -f "$f" ] || continue
  while IFS= read -r ln; do
    lineno=$(echo "$ln" | cut -d: -f1)
    line=$(echo "$ln" | cut -d: -f2-)
    # Use -- to stop grep treating patterns that start with - as options
    if echo "$line" | grep -q -- --prefix; then
      continue
    fi
    start=$((lineno-6)); [ $start -lt 1 ] && start=1
    context=$(sed -n "${start},${lineno}p" "$f")
    if echo "$context" | grep -q "if \[ -f package.json \]"; then
      continue
    fi
    echo "Found unguarded 'npm ci' in $f:$lineno -> $line"
    UNGUARDED=1
  done < <(nl -ba "$f" | sed -n '1,$p' | grep -nE "run:\s*npm ci(\s|$)")
done
if [ "$UNGUARDED" -ne 0 ]; then
  echo "ERROR: One or more workflow files run 'npm ci' without a guard or --prefix. Please add a guard like 'if [ -f package.json ]' or use '--prefix <dir>'" >&2
  exit 1
fi

echo "No unguarded 'npm ci' calls found."
