/**
 * NEXUS OS
 * Nexus Buildsolutions Limited
 *
 * File: server/config.js
 * Purpose:
 * Centralized, validated, immutable application configuration.
 *
 * Architecture responsibilities:
 * - Environment management
 * - Database configuration
 * - HTTP/API configuration
 * - Socket.IO configuration
 * - Security configuration
 * - Authentication configuration
 * - CORS configuration
 * - Rate limiting configuration
 * - Cloudinary configuration
 * - Paystack configuration
 * - Email configuration
 * - Logging configuration
 * - Deployment configuration
 * - Feature flags
 *
 * IMPORTANT:
 * - No production secrets belong in source control.
 * - Secrets are loaded exclusively from environment variables.
 * - Configuration is validated before the application starts.
 * - Missing production-critical configuration causes startup failure.
 */

import "dotenv/config";
import process from "node:process";

/* ============================================================
   HELPERS
   ============================================================ */

const isProduction = process.env.NODE_ENV === "production";
const isDevelopment = process.env.NODE_ENV === "development";
const isTest = process.env.NODE_ENV === "test";

const environment =
  process.env.NODE_ENV?.trim().toLowerCase() || "development";

const trim = (value) =>
  typeof value === "string" ? value.trim() : value;

const stringValue = (name, fallback = undefined) => {
  const value = trim(process.env[name]);

  if (value === undefined || value === "") {
    return fallback;
  }

  return value;
};

const requiredString = (name) => {
  const value = stringValue(name);

  if (!value) {
    throw new Error(
      `[NEXUS CONFIG] Missing required environment variable: ${name}`,
    );
  }

  return value;
};

const booleanValue = (name, fallback = false) => {
  const value = stringValue(name);

  if (value === undefined) {
    return fallback;
  }

  return ["true", "1", "yes", "on"].includes(value.toLowerCase());
};

const integerValue = (name, fallback) => {
  const value = stringValue(name);

  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed)) {
    throw new Error(
      `[NEXUS CONFIG] Environment variable ${name} must be an integer.`,
    );
  }

  return parsed;
};

const positiveInteger = (name, fallback) => {
  const value = integerValue(name, fallback);

  if (value <= 0) {
    throw new Error(
      `[NEXUS CONFIG] Environment variable ${name} must be greater than zero.`,
    );
  }

  return value;
};

const normalizeOrigin = (value) => {
  if (!value) {
    return value;
  }

  return value.replace(/\/+$/, "");
};

