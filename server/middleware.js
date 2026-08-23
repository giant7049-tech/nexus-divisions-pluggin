'use strict';

/**
 * ============================================================
 * NEXUS CONNECT
 * Middleware Layer
 * ============================================================
 *
 * Responsibilities:
 * - HTTP security
 * - Request identification
 * - CORS
 * - JSON/body protection
 * - Authentication
 * - Authorization
 * - Rate limiting
 * - Validation helpers
 * - Error handling
 * - 404 handling
 * - Security headers
 * - Request logging
 *
 * Architecture:
 *
 * Client
 *   ↓
 * Security middleware
 *   ↓
 * Request context
 *   ↓
 * Authentication
 *   ↓
 * Authorization
 *   ↓
 * Route controller
 *   ↓
 * Service layer
 *
 * This file intentionally contains infrastructure-level
 * middleware only. Business logic belongs in services.js.
 * ============================================================
 */

const crypto = require('crypto');

let jwt;
try {
    jwt = require('jsonwebtoken');
} catch (error) {
    jwt = null;
}

/**
 * ------------------------------------------------------------
 * ENVIRONMENT
 * ------------------------------------------------------------
 */

const NODE_ENV = process.env.NODE_ENV || 'development';

const isProduction = NODE_ENV === 'production';

const JWT_SECRET =
    process.env.JWT_SECRET ||
    'NEXUS_CONNECT_DEVELOPMENT_SECRET_CHANGE_ME';

const JWT_ISSUER =
    process.env.JWT_ISSUER ||
    'nexus-connect';

const JWT_AUDIENCE =
    process.env.JWT_AUDIENCE ||
    'nexus-connect-client';

/**
 * ------------------------------------------------------------
 * CUSTOM ERROR
 * ------------------------------------------------------------
 */

class NexusError extends Error {
    constructor(
        message,
        statusCode = 500,
        code = 'INTERNAL_ERROR',
        details = null
    ) {
        super(message);

        this.name = 'NexusError';
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;

        Error.captureStackTrace(this, NexusError);
    }
}

/**
 * ------------------------------------------------------------
 * REQUEST ID
 * ------------------------------------------------------------
 */

function requestId(req, res, next) {
    const incomingId =
        req.headers['x-request-id'] ||
        req.headers['x-correlation-id'];

    const id =
        typeof incomingId === 'string' && incomingId.length <= 128
            ? incomingId
            : crypto.randomUUID();

    req.requestId = id;

    res.setHeader('X-Request-ID', id);

    next();
}

/**
 * ------------------------------------------------------------
 * SECURITY HEADERS
 * ------------------------------------------------------------
 */

function securityHeaders(req, res, next) {
    res.setHeader(
        'X-Content-Type-Options',
        'nosniff'
    );

    res.setHeader(
        'X-Frame-Options',
        'SAMEORIGIN'
    );

    res.setHeader(
        'Referrer-Policy',
        'strict-origin-when-cross-origin'
    );

    res.setHeader(
        'Permissions-Policy',
        [
            'camera=(self)',
            'microphone=(self)',
            'geolocation=(self)',
            'payment=()',
            'usb=()'
        ].join(', ')
    );

    res.setHeader(
        'Cross-Origin-Opener-Policy',
        'same-origin'
    );

    res.setHeader(
        'Cross-Origin-Resource-Policy',
        'same-site'
    );

    if (isProduction) {
        res.setHeader(
            'Strict-Transport-Security',
            'max-age=31536000; includeSubDomains'
        );
    }

    next();
}

/**
 * ------------------------------------------------------------
 * CORS
 * ------------------------------------------------------------
 */

function corsMiddleware(req, res, next) {
    const configuredOrigins = (
        process.env.CORS_ORIGINS ||
        ''
    )
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean);

    const requestOrigin = req.headers.origin;

    /**
     * Development convenience.
     */
    if (
        !isProduction &&
        configuredOrigins.length === 0
    ) {
        res.setHeader(
            'Access-Control-Allow-Origin',
            requestOrigin || '*'
        );
    }

    /**
     * Production allow-list.
     */
    else if (
        requestOrigin &&
        configuredOrigins.includes(requestOrigin)
    ) {
        res.setHeader(
            'Access-Control-Allow-Origin',
            requestOrigin
        );

        res.setHeader(
            'Access-Control-Allow-Credentials',
            'true'
        );

        res.setHeader(
            'Vary',
            'Origin'
        );
    }

    res.setHeader(
        'Access-Control-Allow-Methods',
        'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    );

    res.setHeader(
        'Access-Control-Allow-Headers',
        [
            'Content-Type',
            'Authorization',
            'X-Request-ID',
            'X-Correlation-ID'
        ].join(', ')
    );

    res.setHeader(
        'Access-Control-Expose-Headers',
        'X-Request-ID'
    );

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    next();
}

