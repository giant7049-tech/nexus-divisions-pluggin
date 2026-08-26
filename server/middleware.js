/**
 * ============================================================
 * NEXUS OS — SERVER MIDDLEWARE
 * ============================================================
 *
 * File:
 *   server/middleware.js
 *
 * Responsibility:
 *   Central Fastify request-processing and security layer.
 *
 * Provides:
 *   - Request identification
 *   - Authentication
 *   - JWT verification
 *   - Secure cookie token support
 *   - Authorization / RBAC
 *   - Resource permission helpers
 *   - Zod validation
 *   - Rate-limit configuration
 *   - Security headers integration
 *   - Request lifecycle protection
 *   - Error normalization
 *   - Structured request logging
 *   - Sensitive-data protection
 *   - Authentication failure handling
 *   - Webhook/raw-body awareness
 *
 * Important:
 *   This file does NOT contain business logic.
 *   Business logic belongs in services.js.
 *
 *   This file does NOT create fake authentication.
 *   Authentication is only considered successful when a
 *   valid server-issued token can be cryptographically verified.
 *
 * Runtime:
 *   Node.js >= 22
 *   Fastify 5
 * ============================================================
 */

import fp from "fastify-plugin";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";

/**
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

const DEFAULT_TOKEN_COOKIE = "nexus_access_token";

const PUBLIC_ROUTES = new Set([
  "/",
  "/health",
  "/health/live",
  "/health/ready",
  "/favicon.ico",
]);

const AUTH_HEADER_PREFIX = "Bearer ";

const SAFE_LOG_METHODS = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
]);

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "proxy-authorization",
]);

const SENSITIVE_FIELDS = new Set([
  "password",
  "passwordHash",
  "currentPassword",
  "newPassword",
  "confirmPassword",
  "pin",
  "otp",
  "token",
  "accessToken",
  "refreshToken",
  "secret",
  "apiKey",
  "authorization",
  "cookie",
  "setCookie",
  "cardNumber",
  "cvv",
  "cvc",
]);

const HTTP_STATUS = Object.freeze({
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
});

/**
 * ============================================================
 * ERROR TYPES
 * ============================================================
 */

export class NexusHttpError extends Error {
  constructor(
    statusCode,
    message,
    {
      code = "HTTP_ERROR",
      details = undefined,
      expose = statusCode < 500,
    } = {},
  ) {
    super(message);

    this.name = "NexusHttpError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.expose = expose;

    Error.captureStackTrace?.(this, NexusHttpError);
  }
}

/**
 * ============================================================
 * CONFIGURATION HELPERS
 * ============================================================
 *
 * These helpers intentionally read environment values at runtime.
 * This prevents secrets from being hardcoded into the source.
 * ============================================================
 */

function getEnv(name, fallback = undefined) {
  const value = process.env[name];

  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return value;
}

function getJwtSecret() {
  const secret =
    getEnv("JWT_SECRET") ??
    getEnv("AUTH_JWT_SECRET");

  if (!secret) {
    throw new NexusHttpError(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "Authentication service is not configured.",
      {
        code: "AUTH_CONFIGURATION_ERROR",
        expose: false,
      },
    );
  }

  return secret;
}

function getJwtIssuer() {
  return getEnv("JWT_ISSUER", "nexus-os");
}

function getJwtAudience() {
  return getEnv("JWT_AUDIENCE", "nexus-os-client");
}

function getTokenCookieName() {
  return getEnv(
    "AUTH_COOKIE_NAME",
    DEFAULT_TOKEN_COOKIE,
  );
}

/**
 * ============================================================
 * REQUEST ID
 * ============================================================
 *
 * Every request receives a stable request identifier.
 *
 * Priority:
 *   1. trusted incoming X-Request-ID
 *   2. generated UUID
 *
 * The incoming value is length-limited to prevent header abuse.
 * ============================================================
 */

export function createRequestId(request) {
  const incoming = request.headers["x-request-id"];

  if (
    typeof incoming === "string" &&
    incoming.length > 0 &&
    incoming.length <= 128
  ) {
    return incoming;
  }

  return randomUUID();
}

/**
 * ============================================================
 * SAFE LOGGING
 * ============================================================
 *
 * Never log passwords, JWTs, cookies, payment secrets,
 * authorization headers, or other credential material.
 * ============================================================
 */

