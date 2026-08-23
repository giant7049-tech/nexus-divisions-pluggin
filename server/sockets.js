'use strict';

/**
 * NEXUS CONNECT
 * Real-Time Socket Layer
 *
 * File:
 *   server/sockets.js
 *
 * Responsibility:
 *   - Socket.IO initialization
 *   - authenticated socket sessions
 *   - online/offline presence
 *   - conversation rooms
 *   - typing indicators
 *   - message delivery events
 *   - read receipts
 *   - message reactions
 *   - reconnection handling
 *   - secure event validation
 *
 * Architecture:
 *   Client
 *      ↓
 *   Socket.IO
 *      ↓
 *   Socket authentication
 *      ↓
 *   Event validation
 *      ↓
 *   Service layer
 *      ↓
 *   Database
 *
 * This layer must NOT contain database business logic.
 */

const jwt = require('jsonwebtoken');

const {
    env,
    security
} = require('./config');

const {
    getUserById,
    getUserByUsername,
    createMessage,
    markMessagesAsRead,
    updateUserPresence,
    createNotification,
    addReaction,
    removeReaction
} = require('./services');


/* -------------------------------------------------------------------------- */
/* CONFIGURATION                                                              */
/* -------------------------------------------------------------------------- */

const SOCKET_EVENTS = Object.freeze({

    CONNECTION: 'connection',
    DISCONNECT: 'disconnect',

    PRESENCE_UPDATE: 'presence:update',
    PRESENCE_CHANGED: 'presence:changed',

    CONVERSATION_JOIN: 'conversation:join',
    CONVERSATION_LEAVE: 'conversation:leave',
    CONVERSATION_JOINED: 'conversation:joined',
    CONVERSATION_LEFT: 'conversation:left',

    MESSAGE_SEND: 'message:send',
    MESSAGE_NEW: 'message:new',
    MESSAGE_ERROR: 'message:error',

    TYPING_START: 'typing:start',
    TYPING_STOP: 'typing:stop',
    TYPING_UPDATE: 'typing:update',

    MESSAGE_READ: 'message:read',
    MESSAGE_READ_UPDATE: 'message:read:update',

    MESSAGE_REACTION_ADD: 'message:reaction:add',
    MESSAGE_REACTION_REMOVE: 'message:reaction:remove',
    MESSAGE_REACTION_UPDATE: 'message:reaction:update',

    SOCKET_ERROR: 'socket:error',

    SYSTEM_READY: 'system:ready'
});


const SOCKET_ROOM_PREFIX = Object.freeze({
    USER: 'user:',
    CONVERSATION: 'conversation:',
    COMMUNITY: 'community:'
});


/* -------------------------------------------------------------------------- */
/* INTERNAL STATE                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Maps userId -> Set(socketId)
 *
 * One user may be logged in on:
 * - desktop
 * - mobile
 * - tablet
 * - another browser
 *
 * Therefore we must NOT assume one socket per user.
 */
const userSockets = new Map();


/**
 * Maps socketId -> userId.
 *
 * Used for fast cleanup when a socket disconnects.
 */
const socketUsers = new Map();


/**
 * Tracks currently typing users.
 *
 * conversationId -> Set(userId)
 */
const typingUsers = new Map();


/* -------------------------------------------------------------------------- */
/* UTILITY FUNCTIONS                                                          */
/* -------------------------------------------------------------------------- */

function normalizeId(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }

    const normalized = String(value).trim();

    return normalized || null;
}


function safeString(value, maxLength = 500) {

    if (
        value === null ||
        value === undefined
    ) {
        return '';
    }

    return String(value)
        .trim()
        .slice(0, maxLength);
}


function getUserRoom(userId) {

    return `${SOCKET_ROOM_PREFIX.USER}${userId}`;
}


function getConversationRoom(conversationId) {

    return `${SOCKET_ROOM_PREFIX.CONVERSATION}${conversationId}`;
}


function getCommunityRoom(communityId) {

    return `${SOCKET_ROOM_PREFIX.COMMUNITY}${communityId}`;
}


/**
 * Return true if a user currently has at least one connected socket.
 */