const parseList = (value) => {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

/* ============================================================
   APPLICATION
   ============================================================ */

const appName = stringValue("APP_NAME", "NEXUS OS");

const appVersion = stringValue("APP_VERSION", "1.0.0");

const nodeEnvironment = environment;

const config = {
  /* ==========================================================
     PLATFORM IDENTITY
     ========================================================== */

  app: {
    name: appName,
    version: appVersion,

    organization: "Nexus Buildsolutions Limited",

    id: "nexus-os",

    environment: nodeEnvironment,

    isProduction,
    isDevelopment,
    isTest,

    targetArchitecture: "2030-2050",

    runtime: "nodejs",

    timezone: stringValue(
      "APP_TIMEZONE",
      "Africa/Lagos",
    ),
  },

  /* ==========================================================
     SERVER
     ========================================================== */

  server: {
    host: stringValue(
      "HOST",
      isProduction ? "0.0.0.0" : "127.0.0.1",
    ),

    port: positiveInteger(
      "PORT",
      3000,
    ),

    trustProxy: booleanValue(
      "TRUST_PROXY",
      isProduction,
    ),

    bodyLimit: positiveInteger(
      "BODY_LIMIT",
      10 * 1024 * 1024,
    ),

    requestTimeout: positiveInteger(
      "REQUEST_TIMEOUT_MS",
      30_000,
    ),

    keepAliveTimeout: positiveInteger(
      "KEEP_ALIVE_TIMEOUT_MS",
      72_000,
    ),

    connectionTimeout: positiveInteger(
      "CONNECTION_TIMEOUT_MS",
      10_000,
    ),
  },

  /* ==========================================================
     APPLICATION URLS
     ========================================================== */

  urls: {
    app: normalizeOrigin(
      stringValue(
        "APP_URL",
        isProduction
          ? undefined
          : "http://localhost:3000",
      ),
    ),

    api: normalizeOrigin(
      stringValue(
        "API_URL",
        isProduction
          ? undefined
          : "http://localhost:3000",
      ),
    ),

    web: normalizeOrigin(
      stringValue(
        "WEB_URL",
        isProduction
          ? undefined
          : "http://localhost:3000",
      ),
    ),

    allowedOrigins: parseList(
      stringValue(
        "CORS_ORIGINS",
        isProduction
          ? undefined
          : "http://localhost:3000",
      ),
    ),
  },

  /* ==========================================================
     DATABASE
     ========================================================== */

  database: {
    provider: stringValue(
      "DATABASE_PROVIDER",
      "mongodb",
    ),

    url: stringValue("DATABASE_URL"),

    name: stringValue(
      "DATABASE_NAME",
      "nexus_os",
    ),

    connectTimeoutMS: positiveInteger(
      "DATABASE_CONNECT_TIMEOUT_MS",
      10_000,
    ),

    serverSelectionTimeoutMS: positiveInteger(
      "DATABASE_SERVER_SELECTION_TIMEOUT_MS",
      10_000,
    ),

    socketTimeoutMS: positiveInteger(
      "DATABASE_SOCKET_TIMEOUT_MS",
      45_000,
    ),

    maxPoolSize: positiveInteger(
      "DATABASE_MAX_POOL_SIZE",
      20,
    ),

    minPoolSize: integerValue(
      "DATABASE_MIN_POOL_SIZE",
      2,
    ),

    retryWrites: booleanValue(
      "DATABASE_RETRY_WRITES",
      true,
    ),

    retryReads: booleanValue(
      "DATABASE_RETRY_READS",
      true,
    ),
  },

  /* ==========================================================
     SECURITY
     ========================================================== */

  security: {
    helmet: {
      enabled: true,
    },

    cors: {
      enabled: true,

      credentials: true,

      allowedOrigins: parseList(
        stringValue(
          "CORS_ORIGINS",
          isProduction
            ? undefined
            : "http://localhost:3000",
        ),
      ),
    },

    rateLimit: {
      enabled: true,

      max: positiveInteger(
        "RATE_LIMIT_MAX",
        100,
      ),

      timeWindow: stringValue(
        "RATE_LIMIT_WINDOW",
        "1 minute",
      ),

      ban: integerValue(
        "RATE_LIMIT_BAN",
        0,
      ),
    },

    requestId: {
      enabled: true,

      header: stringValue(
        "REQUEST_ID_HEADER",
        "x-request-id",
      ),
    },

    password: {
      bcryptRounds: positiveInteger(
        "BCRYPT_ROUNDS",
        12,
      ),
    },

    cookies: {
      secure: isProduction,

      httpOnly: true,

      sameSite: stringValue(
        "COOKIE_SAME_SITE",
        "lax",
      ),

      domain: stringValue(
        "COOKIE_DOMAIN",
      ),

      path: "/",
    },
  },

  /* ==========================================================
     AUTHENTICATION
     ========================================================== */

  auth: {
    jwt: {
      secret: stringValue(
        "JWT_SECRET",
      ),

      issuer: stringValue(
        "JWT_ISSUER",
        "nexus-os",
      ),

      audience: stringValue(
        "JWT_AUDIENCE",
        "nexus-os-client",
      ),

      accessTokenExpiresIn: stringValue(
        "JWT_ACCESS_EXPIRES_IN",
        "15m",
      ),

      refreshTokenExpiresIn: stringValue(
        "JWT_REFRESH_EXPIRES_IN",
        "30d",
      ),
    },

    session: {
      enabled: booleanValue(
        "SESSION_ENABLED",
        true,
      ),

      cookieName: stringValue(
        "SESSION_COOKIE_NAME",
        "nexus_session",
      ),

      maxAgeSeconds: positiveInteger(
        "SESSION_MAX_AGE_SECONDS",
        30 * 24 * 60 * 60,
      ),
    },

    verification: {
      emailTokenExpiresMinutes: positiveInteger(
        "EMAIL_VERIFICATION_EXPIRY_MINUTES",
        30,
      ),

      passwordResetExpiresMinutes: positiveInteger(
        "PASSWORD_RESET_EXPIRY_MINUTES",
        30,
      ),
    },
  },

  /* ==========================================================
     SOCKET.IO
     ========================================================== */

  realtime: {
    enabled: true,

    path: stringValue(
      "SOCKET_PATH",
      "/socket.io",
    ),

    transports: ["websocket", "polling"],

    connectionStateRecovery: {
      enabled: true,

      maxDisconnectionDuration: positiveInteger(
        "SOCKET_RECOVERY_MS",
        120_000,
      ),

      skipMiddlewares: false,
    },

    pingInterval: positiveInteger(
      "SOCKET_PING_INTERVAL_MS",
      25_000,
    ),

    pingTimeout: positiveInteger(
      "SOCKET_PING_TIMEOUT_MS",
      20_000,
    ),

    maxHttpBufferSize: positiveInteger(
      "SOCKET_MAX_HTTP_BUFFER_SIZE",
      1e6,
    ),

    cors: {
      credentials: true,

      origins: parseList(
        stringValue(
          "CORS_ORIGINS",
          isProduction
            ? undefined
            : "http://localhost:3000",
        ),
      ),
    },

    rooms: {
      userPrefix: "user:",
      conversationPrefix: "conversation:",
      organizationPrefix: "organization:",
      projectPrefix: "project:",
      adminPrefix: "admin:",
    },
  },

  /* ==========================================================
     PAYSTACK
     ========================================================== */

  payments: {
    enabled: booleanValue(
      "PAYMENTS_ENABLED",
      false,
    ),

    provider: stringValue(
      "PAYMENT_PROVIDER",
      "paystack",
    ),

    paystack: {
      publicKey: stringValue(
        "PAYSTACK_PUBLIC_KEY",
      ),

      secretKey: stringValue(
        "PAYSTACK_SECRET_KEY",
      ),

      webhookSecret: stringValue(
        "PAYSTACK_WEBHOOK_SECRET",
      ),

      baseUrl: stringValue(
        "PAYSTACK_BASE_URL",
        "https://api.paystack.co",
      ),

      currency: stringValue(
        "PAYMENT_CURRENCY",
        "NGN",
      ),

      callbackUrl: normalizeOrigin(
        stringValue(
          "PAYSTACK_CALLBACK_URL",
        ),
      ),

      requestTimeoutMS: positiveInteger(
        "PAYSTACK_TIMEOUT_MS",
        15_000,
      ),
    },

    idempotency: {
      enabled: true,

      keyPrefix: stringValue(
        "PAYMENT_IDEMPOTENCY_PREFIX",
        "nexus-payment",
      ),
    },
  },

  /* ==========================================================
     CLOUDINARY / MEDIA
     ========================================================== */

  storage: {
    provider: stringValue(
      "STORAGE_PROVIDER",
      "cloudinary",
    ),

    cloudinary: {
      cloudName: stringValue(
        "CLOUDINARY_CLOUD_NAME",
      ),

      apiKey: stringValue(
        "CLOUDINARY_API_KEY",
      ),

      apiSecret: stringValue(
        "CLOUDINARY_API_SECRET",
      ),

      folder: stringValue(
        "CLOUDINARY_FOLDER",
        "nexus-os",
      ),

      secure: true,
    },

    uploads: {
      maxFileSizeBytes: positiveInteger(
        "UPLOAD_MAX_FILE_SIZE",
        10 * 1024 * 1024,
      ),

      allowedMimeTypes: parseList(
        stringValue(
          "UPLOAD_ALLOWED_MIME_TYPES",
          [
            "image/jpeg",
            "image/png",
            "image/webp",
            "application/pdf",
          ].join(","),
        ),
      ),
    },
  },

  /* ==========================================================
     EMAIL
     ========================================================== */

  email: {
    enabled: booleanValue(
      "EMAIL_ENABLED",
      false,
    ),

    host: stringValue(
      "SMTP_HOST",
    ),

    port: integerValue(
      "SMTP_PORT",
      587,
    ),

    secure: booleanValue(
      "SMTP_SECURE",
      false,
    ),

    user: stringValue(
      "SMTP_USER",
    ),

    password: stringValue(
      "SMTP_PASSWORD",
    ),

    from: stringValue(
      "SMTP_FROM",
    ),

    connectionTimeoutMS: positiveInteger(
      "SMTP_CONNECTION_TIMEOUT_MS",
      10_000,
    ),

    greetingTimeoutMS: positiveInteger(
      "SMTP_GREETING_TIMEOUT_MS",
      10_000,
    ),

    socketTimeoutMS: positiveInteger(
      "SMTP_SOCKET_TIMEOUT_MS",
      30_000,
    ),
  },

  /* ==========================================================
     LOGGING
     ========================================================== */

  logging: {
    level: stringValue(
      "LOG_LEVEL",
      isProduction ? "info" : "debug",
    ),

    pretty: booleanValue(
      "LOG_PRETTY",
      !isProduction,
    ),

    redact: [
      "req.headers.authorization",
      "req.headers.cookie",
      "request.headers.authorization",
      "request.headers.cookie",
      "password",
      "passwordHash",
      "token",
      "accessToken",
      "refreshToken",
      "jwt",
      "secret",
      "apiKey",
      "apiSecret",
      "webhookSecret",
      "paystackSecretKey",
    ],
  },

  /* ==========================================================
     OBSERVABILITY
     ========================================================== */

  observability: {
    enabled: true,

    health: {
      enabled: true,

      endpoints: {
        health: "/health",
        live: "/health/live",
        ready: "/health/ready",
      },
    },

    metrics: {
      enabled: booleanValue(
        "METRICS_ENABLED",
        true,
      ),
    },

    requestTracing: {
      enabled: true,
    },

    errorTracking: {
      enabled: booleanValue(
        "ERROR_TRACKING_ENABLED",
        false,
      ),

      dsn: stringValue(
        "ERROR_TRACKING_DSN",
      ),
    },
  },

  /* ==========================================================
     API
     ========================================================== */

  api: {
    prefix: stringValue(
      "API_PREFIX",
      "/api",
    ),

    version: stringValue(
      "API_VERSION",
      "v1",
    ),

    versionPrefix: stringValue(
      "API_VERSION_PREFIX",
      "/api/v1",
    ),

    documentation: {
      enabled: booleanValue(
        "API_DOCUMENTATION_ENABLED",
        !isProduction,
      ),
    },

    pagination: {
      defaultLimit: positiveInteger(
        "API_DEFAULT_PAGE_SIZE",
        25,
      ),

      maxLimit: positiveInteger(
        "API_MAX_PAGE_SIZE",
        100,
      ),
    },
  },

  /* ==========================================================
     FEATURE FLAGS
     ========================================================== */

  features: {
    authentication: booleanValue(
      "FEATURE_AUTHENTICATION",
      true,
    ),

    realtime: booleanValue(
      "FEATURE_REALTIME",
      true,
    ),

    connect: booleanValue(
      "FEATURE_CONNECT",
      true,
    ),

    professionals: booleanValue(
      "FEATURE_PROFESSIONALS",
      true,
    ),

    services: booleanValue(
      "FEATURE_SERVICES",
      true,
    ),

    jobs: booleanValue(
      "FEATURE_JOBS",
      true,
    ),

    marketplace: booleanValue(
      "FEATURE_MARKETPLACE",
      true,
    ),

    projects: booleanValue(
      "FEATURE_PROJECTS",
      true,
    ),

    property: booleanValue(
      "FEATURE_PROPERTY",
      true,
    ),

    construction: booleanValue(
      "FEATURE_CONSTRUCTION",
      true,
    ),

    analytics: booleanValue(
      "FEATURE_ANALYTICS",
      true,
    ),

    intelligence: booleanValue(
      "FEATURE_INTELLIGENCE",
      true,
    ),

    automation: booleanValue(
      "FEATURE_AUTOMATION",
      true,
    ),

    payments: booleanValue(
      "FEATURE_PAYMENTS",
      false,
    ),

    email: booleanValue(
      "FEATURE_EMAIL",
      false,
    ),

    uploads: booleanValue(
      "FEATURE_UPLOADS",
      false,
    ),
  },

  /* ==========================================================
     AUDIT / GOVERNANCE
     ========================================================== */

  governance: {
    auditEnabled: true,

    auditAdministrativeActions: true,

    auditFinancialActions: true,

    auditSecurityActions: true,

    auditDataChanges: true,

    requireReasonForAdministrativeChanges: true,
  },

  /* ==========================================================
     GRACEFUL SHUTDOWN
     ========================================================== */

  shutdown: {
    enabled: true,

    timeoutMS: positiveInteger(
      "SHUTDOWN_TIMEOUT_MS",
      15_000,
    ),
  },

  /* ==========================================================
     DEPLOYMENT
     ========================================================== */

  deployment: {
    platform: stringValue(
      "DEPLOYMENT_PLATFORM",
      "render",
    ),

    provider: stringValue(
      "DEPLOYMENT_PROVIDER",
      "render",
    ),

    gracefulShutdown: true,

    healthCheckPath: "/health/ready",

    environment: nodeEnvironment,
  },
};

/* ============================================================
   PRODUCTION VALIDATION
   ============================================================ */

/**
 * Configuration that must exist before production startup.
 *
 * We deliberately validate these here rather than allowing the
 * application to start in an unsafe or partially configured state.
 */
const validateProductionConfiguration = () => {
  if (!isProduction) {
    return;
  }

  const requiredProductionVariables = [
    ["DATABASE_URL", config.database.url],
    ["JWT_SECRET", config.auth.jwt.secret],
    ["APP_URL", config.urls.app],
  ];

  const missing = requiredProductionVariables
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `[NEXUS CONFIG] Production startup blocked. Missing required configuration: ${missing.join(", ")}`,
    );
  }

  if (config.auth.jwt.secret.length < 32) {
    throw new Error(
      "[NEXUS CONFIG] JWT_SECRET must contain at least 32 characters in production.",
    );
  }

  if (
    config.security.cookies.secure !== true
  ) {
    throw new Error(
      "[NEXUS CONFIG] Secure cookies must be enabled in production.",
    );
  }

  if (
    config.urls.allowedOrigins.length === 0
  ) {
    throw new Error(
      "[NEXUS CONFIG] CORS_ORIGINS must be explicitly configured in production.",
    );
  }
};