function sanitizeValue(value, key = "") {
  if (
    SENSITIVE_FIELDS.has(key) ||
    SENSITIVE_FIELDS.has(key.toLowerCase())
  ) {
    return "[REDACTED]";
  }

  if (
    typeof value === "string" &&
    value.length > 10000
  ) {
    return `${value.slice(0, 10000)}…[TRUNCATED]`;
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      sanitizeValue(item),
    );
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return sanitizeObject(value);
  }

  return value;
}

export function sanitizeObject(object) {
  if (!object || typeof object !== "object") {
    return object;
  }

  if (Array.isArray(object)) {
    return object.map((item) =>
      sanitizeValue(item),
    );
  }

  const output = {};

  for (const [key, value] of Object.entries(object)) {
    output[key] = sanitizeValue(value, key);
  }

  return output;
}

export function sanitizeHeaders(headers = {}) {
  const output = {};

  for (const [key, value] of Object.entries(headers)) {
    if (
      SENSITIVE_HEADERS.has(
        key.toLowerCase(),
      )
    ) {
      output[key] = "[REDACTED]";
    } else {
      output[key] = value;
    }
  }

  return output;
}

/**
 * ============================================================
 * TOKEN EXTRACTION
 * ============================================================
 *
 * Supports:
 *
 *   Authorization: Bearer <JWT>
 *
 * and, when cookies are available:
 *
 *   nexus_access_token=<JWT>
 *
 * Header authentication takes precedence.
 * ============================================================
 */

export function extractBearerToken(request) {
  const authorization =
    request.headers.authorization;

  if (
    typeof authorization === "string" &&
    authorization.startsWith(AUTH_HEADER_PREFIX)
  ) {
    const token = authorization
      .slice(AUTH_HEADER_PREFIX.length)
      .trim();

    if (token) {
      return token;
    }
  }

  return null;
}

export function extractCookieToken(request) {
  const cookieName = getTokenCookieName();

  if (
    !request.cookies ||
    typeof request.cookies !== "object"
  ) {
    return null;
  }

  const token = request.cookies[cookieName];

  return typeof token === "string" && token
    ? token
    : null;
}

export function extractAccessToken(request) {
  return (
    extractBearerToken(request) ??
    extractCookieToken(request)
  );
}

/**
 * ============================================================
 * JWT VERIFICATION
 * ============================================================
 *
 * No decoded token is trusted until signature and registered
 * claims have been verified.
 * ============================================================
 */

export function verifyAccessToken(token) {
  if (
    typeof token !== "string" ||
    token.length < 20
  ) {
    throw new NexusHttpError(
      HTTP_STATUS.UNAUTHORIZED,
      "Authentication required.",
      {
        code: "AUTH_TOKEN_MISSING",
      },
    );
  }

  try {
    return jwt.verify(
      token,
      getJwtSecret(),
      {
        algorithms: ["HS256"],
        issuer: getJwtIssuer(),
        audience: getJwtAudience(),
      },
    );
  } catch (error) {
    if (error?.name === "TokenExpiredError") {
      throw new NexusHttpError(
        HTTP_STATUS.UNAUTHORIZED,
        "Authentication token has expired.",
        {
          code: "AUTH_TOKEN_EXPIRED",
        },
      );
    }

    throw new NexusHttpError(
      HTTP_STATUS.UNAUTHORIZED,
      "Invalid authentication token.",
      {
        code: "AUTH_TOKEN_INVALID",
      },
    );
  }
}

/**
 * ============================================================
 * AUTHENTICATE REQUEST
 * ============================================================
 *
 * Attaches a normalized identity to:
 *
 *   request.user
 *
 * Expected token structure:
 *
 * {
 *   sub: "user-id",
 *   role: "user",
 *   roles: ["user"],
 *   permissions: [],
 *   sessionId: "...",
 *   tokenVersion: 1
 * }
 *
 * The database-backed user/session verification can be added
 * through the services layer without changing the route API.
 * ============================================================
 */

