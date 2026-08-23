'use strict';

/**
 * ============================================================
 * NEXUS CONNECT
 * Route / API Layer
 * ============================================================
 *
 * Route responsibilities:
 *
 * - Authentication
 * - Session management
 * - User profiles
 * - People / discovery
 * - Connections
 * - Conversations
 * - Messages
 * - Notifications
 * - Activity
 * - Groups
 * - Media
 * - Saved / pinned items
 * - AI foundation
 * - Health monitoring
 *
 * IMPORTANT:
 * Routes should remain thin.
 * Business logic belongs in services.js.
 *
 * Request flow:
 *
 * Browser
 *   ↓
 * routes.js
 *   ↓
 * middleware.js
 *   ↓
 * services.js
 *   ↓
 * models.js
 *   ↓
 * Database
 *
 * ============================================================
 */

const express = require('express');

const router = express.Router();

const {
    NexusError,
    authenticate,
    optionalAuthenticate,
    requireRole,
    requirePermission,
    requireSelf,
    authenticationRateLimiter,
    apiRateLimiter,
    asyncHandler,
    validatePin,
    validateUsername,
    validateEmail,
    normalizeBody,
    healthCheck
} = require('./middleware');

const services = require('./services');

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

/**
 * Safely obtain the authenticated user ID.
 */
function currentUserId(req) {
    return req.auth?.userId || null;
}

/**
 * Require authentication for service calls.
 */
function ensureAuth(req) {
    if (!req.auth?.userId) {
        throw new NexusError(
            'Authentication required.',
            401,
            'AUTHENTICATION_REQUIRED'
        );
    }

    return req.auth.userId;
}

/**
 * Resolve service method safely.
 *
 * This gives us a clean error instead of allowing an
 * undefined function to produce an unhelpful server error.
 */
function serviceMethod(
    name
) {
    const method =
        services &&
        services[name];

    if (
        typeof method !== 'function'
    ) {
        throw new NexusError(
            `Service "${name}" is not available.`,
            501,
            'SERVICE_NOT_IMPLEMENTED'
        );
    }

    return method;
}

/**
 * Standard success response.
 */
function success(
    res,
    data = {},
    statusCode = 200
) {
    return res
        .status(statusCode)
        .json({
            success: true,
            ...data
        });
}

/**
 * Normalize pagination.
 */
function pagination(req) {
    const page =
        Math.max(
            1,
            Number.parseInt(
                req.query.page || '1',
                10
            )
        );

    const limit =
        Math.min(
            100,
            Math.max(
                1,
                Number.parseInt(
                    req.query.limit || '20',
                    10
                )
            )
        );

    return {
        page,
        limit,
        offset:
            (page - 1) * limit
    };
}

/**
 * ============================================================
 * GLOBAL API PROTECTION
 * ============================================================
 */

router.use(
    apiRateLimiter
);

router.use(
    normalizeBody
);

/**
 * ============================================================
 * HEALTH
 * ============================================================
 */

router.get(
    '/health',
    healthCheck
);

/**
 * ============================================================
 * API INFORMATION
 * ============================================================
 */

router.get(
    '/',
    (req, res) => {
        success(res, {
            name: 'Nexus Connect API',
            version:
                process.env.API_VERSION ||
                '1.0.0',

            status: 'operational',

            timestamp:
                new Date().toISOString()
        });
    }
);

/**
 * ============================================================
 * AUTHENTICATION
 * ============================================================
 *
 * Registration:
 *
 * email
 * username
 * displayName
 * PIN
 *
 * Login:
 *
 * username OR email
 * 4-digit PIN
 *
 * No WordPress authentication dependency.
 * ============================================================
 */

/**
 * CREATE ACCOUNT
 */