/**
 * ------------------------------------------------------------
 * REQUEST SIZE PROTECTION
 * ------------------------------------------------------------
 */

function requestSizeGuard(maxBytes = 2 * 1024 * 1024) {
    return function sizeGuard(req, res, next) {
        const contentLength =
            Number(req.headers['content-length'] || 0);

        if (
            Number.isFinite(contentLength) &&
            contentLength > maxBytes
        ) {
            return next(
                new NexusError(
                    'Request payload is too large.',
                    413,
                    'PAYLOAD_TOO_LARGE'
                )
            );
        }

        next();
    };
}

/**
 * ------------------------------------------------------------
 * REQUEST LOGGER
 * ------------------------------------------------------------
 */

function requestLogger(req, res, next) {
    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
        const finishedAt = process.hrtime.bigint();

        const durationMs =
            Number(finishedAt - startedAt) / 1_000_000;

        const logEntry = {
            timestamp: new Date().toISOString(),
            requestId: req.requestId,
            method: req.method,
            path: req.originalUrl,
            status: res.statusCode,
            durationMs: Number(durationMs.toFixed(2)),
            ip: getClientIp(req),
            userAgent:
                req.headers['user-agent'] || null
        };

        /**
         * Do not log sensitive request bodies,
         * authorization headers or PINs.
         */
        if (res.statusCode >= 500) {
            console.error(
                '[NEXUS][HTTP][ERROR]',
                JSON.stringify(logEntry)
            );
        } else if (!isProduction) {
            console.log(
                '[NEXUS][HTTP]',
                JSON.stringify(logEntry)
            );
        }
    });

    next();
}

/**
 * ------------------------------------------------------------
 * CLIENT IP
 * ------------------------------------------------------------
 */

function getClientIp(req) {
    const forwarded =
        req.headers['x-forwarded-for'];

    if (typeof forwarded === 'string') {
        return forwarded
            .split(',')[0]
            .trim();
    }

    return (
        req.socket?.remoteAddress ||
        req.ip ||
        'unknown'
    );
}

/**
 * ------------------------------------------------------------
 * JWT TOKEN EXTRACTION
 * ------------------------------------------------------------
 */

function extractBearerToken(req) {
    const authorization =
        req.headers.authorization;

    if (
        typeof authorization !== 'string'
    ) {
        return null;
    }

    const parts =
        authorization.trim().split(/\s+/);

    if (
        parts.length !== 2 ||
        parts[0].toLowerCase() !== 'bearer'
    ) {
        return null;
    }

    return parts[1];
}

/**
 * ------------------------------------------------------------
 * JWT VERIFICATION
 * ------------------------------------------------------------
 */

function verifyToken(token) {
    if (!jwt) {
        throw new NexusError(
            'Authentication service is not configured.',
            500,
            'AUTH_CONFIGURATION_ERROR'
        );
    }

    return jwt.verify(
        token,
        JWT_SECRET,
        {
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE,
            algorithms: ['HS256']
        }
    );
}

/**
 * ------------------------------------------------------------
 * AUTHENTICATION
 * ------------------------------------------------------------
 *
 * Required authentication.
 */

function authenticate(req, res, next) {
    try {
        const token =
            extractBearerToken(req);

        if (!token) {
            return next(
                new NexusError(
                    'Authentication required.',
                    401,
                    'AUTHENTICATION_REQUIRED'
                )
            );
        }

        const payload =
            verifyToken(token);

        if (
            !payload ||
            !payload.sub
        ) {
            return next(
                new NexusError(
                    'Invalid authentication token.',
                    401,
                    'INVALID_TOKEN'
                )
            );
        }

        req.auth = {
            userId: String(payload.sub),
            sessionId:
                payload.sid
                    ? String(payload.sid)
                    : null,

            username:
                payload.username || null,

            roles:
                Array.isArray(payload.roles)
                    ? payload.roles
                    : [],

            permissions:
                Array.isArray(payload.permissions)
                    ? payload.permissions
                    : [],

            tokenIssuedAt:
                payload.iat || null,

            tokenExpiresAt:
                payload.exp || null
        };

        next();

    } catch (error) {
        if (
            error.name === 'TokenExpiredError'
        ) {
            return next(
                new NexusError(
                    'Your session has expired.',
                    401,
                    'TOKEN_EXPIRED'
                )
            );
        }

        if (
            error.name === 'JsonWebTokenError'
        ) {
            return next(
                new NexusError(
                    'Invalid authentication token.',
                    401,
                    'INVALID_TOKEN'
                )
            );
        }

        next(error);
    }
}