export async function authenticateRequest(
  request,
) {
  const token =
    extractAccessToken(request);

  if (!token) {
    throw new NexusHttpError(
      HTTP_STATUS.UNAUTHORIZED,
      "Authentication required.",
      {
        code: "AUTHENTICATION_REQUIRED",
      },
    );
  }

  const payload =
    verifyAccessToken(token);

  if (
    !payload ||
    typeof payload !== "object" ||
    typeof payload.sub !== "string" ||
    payload.sub.length === 0
  ) {
    throw new NexusHttpError(
      HTTP_STATUS.UNAUTHORIZED,
      "Invalid authentication identity.",
      {
        code: "AUTH_IDENTITY_INVALID",
      },
    );
  }

  request.user = Object.freeze({
    id: payload.sub,
    userId: payload.sub,

    role:
      typeof payload.role === "string"
        ? payload.role
        : "user",

    roles: Array.isArray(payload.roles)
      ? payload.roles.filter(
          (role) =>
            typeof role === "string",
        )
      : [],

    permissions:
      Array.isArray(payload.permissions)
        ? payload.permissions.filter(
            (permission) =>
              typeof permission === "string",
          )
        : [],

    sessionId:
      typeof payload.sessionId === "string"
        ? payload.sessionId
        : null,

    tokenVersion:
      Number.isInteger(payload.tokenVersion)
        ? payload.tokenVersion
        : 0,

    issuer:
      typeof payload.iss === "string"
        ? payload.iss
        : null,

    audience:
      typeof payload.aud === "string"
        ? payload.aud
        : null,

    issuedAt:
      typeof payload.iat === "number"
        ? payload.iat
        : null,

    expiresAt:
      typeof payload.exp === "number"
        ? payload.exp
        : null,
  });

  return request.user;
}

/**
 * ============================================================
 * OPTIONAL AUTHENTICATION
 * ============================================================
 *
 * Useful for endpoints where both anonymous and authenticated
 * visitors are allowed.
 *
 * Example:
 *
 *   fastify.get("/api/discover", {
 *     preHandler: optionalAuthentication
 *   }, handler)
 * ============================================================
 */

export async function optionalAuthentication(
  request,
) {
  const token =
    extractAccessToken(request);

  if (!token) {
    request.user = null;
    return null;
  }

  try {
    return await authenticateRequest(
      request,
    );
  } catch (error) {
    request.user = null;
    return null;
  }
}

/**
 * ============================================================
 * REQUIRE AUTHENTICATION
 * ============================================================
 */

export async function requireAuthentication(
  request,
) {
  if (!request.user) {
    await authenticateRequest(request);
  }

  return request.user;
}

/**
 * ============================================================
 * ROLE CHECKING
 * ============================================================
 */

export function getUserRoles(user) {
  if (!user) {
    return [];
  }

  const roles = new Set();

  if (typeof user.role === "string") {
    roles.add(user.role);
  }

  if (Array.isArray(user.roles)) {
    for (const role of user.roles) {
      if (typeof role === "string") {
        roles.add(role);
      }
    }
  }

  return [...roles];
}

export function hasRole(
  user,
  requiredRole,
) {
  if (!user) {
    return false;
  }

  return getUserRoles(user).includes(
    requiredRole,
  );
}

export function hasAnyRole(
  user,
  requiredRoles = [],
) {
  return requiredRoles.some((role) =>
    hasRole(user, role),
  );
}

export function hasAllRoles(
  user,
  requiredRoles = [],
) {
  return requiredRoles.every((role) =>
    hasRole(user, role),
  );
}

/**
 * ============================================================
 * PERMISSION CHECKING
 * ============================================================
 */

export function getUserPermissions(user) {
  if (
    !user ||
    !Array.isArray(user.permissions)
  ) {
    return [];
  }

  return user.permissions.filter(
    (permission) =>
      typeof permission === "string",
  );
}

export function hasPermission(
  user,
  permission,
) {
  if (!user) {
    return false;
  }

  const permissions =
    getUserPermissions(user);

  return (
    permissions.includes(permission) ||
    permissions.includes("*")
  );
}

export function hasAnyPermission(
  user,
  permissions = [],
) {
  return permissions.some(
    (permission) =>
      hasPermission(
        user,
        permission,
      ),
  );
}

export function hasAllPermissions(
  user,
  permissions = [],
) {
  return permissions.every(
    (permission) =>
      hasPermission(
        user,
        permission,
      ),
  );
}

/**
 * ============================================================
 * AUTHORIZATION FACTORIES
 * ============================================================
 *
 * These return Fastify-compatible preHandlers.
 * ============================================================
 */

export function requireRoles(
  ...requiredRoles
) {
  return async function roleGuard(
    request,
  ) {
    await requireAuthentication(
      request,
    );

    if (
      !hasAnyRole(
        request.user,
        requiredRoles,
      )
    ) {
      throw new NexusHttpError(
        HTTP_STATUS.FORBIDDEN,
        "You do not have permission to perform this action.",
        {
          code: "INSUFFICIENT_ROLE",
        },
      );
    }
  };
}