function isUserOnline(userId) {

    const sockets = userSockets.get(String(userId));

    return Boolean(
        sockets &&
        sockets.size > 0
    );
}


/**
 * Add socket to a user's socket collection.
 */
function registerUserSocket(userId, socketId) {

    const normalizedUserId = String(userId);

    if (!userSockets.has(normalizedUserId)) {

        userSockets.set(
            normalizedUserId,
            new Set()
        );
    }

    userSockets
        .get(normalizedUserId)
        .add(socketId);

    socketUsers.set(
        socketId,
        normalizedUserId
    );
}


/**
 * Remove socket from user collection.
 *
 * Returns true when the user has completely gone offline.
 */
function unregisterUserSocket(socketId) {

    const userId = socketUsers.get(socketId);

    if (!userId) {
        return null;
    }

    socketUsers.delete(socketId);

    const sockets = userSockets.get(userId);

    if (!sockets) {
        return {
            userId,
            becameOffline: true
        };
    }

    sockets.delete(socketId);

    if (sockets.size === 0) {

        userSockets.delete(userId);

        return {
            userId,
            becameOffline: true
        };
    }

    return {
        userId,
        becameOffline: false
    };
}


/**
 * Remove user from every typing state.
 */
function clearTypingForUser(userId) {

    const normalizedUserId = String(userId);

    for (const [
        conversationId,
        users
    ] of typingUsers.entries()) {

        users.delete(normalizedUserId);

        if (users.size === 0) {

            typingUsers.delete(
                conversationId
            );
        }
    }
}


/**
 * Validate an object payload.
 */
function ensureObject(payload) {

    return Boolean(
        payload &&
        typeof payload === 'object' &&
        !Array.isArray(payload)
    );
}


/**
 * Emit an application-level socket error.
 */
function emitSocketError(
    socket,
    code,
    message,
    details = null
) {

    socket.emit(
        SOCKET_EVENTS.SOCKET_ERROR,
        {
            success: false,
            code,
            message,
            details,
            timestamp: new Date().toISOString()
        }
    );
}


/* -------------------------------------------------------------------------- */
/* SOCKET AUTHENTICATION                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Authenticate Socket.IO connections using the same JWT system
 * used by the REST API.
 *
 * Expected client connection:
 *
 * io(API_URL, {
 *     auth: {
 *         token: JWT_TOKEN
 *     }
 * });
 */
async function authenticateSocket(socket) {

    const auth = socket.handshake?.auth || {};

    let token =
        auth.token ||
        socket.handshake?.headers?.authorization;

    if (!token) {

        throw new Error(
            'Authentication token is required.'
        );
    }


    if (
        typeof token === 'string' &&
        token.toLowerCase().startsWith('bearer ')
    ) {

        token = token.slice(7).trim();
    }


    if (!token) {

        throw new Error(
            'Invalid authentication token.'
        );
    }


    const decoded = jwt.verify(
        token,
        env.JWT_SECRET,
        {
            algorithms: security.jwtAlgorithms
        }
    );


    if (!decoded || !decoded.sub) {

        throw new Error(
            'Invalid authentication payload.'
        );
    }


    const user = await getUserById(
        decoded.sub
    );


    if (!user) {

        throw new Error(
            'User account could not be found.'
        );
    }


    return {
        id: String(user.id),
        username: user.username,
        displayName: user.displayName,
        email: user.email
    };
}


/* -------------------------------------------------------------------------- */
/* CONNECTION ROOMS                                                           */
/* -------------------------------------------------------------------------- */

async function joinConversation(
    socket,
    conversationId
) {

    const normalizedConversationId =
        normalizeId(conversationId);

    if (!normalizedConversationId) {

        emitSocketError(
            socket,
            'INVALID_CONVERSATION',
            'A valid conversation ID is required.'
        );

        return;
    }


    const room =
        getConversationRoom(
            normalizedConversationId
        );


    await socket.join(room);


    socket.emit(
        SOCKET_EVENTS.CONVERSATION_JOINED,
        {
            conversationId:
                normalizedConversationId,

            room,

            timestamp:
                new Date().toISOString()
        }
    );
}