/**
 * ------------------------------------------------------------
 * OPTIONAL AUTHENTICATION
 * ------------------------------------------------------------
 *
 * Useful for public routes that can provide enhanced
 * functionality when a user is logged in.
 */

function optionalAuthenticate(req, res, next) {
    try {
        const token =
            extractBearerToken(req);

        if (!token) {
            req.auth = null;
            return next();
        }

        const payload =
            verifyToken(token);

        if (
            payload &&
            payload.sub
        ) {
            req.auth = {
                userId: String(payload.sub),
                sessionId:
                    payload.sid
                        ? String(payload.sid)
                        : null,

                username:
                    payload.username || null,

                roles:
                    Array.isArray(payload.roles)
                        ? payload.roles
                        : [],

                permissions:
                    Array.isArray(payload.permissions)
                        ? payload.permissions
                        : []
            };
        } else {
            req.auth = null;
        }

        next();

    } catch (error) {
        /**
         * Optional authentication should not prevent
         * public resources from loading.
         */
        req.auth = null;
        next();
    }
}

/**
 * ------------------------------------------------------------
 * ROLE AUTHORIZATION
 * ------------------------------------------------------------
 */

function requireRole(...requiredRoles) {
    return function roleMiddleware(
        req,
        res,
        next
    ) {
        if (!req.auth) {
            return next(
                new NexusError(
                    'Authentication required.',
                    401,
                    'AUTHENTICATION_REQUIRED'
                )
            );
        }

        const roles =
            Array.isArray(req.auth.roles)
                ? req.auth.roles
                : [];

        const authorized =
            requiredRoles.some(
                role => roles.includes(role)
            );

        if (!authorized) {
            return next(
                new NexusError(
                    'You do not have permission to perform this action.',
                    403,
                    'FORBIDDEN'
                )
            );
        }

        next();
    };
}

/**
 * ------------------------------------------------------------
 * PERMISSION AUTHORIZATION
 * ------------------------------------------------------------
 */

function requirePermission(
    ...requiredPermissions
) {
    return function permissionMiddleware(
        req,
        res,
        next
    ) {
        if (!req.auth) {
            return next(
                new NexusError(
                    'Authentication required.',
                    401,
                    'AUTHENTICATION_REQUIRED'
                )
            );
        }

        const permissions =
            Array.isArray(
                req.auth.permissions
            )
                ? req.auth.permissions
                : [];

        const authorized =
            requiredPermissions.every(
                permission =>
                    permissions.includes(permission)
            );

        if (!authorized) {
            return next(
                new NexusError(
                    'Insufficient permissions.',
                    403,
                    'INSUFFICIENT_PERMISSIONS'
                )
            );
        }

        next();
    };
}

/**
 * ------------------------------------------------------------
 * SELF-ACCESS GUARD
 * ------------------------------------------------------------
 */

function requireSelf(
    parameterName = 'userId'
) {
    return function selfMiddleware(
        req,
        res,
        next
    ) {
        if (!req.auth) {
            return next(
                new NexusError(
                    'Authentication required.',
                    401,
                    'AUTHENTICATION_REQUIRED'
                )
            );
        }

        const requestedUserId =
            req.params[parameterName] ||
            req.body?.[parameterName] ||
            req.query?.[parameterName];

        if (
            !requestedUserId ||
            String(requestedUserId) !==
                String(req.auth.userId)
        ) {
            return next(
                new NexusError(
                    'You can only perform this action for your own account.',
                    403,
                    'SELF_ACCESS_REQUIRED'
                )
            );
        }

        next();
    };
}

/**
 * ------------------------------------------------------------
 * RATE LIMITER
 * ------------------------------------------------------------
 *
 * Lightweight in-memory limiter for the initial
 * single-instance deployment.
 *
 * For a multi-instance production deployment,
 * replace this with Redis-backed rate limiting.
 */

