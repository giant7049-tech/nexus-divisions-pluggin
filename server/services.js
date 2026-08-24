'use strict';

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


/**
 * ============================================================
 * NEXUS CONNECT — SERVICE LAYER
 * ============================================================
 *
 * Responsibilities:
 * - Database connection management
 * - Authentication
 * - User registration
 * - PIN security
 * - Login
 * - JWT session generation
 * - User profiles
 * - Private conversations
 * - Messaging
 * - Groups
 * - Connections
 * - Notifications
 *
 * Routes should remain thin.
 * Database structure belongs in models.js.
 * Real-time events belong in sockets.js.
 * ============================================================
 */


/* ============================================================
   ERROR CLASS
============================================================ */

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);

    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }
}


/* ============================================================
   DATABASE CONNECTION SERVICES
============================================================ */

/**
 * Get the configured MongoDB connection string.
 *
 * Supports several possible config structures so the service
 * remains compatible with the current Nexus configuration.
 */
function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    config.databaseUrl ||
    config.database?.url ||
    config.database?.uri ||
    config.mongodb?.url ||
    config.mongodb?.uri ||
    null
  );
}


/**
 * Connect to MongoDB.
 *
 * This function is called by server.js before the HTTP server
 * starts accepting requests.
 */
async function connectDatabase() {
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    throw new AppError(
      'DATABASE_URL is not configured.',
      500,
      'DATABASE_CONFIGURATION_ERROR'
    );
  }

  /**
   * 0 = disconnected
   * 1 = connected
   * 2 = connecting
   * 3 = disconnecting
   */

  if (mongoose.connection.readyState === 1) {
    console.log(
      '[NEXUS] MongoDB connection is already active.'
    );

    return mongoose.connection;
  }

  mongoose.set('strictQuery', true);

  await mongoose.connect(databaseUrl, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
    minPoolSize: 0,
  });

  console.log(
    `[NEXUS] MongoDB connected: ${mongoose.connection.name}`
  );

  return mongoose.connection;
}


/**
 * Disconnect from MongoDB.
 *
 * Used during graceful application shutdown.
 */
async function disconnectDatabase() {
  if (
    mongoose.connection.readyState === 0
  ) {
    console.log(
      '[NEXUS] MongoDB is already disconnected.'
    );

    return;
  }

  await mongoose.disconnect();

  console.log(
    '[NEXUS] MongoDB connection closed.'
  );
}


/**
 * Check whether MongoDB is ready.
 *
 * Used by:
 *
 *     GET /ready
 */
async function isDatabaseReady() {
  return mongoose.connection.readyState === 1;
}


/* ============================================================
   UTILITY FUNCTIONS
============================================================ */

/**
 * Normalize email addresses.
 */
function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}


/**
 * Normalize usernames.
 *
 * Usernames become lowercase internally.
 */
function normalizeUsername(username) {
  return String(username || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
}


/**
 * Validate Nexus username.
 */
function validateUsername(username) {
  const normalized = normalizeUsername(username);

  const usernamePattern = /^[a-z0-9_]{3,30}$/;

  if (!usernamePattern.test(normalized)) {
    throw new AppError(
      'Username must contain 3–30 characters using letters, numbers, or underscores only.',
      400,
      'INVALID_USERNAME'
    );
  }

  return normalized;
}


/**
 * Validate email.
 */
function validateEmail(email) {
  const normalized = normalizeEmail(email);

  const emailPattern =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(normalized)) {
    throw new AppError(
      'Please provide a valid email address.',
      400,
      'INVALID_EMAIL'
    );
  }

  return normalized;
}


/**
 * Validate 4-digit Nexus PIN.
 */
function validatePin(pin) {
  const normalized = String(pin || '').trim();

  if (!/^\d{4}$/.test(normalized)) {
    throw new AppError(
      'PIN must contain exactly 4 digits.',
      400,
      'INVALID_PIN'
    );
  }

  return normalized;
}


/**
 * Create a secure JWT session token.
 */