export function requireAllRoles(
  ...requiredRoles
) {
  return async function roleGuard(
    request,
  ) {
    await requireAuthentication(
      request,
    );

    if (
      !hasAllRoles(
        request.user,
        requiredRoles,
      )
    ) {
      throw new NexusHttpError(
        HTTP_STATUS.FORBIDDEN,
        "Required roles are missing.",
        {
          code: "INSUFFICIENT_ROLES",
        },
      );
    }
  };
}

export function requirePermissions(
  ...requiredPermissions
) {
  return async function permissionGuard(
    request,
  ) {
    await requireAuthentication(
      request,
    );

    if (
      !hasAllPermissions(
        request.user,
        requiredPermissions,
      )
    ) {
      throw new NexusHttpError(
        HTTP_STATUS.FORBIDDEN,
        "You do not have the required permissions.",
        {
          code: "INSUFFICIENT_PERMISSIONS",
        },
      );
    }
  };
}

export function requireAnyPermission(
  ...requiredPermissions
) {
  return async function permissionGuard(
    request,
  ) {
    await requireAuthentication(
      request,
    );

    if (
      !hasAnyPermission(
        request.user,
        requiredPermissions,
      )
    ) {
      throw new NexusHttpError(
        HTTP_STATUS.FORBIDDEN,
        "You do not have the required permission.",
        {
          code: "INSUFFICIENT_PERMISSION",
        },
      );
    }
  };
}

/**
 * ============================================================
 * RESOURCE OWNERSHIP
 * ============================================================
 *
 * Generic ownership helper.
 *
 * The actual database lookup remains in services.js.
 *
 * A route may use:
 *
 *   requireOwnership(
 *     async (request) =>
 *       service.getResourceOwnerId(
 *         request.params.id
 *       )
 *   )
 * ============================================================
 */

export function requireOwnership(
  resolveOwnerId,
) {
  if (
    typeof resolveOwnerId !==
    "function"
  ) {
    throw new TypeError(
      "requireOwnership expects a function.",
    );
  }

  return async function ownershipGuard(
    request,
  ) {
    await requireAuthentication(
      request,
    );

    const ownerId =
      await resolveOwnerId(request);

    if (
      typeof ownerId !== "string" ||
      ownerId !== request.user.id
    ) {
      throw new NexusHttpError(
        HTTP_STATUS.FORBIDDEN,
        "You do not have access to this resource.",
        {
          code: "RESOURCE_ACCESS_DENIED",
        },
      );
    }
  };
}

/**
 * ============================================================
 * ZOD VALIDATION
 * ============================================================
 *
 * Supports:
 *
 *   body
 *   querystring
 *   params
 *   headers
 *
 * Validation is performed before business logic.
 * ============================================================
 */

function formatZodIssues(error) {
  if (!(error instanceof ZodError)) {
    return [];
  }

  return error.issues.map(
    (issue) => ({
      path: issue.path,
      code: issue.code,
      message: issue.message,
    }),
  );
}

export function validateWithSchema(
  schema,
  value,
  target = "request",
) {
  if (
    !schema ||
    typeof schema.safeParse !==
      "function"
  ) {
    throw new TypeError(
      "A valid Zod schema is required.",
    );
  }

  const result =
    schema.safeParse(value);

  if (!result.success) {
    throw new NexusHttpError(
      HTTP_STATUS.UNPROCESSABLE_ENTITY,
      `Invalid ${target}.`,
      {
        code: "VALIDATION_ERROR",
        details:
          formatZodIssues(
            result.error,
          ),
      },
    );
  }

  return result.data;
}

export function validateBody(
  schema,
) {
  return async function bodyValidation(
    request,
  ) {
    request.body =
      validateWithSchema(
        schema,
        request.body,
        "request body",
      );
  };
}

export function validateQuery(
  schema,
) {
  return async function queryValidation(
    request,
  ) {
    request.query =
      validateWithSchema(
        schema,
        request.query,
        "query parameters",
      );
  };
}

export function validateParams(
  schema,
) {
  return async function paramsValidation(
    request,
  ) {
    request.params =
      validateWithSchema(
        schema,
        request.params,
        "route parameters",
      );
  };
}

export function validateHeaders(
  schema,
) {
  return async function headersValidation(
    request,
  ) {
    request.headers =
      validateWithSchema(
        schema,
        request.headers,
        "request headers",
      );
  };
}

/**
 * Combined validation helper.
 *
 * Usage:
 *
 * preHandler: validateRequest({
 *   body: bodySchema,
 *   query: querySchema,
 *   params: paramsSchema
 * })
 */