function createRateLimiter(options = {}) {
    const windowMs =
        options.windowMs ||
        60 * 1000;

    const max =
        options.max ||
        100;

    const message =
        options.message ||
        'Too many requests. Please try again later.';

    const clients =
        new Map();

    return function rateLimiter(
        req,
        res,
        next
    ) {
        const key =
            `${getClientIp(req)}:${req.path}`;

        const now =
            Date.now();

        let record =
            clients.get(key);

        if (
            !record ||
            now - record.startedAt >= windowMs
        ) {
            record = {
                startedAt: now,
                count: 0
            };

            clients.set(
                key,
                record
            );
        }

        record.count += 1;

        const remaining =
            Math.max(
                0,
                max - record.count
            );

        res.setHeader(
            'X-RateLimit-Limit',
            String(max)
        );

        res.setHeader(
            'X-RateLimit-Remaining',
            String(remaining)
        );

        if (record.count > max) {
            res.setHeader(
                'Retry-After',
                String(
                    Math.ceil(
                        (
                            windowMs -
                            (now - record.startedAt)
                        ) / 1000
                    )
                )
            );

            return next(
                new NexusError(
                    message,
                    429,
                    'RATE_LIMITED'
                )
            );
        }

        next();
    };
}

/**
 * ------------------------------------------------------------
 * AUTHENTICATION RATE LIMITER
 * ------------------------------------------------------------
 *
 * More restrictive than the global limiter.
 */

const authenticationRateLimiter =
    createRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 20,
        message:
            'Too many authentication attempts. Please wait before trying again.'
    });

/**
 * ------------------------------------------------------------
 * API RATE LIMITER
 * ------------------------------------------------------------
 */

const apiRateLimiter =
    createRateLimiter({
        windowMs: 60 * 1000,
        max: 120
    });

/**
 * ------------------------------------------------------------
 * VALIDATION HELPERS
 * ------------------------------------------------------------
 */

function validateBody(
    schema
) {
    return function bodyValidation(
        req,
        res,
        next
    ) {
        try {
            if (
                !schema ||
                typeof schema !== 'function'
            ) {
                return next(
                    new NexusError(
                        'Validation schema is not configured.',
                        500,
                        'VALIDATION_CONFIGURATION_ERROR'
                    )
                );
            }

            const result =
                schema(req.body);

            if (
                result === true
            ) {
                return next();
            }

            if (
                result &&
                result.valid === true
            ) {
                if (result.value) {
                    req.body =
                        result.value;
                }

                return next();
            }

            return next(
                new NexusError(
                    'Invalid request data.',
                    400,
                    'VALIDATION_ERROR',
                    result?.errors || null
                )
            );

        } catch (error) {
            next(error);
        }
    };
}

/**
 * ------------------------------------------------------------
 * PIN FORMAT VALIDATION
 * ------------------------------------------------------------
 *
 * The PIN is deliberately validated here but never logged.
 */

function validatePin(pin) {
    return (
        typeof pin === 'string' &&
        /^\d{4}$/.test(pin)
    );
}

/**
 * ------------------------------------------------------------
 * USERNAME VALIDATION
 * ------------------------------------------------------------
 */

function validateUsername(username) {
    return (
        typeof username === 'string' &&
        /^[a-zA-Z0-9_]{3,30}$/.test(
            username
        )
    );
}

/**
 * ------------------------------------------------------------
 * EMAIL VALIDATION
 * ------------------------------------------------------------
 */

function validateEmail(email) {
    return (
        typeof email === 'string' &&
        email.length <= 254 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            email
        )
    );
}

/**
 * ------------------------------------------------------------
 * INPUT NORMALIZATION
 * ------------------------------------------------------------
 */

function normalizeBody(req, res, next) {
    if (
        req.body &&
        typeof req.body === 'object' &&
        !Array.isArray(req.body)
    ) {
        for (
            const key of Object.keys(req.body)
        ) {
            if (
                typeof req.body[key] ===
                'string'
            ) {
                req.body[key] =
                    req.body[key].trim();
            }
        }
    }

    next();
}

/**
 * ------------------------------------------------------------
 * CONTENT TYPE GUARD
 * ------------------------------------------------------------
 */