function generateToken(userId) {
  const jwtSecret =
    config.jwtSecret ||
    config.jwt?.secret ||
    process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new AppError(
      'Server authentication configuration is incomplete.',
      500,
      'AUTH_CONFIGURATION_ERROR'
    );
  }

  const expiresIn =
    config.jwtExpiresIn ||
    config.jwt?.expiresIn ||
    process.env.JWT_EXPIRES_IN ||
    '7d';

  return jwt.sign(
    {
      sub: String(userId),
      type: 'access',
    },
    jwtSecret,
    {
      expiresIn,
    }
  );
}


/**
 * Remove sensitive information before returning user data.
 */
function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  const source =
    typeof user.toObject === 'function'
      ? user.toObject()
      : { ...user };

  delete source.pinHash;
  delete source.__v;

  return source;
}


/**
 * Create consistent public user data.
 */
function getPublicUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: String(user._id || user.id),
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar || null,
    bio: user.bio || '',
    status: user.status || 'offline',
    customStatus: user.customStatus || '',
  };
}


/* ============================================================
   AUTHENTICATION SERVICES
============================================================ */

/**
 * Register a new Nexus Connect user.
 */
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

  const cleanDisplayName =
    String(displayName || '').trim();

  if (cleanDisplayName.length < 2) {
    throw new AppError(
      'Display name must contain at least 2 characters.',
      400,
      'INVALID_DISPLAY_NAME'
    );
  }

  if (cleanDisplayName.length > 60) {
    throw new AppError(
      'Display name cannot exceed 60 characters.',
      400,
      'INVALID_DISPLAY_NAME'
    );
  }

  const validatedPin =
    validatePin(pin);

  const validatedConfirmPin =
    validatePin(confirmPin);

  if (
    validatedPin !== validatedConfirmPin
  ) {
    throw new AppError(
      'PIN confirmation does not match.',
      400,
      'PIN_MISMATCH'
    );
  }

  const existingEmailUser =
    await User.findOne({
      email: normalizedEmail,
    });

  if (existingEmailUser) {
    throw new AppError(
      'An account with this email already exists.',
      409,
      'EMAIL_ALREADY_EXISTS'
    );
  }

  const existingUsernameUser =
    await User.findOne({
      username: normalizedUsername,
    });

  if (existingUsernameUser) {
    throw new AppError(
      'This username is already taken.',
      409,
      'USERNAME_ALREADY_EXISTS'
    );
  }

  const saltRounds =
    Number(
      config.bcryptSaltRounds ||
      config.security?.bcryptSaltRounds ||
      process.env.BCRYPT_SALT_ROUNDS
    ) || 12;

  const pinHash =
    await bcrypt.hash(
      validatedPin,
      saltRounds
    );

  const user =
    await User.create({
      email: normalizedEmail,
      username: normalizedUsername,
      displayName: cleanDisplayName,
      pinHash,
      status: 'online',
      lastSeenAt: new Date(),
    });

  const token =
    generateToken(user._id);

  return {
    message:
      'Nexus Connect account created successfully.',
    token,
    user: sanitizeUser(user),
  };
}


/**
 * Login using username/email + 4-digit PIN.
 */
