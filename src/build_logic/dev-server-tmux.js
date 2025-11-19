#!/usr/bin/env node

/**
 * Launch dev server in tmux session
 * Runs on port 4000 (shared space) for collaborative development
 */

import { execSync } from 'child_process';
import { resolve } from 'path';

// Configuration
const SITE_ARG = process.argv[2]; // 'jh' or 'cg'
const SESSION_NAME = 'dev-server';
const WORKSPACE_DIR = '/home/magent/workspace/arthel';
const LOG_FILE = resolve('dev-server.log');

if (!SITE_ARG || !['jh', 'cg'].includes(SITE_ARG)) {
    console.error('Usage: node dev-server-tmux.js [jh|cg]');
    process.exit(1);
}

const DEV_COMMAND = `SKIP_CHAIN_DATA=true NODE_ENV=development webpack serve --port 4000 --config src/build_logic/webpack.${SITE_ARG === 'jh' ? 'justinholmes' : 'cryptograss'}.dev.js`;

function startServer() {
    console.log(`🚀 Starting ${SITE_ARG.toUpperCase()} dev server in tmux...`);

    // Check if session already exists
    try {
        execSync(`tmux has-session -t ${SESSION_NAME} 2>/dev/null`);
        console.log(`✓ Dev server session '${SESSION_NAME}' already running`);
        console.log(`  Attach with: tmux attach -t ${SESSION_NAME}`);
        return;
    } catch (e) {
        // Session doesn't exist, create it
    }

    // Create new detached tmux session with a shell, then run the command
    // This keeps the session alive after the server stops
    const tmuxCommand = `tmux new-session -d -s ${SESSION_NAME} -c ${WORKSPACE_DIR}`;

    execSync(tmuxCommand);

    // Send the dev server command to the session
    const startCommand = `tmux send-keys -t ${SESSION_NAME}:0.0 "${DEV_COMMAND} 2>&1 | tee ${LOG_FILE}" Enter`;

    try {
        execSync(startCommand);
        console.log('✓ Dev server started in background on port 4000');
        console.log(`  Attach with: tmux attach -t ${SESSION_NAME}`);
        console.log(`  View logs: tail -f ${LOG_FILE}`);
        console.log(`  Restart with: npm run restart-server`);
    } catch (error) {
        console.error('❌ Failed to start tmux session:', error.message);
        process.exit(1);
    }
}

// Start the server
startServer();