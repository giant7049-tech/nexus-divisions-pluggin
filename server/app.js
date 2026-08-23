'use strict';

/**
 * ================================================================
 * NEXUS CONNECT
 * Application Core
 * ================================================================
 *
 * File:
 *     server/app.js
 *
 * Responsibility:
 *     - Create and configure the Express application
 *     - Configure security middleware
 *     - Configure JSON/body parsing
 *     - Serve the Nexus Connect frontend
 *     - Mount API routes
 *     - Provide health/readiness endpoints
 *     - Provide centralized error handling
 *     - Provide production-safe 404 handling
 *
 * This file DOES NOT start the server.
 *
 * server.js is responsible for:
 *     - Database startup
 *     - HTTP server creation
 *     - Socket.IO initialization
 *     - Listening on the Render port
 *     - Graceful shutdown
 *
 * ================================================================
 */

const express = require('express');
const path = require('path');

const {
    APP_NAME,
    NODE_ENV,
    PUBLIC_DIR,
    API_PREFIX
} = require('./config');

const {
    securityMiddleware,
    requestIdMiddleware,
    requestLoggerMiddleware,
    apiRateLimiter,
    errorHandler,
    notFoundHandler
} = require('./middleware');

const {
    router: apiRouter
} = require('./routes');


/**
 * ================================================================
 * APPLICATION INSTANCE
 * ================================================================
 */

const app = express();


/**
 * ================================================================
 * APPLICATION METADATA
 * ================================================================
 */

app.disable('x-powered-by');

app.set('trust proxy', 1);

app.set('etag', 'strong');

app.locals.appName = APP_NAME;
app.locals.environment = NODE_ENV;


/**
 * ================================================================
 * CORE SECURITY
 * ================================================================
 *
 * securityMiddleware is responsible for the application's
 * HTTP security headers and related protection.
 *
 * It should remain centralized in middleware.js.
 * ================================================================
 */

app.use(securityMiddleware);


/**
 * ================================================================
 * REQUEST IDENTIFICATION
 * ================================================================
 *
 * Every request receives a unique identifier.
 *
 * This becomes extremely useful when debugging:
 *
 *     browser
 *        ↓
 *     request ID
 *        ↓
 *     API
 *        ↓
 *     database
 *        ↓
 *     logs
 *
 * The same ID can be used to trace a failed request.
 * ================================================================
 */

app.use(requestIdMiddleware);


/**
 * ================================================================
 * REQUEST LOGGING
 * ================================================================
 */

app.use(requestLoggerMiddleware);


/**
 * ================================================================
 * BODY PARSERS
 * ================================================================
 *
 * JSON:
 *     REST API requests
 *
 * URL encoded:
 *     traditional form submissions / compatibility
 *
 * Limits are intentionally controlled so a client cannot send
 * unlimited request bodies.
 * ================================================================
 */

app.use(
    express.json({
        limit: '2mb',
        strict: true
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: '2mb'
    })
);


/**
 * ================================================================
 * HEALTH ENDPOINT
 * ================================================================
 *
 * This endpoint is intentionally lightweight.
 *
 * Render and monitoring systems can use:
 *
 *     GET /health
 *
 * to determine whether the Node.js process is responding.
 *
 * It does NOT perform an expensive database query.
 * ================================================================
 */

app.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        service: APP_NAME,
        status: 'healthy',
        environment: NODE_ENV,
        timestamp: new Date().toISOString(),
        requestId: req.id || null
    });
});


/**
 * ================================================================
 * READINESS ENDPOINT
 * ================================================================
 *
 * This endpoint is different from /health.
 *
 * /health:
 *     "Is the Node process alive?"
 *
 * /ready:
 *     "Is the application ready to receive normal traffic?"
 *
 * Database readiness is exposed through the services layer.
 * ================================================================
 */