async function loginUser({
  identifier,
  pin,
}) {
  const cleanIdentifier =
    String(identifier || '').trim();

  if (!cleanIdentifier) {
    throw new AppError(
      'Username or email is required.',
      400,
      'IDENTIFIER_REQUIRED'
    );
  }

  const validatedPin =
    validatePin(pin);

  const normalizedIdentifier =
    cleanIdentifier.toLowerCase();

  const user =
    await User.findOne({
      $or: [
        {
          email: normalizedIdentifier,
        },
        {
          username:
            normalizeUsername(
              normalizedIdentifier
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

  const pinMatches =
    await bcrypt.compare(
      validatedPin,
      user.pinHash
    );

  if (!pinMatches) {
    throw new AppError(
      'Invalid username, email, or PIN.',
      401,
      'INVALID_CREDENTIALS'
    );
  }

  user.status = 'online';
  user.lastSeenAt = new Date();

  await user.save();

  const token =
    generateToken(user._id);

  return {
    message:
      'Login successful.',
    token,
    user: sanitizeUser(user),
  };
}


/**
 * Get the currently authenticated user.
 */
async function getCurrentUser(userId) {
  const user =
    await User.findById(userId);

  if (!user) {
    throw new AppError(
      'User account not found.',
      404,
      'USER_NOT_FOUND'
    );
  }

  return sanitizeUser(user);
}


/* ============================================================
   USER PROFILE SERVICES
============================================================ */

/**
 * Find a user by username.
 */
async function getUserByUsername(username) {
  const normalizedUsername =
    normalizeUsername(username);

  const user =
    await User.findOne({
      username: normalizedUsername,
    });

  if (!user) {
    throw new AppError(
      'User not found.',
      404,
      'USER_NOT_FOUND'
    );
  }

  return getPublicUser(user);
}


/**
 * Search Nexus Connect users.
 */
async function searchUsers(query, limit = 20) {
  const cleanQuery =
    String(query || '').trim();

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

  const escapedQuery =
    cleanQuery.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    );

  const regex =
    new RegExp(
      escapedQuery,
      'i'
    );

  const users =
    await User.find({
      $or: [
        {
          username: regex,
        },
        {
          displayName: regex,
        },
      ],
    })
      .limit(safeLimit)
      .select(
        'username displayName avatar bio status customStatus'
      )
      .lean();

  return users.map(
    getPublicUser
  );
}


/**
 * Update the authenticated user's profile.
 */
async function updateProfile(
  userId,
  {
    displayName,
    bio,
    avatar,
    customStatus,
  }
) {
  const user =
    await User.findById(userId);

  if (!user) {
    throw new AppError(
      'User account not found.',
      404,
      'USER_NOT_FOUND'
    );
  }

  if (
    displayName !== undefined
  ) {
    const cleanDisplayName =
      String(displayName).trim();

    if (
      cleanDisplayName.length < 2 ||
      cleanDisplayName.length > 60
    ) {
      throw new AppError(
        'Display name must contain between 2 and 60 characters.',
        400,
        'INVALID_DISPLAY_NAME'
      );
    }

    user.displayName =
      cleanDisplayName;
  }

  if (
    bio !== undefined
  ) {
    const cleanBio =
      String(bio).trim();

    if (
      cleanBio.length > 500
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
      String(avatar || '').trim() ||
      null;
  }

  if (
    customStatus !== undefined
  ) {
    const cleanStatus =
      String(customStatus).trim();

    if (
      cleanStatus.length > 100
    ) {
      throw new AppError(
        'Custom status cannot exceed 100 characters.',
        400,
        'INVALID_CUSTOM_STATUS'
      );
    }

    user.customStatus =
      cleanStatus;
  }

  await user.save();

  return sanitizeUser(user);
}


/* ============================================================
   PRIVATE CONVERSATION SERVICES
============================================================ */

/**
 * Create or retrieve a private conversation.
 */
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
    );

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
      });
  }

  return conversation;
}


/**
 * Get all conversations belonging to a user.
 */
async function getUserConversations(userId) {
  const conversations =
    await Conversation.find({
      participants: userId,
    })
      .populate(
        'participants',
        'username displayName avatar status customStatus'
      )
      .sort({
        updatedAt: -1,
      })
      .lean();

  return conversations;
}


/* ============================================================
   MESSAGE SERVICES
============================================================ */

/**
 * Send a text message.
 */