/* ============================================================
   FEATURE / PROVIDER VALIDATION
   ============================================================ */

const validateEnabledProviders = () => {
  if (
    config.features.payments ||
    config.payments.enabled
  ) {
    const requiredPaymentValues = [
      ["PAYSTACK_PUBLIC_KEY", config.payments.paystack.publicKey],
      ["PAYSTACK_SECRET_KEY", config.payments.paystack.secretKey],
      ["PAYSTACK_WEBHOOK_SECRET", config.payments.paystack.webhookSecret],
    ];

    const missing = requiredPaymentValues
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(
        `[NEXUS CONFIG] Payments are enabled but required Paystack configuration is missing: ${missing.join(", ")}`,
      );
    }
  }

  if (
    config.features.uploads
  ) {
    const requiredStorageValues = [
      ["CLOUDINARY_CLOUD_NAME", config.storage.cloudinary.cloudName],
      ["CLOUDINARY_API_KEY", config.storage.cloudinary.apiKey],
      ["CLOUDINARY_API_SECRET", config.storage.cloudinary.apiSecret],
    ];

    const missing = requiredStorageValues
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(
        `[NEXUS CONFIG] Uploads are enabled but Cloudinary configuration is missing: ${missing.join(", ")}`,
      );
    }
  }

  if (
    config.features.email
  ) {
    const requiredEmailValues = [
      ["SMTP_HOST", config.email.host],
      ["SMTP_USER", config.email.user],
      ["SMTP_PASSWORD", config.email.password],
      ["SMTP_FROM", config.email.from],
    ];

    const missing = requiredEmailValues
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(
        `[NEXUS CONFIG] Email is enabled but SMTP configuration is missing: ${missing.join(", ")}`,
      );
    }
  }
};

