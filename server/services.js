'use strict';

/**
 * ================================================================
 * NEXUS CONNECT 2030
 * NEXUS BUILDSOLUTIONS LIMITED
 *
 * ADVANCED SERVICE ENGINE
 * ---------------------------------------------------------------
 * File: services.js
 *
 * Architecture:
 *
 *   Routes
 *      ↓
 *   Service Layer
 *      ↓
 *   Models
 *      ↓
 *   MongoDB
 *
 * Responsibilities:
 *   • Database lifecycle
 *   • Authentication
 *   • Secure PIN handling
 *   • JWT sessions
 *   • User profiles
 *   • Professional discovery
 *   • Service discovery
 *   • Conversations
 *   • Messaging
 *   • Connections
 *   • Notifications
 *   • Groups
 *   • Dashboard intelligence
 *   • Platform statistics
 *
 * Designed for:
 *   Nexus Connect 2030
 *   Professional network
 *   Service marketplace
 *   Verified business ecosystem
 *   Real-time communication
 *
 * IMPORTANT:
 * This file contains backend/business logic.
 * Visual UI belongs to the frontend files.
 * ================================================================
 */

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const {
  User,
  Conversation,
  Message,
  Group,
  Connection,
  Notification,
} = require('./models');

const config = require('./config');


/* ================================================================
   01. APPLICATION ERROR
================================================================ */

class AppError extends Error {
  constructor(
    message,
    statusCode = 500,
    code = 'INTERNAL_ERROR',
    details = null
  ) {
    super(message);

    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;

    Error.captureStackTrace(
      this,
      this.constructor
    );
  }
}


/* ================================================================
   02. CONFIGURATION HELPERS
================================================================ */

function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.MONGODB_URI ||
    config.databaseUrl ||
    config.database?.url ||
    config.database?.uri ||
    config.mongodb?.url ||
    config.mongodb?.uri ||
    null
  );
}


function getJWTSecret() {
  return (
    process.env.JWT_SECRET ||
    config.jwtSecret ||
    config.jwt?.secret ||
    null
  );
}


function getJWTExpiry() {
  return (
    process.env.JWT_EXPIRES_IN ||
    config.jwtExpiresIn ||
    config.jwt?.expiresIn ||
    '7d'
  );
}


function getSaltRounds() {
  return (
    Number(
      process.env.BCRYPT_SALT_ROUNDS ||
      config.bcryptSaltRounds ||
      config.security?.bcryptSaltRounds
    ) || 12
  );
}


/* ================================================================
   03. DATABASE ENGINE
================================================================ */

async function connectDatabase() {
  const databaseUrl =
    getDatabaseUrl();

  if (!databaseUrl) {
    throw new AppError(
      'MongoDB connection is not configured.',
      500,
      'DATABASE_CONFIGURATION_ERROR'
    );
  }

  if (
    mongoose.connection.readyState === 1
  ) {
    return mongoose.connection;
  }

  mongoose.set(
    'strictQuery',
    true
  );

  mongoose.set(
    'sanitizeFilter',
    true
  );

  await mongoose.connect(
    databaseUrl,
    {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,

      maxPoolSize:
        Number(
          process.env.MONGO_MAX_POOL_SIZE
        ) || 20,

      minPoolSize:
        Number(
          process.env.MONGO_MIN_POOL_SIZE
        ) || 2,

      retryWrites: true,
    }
  );

  console.log(
    `[NEXUS DATABASE] Connected to ${mongoose.connection.name}`
  );

  return mongoose.connection;
}


async function disconnectDatabase() {
  if (
    mongoose.connection.readyState === 0
  ) {
    return;
  }

  await mongoose.disconnect();

  console.log(
    '[NEXUS DATABASE] Connection closed.'
  );
}


async function isDatabaseReady() {
  return (
    mongoose.connection.readyState === 1
  );
}


/* ================================================================
   04. NORMALIZATION
================================================================ */

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}


function normalizeUsername(username) {
  return String(username || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
}


function normalizeText(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}


/* ================================================================
   05. VALIDATION
================================================================ */

function validateEmail(email) {
  const value =
    normalizeEmail(email);

  const pattern =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!pattern.test(value)) {
    throw new AppError(
      'Please provide a valid email address.',
      400,
      'INVALID_EMAIL'
    );
  }

  return value;
}


function validateUsername(username) {
  const value =
    normalizeUsername(username);

  const pattern =
    /^[a-z0-9_]{3,30}$/;

  if (!pattern.test(value)) {
    throw new AppError(
      'Username must contain 3–30 letters, numbers, or underscores.',
      400,
      'INVALID_USERNAME'
    );
  }

  return value;
}


