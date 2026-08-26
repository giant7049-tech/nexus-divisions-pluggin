/**
 * NEXUS OS
 * server/routes.js
 *
 * Production API route layer.
 *
 * Responsibilities:
 * - Define the HTTP API surface
 * - Validate route parameters and request bodies
 * - Delegate business operations to the service layer
 * - Keep database/business logic OUT of routes
 * - Provide health/readiness/liveness endpoints
 * - Provide API versioning
 * - Provide authentication/session endpoints
 * - Provide users, connect, advertisements, payments,
 *   messages, notifications, analytics and administration routes
 *
 * Architecture:
 *
 * Browser
 *    │
 *    ▼
 * routes.js
 *    │
 *    ▼
 * middleware.js
 *    │
 *    ▼
 * services.js
 *    │
 *    ▼
 * models.js
 *    │
 *    ▼
 * Database
 *
 * Socket.IO does NOT bypass authorization/business rules.
 * server/sockets.js will reuse the same service layer.
 */

import { randomUUID } from "node:crypto";

/* ============================================================
   CONSTANTS
   ============================================================ */

const API_VERSION = "v1";

const API_PREFIX = `/api/${API_VERSION}`;

const SUPPORTED_HTTP_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

const PUBLIC_HEALTH_PATHS = new Set([
  "/health",
  "/health/live",
  "/health/ready",
]);

/* ============================================================
   GENERIC HELPERS
   ============================================================ */

/**
 * Return the application's service container.
 *
 * server.js / app.js can expose services through:
 *
 *   fastify.decorate("services", services)
 *
 * or:
 *
 *   fastify.decorate("nexusServices", services)
 *
 * Both are supported to keep the application composition flexible.
 */
function getServices(request) {
  return (
    request.server.services ??
    request.server.nexusServices ??
    null
  );
}

/**
 * Return the application's model/data container.
 *
 * Models are intentionally accessed through the server container
 * rather than importing database implementation details into routes.
 */
function getModels(request) {
  return (
    request.server.models ??
    request.server.nexusModels ??
    null
  );
}

/**
 * Resolve a service method safely.
 */
function getServiceMethod(request, serviceName, methodName) {
  const services = getServices(request);

  const service = services?.[serviceName];

  if (!service || typeof service[methodName] !== "function") {
    return null;
  }

  return service[methodName].bind(service);
}

/**
 * Create a consistent request identifier.
 *
 * middleware.js may already create one. If not, we create one here.
 */
function getRequestId(request) {
  return (
    request.id ??
    request.headers["x-request-id"] ??
    randomUUID()
  );
}

/**
 * Standard success response.
 */
function success(reply, data = null, options = {}) {
  const {
    statusCode = 200,
    message = null,
    meta = undefined,
  } = options;

  const payload = {
    success: true,
    data,
  };

  if (message) {
    payload.message = message;
  }

  if (meta !== undefined) {
    payload.meta = meta;
  }

  return reply.code(statusCode).send(payload);
}

/**
 * Standard error response.
 */
function fail(
  reply,
  statusCode,
  code,
  message,
  details = undefined,
) {
  const payload = {
    success: false,
    error: {
      code,
      message,
    },
  };

  if (details !== undefined) {
    payload.error.details = details;
  }

  return reply.code(statusCode).send(payload);
}

/**
 * Convert an unknown service failure into an API-safe response.
 *
 * We do not expose database errors, stack traces, secrets,
 * internal paths or implementation details to clients.
 */
function handleRouteError(request, reply, error) {
  request.log.error(
    {
      err: error,
      requestId: getRequestId(request),
    },
    "Route handler failed",
  );

  if (error?.statusCode && error?.code) {
    return fail(
      reply,
      error.statusCode,
      error.code,
      error.publicMessage ?? "Request could not be completed.",
      error.details,
    );
  }

  if (error?.name === "ValidationError") {
    return fail(
      reply,
      400,
      "VALIDATION_ERROR",
      "The supplied data is invalid.",
    );
  }

  if (error?.code === 11000) {
    return fail(
      reply,
      409,
      "RESOURCE_CONFLICT",
      "A resource with the supplied unique value already exists.",
    );
  }

  return fail(
    reply,
    500,
    "INTERNAL_SERVER_ERROR",
    "An unexpected server error occurred.",
  );
}

/**
 * Require a service method.
 *
 * This prevents the application from silently pretending that
 * functionality exists when its corresponding service has not
 * actually been initialized.
 */
function requireService(
  request,
  reply,
  serviceName,
  methodName,
) {
  const method = getServiceMethod(
    request,
    serviceName,
    methodName,
  );

  if (!method) {
    fail(
      reply,
      503,
      "SERVICE_UNAVAILABLE",
      `The ${serviceName}.${methodName} service is not currently available.`,
    );

    return null;
  }

  return method;
}