/* ============================================================
   GENERAL VALIDATION
   ============================================================ */

const validateConfiguration = () => {
  if (!["development", "test", "staging", "production"].includes(environment)) {
    throw new Error(
      `[NEXUS CONFIG] Unsupported NODE_ENV: ${environment}`,
    );
  }

  if (
    config.server.port < 1 ||
    config.server.port > 65_535
  ) {
    throw new Error(
      "[NEXUS CONFIG] PORT must be between 1 and 65535.",
    );
  }

  if (
    config.database.minPoolSize >
    config.database.maxPoolSize
  ) {
    throw new Error(
      "[NEXUS CONFIG] DATABASE_MIN_POOL_SIZE cannot exceed DATABASE_MAX_POOL_SIZE.",
    );
  }

  if (
    config.api.pagination.defaultLimit >
    config.api.pagination.maxLimit
  ) {
    throw new Error(
      "[NEXUS CONFIG] API_DEFAULT_PAGE_SIZE cannot exceed API_MAX_PAGE_SIZE.",
    );
  }

  validateProductionConfiguration();

  validateEnabledProviders();
};

/* ============================================================
   STARTUP VALIDATION
   ============================================================ */

validateConfiguration();

/* ============================================================
   IMMUTABILITY
   ============================================================ */

/**
 * Prevent accidental runtime mutation of central configuration.
 */