router.post(
    '/auth/register',
    authenticationRateLimiter,

    asyncHandler(
        async (req, res) => {
            const {
                email,
                username,
                displayName,
                pin,
                confirmPin
            } = req.body || {};

            if (
                !validateEmail(email)
            ) {
                throw new NexusError(
                    'Please provide a valid email address.',
                    400,
                    'INVALID_EMAIL'
                );
            }

            if (
                !validateUsername(username)
            ) {
                throw new NexusError(
                    'Username must contain 3–30 letters, numbers or underscores.',
                    400,
                    'INVALID_USERNAME'
                );
            }

            if (
                !validatePin(pin)
            ) {
                throw new NexusError(
                    'PIN must contain exactly 4 digits.',
                    400,
                    'INVALID_PIN'
                );
            }

            if (
                pin !== confirmPin
            ) {
                throw new NexusError(
                    'PIN confirmation does not match.',
                    400,
                    'PIN_MISMATCH'
                );
            }

            const register =
                serviceMethod(
                    'registerUser'
                );

            const result =
                await register({
                    email,
                    username,
                    displayName,
                    pin,
                    requestId:
                        req.requestId,
                    ip:
                        req.ip ||
                        null,
                    userAgent:
                        req.headers[
                            'user-agent'
                        ] || null
                });

            return success(
                res,
                result,
                201
            );
        }
    )
);

/**
 * LOGIN
 */

router.post(
    '/auth/login',
    authenticationRateLimiter,

    asyncHandler(
        async (req, res) => {
            const {
                identifier,
                username,
                email,
                pin
            } = req.body || {};

            const loginIdentifier =
                identifier ||
                username ||
                email;

            if (
                !loginIdentifier ||
                typeof loginIdentifier !==
                    'string'
            ) {
                throw new NexusError(
                    'Username or email is required.',
                    400,
                    'IDENTIFIER_REQUIRED'
                );
            }

            if (
                !validatePin(pin)
            ) {
                throw new NexusError(
                    'PIN must contain exactly 4 digits.',
                    400,
                    'INVALID_PIN'
                );
            }

            const login =
                serviceMethod(
                    'loginUser'
                );

            const result =
                await login({
                    identifier:
                        loginIdentifier.trim(),
                    pin,
                    requestId:
                        req.requestId,
                    ip:
                        req.ip ||
                        null,
                    userAgent:
                        req.headers[
                            'user-agent'
                        ] || null
                });

            return success(
                res,
                result
            );
        }
    )
);

/**
 * LOGOUT
 */

router.post(
    '/auth/logout',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const logout =
                serviceMethod(
                    'logoutUser'
                );

            const result =
                await logout({
                    userId:
                        ensureAuth(req),

                    sessionId:
                        req.auth.sessionId,

                    requestId:
                        req.requestId
                });

            return success(
                res,
                result
            );
        }
    )
);

/**
 * REFRESH SESSION
 */

router.post(
    '/auth/refresh',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const refresh =
                serviceMethod(
                    'refreshSession'
                );

            const result =
                await refresh({
                    userId:
                        ensureAuth(req),

                    sessionId:
                        req.auth.sessionId,

                    requestId:
                        req.requestId
                });

            return success(
                res,
                result
            );
        }
    )
);

/**
 * VERIFY CURRENT SESSION
 */

router.get(
    '/auth/me',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const getCurrentUser =
                serviceMethod(
                    'getCurrentUser'
                );

            const result =
                await getCurrentUser(
                    ensureAuth(req)
                );

            return success(
                res,
                {
                    user: result
                }
            );
        }
    )
);

/**
 * ============================================================
 * SECURITY
 * ============================================================
 */

/**
 * CHANGE PIN
 */

router.put(
    '/security/pin',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const {
                currentPin,
                newPin,
                confirmPin
            } = req.body || {};

            if (
                !validatePin(
                    currentPin
                ) ||
                !validatePin(
                    newPin
                )
            ) {
                throw new NexusError(
                    'PIN must contain exactly 4 digits.',
                    400,
                    'INVALID_PIN'
                );
            }

            if (
                newPin !== confirmPin
            ) {
                throw new NexusError(
                    'PIN confirmation does not match.',
                    400,
                    'PIN_MISMATCH'
                );
            }

            const changePin =
                serviceMethod(
                    'changePin'
                );

            const result =
                await changePin({
                    userId:
                        ensureAuth(req),
                    currentPin,
                    newPin
                });

            return success(
                res,
                result
            );
        }
    )
);

/**
 * ACTIVE SESSIONS
 */

router.get(
    '/security/sessions',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const getSessions =
                serviceMethod(
                    'getUserSessions'
                );

            const result =
                await getSessions(
                    ensureAuth(req)
                );

            return success(
                res,
                {
                    sessions: result
                }
            );
        }
    )
);