/**
 * Require an authenticated user.
 *
 * middleware.js is expected to attach:
 *
 * request.user
 *
 * We intentionally check again at the route boundary so that a
 * protected route can never accidentally execute without identity.
 */
function requireUser(request, reply) {
  if (!request.user) {
    fail(
      reply,
      401,
      "AUTHENTICATION_REQUIRED",
      "Authentication is required to access this resource.",
    );

    return false;
  }

  return true;
}

/**
 * Read pagination safely.
 */
function getPagination(query = {}) {
  const page = Math.max(
    Number.parseInt(query.page, 10) || 1,
    1,
  );

  const requestedLimit =
    Number.parseInt(query.limit, 10) || 20;

  const limit = Math.min(
    Math.max(requestedLimit, 1),
    100,
  );

  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip,
  };
}

/**
 * Normalize a string query parameter.
 */
function optionalString(value, maxLength = 500) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();

  if (!normalized) {
    return undefined;
  }

  return normalized.slice(0, maxLength);
}

/**
 * Build route metadata.
 */
function routeMeta(request) {
  return {
    requestId: getRequestId(request),
    timestamp: new Date().toISOString(),
  };
}

/* ============================================================
   HEALTH / SYSTEM ROUTES
   ============================================================ */

async function healthRoutes(fastify) {
  /**
   * Basic application health.
   *
   * This endpoint should remain lightweight.
   */
  fastify.get(
    "/health",
    {
      config: {
        public: true,
        rateLimit: {
          max: 120,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      try {
        const config = request.server.config;

        return success(
          reply,
          {
            status: "ok",
            service: "nexus-os",
            version:
              config?.app?.version ??
              config?.version ??
              "1.0.0",
            environment:
              config?.app?.environment ??
              config?.environment ??
              "unknown",
            uptimeSeconds: Math.floor(
              process.uptime(),
            ),
          },
          {
            message: "NEXUS OS is running.",
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );

  /**
   * Liveness.
   *
   * Indicates that the Node.js process itself is alive.
   * It should not depend on external infrastructure.
   */
  fastify.get(
    "/health/live",
    {
      config: {
        public: true,
        rateLimit: {
          max: 120,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      return success(
        reply,
        {
          status: "alive",
          uptimeSeconds: Math.floor(
            process.uptime(),
          ),
        },
        {
          meta: routeMeta(request),
        },
      );
    },
  );

  /**
   * Readiness.
   *
   * Indicates whether the application is ready to serve
   * real traffic and whether critical dependencies are available.
   */
  fastify.get(
    "/health/ready",
    {
      config: {
        public: true,
        rateLimit: {
          max: 120,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      try {
        const healthService =
          getServiceMethod(
            request,
            "health",
            "readiness",
          );

        if (healthService) {
          const result =
            await healthService();

          const ready =
            result?.ready ??
            result?.status === "ready";

          return success(
            reply,
            {
              status: ready
                ? "ready"
                : "not-ready",
              ...result,
            },
            {
              statusCode: ready ? 200 : 503,
              meta: routeMeta(request),
            },
          );
        }

        /**
         * If the dedicated health service has not yet been
         * initialized, inspect available infrastructure.
         */
        const models = getModels(request);

        const databaseReady =
          typeof models?.health ===
            "function"
            ? await models.health()
            : true;

        const socketReady =
          request.server.io != null ||
          request.server.socketIO != null;

        const ready =
          databaseReady !== false;

        return success(
          reply,
          {
            status: ready
              ? "ready"
              : "not-ready",
            dependencies: {
              database:
                databaseReady !== false
                  ? "available"
                  : "unavailable",
              realtime: socketReady
                ? "available"
                : "initializing",
            },
          },
          {
            statusCode: ready ? 200 : 503,
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );
}

/* ============================================================
   AUTHENTICATION ROUTES
   ============================================================ */

async function authenticationRoutes(fastify) {
  /**
   * Register.
   */
  fastify.post(
    `${API_PREFIX}/auth/register`,
    {
      config: {
        public: true,
      },
    },
    async (request, reply) => {
      try {
        const register = requireService(
          request,
          reply,
          "auth",
          "register",
        );

        if (!register) return;

        const result = await register(
          request.body ?? {},
          {
            requestId: getRequestId(request),
            ip:
              request.ip ??
              request.headers["x-forwarded-for"],
            userAgent:
              request.headers["user-agent"],
          },
        );

        return success(
          reply,
          result,
          {
            statusCode: 201,
            message:
              "Account created successfully.",
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );

  /**
   * Login.
   */
  fastify.post(
    `${API_PREFIX}/auth/login`,
    {
      config: {
        public: true,
      },
    },
    async (request, reply) => {
      try {
        const login = requireService(
          request,
          reply,
          "auth",
          "login",
        );

        if (!login) return;

        const result = await login(
          request.body ?? {},
          {
            requestId: getRequestId(request),
            ip:
              request.ip ??
              request.headers["x-forwarded-for"],
            userAgent:
              request.headers["user-agent"],
          },
        );

        return success(
          reply,
          result,
          {
            message: "Authentication successful.",
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );

  /**
   * Refresh authentication credentials.
   */
  fastify.post(
    `${API_PREFIX}/auth/refresh`,
    {
      config: {
        public: true,
      },
    },
    async (request, reply) => {
      try {
        const refresh = requireService(
          request,
          reply,
          "auth",
          "refresh",
        );

        if (!refresh) return;

        const result = await refresh(
          request.body ?? {},
          {
            requestId: getRequestId(request),
          },
        );

        return success(
          reply,
          result,
          {
            message:
              "Authentication credentials refreshed.",
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );

  /**
   * Logout.
   */
  fastify.post(
    `${API_PREFIX}/auth/logout`,
    async (request, reply) => {
      try {
        if (!requireUser(request, reply)) {
          return;
        }

        const logout = requireService(
          request,
          reply,
          "auth",
          "logout",
        );

        if (!logout) return;

        await logout(
          request.user,
          request.body ?? {},
          {
            requestId: getRequestId(request),
          },
        );

        return success(
          reply,
          null,
          {
            message:
              "Signed out successfully.",
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );

  /**
   * Current authenticated session.
   */
  fastify.get(
    `${API_PREFIX}/auth/me`,
    async (request, reply) => {
      try {
        if (!requireUser(request, reply)) {
          return;
        }

        const getCurrentUser =
          getServiceMethod(
            request,
            "auth",
            "getCurrentUser",
          );

        if (getCurrentUser) {
          const result =
            await getCurrentUser(
              request.user,
            );

          return success(
            reply,
            result,
            {
              meta: routeMeta(request),
            },
          );
        }

        return success(
          reply,
          {
            user: request.user,
          },
          {
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );

  /**
   * Password change.
   */
  fastify.post(
    `${API_PREFIX}/auth/change-password`,
    async (request, reply) => {
      try {
        if (!requireUser(request, reply)) {
          return;
        }

        const changePassword =
          requireService(
            request,
            reply,
            "auth",
            "changePassword",
          );

        if (!changePassword) return;

        await changePassword(
          request.user,
          request.body ?? {},
          {
            requestId: getRequestId(request),
          },
        );

        return success(
          reply,
          null,
          {
            message:
              "Password changed successfully.",
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );
}

/* ============================================================
   USER ROUTES
   ============================================================ */

async function userRoutes(fastify) {
  /**
   * Get current profile.
   */
  fastify.get(
    `${API_PREFIX}/users/me`,
    async (request, reply) => {
      try {
        if (!requireUser(request, reply)) {
          return;
        }

        const getProfile =
          getServiceMethod(
            request,
            "users",
            "getProfile",
          );

        if (!getProfile) {
          return fail(
            reply,
            503,
            "SERVICE_UNAVAILABLE",
            "User profile service is unavailable.",
          );
        }

        const profile =
          await getProfile(
            request.user.id ??
              request.user._id ??
              request.user.userId,
          );

        return success(
          reply,
          profile,
          {
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );

  /**
   * Update current profile.
   */
  fastify.patch(
    `${API_PREFIX}/users/me`,
    async (request, reply) => {
      try {
        if (!requireUser(request, reply)) {
          return;
        }

        const updateProfile =
          requireService(
            request,
            reply,
            "users",
            "updateProfile",
          );

        if (!updateProfile) return;

        const result =
          await updateProfile(
            request.user.id ??
              request.user._id ??
              request.user.userId,
            request.body ?? {},
            {
              requestId: getRequestId(request),
            },
          );

        return success(
          reply,
          result,
          {
            message:
              "Profile updated successfully.",
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );

  /**
   * Public user profile.
   */
  fastify.get(
    `${API_PREFIX}/users/:userId`,
    async (request, reply) => {
      try {
        const userId =
          optionalString(
            request.params?.userId,
            128,
          );

        if (!userId) {
          return fail(
            reply,
            400,
            "INVALID_USER_ID",
            "A valid user ID is required.",
          );
        }

        const getPublicProfile =
          requireService(
            request,
            reply,
            "users",
            "getPublicProfile",
          );

        if (!getPublicProfile) return;

        const profile =
          await getPublicProfile(userId, {
            requester:
              request.user ?? null,
          });

        if (!profile) {
          return fail(
            reply,
            404,
            "USER_NOT_FOUND",
            "The requested user could not be found.",
          );
        }

        return success(
          reply,
          profile,
          {
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );
}

/* ============================================================
   CONNECT ROUTES
   ============================================================ */

async function connectRoutes(fastify) {
  /**
   * Discover people / organizations / opportunities.
   */
  fastify.get(
    `${API_PREFIX}/connect`,
    async (request, reply) => {
      try {
        const discover = requireService(
          request,
          reply,
          "connect",
          "discover",
        );

        if (!discover) return;

        const pagination =
          getPagination(
            request.query,
          );

        const result = await discover({
          query: optionalString(
            request.query?.q,
            200,
          ),
          type: optionalString(
            request.query?.type,
            80,
          ),
          location: optionalString(
            request.query?.location,
            200,
          ),
          ...pagination,
          requester:
            request.user ?? null,
        });

        return success(
          reply,
          result?.items ?? result,
          {
            meta: {
              ...routeMeta(request),
              page:
                result?.page ??
                pagination.page,
              limit:
                result?.limit ??
                pagination.limit,
              total:
                result?.total ??
                undefined,
            },
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );

  /**
   * Connect / follow another user.
   */
  fastify.post(
    `${API_PREFIX}/connect/:userId`,
    async (request, reply) => {
      try {
        if (!requireUser(request, reply)) {
          return;
        }

        const connect =
          requireService(
            request,
            reply,
            "connect",
            "connect",
          );

        if (!connect) return;

        const targetUserId =
          optionalString(
            request.params?.userId,
            128,
          );

        if (!targetUserId) {
          return fail(
            reply,
            400,
            "INVALID_USER_ID",
            "A valid target user ID is required.",
          );
        }

        const result = await connect(
          request.user,
          targetUserId,
          {
            requestId: getRequestId(request),
          },
        );

        return success(
          reply,
          result,
          {
            statusCode: 201,
            message:
              "Connection request processed.",
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );

  /**
   * Remove a connection.
   */
  fastify.delete(
    `${API_PREFIX}/connect/:userId`,
    async (request, reply) => {
      try {
        if (!requireUser(request, reply)) {
          return;
        }

        const disconnect =
          requireService(
            request,
            reply,
            "connect",
            "disconnect",
          );

        if (!disconnect) return;

        const targetUserId =
          optionalString(
            request.params?.userId,
            128,
          );

        if (!targetUserId) {
          return fail(
            reply,
            400,
            "INVALID_USER_ID",
            "A valid target user ID is required.",
          );
        }

        await disconnect(
          request.user,
          targetUserId,
          {
            requestId: getRequestId(request),
          },
        );

        return success(
          reply,
          null,
          {
            message:
              "Connection removed.",
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );
}

/* ============================================================
   ADVERTISEMENT ROUTES
   ============================================================ */

async function advertisementRoutes(fastify) {
  /**
   * List advertisements.
   */
  fastify.get(
    `${API_PREFIX}/advertisements`,
    async (request, reply) => {
      try {
        const list =
          requireService(
            request,
            reply,
            "advertisements",
            "list",
          );

        if (!list) return;

        const pagination =
          getPagination(
            request.query,
          );

        const result = await list({
          q: optionalString(
            request.query?.q,
            200,
          ),
          category: optionalString(
            request.query?.category,
            100,
          ),
          location: optionalString(
            request.query?.location,
            200,
          ),
          status:
            optionalString(
              request.query?.status,
              50,
            ) ?? "active",
          ...pagination,
          requester:
            request.user ?? null,
        });

        return success(
          reply,
          result?.items ?? result,
          {
            meta: {
              ...routeMeta(request),
              page:
                result?.page ??
                pagination.page,
              limit:
                result?.limit ??
                pagination.limit,
              total:
                result?.total ??
                undefined,
            },
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );

  /**
   * Featured advertisements.
   */
  fastify.get(
    `${API_PREFIX}/advertisements/featured`,
    async (request, reply) => {
      try {
        const featured =
          requireService(
            request,
            reply,
            "advertisements",
            "featured",
          );

        if (!featured) return;

        const result = await featured({
          limit: Math.min(
            Number.parseInt(
              request.query?.limit,
              10,
            ) || 12,
            50,
          ),
          requester:
            request.user ?? null,
        });

        return success(
          reply,
          result,
          {
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );

  /**
   * Advertisement details.
   */
  fastify.get(
    `${API_PREFIX}/advertisements/:advertisementId`,
    async (request, reply) => {
      try {
        const getById =
          requireService(
            request,
            reply,
            "advertisements",
            "getById",
          );

        if (!getById) return;

        const id =
          optionalString(
            request.params?.advertisementId,
            128,
          );

        if (!id) {
          return fail(
            reply,
            400,
            "INVALID_ADVERTISEMENT_ID",
            "A valid advertisement ID is required.",
          );
        }

        const result =
          await getById(id, {
            requester:
              request.user ?? null,
          });

        if (!result) {
          return fail(
            reply,
            404,
            "ADVERTISEMENT_NOT_FOUND",
            "The requested advertisement could not be found.",
          );
        }

        return success(
          reply,
          result,
          {
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );

  /**
   * Create advertisement.
   */
  fastify.post(
    `${API_PREFIX}/advertisements`,
    async (request, reply) => {
      try {
        if (!requireUser(request, reply)) {
          return;
        }

        const create =
          requireService(
            request,
            reply,
            "advertisements",
            "create",
          );

        if (!create) return;

        const result = await create(
          request.user,
          request.body ?? {},
          {
            requestId: getRequestId(request),
          },
        );

        return success(
          reply,
          result,
          {
            statusCode: 201,
            message:
              "Advertisement created successfully.",
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );

  /**
   * Update advertisement.
   */
  fastify.patch(
    `${API_PREFIX}/advertisements/:advertisementId`,
    async (request, reply) => {
      try {
        if (!requireUser(request, reply)) {
          return;
        }

        const update =
          requireService(
            request,
            reply,
            "advertisements",
            "update",
          );

        if (!update) return;

        const id =
          optionalString(
            request.params?.advertisementId,
            128,
          );

        if (!id) {
          return fail(
            reply,
            400,
            "INVALID_ADVERTISEMENT_ID",
            "A valid advertisement ID is required.",
          );
        }

        const result = await update(
          request.user,
          id,
          request.body ?? {},
          {
            requestId: getRequestId(request),
          },
        );

        return success(
          reply,
          result,
          {
            message:
              "Advertisement updated successfully.",
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );

  /**
   * Record a genuine advertisement analytics event.
   *
   * Administrative adjustments are NOT performed through this
   * endpoint. Organic events remain separate from corrections.
   */
  fastify.post(
    `${API_PREFIX}/advertisements/:advertisementId/events`,
    async (request, reply) => {
      try {
        const recordEvent =
          requireService(
            request,
            reply,
            "analytics",
            "recordAdvertisementEvent",
          );

        if (!recordEvent) return;

        const id =
          optionalString(
            request.params?.advertisementId,
            128,
          );

        if (!id) {
          return fail(
            reply,
            400,
            "INVALID_ADVERTISEMENT_ID",
            "A valid advertisement ID is required.",
          );
        }

        const result =
          await recordEvent({
            advertisementId: id,
            eventType:
              request.body?.eventType,
            requester:
              request.user ?? null,
            requestId:
              getRequestId(request),
            ip:
              request.ip ??
              request.headers["x-forwarded-for"],
            userAgent:
              request.headers["user-agent"],
            metadata:
              request.body?.metadata ?? {},
          });

        return success(
          reply,
          result,
          {
            statusCode: 201,
            message:
              "Analytics event recorded.",
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );
}

/* ============================================================
   PAYMENT ROUTES
   ============================================================ */

async function paymentRoutes(fastify) {
  /**
   * Initialize a payment.
   */
  fastify.post(
    `${API_PREFIX}/payments/initialize`,
    async (request, reply) => {
      try {
        if (!requireUser(request, reply)) {
          return;
        }

        const initialize =
          requireService(
            request,
            reply,
            "payments",
            "initialize",
          );

        if (!initialize) return;

        const result =
          await initialize(
            request.user,
            request.body ?? {},
            {
              requestId: getRequestId(request),
            },
          );

        return success(
          reply,
          result,
          {
            statusCode: 201,
            message:
              "Payment initialized successfully.",
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );

  /**
   * Verify payment.
   *
   * The client may request verification, but the service must
   * independently verify the transaction with the provider.
   */
  fastify.get(
    `${API_PREFIX}/payments/:reference/verify`,
    async (request, reply) => {
      try {
        if (!requireUser(request, reply)) {
          return;
        }

        const verify =
          requireService(
            request,
            reply,
            "payments",
            "verify",
          );

        if (!verify) return;

        const reference =
          optionalString(
            request.params?.reference,
            200,
          );

        if (!reference) {
          return fail(
            reply,
            400,
            "INVALID_PAYMENT_REFERENCE",
            "A valid payment reference is required.",
          );
        }

        const result = await verify(
          request.user,
          reference,
          {
            requestId: getRequestId(request),
          },
        );

        return success(
          reply,
          result,
          {
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );

  /**
   * Payment history.
   */
  fastify.get(
    `${API_PREFIX}/payments`,
    async (request, reply) => {
      try {
        if (!requireUser(request, reply)) {
          return;
        }

        const list =
          requireService(
            request,
            reply,
            "payments",
            "listForUser",
          );

        if (!list) return;

        const pagination =
          getPagination(
            request.query,
          );

        const result =
          await list(
            request.user,
            pagination,
          );

        return success(
          reply,
          result?.items ?? result,
          {
            meta: {
              ...routeMeta(request),
              page:
                result?.page ??
                pagination.page,
              limit:
                result?.limit ??
                pagination.limit,
              total:
                result?.total ??
                undefined,
            },
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );

  /**
   * Paystack webhook.
   *
   * This endpoint must remain public because Paystack calls it
   * directly. Signature verification belongs to the payment
   * service and MUST happen before processing the event.
   */
  fastify.post(
    `${API_PREFIX}/payments/webhooks/paystack`,
    {
      config: {
        public: true,
        rateLimit: {
          max: 300,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      try {
        const webhook =
          requireService(
            request,
            reply,
            "payments",
            "handleWebhook",
          );

        if (!webhook) return;

        const signature =
          request.headers[
            "x-paystack-signature"
          ];

        if (!signature) {
          return fail(
            reply,
            401,
            "WEBHOOK_SIGNATURE_REQUIRED",
            "Webhook signature is required.",
          );
        }

        const result =
          await webhook(
            request.body ?? {},
            {
              signature,
              requestId:
                getRequestId(request),
              rawBody:
                request.rawBody ?? null,
            },
          );

        return success(
          reply,
          result ?? null,
          {
            message:
              "Webhook received.",
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );
}

/* ============================================================
   MESSAGE / COMMUNICATION ROUTES
   ============================================================ */

async function messageRoutes(fastify) {
  /**
   * Conversations.
   */
  fastify.get(
    `${API_PREFIX}/messages/conversations`,
    async (request, reply) => {
      try {
        if (!requireUser(request, reply)) {
          return;
        }

        const list =
          requireService(
            request,
            reply,
            "messaging",
            "listConversations",
          );

        if (!list) return;

        const pagination =
          getPagination(
            request.query,
          );

        const result =
          await list(
            request.user,
            pagination,
          );

        return success(
          reply,
          result?.items ?? result,
          {
            meta: {
              ...routeMeta(request),
              page:
                result?.page ??
                pagination.page,
              limit:
                result?.limit ??
                pagination.limit,
              total:
                result?.total ??
                undefined,
            },
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );

  /**
   * Conversation details.
   */
  fastify.get(
    `${API_PREFIX}/messages/conversations/:conversationId`,
    async (request, reply) => {
      try {
        if (!requireUser(request, reply)) {
          return;
        }

        const getConversation =
          requireService(
            request,
            reply,
            "messaging",
            "getConversation",
          );

        if (!getConversation) return;

        const conversationId =
          optionalString(
            request.params?.conversationId,
            128,
          );

        if (!conversationId) {
          return fail(
            reply,
            400,
            "INVALID_CONVERSATION_ID",
            "A valid conversation ID is required.",
          );
        }

        const result =
          await getConversation(
            request.user,
            conversationId,
          );

        return success(
          reply,
          result,
          {
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );

  /**
   * Send a message through REST.
   *
   * Socket.IO will use the same messaging service so REST and
   * realtime messaging cannot silently implement different rules.
   */
  fastify.post(
    `${API_PREFIX}/messages`,
    async (request, reply) => {
      try {
        if (!requireUser(request, reply)) {
          return;
        }

        const sendMessage =
          requireService(
            request,
            reply,
            "messaging",
            "sendMessage",
          );

        if (!sendMessage) return;

        const result =
          await sendMessage(
            request.user,
            request.body ?? {},
            {
              requestId:
                getRequestId(request),
            },
          );

        return success(
          reply,
          result,
          {
            statusCode: 201,
            message:
              "Message sent successfully.",
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );

  /**
   * Mark a conversation as read.
   */
  fastify.post(
    `${API_PREFIX}/messages/conversations/:conversationId/read`,
    async (request, reply) => {
      try {
        if (!requireUser(request, reply)) {
          return;
        }

        const markRead =
          requireService(
            request,
            reply,
            "messaging",
            "markConversationRead",
          );

        if (!markRead) return;

        const conversationId =
          optionalString(
            request.params?.conversationId,
            128,
          );

        if (!conversationId) {
          return fail(
            reply,
            400,
            "INVALID_CONVERSATION_ID",
            "A valid conversation ID is required.",
          );
        }

        const result =
          await markRead(
            request.user,
            conversationId,
            {
              requestId:
                getRequestId(request),
            },
          );

        return success(
          reply,
          result,
          {
            message:
              "Conversation marked as read.",
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );
}

/* ============================================================
   NOTIFICATION ROUTES
   ============================================================ */

async function notificationRoutes(fastify) {
  /**
   * Get notifications.
   */
  fastify.get(
    `${API_PREFIX}/notifications`,
    async (request, reply) => {
      try {
        if (!requireUser(request, reply)) {
          return;
        }

        const list =
          requireService(
            request,
            reply,
            "notifications",
            "list",
          );

        if (!list) return;

        const pagination =
          getPagination(
            request.query,
          );

        const result =
          await list(
            request.user,
            pagination,
          );

        return success(
          reply,
          result?.items ?? result,
          {
            meta: {
              ...routeMeta(request),
              page:
                result?.page ??
                pagination.page,
              limit:
                result?.limit ??
                pagination.limit,
              total:
                result?.total ??
                undefined,
            },
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );

  /**
   * Mark one notification as read.
   */
  fastify.post(
    `${API_PREFIX}/notifications/:notificationId/read`,
    async (request, reply) => {
      try {
        if (!requireUser(request, reply)) {
          return;
        }

        const markRead =
          requireService(
            request,
            reply,
            "notifications",
            "markRead",
          );

        if (!markRead) return;

        const notificationId =
          optionalString(
            request.params?.notificationId,
            128,
          );

        if (!notificationId) {
          return fail(
            reply,
            400,
            "INVALID_NOTIFICATION_ID",
            "A valid notification ID is required.",
          );
        }

        const result =
          await markRead(
            request.user,
            notificationId,
            {
              requestId:
                getRequestId(request),
            },
          );

        return success(
          reply,
          result,
          {
            message:
              "Notification marked as read.",
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );

  /**
   * Mark all notifications as read.
   */
  fastify.post(
    `${API_PREFIX}/notifications/read-all`,
    async (request, reply) => {
      try {
        if (!requireUser(request, reply)) {
          return;
        }

        const markAllRead =
          requireService(
            request,
            reply,
            "notifications",
            "markAllRead",
          );

        if (!markAllRead) return;

        const result =
          await markAllRead(
            request.user,
            {
              requestId:
                getRequestId(request),
            },
          );

        return success(
          reply,
          result,
          {
            message:
              "Notifications marked as read.",
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );
}

/* ============================================================
   ANALYTICS ROUTES
   ============================================================ */

async function analyticsRoutes(fastify) {
  /**
   * Current user's analytics.
   */
  fastify.get(
    `${API_PREFIX}/analytics`,
    async (request, reply) => {
      try {
        if (!requireUser(request, reply)) {
          return;
        }

        const getAnalytics =
          requireService(
            request,
            reply,
            "analytics",
            "getForUser",
          );

        if (!getAnalytics) return;

        const result =
          await getAnalytics(
            request.user,
            {
              from:
                optionalString(
                  request.query?.from,
                  40,
                ),
              to:
                optionalString(
                  request.query?.to,
                  40,
                ),
              type:
                optionalString(
                  request.query?.type,
                  100,
                ),
            },
          );

        return success(
          reply,
          result,
          {
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );
}

/* ============================================================
   ADMINISTRATION ROUTES
   ============================================================ */

/**
 * Administrative routes are intentionally protected by the
 * authorization middleware.
 *
 * The middleware must enforce RBAC / permissions before these
 * handlers execute.
 */
async function administrationRoutes(fastify) {
  /**
   * Admin dashboard summary.
   */
  fastify.get(
    `${API_PREFIX}/admin/overview`,
    {
      config: {
        requiredPermissions: [
          "admin.dashboard.read",
        ],
      },
    },
    async (request, reply) => {
      try {
        if (!requireUser(request, reply)) {
          return;
        }

        const overview =
          requireService(
            request,
            reply,
            "admin",
            "getOverview",
          );

        if (!overview) return;

        const result =
          await overview(
            request.user,
            {
              requestId:
                getRequestId(request),
            },
          );

        return success(
          reply,
          result,
          {
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );

  /**
   * Audit log query.
   */
  fastify.get(
    `${API_PREFIX}/admin/audit`,
    {
      config: {
        requiredPermissions: [
          "audit.read",
        ],
      },
    },
    async (request, reply) => {
      try {
        if (!requireUser(request, reply)) {
          return;
        }

        const listAudit =
          requireService(
            request,
            reply,
            "audit",
            "list",
          );

        if (!listAudit) return;

        const pagination =
          getPagination(
            request.query,
          );

        const result =
          await listAudit(
            request.user,
            {
              ...pagination,
              action:
                optionalString(
                  request.query?.action,
                  100,
                ),
              actorId:
                optionalString(
                  request.query?.actorId,
                  128,
                ),
              resourceType:
                optionalString(
                  request.query?.resourceType,
                  100,
                ),
            },
          );

        return success(
          reply,
          result?.items ?? result,
          {
            meta: {
              ...routeMeta(request),
              page:
                result?.page ??
                pagination.page,
              limit:
                result?.limit ??
                pagination.limit,
              total:
                result?.total ??
                undefined,
            },
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );

  /**
   * Administrative analytics correction.
   *
   * This endpoint is deliberately separate from organic analytics.
   * The service MUST create an immutable audit record containing:
   *
   * - administrator
   * - reason
   * - previous value
   * - new value
   * - timestamp
   * - request ID
   */
  fastify.post(
    `${API_PREFIX}/admin/analytics/adjustments`,
    {
      config: {
        requiredPermissions: [
          "analytics.adjust",
        ],
      },
    },
    async (request, reply) => {
      try {
        if (!requireUser(request, reply)) {
          return;
        }

        const adjust =
          requireService(
            request,
            reply,
            "analytics",
            "createAdministrativeAdjustment",
          );

        if (!adjust) return;

        const reason =
          optionalString(
            request.body?.reason,
            1000,
          );

        if (!reason) {
          return fail(
            reply,
            400,
            "ADJUSTMENT_REASON_REQUIRED",
            "A reason is required for an administrative analytics adjustment.",
          );
        }

        const result =
          await adjust(
            request.user,
            {
              ...request.body,
              reason,
            },
            {
              requestId:
                getRequestId(request),
            },
          );

        return success(
          reply,
          result,
          {
            statusCode: 201,
            message:
              "Administrative analytics adjustment recorded.",
            meta: routeMeta(request),
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );
}

/* ============================================================
   GENERIC PLATFORM SEARCH
   ============================================================ */

async function searchRoutes(fastify) {
  fastify.get(
    `${API_PREFIX}/search`,
    async (request, reply) => {
      try {
        const search =
          requireService(
            request,
            reply,
            "search",
            "global",
          );

        if (!search) return;

        const query =
          optionalString(
            request.query?.q,
            200,
          );

        if (!query) {
          return fail(
            reply,
            400,
            "SEARCH_QUERY_REQUIRED",
            "A search query is required.",
          );
        }

        const pagination =
          getPagination(
            request.query,
          );

        const result =
          await search({
            q: query,
            type:
              optionalString(
                request.query?.type,
                100,
              ),
            ...pagination,
            requester:
              request.user ?? null,
          });

        return success(
          reply,
          result?.items ?? result,
          {
            meta: {
              ...routeMeta(request),
              page:
                result?.page ??
                pagination.page,
              limit:
                result?.limit ??
                pagination.limit,
              total:
                result?.total ??
                undefined,
            },
          },
        );
      } catch (error) {
        return handleRouteError(
          request,
          reply,
          error,
        );
      }
    },
  );
}

/* ============================================================
   ROUTE REGISTRATION
   ============================================================ */

/**
 * Main route plugin.
 *
 * app.js will register this plugin with Fastify.
 *
 * Example:
 *
 * await fastify.register(routes);
 */
export default async function routes(
  fastify,
  options = {},
) {
  void options;

  /* ----------------------------------------------------------
     Health endpoints
     ---------------------------------------------------------- */

  await fastify.register(
    healthRoutes,
  );

  /* ----------------------------------------------------------
     API modules
     ---------------------------------------------------------- */

  await fastify.register(
    authenticationRoutes,
  );

  await fastify.register(
    userRoutes,
  );

  await fastify.register(
    connectRoutes,
  );

  await fastify.register(
    advertisementRoutes,
  );

  await fastify.register(
    paymentRoutes,
  );

  await fastify.register(
    messageRoutes,
  );

  await fastify.register(
    notificationRoutes,
  );

  await fastify.register(
    analyticsRoutes,
  );

  await fastify.register(
    administrationRoutes,
  );

  await fastify.register(
    searchRoutes,
  );

  /**
   * API information endpoint.
   *
   * Useful for deployment verification and debugging.
   */
  fastify.get(
    `${API_PREFIX}`,
    {
      config: {
        public: true,
      },
    },
    async (request, reply) => {
      return success(
        reply,
        {
          name: "NEXUS OS API",
          version: API_VERSION,
          platform: "nexus-os",
          status: "operational",
          capabilities: [
            "identity",
            "customers",
            "connect",
            "professionals",
            "services",
            "jobs",
            "marketplace",
            "projects",
            "property",
            "construction",
            "communication",
            "payments",
            "analytics",
            "administration",
            "realtime",
          ],
        },
        {
          meta: routeMeta(request),
        },
      );
    },
  );

  /**
   * Explicit unsupported API response.
   *
   * This is preferable to returning a generic HTML 404 for
   * an API client.
   */
  fastify.setNotFoundHandler(
    async (request, reply) => {
      const path = request.url
        .split("?")[0];

      if (
        path.startsWith("/api/")
      ) {
        return fail(
          reply,
          404,
          "API_ROUTE_NOT_FOUND",
          "The requested API endpoint does not exist.",
        );
      }

      return reply.callNotFound();
    },
  );

  /**
   * Route-level error boundary.
   *
   * The global error handler in app.js remains authoritative,
   * but this handler ensures route-level failures never leak
   * internal implementation details.
   */
  fastify.setErrorHandler(
    async (
      error,
      request,
      reply,
    ) => {
      return handleRouteError(
        request,
        reply,
        error,
      );
    },
  );
}

/* ============================================================
   INTERNAL EXPORTS
   ============================================================ */

/**
 * These exports make the helper functions testable without
 * exposing them as HTTP endpoints.
 */
export {
  API_PREFIX,
  getPagination,
  optionalString,
  success,
  fail,
  routeMeta,
  getServices,
  getModels,
};
