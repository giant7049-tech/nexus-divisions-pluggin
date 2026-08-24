'use strict';

/**
 * ================================================================
 * NEXUS CONNECT
 * Production Server Entry Point
 * ================================================================
 *
 * Architecture:
 *
 *   server.js
 *       │
 *       ├── config.js
 *       ├── app.js
 *       ├── sockets.js
 *       └── services.js
 *
 * Runtime:
 *   Node.js
 *   Express
 *   Socket.IO
 *   MongoDB
 *
 * Deployment:
 *   Render / compatible Node.js hosting
 *
 * IMPORTANT:
 *   - Never hard-code PORT.
 *   - Never place secrets in this file.
 *   - Secrets belong in environment variables.
 *   - The application must listen on 0.0.0.0 for cloud hosting.
 * ================================================================
 */

const http = require('http');

const config = require('./config');

const PORT = config.server.port;
const HOST = config.server.host;
const NODE_ENV = config.app.environment;
const APP_NAME = config.app.name;

const SHUTDOWN_TIMEOUT_MS =
    Number(process.env.SHUTDOWN_TIMEOUT_MS || 10000);

const app = require('./app');

const {
    initializeSocketServer
} = require('./sockets');

const {
    connectDatabase,
    disconnectDatabase
} = require('./services');


/**
 * ================================================================
 * PROCESS STATE
 * ================================================================
 */

let server = null;
let shuttingDown = false;


/**
 * ================================================================
 * START SERVER
 * ================================================================
 */

async function startServer() {
    try {
        console.log('');
        console.log('================================================');
        console.log(` ${APP_NAME}`);
        console.log(' Production Application Server');
        console.log('================================================');
        console.log(` Environment : ${NODE_ENV}`);
        console.log(` Host        : ${HOST}`);
        console.log(` Port        : ${PORT}`);
        console.log('------------------------------------------------');


        /**
         * ------------------------------------------------------------
         * 1. DATABASE
         * ------------------------------------------------------------
         *
         * The database must be available before accepting requests.
         * This prevents users from reaching an application whose
         * persistence layer has not initialized.
         */

        console.log('[NEXUS] Initializing database...');

        await connectDatabase();

        console.log('[NEXUS] Database initialization complete.');


        /**
         * ------------------------------------------------------------
         * 2. HTTP SERVER
         * ------------------------------------------------------------
         */

        server = http.createServer(app);


        /**
         * ------------------------------------------------------------
         * 3. REALTIME SOCKET SERVER
         * ------------------------------------------------------------
         *
         * Socket.IO is attached to the same HTTP server.
         *
         * This gives Nexus Connect a unified network layer:
         *
         *     HTTPS
         *       │
         *       ├── REST API
         *       │
         *       └── Socket.IO realtime
         *
         * Future features such as:
         *
         *     messaging
         *     typing indicators
         *     presence
         *     read receipts
         *     notifications
         *     realtime group activity
         *
         * can use the same server.
         */

        console.log('[NEXUS] Initializing realtime communication...');

        initializeSocketServer(server);

        console.log('[NEXUS] Realtime communication initialized.');


        /**
         * ------------------------------------------------------------
         * 4. SERVER LISTENER
         * ------------------------------------------------------------
         *
         * Render provides PORT dynamically through the environment.
         *
         * HOST defaults to 0.0.0.0 so the application is reachable
         * from outside the container/server.
         */

        await new Promise((resolve, reject) => {
            server.once('error', reject);

            server.listen(PORT, HOST, () => {
                server.removeListener('error', reject);

                resolve();
            });
        });


        /**
         * ------------------------------------------------------------
         * 5. SERVER READY
         * ------------------------------------------------------------
         */

        console.log('------------------------------------------------');
        console.log('[NEXUS] Server is now running.');
        console.log(`[NEXUS] Listening on ${HOST}:${PORT}`);
        console.log(`[NEXUS] Environment: ${NODE_ENV}`);
        console.log('================================================');
        console.log('');
    } catch (error) {
        console.error('');
        console.error('================================================');
        console.error('[NEXUS] SERVER STARTUP FAILED');
        console.error('================================================');
        console.error(error);
        console.error('================================================');
        console.error('');

        await shutdownServer('STARTUP_FAILURE');

        process.exitCode = 1;
    }
}


/**
 * ================================================================
 * GRACEFUL SHUTDOWN
 * ================================================================
 *
 * Cloud platforms can terminate application instances.
 *
 * We therefore close resources in an orderly manner:
 *
 *   1. Stop accepting new connections.
 *   2. Allow active HTTP connections to finish.
 *   3. Close Socket.IO connections.
 *   4. Disconnect MongoDB.
 *   5. Exit the process.
 *
 * This protects against:
 *
 *   - incomplete database operations
 *   - dropped realtime connections
 *   - corrupted application state
 *   - abrupt shutdowns
 * ================================================================
 */

async function shutdownServer(signal = 'UNKNOWN') {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;

    console.log('');
    console.log(`[NEXUS] Shutdown requested: ${signal}`);


    /**
     * Hard shutdown protection.
     *
     * If something hangs during shutdown, the process will still
     * terminate after the configured safety period.
     */

    const forceShutdownTimer = setTimeout(() => {
        console.error(
            '[NEXUS] Graceful shutdown timed out. Forcing process termination.'
        );

        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    forceShutdownTimer.unref();


    try {
        /**
         * ------------------------------------------------------------
         * HTTP SERVER
         * ------------------------------------------------------------
         */

        if (server) {
            console.log('[NEXUS] Closing HTTP server...');

            await new Promise((resolve) => {
                server.close(() => {
                    console.log('[NEXUS] HTTP server closed.');
                    resolve();
                });
            });
        }


        /**
         * ------------------------------------------------------------
         * DATABASE
         * ------------------------------------------------------------
         */

        console.log('[NEXUS] Disconnecting database...');

        await disconnectDatabase();

        console.log('[NEXUS] Database disconnected.');


        clearTimeout(forceShutdownTimer);

        console.log('[NEXUS] Shutdown completed successfully.');
        console.log('');

        process.exit(0);
    } catch (error) {
        clearTimeout(forceShutdownTimer);

        console.error(
            '[NEXUS] Error during graceful shutdown:',
            error
        );

        process.exit(1);
    }
}


/**
 * ================================================================
 * PROCESS SIGNALS
 * ================================================================
 */

process.on('SIGTERM', () => {
    shutdownServer('SIGTERM');
});

process.on('SIGINT', () => {
    shutdownServer('SIGINT');
});


/**
 * ================================================================
 * UNHANDLED ERRORS
 * ================================================================
 *
 * These should normally never occur because asynchronous operations
 * should be handled explicitly.
 *
 * However, the process must not silently continue in an unknown
 * state after a truly unexpected failure.
 * ================================================================
 */

process.on('uncaughtException', (error) => {
    console.error('');
    console.error('[NEXUS] UNCAUGHT EXCEPTION');
    console.error(error);

    shutdownServer('UNCAUGHT_EXCEPTION');
});


process.on('unhandledRejection', (reason) => {
    console.error('');
    console.error('[NEXUS] UNHANDLED PROMISE REJECTION');
    console.error(reason);

    shutdownServer('UNHANDLED_REJECTION');
});


/**
 * ================================================================
 * APPLICATION START
 * ================================================================
 */

startServer();