/**
 * LOG OUT ALL OTHER DEVICES
 */

router.post(
    '/security/sessions/logout-all',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const logoutAll =
                serviceMethod(
                    'logoutAllOtherSessions'
                );

            const result =
                await logoutAll({
                    userId:
                        ensureAuth(req),

                    currentSessionId:
                        req.auth.sessionId
                });

            return success(
                res,
                result
            );
        }
    )
);

/**
 * ============================================================
 * PROFILE
 * ============================================================
 */

/**
 * MY PROFILE
 */

router.get(
    '/profile',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const getProfile =
                serviceMethod(
                    'getProfile'
                );

            const result =
                await getProfile(
                    ensureAuth(req)
                );

            return success(
                res,
                {
                    profile: result
                }
            );
        }
    )
);

/**
 * UPDATE MY PROFILE
 */

router.patch(
    '/profile',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const allowedFields = [
                'displayName',
                'bio',
                'status',
                'statusEmoji',
                'profilePhoto',
                'customStatus',
                'privacy'
            ];

            const updates = {};

            for (
                const field of allowedFields
            ) {
                if (
                    Object.prototype.hasOwnProperty.call(
                        req.body || {},
                        field
                    )
                ) {
                    updates[field] =
                        req.body[field];
                }
            }

            const updateProfile =
                serviceMethod(
                    'updateProfile'
                );

            const result =
                await updateProfile({
                    userId:
                        ensureAuth(req),

                    updates
                });

            return success(
                res,
                {
                    profile: result
                }
            );
        }
    )
);

/**
 * ============================================================
 * PEOPLE / USERS
 * ============================================================
 */

/**
 * GET USER BY USERNAME
 *
 * Example:
 *
 * /api/users/@muhammadibrahim
 */

router.get(
    '/users/@:username',
    optionalAuthenticate,

    asyncHandler(
        async (req, res) => {
            const username =
                req.params.username;

            if (
                !validateUsername(
                    username
                )
            ) {
                throw new NexusError(
                    'Invalid username.',
                    400,
                    'INVALID_USERNAME'
                );
            }

            const getUser =
                serviceMethod(
                    'getPublicUserByUsername'
                );

            const result =
                await getUser({
                    username,
                    viewerId:
                        currentUserId(req)
                });

            return success(
                res,
                {
                    user: result
                }
            );
        }
    )
);

/**
 * SEARCH PEOPLE
 */

router.get(
    '/users/search',
    optionalAuthenticate,

    asyncHandler(
        async (req, res) => {
            const query =
                String(
                    req.query.q || ''
                ).trim();

            if (
                query.length < 2
            ) {
                throw new NexusError(
                    'Search query must contain at least 2 characters.',
                    400,
                    'INVALID_SEARCH'
                );
            }

            const searchUsers =
                serviceMethod(
                    'searchUsers'
                );

            const result =
                await searchUsers({
                    query,
                    viewerId:
                        currentUserId(req),
                    ...pagination(req)
                });

            return success(
                res,
                {
                    results: result
                }
            );
        }
    )
);

/**
 * SUGGESTED CONNECTIONS
 */

router.get(
    '/users/suggestions',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const getSuggestions =
                serviceMethod(
                    'getSuggestedConnections'
                );

            const result =
                await getSuggestions({
                    userId:
                        ensureAuth(req),

                    ...pagination(req)
                });

            return success(
                res,
                {
                    suggestions:
                        result
                }
            );
        }
    )
);

/**
 * ============================================================
 * CONNECTIONS
 * ============================================================
 */

/**
 * SEND CONNECTION REQUEST
 */

router.post(
    '/connections/:userId/request',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const targetUserId =
                req.params.userId;

            const sendRequest =
                serviceMethod(
                    'sendConnectionRequest'
                );

            const result =
                await sendRequest({
                    requesterId:
                        ensureAuth(req),

                    recipientId:
                        targetUserId
                });

            return success(
                res,
                {
                    connection: result
                },
                201
            );
        }
    )
);

/**
 * ACCEPT REQUEST
 */

