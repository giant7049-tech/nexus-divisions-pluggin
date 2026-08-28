/**
 * NEXUS OS
 * server/sockets.js
 *
 * Real-time communication layer for NEXUS OS.
 *
 * Responsibilities:
 * - Socket.IO server configuration
 * - authenticated socket connections
 * - JWT authentication
 * - user rooms
 * - conversation rooms
 * - online/offline presence
 * - private events
 * - messaging events
 * - typing indicators
 * - delivery/read receipts
 * - notification events
 * - system events
 * - reconnect support
 * - server-side authorization
 * - rate protection for realtime actions
 * - graceful Socket.IO shutdown
 *
 * This module intentionally contains realtime transport/orchestration.
 * Business logic and persistence belong to services.js/models.js.
 */

import { Server as SocketIOServer } from "socket.io";
import jwt from "jsonwebtoken";
import cookie from "cookie";
import { randomUUID } from "node:crypto";

/**
 * ---------------------------------------------------------------
 * CONSTANTS
 * ---------------------------------------------------------------
 */

const SOCKET_VERSION = "1.0";

const DEFAULT_MAX_CONNECTIONS_PER_USER = 5;

const SOCKET_EVENTS = Object.freeze({
  CONNECTION_READY: "system:ready",
  CONNECTION_ERROR: "system:error",

  PRESENCE_ONLINE: "presence:online",
  PRESENCE_OFFLINE: "presence:offline",
  PRESENCE_STATUS: "presence:status",

  MESSAGE_SEND: "message:send",
  MESSAGE_SENT: "message:sent",
  MESSAGE_RECEIVED: "message:received",
  MESSAGE_DELIVERED: "message:delivered",
  MESSAGE_READ: "message:read",
  MESSAGE_DELETED: "message:deleted",
  MESSAGE_UPDATED: "message:updated",

  CONVERSATION_JOIN: "conversation:join",
  CONVERSATION_LEAVE: "conversation:leave",
  CONVERSATION_UPDATED: "conversation:updated",

  TYPING_START: "typing:start",
  TYPING_STOP: "typing:stop",

  NOTIFICATION_NEW: "notification:new",
  NOTIFICATION_READ: "notification:read",
  NOTIFICATION_UPDATED: "notification:updated",

  SYSTEM_EVENT: "system:event",

  CONNECTION_PING: "connection:ping",
  CONNECTION_PONG: "connection:pong",
});

/**
 * ---------------------------------------------------------------
 * UTILITY FUNCTIONS
 * ---------------------------------------------------------------
 */

function normalizeId(value) {
  if (value === undefined || value === null) {
    return null;
  }

  return String(value);
}

function getUserRoom(userId) {
  return `user:${normalizeId(userId)}`;
}

function getConversationRoom(conversationId) {
  return `conversation:${normalizeId(conversationId)}`;
}

function getPresenceRoom(userId) {
  return `presence:${normalizeId(userId)}`;
}

function getSocketRequestId(socket) {
  return socket.data?.requestId || randomUUID();
}

function createSocketError(code, message, details = undefined) {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}

function createSocketSuccess(data = {}) {
  return {
    ok: true,
    ...data,
  };
}

/**
 * Safely call a service method.
 *
 * The service layer remains the owner of business logic.
 * This helper prevents a missing optional service from crashing
 * the entire realtime server.
 */
async function callService(services, serviceName, methodName, ...args) {
  const service = services?.[serviceName];

  if (!service || typeof service[methodName] !== "function") {
    return null;
  }

  return service[methodName](...args);
}

/**
 * ---------------------------------------------------------------
 * JWT AUTHENTICATION
 * ---------------------------------------------------------------
 */

