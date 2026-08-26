/**
 * NEXUS OS
 * ------------------------------------------------------------
 * File: server/app.js
 * Purpose:
 *   Application composition and HTTP application factory.
 *
 * Responsibilities:
 *   - Create and configure Fastify
 *   - Register security middleware/plugins
 *   - Register CORS
 *   - Register rate limiting
 *   - Register application middleware
 *   - Register API routes
 *   - Serve the NEXUS frontend
 *   - Provide health/readiness/liveness endpoints
 *   - Centralize error handling
 *   - Provide request identification
 *   - Prepare the HTTP application for Socket.IO
 *
 * Socket.IO itself is intentionally attached by server/server.js
 * to the underlying HTTP server. This keeps transport startup
 * separate from application composition.
 * ------------------------------------------------------------
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import config from './config.js';
import { registerMiddleware } from './middleware.js';
import { registerRoutes } from './routes.js';


/* ============================================================
   MODULE PATHS
   ============================================================ */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');

const PUBLIC_DIRECTORY = path.join(
  PROJECT_ROOT,
  'public'
);

const INDEX_FILE = path.join(
  PUBLIC_DIRECTORY,
  'index.html'
);


/* ============================================================
   MIME TYPES
   ============================================================ */

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8'
});


/* ============================================================
   APPLICATION OPTIONS
   ============================================================ */

const DEFAULT_OPTIONS = Object.freeze({
  logger: true,
  trustProxy: true
});


/* ============================================================
   SAFE CONFIGURATION ACCESS
   ============================================================ */

function getConfigValue(source, ...keys) {
  let current = source;

  for (const key of keys) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== 'object'
    ) {
      return undefined;
    }

    current = current[key];
  }

  return current;
}


function getEnvironment() {
  return (
    process.env.NODE_ENV ||
    getConfigValue(config, 'env') ||
    getConfigValue(config, 'environment') ||
    'development'
  );
}


