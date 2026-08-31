/**
 * ============================================================
 * NEXUS OS — Production Server Entry Point
 * ============================================================
 *
 * Responsibility:
 *   - Load and validate configuration
 *   - Create the Fastify application
 *   - Establish database connectivity
 *   - Create the HTTP server
 *   - Attach Socket.IO
 *   - Initialize realtime infrastructure
 *   - Start the application
 *   - Handle process signals
 *   - Perform graceful shutdown
 *   - Protect against unhandled process failures
 *
 * Architecture:
 *
 *   server.js
 *       │
 *       ├── config.js
 *       │
 *       ├── app.js
 *       │
 *       ├── models.js
 *       │
 *       └── sockets.js
 *               │
 *               ▼
 *          Socket.IO
 *
 * This file intentionally contains orchestration only.
 * Business logic belongs in services.js.
 * Database models belong in models.js.
 * HTTP routes belong in routes.js.
 * Security/request processing belongs in middleware.js.
 * ============================================================
 */

import http from 'node:http';

import process from 'node:process';

import { Server as SocketIOServer } from 'socket.io';

import { buildApp } from './app.js';
import {
  connectDatabase,
  disconnectDatabase,
} from './models.js';

import { registerSocketServer } from './sockets.js';

import {
  config,
} from './config.js';


/**
 * ============================================================
 * APPLICATION STATE
 * ============================================================
 */

let app = null;
let httpServer = null;
let io = null;

let shuttingDown = false;


/**
 * ============================================================
 * RUNTIME CONSTANTS
 * ============================================================
 */

const HOST = '0.0.0.0';

const PORT = Number(process.env.PORT || 10000);

const NODE_ENV =
  config.environment ??
  process.env.NODE_ENV ??
  'development';

const SHUTDOWN_TIMEOUT_MS = Number(
  config.server?.shutdownTimeoutMs ??
  10000
);


/**
 * ============================================================
 * STARTUP LOGGER
 * ============================================================
 */

function logStartup(message, metadata = {}) {
  if (!app?.log) {
    console.log(`[NEXUS] ${message}`, metadata);
    return;
  }

  app.log.info(
    {
      ...metadata,
      service: 'nexus-os',
      environment: NODE_ENV,
    },
    message
  );
}


/**
 * ============================================================
 * START APPLICATION
 * ============================================================
 */

async function startServer() {
  try {
    /**
     * --------------------------------------------------------
     * 1. CREATE FASTIFY APPLICATION
     * --------------------------------------------------------
     */

    app = await buildApp();


    /**
     * --------------------------------------------------------
     * 2. DATABASE CONNECTION
     * --------------------------------------------------------
     *
     * Database initialization happens before the server begins
     * accepting production traffic.
     *
     * This prevents the application from advertising itself as
     * ready while its persistence layer is unavailable.
     */

    await connectDatabase();


    /**
     * --------------------------------------------------------
     * 3. CREATE NODE HTTP SERVER
     * --------------------------------------------------------
     *
     * Fastify manages the HTTP application while Node's HTTP
     * server becomes the transport layer shared with Socket.IO.
     */

    httpServer = app.server;


    /**
     * --------------------------------------------------------
     * 4. CREATE SOCKET.IO SERVER
     * --------------------------------------------------------
     *
     * Socket.IO is attached to the same HTTP server and therefore
     * uses the same origin as the NEXUS web application.
     *
     * Browser:
     *
     *   https://nexus.example.com
     *
     * API:
     *
     *   https://nexus.example.com/api/...
     *
     * Socket:
     *
     *   https://nexus.example.com/socket.io/...
     */

    io = new SocketIOServer(
      httpServer,
      {
        path:
          config.realtime?.path ??
          '/socket.io',

        cors: {
          origin:
            config.security?.cors?.origin ??
            true,

          methods:
            config.security?.cors?.methods ??
            ['GET', 'POST'],

          credentials:
            config.security?.cors?.credentials ??
            true,
        },

        transports:
          config.realtime?.transports ??
          ['websocket', 'polling'],

        pingInterval:
          config.realtime?.pingInterval ??
          25000,

        pingTimeout:
          config.realtime?.pingTimeout ??
          20000,

        connectTimeout:
          config.realtime?.connectTimeout ??
          10000,

        maxHttpBufferSize:
          config.realtime?.maxHttpBufferSize ??
          1_000_000,

        serveClient: true,
      }
    );


    /**
     * --------------------------------------------------------
     * 5. REGISTER REALTIME INFRASTRUCTURE
     * --------------------------------------------------------
     *
     * sockets.js owns:
     *
     *   - authentication
     *   - authorization
     *   - user rooms
     *   - presence
     *   - conversations
     *   - typing indicators
     *   - notifications
     *   - delivery events
     *   - read receipts
     *   - connection lifecycle
     *
     * server.js only supplies the Socket.IO instance.
     */

    await registerSocketServer(io);


    /**
     * --------------------------------------------------------
     * 6. FASTIFY READY
     * --------------------------------------------------------
     *
     * Ensures Fastify has completed plugin and route
     * initialization before the server accepts requests.
     */

    await app.ready();


    /**
     * --------------------------------------------------------
     * 7. START HTTP SERVER
     * --------------------------------------------------------
     *
     * Render supplies PORT through process.env.PORT.
     *
     * We bind to 0.0.0.0 so the service is reachable from
     * Render/container infrastructure.
     */

    await new Promise((resolve, reject) => {
      app.listen(
        {
          port: PORT,
          host: HOST,
        },
        (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        }
      );
    });


    /**
     * --------------------------------------------------------
     * 8. STARTUP INFORMATION
     * --------------------------------------------------------
     */

    logStartup(
      'NEXUS OS server started successfully.',
      {
        host: HOST,
        port: PORT,
        environment: NODE_ENV,
        http: `http://${HOST}:${PORT}`,
        health: '/health',
        live: '/health/live',
        ready: '/health/ready',
        socket: '/socket.io',
      }
    );


    /**
     * --------------------------------------------------------
     * 9. STARTUP EVENT
     * --------------------------------------------------------
     */

    app.log.info(
      {
        event: 'server.started',
        service: 'nexus-os',
        environment: NODE_ENV,
        port: PORT,
      },
      'NEXUS OS runtime is operational.'
    );
  } catch (error) {
    /**
     * Startup failures must never be silently swallowed.
     */

    console.error(
      '[NEXUS] Fatal startup error:',
      error
    );

    await forceCleanup();

    process.exitCode = 1;
  }
}


