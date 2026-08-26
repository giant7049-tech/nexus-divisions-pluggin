/**
 * ============================================================
 * NEXUS OS
 * server/services.js
 * ============================================================
 *
 * Application / Business Service Layer
 *
 * RESPONSIBILITIES
 * ------------------------------------------------------------
 * - Authentication business logic
 * - User/profile operations
 * - Advertisement operations
 * - Analytics event processing
 * - Payment orchestration
 * - Messaging
 * - Notifications
 * - File/media service abstraction
 * - Administration operations
 * - Audit recording
 *
 * ARCHITECTURAL RULES
 * ------------------------------------------------------------
 * 1. Services contain business logic.
 * 2. Services do not contain HTTP-specific logic.
 * 3. Services do not directly parse request objects.
 * 4. Services do not expose passwords/secrets.
 * 5. Services use repositories/models supplied by the application.
 * 6. Services return application-level results.
 * 7. Financial operations are idempotent.
 * 8. Administrative changes are auditable.
 * 9. Analytics distinguishes organic events from corrections.
 * 10. External providers are accessed through adapters.
 *
 * This file intentionally avoids fake/demo data.
 * ============================================================
 */

import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';


// ============================================================
// CONSTANTS
// ============================================================

const DEFAULT_PASSWORD_ROUNDS = 12;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const MAX_MESSAGE_LENGTH = 10_000;
const MAX_ANALYTICS_BATCH = 100;

const USER_ROLES = new Set([
  'user',
  'professional',
  'business',
  'admin',
  'super_admin',
]);

const ADVERTISEMENT_STATUSES = new Set([
  'draft',
  'pending',
  'active',
  'paused',
  'expired',
  'rejected',
  'archived',
]);

const PAYMENT_STATUSES = new Set([
  'pending',
  'processing',
  'paid',
  'failed',
  'cancelled',
  'refunded',
  'partially_refunded',
]);

const MESSAGE_STATUSES = new Set([
  'sent',
  'delivered',
  'read',
  'failed',
]);

const ANALYTICS_EVENT_TYPES = new Set([
  'impression',
  'view',
  'click',
  'engagement',
  'conversion',
  'message',
  'search',
  'application',
  'transaction',
]);


// ============================================================
// ERROR TYPES
// ============================================================

export class ServiceError extends Error {
  constructor(message, {
    code = 'SERVICE_ERROR',
    statusCode = 500,
    details = undefined,
    cause = undefined,
  } = {}) {
    super(message, { cause });

    this.name = 'ServiceError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}


export class ValidationError extends ServiceError {
  constructor(message, details) {
    super(message, {
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      details,
    });

    this.name = 'ValidationError';
  }
}


export class AuthenticationError extends ServiceError {
  constructor(message = 'Authentication failed') {
    super(message, {
      code: 'AUTHENTICATION_ERROR',
      statusCode: 401,
    });

    this.name = 'AuthenticationError';
  }
}


export class AuthorizationError extends ServiceError {
  constructor(message = 'You are not authorized to perform this action') {
    super(message, {
      code: 'AUTHORIZATION_ERROR',
      statusCode: 403,
    });

    this.name = 'AuthorizationError';
  }
}


export class NotFoundError extends ServiceError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, {
      code: 'NOT_FOUND',
      statusCode: 404,
    });

    this.name = 'NotFoundError';
  }
}


export class ConflictError extends ServiceError {
  constructor(message = 'The requested operation conflicts with existing data') {
    super(message, {
      code: 'CONFLICT',
      statusCode: 409,
    });

    this.name = 'ConflictError';
  }
}


// ============================================================
// GENERAL HELPERS
// ============================================================

function assert(condition, message, details) {
  if (!condition) {
    throw new ValidationError(message, details);
  }
}


function normalizeEmail(email) {
  return String(email ?? '')
    .trim()
    .toLowerCase();
}


function normalizeString(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}


function normalizePagination(page, limit) {
  const normalizedPage = Math.max(
    Number.parseInt(page, 10) || DEFAULT_PAGE,
    1,
  );

  const normalizedLimit = Math.min(
    Math.max(
      Number.parseInt(limit, 10) || DEFAULT_LIMIT,
      1,
    ),
    MAX_LIMIT,
  );

  return {
    page: normalizedPage,
    limit: normalizedLimit,
    skip: (normalizedPage - 1) * normalizedLimit,
  };
}


function createRequestId(prefix = 'req') {
  return `${prefix}_${nanoid(16)}`;
}


function createPublicId(prefix) {
  return `${prefix}_${nanoid(20)}`;
}


function createIdempotencyKey() {
  return crypto.randomUUID();
}


function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  const source = typeof user.toObject === 'function'
    ? user.toObject()
    : { ...user };

  delete source.password;
  delete source.passwordHash;
  delete source.passwordResetToken;
  delete source.passwordResetTokenHash;
  delete source.emailVerificationToken;
  delete source.emailVerificationTokenHash;
  delete source.refreshToken;
  delete source.refreshTokenHash;

  return source;
}


function sanitizeMessage(message) {
  if (!message) {
    return null;
  }

  const source = typeof message.toObject === 'function'
    ? message.toObject()
    : { ...message };

  return source;
}


function ensureObject(value, fieldName) {
  assert(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value),
    `${fieldName} must be an object`,
  );
}


function ensureString(value, fieldName, {
  min = 1,
  max = 255,
} = {}) {
  const normalized = normalizeString(value);

  assert(
    normalized.length >= min,
    `${fieldName} is required`,
  );

  assert(
    normalized.length <= max,
    `${fieldName} exceeds the maximum allowed length`,
  );

  return normalized;
}


function ensureEmail(email) {
  const normalized = normalizeEmail(email);

  assert(
    normalized.length <= 320,
    'Email address is too long',
  );

  assert(
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized),
    'A valid email address is required',
  );

  return normalized;
}


