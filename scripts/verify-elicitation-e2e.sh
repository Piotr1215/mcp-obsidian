#!/usr/bin/env bash
# End-to-end check of the delete-note confirmation, against a real Claude Code
# client and a throwaway vault.
#
# The unit tests drive the confirmer with a fake server, which proves the
# decision logic and nothing about the wire. This proves the wire: that Claude
# Code advertises elicitation to this server, that elicitInput reaches it, and
# that a refusal actually leaves the note on disk.
#
# Not part of `npm test`: it needs the claude CLI and spends real tokens. Run it
# after an SDK bump or a change to src/confirm.js.
#
# Usage: scripts/verify-elicitation-e2e.sh [path-to-claude]
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER="${SCRIPT_DIR}/../src/index.js"
CLAUDE="${1:-$HOME/.local/bin/claude}"

command -v "$CLAUDE" >/dev/null 2>&1 || { echo "no claude binary at $CLAUDE" >&2; exit 1; }

passed=0
failed=0
pass() { printf '  PASS: %s\n' "$1"; passed=$((passed + 1)); }
fail() { printf '  FAIL: %s\n' "$1" >&2; failed=$((failed + 1)); }
check() { # label, then a command whose success is the assertion
    local label="$1"; shift
    if "$@" >/dev/null 2>&1; then pass "$label"; else fail "$label"; fi
}
check_not() {
    local label="$1"; shift
    if "$@" >/dev/null 2>&1; then fail "$label"; else pass "$label"; fi
}

T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
VAULT="$T/vault"
mkdir -p "$VAULT"

# Auto-answer the dialog, since a -p session has no human. This is the same
# Elicitation hook mechanism a headless worker would use.
hook() { # $1 = accept|decline
    cat > "$T/hook-$1.sh" <<EOF
#!/usr/bin/env bash
cat > "$T/seen-$1.json"
printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"Elicitation","action":"$1","content":{"confirm":true}}}'
EOF
    chmod +x "$T/hook-$1.sh"
    printf '{"hooks":{"Elicitation":[{"matcher":"*","hooks":[{"type":"command","command":"%s"}]}]}}' "$T/hook-$1.sh"
}

run() { # $1 = settings json or empty; asks the model to delete note.md
    local settings="$1"
    local -a args=(
        -p --strict-mcp-config --permission-mode bypassPermissions
        --mcp-config "{\"mcpServers\":{\"obsidian\":{\"command\":\"node\",\"args\":[\"$SERVER\",\"$VAULT\"]}}}"
    )
    [ -n "$settings" ] && args+=(--settings "$settings")
    echo "Use the obsidian delete-note tool to delete note.md. Report exactly what the tool returned." \
        | CLAUDE_TMUX_PANE="" timeout 180 "$CLAUDE" "${args[@]}" 2>&1
}

echo "Test: a declined confirmation leaves the note on disk"
printf '# Keep me\n\nbody\n' > "$VAULT/note.md"
out=$(run "$(hook decline)")
check "note survived a decline" test -f "$VAULT/note.md"
check "the tool said it did not delete" grep -qi "not deleted" <<<"$out"
check "the server actually raised an elicitation" test -f "$T/seen-decline.json"
check "the prompt carried the note's own first line" grep -q "Keep me" "$T/seen-decline.json"

echo "Test: with no hook, a headless client cancels and the note survives"
printf '# Keep me too\n' > "$VAULT/note.md"
run "" >/dev/null
check "note survived an unanswered prompt" test -f "$VAULT/note.md"

echo "Test: an accepted confirmation deletes"
printf '# Delete me\n' > "$VAULT/note.md"
run "$(hook accept)" >/dev/null
check_not "note deleted after an accept" test -f "$VAULT/note.md"

printf '\n%d passed, %d failed\n' "$passed" "$failed"
[ "$failed" -eq 0 ]