async function leaveConversation(
    socket,
    conversationId
) {

    const normalizedConversationId =
        normalizeId(conversationId);

    if (!normalizedConversationId) {
        return;
    }


    const room =
        getConversationRoom(
            normalizedConversationId
        );


    await socket.leave(room);


    socket.emit(
        SOCKET_EVENTS.CONVERSATION_LEFT,
        {
            conversationId:
                normalizedConversationId,

            room,

            timestamp:
                new Date().toISOString()
        }
    );
}


/* -------------------------------------------------------------------------- */
/* PRESENCE                                                                   */
/* -------------------------------------------------------------------------- */

async function handlePresenceUpdate(
    io,
    socket,
    payload
) {

    if (!ensureObject(payload)) {

        emitSocketError(
            socket,
            'INVALID_PRESENCE',
            'Invalid presence payload.'
        );

        return;
    }


    const allowedStatuses = new Set([
        'online',
        'away',
        'dnd',
        'offline'
    ]);


    const status =
        safeString(
            payload.status,
            30
        ).toLowerCase();


    if (!allowedStatuses.has(status)) {

        emitSocketError(
            socket,
            'INVALID_STATUS',
            'Invalid presence status.'
        );

        return;
    }


    const customStatus =
        safeString(
            payload.customStatus,
            120
        );


    await updateUserPresence(
        socket.user.id,
        {
            status,
            customStatus
        }
    );


    const event = {
        userId: socket.user.id,
        username: socket.user.username,
        status,
        customStatus,
        online: status !== 'offline',
        timestamp: new Date().toISOString()
    };


    io.emit(
        SOCKET_EVENTS.PRESENCE_CHANGED,
        event
    );
}


/* -------------------------------------------------------------------------- */
/* TYPING INDICATORS                                                          */
/* -------------------------------------------------------------------------- */

async function handleTypingStart(
    io,
    socket,
    payload
) {

    if (!ensureObject(payload)) {
        return;
    }


    const conversationId =
        normalizeId(
            payload.conversationId
        );


    if (!conversationId) {
        return;
    }


    if (!typingUsers.has(conversationId)) {

        typingUsers.set(
            conversationId,
            new Set()
        );
    }


    typingUsers
        .get(conversationId)
        .add(socket.user.id);


    socket.join(
        getConversationRoom(
            conversationId
        )
    );


    socket.to(
        getConversationRoom(
            conversationId
        )
    ).emit(
        SOCKET_EVENTS.TYPING_UPDATE,
        {
            conversationId,
            userId: socket.user.id,
            username: socket.user.username,
            typing: true,
            timestamp: new Date().toISOString()
        }
    );
}


async function handleTypingStop(
    io,
    socket,
    payload
) {

    if (!ensureObject(payload)) {
        return;
    }


    const conversationId =
        normalizeId(
            payload.conversationId
        );


    if (!conversationId) {
        return;
    }


    const users =
        typingUsers.get(
            conversationId
        );


    if (users) {

        users.delete(
            socket.user.id
        );


        if (users.size === 0) {

            typingUsers.delete(
                conversationId
            );
        }
    }


    socket.to(
        getConversationRoom(
            conversationId
        )
    ).emit(
        SOCKET_EVENTS.TYPING_UPDATE,
        {
            conversationId,
            userId: socket.user.id,
            username: socket.user.username,
            typing: false,
            timestamp: new Date().toISOString()
        }
    );
}


/* -------------------------------------------------------------------------- */
/* MESSAGE HANDLING                                                           */
/* -------------------------------------------------------------------------- */