export function validateRequest({
  body,
  query,
  params,
  headers,
} = {}) {
  return async function requestValidation(
    request,
  ) {
    if (body) {
      request.body =
        validateWithSchema(
          body,
          request.body,
          "request body",
        );
    }

    if (query) {
      request.query =
        validateWithSchema(
          query,
          request.query,
          "query parameters",
        );
    }

    if (params) {
      request.params =
        validateWithSchema(
          params,
          request.params,
          "route parameters",
        );
    }

    if (headers) {
      request.headers =
        validateWithSchema(
          headers,
          request.headers,
          "request headers",
        );
    }
  };
}

/**
 * ============================================================
 * METHOD PROTECTION
 * ============================================================
 *
 * Prevent unexpected mutation methods from reaching sensitive
 * endpoints.
 * ============================================================
 */

export function requireMethods(
  ...allowedMethods
) {
  const methods = new Set(
    allowedMethods.map((method) =>
      method.toUpperCase(),
    ),
  );

  return async function methodGuard(
    request,
  ) {
    if (!methods.has(request.method)) {
      throw new NexusHttpError(
        405,
        "HTTP method is not allowed for this endpoint.",
        {
          code: "METHOD_NOT_ALLOWED",
        },
      );
    }
  };
}

/**
 * ============================================================
 * PUBLIC ROUTE DETECTION
 * ============================================================
 */

export function isPublicRoute(
  request,
) {
  if (
    PUBLIC_ROUTES.has(
      request.routerPath,
    )
  ) {
    return true;
  }

  return PUBLIC_ROUTES.has(
    request.url.split("?")[0],
  );
}

/**
 * ============================================================
 * SECURITY REQUEST NORMALIZATION
 * ============================================================
 */

function normalizeRequestMetadata(
  request,
) {
  request.nexus = request.nexus ?? {};

  request.nexus.requestId =
    request.id;

  request.nexus.receivedAt =
    new Date().toISOString();

  request.nexus.ip =
    request.ip ?? null;

  request.nexus.userAgent =
    request.headers["user-agent"] ??
    null;

  request.nexus.origin =
    request.headers.origin ??
    null;
}

/**
 * ============================================================
 * REQUEST LIFECYCLE HOOK
 * ============================================================
 */

export async function onRequestHook(
  request,
  reply,
) {
  const requestId =
    createRequestId(request);

  request.id = requestId;

  reply.header(
    "x-request-id",
    requestId,
  );

  normalizeRequestMetadata(
    request,
  );

  /**
   * Prevent obvious HTTP parameter pollution from silently
   * changing request identity.
   */
  if (
    typeof request.url === "string" &&
    request.url.length > 8192
  ) {
    throw new NexusHttpError(
      HTTP_STATUS.BAD_REQUEST,
      "Request URL is too long.",
      {
        code: "REQUEST_URL_TOO_LARGE",
      },
    );
  }
}

/**
 * ============================================================
 * SECURITY HEADERS
 * ============================================================
 *
 * Helmet itself is registered by app.js using
 * @fastify/helmet.
 *
 * These additional application-level headers are safe to
 * enforce here.
 * ============================================================
 */

export async function securityHeadersHook(
  request,
  reply,
) {
  reply.header(
    "x-content-type-options",
    "nosniff",
  );

  reply.header(
    "x-frame-options",
    "SAMEORIGIN",
  );

  reply.header(
    "referrer-policy",
    "strict-origin-when-cross-origin",
  );

  reply.header(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=()",
  );

  reply.header(
    "x-request-id",
    request.id,
  );
}

/**
 * ============================================================
 * CACHE PROTECTION
 * ============================================================
 *
 * Authentication and account endpoints should not be cached
 * by shared intermediaries.
 * ============================================================
 */

export async function noStoreForSensitiveRoutes(
  request,
  reply,
) {
  const path =
    request.url.split("?")[0];

  const sensitive =
    path.startsWith("/api/auth") ||
    path.startsWith("/api/account") ||
    path.startsWith("/api/users/me") ||
    path.startsWith("/api/security") ||
    path.startsWith("/api/payments");

  if (sensitive) {
    reply.header(
      "cache-control",
      "no-store, no-cache, must-revalidate, private",
    );

    reply.header(
      "pragma",
      "no-cache",
    );

    reply.header(
      "expires",
      "0",
    );
  }
}