function validatePin(pin) {
  const value =
    String(pin || '').trim();

  if (!/^\d{4}$/.test(value)) {
    throw new AppError(
      'PIN must contain exactly 4 digits.',
      400,
      'INVALID_PIN'
    );
  }

  return value;
}


function validateDisplayName(name) {
  const value =
    normalizeText(name);

  if (
    value.length < 2 ||
    value.length > 60
  ) {
    throw new AppError(
      'Display name must contain between 2 and 60 characters.',
      400,
      'INVALID_DISPLAY_NAME'
    );
  }

  return value;
}


/* ================================================================
   06. SECURITY
================================================================ */

function generateToken(userId) {
  const secret =
    getJWTSecret();

  if (!secret) {
    throw new AppError(
      'JWT authentication is not configured.',
      500,
      'AUTH_CONFIGURATION_ERROR'
    );
  }

  return jwt.sign(
    {
      sub: String(userId),
      type: 'access',
      platform: 'nexus-connect',
    },
    secret,
    {
      expiresIn:
        getJWTExpiry(),
    }
  );
}


async function comparePin(
  pin,
  pinHash
) {
  if (!pinHash) {
    return false;
  }

  return bcrypt.compare(
    validatePin(pin),
    pinHash
  );
}


async function hashPin(pin) {
  return bcrypt.hash(
    validatePin(pin),
    getSaltRounds()
  );
}


/* ================================================================
   07. USER SANITIZATION
================================================================ */

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  const source =
    typeof user.toObject === 'function'
      ? user.toObject()
      : {
          ...user,
        };

  delete source.pinHash;
  delete source.password;
  delete source.passwordHash;
  delete source.__v;

  return source;
}


function getPublicUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: String(
      user._id || user.id
    ),

    username:
      user.username || '',

    displayName:
      user.displayName || '',

    avatar:
      user.avatar || null,

    bio:
      user.bio || '',

    status:
      user.status || 'offline',

    customStatus:
      user.customStatus || '',

    verified:
      Boolean(
        user.verified ||
        user.isVerified
      ),
  };
}


/* ================================================================
   08. AUTHENTICATION
================================================================ */

async function registerUser({
  email,
  username,
  displayName,
  pin,
  confirmPin,
}) {
  const normalizedEmail =
    validateEmail(email);

  const normalizedUsername =
    validateUsername(username);

  const cleanName =
    validateDisplayName(
      displayName
    );

  const validPin =
    validatePin(pin);

  const validConfirmPin =
    validatePin(confirmPin);

  if (
    validPin !==
    validConfirmPin
  ) {
    throw new AppError(
      'PIN confirmation does not match.',
      400,
      'PIN_MISMATCH'
    );
  }

  const existingEmail =
    await User.findOne({
      email: normalizedEmail,
    }).lean();

  if (existingEmail) {
    throw new AppError(
      'An account with this email already exists.',
      409,
      'EMAIL_ALREADY_EXISTS'
    );
  }

  const existingUsername =
    await User.findOne({
      username:
        normalizedUsername,
    }).lean();

  if (existingUsername) {
    throw new AppError(
      'This username is already taken.',
      409,
      'USERNAME_ALREADY_EXISTS'
    );
  }

  const pinHash =
    await hashPin(validPin);

  const user =
    await User.create({
      email:
        normalizedEmail,

      username:
        normalizedUsername,

      displayName:
        cleanName,

      pinHash,

      status:
        'online',

      lastSeenAt:
        new Date(),
    });

  const token =
    generateToken(
      user._id
    );

  return {
    success: true,

    message:
      'Nexus Connect account created successfully.',

    token,

    user:
      sanitizeUser(user),
  };
}


async function loginUser({
  identifier,
  pin,
}) {
  const cleanIdentifier =
    normalizeText(
      identifier
    );

  if (!cleanIdentifier) {
    throw new AppError(
      'Username or email is required.',
      400,
      'IDENTIFIER_REQUIRED'
    );
  }

  const normalized =
    cleanIdentifier.toLowerCase();

  const user =
    await User.findOne({
      $or: [
        {
          email: normalized,
        },

        {
          username:
            normalizeUsername(
              normalized
            ),
        },
      ],
    });

  if (!user) {
    throw new AppError(
      'Invalid username, email, or PIN.',
      401,
      'INVALID_CREDENTIALS'
    );
  }

  const valid =
    await comparePin(
      pin,
      user.pinHash
    );

  if (!valid) {
    throw new AppError(
      'Invalid username, email, or PIN.',
      401,
      'INVALID_CREDENTIALS'
    );
  }

  user.status =
    'online';

  user.lastSeenAt =
    new Date();

  await user.save();

  return {
    success: true,

    message:
      'Login successful.',

    token:
      generateToken(
        user._id
      ),

    user:
      sanitizeUser(user),
  };
}


