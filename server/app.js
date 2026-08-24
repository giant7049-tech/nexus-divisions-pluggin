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
 *     - Configure CORS
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

const config = require('./config');

const APP_NAME =
    config.app.name;

const NODE_ENV =
    config.app.environment;

const PUBLIC_DIR =
    config.frontend.publicDirectory;

const FRONTEND_ENTRY =
    config.frontend.entry;

const API_PREFIX =
    config.api.prefix;


/**
 * ================================================================
 * MIDDLEWARE
 * ================================================================
 *
 * These names MUST match the exports from middleware.js.
 * ================================================================
 */

const {
    securityHeaders,
    corsMiddleware,
    requestId,
    requestLogger,
    apiRateLimiter,
    errorHandler,
    notFoundHandler
} = require('./middleware');


/**
 * ================================================================
 * API ROUTES
 * ================================================================
 *
 * routes.js exports the Express router directly.
 * ================================================================
 */

const apiRouter =
    require('./routes');


/**
 * ================================================================
 * APPLICATION INSTANCE
 * ================================================================
 */

const app =
    express();


/**
 * ================================================================
 * APPLICATION METADATA
 * ================================================================
 */

app.disable(
    'x-powered-by'
);

app.set(
    'trust proxy',
    1
);

app.set(
    'etag',
    'strong'
);

app.locals.appName =
    APP_NAME;

app.locals.environment =
    NODE_ENV;


/**
 * ================================================================
 * CORE SECURITY
 * ================================================================
 *
 * Security headers are defined in middleware.js.
 * ================================================================
 */

app.use(
    securityHeaders
);


/**
 * ================================================================
 * CORS
 * ================================================================
 *
 * CORS is defined in middleware.js and uses the configured
 * CORS_ORIGINS environment setting.
 * ================================================================
 */

app.use(
    corsMiddleware
);


/**
 * ================================================================
 * REQUEST IDENTIFICATION
 * ================================================================
 *
 * Every request receives a unique request ID.
 * ================================================================
 */

app.use(
    requestId
);


/**
 * ================================================================
 * REQUEST LOGGING
 * ================================================================
 */

app.use(
    requestLogger
);


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
 * Render and monitoring systems can use:
 *
 *     GET /health
 *
 * to determine whether the Node.js process is responding.
 *
 * This endpoint does NOT perform an expensive database query.
 * ================================================================
 */

app.get(
    '/health',
    (req, res) => {

        res.status(200).json({

            success:
                true,

            service:
                APP_NAME,

            status:
                'healthy',

            environment:
                NODE_ENV,

            timestamp:
                new Date().toISOString(),

            requestId:
                req.requestId || null

        });

    }
);


/**
 * ================================================================
 * READINESS ENDPOINT
 * ================================================================
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

app.get(
    '/ready',
    async (req, res, next) => {

        try {

            const {
                isDatabaseReady
            } = require('./services');


            const databaseReady =
                await isDatabaseReady();


            if (!databaseReady) {

                return res.status(503).json({

                    success:
                        false,

                    service:
                        APP_NAME,

                    status:
                        'not_ready',

                    dependencies: {

                        database:
                            false

                    },

                    timestamp:
                        new Date().toISOString(),

                    requestId:
                        req.requestId || null

                });

            }


            return res.status(200).json({

                success:
                    true,

                service:
                    APP_NAME,

                status:
                    'ready',

                dependencies: {

                    database:
                        true

                },

                timestamp:
                    new Date().toISOString(),

                requestId:
                    req.requestId || null

            });


        } catch (error) {

            return next(
                error
            );

        }

    }
);


/**
 * ================================================================
 * API RATE LIMITING
 * ================================================================
 *
 * Rate limiting is applied before API routes.
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
 * The public directory contains:
 *
 *     index.html
 *     css/
 *     js/
 *     assets/
 *
 * Express serves these files directly.
 * ================================================================
 */

app.use(
    express.static(
        PUBLIC_DIR,
        {
            index:
                false,

            extensions: [
                'html'
            ],

            maxAge:
                NODE_ENV === 'production'
                    ? '7d'
                    : 0,

            etag:
                true,

            redirect:
                false
        }
    )
);


/**
 * ================================================================
 * FRONTEND APPLICATION ROUTING
 * ================================================================
 *
 * Browser routes such as:
 *
 *     /connect
 *     /connect/@username
 *     /messages
 *     /people
 *     /discover
 *     /settings
 *
 * can be handled by the frontend application.
 *
 * IMPORTANT:
 *
 * Express 5 does NOT accept:
 *
 *     app.get('*', ...)
 *
 * Therefore we use:
 *
 *     app.get('/{*splat}', ...)
 *
 * This is the Express 5-compatible wildcard route.
 *
 * API requests are NOT allowed to fall through to this handler.
 * ================================================================
 */

app.get(
    '/{*splat}',
    (req, res, next) => {

        const requestPath =
            req.path || '';


        /**
         * --------------------------------------------------------
         * API REQUESTS
         * --------------------------------------------------------
         */

        if (
            requestPath === API_PREFIX ||
            requestPath.startsWith(
                `${API_PREFIX}/`
            )
        ) {

            return next();

        }


        /**
         * --------------------------------------------------------
         * HEALTH / READY
         * --------------------------------------------------------
         */

        if (
            requestPath === '/health' ||
            requestPath === '/ready'
        ) {

            return next();

        }


        /**
         * --------------------------------------------------------
         * BROWSER GET REQUESTS
         * --------------------------------------------------------
         */

        if (
            req.method !== 'GET' ||
            !req.headers.accept ||
            !req.headers.accept.includes(
                'text/html'
            )
        ) {

            return next();

        }


        /**
         * --------------------------------------------------------
         * FRONTEND ENTRY
         * --------------------------------------------------------
         */

        return res.sendFile(
            path.join(
                PUBLIC_DIR,
                FRONTEND_ENTRY
            )
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

app.use(
    notFoundHandler
);


/**
 * ================================================================
 * GLOBAL ERROR HANDLER
 * ================================================================
 *
 * This MUST remain the final middleware.
 * ================================================================
 */

app.use(
    errorHandler
);


/**
 * ================================================================
 * EXPORT
 * ================================================================
 */

module.exports =
    app;