router.post(
    '/connections/:userId/accept',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const acceptRequest =
                serviceMethod(
                    'acceptConnectionRequest'
                );

            const result =
                await acceptRequest({
                    userId:
                        ensureAuth(req),

                    requesterId:
                        req.params.userId
                });

            return success(
                res,
                {
                    connection: result
                }
            );
        }
    )
);

/**
 * DECLINE REQUEST
 */

router.post(
    '/connections/:userId/decline',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const declineRequest =
                serviceMethod(
                    'declineConnectionRequest'
                );

            const result =
                await declineRequest({
                    userId:
                        ensureAuth(req),

                    requesterId:
                        req.params.userId
                });

            return success(
                res,
                result
            );
        }
    )
);

/**
 * MY CONNECTIONS
 */

router.get(
    '/connections',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const getConnections =
                serviceMethod(
                    'getConnections'
                );

            const result =
                await getConnections({
                    userId:
                        ensureAuth(req),

                    ...pagination(req)
                });

            return success(
                res,
                {
                    connections:
                        result
                }
            );
        }
    )
);

/**
 * ============================================================
 * CONVERSATIONS
 * ============================================================
 */

/**
 * LIST CONVERSATIONS
 */

router.get(
    '/conversations',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const getConversations =
                serviceMethod(
                    'getConversations'
                );

            const result =
                await getConversations({
                    userId:
                        ensureAuth(req),

                    ...pagination(req)
                });

            return success(
                res,
                {
                    conversations:
                        result
                }
            );
        }
    )
);

/**
 * CREATE PRIVATE CONVERSATION
 */

router.post(
    '/conversations/private',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const {
                userId,
                message
            } = req.body || {};

            if (!userId) {
                throw new NexusError(
                    'Recipient user ID is required.',
                    400,
                    'RECIPIENT_REQUIRED'
                );
            }

            const createConversation =
                serviceMethod(
                    'createPrivateConversation'
                );

            const result =
                await createConversation({
                    userId:
                        ensureAuth(req),

                    recipientId:
                        userId,

                    initialMessage:
                        message || null
                });

            return success(
                res,
                {
                    conversation:
                        result
                },
                201
            );
        }
    )
);

/**
 * GET CONVERSATION
 */

router.get(
    '/conversations/:conversationId',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const getConversation =
                serviceMethod(
                    'getConversation'
                );

            const result =
                await getConversation({
                    userId:
                        ensureAuth(req),

                    conversationId:
                        req.params
                            .conversationId
                });

            return success(
                res,
                {
                    conversation:
                        result
                }
            );
        }
    )
);

/**
 * DELETE / LEAVE CONVERSATION
 */

router.delete(
    '/conversations/:conversationId',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const leaveConversation =
                serviceMethod(
                    'leaveConversation'
                );

            const result =
                await leaveConversation({
                    userId:
                        ensureAuth(req),

                    conversationId:
                        req.params
                            .conversationId
                });

            return success(
                res,
                result
            );
        }
    )
);

/**
 * ============================================================
 * MESSAGES
 * ============================================================
 */

/**
 * GET MESSAGES
 */

router.get(
    '/conversations/:conversationId/messages',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const getMessages =
                serviceMethod(
                    'getMessages'
                );

            const result =
                await getMessages({
                    userId:
                        ensureAuth(req),

                    conversationId:
                        req.params
                            .conversationId,

                    ...pagination(req)
                });

            return success(
                res,
                {
                    messages:
                        result
                }
            );
        }
    )
);

/**
 * SEND MESSAGE
 */

router.post(
    '/conversations/:conversationId/messages',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const {
                text,
                replyTo,
                attachmentIds
            } = req.body || {};

            if (
                (!text ||
                    typeof text !==
                        'string' ||
                    text.trim().length === 0) &&
                !(
                    Array.isArray(
                        attachmentIds
                    ) &&
                    attachmentIds.length
                )
            ) {
                throw new NexusError(
                    'Message content is required.',
                    400,
                    'EMPTY_MESSAGE'
                );
            }

            const sendMessage =
                serviceMethod(
                    'sendMessage'
                );

            const result =
                await sendMessage({
                    userId:
                        ensureAuth(req),

                    conversationId:
                        req.params
                            .conversationId,

                    text:
                        typeof text ===
                        'string'
                            ? text.trim()
                            : null,

                    replyTo:
                        replyTo || null,

                    attachmentIds:
                        Array.isArray(
                            attachmentIds
                        )
                            ? attachmentIds
                            : []
                });

            return success(
                res,
                {
                    message:
                        result
                },
                201
            );
        }
    )
);