async function getCurrentUser(
  userId
) {
  const user =
    await User.findById(
      userId
    );

  if (!user) {
    throw new AppError(
      'User account not found.',
      404,
      'USER_NOT_FOUND'
    );
  }

  return sanitizeUser(
    user
  );
}


/* ================================================================
   09. PROFILE ENGINE
================================================================ */

async function getUserByUsername(
  username
) {
  const normalized =
    validateUsername(
      username
    );

  const user =
    await User.findOne({
      username: normalized,
    });

  if (!user) {
    throw new AppError(
      'User not found.',
      404,
      'USER_NOT_FOUND'
    );
  }

  return getPublicUser(
    user
  );
}


async function updateProfile(
  userId,
  {
    displayName,
    bio,
    avatar,
    customStatus,
  } = {}
) {
  const user =
    await User.findById(
      userId
    );

  if (!user) {
    throw new AppError(
      'User account not found.',
      404,
      'USER_NOT_FOUND'
    );
  }

  if (
    displayName !==
    undefined
  ) {
    user.displayName =
      validateDisplayName(
        displayName
      );
  }

  if (
    bio !== undefined
  ) {
    const cleanBio =
      normalizeText(
        bio
      );

    if (
      cleanBio.length >
      500
    ) {
      throw new AppError(
        'Bio cannot exceed 500 characters.',
        400,
        'INVALID_BIO'
      );
    }

    user.bio =
      cleanBio;
  }

  if (
    avatar !== undefined
  ) {
    user.avatar =
      normalizeText(
        avatar
      ) || null;
  }

  if (
    customStatus !==
    undefined
  ) {
    const status =
      normalizeText(
        customStatus
      );

    if (
      status.length >
      100
    ) {
      throw new AppError(
        'Custom status cannot exceed 100 characters.',
        400,
        'INVALID_CUSTOM_STATUS'
      );
    }

    user.customStatus =
      status;
  }

  await user.save();

  return sanitizeUser(
    user
  );
}


/* ================================================================
   10. PROFESSIONAL DISCOVERY
================================================================ */

async function searchUsers(
  query,
  limit = 20
) {
  const cleanQuery =
    normalizeText(
      query
    );

  if (!cleanQuery) {
    return [];
  }

  const safeLimit =
    Math.min(
      Math.max(
        Number(limit) || 20,
        1
      ),
      50
    );

  const escaped =
    cleanQuery.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    );

  const regex =
    new RegExp(
      escaped,
      'i'
    );

  const users =
    await User.find({
      $or: [
        {
          username:
            regex,
        },

        {
          displayName:
            regex,
        },

        {
          bio:
            regex,
        },
      ],
    })
      .select(
        'username displayName avatar bio status customStatus verified isVerified'
      )
      .limit(
        safeLimit
      )
      .lean();

  return users.map(
    getPublicUser
  );
}


/**
 * Advanced discovery response.
 *
 * This gives the frontend a richer structure than simply
 * returning an array of users.
 */
async function discoverProfessionals(
  query,
  options = {}
) {
  const {
    limit = 20,
  } = options;

  const results =
    await searchUsers(
      query,
      limit
    );

  return {
    success: true,

    query:
      normalizeText(
        query
      ),

    count:
      results.length,

    results,

    meta: {
      engine:
        'Nexus Discovery Engine',

      version:
        '2030.1',

      source:
        'Nexus Network',
    },
  };
}


/* ================================================================
   11. CONVERSATION ENGINE
================================================================ */

async function getOrCreateDirectConversation(
  userId,
  otherUserId
) {
  if (
    String(userId) ===
    String(otherUserId)
  ) {
    throw new AppError(
      'You cannot create a conversation with yourself.',
      400,
      'INVALID_CONVERSATION'
    );
  }

  const otherUser =
    await User.findById(
      otherUserId
    ).lean();

  if (!otherUser) {
    throw new AppError(
      'The requested user does not exist.',
      404,
      'USER_NOT_FOUND'
    );
  }

  let conversation =
    await Conversation.findOne({
      type: 'direct',

      participants: {
        $all: [
          userId,
          otherUserId,
        ],

        $size: 2,
      },
    });

  if (!conversation) {
    conversation =
      await Conversation.create({
        type: 'direct',

        participants: [
          userId,
          otherUserId,
        ],

        lastMessageAt:
          new Date(),
      });
  }

  return conversation;
}


