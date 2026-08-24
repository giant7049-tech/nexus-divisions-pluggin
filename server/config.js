'use strict';

/**
 * ================================================================
 * NEXUS CONNECT 2030
 * Nexus Buildsolutions Limited
 *
 * File:
 *   server/config.js
 *
 * Purpose:
 *   Central application configuration.
 *
 * Design principles:
 *   - Environment-driven configuration
 *   - No hard-coded secrets
 *   - Safe production defaults
 *   - Centralized configuration
 *   - Render deployment ready
 *   - Database/API ready
 *   - Authentication ready
 *   - Real-time communication ready
 * ================================================================
 */

require('dotenv').config();


/* ================================================================
 * ENVIRONMENT
 * ================================================================ */

const NODE_ENV = (
    process.env.NODE_ENV || 'development'
).trim().toLowerCase();


const isProduction = NODE_ENV === 'production';

const isDevelopment = NODE_ENV === 'development';

const isTest = NODE_ENV === 'test';


/* ================================================================
 * APPLICATION IDENTITY
 * ================================================================ */

const APP_NAME =
    process.env.APP_NAME ||
    'Nexus Connect';

const APP_VERSION =
    process.env.APP_VERSION ||
    '1.0.0';

const COMPANY_NAME =
    process.env.COMPANY_NAME ||
    'Nexus Buildsolutions Limited';

const APP_DESCRIPTION =
    process.env.APP_DESCRIPTION ||
    'Trusted professional network for people, expertise, services and solutions.';


/* ================================================================
 * SERVER
 * ================================================================ */

const PORT = Number(
    process.env.PORT || 10000
);

const HOST =
    process.env.HOST ||
    '0.0.0.0';


/* ================================================================
 * PUBLIC APPLICATION URL
 *
 * On Render:
 *
 * PUBLIC_APP_URL=https://your-domain.onrender.com
 *
 * Local development:
 *
 * PUBLIC_APP_URL=http://localhost:10000
 * ================================================================ */

const PUBLIC_APP_URL =
    process.env.PUBLIC_APP_URL ||
    `http://localhost:${PORT}`;


/* ================================================================
 * API
 * ================================================================ */

const API_PREFIX =
    process.env.API_PREFIX ||
    '/api';

const API_VERSION =
    process.env.API_VERSION ||
    'v1';

const API_BASE_PATH =
    `${API_PREFIX}/${API_VERSION}`;


/* ================================================================
 * FRONTEND
 * ================================================================ */

const PUBLIC_DIRECTORY =
    process.env.PUBLIC_DIRECTORY ||
    'public';

const FRONTEND_ENTRY =
    process.env.FRONTEND_ENTRY ||
    'index.html';


/* ================================================================
 * BRAND ASSETS
 * ================================================================ */

const BRAND = Object.freeze({

    name: COMPANY_NAME,

    product:
        APP_NAME,

    logo:
        '/assets/logo/Screenshot%202025-09-29%20122409.png',

    applicationIcon:
        '/assets/icons/icon.svg',

    tagline:
        'Connecting People. Finding Expertise. Delivering Solutions.',

    description:
        APP_DESCRIPTION

});


/* ================================================================
 * DATABASE
 *
 * IMPORTANT:
 * Do not put credentials directly here.
 *
 * Example .env:
 *
 * DATABASE_URL=postgresql://...
 *
 * DB_HOST=
 * DB_PORT=
 * DB_NAME=
 * DB_USER=
 * DB_PASSWORD=
 * ================================================================ */

const DATABASE = Object.freeze({

    url:
        process.env.DATABASE_URL || '',

    host:
        process.env.DB_HOST || '',

    port:
        Number(
            process.env.DB_PORT || 5432
        ),

    name:
        process.env.DB_NAME || '',

    user:
        process.env.DB_USER || '',

    password:
        process.env.DB_PASSWORD || '',

    ssl:
        isProduction
            ? true
            : process.env.DB_SSL === 'true',

    poolMin:
        Number(
            process.env.DB_POOL_MIN || 0
        ),

    poolMax:
        Number(
            process.env.DB_POOL_MAX || 10
        )

});


/* ================================================================
 * AUTHENTICATION
 *
 * JWT secret MUST come from environment variables.
 *
 * Never commit the real JWT secret to GitHub.
 * ================================================================ */

const AUTH = Object.freeze({

    jwtSecret:
        process.env.JWT_SECRET || '',

    jwtExpiresIn:
        process.env.JWT_EXPIRES_IN ||
        '7d',

    refreshTokenExpiresIn:
        process.env.REFRESH_TOKEN_EXPIRES_IN ||
        '30d',

    sessionCookieName:
        process.env.SESSION_COOKIE_NAME ||
        'nexus_session',

    secureCookies:
        isProduction,

    sameSite:
        process.env.COOKIE_SAME_SITE ||
        'lax'

});