function getPort() {
  const configuredPort =
    process.env.PORT ??
    getConfigValue(config, 'port') ??
    getConfigValue(config, 'server', 'port');

  const port = Number(configuredPort || 10000);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid server port: ${configuredPort}`
    );
  }

  return port;
}


function getHost() {
  return (
    process.env.HOST ||
    getConfigValue(config, 'host') ||
    getConfigValue(config, 'server', 'host') ||
    '0.0.0.0'
  );
}


/* ============================================================
   REQUEST ID
   ============================================================ */

function resolveRequestId(request) {
  const incoming =
    request.headers['x-request-id'] ||
    request.headers['x-correlation-id'];

  if (
    typeof incoming === 'string' &&
    incoming.length > 0 &&
    incoming.length <= 128
  ) {
    return incoming;
  }

  return randomUUID();
}


/* ============================================================
   SECURITY HELPERS
   ============================================================ */

function isProduction() {
  return getEnvironment() === 'production';
}


function getAllowedOrigins() {
  const configured =
    process.env.CORS_ORIGIN ||
    getConfigValue(config, 'cors', 'origin') ||
    getConfigValue(config, 'security', 'corsOrigin');

  if (!configured) {
    return true;
  }

  if (configured === '*') {
    return true;
  }

  if (Array.isArray(configured)) {
    return configured;
  }

  return String(configured)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}


/* ============================================================
   STATIC FILE SECURITY
   ============================================================ */

/**
 * Prevent path traversal when resolving files under /public.
 */
function resolvePublicFile(requestPath) {
  let decodedPath;

  try {
    decodedPath = decodeURIComponent(requestPath);
  } catch {
    return null;
  }

  const normalizedPath = decodedPath.replace(/^\/+/, '');

  const candidate = path.resolve(
    PUBLIC_DIRECTORY,
    normalizedPath
  );

  const publicRoot = path.resolve(
    PUBLIC_DIRECTORY
  );

  if (
    candidate !== publicRoot &&
    !candidate.startsWith(`${publicRoot}${path.sep}`)
  ) {
    return null;
  }

  return candidate;
}


/* ============================================================
   STATIC FRONTEND ROUTE
   ============================================================ */

async function registerFrontend(app) {
  /**
   * Static assets are served directly from /public.
   *
   * Examples:
   *   /css/app.css
   *   /js/app.js
   *   /assets/logo/favicon.svg
   */

  app.get(
    '/css/*',
    async (request, reply) => {
      return sendPublicFile(
        request,
        reply
      );
    }
  );

  app.get(
    '/js/*',
    async (request, reply) => {
      return sendPublicFile(
        request,
        reply
      );
    }
  );

  app.get(
    '/assets/*',
    async (request, reply) => {
      return sendPublicFile(
        request,
        reply
      );
    }
  );


  /**
   * Root application entry.
   */
  app.get(
    '/',
    async (_request, reply) => {
      return sendFile(
        reply,
        INDEX_FILE,
        'text/html; charset=utf-8'
      );
    }
  );


  /**
   * Client-side application routes.
   *
   * The browser application uses routes such as:
   *
   * /connect
   * /professionals
   * /services
   * /jobs
   * /marketplace
   * /projects
   * /property
   * /construction
   * /analytics
   * /intelligence
   * /automation
   * /notifications
   * /settings
   *
   * They are intentionally resolved to index.html.
   *
   * API routes and Socket.IO routes are never handled here.
   */
  const applicationRoutes = [
    '/connect',
    '/professionals',
    '/services',
    '/jobs',
    '/marketplace',
    '/projects',
    '/property',
    '/construction',
    '/analytics',
    '/intelligence',
    '/automation',
    '/notifications',
    '/settings',
    '/profile',
    '/security',
    '/privacy',
    '/terms',
    '/status'
  ];

  for (const route of applicationRoutes) {
    app.get(
      route,
      async (_request, reply) => {
        return sendFile(
          reply,
          INDEX_FILE,
          'text/html; charset=utf-8'
        );
      }
    );
  }
}


/* ============================================================
   FILE RESPONSE
   ============================================================ */

async function sendPublicFile(
  request,
  reply
) {
  const wildcard =
    request.params['*'] ||
    '';

  const requestPath = `/${wildcard}`;

  const filePath =
    resolvePublicFile(
      requestPath
    );

  if (!filePath) {
    return reply
      .code(400)
      .send({
        success: false,
        error: {
          code: 'INVALID_PATH',
          message: 'Invalid resource path.'
        },
        requestId: request.id
      });
  }

  return sendFile(
    reply,
    filePath
  );
}


async function sendFile(
  reply,
  filePath,
  explicitContentType = null
) {
  try {
    const stat = await fs.promises.stat(
      filePath
    );

    if (!stat.isFile()) {
      return reply
        .code(404)
        .send({
          success: false,
          error: {
            code: 'RESOURCE_NOT_FOUND',
            message: 'Resource not found.'
          }
        });
    }

    const extension =
      path.extname(filePath)
        .toLowerCase();

    const contentType =
      explicitContentType ||
      MIME_TYPES[extension] ||
      'application/octet-stream';

    const content =
      await fs.promises.readFile(
        filePath
      );

    return reply
      .type(contentType)
      .send(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return reply
        .code(404)
        .send({
          success: false,
          error: {
            code: 'RESOURCE_NOT_FOUND',
            message: 'Resource not found.'
          }
        });
    }

    throw error;
  }
}


/* ============================================================
   HEALTH STATE
   ============================================================ */

function createHealthState() {
  return {
    startedAt: new Date().toISOString(),
    environment: getEnvironment(),
    realtime: {
      status: 'initializing'
    },
    database: {
      status: 'initializing'
    }
  };
}


/* ============================================================
   HEALTH ENDPOINTS
   ============================================================ */

async function registerHealthRoutes(
  app,
  healthState
) {
  /**
   * Basic health endpoint.
   *
   * Used by Render and external monitoring.
   */
  app.get(
    '/health',
    {
      config: {
        rateLimit: false
      }
    },
    async () => {
      return {
        success: true,
        service: 'nexus-os',
        status: 'operational',
        environment: healthState.environment,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        realtime: healthState.realtime.status,
        database: healthState.database.status
      };
    }
  );


  /**
   * Liveness.
   *
   * Answers:
   * "Is the Node process alive?"
   */
  app.get(
    '/health/live',
    {
      config: {
        rateLimit: false
      }
    },
    async () => {
      return {
        success: true,
        status: 'alive',
        timestamp: new Date().toISOString()
      };
    }
  );


  /**
   * Readiness.
   *
   * Answers:
   * "Is the application ready to receive traffic?"
   */
  app.get(
    '/health/ready',
    {
      config: {
        rateLimit: false
      }
    },
    async (_request, reply) => {
      const databaseReady =
        healthState.database.status === 'ready';

      const realtimeReady =
        healthState.realtime.status === 'ready' ||
        healthState.realtime.status === 'initializing';

      const ready =
        databaseReady &&
        realtimeReady;

      const payload = {
        success: ready,
        status: ready
          ? 'ready'
          : 'not-ready',
        timestamp: new Date().toISOString(),
        dependencies: {
          database:
            healthState.database.status,
          realtime:
            healthState.realtime.status
        }
      };

      return reply
        .code(ready ? 200 : 503)
        .send(payload);
    }
  );


  /**
   * Internal status object.
   *
   * File 13 and the socket/database bootstrap can update
   * this object without rebuilding the Fastify instance.
   */
  app.decorate(
    'healthState',
    healthState
  );
}


/* ============================================================
   REQUEST CONTEXT
   ============================================================ */

async function registerRequestContext(app) {
  app.addHook(
    'onRequest',
    async (request, reply) => {
      const requestId =
        resolveRequestId(request);

      request.id = requestId;

      reply.header(
        'x-request-id',
        requestId
      );

      request.nexus = {
        requestId,
        receivedAt: Date.now()
      };
    }
  );
}


/* ============================================================
   RESPONSE SECURITY
   ============================================================ */

async function registerResponseSecurity(app) {
  app.addHook(
    'onSend',
    async (
      request,
      reply
    ) => {
      reply.header(
        'x-content-type-options',
        'nosniff'
      );

      reply.header(
        'x-frame-options',
        'SAMEORIGIN'
      );

      reply.header(
        'referrer-policy',
        'strict-origin-when-cross-origin'
      );

      reply.header(
        'permissions-policy',
        'camera=(), microphone=(), geolocation=()'
      );

      reply.header(
        'x-request-id',
        request.id
      );
    }
  );
}


/* ============================================================
   ERROR SERIALIZATION
   ============================================================ */

function normalizeError(error) {
  if (!error) {
    return {
      code: 'UNKNOWN_ERROR',
      message: 'An unexpected error occurred.'
    };
  }

  if (
    error.code &&
    error.message
  ) {
    return {
      code: error.code,
      message: error.message
    };
  }

  return {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected server error occurred.'
  };
}


/* ============================================================
   GLOBAL ERROR HANDLER
   ============================================================ */

function registerErrorHandler(app) {
  app.setErrorHandler(
    async (
      error,
      request,
      reply
    ) => {
      const statusCode =
        Number.isInteger(error.statusCode)
          ? error.statusCode
          : 500;

      const normalized =
        normalizeError(error);

      request.log.error(
        {
          err: error,
          requestId: request.id,
          method: request.method,
          url: request.url
        },
        'NEXUS request error'
      );

      const safeStatus =
        statusCode >= 400 &&
        statusCode < 600
          ? statusCode
          : 500;

      const response = {
        success: false,
        error: {
          code: normalized.code,
          message:
            isProduction() &&
            safeStatus >= 500
              ? 'An internal server error occurred.'
              : normalized.message
        },
        requestId: request.id,
        timestamp: new Date().toISOString()
      };

      return reply
        .code(safeStatus)
        .send(response);
    }
  );


  app.setNotFoundHandler(
    async (
      request,
      reply
    ) => {
      /**
       * API requests should receive JSON rather than
       * accidentally receiving the frontend application.
       */
      if (
        request.url.startsWith('/api/')
      ) {
        return reply
          .code(404)
          .send({
            success: false,
            error: {
              code: 'API_ROUTE_NOT_FOUND',
              message: 'API endpoint not found.'
            },
            requestId: request.id,
            timestamp: new Date().toISOString()
          });
      }


      /**
       * Socket.IO requests are owned by Socket.IO once
       * File 13 attaches it to the HTTP server.
       */
      if (
        request.url.startsWith('/socket.io/')
      ) {
        return reply
          .code(404)
          .send({
            success: false,
            error: {
              code: 'REALTIME_ENDPOINT_UNAVAILABLE',
              message: 'Realtime transport is unavailable.'
            },
            requestId: request.id
          });
      }


      /**
       * Unknown browser routes return the NEXUS shell.
       *
       * This supports future client-side routes without
       * requiring a separate web server.
       */
      if (
        request.method === 'GET' &&
        fs.existsSync(INDEX_FILE)
      ) {
        return sendFile(
          reply,
          INDEX_FILE,
          'text/html; charset=utf-8'
        );
      }


      return reply
        .code(404)
        .send({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Resource not found.'
          },
          requestId: request.id,
          timestamp: new Date().toISOString()
        });
    }
  );
}


/* ============================================================
   APPLICATION FACTORY
   ============================================================ */

export async function createApp(
  options = {}
) {
  const environment =
    getEnvironment();

  const loggerEnabled =
    options.logger ??
    DEFAULT_OPTIONS.logger;


  /* ----------------------------------------------------------
     Fastify
     ---------------------------------------------------------- */

  const app = Fastify({
    logger: loggerEnabled
      ? {
          level:
            process.env.LOG_LEVEL ||
            getConfigValue(
              config,
              'logging',
              'level'
            ) ||
            'info',

          transport:
            environment === 'development'
              ? {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    translateTime: 'SYS:standard',
                    ignore: 'pid,hostname'
                  }
                }
              : undefined
        }
      : false,

    trustProxy:
      options.trustProxy ??
      DEFAULT_OPTIONS.trustProxy,

    disableRequestLogging: false,

    requestIdHeader: 'x-request-id',

    requestIdLogLabel: 'requestId'
  });


  /* ----------------------------------------------------------
     CORS
     ---------------------------------------------------------- */

  await app.register(
    cors,
    {
      origin:
        getAllowedOrigins(),

      credentials: true,

      methods: [
        'GET',
        'HEAD',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
        'OPTIONS'
      ],

      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'X-Request-ID',
        'X-Correlation-ID',
        'X-Idempotency-Key'
      ],

      exposedHeaders: [
        'X-Request-ID'
      ]
    }
  );


  /* ----------------------------------------------------------
     SECURITY HEADERS
     ---------------------------------------------------------- */

  await app.register(
    helmet,
    {
      global: true,

      contentSecurityPolicy: false,

      crossOriginEmbedderPolicy: false,

      referrerPolicy: {
        policy:
          'strict-origin-when-cross-origin'
      }
    }
  );


  /* ----------------------------------------------------------
     RATE LIMITING
     ---------------------------------------------------------- */

  await app.register(
    rateLimit,
    {
      max: Number(
        process.env.RATE_LIMIT_MAX ||
        getConfigValue(
          config,
          'security',
          'rateLimit',
          'max'
        ) ||
        120
      ),

      timeWindow:
        process.env.RATE_LIMIT_WINDOW ||
        '1 minute',

      allowList: [
        '127.0.0.1'
      ],

      errorResponseBuilder:
        (_request, context) => ({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message:
              `Too many requests. Retry after ${context.after}.`
          }
        })
    }
  );


  /* ----------------------------------------------------------
     HEALTH STATE
     ---------------------------------------------------------- */

  const healthState =
    createHealthState();


  /* ----------------------------------------------------------
     DECORATORS
     ---------------------------------------------------------- */

  if (!app.hasDecorator('nexus')) {
    app.decorate(
      'nexus',
      {
        name: 'NEXUS OS',
        version: '1.0.0',
        environment
      }
    );
  }


  /* ----------------------------------------------------------
     REQUEST CONTEXT
     ---------------------------------------------------------- */

  await registerRequestContext(
    app
  );


  /* ----------------------------------------------------------
     RESPONSE SECURITY
     ---------------------------------------------------------- */

  await registerResponseSecurity(
    app
  );


  /* ----------------------------------------------------------
     APPLICATION MIDDLEWARE
     ---------------------------------------------------------- */

  if (
    typeof registerMiddleware ===
    'function'
  ) {
    await registerMiddleware(
      app
    );
  }


  /* ----------------------------------------------------------
     HEALTH
     ---------------------------------------------------------- */

  await registerHealthRoutes(
    app,
    healthState
  );


  /* ----------------------------------------------------------
     API ROUTES
     ---------------------------------------------------------- */

  if (
    typeof registerRoutes ===
    'function'
  ) {
    await registerRoutes(
      app
    );
  }


  /* ----------------------------------------------------------
     FRONTEND
     ---------------------------------------------------------- */

  await registerFrontend(
    app
  );


  /* ----------------------------------------------------------
     ERRORS
     ---------------------------------------------------------- */

  registerErrorHandler(
    app
  );


  /* ----------------------------------------------------------
     APPLICATION READY HOOK
     ---------------------------------------------------------- */

  app.addHook(
    'onReady',
    async () => {
      app.log.info(
        {
          environment,
          publicDirectory:
            PUBLIC_DIRECTORY,
          indexFile:
            INDEX_FILE
        },
        'NEXUS OS application initialized'
      );
    }
  );


  /* ----------------------------------------------------------
     GRACEFUL CLOSE
     ---------------------------------------------------------- */

  app.addHook(
    'onClose',
    async () => {
      app.log.info(
        'NEXUS OS application shutting down'
      );
    }
  );


  return app;
}


/* ============================================================
   DEFAULT EXPORT
   ============================================================ */

export default createApp;