async function getUserConversations(
  userId
) {
  return Conversation.find({
    participants:
      userId,
  })
    .populate(
      'participants',
      'username displayName avatar status customStatus verified'
    )
    .populate(
      'lastMessage'
    )
    .sort({
      updatedAt: -1,
    })
    .lean();
}


/* ================================================================
   12. MESSAGE ENGINE
================================================================ */

async function sendMessage(
  userId,
  {
    conversationId,
    content,
    replyTo = null,
    type = 'text',
  }
) {
  const cleanContent =
    normalizeText(
      content
    );

  if (
    type === 'text' &&
    !cleanContent
  ) {
    throw new AppError(
      'Message content cannot be empty.',
      400,
      'EMPTY_MESSAGE'
    );
  }

  const conversation =
    await Conversation.findById(
      conversationId
    );

  if (!conversation) {
    throw new AppError(
      'Conversation not found.',
      404,
      'CONVERSATION_NOT_FOUND'
    );
  }

  const participant =
    conversation.participants.some(
      id =>
        String(id) ===
        String(userId)
    );

  if (!participant) {
    throw new AppError(
      'Conversation access denied.',
      403,
      'CONVERSATION_ACCESS_DENIED'
    );
  }

  const message =
    await Message.create({
      conversation:
        conversationId,

      sender:
        userId,

      content:
        cleanContent,

      type,

      replyTo,

      deliveredTo: [
        userId,
      ],

      readBy: [
        {
          user:
            userId,

          readAt:
            new Date(),
        },
      ],
    });

  conversation.lastMessage =
    message._id;

  conversation.lastMessageAt =
    new Date();

  await conversation.save();

  await message.populate(
    'sender',
    'username displayName avatar'
  );

  return message;
}


async function getConversationMessages(
  userId,
  conversationId,
  {
    limit = 50,
    before = null,
  } = {}
) {
  const conversation =
    await Conversation.findById(
      conversationId
    );

  if (!conversation) {
    throw new AppError(
      'Conversation not found.',
      404,
      'CONVERSATION_NOT_FOUND'
    );
  }

  const allowed =
    conversation.participants.some(
      id =>
        String(id) ===
        String(userId)
    );

  if (!allowed) {
    throw new AppError(
      'Conversation access denied.',
      403,
      'CONVERSATION_ACCESS_DENIED'
    );
  }

  const safeLimit =
    Math.min(
      Math.max(
        Number(limit) || 50,
        1
      ),
      100
    );

  const query = {
    conversation:
      conversationId,

    deletedAt:
      null,
  };

  if (before) {
    const date =
      new Date(before);

    if (
      !Number.isNaN(
        date.getTime()
      )
    ) {
      query.createdAt = {
        $lt: date,
      };
    }
  }

  const messages =
    await Message.find(
      query
    )
      .populate(
        'sender',
        'username displayName avatar'
      )
      .populate(
        'replyTo'
      )
      .sort({
        createdAt: -1,
      })
      .limit(
        safeLimit
      )
      .lean();

  return messages.reverse();
}


/* ================================================================
   13. CONNECTION ENGINE
================================================================ */

async function sendConnectionRequest(
  requesterId,
  recipientId
) {
  if (
    String(requesterId) ===
    String(recipientId)
  ) {
    throw new AppError(
      'You cannot connect with yourself.',
      400,
      'INVALID_CONNECTION_REQUEST'
    );
  }

  const recipient =
    await User.findById(
      recipientId
    ).lean();

  if (!recipient) {
    throw new AppError(
      'User not found.',
      404,
      'USER_NOT_FOUND'
    );
  }

  const existing =
    await Connection.findOne({
      $or: [
        {
          requester:
            requesterId,

          recipient:
            recipientId,
        },

        {
          requester:
            recipientId,

          recipient:
            requesterId,
        },
      ],
    });

  if (existing) {
    throw new AppError(
      'A connection relationship already exists.',
      409,
      'CONNECTION_ALREADY_EXISTS'
    );
  }

  const connection =
    await Connection.create({
      requester:
        requesterId,

      recipient:
        recipientId,

      status:
        'pending',
    });

  await Notification.create({
    user:
      recipientId,

    actor:
      requesterId,

    type:
      'connection_request',

    connection:
      connection._id,
  });

  return connection;
}