/**
 * EDIT MESSAGE
 */

router.patch(
    '/messages/:messageId',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const {
                text
            } = req.body || {};

            if (
                typeof text !==
                    'string' ||
                !text.trim()
            ) {
                throw new NexusError(
                    'Message text is required.',
                    400,
                    'INVALID_MESSAGE'
                );
            }

            const editMessage =
                serviceMethod(
                    'editMessage'
                );

            const result =
                await editMessage({
                    userId:
                        ensureAuth(req),

                    messageId:
                        req.params
                            .messageId,

                    text:
                        text.trim()
                });

            return success(
                res,
                {
                    message:
                        result
                }
            );
        }
    )
);

/**
 * DELETE MESSAGE
 */

router.delete(
    '/messages/:messageId',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const deleteMessage =
                serviceMethod(
                    'deleteMessage'
                );

            const result =
                await deleteMessage({
                    userId:
                        ensureAuth(req),

                    messageId:
                        req.params
                            .messageId
                });

            return success(
                res,
                result
            );
        }
    )
);

/**
 * MESSAGE REACTION
 */

router.post(
    '/messages/:messageId/reactions',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const {
                reaction
            } = req.body || {};

            if (
                typeof reaction !==
                    'string' ||
                reaction.length > 32
            ) {
                throw new NexusError(
                    'Invalid reaction.',
                    400,
                    'INVALID_REACTION'
                );
            }

            const react =
                serviceMethod(
                    'reactToMessage'
                );

            const result =
                await react({
                    userId:
                        ensureAuth(req),

                    messageId:
                        req.params
                            .messageId,

                    reaction
                });

            return success(
                res,
                {
                    reaction:
                        result
                }
            );
        }
    )
);

/**
 * ============================================================
 * READ RECEIPTS
 * ============================================================
 */

router.post(
    '/conversations/:conversationId/read',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const markRead =
                serviceMethod(
                    'markConversationRead'
                );

            const result =
                await markRead({
                    userId:
                        ensureAuth(req),

                    conversationId:
                        req.params
                            .conversationId
                });

            return success(
                res,
                result
            );
        }
    )
);

/**
 * ============================================================
 * NOTIFICATIONS
 * ============================================================
 */

router.get(
    '/notifications',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const getNotifications =
                serviceMethod(
                    'getNotifications'
                );

            const result =
                await getNotifications({
                    userId:
                        ensureAuth(req),

                    ...pagination(req)
                });

            return success(
                res,
                {
                    notifications:
                        result
                }
            );
        }
    )
);

/**
 * MARK NOTIFICATION READ
 */

router.post(
    '/notifications/:notificationId/read',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const markRead =
                serviceMethod(
                    'markNotificationRead'
                );

            const result =
                await markRead({
                    userId:
                        ensureAuth(req),

                    notificationId:
                        req.params
                            .notificationId
                });

            return success(
                res,
                result
            );
        }
    )
);

/**
 * MARK ALL NOTIFICATIONS READ
 */

router.post(
    '/notifications/read-all',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const markAllRead =
                serviceMethod(
                    'markAllNotificationsRead'
                );

            const result =
                await markAllRead(
                    ensureAuth(req)
                );

            return success(
                res,
                result
            );
        }
    )
);

/**
 * ============================================================
 * ACTIVITY
 * ============================================================
 */

router.get(
    '/activity',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const getActivity =
                serviceMethod(
                    'getActivity'
                );

            const result =
                await getActivity({
                    userId:
                        ensureAuth(req),

                    ...pagination(req)
                });

            return success(
                res,
                {
                    activity:
                        result
                }
            );
        }
    )
);

/**
 * ============================================================
 * GROUPS
 * ============================================================
 */

/**
 * CREATE GROUP
 */