function extractToken(socket) {
  const authToken = socket.handshake?.auth?.token;

  if (authToken && typeof authToken === "string") {
    return authToken;
  }

  const authorization = socket.handshake?.headers?.authorization;

  if (
    typeof authorization === "string" &&
    authorization.toLowerCase().startsWith("bearer ")
  ) {
    return authorization.slice(7).trim();
  }

  const cookieHeader = socket.handshake?.headers?.cookie;

  if (typeof cookieHeader === "string") {
    try {
      const cookies = cookie.parse(cookieHeader);

      const cookieToken =
        cookies.accessToken ||
        cookies.access_token ||
        cookies.nexus_access_token;

      if (cookieToken) {
        return cookieToken;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function authenticateSocket(socket, config) {
  const token = extractToken(socket);

  if (!token) {
    throw new Error("AUTHENTICATION_REQUIRED");
  }

  const secret =
    config?.security?.jwtSecret ||
    config?.jwtSecret ||
    process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET_NOT_CONFIGURED");
  }

  const issuer =
    config?.security?.jwtIssuer ||
    config?.jwtIssuer ||
    process.env.JWT_ISSUER;

  const audience =
    config?.security?.jwtAudience ||
    config?.jwtAudience ||
    process.env.JWT_AUDIENCE;

  const verifyOptions = {};

  if (issuer) {
    verifyOptions.issuer = issuer;
  }

  if (audience) {
    verifyOptions.audience = audience;
  }

  const payload = jwt.verify(token, secret, verifyOptions);

  const userId =
    payload.sub ||
    payload.userId ||
    payload.id;

  if (!userId) {
    throw new Error("INVALID_TOKEN_SUBJECT");
  }

  return {
    id: normalizeId(userId),
    role: payload.role || "user",
    roles: Array.isArray(payload.roles)
      ? payload.roles
      : payload.role
        ? [payload.role]
        : ["user"],
    sessionId:
      payload.sessionId ||
      payload.sid ||
      null,
    tokenIssuedAt: payload.iat || null,
    tokenExpiresAt: payload.exp || null,
  };
}

/**
 * ---------------------------------------------------------------
 * SOCKET AUTH MIDDLEWARE
 * ---------------------------------------------------------------
 */

function createAuthenticationMiddleware(config, logger) {
  return async (socket, next) => {
    try {
      const user = authenticateSocket(socket, config);

      socket.data.user = user;
      socket.data.authenticated = true;
      socket.data.requestId = randomUUID();
      socket.data.connectedAt = new Date();

      next();
    } catch (error) {
      const code = error?.message || "SOCKET_AUTHENTICATION_FAILED";

      logger?.warn?.(
        {
          socketId: socket.id,
          error: code,
        },
        "Socket authentication failed",
      );

      const authError = new Error(
        code === "AUTHENTICATION_REQUIRED"
          ? "Authentication required."
          : "Realtime authentication failed.",
      );

      authError.data = {
        code,
        requestId: randomUUID(),
      };

      next(authError);
    }
  };
}

/**
 * ---------------------------------------------------------------
 * CONNECTION LIMITING
 * ---------------------------------------------------------------
 */

function createConnectionLimiter(maxConnectionsPerUser) {
  const connections = new Map();

  return {
    add(userId, socketId) {
      const id = normalizeId(userId);

      if (!connections.has(id)) {
        connections.set(id, new Set());
      }

      const sockets = connections.get(id);

      if (sockets.size >= maxConnectionsPerUser) {
        return false;
      }

      sockets.add(socketId);

      return true;
    },

    remove(userId, socketId) {
      const id = normalizeId(userId);
      const sockets = connections.get(id);

      if (!sockets) {
        return;
      }

      sockets.delete(socketId);

      if (sockets.size === 0) {
        connections.delete(id);
      }
    },

    count(userId) {
      return connections.get(normalizeId(userId))?.size || 0;
    },

    isOnline(userId) {
      return this.count(userId) > 0;
    },
  };
}

/**
 * ---------------------------------------------------------------
 * REALTIME STATE
 * ---------------------------------------------------------------
 */

function createRealtimeState() {
  return {
    connectedAt: new Date(),
    connections: new Map(),
    conversationMembers: new Map(),
  };
}

/**
 * ---------------------------------------------------------------
 * AUTHORISATION
 * ---------------------------------------------------------------
 */

function hasRole(socket, roles = []) {
  const userRoles = socket.data?.user?.roles || [];

  return roles.some((role) => userRoles.includes(role));
}

function requireAuthenticated(socket) {
  if (!socket.data?.authenticated || !socket.data?.user?.id) {
    throw new Error("AUTHENTICATION_REQUIRED");
  }
}

async function authorizeConversation(
  socket,
  conversationId,
  services,
) {
  requireAuthenticated(socket);

  if (!conversationId) {
    throw new Error("CONVERSATION_ID_REQUIRED");
  }

  /**
   * The service layer should perform the authoritative check.
   *
   * Example:
   * ConversationService.canAccessConversation(userId, conversationId)
   */
  const result = await callService(
    services,
    "conversationService",
    "canAccessConversation",
    socket.data.user.id,
    conversationId,
  );

  /**
   * If the service exists, its decision is authoritative.
   */
  if (result !== null) {
    return Boolean(result);
  }

  /**
   * Until the service layer is connected, do not grant access
   * merely because the client supplied a conversation ID.
   */
  return false;
}

/**
 * ---------------------------------------------------------------
 * PRESENCE
 * ---------------------------------------------------------------
 */

async function handlePresenceOnline(socket, services, logger) {
  const userId = socket.data.user.id;

  await callService(
    services,
    "presenceService",
    "setOnline",
    userId,
    {
      socketId: socket.id,
      connectedAt: socket.data.connectedAt,
    },
  );

  socket.join(getUserRoom(userId));
  socket.join(getPresenceRoom(userId));

  logger?.debug?.(
    {
      userId,
      socketId: socket.id,
    },
    "User joined realtime presence",
  );

  socket.broadcast.emit(SOCKET_EVENTS.PRESENCE_ONLINE, {
    userId,
    timestamp: new Date().toISOString(),
  });
}

async function handlePresenceOffline(
  socket,
  services,
  connectionLimiter,
  logger,
) {
  const userId = socket.data?.user?.id;

  if (!userId) {
    return;
  }

  const remainingConnections =
    connectionLimiter.count(userId);

  /**
   * Only mark the user offline after their final socket
   * connection has disappeared.
   */
  if (remainingConnections === 0) {
    await callService(
      services,
      "presenceService",
      "setOffline",
      userId,
      {
        disconnectedAt: new Date(),
      },
    );

    socket.broadcast.emit(SOCKET_EVENTS.PRESENCE_OFFLINE, {
      userId,
      timestamp: new Date().toISOString(),
    });
  }

  logger?.debug?.(
    {
      userId,
      socketId: socket.id,
      remainingConnections,
    },
    "Realtime presence disconnected",
  );
}

/**
 * ---------------------------------------------------------------
 * CONVERSATIONS
 * ---------------------------------------------------------------
 */

async function handleConversationJoin(
  socket,
  payload,
  services,
) {
  requireAuthenticated(socket);

  const conversationId =
    normalizeId(payload?.conversationId);

  if (!conversationId) {
    return createSocketError(
      "CONVERSATION_ID_REQUIRED",
      "A conversation ID is required.",
    );
  }

  const authorized = await authorizeConversation(
    socket,
    conversationId,
    services,
  );

  if (!authorized) {
    return createSocketError(
      "FORBIDDEN",
      "You are not authorized to access this conversation.",
    );
  }

  const room = getConversationRoom(conversationId);

  socket.join(room);

  if (!services?.conversationService) {
    return createSocketSuccess({
      conversationId,
      joined: true,
    });
  }

  return createSocketSuccess({
    conversationId,
    joined: true,
  });
}

async function handleConversationLeave(
  socket,
  payload,
) {
  requireAuthenticated(socket);

  const conversationId =
    normalizeId(payload?.conversationId);

  if (!conversationId) {
    return createSocketError(
      "CONVERSATION_ID_REQUIRED",
      "A conversation ID is required.",
    );
  }

  socket.leave(
    getConversationRoom(conversationId),
  );

  return createSocketSuccess({
    conversationId,
    joined: false,
  });
}

/**
 * ---------------------------------------------------------------
 * MESSAGES
 * ---------------------------------------------------------------
 */

async function handleMessageSend(
  io,
  socket,
  payload,
  services,
  logger,
) {
  try {
    requireAuthenticated(socket);

    const conversationId =
      normalizeId(payload?.conversationId);

    const content =
      typeof payload?.content === "string"
        ? payload.content.trim()
        : "";

    if (!conversationId) {
      return createSocketError(
        "CONVERSATION_ID_REQUIRED",
        "A conversation ID is required.",
      );
    }

    if (!content) {
      return createSocketError(
        "MESSAGE_CONTENT_REQUIRED",
        "Message content cannot be empty.",
      );
    }

    if (content.length > 10_000) {
      return createSocketError(
        "MESSAGE_TOO_LARGE",
        "Message exceeds the maximum permitted length.",
      );
    }

    const authorized = await authorizeConversation(
      socket,
      conversationId,
      services,
    );

    if (!authorized) {
      return createSocketError(
        "FORBIDDEN",
        "You are not authorized to send messages to this conversation.",
      );
    }

    const clientMessageId =
      normalizeId(payload?.clientMessageId) ||
      randomUUID();

    /**
     * Persistence must happen through the service layer.
     */
    const message =
      await callService(
        services,
        "messageService",
        "createMessage",
        {
          conversationId,
          senderId: socket.data.user.id,
          content,
          clientMessageId,
          metadata:
            payload?.metadata &&
            typeof payload.metadata === "object"
              ? payload.metadata
              : {},
        },
      );

    if (!message) {
      logger?.error?.(
        {
          socketId: socket.id,
          conversationId,
          userId: socket.data.user.id,
        },
        "Message service unavailable",
      );

      return createSocketError(
        "MESSAGE_SERVICE_UNAVAILABLE",
        "The messaging service is temporarily unavailable.",
      );
    }

    const eventPayload = {
      message,
      requestId: getSocketRequestId(socket),
      timestamp: new Date().toISOString(),
    };

    io.to(
      getConversationRoom(conversationId),
    ).emit(
      SOCKET_EVENTS.MESSAGE_RECEIVED,
      eventPayload,
    );

    socket.emit(
      SOCKET_EVENTS.MESSAGE_SENT,
      eventPayload,
    );

    return createSocketSuccess({
      message,
    });
  } catch (error) {
    logger?.error?.(
      {
        err: error,
        socketId: socket.id,
      },
      "Realtime message send failed",
    );

    return createSocketError(
      "MESSAGE_SEND_FAILED",
      "Unable to send the message.",
    );
  }
}

/**
 * ---------------------------------------------------------------
 * DELIVERY RECEIPTS
 * ---------------------------------------------------------------
 */

async function handleMessageDelivered(
  io,
  socket,
  payload,
  services,
) {
  try {
    requireAuthenticated(socket);

    const messageId =
      normalizeId(payload?.messageId);

    const conversationId =
      normalizeId(payload?.conversationId);

    if (!messageId || !conversationId) {
      return createSocketError(
        "INVALID_RECEIPT",
        "Message ID and conversation ID are required.",
      );
    }

    const authorized =
      await authorizeConversation(
        socket,
        conversationId,
        services,
      );

    if (!authorized) {
      return createSocketError(
        "FORBIDDEN",
        "You are not authorized to update this message.",
      );
    }

    const receipt =
      await callService(
        services,
        "messageService",
        "markDelivered",
        {
          messageId,
          conversationId,
          userId: socket.data.user.id,
        },
      );

    if (!receipt) {
      return createSocketError(
        "MESSAGE_SERVICE_UNAVAILABLE",
        "The messaging service is temporarily unavailable.",
      );
    }

    io.to(
      getConversationRoom(conversationId),
    ).emit(
      SOCKET_EVENTS.MESSAGE_DELIVERED,
      {
        messageId,
        conversationId,
        receipt,
        userId: socket.data.user.id,
        timestamp: new Date().toISOString(),
      },
    );

    return createSocketSuccess({
      receipt,
    });
  } catch {
    return createSocketError(
      "DELIVERY_UPDATE_FAILED",
      "Unable to update message delivery status.",
    );
  }
}

/**
 * ---------------------------------------------------------------
 * READ RECEIPTS
 * ---------------------------------------------------------------
 */

async function handleMessageRead(
  io,
  socket,
  payload,
  services,
) {
  try {
    requireAuthenticated(socket);

    const messageId =
      normalizeId(payload?.messageId);

    const conversationId =
      normalizeId(payload?.conversationId);

    if (!messageId || !conversationId) {
      return createSocketError(
        "INVALID_READ_RECEIPT",
        "Message ID and conversation ID are required.",
      );
    }

    const authorized =
      await authorizeConversation(
        socket,
        conversationId,
        services,
      );

    if (!authorized) {
      return createSocketError(
        "FORBIDDEN",
        "You are not authorized to update this message.",
      );
    }

    const receipt =
      await callService(
        services,
        "messageService",
        "markRead",
        {
          messageId,
          conversationId,
          userId: socket.data.user.id,
        },
      );

    if (!receipt) {
      return createSocketError(
        "MESSAGE_SERVICE_UNAVAILABLE",
        "The messaging service is temporarily unavailable.",
      );
    }

    io.to(
      getConversationRoom(conversationId),
    ).emit(
      SOCKET_EVENTS.MESSAGE_READ,
      {
        messageId,
        conversationId,
        receipt,
        userId: socket.data.user.id,
        timestamp: new Date().toISOString(),
      },
    );

    return createSocketSuccess({
      receipt,
    });
  } catch {
    return createSocketError(
      "READ_RECEIPT_FAILED",
      "Unable to update read status.",
    );
  }
}

/**
 * ---------------------------------------------------------------
 * TYPING INDICATORS
 * ---------------------------------------------------------------
 */

async function handleTyping(
  io,
  socket,
  payload,
  services,
  event,
) {
  try {
    requireAuthenticated(socket);

    const conversationId =
      normalizeId(payload?.conversationId);

    if (!conversationId) {
      return createSocketError(
        "CONVERSATION_ID_REQUIRED",
        "A conversation ID is required.",
      );
    }

    const authorized =
      await authorizeConversation(
        socket,
        conversationId,
        services,
      );

    if (!authorized) {
      return createSocketError(
        "FORBIDDEN",
        "You are not authorized to access this conversation.",
      );
    }

    socket.to(
      getConversationRoom(conversationId),
    ).emit(event, {
      conversationId,
      userId: socket.data.user.id,
      timestamp: new Date().toISOString(),
    });

    return createSocketSuccess({
      conversationId,
    });
  } catch {
    return createSocketError(
      "TYPING_EVENT_FAILED",
      "Unable to process typing event.",
    );
  }
}

/**
 * ---------------------------------------------------------------
 * NOTIFICATIONS
 * ---------------------------------------------------------------
 */

async function handleNotificationRead(
  socket,
  payload,
  services,
) {
  try {
    requireAuthenticated(socket);

    const notificationId =
      normalizeId(payload?.notificationId);

    if (!notificationId) {
      return createSocketError(
        "NOTIFICATION_ID_REQUIRED",
        "A notification ID is required.",
      );
    }

    const result =
      await callService(
        services,
        "notificationService",
        "markRead",
        {
          notificationId,
          userId: socket.data.user.id,
        },
      );

    if (!result) {
      return createSocketError(
        "NOTIFICATION_SERVICE_UNAVAILABLE",
        "The notification service is temporarily unavailable.",
      );
    }

    socket.emit(
      SOCKET_EVENTS.NOTIFICATION_UPDATED,
      {
        notificationId,
        status: "read",
        result,
        timestamp: new Date().toISOString(),
      },
    );

    return createSocketSuccess({
      notificationId,
      status: "read",
    });
  } catch {
    return createSocketError(
      "NOTIFICATION_UPDATE_FAILED",
      "Unable to update notification.",
    );
  }
}

/**
 * ---------------------------------------------------------------
 * SYSTEM PING
 * ---------------------------------------------------------------
 */

function handlePing(socket, payload) {
  socket.emit(
    SOCKET_EVENTS.CONNECTION_PONG,
    {
      clientTimestamp:
        payload?.timestamp || null,

      serverTimestamp:
        new Date().toISOString(),

      requestId:
        getSocketRequestId(socket),
    },
  );

  return createSocketSuccess();
}

/**
 * ---------------------------------------------------------------
 * PUBLIC REALTIME API
 * ---------------------------------------------------------------
 */

export function createRealtimeServer({
  httpServer,
  config = {},
  services = {},
  logger = console,
} = {}) {
  if (!httpServer) {
    throw new Error(
      "createRealtimeServer requires an HTTP server.",
    );
  }

  const corsOrigin =
    config?.cors?.origin ||
    config?.security?.corsOrigin ||
    process.env.CORS_ORIGIN ||
    true;

  const maxConnections =
    Number(
      config?.realtime?.maxConnectionsPerUser,
    ) ||
    DEFAULT_MAX_CONNECTIONS_PER_USER;

  const io = new SocketIOServer(
    httpServer,
    {
      cors: {
        origin: corsOrigin,
        credentials: true,
        methods: [
          "GET",
          "POST",
        ],
      },

      transports: [
        "websocket",
        "polling",
      ],

      allowEIO3: false,

      pingInterval:
        Number(
          config?.realtime?.pingInterval,
        ) || 25_000,

      pingTimeout:
        Number(
          config?.realtime?.pingTimeout,
        ) || 20_000,

      connectTimeout:
        Number(
          config?.realtime?.connectTimeout,
        ) || 10_000,

      maxHttpBufferSize:
        Number(
          config?.realtime?.maxHttpBufferSize,
        ) || 1_000_000,

      serveClient: true,
    },
  );

  const state = createRealtimeState();

  const connectionLimiter =
    createConnectionLimiter(
      maxConnections,
    );

  /**
   * -------------------------------------------------------------
   * AUTHENTICATION MIDDLEWARE
   * -------------------------------------------------------------
   */

  io.use(
    createAuthenticationMiddleware(
      config,
      logger,
    ),
  );

  /**
   * -------------------------------------------------------------
   * CONNECTION
   * -------------------------------------------------------------
   */

  io.on(
    "connection",
    async (socket) => {
      const userId =
        socket.data.user.id;

      /**
       * Connection protection.
       */
      if (
        !connectionLimiter.add(
          userId,
          socket.id,
        )
      ) {
        socket.emit(
          SOCKET_EVENTS.CONNECTION_ERROR,
          createSocketError(
            "CONNECTION_LIMIT_REACHED",
            "Maximum realtime connections reached for this account.",
          ),
        );

        socket.disconnect(true);

        return;
      }

      state.connections.set(
        socket.id,
        {
          userId,
          connectedAt:
            socket.data.connectedAt,
        },
      );

      logger?.info?.(
        {
          socketId: socket.id,
          userId,
          requestId:
            socket.data.requestId,
        },
        "Realtime socket connected",
      );

      /**
       * Every authenticated user receives a private room.
       */
      socket.join(
        getUserRoom(userId),
      );

      await handlePresenceOnline(
        socket,
        services,
        logger,
      );

      /**
       * ---------------------------------------------------------
       * CONNECTION READY
       * ---------------------------------------------------------
       */

      socket.emit(
        SOCKET_EVENTS.CONNECTION_READY,
        {
          ok: true,

          socket: {
            id: socket.id,
            version: SOCKET_VERSION,
            connectedAt:
              socket.data.connectedAt,
          },

          user: {
            id: userId,
            role:
              socket.data.user.role,
            roles:
              socket.data.user.roles,
          },

          capabilities: [
            "presence",
            "private-events",
            "room-events",
            "messages",
            "typing",
            "delivery-receipts",
            "read-receipts",
            "notifications",
            "reconnection",
          ],

          timestamp:
            new Date().toISOString(),
        },
      );

      /**
       * ---------------------------------------------------------
       * CONVERSATION JOIN
       * ---------------------------------------------------------
       */

      socket.on(
        SOCKET_EVENTS.CONVERSATION_JOIN,
        async (payload, acknowledgement) => {
          const result =
            await handleConversationJoin(
              socket,
              payload,
              services,
            );

          if (
            typeof acknowledgement ===
            "function"
          ) {
            acknowledgement(result);
          }
        },
      );

      /**
       * ---------------------------------------------------------
       * CONVERSATION LEAVE
       * ---------------------------------------------------------
       */

      socket.on(
        SOCKET_EVENTS.CONVERSATION_LEAVE,
        async (payload, acknowledgement) => {
          const result =
            await handleConversationLeave(
              socket,
              payload,
            );

          if (
            typeof acknowledgement ===
            "function"
          ) {
            acknowledgement(result);
          }
        },
      );

      /**
       * ---------------------------------------------------------
       * SEND MESSAGE
       * ---------------------------------------------------------
       */

      socket.on(
        SOCKET_EVENTS.MESSAGE_SEND,
        async (payload, acknowledgement) => {
          const result =
            await handleMessageSend(
              io,
              socket,
              payload,
              services,
              logger,
            );

          if (
            typeof acknowledgement ===
            "function"
          ) {
            acknowledgement(result);
          }
        },
      );

      /**
       * ---------------------------------------------------------
       * DELIVERY RECEIPT
       * ---------------------------------------------------------
       */

      socket.on(
        SOCKET_EVENTS.MESSAGE_DELIVERED,
        async (payload, acknowledgement) => {
          const result =
            await handleMessageDelivered(
              io,
              socket,
              payload,
              services,
            );

          if (
            typeof acknowledgement ===
            "function"
          ) {
            acknowledgement(result);
          }
        },
      );

      /**
       * ---------------------------------------------------------
       * READ RECEIPT
       * ---------------------------------------------------------
       */

      socket.on(
        SOCKET_EVENTS.MESSAGE_READ,
        async (payload, acknowledgement) => {
          const result =
            await handleMessageRead(
              io,
              socket,
              payload,
              services,
            );

          if (
            typeof acknowledgement ===
            "function"
          ) {
            acknowledgement(result);
          }
        },
      );

      /**
       * ---------------------------------------------------------
       * TYPING START
       * ---------------------------------------------------------
       */

      socket.on(
        SOCKET_EVENTS.TYPING_START,
        async (payload, acknowledgement) => {
          const result =
            await handleTyping(
              io,
              socket,
              payload,
              services,
              SOCKET_EVENTS.TYPING_START,
            );

          if (
            typeof acknowledgement ===
            "function"
          ) {
            acknowledgement(result);
          }
        },
      );

      /**
       * ---------------------------------------------------------
       * TYPING STOP
       * ---------------------------------------------------------
       */

      socket.on(
        SOCKET_EVENTS.TYPING_STOP,
        async (payload, acknowledgement) => {
          const result =
            await handleTyping(
              io,
              socket,
              payload,
              services,
              SOCKET_EVENTS.TYPING_STOP,
            );

          if (
            typeof acknowledgement ===
            "function"
          ) {
            acknowledgement(result);
          }
        },
      );

      /**
       * ---------------------------------------------------------
       * NOTIFICATION READ
       * ---------------------------------------------------------
       */

      socket.on(
        SOCKET_EVENTS.NOTIFICATION_READ,
        async (payload, acknowledgement) => {
          const result =
            await handleNotificationRead(
              socket,
              payload,
              services,
            );

          if (
            typeof acknowledgement ===
            "function"
          ) {
            acknowledgement(result);
          }
        },
      );

      /**
       * ---------------------------------------------------------
       * CONNECTION PING
       * ---------------------------------------------------------
       */

      socket.on(
        SOCKET_EVENTS.CONNECTION_PING,
        (payload, acknowledgement) => {
          const result =
            handlePing(
              socket,
              payload,
            );

          if (
            typeof acknowledgement ===
            "function"
          ) {
            acknowledgement(result);
          }
        },
      );

      /**
       * ---------------------------------------------------------
       * SOCKET ERROR
       * ---------------------------------------------------------
       */

      socket.on(
        "error",
        (error) => {
          logger?.error?.(
            {
              err: error,
              socketId: socket.id,
              userId,
            },
            "Socket runtime error",
          );
        },
      );

      /**
       * ---------------------------------------------------------
       * DISCONNECT
       * ---------------------------------------------------------
       */

      socket.on(
        "disconnect",
        async (reason) => {
          connectionLimiter.remove(
            userId,
            socket.id,
          );

          state.connections.delete(
            socket.id,
          );

          await handlePresenceOffline(
            socket,
            services,
            connectionLimiter,
            logger,
          );

          logger?.info?.(
            {
              socketId: socket.id,
              userId,
              reason,
            },
            "Realtime socket disconnected",
          );
        },
      );
    },
  );

  /**
   * -------------------------------------------------------------
   * SERVER-SIDE EVENT HELPERS
   * -------------------------------------------------------------
   *
   * These methods allow services/controllers to push events to
   * connected users without knowing anything about Socket.IO's
   * internal implementation.
   */

  const realtime = {
    io,

    version: SOCKET_VERSION,

    state,

    events: SOCKET_EVENTS,

    /**
     * Send an event to one user.
     */
    emitToUser(userId, event, payload) {
      if (!userId || !event) {
        return false;
      }

      io.to(
        getUserRoom(userId),
      ).emit(
        event,
        payload,
      );

      return true;
    },

    /**
     * Send an event to a conversation.
     */
    emitToConversation(
      conversationId,
      event,
      payload,
    ) {
      if (!conversationId || !event) {
        return false;
      }

      io.to(
        getConversationRoom(
          conversationId,
        ),
      ).emit(
        event,
        payload,
      );

      return true;
    },

    /**
     * Send an event to everyone.
     */
    broadcast(event, payload) {
      if (!event) {
        return false;
      }

      io.emit(
        event,
        payload,
      );

      return true;
    },

    /**
     * Check whether a user currently has
     * at least one active realtime connection.
     */
    isUserOnline(userId) {
      return connectionLimiter.isOnline(
        userId,
      );
    },

    /**
     * Get number of active connections for
     * a user.
     */
    getUserConnectionCount(userId) {
      return connectionLimiter.count(
        userId,
      );
    },

    /**
     * Get realtime server statistics.
     */
    getStats() {
      return {
        version: SOCKET_VERSION,
        connectedSockets:
          io.engine.clientsCount,

        trackedConnections:
          state.connections.size,

        timestamp:
          new Date().toISOString(),
      };
    },

    /**
     * Gracefully close Socket.IO.
     */
    async close() {
      return new Promise(
        (resolve) => {
          io.close(() => {
            logger?.info?.(
              "Socket.IO server closed.",
            );

            resolve();
          });
        },
      );
    },
  };

  /**
   * Make the realtime instance available to
   * the service layer when desired.
   */
  if (
    services &&
    typeof services === "object"
  ) {
    services.realtime = realtime;
  }

  logger?.info?.(
    {
      version: SOCKET_VERSION,
      transports: [
        "websocket",
        "polling",
      ],
      maxConnectionsPerUser:
        maxConnections,
    },
    "NEXUS realtime server initialized",
  );

  return realtime;
}

/**
 * ---------------------------------------------------------------
 * BOOTSTRAP EXPORT
 * ---------------------------------------------------------------
 */

export async function registerSocketServer(io, options = {}) {
  if (!io || typeof io.on !== "function") {
    return null;
  }

  const config = options.config || {};
  const services = options.services || {};
  const logger = options.logger || console;

  const realtime = createRealtimeServer({
    httpServer: io.httpServer || io._httpServer || null,
    config,
    services,
    logger,
  });

  if (realtime && typeof realtime === "object") {
    io.realtime = realtime;
  }

  return io;
}

/**
 * ---------------------------------------------------------------
 * DEFAULT EXPORT
 * ---------------------------------------------------------------
 */

export default createRealtimeServer;