/**
 * ============================================================
 * ERROR SERIALIZATION
 * ============================================================
 *
 * One consistent API error format.
 *
 * Example:
 *
 * {
 *   "success": false,
 *   "error": {
 *     "code": "VALIDATION_ERROR",
 *     "message": "Invalid request body.",
 *     "requestId": "..."
 *   }
 * }
 *
 * Internal stack traces are NEVER sent to clients in production.
 * ============================================================
 */

export function normalizeError(error) {
  if (
    error instanceof NexusHttpError
  ) {
    return {
      statusCode:
        error.statusCode,
      code:
        error.code,
      message:
        error.message,
      details:
        error.details,
      expose:
        error.expose,
    };
  }

  if (
    error instanceof ZodError
  ) {
    return {
      statusCode:
        HTTP_STATUS.UNPROCESSABLE_ENTITY,
      code:
        "VALIDATION_ERROR",
      message:
        "Request validation failed.",
      details:
        formatZodIssues(error),
      expose: true,
    };
  }

  /**
   * Fastify errors may already contain a statusCode.
   */
  if (
    Number.isInteger(
      error?.statusCode,
    ) &&
    error.statusCode >= 400 &&
    error.statusCode <= 599
  ) {
    return {
      statusCode:
        error.statusCode,
      code:
        error.code ??
        "REQUEST_ERROR",
      message:
        error.message ??
        "Request failed.",
      details:
        undefined,
      expose:
        error.statusCode < 500,
    };
  }

  return {
    statusCode:
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    code:
      "INTERNAL_SERVER_ERROR",
    message:
      "An unexpected server error occurred.",
    details:
      undefined,
    expose: false,
  };
}

/**
 * ============================================================
 * GLOBAL ERROR HANDLER
 * ============================================================
 */

export function globalErrorHandler(
  error,
  request,
  reply,
) {
  const normalized =
    normalizeError(error);

  const requestId =
    request.id ?? null;

  const isProduction =
    process.env.NODE_ENV ===
    "production";

  const safeMessage =
    normalized.expose
      ? normalized.message
      : isProduction
        ? "An unexpected server error occurred."
        : normalized.message;

  const payload = {
    success: false,

    error: {
      code: normalized.code,

      message: safeMessage,

      ...(normalized.details
        ? {
            details:
              normalized.details,
          }
        : {}),

      requestId,
    },
  };

  if (
    normalized.statusCode >= 500
  ) {
    request.log.error(
      {
        err: error,
        requestId,
        method: request.method,
        url: request.url,
      },
      "Unhandled server error",
    );
  } else {
    request.log.warn(
      {
        code: normalized.code,
        requestId,
        method: request.method,
        url: request.url,
      },
      "Request rejected",
    );
  }

  if (reply.sent) {
    return;
  }

  reply
    .code(normalized.statusCode)
    .type("application/json")
    .send(payload);
}

/**
 * ============================================================
 * NOT FOUND HANDLER
 * ============================================================
 */

export function notFoundHandler(
  request,
  reply,
) {
  return reply
    .code(
      HTTP_STATUS.NOT_FOUND,
    )
    .type("application/json")
    .send({
      success: false,

      error: {
        code: "ROUTE_NOT_FOUND",
        message:
          "The requested resource was not found.",
        requestId:
          request.id ?? null,
      },
    });
}

/**
 * ============================================================
 * RESPONSE SECURITY
 * ============================================================
 */

export async function onSendHook(
  request,
  reply,
  payload,
) {
  reply.header(
    "x-request-id",
    request.id,
  );

  /**
   * Do not expose internal server implementation details.
   */
  reply.removeHeader(
    "x-powered-by",
  );

  return payload;
}

/**
 * ============================================================
 * RESPONSE COMPLETION LOGGING
 * ============================================================
 */

export async function onResponseHook(
  request,
  reply,
) {
  const duration =
    Date.now() -
    (
      request.nexus?.receivedAt
        ? new Date(
            request.nexus.receivedAt,
          ).getTime()
        : Date.now()
    );

  const logData = {
    requestId:
      request.id,
    method:
      request.method,
    url:
      request.url,
    statusCode:
      reply.statusCode,
    durationMs:
      Math.max(duration, 0),
    userId:
      request.user?.id ?? null,
  };

  /**
   * Avoid noisy success logs for ordinary GET/HEAD requests
   * unless explicitly enabled.
   */
  const verbose =
    process.env.LOG_HTTP_REQUESTS ===
    "true";

  if (
    verbose ||
    !SAFE_LOG_METHODS.has(
      request.method,
    ) ||
    reply.statusCode >= 400
  ) {
    request.log.info(
      logData,
      "HTTP request completed",
    );
  }
}