function ensureUserRole(role) {
  const normalized = normalizeString(role).toLowerCase();

  assert(
    USER_ROLES.has(normalized),
    'Invalid user role',
  );

  return normalized;
}


function ensureAdvertisementStatus(status) {
  const normalized = normalizeString(status).toLowerCase();

  assert(
    ADVERTISEMENT_STATUSES.has(normalized),
    'Invalid advertisement status',
  );

  return normalized;
}


function ensurePaymentStatus(status) {
  const normalized = normalizeString(status).toLowerCase();

  assert(
    PAYMENT_STATUSES.has(normalized),
    'Invalid payment status',
  );

  return normalized;
}


function ensureMessageStatus(status) {
  const normalized = normalizeString(status).toLowerCase();

  assert(
    MESSAGE_STATUSES.has(normalized),
    'Invalid message status',
  );

  return normalized;
}


function ensureAnalyticsEventType(type) {
  const normalized = normalizeString(type).toLowerCase();

  assert(
    ANALYTICS_EVENT_TYPES.has(normalized),
    'Unsupported analytics event type',
  );

  return normalized;
}


function normalizeObjectId(value, fieldName = 'id') {
  const normalized = normalizeString(value);

  assert(
    normalized.length > 0,
    `${fieldName} is required`,
  );

  return normalized;
}


// ============================================================
// SERVICE FACTORY
// ============================================================

/**
 * Creates all NEXUS OS services.
 *
 * The application supplies the persistence models/repositories,
 * configuration and provider adapters.
 *
 * This keeps the business layer independent from Express,
 * Fastify, Socket.IO and individual infrastructure providers.
 */
