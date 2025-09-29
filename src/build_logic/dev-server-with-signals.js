#!/usr/bin/env node

/**
 * Signal-controlled development server
 * Allows external processes to restart the dev server by touching signal files
 */

import { spawn } from 'child_process';
import { watchFile, existsSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// Configuration
const RESTART_SIGNAL = '.restart-server';
const SITE_ARG = process.argv[2]; // 'jh' or 'cg'

if (!SITE_ARG || !['jh', 'cg'].includes(SITE_ARG)) {
    console.error('Usage: node dev-server-with-signals.js [jh|cg]');
    process.exit(1);
}

const DEV_COMMAND = SITE_ARG === 'jh' ? 'dev:jh' : 'dev:cg';
const SIGNAL_FILE = resolve(RESTART_SIGNAL);

let serverProcess = null;
let isRestarting = false;

function startServer() {
    if (isRestarting) return;

    if (serverProcess) {
        console.log('🛑 Stopping existing server...');
        serverProcess.kill('SIGTERM');
        // Wait a moment for clean shutdown
        setTimeout(() => {
            if (serverProcess && !serverProcess.killed) {
                serverProcess.kill('SIGKILL');
            }
        }, 2000);
    }

    isRestarting = true;

    // Small delay to ensure port is released
    setTimeout(() => {
        console.log(`🎵 Starting ${SITE_ARG.toUpperCase()} dev server...`);

        serverProcess = spawn('npm', ['run', DEV_COMMAND], {
            stdio: 'inherit',
            env: { ...process.env, FORCE_COLOR: '1' },
            detached: false
        });

        serverProcess.on('error', (error) => {
            console.error('❌ Server error:', error);
            isRestarting = false;
        });

        serverProcess.on('exit', (code, signal) => {
            if (!isRestarting) {
                console.log(`🔄 Server exited (code: ${code}, signal: ${signal})`);
            }
            isRestarting = false;
        });

        isRestarting = false;
        console.log('🎯 Server started! Touch .restart-server to restart');
    }, 500);
}

// Create signal file if it doesn't exist
if (!existsSync(SIGNAL_FILE)) {
    writeFileSync(SIGNAL_FILE, new Date().toISOString());
}

// Watch for signal file changes
console.log(`👀 Watching ${SIGNAL_FILE} for restart signals...`);
watchFile(SIGNAL_FILE, (curr, prev) => {
    if (curr.mtime > prev.mtime) {
        console.log('🔄 Restart signal received!');
        startServer();
    }
});

// Handle cleanup on exit
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down...');
    if (serverProcess) {
        serverProcess.kill('SIGTERM');
    }
    process.exit(0);
});

process.on('SIGTERM', () => {
    if (serverProcess) {
        serverProcess.kill('SIGTERM');
    }
    process.exit(0);
});

// Start initially
console.log(`🚀 Signal-controlled dev server for ${SITE_ARG.toUpperCase()}`);
startServer();