async function handleMessageSend(
    io,
    socket,
    payload
) {

    try {

        if (!ensureObject(payload)) {

            emitSocketError(
                socket,
                'INVALID_MESSAGE',
                'Invalid message payload.'
            );

            return;
        }


        const conversationId =
            normalizeId(
                payload.conversationId
            );


        const content =
            safeString(
                payload.content,
                10000
            );


        if (!conversationId) {

            emitSocketError(
                socket,
                'MISSING_CONVERSATION',
                'Conversation ID is required.'
            );

            return;
        }


        if (!content) {

            emitSocketError(
                socket,
                'EMPTY_MESSAGE',
                'Message content cannot be empty.'
            );

            return;
        }


        /**
         * Message creation is delegated to the service layer.
         */
        const message =
            await createMessage({
                conversationId,
                senderId: socket.user.id,
                content,
                type:
                    safeString(
                        payload.type,
                        30
                    ) || 'text',

                replyTo:
                    normalizeId(
                        payload.replyTo
                    ),

                metadata:
                    ensureObject(
                        payload.metadata
                    )
                        ? payload.metadata
                        : {}
            });


        const eventPayload = {
            message,
            conversationId,
            sender: {
                id: socket.user.id,
                username: socket.user.username,
                displayName: socket.user.displayName
            },
            timestamp: new Date().toISOString()
        };


        io.to(
            getConversationRoom(
                conversationId
            )
        ).emit(
            SOCKET_EVENTS.MESSAGE_NEW,
            eventPayload
        );


        /**
         * Also notify recipient devices through their user room
         * when necessary.
         */
        const recipientUserIds =
            Array.isArray(
                message?.recipientUserIds
            )
                ? message.recipientUserIds
                : [];


        for (const recipientId of recipientUserIds) {

            if (
                String(recipientId) ===
                String(socket.user.id)
            ) {
                continue;
            }


            io.to(
                getUserRoom(
                    recipientId
                )
            ).emit(
                SOCKET_EVENTS.MESSAGE_NEW,
                eventPayload
            );
        }

    } catch (error) {

        console.error(
            '[NEXUS SOCKET] Message error:',
            error
        );


        socket.emit(
            SOCKET_EVENTS.MESSAGE_ERROR,
            {
                success: false,
                code: 'MESSAGE_SEND_FAILED',
                message:
                    'The message could not be sent.',
                timestamp:
                    new Date().toISOString()
            }
        );
    }
}


/* -------------------------------------------------------------------------- */
/* READ RECEIPTS                                                              */
/* -------------------------------------------------------------------------- */

async function handleMessageRead(
    io,
    socket,
    payload
) {

    if (!ensureObject(payload)) {
        return;
    }


    const conversationId =
        normalizeId(
            payload.conversationId
        );


    if (!conversationId) {
        return;
    }


    const messageIds =
        Array.isArray(
            payload.messageIds
        )
            ? payload.messageIds
                .map(normalizeId)
                .filter(Boolean)
                .slice(0, 100)
            : [];


    if (messageIds.length === 0) {
        return;
    }


    await markMessagesAsRead(
        socket.user.id,
        conversationId,
        messageIds
    );


    const event = {
        conversationId,
        messageIds,
        userId: socket.user.id,
        readAt: new Date().toISOString()
    };


    io.to(
        getConversationRoom(
            conversationId
        )
    ).emit(
        SOCKET_EVENTS.MESSAGE_READ_UPDATE,
        event
    );
}


/* -------------------------------------------------------------------------- */
/* MESSAGE REACTIONS                                                          */
/* -------------------------------------------------------------------------- */

async function handleReactionAdd(
    io,
    socket,
    payload
) {

    if (!ensureObject(payload)) {
        return;
    }


    const messageId =
        normalizeId(
            payload.messageId
        );


    const reaction =
        safeString(
            payload.reaction,
            30
        );


    if (
        !messageId ||
        !reaction
    ) {
        return;
    }


    const result =
        await addReaction(
            messageId,
            socket.user.id,
            reaction
        );


    if (!result) {
        return;
    }


    const conversationId =
        normalizeId(
            result.conversationId
        );


    if (!conversationId) {
        return;
    }


    io.to(
        getConversationRoom(
            conversationId
        )
    ).emit(
        SOCKET_EVENTS.MESSAGE_REACTION_UPDATE,
        {
            action: 'add',
            messageId,
            userId: socket.user.id,
            username: socket.user.username,
            reaction,
            conversationId,
            timestamp: new Date().toISOString()
        }
    );
}