export function createServices({
  models = {},
  config = {},
  providers = {},
  logger = console,
  clock = () => new Date(),
} = {}) {

  const {
    User,
    Profile,
    Advertisement,
    AnalyticsEvent,
    Payment,
    Transaction,
    Conversation,
    Message,
    Notification,
    AuditLog,
    Organization,
  } = models;


  // ==========================================================
  // INTERNAL INFRASTRUCTURE
  // ==========================================================

  function requireModel(model, modelName) {
    if (!model) {
      throw new ServiceError(
        `${modelName} model is not configured`,
        {
          code: 'MODEL_NOT_CONFIGURED',
          statusCode: 500,
        },
      );
    }

    return model;
  }


  async function executeWithSession(operation, session = null) {
    if (session) {
      return operation(session);
    }

    return operation(undefined);
  }


  async function writeAudit({
    actorId = null,
    action,
    resourceType,
    resourceId = null,
    before = null,
    after = null,
    reason = null,
    metadata = {},
    requestId = null,
  }) {
    if (!AuditLog) {
      logger.warn?.(
        'AuditLog model is not configured; audit record was not persisted.',
      );

      return null;
    }

    return AuditLog.create({
      actorId,
      action,
      resourceType,
      resourceId,
      before,
      after,
      reason,
      metadata,
      requestId,
      createdAt: clock(),
    });
  }


  // ==========================================================
  // AUTHENTICATION SERVICE
  // ==========================================================

  const AuthenticationService = {

    async hashPassword(password) {
      assert(
        typeof password === 'string',
        'Password must be a string',
      );

      assert(
        password.length >= 8,
        'Password must contain at least 8 characters',
      );

      assert(
        password.length <= 128,
        'Password is too long',
      );

      const rounds = Number(
        config.security?.bcryptRounds ??
        DEFAULT_PASSWORD_ROUNDS,
      );

      return bcrypt.hash(password, rounds);
    },


    async verifyPassword(password, passwordHash) {
      if (
        typeof password !== 'string' ||
        typeof passwordHash !== 'string'
      ) {
        return false;
      }

      return bcrypt.compare(password, passwordHash);
    },


    async register({
      email,
      password,
      name,
      role = 'user',
      requestId = null,
      metadata = {},
    }) {
      const UserModel = requireModel(User, 'User');

      const normalizedEmail = ensureEmail(email);
      const normalizedName = ensureString(name, 'Name', {
        min: 2,
        max: 120,
      });

      const normalizedRole = ensureUserRole(role);

      const existing = await UserModel.findOne({
        email: normalizedEmail,
      });

      if (existing) {
        throw new ConflictError(
          'An account with this email already exists',
        );
      }

      const passwordHash = await this.hashPassword(password);

      const user = await UserModel.create({
        publicId: createPublicId('usr'),
        email: normalizedEmail,
        name: normalizedName,
        passwordHash,
        role: normalizedRole,
        status: 'active',
        emailVerified: false,
        createdAt: clock(),
        updatedAt: clock(),
      });

      await writeAudit({
        actorId: user._id ?? user.id,
        action: 'user.created',
        resourceType: 'user',
        resourceId: user._id ?? user.id,
        after: sanitizeUser(user),
        metadata,
        requestId,
      });

      return sanitizeUser(user);
    },


    async authenticate({
      email,
      password,
      requestId = null,
    }) {
      const UserModel = requireModel(User, 'User');

      const normalizedEmail = ensureEmail(email);

      const user = await UserModel.findOne({
        email: normalizedEmail,
      });

      if (!user) {
        throw new AuthenticationError(
          'Invalid email or password',
        );
      }

      if (
        user.status &&
        !['active', 'verified'].includes(user.status)
      ) {
        throw new AuthenticationError(
          'This account is not currently available',
        );
      }

      const validPassword = await this.verifyPassword(
        password,
        user.passwordHash,
      );

      if (!validPassword) {
        throw new AuthenticationError(
          'Invalid email or password',
        );
      }

      if (typeof user.save === 'function') {
        user.lastLoginAt = clock();
        user.updatedAt = clock();
        await user.save();
      }

      await writeAudit({
        actorId: user._id ?? user.id,
        action: 'user.authenticated',
        resourceType: 'user',
        resourceId: user._id ?? user.id,
        metadata: {
          authenticationMethod: 'password',
        },
        requestId,
      });

      return sanitizeUser(user);
    },


    issueAccessToken({
      userId,
      role,
      expiresIn = config.auth?.accessTokenExpiresIn ?? '15m',
    }) {
      const secret = config.auth?.jwtSecret;

      if (!secret) {
        throw new ServiceError(
          'JWT secret is not configured',
          {
            code: 'AUTH_CONFIGURATION_ERROR',
            statusCode: 500,
          },
        );
      }

      return jwt.sign(
        {
          sub: String(userId),
          role,
          type: 'access',
        },
        secret,
        {
          expiresIn,
          issuer: config.auth?.issuer ?? 'nexus-os',
          audience: config.auth?.audience ?? 'nexus-os',
        },
      );
    },


    verifyAccessToken(token) {
      const secret = config.auth?.jwtSecret;

      if (!secret) {
        throw new ServiceError(
          'JWT secret is not configured',
          {
            code: 'AUTH_CONFIGURATION_ERROR',
            statusCode: 500,
          },
        );
      }

      try {
        return jwt.verify(token, secret, {
          issuer: config.auth?.issuer ?? 'nexus-os',
          audience: config.auth?.audience ?? 'nexus-os',
        });
      } catch {
        throw new AuthenticationError(
          'Invalid or expired authentication token',
        );
      }
    },


    async getUserById(userId) {
      const UserModel = requireModel(User, 'User');

      const id = normalizeObjectId(userId, 'User ID');

      const user = await UserModel.findById(id);

      if (!user) {
        throw new NotFoundError('User');
      }

      return sanitizeUser(user);
    },
  };


  // ==========================================================
  // USER SERVICE
  // ==========================================================

  const UserService = {

    async getById(userId) {
      return AuthenticationService.getUserById(userId);
    },


    async updateProfile({
      userId,
      changes,
      actorId,
      requestId = null,
    }) {
      const UserModel = requireModel(User, 'User');

      ensureObject(changes, 'Profile changes');

      const id = normalizeObjectId(userId, 'User ID');

      const user = await UserModel.findById(id);

      if (!user) {
        throw new NotFoundError('User');
      }

      const actor = String(actorId);

      if (
        actor !== String(id) &&
        !['admin', 'super_admin'].includes(actor)
      ) {
        throw new AuthorizationError();
      }

      const before = sanitizeUser(user);

      const allowedFields = [
        'name',
        'phone',
        'avatar',
        'bio',
        'location',
        'website',
      ];

      for (const field of allowedFields) {
        if (Object.prototype.hasOwnProperty.call(changes, field)) {
          user[field] = changes[field];
        }
      }

      user.updatedAt = clock();

      await user.save();

      const after = sanitizeUser(user);

      await writeAudit({
        actorId,
        action: 'user.profile.updated',
        resourceType: 'user',
        resourceId: id,
        before,
        after,
        requestId,
      });

      return after;
    },


    async list({
      page,
      limit,
      search,
      role,
      status,
    } = {}) {
      const UserModel = requireModel(User, 'User');

      const pagination = normalizePagination(page, limit);

      const query = {};

      if (search) {
        const normalizedSearch = normalizeString(search);

        query.$or = [
          {
            name: {
              $regex: normalizedSearch,
              $options: 'i',
            },
          },
          {
            email: {
              $regex: normalizedSearch,
              $options: 'i',
            },
          },
        ];
      }

      if (role) {
        query.role = ensureUserRole(role);
      }

      if (status) {
        query.status = normalizeString(status);
      }

      const [items, total] = await Promise.all([
        UserModel
          .find(query)
          .sort({ createdAt: -1 })
          .skip(pagination.skip)
          .limit(pagination.limit),

        UserModel.countDocuments(query),
      ]);

      return {
        items: items.map(sanitizeUser),
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          pages: Math.ceil(total / pagination.limit),
        },
      };
    },
  };


  // ==========================================================
  // ADVERTISEMENT SERVICE
  // ==========================================================

  const AdvertisementService = {

    async create({
      ownerId,
      data,
      requestId = null,
    }) {
      const AdvertisementModel =
        requireModel(Advertisement, 'Advertisement');

      ensureObject(data, 'Advertisement');

      const title = ensureString(data.title, 'Title', {
        min: 3,
        max: 200,
      });

      const description = ensureString(
        data.description,
        'Description',
        {
          min: 10,
          max: 10_000,
        },
      );

      const advertisement = await AdvertisementModel.create({
        publicId: createPublicId('ad'),
        ownerId,
        title,
        description,
        category: normalizeString(data.category),
        media: Array.isArray(data.media) ? data.media : [],
        location: data.location ?? null,
        price: data.price ?? null,
        currency: data.currency ?? 'NGN',
        status: 'draft',
        analytics: {
          impressions: 0,
          views: 0,
          uniqueViews: 0,
          clicks: 0,
          enquiries: 0,
          shares: 0,
          saves: 0,
          conversions: 0,
        },
        createdAt: clock(),
        updatedAt: clock(),
      });

      await writeAudit({
        actorId: ownerId,
        action: 'advertisement.created',
        resourceType: 'advertisement',
        resourceId: advertisement._id ?? advertisement.id,
        after: advertisement,
        requestId,
      });

      return advertisement;
    },


    async getById(advertisementId) {
      const AdvertisementModel =
        requireModel(Advertisement, 'Advertisement');

      const id = normalizeObjectId(
        advertisementId,
        'Advertisement ID',
      );

      const advertisement = await AdvertisementModel.findById(id);

      if (!advertisement) {
        throw new NotFoundError('Advertisement');
      }

      return advertisement;
    },


    async update({
      advertisementId,
      changes,
      actorId,
      requestId = null,
    }) {
      const AdvertisementModel =
        requireModel(Advertisement, 'Advertisement');

      ensureObject(changes, 'Advertisement changes');

      const id = normalizeObjectId(
        advertisementId,
        'Advertisement ID',
      );

      const advertisement =
        await AdvertisementModel.findById(id);

      if (!advertisement) {
        throw new NotFoundError('Advertisement');
      }

      if (
        String(advertisement.ownerId) !== String(actorId)
      ) {
        throw new AuthorizationError();
      }

      const before =
        typeof advertisement.toObject === 'function'
          ? advertisement.toObject()
          : { ...advertisement };

      const editableFields = [
        'title',
        'description',
        'category',
        'media',
        'location',
        'price',
        'currency',
      ];

      for (const field of editableFields) {
        if (
          Object.prototype.hasOwnProperty.call(
            changes,
            field,
          )
        ) {
          advertisement[field] = changes[field];
        }
      }

      advertisement.updatedAt = clock();

      await advertisement.save();

      await writeAudit({
        actorId,
        action: 'advertisement.updated',
        resourceType: 'advertisement',
        resourceId: id,
        before,
        after: advertisement,
        requestId,
      });

      return advertisement;
    },


    async changeStatus({
      advertisementId,
      status,
      actorId,
      reason = null,
      requestId = null,
    }) {
      const AdvertisementModel =
        requireModel(Advertisement, 'Advertisement');

      const id = normalizeObjectId(
        advertisementId,
        'Advertisement ID',
      );

      const normalizedStatus =
        ensureAdvertisementStatus(status);

      const advertisement =
        await AdvertisementModel.findById(id);

      if (!advertisement) {
        throw new NotFoundError('Advertisement');
      }

      if (
        String(advertisement.ownerId) !== String(actorId)
      ) {
        throw new AuthorizationError();
      }

      const beforeStatus = advertisement.status;

      advertisement.status = normalizedStatus;
      advertisement.updatedAt = clock();

      await advertisement.save();

      await writeAudit({
        actorId,
        action: 'advertisement.status.changed',
        resourceType: 'advertisement',
        resourceId: id,
        before: {
          status: beforeStatus,
        },
        after: {
          status: normalizedStatus,
        },
        reason,
        requestId,
      });

      return advertisement;
    },


    async list({
      page,
      limit,
      search,
      category,
      status = 'active',
      ownerId,
    } = {}) {
      const AdvertisementModel =
        requireModel(Advertisement, 'Advertisement');

      const pagination = normalizePagination(page, limit);

      const query = {};

      if (status) {
        query.status = ensureAdvertisementStatus(status);
      }

      if (category) {
        query.category = normalizeString(category);
      }

      if (ownerId) {
        query.ownerId = normalizeObjectId(
          ownerId,
          'Owner ID',
        );
      }

      if (search) {
        const normalizedSearch = normalizeString(search);

        query.$or = [
          {
            title: {
              $regex: normalizedSearch,
              $options: 'i',
            },
          },
          {
            description: {
              $regex: normalizedSearch,
              $options: 'i',
            },
          },
        ];
      }

      const [items, total] = await Promise.all([
        AdvertisementModel
          .find(query)
          .sort({ createdAt: -1 })
          .skip(pagination.skip)
          .limit(pagination.limit),

        AdvertisementModel.countDocuments(query),
      ]);

      return {
        items,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          pages: Math.ceil(total / pagination.limit),
        },
      };
    },
  };


  // ==========================================================
  // ANALYTICS SERVICE
  // ==========================================================

  const AnalyticsService = {

    async recordEvent({
      eventType,
      userId = null,
      advertisementId = null,
      entityType = null,
      entityId = null,
      sessionId = null,
      requestId = null,
      metadata = {},
      source = 'organic',
    }) {
      const AnalyticsEventModel =
        requireModel(AnalyticsEvent, 'AnalyticsEvent');

      const normalizedType =
        ensureAnalyticsEventType(eventType);

      const normalizedSource =
        normalizeString(source) || 'organic';

      assert(
        ['organic', 'administrative'].includes(
          normalizedSource,
        ),
        'Invalid analytics event source',
      );

      if (
        normalizedSource === 'administrative' &&
        !metadata.reason
      ) {
        throw new ValidationError(
          'Administrative analytics changes require a reason',
        );
      }

      const event = await AnalyticsEventModel.create({
        publicId: createPublicId('evt'),
        eventType: normalizedType,
        userId,
        advertisementId,
        entityType,
        entityId,
        sessionId,
        requestId,
        source: normalizedSource,
        metadata,
        occurredAt: clock(),
      });

      return event;
    },


    async recordBatch(events) {
      const AnalyticsEventModel =
        requireModel(AnalyticsEvent, 'AnalyticsEvent');

      assert(
        Array.isArray(events),
        'Analytics events must be an array',
      );

      assert(
        events.length <= MAX_ANALYTICS_BATCH,
        `Maximum batch size is ${MAX_ANALYTICS_BATCH}`,
      );

      const documents = events.map((event) => ({
        publicId: createPublicId('evt'),
        eventType: ensureAnalyticsEventType(
          event.eventType,
        ),
        userId: event.userId ?? null,
        advertisementId: event.advertisementId ?? null,
        entityType: event.entityType ?? null,
        entityId: event.entityId ?? null,
        sessionId: event.sessionId ?? null,
        requestId: event.requestId ?? null,
        source: event.source ?? 'organic',
        metadata: event.metadata ?? {},
        occurredAt: event.occurredAt
          ? new Date(event.occurredAt)
          : clock(),
      }));

      if (documents.length === 0) {
        return [];
      }

      return AnalyticsEventModel.insertMany(documents);
    },


    async getAdvertisementAnalytics({
      advertisementId,
      ownerId,
      from,
      to,
    }) {
      const AnalyticsEventModel =
        requireModel(AnalyticsEvent, 'AnalyticsEvent');

      const AdvertisementModel =
        requireModel(Advertisement, 'Advertisement');

      const advertisement =
        await AdvertisementModel.findById(advertisementId);

      if (!advertisement) {
        throw new NotFoundError('Advertisement');
      }

      if (
        String(advertisement.ownerId) !== String(ownerId)
      ) {
        throw new AuthorizationError();
      }

      const query = {
        advertisementId,
        source: 'organic',
      };

      if (from || to) {
        query.occurredAt = {};

        if (from) {
          query.occurredAt.$gte = new Date(from);
        }

        if (to) {
          query.occurredAt.$lte = new Date(to);
        }
      }

      const events =
        await AnalyticsEventModel.find(query);

      const metrics = {
        impressions: 0,
        views: 0,
        clicks: 0,
        engagement: 0,
        conversions: 0,
        messages: 0,
        applications: 0,
        transactions: 0,
      };

      for (const event of events) {
        switch (event.eventType) {
          case 'impression':
            metrics.impressions += 1;
            break;

          case 'view':
            metrics.views += 1;
            break;

          case 'click':
            metrics.clicks += 1;
            break;

          case 'engagement':
            metrics.engagement += 1;
            break;

          case 'conversion':
            metrics.conversions += 1;
            break;

          case 'message':
            metrics.messages += 1;
            break;

          case 'application':
            metrics.applications += 1;
            break;

          case 'transaction':
            metrics.transactions += 1;
            break;

          default:
            break;
        }
      }

      return {
        advertisementId,
        metrics,
        eventCount: events.length,
        generatedAt: clock(),
      };
    },


    async recordAdministrativeAdjustment({
      actorId,
      advertisementId,
      metric,
      amount,
      reason,
      requestId = null,
    }) {
      assert(
        Number.isInteger(amount),
        'Analytics adjustment amount must be an integer',
      );

      const normalizedReason = ensureString(
        reason,
        'Reason',
        {
          min: 5,
          max: 1_000,
        },
      );

      return this.recordEvent({
        eventType: 'engagement',
        userId: actorId,
        advertisementId,
        source: 'administrative',
        requestId,
        metadata: {
          metric,
          amount,
          reason: normalizedReason,
        },
      });
    },
  };


  // ==========================================================
  // PAYMENT SERVICE
  // ==========================================================

  const PaymentService = {

    async initialize({
      userId,
      amount,
      currency = 'NGN',
      reference = null,
      metadata = {},
    }) {
      const PaymentModel =
        requireModel(Payment, 'Payment');

      assert(
        Number.isInteger(amount) && amount > 0,
        'Payment amount must be a positive integer',
      );

      const paymentReference =
        reference || `NXS-${Date.now()}-${nanoid(10)}`;

      const existing =
        await PaymentModel.findOne({
          reference: paymentReference,
        });

      if (existing) {
        return existing;
      }

      const provider =
        providers.payments;

      if (!provider?.initialize) {
        throw new ServiceError(
          'Payment provider is not configured',
          {
            code: 'PAYMENT_PROVIDER_UNAVAILABLE',
            statusCode: 503,
          },
        );
      }

      const providerResponse =
        await provider.initialize({
          email: metadata.email,
          amount,
          currency,
          reference: paymentReference,
          metadata,
        });

      const payment =
        await PaymentModel.create({
          publicId: createPublicId('pay'),
          userId,
          reference: paymentReference,
          amount,
          currency,
          status: 'pending',
          provider: 'paystack',
          providerResponse,
          metadata,
          idempotencyKey: createIdempotencyKey(),
          createdAt: clock(),
          updatedAt: clock(),
        });

      return payment;
    },


    async verify({
      reference,
      actorId = null,
      requestId = null,
    }) {
      const PaymentModel =
        requireModel(Payment, 'Payment');

      const normalizedReference =
        ensureString(reference, 'Payment reference', {
          min: 3,
          max: 200,
        });

      const payment =
        await PaymentModel.findOne({
          reference: normalizedReference,
        });

      if (!payment) {
        throw new NotFoundError('Payment');
      }

      const provider =
        providers.payments;

      if (!provider?.verify) {
        throw new ServiceError(
          'Payment verification provider is not configured',
          {
            code: 'PAYMENT_PROVIDER_UNAVAILABLE',
            statusCode: 503,
          },
        );
      }

      const result =
        await provider.verify(normalizedReference);

      const verifiedStatus =
        result?.status === true ||
        result?.status === 'success' ||
        result?.data?.status === 'success';

      const beforeStatus = payment.status;

      if (verifiedStatus) {
        payment.status = 'paid';
        payment.paidAt = clock();
      } else {
        payment.status = 'failed';
      }

      payment.providerVerification = result;
      payment.updatedAt = clock();

      await payment.save();

      await writeAudit({
        actorId,
        action: 'payment.verified',
        resourceType: 'payment',
        resourceId: payment._id ?? payment.id,
        before: {
          status: beforeStatus,
        },
        after: {
          status: payment.status,
        },
        requestId,
      });

      return payment;
    },


    async processWebhook({
      payload,
      signature,
      rawBody,
      requestId = null,
    }) {
      const PaymentModel =
        requireModel(Payment, 'Payment');

      const provider =
        providers.payments;

      if (!provider?.verifyWebhook) {
        throw new ServiceError(
          'Payment webhook verification is not configured',
          {
            code: 'PAYMENT_WEBHOOK_UNAVAILABLE',
            statusCode: 503,
          },
        );
      }

      const valid =
        await provider.verifyWebhook({
          payload,
          signature,
          rawBody,
        });

      if (!valid) {
        throw new AuthenticationError(
          'Invalid payment webhook signature',
        );
      }

      const eventType =
        payload?.event ||
        payload?.type;

      const data =
        payload?.data ||
        {};

      const reference =
        data.reference;

      if (!reference) {
        throw new ValidationError(
          'Payment webhook does not contain a transaction reference',
        );
      }

      const payment =
        await PaymentModel.findOne({
          reference,
        });

      if (!payment) {
        logger.warn?.(
          {
            reference,
            eventType,
          },
          'Received webhook for unknown payment',
        );

        return {
          processed: false,
          reason: 'payment_not_found',
        };
      }

      const beforeStatus =
        payment.status;

      switch (eventType) {
        case 'charge.success':
          payment.status = 'paid';
          payment.paidAt = clock();
          break;

        case 'charge.failed':
          payment.status = 'failed';
          break;

        case 'refund.processed':
          payment.status = 'refunded';
          payment.refundedAt = clock();
          break;

        default:
          return {
            processed: false,
            reason: 'unsupported_event',
          };
      }

      payment.providerWebhook = payload;
      payment.updatedAt = clock();

      await payment.save();

      await writeAudit({
        action: `payment.webhook.${eventType}`,
        resourceType: 'payment',
        resourceId: payment._id ?? payment.id,
        before: {
          status: beforeStatus,
        },
        after: {
          status: payment.status,
        },
        requestId,
        metadata: {
          eventType,
          reference,
        },
      });

      return {
        processed: true,
        payment,
      };
    },


    async getByReference(reference) {
      const PaymentModel =
        requireModel(Payment, 'Payment');

      const normalized =
        ensureString(reference, 'Payment reference');

      const payment =
        await PaymentModel.findOne({
          reference: normalized,
        });

      if (!payment) {
        throw new NotFoundError('Payment');
      }

      return payment;
    },
  };


  // ==========================================================
  // MESSAGING SERVICE
  // ==========================================================

  const MessagingService = {

    async createConversation({
      participantIds,
      type = 'direct',
      metadata = {},
    }) {
      const ConversationModel =
        requireModel(
          Conversation,
          'Conversation',
        );

      assert(
        Array.isArray(participantIds),
        'Participant IDs must be an array',
      );

      const uniqueParticipants = [
        ...new Set(
          participantIds.map(String),
        ),
      ];

      assert(
        uniqueParticipants.length >= 2,
        'A conversation requires at least two participants',
      );

      const conversation =
        await ConversationModel.create({
          publicId: createPublicId('conv'),
          type,
          participantIds: uniqueParticipants,
          metadata,
          status: 'active',
          createdAt: clock(),
          updatedAt: clock(),
        });

      return conversation;
    },


    async sendMessage({
      conversationId,
      senderId,
      content,
      attachments = [],
      metadata = {},
    }) {
      const MessageModel =
        requireModel(Message, 'Message');

      const ConversationModel =
        requireModel(
          Conversation,
          'Conversation',
        );

      const normalizedContent =
        ensureString(content, 'Message content', {
          min: 1,
          max: MAX_MESSAGE_LENGTH,
        });

      const conversation =
        await ConversationModel.findById(
          conversationId,
        );

      if (!conversation) {
        throw new NotFoundError(
          'Conversation',
        );
      }

      const participantIds =
        conversation.participantIds
          ?.map(String) ?? [];

      if (
        !participantIds.includes(
          String(senderId),
        )
      ) {
        throw new AuthorizationError(
          'You are not a participant in this conversation',
        );
      }

      const message =
        await MessageModel.create({
          publicId: createPublicId('msg'),
          conversationId,
          senderId,
          content: normalizedContent,
          attachments: Array.isArray(attachments)
            ? attachments
            : [],
          metadata,
          status: 'sent',
          createdAt: clock(),
          updatedAt: clock(),
        });

      conversation.lastMessageId =
        message._id ?? message.id;

      conversation.lastMessageAt =
        clock();

      conversation.updatedAt =
        clock();

      await conversation.save();

      return sanitizeMessage(message);
    },


    async markDelivered({
      messageId,
      userId,
    }) {
      const MessageModel =
        requireModel(Message, 'Message');

      const message =
        await MessageModel.findById(
          messageId,
        );

      if (!message) {
        throw new NotFoundError('Message');
      }

      if (
        String(message.senderId) ===
        String(userId)
      ) {
        return sanitizeMessage(message);
      }

      message.status =
        ensureMessageStatus('delivered');

      message.deliveredAt =
        clock();

      message.updatedAt =
        clock();

      await message.save();

      return sanitizeMessage(message);
    },


    async markRead({
      messageId,
      userId,
    }) {
      const MessageModel =
        requireModel(Message, 'Message');

      const message =
        await MessageModel.findById(
          messageId,
        );

      if (!message) {
        throw new NotFoundError('Message');
      }

      message.status =
        ensureMessageStatus('read');

      message.readAt =
        clock();

      message.readBy =
        userId;

      message.updatedAt =
        clock();

      await message.save();

      return sanitizeMessage(message);
    },


    async getConversationMessages({
      conversationId,
      participantId,
      page,
      limit,
    }) {
      const MessageModel =
        requireModel(Message, 'Message');

      const ConversationModel =
        requireModel(
          Conversation,
          'Conversation',
        );

      const conversation =
        await ConversationModel.findById(
          conversationId,
        );

      if (!conversation) {
        throw new NotFoundError(
          'Conversation',
        );
      }

      const participants =
        conversation.participantIds
          ?.map(String) ?? [];

      if (
        !participants.includes(
          String(participantId),
        )
      ) {
        throw new AuthorizationError();
      }

      const pagination =
        normalizePagination(
          page,
          limit,
        );

      const query = {
        conversationId,
      };

      const [items, total] =
        await Promise.all([
          MessageModel
            .find(query)
            .sort({
              createdAt: -1,
            })
            .skip(
              pagination.skip,
            )
            .limit(
              pagination.limit,
            ),

          MessageModel.countDocuments(
            query,
          ),
        ]);

      return {
        items: items.map(
          sanitizeMessage,
        ),
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          pages: Math.ceil(
            total /
            pagination.limit,
          ),
        },
      };
    },
  };


  // ==========================================================
  // NOTIFICATION SERVICE
  // ==========================================================

  const NotificationService = {

    async create({
      userId,
      type,
      title,
      message,
      data = {},
      priority = 'normal',
    }) {
      const NotificationModel =
        requireModel(
          Notification,
          'Notification',
        );

      const notification =
        await NotificationModel.create({
          publicId: createPublicId('ntf'),
          userId,
          type: ensureString(
            type,
            'Notification type',
            {
              max: 100,
            },
          ),
          title: ensureString(
            title,
            'Notification title',
            {
              max: 200,
            },
          ),
          message: ensureString(
            message,
            'Notification message',
            {
              max: 2_000,
            },
          ),
          data,
          priority,
          read: false,
          createdAt: clock(),
          updatedAt: clock(),
        });

      return notification;
    },


    async list({
      userId,
      page,
      limit,
      unreadOnly = false,
    }) {
      const NotificationModel =
        requireModel(
          Notification,
          'Notification',
        );

      const pagination =
        normalizePagination(
          page,
          limit,
        );

      const query = {
        userId,
      };

      if (unreadOnly) {
        query.read = false;
      }

      const [items, total] =
        await Promise.all([
          NotificationModel
            .find(query)
            .sort({
              createdAt: -1,
            })
            .skip(
              pagination.skip,
            )
            .limit(
              pagination.limit,
            ),

          NotificationModel.countDocuments(
            query,
          ),
        ]);

      return {
        items,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          pages: Math.ceil(
            total /
            pagination.limit,
          ),
        },
      };
    },


    async markRead({
      notificationId,
      userId,
    }) {
      const NotificationModel =
        requireModel(
          Notification,
          'Notification',
        );

      const notification =
        await NotificationModel.findById(
          notificationId,
        );

      if (!notification) {
        throw new NotFoundError(
          'Notification',
        );
      }

      if (
        String(notification.userId) !==
        String(userId)
      ) {
        throw new AuthorizationError();
      }

      notification.read = true;
      notification.readAt = clock();
      notification.updatedAt = clock();

      await notification.save();

      return notification;
    },
  };


  // ==========================================================
  // PROFILE / PROFESSIONAL SERVICE
  // ==========================================================

  const ProfileService = {

    async getByUserId(userId) {
      const ProfileModel =
        requireModel(
          Profile,
          'Profile',
        );

      const profile =
        await ProfileModel.findOne({
          userId,
        });

      if (!profile) {
        throw new NotFoundError(
          'Profile',
        );
      }

      return profile;
    },


    async upsert({
      userId,
      data,
      actorId,
      requestId = null,
    }) {
      const ProfileModel =
        requireModel(
          Profile,
          'Profile',
        );

      ensureObject(
        data,
        'Profile data',
      );

      if (
        String(userId) !==
        String(actorId)
      ) {
        throw new AuthorizationError();
      }

      const before =
        await ProfileModel.findOne({
          userId,
        });

      const profile =
        await ProfileModel.findOneAndUpdate(
          { userId },
          {
            $set: {
              ...data,
              userId,
              updatedAt: clock(),
            },
            $setOnInsert: {
              publicId: createPublicId('prf'),
              createdAt: clock(),
            },
          },
          {
            new: true,
            upsert: true,
          },
        );

      await writeAudit({
        actorId,
        action: 'profile.updated',
        resourceType: 'profile',
        resourceId:
          profile._id ?? profile.id,
        before,
        after: profile,
        requestId,
      });

      return profile;
    },
  };


  // ==========================================================
  // ORGANIZATION SERVICE
  // ==========================================================

  const OrganizationService = {

    async create({
      ownerId,
      name,
      description = '',
      type = 'business',
      metadata = {},
      requestId = null,
    }) {
      const OrganizationModel =
        requireModel(
          Organization,
          'Organization',
        );

      const normalizedName =
        ensureString(
          name,
          'Organization name',
          {
            min: 2,
            max: 200,
          },
        );

      const organization =
        await OrganizationModel.create({
          publicId: createPublicId('org'),
          ownerId,
          name: normalizedName,
          description:
            normalizeString(
              description,
            ),
          type,
          metadata,
          status: 'active',
          createdAt: clock(),
          updatedAt: clock(),
        });

      await writeAudit({
        actorId: ownerId,
        action: 'organization.created',
        resourceType: 'organization',
        resourceId:
          organization._id ??
          organization.id,
        after: organization,
        requestId,
      });

      return organization;
    },


    async getById(organizationId) {
      const OrganizationModel =
        requireModel(
          Organization,
          'Organization',
        );

      const organization =
        await OrganizationModel.findById(
          organizationId,
        );

      if (!organization) {
        throw new NotFoundError(
          'Organization',
        );
      }

      return organization;
    },
  };


  // ==========================================================
  // ADMINISTRATION SERVICE
  // ==========================================================

  const AdminService = {

    async requireAdministrator(user) {
      const role =
        normalizeString(
          user?.role,
        ).toLowerCase();

      if (
        !['admin', 'super_admin']
          .includes(role)
      ) {
        throw new AuthorizationError(
          'Administrator privileges are required',
        );
      }

      return true;
    },


    async adjustAdvertisementMetric({
      administrator,
      advertisementId,
      metric,
      amount,
      reason,
      requestId = null,
    }) {
      await this.requireAdministrator(
        administrator,
      );

      const AdvertisementModel =
        requireModel(
          Advertisement,
          'Advertisement',
        );

      const advertisement =
        await AdvertisementModel.findById(
          advertisementId,
        );

      if (!advertisement) {
        throw new NotFoundError(
          'Advertisement',
        );
      }

      assert(
        Number.isInteger(amount),
        'Adjustment amount must be an integer',
      );

      const normalizedMetric =
        ensureString(
          metric,
          'Metric',
          {
            max: 100,
          },
        );

      const currentValue =
        Number(
          advertisement.analytics?.[
            normalizedMetric
          ] ?? 0,
        );

      const newValue =
        Math.max(
          currentValue + amount,
          0,
        );

      if (!advertisement.analytics) {
        advertisement.analytics = {};
      }

      advertisement.analytics[
        normalizedMetric
      ] = newValue;

      advertisement.updatedAt =
        clock();

      await advertisement.save();

      await writeAudit({
        actorId:
          administrator._id ??
          administrator.id,
        action:
          'advertisement.analytics.adjusted',
        resourceType:
          'advertisement',
        resourceId:
          advertisementId,
        before: {
          [normalizedMetric]:
            currentValue,
        },
        after: {
          [normalizedMetric]:
            newValue,
        },
        reason,
        requestId,
        metadata: {
          adjustmentAmount:
            amount,
        },
      });

      return {
        advertisementId,
        metric: normalizedMetric,
        oldValue: currentValue,
        newValue,
        adjustment: amount,
      };
    },


    async getAuditLog({
      resourceType,
      resourceId,
      page,
      limit,
    } = {}) {
      const AuditLogModel =
        requireModel(
          AuditLog,
          'AuditLog',
        );

      const pagination =
        normalizePagination(
          page,
          limit,
        );

      const query = {};

      if (resourceType) {
        query.resourceType =
          normalizeString(
            resourceType,
          );
      }

      if (resourceId) {
        query.resourceId =
          normalizeObjectId(
            resourceId,
            'Resource ID',
          );
      }

      const [items, total] =
        await Promise.all([
          AuditLogModel
            .find(query)
            .sort({
              createdAt: -1,
            })
            .skip(
              pagination.skip,
            )
            .limit(
              pagination.limit,
            ),

          AuditLogModel.countDocuments(
            query,
          ),
        ]);

      return {
        items,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          pages: Math.ceil(
            total /
            pagination.limit,
          ),
        },
      };
    },
  };


  // ==========================================================
  // STORAGE / CLOUDINARY SERVICE
  // ==========================================================

  const StorageService = {

    async upload({
      file,
      folder,
      resourceType = 'auto',
      metadata = {},
    }) {
      const storage =
        providers.storage;

      if (!storage?.upload) {
        throw new ServiceError(
          'Storage provider is not configured',
          {
            code: 'STORAGE_PROVIDER_UNAVAILABLE',
            statusCode: 503,
          },
        );
      }

      assert(
        file,
        'File is required',
      );

      return storage.upload({
        file,
        folder:
          folder ||
          config.storage?.defaultFolder ||
          'nexus',
        resourceType,
        metadata,
      });
    },


    async delete({
      publicId,
      resourceType = 'image',
    }) {
      const storage =
        providers.storage;

      if (!storage?.delete) {
        throw new ServiceError(
          'Storage provider is not configured',
          {
            code: 'STORAGE_PROVIDER_UNAVAILABLE',
            statusCode: 503,
          },
        );
      }

      return storage.delete({
        publicId,
        resourceType,
      });
    },
  };


  // ==========================================================
  // SERVICE EVENT HELPERS
  // ==========================================================

  const EventService = {

    async emit({
      event,
      payload,
    }) {
      const eventBus =
        providers.events;

      if (!eventBus?.emit) {
        logger.debug?.(
          {
            event,
          },
          'No event provider configured',
        );

        return false;
      }

      await eventBus.emit(
        event,
        payload,
      );

      return true;
    },
  };


  // ==========================================================
  // SERVICE HEALTH
  // ==========================================================

  const HealthService = {

    async check() {
      const checks = {};

      if (User) {
        try {
          if (typeof User.exists === 'function') {
            await User.exists({});
          }

          checks.database =
            'operational';
        } catch (error) {
          checks.database =
            'unavailable';

          logger.error?.(
            {
              error,
            },
            'Database health check failed',
          );
        }
      } else {
        checks.database =
          'not-configured';
      }

      checks.configuration =
        config
          ? 'loaded'
          : 'not-configured';

      checks.realtime =
        providers.realtime
          ? 'configured'
          : 'not-configured';

      const healthy =
        !Object.values(checks)
          .some(
            (value) =>
              value === 'unavailable',
          );

      return {
        status: healthy
          ? 'operational'
          : 'degraded',
        checks,
        timestamp: clock().toISOString(),
      };
    },
  };


  // ==========================================================
  // RETURN PUBLIC SERVICE CONTAINER
  // ==========================================================

  return Object.freeze({

    AuthenticationService,
    UserService,
    ProfileService,

    AdvertisementService,
    AnalyticsService,

    PaymentService,

    MessagingService,
    NotificationService,

    OrganizationService,

    AdminService,

    StorageService,

    EventService,

    HealthService,

    /**
     * Shared utility methods intentionally exposed only where
     * they are useful to upper application layers.
     */
    utils: Object.freeze({
      createRequestId,
      createPublicId,
      createIdempotencyKey,
      normalizeEmail,
      normalizePagination,
      sanitizeUser,
    }),
  });
}


// ============================================================
// DEFAULT EXPORT
// ============================================================
//
// The application should normally create its service container
// through createServices(...) after loading config and models.
//
// Keeping the factory as the primary export prevents this layer
// from secretly creating database connections or providers.
//

export default createServices;