/* ================================================================
 * SECURITY
 * ================================================================ */

const SECURITY = Object.freeze({

    corsOrigin:
        process.env.CORS_ORIGIN ||
        PUBLIC_APP_URL,

    trustProxy:
        isProduction,

    rateLimitWindowMs:
        Number(
            process.env.RATE_LIMIT_WINDOW_MS ||
            15 * 60 * 1000
        ),

    rateLimitMax:
        Number(
            process.env.RATE_LIMIT_MAX ||
            100
        ),

    bodyLimit:
        process.env.BODY_LIMIT ||
        '1mb'

});


/* ================================================================
 * REAL-TIME / SOCKETS
 * ================================================================ */

const SOCKETS = Object.freeze({

    enabled:
        process.env.SOCKETS_ENABLED !== 'false',

    path:
        process.env.SOCKET_PATH ||
        '/socket.io',

    pingInterval:
        Number(
            process.env.SOCKET_PING_INTERVAL ||
            25000
        ),

    pingTimeout:
        Number(
            process.env.SOCKET_PING_TIMEOUT ||
            20000
        )

});


/* ================================================================
 * NEXUS CONNECT FEATURES
 *
 * Central feature flags allow us to activate/deactivate
 * platform capabilities without rewriting the application.
 * ================================================================ */

const FEATURES = Object.freeze({

    finder:
        process.env.FEATURE_FINDER !== 'false',

    requests:
        process.env.FEATURE_REQUESTS !== 'false',

    network:
        process.env.FEATURE_NETWORK !== 'false',

    messaging:
        process.env.FEATURE_MESSAGING !== 'false',

    smartMatching:
        process.env.FEATURE_SMART_MATCHING !== 'false',

    notifications:
        process.env.FEATURE_NOTIFICATIONS !== 'false',

    verification:
        process.env.FEATURE_VERIFICATION !== 'false',

    nexusStaff:
        process.env.FEATURE_NEXUS_STAFF !== 'false',

    nexusCertified:
        process.env.FEATURE_NEXUS_CERTIFIED !== 'false',

    certifiedBusiness:
        process.env.FEATURE_CERTIFIED_BUSINESS !== 'false',

    analytics:
        process.env.FEATURE_ANALYTICS !== 'false',

    aiSearch:
        process.env.FEATURE_AI_SEARCH === 'true'

});


/* ================================================================
 * NEXUS TRUST LEVELS
 *
 * These values will later connect to the database and
 * verification service.
 * ================================================================ */

const TRUST_LEVELS = Object.freeze({

    NEXUS_STAFF: 'nexus_staff',

    NEXUS_CERTIFIED:
        'nexus_certified',

    CERTIFIED_BUSINESS:
        'certified_business',

    VERIFIED_USER:
        'verified_user',

    STANDARD_USER:
        'standard_user'

});


/* ================================================================
 * USER STATUS
 * ================================================================ */

const USER_STATUS = Object.freeze({

    ACTIVE:
        'active',

    PENDING:
        'pending',

    SUSPENDED:
        'suspended',

    DEACTIVATED:
        'deactivated',

    BLOCKED:
        'blocked'

});


/* ================================================================
 * REQUEST STATUS
 * ================================================================ */

const REQUEST_STATUS = Object.freeze({

    DRAFT:
        'draft',

    OPEN:
        'open',

    MATCHING:
        'matching',

    CONNECTED:
        'connected',

    IN_PROGRESS:
        'in_progress',

    COMPLETED:
        'completed',

    CANCELLED:
        'cancelled'

});


/* ================================================================
 * VERIFICATION STATUS
 * ================================================================ */

const VERIFICATION_STATUS = Object.freeze({

    UNVERIFIED:
        'unverified',

    PENDING:
        'pending',

    VERIFIED:
        'verified',

    EXPIRED:
        'expired',

    REVOKED:
        'revoked'

});


/* ================================================================
 * SEARCH
 * ================================================================ */

const SEARCH = Object.freeze({

    defaultLimit:
        Number(
            process.env.SEARCH_DEFAULT_LIMIT ||
            20
        ),

    maxLimit:
        Number(
            process.env.SEARCH_MAX_LIMIT ||
            100
        ),

    minimumQueryLength:
        Number(
            process.env.SEARCH_MIN_QUERY_LENGTH ||
            2
        )

});


/* ================================================================
 * FILE STORAGE
 * ================================================================ */

const STORAGE = Object.freeze({

    provider:
        process.env.STORAGE_PROVIDER ||
        'local',

    uploadDirectory:
        process.env.UPLOAD_DIRECTORY ||
        'uploads',

    maxFileSize:
        Number(
            process.env.MAX_FILE_SIZE ||
            5 * 1024 * 1024
        )

});