const deepFreeze = (object) => {
  if (
    object === null ||
    typeof object !== "object"
  ) {
    return object;
  }

  for (const value of Object.values(object)) {
    deepFreeze(value);
  }

  return Object.freeze(object);
};

deepFreeze(config);

/* ============================================================
   SAFE CONFIGURATION SUMMARY
   ============================================================ */

/**
 * Never log secrets.
 *
 * This function is intentionally limited to operational
 * information useful during application startup.
 */
export const getConfigSummary = () => ({
  application: {
    name: config.app.name,
    version: config.app.version,
    environment: config.app.environment,
  },

  server: {
    host: config.server.host,
    port: config.server.port,
  },

  database: {
    provider: config.database.provider,
    configured: Boolean(config.database.url),
  },

  realtime: {
    enabled: config.realtime.enabled,
    path: config.realtime.path,
    transports: [...config.realtime.transports],
  },

  security: {
    helmet: config.security.helmet.enabled,
    cors: config.security.cors.enabled,
    rateLimit: config.security.rateLimit.enabled,
    secureCookies: config.security.cookies.secure,
  },

  features: {
    ...config.features,
  },

  payments: {
    enabled: config.payments.enabled,
    provider: config.payments.provider,
  },

  storage: {
    provider: config.storage.provider,
    configured: Boolean(
      config.storage.cloudinary.cloudName &&
      config.storage.cloudinary.apiKey &&
      config.storage.cloudinary.apiSecret,
    ),
  },

  email: {
    enabled: config.email.enabled,
    configured: Boolean(
      config.email.host &&
      config.email.user &&
      config.email.password,
    ),
  },

  deployment: {
    platform: config.deployment.platform,
    environment: config.deployment.environment,
    healthCheckPath: config.deployment.healthCheckPath,
  },
});

/* ============================================================
   EXPORT
   ============================================================ */

export default config;