async function sendMessage(
  userId,
  {
    conversationId,
    content,
    replyTo,
    type = 'text',
  }
) {
  const cleanContent =
    String(content || '').trim();

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

  const isParticipant =
    conversation.participants.some(
      participant =>
        String(participant) ===
        String(userId)
    );

  if (!isParticipant) {
    throw new AppError(
      'You do not have permission to send messages in this conversation.',
      403,
      'CONVERSATION_ACCESS_DENIED'
    );
  }

  const message =
    await Message.create({
      conversation: conversationId,
      sender: userId,
      content: cleanContent,
      type,
      replyTo:
        replyTo || null,
      deliveredTo: [
        userId,
      ],
      readBy: [
        {
          user: userId,
          readAt: new Date(),
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


/**
 * Get messages inside a conversation.
 */
async function getConversationMessages(
  userId,
  conversationId,
  {
    limit = 50,
    before,
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

  const isParticipant =
    conversation.participants.some(
      participant =>
        String(participant) ===
        String(userId)
    );

  if (!isParticipant) {
    throw new AppError(
      'You do not have permission to view this conversation.',
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
    conversation: conversationId,
    deletedAt: null,
  };

  if (before) {
    query.createdAt = {
      $lt: new Date(before),
    };
  }

  const messages =
    await Message.find(query)
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
      .limit(safeLimit)
      .lean();

  return messages.reverse();
}


/* ============================================================
   CONNECTION SERVICES
============================================================ */

/**
 * Send a connection request.
 */
async function sendConnectionRequest(
  requesterId,
  recipientId
) {
  if (
    String(requesterId) ===
    String(recipientId)
  ) {
    throw new AppError(
      'You cannot send a connection request to yourself.',
      400,
      'INVALID_CONNECTION_REQUEST'
    );
  }

  const recipient =
    await User.findById(
      recipientId
    );

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
          requester: requesterId,
          recipient: recipientId,
        },
        {
          requester: recipientId,
          recipient: requesterId,
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
      requester: requesterId,
      recipient: recipientId,
      status: 'pending',
    });

  await Notification.create({
    user: recipientId,
    actor: requesterId,
    type: 'connection_request',
    connection: connection._id,
  });

  return connection;
}


/**
 * Accept a connection request.
 */
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
    String(connection.recipient) !==
    String(userId)
  ) {
    throw new AppError(
      'You cannot accept this connection request.',
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


/* ============================================================
   NOTIFICATION SERVICES
============================================================ */

/**
 * Get notifications for a user.
 */
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
    user: userId,
  };

  if (unreadOnly) {
    query.readAt = null;
  }

  return Notification.find(query)
    .populate(
      'actor',
      'username displayName avatar'
    )
    .sort({
      createdAt: -1,
    })
    .limit(safeLimit)
    .lean();
}


/**
 * Mark a notification as read.
 */
async function markNotificationAsRead(
  userId,
  notificationId
) {
  const notification =
    await Notification.findOne({
      _id: notificationId,
      user: userId,
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


/* ============================================================
   GROUP SERVICES — FOUNDATION
============================================================ */

/**
 * Create a Nexus Connect group.
 */
async function createGroup(
  userId,
  {
    name,
    description = '',
    privacy = 'private',
    memberIds = [],
  }
) {
  const cleanName =
    String(name || '').trim();

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
    String(description || '').trim();

  if (
    cleanDescription.length > 1000
  ) {
    throw new AppError(
      'Group description cannot exceed 1000 characters.',
      400,
      'INVALID_GROUP_DESCRIPTION'
    );
  }

  const allowedPrivacy =
    [
      'private',
      'public',
    ];

  if (
    !allowedPrivacy.includes(
      privacy
    )
  ) {
    throw new AppError(
      'Invalid group privacy setting.',
      400,
      'INVALID_GROUP_PRIVACY'
    );
  }

  const uniqueMembers =
    [
      ...new Set(
        [
          userId,
          ...memberIds,
        ].map(
          String
        )
      ),
    ];

  const group =
    await Group.create({
      name: cleanName,
      description: cleanDescription,
      privacy,
      owner: userId,

      members:
        uniqueMembers.map(
          memberId => ({
            user: memberId,

            role:
              String(memberId) ===
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


/* ============================================================
   EXPORTS
============================================================ */

module.exports = {

  /* DATABASE */

  connectDatabase,
  disconnectDatabase,
  isDatabaseReady,


  /* ERROR */

  AppError,


  /* UTILITIES */

  normalizeEmail,
  normalizeUsername,

  validateEmail,
  validateUsername,
  validatePin,

  generateToken,
  sanitizeUser,
  getPublicUser,


  /* AUTHENTICATION */

  registerUser,
  loginUser,
  getCurrentUser,


  /* USER PROFILE */

  getUserByUsername,
  searchUsers,
  updateProfile,


  /* CONVERSATIONS */

  getOrCreateDirectConversation,
  getUserConversations,


  /* MESSAGES */

  sendMessage,
  getConversationMessages,


  /* CONNECTIONS */

  sendConnectionRequest,
  acceptConnectionRequest,


  /* NOTIFICATIONS */

  getNotifications,
  markNotificationAsRead,


  /* GROUPS */

  createGroup,
};