/* ================================================================
 * EMAIL
 *
 * Prepared for future notifications, verification emails,
 * password reset and platform messaging.
 * ================================================================ */

const EMAIL = Object.freeze({

    enabled:
        process.env.EMAIL_ENABLED === 'true',

    host:
        process.env.SMTP_HOST || '',

    port:
        Number(
            process.env.SMTP_PORT || 587
        ),

    user:
        process.env.SMTP_USER || '',

    password:
        process.env.SMTP_PASSWORD || '',

    from:
        process.env.EMAIL_FROM ||
        'Nexus Connect <no-reply@nexusbuildsolutions.com>'

});


/* ================================================================
 * LOGGING
 * ================================================================ */

const LOGGING = Object.freeze({

    level:
        process.env.LOG_LEVEL ||
        (
            isProduction
                ? 'info'
                : 'debug'
        ),

    pretty:
        !isProduction

});


/* ================================================================
 * CORS
 * ================================================================ */

const CORS_ORIGINS = Object.freeze(

    (process.env.CORS_ORIGINS || PUBLIC_APP_URL)
        .split(',')
        .map(
            origin => origin.trim()
        )
        .filter(Boolean)

);


/* ================================================================
 * COMPLETE CONFIGURATION OBJECT
 * ================================================================ */

const config = Object.freeze({

    app: Object.freeze({

        name:
            APP_NAME,

        version:
            APP_VERSION,

        company:
            COMPANY_NAME,

        description:
            APP_DESCRIPTION,

        environment:
            NODE_ENV,

        isProduction,

        isDevelopment,

        isTest

    }),


    server: Object.freeze({

        host:
            HOST,

        port:
            PORT,

        publicUrl:
            PUBLIC_APP_URL

    }),


    api: Object.freeze({

        prefix:
            API_PREFIX,

        version:
            API_VERSION,

        basePath:
            API_BASE_PATH

    }),


    frontend: Object.freeze({

        publicDirectory:
            PUBLIC_DIRECTORY,

        entry:
            FRONTEND_ENTRY

    }),


    brand:
        BRAND,


    database:
        DATABASE,


    auth:
        AUTH,


    security:
        SECURITY,


    sockets:
        SOCKETS,


    features:
        FEATURES,


    trustLevels:
        TRUST_LEVELS,


    userStatus:
        USER_STATUS,


    requestStatus:
        REQUEST_STATUS,


    verificationStatus:
        VERIFICATION_STATUS,


    search:
        SEARCH,


    storage:
        STORAGE,


    email:
        EMAIL,


    logging:
        LOGGING,


    corsOrigins:
        CORS_ORIGINS

});


/* ================================================================
 * CONFIGURATION VALIDATION
 *
 * We intentionally do not require every production service yet,
 * because the database/authentication infrastructure will be
 * implemented in subsequent files.
 * ================================================================ */

function validateConfig() {

    const warnings = [];


    if (isProduction && !AUTH.jwtSecret) {

        warnings.push(
            'JWT_SECRET is not configured for production.'
        );

    }


    if (isProduction && !DATABASE.url) {

        warnings.push(
            'DATABASE_URL is not configured for production.'
        );

    }


    if (
        isProduction &&
        SECURITY.corsOrigin === 'http://localhost:10000'
    ) {

        warnings.push(
            'CORS_ORIGIN is still using the development default.'
        );

    }


    if (warnings.length > 0) {

        console.warn(
            '\n[NEXUS CONFIGURATION WARNINGS]'
        );

        warnings.forEach(
            warning => {
                console.warn(
                    `- ${warning}`
                );
            }
        );

        console.warn('');

    }

}


/* ================================================================
 * SAFE CONFIGURATION SUMMARY
 *
 * Never log passwords, JWT secrets or database credentials.
 * ================================================================ */

function getSafeConfigSummary() {

    return {

        application:
            APP_NAME,

        version:
            APP_VERSION,

        environment:
            NODE_ENV,

        server:
            `${HOST}:${PORT}`,

        api:
            API_BASE_PATH,

        databaseConfigured:
            Boolean(
                DATABASE.url ||
                DATABASE.host
            ),

        authenticationConfigured:
            Boolean(
                AUTH.jwtSecret
            ),

        socketsEnabled:
            SOCKETS.enabled,

        enabledFeatures:
            Object.entries(FEATURES)
                .filter(
                    ([, enabled]) => enabled
                )
                .map(
                    ([feature]) => feature
                )

    };

}


/* ================================================================
 * INITIAL VALIDATION
 * ================================================================ */

validateConfig();


/* ================================================================
 * EXPORT
 * ================================================================ */

/* ================================================================
 * EXPORT
 * ================================================================ */

module.exports = Object.freeze({
    ...config,

    validateConfig,

    getSafeConfigSummary
});