app.get('/ready', async (req, res, next) => {
    try {
        const {
            isDatabaseReady
        } = require('./services');

        const databaseReady = await isDatabaseReady();

        if (!databaseReady) {
            return res.status(503).json({
                success: false,
                service: APP_NAME,
                status: 'not_ready',
                dependencies: {
                    database: false
                },
                timestamp: new Date().toISOString(),
                requestId: req.id || null
            });
        }

        return res.status(200).json({
            success: true,
            service: APP_NAME,
            status: 'ready',
            dependencies: {
                database: true
            },
            timestamp: new Date().toISOString(),
            requestId: req.id || null
        });
    } catch (error) {
        return next(error);
    }
});


/**
 * ================================================================
 * API RATE LIMITING
 * ================================================================
 *
 * Rate limiting is applied before API routes.
 *
 * More sensitive authentication endpoints can additionally use
 * stricter route-level limits inside routes.js.
 * ================================================================
 */

app.use(
    API_PREFIX,
    apiRateLimiter
);


/**
 * ================================================================
 * API ROUTES
 * ================================================================
 *
 * All application API endpoints are mounted under:
 *
 *     /api
 *
 * or whatever API_PREFIX is configured to.
 *
 * Example:
 *
 *     /api/auth/register
 *     /api/auth/login
 *     /api/users/me
 *     /api/messages
 *     /api/groups
 * ================================================================
 */

app.use(
    API_PREFIX,
    apiRouter
);


/**
 * ================================================================
 * STATIC FRONTEND
 * ================================================================
 *
 * Nexus Connect is a unified application:
 *
 *     Express
 *        │
 *        ├── API
 *        │
 *        └── Frontend
 *
 * The public directory contains:
 *
 *     index.html
 *     css/
 *     js/
 *     assets/
 *
 * This allows Render to serve the frontend and backend from
 * the same application/domain.
 * ================================================================
 */

app.use(
    express.static(PUBLIC_DIR, {
        index: false,
        extensions: ['html'],
        maxAge: NODE_ENV === 'production'
            ? '7d'
            : 0,
        etag: true,
        redirect: false
    })
);


/**
 * ================================================================
 * FRONTEND APPLICATION ROUTING
 * ================================================================
 *
 * Nexus Connect is designed as a frontend application.
 *
 * Routes such as:
 *
 *     /connect
 *     /connect/@username
 *     /messages
 *     /people
 *     /discover
 *     /settings
 *
 * may eventually be handled by the frontend.
 *
 * We therefore return index.html for non-API browser navigation
 * requests.
 *
 * API requests are NOT allowed to fall through to this handler.
 * ================================================================
 */

app.get(
    '*',
    (req, res, next) => {
        const requestPath = req.path || '';

        /**
         * Never return the frontend for API requests.
         */

        if (
            requestPath === API_PREFIX ||
            requestPath.startsWith(`${API_PREFIX}/`)
        ) {
            return next();
        }

        /**
         * Never return the frontend for health/readiness endpoints.
         */

        if (
            requestPath === '/health' ||
            requestPath === '/ready'
        ) {
            return next();
        }

        /**
         * Only handle browser-style GET requests.
         */

        if (
            req.method !== 'GET' ||
            req.headers.accept?.includes('text/html') !== true
        ) {
            return next();
        }

        return res.sendFile(
            path.join(PUBLIC_DIR, 'index.html')
        );
    }
);


/**
 * ================================================================
 * 404 HANDLER
 * ================================================================
 *
 * Anything that reaches this point was not handled by:
 *
 *     - health
 *     - readiness
 *     - API
 *     - static frontend
 *     - frontend application routing
 *
 * It is therefore a genuine 404.
 * ================================================================
 */

app.use(notFoundHandler);


/**
 * ================================================================
 * GLOBAL ERROR HANDLER
 * ================================================================
 *
 * This MUST remain the final middleware.
 *
 * It prevents raw server errors from being exposed to users.
 *
 * Development:
 *     detailed logging
 *
 * Production:
 *     safe public error response
 *
 * The internal error is still logged server-side.
 * ================================================================
 */

app.use(errorHandler);


/**
 * ================================================================
 * EXPORT
 * ================================================================
 *
 * server.js imports this application instance:
 *
 *     const app = require('./app');
 *
 * and then creates the HTTP server.
 * ================================================================
 */

module.exports = app;
