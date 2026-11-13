#!/usr/bin/env bash
set -euo pipefail

workspace_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v devcontainer >/dev/null 2>&1; then
    echo 'Install the Dev Container CLI first: npm install -g @devcontainers/cli' >&2
    exit 1
fi

# Reuse the existing container, or create and initialize it when needed.
devcontainer up --workspace-folder "$workspace_dir"
exec devcontainer exec --workspace-folder "$workspace_dir" npm run dev -- "$@"