async function handleReactionRemove(
    io,
    socket,
    payload
) {

    if (!ensureObject(payload)) {
        return;
    }


    const messageId =
        normalizeId(
            payload.messageId
        );


    const reaction =
        safeString(
            payload.reaction,
            30
        );


    if (
        !messageId ||
        !reaction
    ) {
        return;
    }


    const result =
        await removeReaction(
            messageId,
            socket.user.id,
            reaction
        );


    if (!result) {
        return;
    }


    const conversationId =
        normalizeId(
            result.conversationId
        );


    if (!conversationId) {
        return;
    }


    io.to(
        getConversationRoom(
            conversationId
        )
    ).emit(
        SOCKET_EVENTS.MESSAGE_REACTION_UPDATE,
        {
            action: 'remove',
            messageId,
            userId: socket.user.id,
            username: socket.user.username,
            reaction,
            conversationId,
            timestamp: new Date().toISOString()
        }
    );
}


/* -------------------------------------------------------------------------- */
/* SOCKET INITIALIZATION                                                      */
/* -------------------------------------------------------------------------- */

function initializeSockets(io) {

    if (!io) {

        throw new Error(
            'Socket.IO instance is required.'
        );
    }


    /**
     * Authentication middleware.
     */
    io.use(
        async (socket, next) => {

            try {

                const user =
                    await authenticateSocket(
                        socket
                    );


                socket.user = user;


                next();

            } catch (error) {

                console.error(
                    '[NEXUS SOCKET] Authentication failed:',
                    error.message
                );


                next(
                    new Error(
                        'Socket authentication failed.'
                    )
                );
            }
        }
    );


    /**
     * Main connection handler.
     */
    io.on(
        SOCKET_EVENTS.CONNECTION,
        async (socket) => {

            const user =
                socket.user;


            console.log(
                `[NEXUS SOCKET] Connected: ${user.username} (${socket.id})`
            );


            registerUserSocket(
                user.id,
                socket.id
            );


            /**
             * Every authenticated socket joins its personal room.
             */
            await socket.join(
                getUserRoom(
                    user.id
                )
            );


            /**
             * Initial online presence.
             */
            const wasAlreadyOnline =
                isUserOnline(
                    user.id
                );


            await updateUserPresence(
                user.id,
                {
                    status: 'online'
                }
            );


            if (!wasAlreadyOnline) {

                io.emit(
                    SOCKET_EVENTS.PRESENCE_CHANGED,
                    {
                        userId: user.id,
                        username: user.username,
                        status: 'online',
                        online: true,
                        timestamp:
                            new Date().toISOString()
                    }
                );
            }


            socket.emit(
                SOCKET_EVENTS.SYSTEM_READY,
                {
                    success: true,
                    user: {
                        id: user.id,
                        username: user.username,
                        displayName:
                            user.displayName
                    },
                    timestamp:
                        new Date().toISOString()
                }
            );


            /* ------------------------------------------------------------------ */
            /* CONVERSATION EVENTS                                               */
            /* ------------------------------------------------------------------ */

            socket.on(
                SOCKET_EVENTS.CONVERSATION_JOIN,
                async (payload) => {

                    try {

                        const conversationId =
                            ensureObject(payload)
                                ? payload.conversationId
                                : payload;


                        await joinConversation(
                            socket,
                            conversationId
                        );

                    } catch (error) {

                        console.error(
                            '[NEXUS SOCKET] Join conversation error:',
                            error
                        );


                        emitSocketError(
                            socket,
                            'CONVERSATION_JOIN_FAILED',
                            'Unable to join conversation.'
                        );
                    }
                }
            );


            socket.on(
                SOCKET_EVENTS.CONVERSATION_LEAVE,
                async (payload) => {

                    try {

                        const conversationId =
                            ensureObject(payload)
                                ? payload.conversationId
                                : payload;


                        await leaveConversation(
                            socket,
                            conversationId
                        );

                    } catch (error) {

                        console.error(
                            '[NEXUS SOCKET] Leave conversation error:',
                            error
                        );
                    }
                }
            );


            /* ------------------------------------------------------------------ */
            /* MESSAGES                                                           */
            /* ------------------------------------------------------------------ */

            socket.on(
                SOCKET_EVENTS.MESSAGE_SEND,
                async (payload) => {

                    await handleMessageSend(
                        io,
                        socket,
                        payload
                    );
                }
            );


            /* ------------------------------------------------------------------ */
            /* TYPING                                                            */
            /* ------------------------------------------------------------------ */

            socket.on(
                SOCKET_EVENTS.TYPING_START,
                async (payload) => {

                    await handleTypingStart(
                        io,
                        socket,
                        payload
                    );
                }
            );


            socket.on(
                SOCKET_EVENTS.TYPING_STOP,
                async (payload) => {

                    await handleTypingStop(
                        io,
                        socket,
                        payload
                    );
                }
            );


            /* ------------------------------------------------------------------ */
            /* READ RECEIPTS                                                      */
            /* ------------------------------------------------------------------ */

            socket.on(
                SOCKET_EVENTS.MESSAGE_READ,
                async (payload) => {

                    try {

                        await handleMessageRead(
                            io,
                            socket,
                            payload
                        );

                    } catch (error) {

                        console.error(
                            '[NEXUS SOCKET] Read receipt error:',
                            error
                        );
                    }
                }
            );


            /* ------------------------------------------------------------------ */
            /* REACTIONS                                                          */
            /* ------------------------------------------------------------------ */

            socket.on(
                SOCKET_EVENTS.MESSAGE_REACTION_ADD,
                async (payload) => {

                    try {

                        await handleReactionAdd(
                            io,
                            socket,
                            payload
                        );

                    } catch (error) {

                        console.error(
                            '[NEXUS SOCKET] Reaction add error:',
                            error
                        );
                    }
                }
            );


            socket.on(
                SOCKET_EVENTS.MESSAGE_REACTION_REMOVE,
                async (payload) => {

                    try {

                        await handleReactionRemove(
                            io,
                            socket,
                            payload
                        );

                    } catch (error) {

                        console.error(
                            '[NEXUS SOCKET] Reaction remove error:',
                            error
                        );
                    }
                }
            );


            /* ------------------------------------------------------------------ */
            /* PRESENCE                                                           */
            /* ------------------------------------------------------------------ */

            socket.on(
                SOCKET_EVENTS.PRESENCE_UPDATE,
                async (payload) => {

                    try {

                        await handlePresenceUpdate(
                            io,
                            socket,
                            payload
                        );

                    } catch (error) {

                        console.error(
                            '[NEXUS SOCKET] Presence error:',
                            error
                        );
                    }
                }
            );


            /* ------------------------------------------------------------------ */
            /* DISCONNECT                                                         */
            /* ------------------------------------------------------------------ */

            socket.on(
                SOCKET_EVENTS.DISCONNECT,
                async (reason) => {

                    console.log(
                        `[NEXUS SOCKET] Disconnected: ${user.username} (${reason})`
                    );


                    clearTypingForUser(
                        user.id
                    );


                    const result =
                        unregisterUserSocket(
                            socket.id
                        );


                    if (
                        result &&
                        result.becameOffline
                    ) {

                        try {

                            await updateUserPresence(
                                user.id,
                                {
                                    status: 'offline'
                                }
                            );

                        } catch (error) {

                            console.error(
                                '[NEXUS SOCKET] Presence cleanup error:',
                                error
                            );
                        }


                        io.emit(
                            SOCKET_EVENTS.PRESENCE_CHANGED,
                            {
                                userId: user.id,
                                username: user.username,
                                status: 'offline',
                                online: false,
                                timestamp:
                                    new Date().toISOString()
                            }
                        );
                    }
                }
            );
        }
    );


    console.log(
        '[NEXUS SOCKET] Real-time communication layer initialized.'
    );


    return io;
}


/* -------------------------------------------------------------------------- */
/* PUBLIC API                                                                 */
/* -------------------------------------------------------------------------- */

module.exports = {
    initializeSockets,

    SOCKET_EVENTS,

    isUserOnline,

    getUserRoom,

    getConversationRoom,

    getCommunityRoom
};