function jsonOnly(req, res, next) {
    if (
        ['POST', 'PUT', 'PATCH'].includes(
            req.method
        )
    ) {
        const contentType =
            req.headers['content-type'] ||
            '';

        if (
            !contentType
                .toLowerCase()
                .startsWith(
                    'application/json'
                )
        ) {
            return next(
                new NexusError(
                    'This endpoint requires JSON data.',
                    415,
                    'UNSUPPORTED_MEDIA_TYPE'
                )
            );
        }
    }

    next();
}

/**
 * ------------------------------------------------------------
 * 404 HANDLER
 * ------------------------------------------------------------
 */

function notFoundHandler(
    req,
    res,
    next
) {
    next(
        new NexusError(
            `Route not found: ${req.method} ${req.originalUrl}`,
            404,
            'ROUTE_NOT_FOUND'
        )
    );
}

/**
 * ------------------------------------------------------------
 * ERROR HANDLER
 * ------------------------------------------------------------
 */

function errorHandler(
    error,
    req,
    res,
    next
) {
    /**
     * If headers have already been sent,
     * allow Express to complete the response.
     */
    if (res.headersSent) {
        return next(error);
    }

    const statusCode =
        Number.isInteger(
            error.statusCode
        )
            ? error.statusCode
            : 500;

    const code =
        error.code ||
        'INTERNAL_ERROR';

    const publicMessage =
        statusCode >= 500 &&
        isProduction
            ? 'Something went wrong. Nexus Connect could not complete that request.'
            : error.message ||
              'Something went wrong.';

    /**
     * Never expose stack traces in production.
     */
    if (
        statusCode >= 500
    ) {
        console.error(
            '[NEXUS][ERROR]',
            {
                requestId:
                    req.requestId,

                method:
                    req.method,

                path:
                    req.originalUrl,

                statusCode,

                error:
                    error.message,

                stack:
                    error.stack
            }
        );
    }

    const response = {
        success: false,

        error: {
            code,

            message:
                publicMessage,

            requestId:
                req.requestId
        }
    };

    /**
     * Validation details may be safely exposed
     * when supplied by our controlled validation layer.
     */
    if (
        statusCode < 500 &&
        error.details
    ) {
        response.error.details =
            error.details;
    }

    res
        .status(statusCode)
        .json(response);
}

/**
 * ------------------------------------------------------------
 * ASYNC HANDLER
 * ------------------------------------------------------------
 *
 * Allows async route functions to use normal
 * try/catch-free syntax.
 */

function asyncHandler(
    handler
) {
    return function wrappedHandler(
        req,
        res,
        next
    ) {
        Promise
            .resolve(
                handler(req, res, next)
            )
            .catch(next);
    };
}

/**
 * ------------------------------------------------------------
 * ACCOUNT STATE GUARD
 * ------------------------------------------------------------
 *
 * Routes can use this after authentication
 * when the user object is attached to req.user.
 */

function requireActiveAccount(
    req,
    res,
    next
) {
    if (!req.auth) {
        return next(
            new NexusError(
                'Authentication required.',
                401,
                'AUTHENTICATION_REQUIRED'
            )
        );
    }

    if (
        req.user &&
        req.user.status &&
        req.user.status !== 'active'
    ) {
        return next(
            new NexusError(
                'This account is not currently active.',
                403,
                'ACCOUNT_NOT_ACTIVE'
            )
        );
    }

    next();
}

/**
 * ------------------------------------------------------------
 * HEALTH CHECK ACCESS
 * ------------------------------------------------------------
 */

function healthCheck(req, res) {
    res.status(200).json({
        success: true,

        service: 'Nexus Connect',

        status: 'operational',

        timestamp:
            new Date().toISOString(),

        requestId:
            req.requestId
    });
}

/**
 * ------------------------------------------------------------
 * EXPORTS
 * ------------------------------------------------------------
 */

module.exports = {
    NexusError,

    requestId,

    securityHeaders,

    corsMiddleware,

    requestSizeGuard,

    requestLogger,

    getClientIp,

    extractBearerToken,

    verifyToken,

    authenticate,

    optionalAuthenticate,

    requireRole,

    requirePermission,

    requireSelf,

    createRateLimiter,

    authenticationRateLimiter,

    apiRateLimiter,

    validateBody,

    validatePin,

    validateUsername,

    validateEmail,

    normalizeBody,

    jsonOnly,

    notFoundHandler,

    errorHandler,

    asyncHandler,

    requireActiveAccount,

    healthCheck
};