async function acceptConnectionRequest(
  userId,
  connectionId
) {
  const connection =
    await Connection.findById(
      connectionId
    );

  if (!connection) {
    throw new AppError(
      'Connection request not found.',
      404,
      'CONNECTION_NOT_FOUND'
    );
  }

  if (
    String(
      connection.recipient
    ) !==
    String(userId)
  ) {
    throw new AppError(
      'You cannot accept this request.',
      403,
      'CONNECTION_ACCESS_DENIED'
    );
  }

  connection.status =
    'accepted';

  connection.respondedAt =
    new Date();

  await connection.save();

  return connection;
}


/* ================================================================
   14. CONNECTION DISCOVERY
================================================================ */

async function getUserConnections(
  userId
) {
  const connections =
    await Connection.find({
      $or: [
        {
          requester:
            userId,
        },

        {
          recipient:
            userId,
        },
      ],

      status:
        'accepted',
    })
      .populate(
        'requester',
        'username displayName avatar status customStatus'
      )
      .populate(
        'recipient',
        'username displayName avatar status customStatus'
      )
      .sort({
        updatedAt: -1,
      })
      .lean();

  return connections.map(
    connection => {
      const other =
        String(
          connection.requester?._id
        ) ===
        String(userId)
          ? connection.recipient
          : connection.requester;

      return {
        id:
          connection._id,

        user:
          getPublicUser(
            other
          ),

        connectedAt:
          connection.respondedAt ||
          connection.updatedAt,
      };
    }
  );
}


/* ================================================================
   15. NOTIFICATION ENGINE
================================================================ */

async function getNotifications(
  userId,
  {
    limit = 30,
    unreadOnly = false,
  } = {}
) {
  const safeLimit =
    Math.min(
      Math.max(
        Number(limit) || 30,
        1
      ),
      100
    );

  const query = {
    user:
      userId,
  };

  if (unreadOnly) {
    query.readAt =
      null;
  }

  return Notification.find(
    query
  )
    .populate(
      'actor',
      'username displayName avatar'
    )
    .sort({
      createdAt: -1,
    })
    .limit(
      safeLimit
    )
    .lean();
}


async function getUnreadNotificationCount(
  userId
) {
  return Notification.countDocuments({
    user:
      userId,

    readAt:
      null,
  });
}


async function markNotificationAsRead(
  userId,
  notificationId
) {
  const notification =
    await Notification.findOne({
      _id:
        notificationId,

      user:
        userId,
    });

  if (!notification) {
    throw new AppError(
      'Notification not found.',
      404,
      'NOTIFICATION_NOT_FOUND'
    );
  }

  if (!notification.readAt) {
    notification.readAt =
      new Date();

    await notification.save();
  }

  return notification;
}


/* ================================================================
   16. GROUP ENGINE
================================================================ */

async function createGroup(
  userId,
  {
    name,
    description = '',
    privacy = 'private',
    memberIds = [],
  } = {}
) {
  const cleanName =
    normalizeText(
      name
    );

  if (
    cleanName.length < 3 ||
    cleanName.length > 100
  ) {
    throw new AppError(
      'Group name must contain between 3 and 100 characters.',
      400,
      'INVALID_GROUP_NAME'
    );
  }

  const cleanDescription =
    normalizeText(
      description
    );

  if (
    cleanDescription.length >
    1000
  ) {
    throw new AppError(
      'Group description cannot exceed 1000 characters.',
      400,
      'INVALID_GROUP_DESCRIPTION'
    );
  }

  if (
    ![
      'private',
      'public',
    ].includes(
      privacy
    )
  ) {
    throw new AppError(
      'Invalid group privacy setting.',
      400,
      'INVALID_GROUP_PRIVACY'
    );
  }

  const members =
    [
      userId,
      ...Array.isArray(
        memberIds
      )
        ? memberIds
        : [],
    ];

  const uniqueMembers =
    [
      ...new Set(
        members.map(
          String
        )
      ),
    ];

  const group =
    await Group.create({
      name:
        cleanName,

      description:
        cleanDescription,

      privacy,

      owner:
        userId,

      members:
        uniqueMembers.map(
          memberId => ({
            user:
              memberId,

            role:
              String(
                memberId
              ) ===
              String(userId)
                ? 'owner'
                : 'member',

            joinedAt:
              new Date(),
          })
        ),
    });

  return group;
}