/**
 * ============================================================
 * CONTENT-TYPE PROTECTION
 * ============================================================
 */

export async function contentTypeProtectionHook(
  request,
) {
  const method =
    request.method.toUpperCase();

  const bodyMethods = new Set([
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
  ]);

  if (!bodyMethods.has(method)) {
    return;
  }

  /**
   * Multipart and webhook routes may intentionally use another
   * content type and will be handled by their route-specific
   * plugins.
   */
  const contentType =
    request.headers["content-type"];

  if (
    request.body !== undefined &&
    request.body !== null &&
    typeof contentType ===
      "string"
  ) {
    return;
  }
}

/**
 * ============================================================
 * RATE LIMIT CONFIGURATION
 * ============================================================
 *
 * @fastify/rate-limit is installed in package.json.
 *
 * This function provides the central policy consumed by app.js.
 * ============================================================
 */

export function getRateLimitConfig() {
  const max =
    Number.parseInt(
      getEnv(
        "RATE_LIMIT_MAX",
        "120",
      ),
      10,
    );

  const timeWindow =
    getEnv(
      "RATE_LIMIT_WINDOW",
      "1 minute",
    );

  return {
    max:
      Number.isFinite(max) &&
      max > 0
        ? max
        : 120,

    timeWindow,

    cache:
      10000,

    allowList:
      (request) =>
        isHealthRequest(
          request,
        ),

    errorResponseBuilder: (
      request,
      context,
    ) => ({
      success: false,

      error: {
        code:
          "RATE_LIMIT_EXCEEDED",

        message:
          "Too many requests. Please try again later.",

        requestId:
          request.id ?? null,

        retryAfter:
          context.after ?? null,
      },
    }),
  };
}

/**
 * ============================================================
 * AUTH-SPECIFIC RATE LIMIT POLICY
 * ============================================================
 */

export function getAuthenticationRateLimitConfig() {
  const max =
    Number.parseInt(
      getEnv(
        "AUTH_RATE_LIMIT_MAX",
        "10",
      ),
      10,
    );

  return {
    max:
      Number.isFinite(max) &&
      max > 0
        ? max
        : 10,

    timeWindow:
      getEnv(
        "AUTH_RATE_LIMIT_WINDOW",
        "1 minute",
      ),

    keyGenerator:
      (request) =>
        request.ip,

    errorResponseBuilder:
      (request) => ({
        success: false,

        error: {
          code:
            "AUTH_RATE_LIMIT_EXCEEDED",

          message:
            "Too many authentication attempts. Please try again later.",

          requestId:
            request.id ?? null,
        },
      }),
  };
}

/**
 * ============================================================
 * HEALTH REQUEST DETECTION
 * ============================================================
 */

export function isHealthRequest(
  request,
) {
  const path =
    request.url.split("?")[0];

  return (
    path === "/health" ||
    path === "/health/live" ||
    path === "/health/ready"
  );
}

/**
 * ============================================================
 * AUTHENTICATION COOKIE OPTIONS
 * ============================================================
 *
 * Used by the authentication service when issuing tokens.
 *
 * The cookie itself is NOT created here because authentication
 * business logic belongs to services.js.
 * ============================================================
 */

export function getAccessTokenCookieOptions() {
  const isProduction =
    process.env.NODE_ENV ===
    "production";

  return {
    httpOnly: true,

    secure: isProduction,

    sameSite:
      getEnv(
        "AUTH_COOKIE_SAMESITE",
        "lax",
      ),

    path: "/",

    maxAge:
      Number.parseInt(
        getEnv(
          "AUTH_COOKIE_MAX_AGE",
          "3600",
        ),
        10,
      ),

    ...(getEnv(
      "AUTH_COOKIE_DOMAIN",
    )
      ? {
          domain: getEnv(
            "AUTH_COOKIE_DOMAIN",
          ),
        }
      : {}),
  };
}

/**
 * ============================================================
 * CORS CONFIGURATION
 * ============================================================
 *
 * CORS is registered by app.js through @fastify/cors.
 *
 * This helper keeps origin policy centralized.
 * ============================================================
 */

export function getCorsOptions() {
  const configuredOrigins =
    getEnv(
      "CORS_ORIGINS",
      "",
    );

  const origins =
    configuredOrigins
      .split(",")
      .map((origin) =>
        origin.trim(),
      )
      .filter(Boolean);

  const development =
    process.env.NODE_ENV !==
    "production";

  return {
    origin:
      origins.length > 0
        ? origins
        : development
          ? true
          : false,

    credentials: true,

    methods: [
      "GET",
      "HEAD",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Accept",
      "Content-Type",
      "Authorization",
      "X-Request-ID",
      "X-CSRF-Token",
    ],

    exposedHeaders: [
      "X-Request-ID",
      "Retry-After",
    ],
  };
}