/**
 * ============================================================
 * GRACEFUL SHUTDOWN
 * ============================================================
 *
 * Handles:
 *
 *   SIGTERM — Render/container/platform shutdown
 *   SIGINT  — local Ctrl+C
 *
 * Shutdown sequence:
 *
 *   Stop accepting connections
 *        ↓
 *   Stop Socket.IO
 *        ↓
 *   Close Fastify
 *        ↓
 *   Disconnect database
 *        ↓
 *   Exit
 * ============================================================
 */

async function gracefulShutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  const shutdownStartedAt = Date.now();

  try {
    app?.log?.info(
      {
        event: 'server.shutdown.started',
        signal,
      },
      'NEXUS OS graceful shutdown initiated.'
    );


    /**
     * --------------------------------------------------------
     * STOP NEW HTTP CONNECTIONS
     * --------------------------------------------------------
     */

    if (httpServer) {
      httpServer.close();
    }


    /**
     * --------------------------------------------------------
     * STOP SOCKET.IO
     * --------------------------------------------------------
     */

    if (io) {
      await new Promise((resolve) => {
        io.close(() => resolve());
      });
    }


    /**
     * --------------------------------------------------------
     * CLOSE FASTIFY
     * --------------------------------------------------------
     */

    if (app) {
      await app.close();
    }


    /**
     * --------------------------------------------------------
     * DISCONNECT DATABASE
     * --------------------------------------------------------
     */

    await disconnectDatabase();


    /**
     * --------------------------------------------------------
     * SHUTDOWN COMPLETE
     * --------------------------------------------------------
     */

    const duration =
      Date.now() - shutdownStartedAt;

    console.log(
      `[NEXUS] Graceful shutdown completed in ${duration}ms.`
    );

    process.exitCode = 0;
  } catch (error) {
    console.error(
      '[NEXUS] Error during graceful shutdown:',
      error
    );

    process.exitCode = 1;
  }
}


/**
 * ============================================================
 * FORCE CLEANUP
 * ============================================================
 *
 * Used when startup itself fails.
 */

async function forceCleanup() {
  try {
    if (io) {
      io.close();
    }
  } catch {
    // Intentionally ignored during emergency cleanup.
  }

  try {
    if (httpServer) {
      httpServer.close();
    }
  } catch {
    // Intentionally ignored during emergency cleanup.
  }

  try {
    if (app) {
      await app.close();
    }
  } catch {
    // Intentionally ignored during emergency cleanup.
  }

  try {
    await disconnectDatabase();
  } catch {
    // Intentionally ignored during emergency cleanup.
  }
}


/**
 * ============================================================
 * SHUTDOWN TIMEOUT
 * ============================================================
 *
 * A production service must not remain indefinitely stuck
 * during deployment or restart.
 */

let shutdownTimer = null;

function startShutdownTimer() {
  if (shutdownTimer) {
    clearTimeout(shutdownTimer);
  }

  shutdownTimer = setTimeout(() => {
    console.error(
      '[NEXUS] Graceful shutdown timed out. Forcing exit.'
    );

    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  /**
   * Do not keep Node alive solely because of this timer.
   */
  shutdownTimer.unref();
}


/**
 * ============================================================
 * PROCESS SIGNALS
 * ============================================================
 */

process.on(
  'SIGTERM',
  async () => {
    startShutdownTimer();

    await gracefulShutdown('SIGTERM');
  }
);


process.on(
  'SIGINT',
  async () => {
    startShutdownTimer();

    await gracefulShutdown('SIGINT');
  }
);


/**
 * ============================================================
 * UNHANDLED REJECTION
 * ============================================================
 *
 * An unhandled promise rejection can leave the application in
 * an unknown state. We log it and initiate controlled shutdown.
 */

process.on(
  'unhandledRejection',
  async (reason) => {
    console.error(
      '[NEXUS] Unhandled promise rejection:',
      reason
    );

    if (!shuttingDown) {
      await gracefulShutdown(
        'unhandledRejection'
      );
    }
  }
);


/**
 * ============================================================
 * UNCAUGHT EXCEPTION
 * ============================================================
 *
 * After an uncaught exception, continuing to serve requests can
 * be unsafe because application state may be corrupted.
 */

process.on(
  'uncaughtException',
  async (error) => {
    console.error(
      '[NEXUS] Uncaught exception:',
      error
    );

    if (!shuttingDown) {
      await gracefulShutdown(
        'uncaughtException'
      );
    }

    process.exitCode = 1;
  }
);


/**
 * ============================================================
 * START
 * ============================================================
 */

await startServer();