router.post(
    '/groups',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const {
                name,
                description,
                privacy,
                memberIds
            } = req.body || {};

            if (
                typeof name !==
                    'string' ||
                name.trim().length < 2
            ) {
                throw new NexusError(
                    'Group name is required.',
                    400,
                    'INVALID_GROUP_NAME'
                );
            }

            const createGroup =
                serviceMethod(
                    'createGroup'
                );

            const result =
                await createGroup({
                    ownerId:
                        ensureAuth(req),

                    name:
                        name.trim(),

                    description:
                        description || '',

                    privacy:
                        privacy || 'private',

                    memberIds:
                        Array.isArray(
                            memberIds
                        )
                            ? memberIds
                            : []
                });

            return success(
                res,
                {
                    group: result
                },
                201
            );
        }
    )
);

/**
 * LIST GROUPS
 */

router.get(
    '/groups',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const getGroups =
                serviceMethod(
                    'getUserGroups'
                );

            const result =
                await getGroups({
                    userId:
                        ensureAuth(req),

                    ...pagination(req)
                });

            return success(
                res,
                {
                    groups:
                        result
                }
            );
        }
    )
);

/**
 * GET GROUP
 */

router.get(
    '/groups/:groupId',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const getGroup =
                serviceMethod(
                    'getGroup'
                );

            const result =
                await getGroup({
                    userId:
                        ensureAuth(req),

                    groupId:
                        req.params.groupId
                });

            return success(
                res,
                {
                    group:
                        result
                }
            );
        }
    )
);

/**
 * ADD GROUP MEMBER
 */

router.post(
    '/groups/:groupId/members',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const {
                userId
            } = req.body || {};

            if (!userId) {
                throw new NexusError(
                    'User ID is required.',
                    400,
                    'USER_REQUIRED'
                );
            }

            const addMember =
                serviceMethod(
                    'addGroupMember'
                );

            const result =
                await addMember({
                    actorId:
                        ensureAuth(req),

                    groupId:
                        req.params.groupId,

                    userId
                });

            return success(
                res,
                {
                    member:
                        result
                },
                201
            );
        }
    )
);

/**
 * ============================================================
 * MEDIA
 * ============================================================
 */

router.get(
    '/conversations/:conversationId/media',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const getMedia =
                serviceMethod(
                    'getConversationMedia'
                );

            const result =
                await getMedia({
                    userId:
                        ensureAuth(req),

                    conversationId:
                        req.params
                            .conversationId,

                    type:
                        req.query.type ||
                        'all',

                    ...pagination(req)
                });

            return success(
                res,
                {
                    media:
                        result
                }
            );
        }
    )
);

/**
 * ============================================================
 * SAVED ITEMS
 * ============================================================
 */

router.get(
    '/saved',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const getSaved =
                serviceMethod(
                    'getSavedItems'
                );

            const result =
                await getSaved({
                    userId:
                        ensureAuth(req),

                    ...pagination(req)
                });

            return success(
                res,
                {
                    items:
                        result
                }
            );
        }
    )
);

/**
 * SAVE MESSAGE
 */

router.post(
    '/messages/:messageId/save',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const save =
                serviceMethod(
                    'saveMessage'
                );

            const result =
                await save({
                    userId:
                        ensureAuth(req),

                    messageId:
                        req.params
                            .messageId
                });

            return success(
                res,
                result
            );
        }
    )
);

/**
 * ============================================================
 * PINNED ITEMS
 * ============================================================
 */

router.get(
    '/conversations/:conversationId/pinned',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const getPinned =
                serviceMethod(
                    'getPinnedMessages'
                );

            const result =
                await getPinned({
                    userId:
                        ensureAuth(req),

                    conversationId:
                        req.params
                            .conversationId
                });

            return success(
                res,
                {
                    messages:
                        result
                }
            );
        }
    )
);

/**
 * PIN MESSAGE
 */

router.post(
    '/messages/:messageId/pin',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const pin =
                serviceMethod(
                    'pinMessage'
                );

            const result =
                await pin({
                    userId:
                        ensureAuth(req),

                    messageId:
                        req.params
                            .messageId
                });

            return success(
                res,
                result
            );
        }
    )
);

/**
 * ============================================================
 * DISCOVER
 * ============================================================
 */