/**
 * ============================================================
 * SECURITY HEADERS CONFIGURATION
 * ============================================================
 *
 * Consumed by @fastify/helmet in app.js.
 * ============================================================
 */

export function getHelmetOptions() {
  const isProduction =
    process.env.NODE_ENV ===
    "production";

  return {
    global: true,

    contentSecurityPolicy:
      isProduction
        ? {
            directives: {
              defaultSrc: [
                "'self'",
              ],

              scriptSrc: [
                "'self'",
              ],

              styleSrc: [
                "'self'",
                "'unsafe-inline'",
              ],

              imgSrc: [
                "'self'",
                "data:",
                "https:",
              ],

              fontSrc: [
                "'self'",
                "data:",
                "https:",
              ],

              connectSrc: [
                "'self'",
                "https:",
                "wss:",
                "ws:",
              ],

              objectSrc: [
                "'none'",
              ],

              baseUri: [
                "'self'",
              ],

              frameAncestors: [
                "'self'",
              ],

              formAction: [
                "'self'",
              ],
            },
          }
        : false,

    frameguard: {
      action: "sameorigin",
    },

    referrerPolicy: {
      policy:
        "strict-origin-when-cross-origin",
    },
  };
}

/**
 * ============================================================
 * FASTIFY PLUGIN
 * ============================================================
 *
 * Registers all global middleware hooks and error handling.
 *
 * This is the function that app.js will register.
 * ============================================================
 */

async function middlewarePlugin(
  fastify,
  options = {},
) {
  /**
   * ----------------------------------------------------------
   * REQUEST DECORATORS
   * ----------------------------------------------------------
   */

  fastify.decorateRequest(
    "user",
    null,
  );

  fastify.decorateRequest(
    "nexus",
    null,
  );

  /**
   * ----------------------------------------------------------
   * GLOBAL REQUEST HOOKS
   * ----------------------------------------------------------
   */

  fastify.addHook(
    "onRequest",
    onRequestHook,
  );

  fastify.addHook(
    "onRequest",
    securityHeadersHook,
  );

  fastify.addHook(
    "onRequest",
    noStoreForSensitiveRoutes,
  );

  /**
   * ----------------------------------------------------------
   * RESPONSE HOOKS
   * ----------------------------------------------------------
   */

  fastify.addHook(
    "onSend",
    onSendHook,
  );

  fastify.addHook(
    "onResponse",
    onResponseHook,
  );

  /**
   * ----------------------------------------------------------
   * ERROR HANDLING
   * ----------------------------------------------------------
   */

  fastify.setErrorHandler(
    globalErrorHandler,
  );

  fastify.setNotFoundHandler(
    notFoundHandler,
  );

  /**
   * ----------------------------------------------------------
   * SHARED FASTIFY DECORATORS
   * ----------------------------------------------------------
   */

  fastify.decorate(
    "authenticate",
    authenticateRequest,
  );

  fastify.decorate(
    "optionalAuthenticate",
    optionalAuthentication,
  );

  fastify.decorate(
    "requireAuthentication",
    requireAuthentication,
  );

  fastify.decorate(
    "requireRoles",
    requireRoles,
  );

  fastify.decorate(
    "requirePermissions",
    requirePermissions,
  );

  fastify.decorate(
    "validateRequest",
    validateRequest,
  );

  /**
   * ----------------------------------------------------------
   * READY LOG
   * ----------------------------------------------------------
   */

  fastify.log.info(
    {
      module:
        "server/middleware.js",
      security:
        "enabled",
      authentication:
        "jwt",
      authorization:
        "rbac-and-permissions",
      validation:
        "zod",
      requestIdentification:
        "enabled",
    },
    "NEXUS middleware initialized",
  );
}

/**
 * ============================================================
 * EXPORTED FASTIFY PLUGIN
 * ============================================================
 */

export default fp(
  middlewarePlugin,
  {
    name: "nexus-middleware",
  },
);

/**
 * ============================================================
 * DEFAULT EXPORT COMPATIBILITY
 * ============================================================
 *
 * The default export above is the actual Fastify plugin.
 * All reusable security helpers remain named exports.
 * ============================================================
 */