/* ================================================================
   17. DASHBOARD INTELLIGENCE
================================================================ */

/**
 * Generates a compact data package for the Nexus frontend.
 *
 * This is useful for an advanced dashboard because the frontend
 * can request one endpoint instead of making many separate calls.
 */
async function getDashboardData(
  userId
) {
  const [
    user,
    connections,
    notifications,
    unreadNotifications,
    conversations,
  ] = await Promise.all([
    getCurrentUser(
      userId
    ),

    getUserConnections(
      userId
    ),

    getNotifications(
      userId,
      {
        limit: 8,
      }
    ),

    getUnreadNotificationCount(
      userId
    ),

    getUserConversations(
      userId
    ),
  ]);

  return {
    success:
      true,

    user,

    overview: {
      connections:
        connections.length,

      conversations:
        conversations.length,

      notifications:
        notifications.length,

      unreadNotifications,
    },

    connections:
      connections.slice(
        0,
        8
      ),

    notifications,

    conversations:
      conversations.slice(
        0,
        8
      ),

    platform: {
      name:
        'Nexus Connect',

      version:
        '2030.1',

      status:
        'operational',
    },
  };
}


/* ================================================================
   18. PLATFORM STATISTICS
================================================================ */

async function getPlatformStatistics() {
  const [
    users,
    connections,
    conversations,
    messages,
    groups,
  ] = await Promise.all([
    User.countDocuments(),

    Connection.countDocuments({
      status:
        'accepted',
    }),

    Conversation.countDocuments(),

    Message.countDocuments(),

    Group.countDocuments(),
  ]);

  return {
    success:
      true,

    statistics: {
      users,
      verifiedConnections:
        connections,

      conversations,
      messages,
      groups,
    },

    platform: {
      name:
        'Nexus Connect',

      generation:
        '2030',

      status:
        'operational',
    },
  };
}


/* ================================================================
   19. ONLINE PRESENCE
================================================================ */

async function setUserOnline(
  userId
) {
  return User.findByIdAndUpdate(
    userId,
    {
      $set: {
        status:
          'online',

        lastSeenAt:
          new Date(),
      },
    },
    {
      new: true,
    }
  );
}


async function setUserOffline(
  userId
) {
  return User.findByIdAndUpdate(
    userId,
    {
      $set: {
        status:
          'offline',

        lastSeenAt:
          new Date(),
      },
    },
    {
      new: true,
    }
  );
}


/* ================================================================
   20. HEALTH INFORMATION
================================================================ */

async function getSystemHealth() {
  const database =
    await isDatabaseReady();

  return {
    status:
      database
        ? 'operational'
        : 'degraded',

    database:
      database
        ? 'connected'
        : 'disconnected',

    service:
      'Nexus Connect Service Engine',

    version:
      '2030.1',

    timestamp:
      new Date().toISOString(),
  };
}


/* ================================================================
   21. EXPORTS
================================================================ */

module.exports = {

  /* DATABASE */
  connectDatabase,
  disconnectDatabase,
  isDatabaseReady,

  /* ERRORS */
  AppError,

  /* CONFIG */
  getDatabaseUrl,
  getJWTSecret,
  getJWTExpiry,

  /* NORMALIZATION */
  normalizeEmail,
  normalizeUsername,
  normalizeText,

  /* VALIDATION */
  validateEmail,
  validateUsername,
  validatePin,
  validateDisplayName,

  /* SECURITY */
  generateToken,
  comparePin,
  hashPin,

  /* USERS */
  sanitizeUser,
  getPublicUser,
  getCurrentUser,
  getUserByUsername,
  updateProfile,

  /* AUTH */
  registerUser,
  loginUser,

  /* DISCOVERY */
  searchUsers,
  discoverProfessionals,

  /* CONVERSATIONS */
  getOrCreateDirectConversation,
  getUserConversations,

  /* MESSAGES */
  sendMessage,
  getConversationMessages,

  /* CONNECTIONS */
  sendConnectionRequest,
  acceptConnectionRequest,
  getUserConnections,

  /* NOTIFICATIONS */
  getNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,

  /* GROUPS */
  createGroup,

  /* DASHBOARD */
  getDashboardData,

  /* PLATFORM */
  getPlatformStatistics,

  /* PRESENCE */
  setUserOnline,
  setUserOffline,

  /* HEALTH */
  getSystemHealth,
};


/* ================================================================
   NEXUS CONNECT 2030
   END OF SERVICE ENGINE
================================================================ */
