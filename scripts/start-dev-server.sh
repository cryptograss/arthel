#!/bin/bash
# Auto-start dev server in tmux session on container startup

SESSION_NAME="dev-server"
WORKSPACE_DIR="/home/magent/workspace/arthel"

# Check if session already exists
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "✓ Dev server session '$SESSION_NAME' already running"
    exit 0
fi

# Create new detached tmux session and start dev server
cd "$WORKSPACE_DIR" || exit 1

echo "🚀 Starting dev server in tmux session '$SESSION_NAME'..."
tmux new-session -d -s "$SESSION_NAME" -c "$WORKSPACE_DIR" \
    "npm run dev:jh:signals"

echo "✓ Dev server started in background"
echo "  Attach with: tmux attach -t $SESSION_NAME"
echo "  View logs: tmux capture-pane -t $SESSION_NAME -p"