router.get(
    '/discover',
    optionalAuthenticate,

    asyncHandler(
        async (req, res) => {
            const discover =
                serviceMethod(
                    'discover'
                );

            const result =
                await discover({
                    query:
                        req.query.q ||
                        '',

                    category:
                        req.query.category ||
                        'all',

                    viewerId:
                        currentUserId(req),

                    ...pagination(req)
                });

            return success(
                res,
                {
                    results:
                        result
                }
            );
        }
    )
);

/**
 * ============================================================
 * GLOBAL SEARCH
 * ============================================================
 */

router.get(
    '/search',
    optionalAuthenticate,

    asyncHandler(
        async (req, res) => {
            const query =
                String(
                    req.query.q || ''
                ).trim();

            if (
                query.length < 2
            ) {
                throw new NexusError(
                    'Search query must contain at least 2 characters.',
                    400,
                    'INVALID_SEARCH'
                );
            }

            const search =
                serviceMethod(
                    'globalSearch'
                );

            const result =
                await search({
                    query,

                    type:
                        req.query.type ||
                        'all',

                    viewerId:
                        currentUserId(req),

                    ...pagination(req)
                });

            return success(
                res,
                {
                    results:
                        result
                }
            );
        }
    )
);

/**
 * ============================================================
 * AI FOUNDATION
 * ============================================================
 *
 * AI endpoints are deliberately separated from normal
 * messaging routes so future AI providers can be swapped
 * without changing the application architecture.
 * ============================================================
 */

router.post(
    '/ai/assist',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const {
                action,
                text,
                conversationId,
                language,
                tone
            } = req.body || {};

            if (
                !action
            ) {
                throw new NexusError(
                    'AI action is required.',
                    400,
                    'AI_ACTION_REQUIRED'
                );
            }

            const aiAssist =
                serviceMethod(
                    'aiAssist'
                );

            const result =
                await aiAssist({
                    userId:
                        ensureAuth(req),

                    action,

                    text:
                        text || '',

                    conversationId:
                        conversationId ||
                        null,

                    language:
                        language ||
                        'en',

                    tone:
                        tone ||
                        'professional'
                });

            return success(
                res,
                {
                    result
                }
            );
        }
    )
);

/**
 * ============================================================
 * USER STATUS / PRESENCE
 * ============================================================
 */

/**
 * UPDATE CUSTOM STATUS
 */

router.patch(
    '/presence/status',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const {
                status,
                customStatus,
                emoji
            } = req.body || {};

            const updateStatus =
                serviceMethod(
                    'updateUserStatus'
                );

            const result =
                await updateStatus({
                    userId:
                        ensureAuth(req),

                    status:
                        status ||
                        'online',

                    customStatus:
                        customStatus ||
                        '',

                    emoji:
                        emoji ||
                        ''
                });

            return success(
                res,
                {
                    presence:
                        result
                }
            );
        }
    )
);

/**
 * ============================================================
 * PRIVACY
 * ============================================================
 */

router.patch(
    '/privacy',
    authenticate,

    asyncHandler(
        async (req, res) => {
            const {
                whoCanMessage,
                whoCanSeeOnline,
                whoCanSeeProfile,
                whoCanAddToGroups,
                whoCanSendInvitations
            } = req.body || {};

            const updatePrivacy =
                serviceMethod(
                    'updatePrivacySettings'
                );

            const result =
                await updatePrivacy({
                    userId:
                        ensureAuth(req),

                    settings: {
                        whoCanMessage,
                        whoCanSeeOnline,
                        whoCanSeeProfile,
                        whoCanAddToGroups,
                        whoCanSendInvitations
                    }
                });

            return success(
                res,
                {
                    privacy:
                        result
                }
            );
        }
    )
);

/**
 * ============================================================
 * ERROR FALLBACK
 * ============================================================
 *
 * This router-level fallback allows app.js to continue using
 * the global error handler for the final response.
 * ============================================================
 */

router.use(
    (req, res, next) => {
        next(
            new NexusError(
                `API route not found: ${req.method} ${req.originalUrl}`,
                404,
                'API_ROUTE_NOT_FOUND'
            )
        );
    }
);

/**
 * ============================================================
 * EXPORT
 * ============================================================
 */

module.exports = router;
