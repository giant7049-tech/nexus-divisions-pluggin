'use strict';

/**
 * ================================================================
 * NEXUS CONNECT — DATABASE MODELS
 * ================================================================
 *
 * Architecture:
 *   Node.js + Express + MongoDB + Mongoose + Socket.IO
 *
 * Purpose:
 *   Centralized, production-grade MongoDB schemas for Nexus Connect.
 *
 * Design principles:
 *   - Secure-by-default
 *   - Scalable indexes
 *   - No plaintext PIN storage
 *   - Username-based public identity
 *   - UUID-style public identifiers
 *   - Soft deletion where appropriate
 *   - Audit-friendly timestamps
 *   - Phase-ready architecture
 *   - Mobile-first application support
 *   - Future AI / business / community support
 *
 * IMPORTANT:
 *   Authentication secrets must be hashed by the service layer.
 *   This file NEVER stores a raw PIN.
 *
 * ================================================================
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

const { Schema } = mongoose;

/* ================================================================
 * GLOBAL HELPERS
 * ================================================================ */

/**
 * Generates a cryptographically strong public identifier.
 *
 * MongoDB's internal _id remains private.
 * Public application references should use publicId.
 */
function generatePublicId(prefix) {
    return `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * Normalize email addresses.
 */
function normalizeEmail(value) {
    if (!value) return value;
    return value.trim().toLowerCase();
}

/**
 * Normalize usernames.
 */
function normalizeUsername(value) {
    if (!value) return value;

    return value
        .trim()
        .toLowerCase()
        .replace(/^@/, '');
}

/**
 * Common schema options.
 */
const commonSchemaOptions = {
    timestamps: true,
    versionKey: false,
    minimize: true,
    strict: true
};


/* ================================================================
 * 1. USER
 * ================================================================
 *
 * Represents a Nexus Connect account.
 *
 * Authentication:
 *   email + username + 4-digit PIN
 *
 * Public identity:
 *   @username
 *
 * IMPORTANT:
 *   pinHash is NEVER exposed through normal queries.
 * ================================================================ */

const userSchema = new Schema(
    {
        publicId: {
            type: String,
            unique: true,
            index: true,
            default: () => generatePublicId('usr')
        },

        email: {
            type: String,
            required: true,
            unique: true,
            index: true,
            lowercase: true,
            trim: true,
            maxlength: 254
        },

        username: {
            type: String,
            required: true,
            unique: true,
            index: true,
            lowercase: true,
            trim: true,
            minlength: 3,
            maxlength: 30,
            match: /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/
        },

        displayName: {
            type: String,
            required: true,
            trim: true,
            minlength: 1,
            maxlength: 80
        },

        bio: {
            type: String,
            default: '',
            trim: true,
            maxlength: 500
        },

        profilePhoto: {
            type: String,
            default: null,
            trim: true
        },

        coverPhoto: {
            type: String,
            default: null,
            trim: true
        },

        pinHash: {
            type: String,
            required: true,
            select: false
        },

        role: {
            type: String,
            enum: [
                'user',
                'business',
                'moderator',
                'admin',
                'superadmin'
            ],
            default: 'user',
            index: true
        },

        accountStatus: {
            type: String,
            enum: [
                'pending',
                'active',
                'suspended',
                'disabled',
                'deleted'
            ],
            default: 'active',
            index: true
        },

        emailVerified: {
            type: Boolean,
            default: false
        },

        presence: {
            status: {
                type: String,
                enum: [
                    'online',
                    'away',
                    'dnd',
                    'offline'
                ],
                default: 'offline'
            },

            customStatus: {
                type: String,
                default: '',
                maxlength: 100
            },

            lastSeenAt: {
                type: Date,
                default: null
            }
        },

        privacy: {
            whoCanMessage: {
                type: String,
                enum: [
                    'everyone',
                    'connections',
                    'nobody'
                ],
                default: 'everyone'
            },

            whoCanSeeOnlineStatus: {
                type: String,
                enum: [
                    'everyone',
                    'connections',
                    'nobody'
                ],
                default: 'everyone'
            },

            whoCanSeeProfile: {
                type: String,
                enum: [
                    'everyone',
                    'connections',
                    'nobody'
                ],
                default: 'everyone'
            },

            whoCanAddToGroups: {
                type: String,
                enum: [
                    'everyone',
                    'connections',
                    'nobody'
                ],
                default: 'connections'
            },

            whoCanSendInvitations: {
                type: String,
                enum: [
                    'everyone',
                    'connections',
                    'nobody'
                ],
                default: 'everyone'
            }
        },

        security: {
            failedPinAttempts: {
                type: Number,
                default: 0,
                min: 0
            },

            lockedUntil: {
                type: Date,
                default: null
            },

            lastLoginAt: {
                type: Date,
                default: null
            },

            lastLoginIpHash: {
                type: String,
                default: null,
                select: false
            }
        },

        preferences: {
            theme: {
                type: String,
                enum: [
                    'light',
                    'dark',
                    'system'
                ],
                default: 'system'
            },

            language: {
                type: String,
                default: 'en',
                maxlength: 10
            },

            notificationsEnabled: {
                type: Boolean,
                default: true
            }
        },

        deletedAt: {
            type: Date,
            default: null,
            index: true
        }
    },
    commonSchemaOptions
);


/* ================================================================
 * USER INDEXES
 * ================================================================ */

userSchema.index({
    username: 1
});

userSchema.index({
    email: 1
});

userSchema.index({
    accountStatus: 1,
    createdAt: -1
});

userSchema.index({
    'presence.status': 1,
    'presence.lastSeenAt': -1
});


/* ================================================================
 * 2. SESSION
 * ================================================================
 *
 * Persistent authentication sessions.
 *
 * The client receives a secure session token.
 * Only a hash of that token should be stored here.
 * ================================================================ */

const sessionSchema = new Schema(
    {
        publicId: {
            type: String,
            unique: true,
            index: true,
            default: () => generatePublicId('ses')
        },

        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },

        tokenHash: {
            type: String,
            required: true,
            unique: true,
            select: false
        },

        deviceName: {
            type: String,
            default: 'Unknown device',
            maxlength: 120
        },

        platform: {
            type: String,
            default: 'unknown',
            maxlength: 50
        },

        browser: {
            type: String,
            default: 'unknown',
            maxlength: 100
        },

        ipHash: {
            type: String,
            default: null,
            select: false
        },

        userAgentHash: {
            type: String,
            default: null,
            select: false
        },

        lastActiveAt: {
            type: Date,
            default: Date.now,
            index: true
        },

        expiresAt: {
            type: Date,
            required: true,
            index: true
        },

        revokedAt: {
            type: Date,
            default: null,
            index: true
        }
    },
    commonSchemaOptions
);

sessionSchema.index({
    expiresAt: 1
}, {
    expireAfterSeconds: 0
});

sessionSchema.index({
    userId: 1,
    revokedAt: 1,
    expiresAt: 1
});


/* ================================================================
 * 3. CONNECTION
 * ================================================================
 *
 * Social graph between users.
 *
 * Status:
 *   pending
 *   accepted
 *   declined
 *   blocked
 * ================================================================ */

const connectionSchema = new Schema(
    {
        publicId: {
            type: String,
            unique: true,
            index: true,
            default: () => generatePublicId('con')
        },

        requesterId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },

        recipientId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },

        status: {
            type: String,
            enum: [
                'pending',
                'accepted',
                'declined',
                'blocked'
            ],
            default: 'pending',
            index: true
        },

        respondedAt: {
            type: Date,
            default: null
        },

        blockedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            default: null
        }
    },
    commonSchemaOptions
);

connectionSchema.index({
    requesterId: 1,
    recipientId: 1
}, {
    unique: true
});

connectionSchema.index({
    recipientId: 1,
    status: 1,
    createdAt: -1
});

connectionSchema.index({
    requesterId: 1,
    status: 1,
    createdAt: -1
});


/* ================================================================
 * 4. CONVERSATION
 * ================================================================
 *
 * Supports:
 *   - private conversations
 *   - groups
 *   - future community conversations
 * ================================================================ */

const conversationSchema = new Schema(
    {
        publicId: {
            type: String,
            unique: true,
            index: true,
            default: () => generatePublicId('cv')
        },

        type: {
            type: String,
            enum: [
                'direct',
                'group',
                'community'
            ],
            default: 'direct',
            index: true
        },

        name: {
            type: String,
            default: '',
            trim: true,
            maxlength: 120
        },

        description: {
            type: String,
            default: '',
            trim: true,
            maxlength: 500
        },

        avatar: {
            type: String,
            default: null
        },

        ownerId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            default: null,
            index: true
        },

        lastMessageId: {
            type: Schema.Types.ObjectId,
            ref: 'Message',
            default: null
        },

        lastActivityAt: {
            type: Date,
            default: Date.now,
            index: true
        },

        archived: {
            type: Boolean,
            default: false
        },

        deletedAt: {
            type: Date,
            default: null
        }
    },
    commonSchemaOptions
);

conversationSchema.index({
    lastActivityAt: -1
});

conversationSchema.index({
    ownerId: 1,
    lastActivityAt: -1
});


/* ================================================================
 * 5. CONVERSATION MEMBER
 * ================================================================
 *
 * Separate membership collection allows conversations to scale
 * without placing unlimited members inside one document.
 * ================================================================ */

const conversationMemberSchema = new Schema(
    {
        publicId: {
            type: String,
            unique: true,
            index: true,
            default: () => generatePublicId('mem')
        },

        conversationId: {
            type: Schema.Types.ObjectId,
            ref: 'Conversation',
            required: true,
            index: true
        },

        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },

        role: {
            type: String,
            enum: [
                'member',
                'moderator',
                'admin',
                'owner'
            ],
            default: 'member'
        },

        joinedAt: {
            type: Date,
            default: Date.now
        },

        leftAt: {
            type: Date,
            default: null
        },

        mutedUntil: {
            type: Date,
            default: null
        },

        lastReadMessageId: {
            type: Schema.Types.ObjectId,
            ref: 'Message',
            default: null
        },

        unreadCount: {
            type: Number,
            default: 0,
            min: 0
        }
    },
    commonSchemaOptions
);

conversationMemberSchema.index({
    conversationId: 1,
    userId: 1
}, {
    unique: true
});

conversationMemberSchema.index({
    userId: 1,
    joinedAt: -1
});


/* ================================================================
 * 6. MESSAGE
 * ================================================================
 *
 * Core communication object.
 *
 * Supports:
 *   text
 *   image
 *   video
 *   audio
 *   document
 *   link
 *   system
 *
 * Future:
 *   AI-generated suggestions
 *   translation
 *   message actions
 * ================================================================ */

const messageSchema = new Schema(
    {
        publicId: {
            type: String,
            unique: true,
            index: true,
            default: () => generatePublicId('msg')
        },

        conversationId: {
            type: Schema.Types.ObjectId,
            ref: 'Conversation',
            required: true,
            index: true
        },

        senderId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },

        type: {
            type: String,
            enum: [
                'text',
                'image',
                'video',
                'audio',
                'document',
                'link',
                'system'
            ],
            default: 'text',
            index: true
        },

        text: {
            type: String,
            default: '',
            maxlength: 10000
        },

        replyToMessageId: {
            type: Schema.Types.ObjectId,
            ref: 'Message',
            default: null
        },

        forwardedFromMessageId: {
            type: Schema.Types.ObjectId,
            ref: 'Message',
            default: null
        },

        attachmentIds: [{
            type: Schema.Types.ObjectId,
            ref: 'Media'
        }],

        mentions: [{
            type: Schema.Types.ObjectId,
            ref: 'User'
        }],

        reactions: [{
            userId: {
                type: Schema.Types.ObjectId,
                ref: 'User',
                required: true
            },

            emoji: {
                type: String,
                required: true,
                maxlength: 20
            },

            reactedAt: {
                type: Date,
                default: Date.now
            }
        }],

        status: {
            type: String,
            enum: [
                'sent',
                'delivered',
                'read',
                'failed'
            ],
            default: 'sent',
            index: true
        },

        editedAt: {
            type: Date,
            default: null
        },

        deletedAt: {
            type: Date,
            default: null
        },

        pinned: {
            type: Boolean,
            default: false,
            index: true
        },

        savedBy: [{
            type: Schema.Types.ObjectId,
            ref: 'User'
        }]
    },
    commonSchemaOptions
);

messageSchema.index({
    conversationId: 1,
    createdAt: -1
});

messageSchema.index({
    senderId: 1,
    createdAt: -1
});

messageSchema.index({
    conversationId: 1,
    pinned: 1,
    createdAt: -1
});


/* ================================================================
 * 7. MEDIA
 * ================================================================
 *
 * Metadata only.
 *
 * Actual files should live in a proper object/media service
 * such as Cloudinary or another storage provider.
 *
 * MongoDB stores metadata and ownership.
 * ================================================================ */

const mediaSchema = new Schema(
    {
        publicId: {
            type: String,
            unique: true,
            index: true,
            default: () => generatePublicId('med')
        },

        ownerId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },

        type: {
            type: String,
            enum: [
                'image',
                'video',
                'audio',
                'document',
                'other'
            ],
            required: true,
            index: true
        },

        originalName: {
            type: String,
            default: '',
            maxlength: 255
        },

        mimeType: {
            type: String,
            default: '',
            maxlength: 120
        },

        size: {
            type: Number,
            default: 0,
            min: 0
        },

        url: {
            type: String,
            required: true
        },

        thumbnailUrl: {
            type: String,
            default: null
        },

        storageProvider: {
            type: String,
            default: 'cloudinary'
        },

        storageKey: {
            type: String,
            default: null
        },

        duration: {
            type: Number,
            default: null,
            min: 0
        },

        deletedAt: {
            type: Date,
            default: null
        }
    },
    commonSchemaOptions
);

mediaSchema.index({
    ownerId: 1,
    createdAt: -1
});

mediaSchema.index({
    type: 1,
    createdAt: -1
});


/* ================================================================
 * 8. GROUP
 * ================================================================
 *
 * Group-level metadata.
 *
 * Membership is handled through ConversationMember.
 * ================================================================ */

const groupSchema = new Schema(
    {
        publicId: {
            type: String,
            unique: true,
            index: true,
            default: () => generatePublicId('grp')
        },

        conversationId: {
            type: Schema.Types.ObjectId,
            ref: 'Conversation',
            required: true,
            unique: true,
            index: true
        },

        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 1,
            maxlength: 120
        },

        description: {
            type: String,
            default: '',
            maxlength: 500
        },

        privacy: {
            type: String,
            enum: [
                'private',
                'public'
            ],
            default: 'private',
            index: true
        },

        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        }
    },
    commonSchemaOptions
);


/* ================================================================
 * 9. COMMUNITY
 * ================================================================
 *
 * Larger structured spaces.
 *
 * Example:
 *
 * Nexus Business Network
 *   ├── General
 *   ├── Announcements
 *   ├── Marketing
 *   ├── Opportunities
 *   ├── Questions
 *   └── Resources
 * ================================================================ */

const communitySchema = new Schema(
    {
        publicId: {
            type: String,
            unique: true,
            index: true,
            default: () => generatePublicId('com')
        },

        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 150
        },

        description: {
            type: String,
            default: '',
            maxlength: 1000
        },

        avatar: {
            type: String,
            default: null
        },

        ownerId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },

        privacy: {
            type: String,
            enum: [
                'private',
                'public'
            ],
            default: 'public',
            index: true
        },

        verified: {
            type: Boolean,
            default: false
        },

        deletedAt: {
            type: Date,
            default: null
        }
    },
    commonSchemaOptions
);

communitySchema.index({
    privacy: 1,
    createdAt: -1
});


/* ================================================================
 * 10. COMMUNITY MEMBER
 * ================================================================ */

const communityMemberSchema = new Schema(
    {
        publicId: {
            type: String,
            unique: true,
            index: true,
            default: () => generatePublicId('cmb')
        },

        communityId: {
            type: Schema.Types.ObjectId,
            ref: 'Community',
            required: true,
            index: true
        },

        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },

        role: {
            type: String,
            enum: [
                'member',
                'moderator',
                'admin',
                'owner'
            ],
            default: 'member'
        },

        joinedAt: {
            type: Date,
            default: Date.now
        }
    },
    commonSchemaOptions
);

communityMemberSchema.index({
    communityId: 1,
    userId: 1
}, {
    unique: true
});


/* ================================================================
 * 11. NOTIFICATION
 * ================================================================ */

const notificationSchema = new Schema(
    {
        publicId: {
            type: String,
            unique: true,
            index: true,
            default: () => generatePublicId('not')
        },

        recipientId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },

        actorId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },

        type: {
            type: String,
            enum: [
                'message',
                'connection_request',
                'connection_accepted',
                'reaction',
                'mention',
                'group_invitation',
                'community_invitation',
                'system'
            ],
            required: true,
            index: true
        },

        title: {
            type: String,
            required: true,
            maxlength: 200
        },

        body: {
            type: String,
            default: '',
            maxlength: 500
        },

        entityType: {
            type: String,
            default: null
        },

        entityId: {
            type: Schema.Types.ObjectId,
            default: null
        },

        readAt: {
            type: Date,
            default: null,
            index: true
        }
    },
    commonSchemaOptions
);

notificationSchema.index({
    recipientId: 1,
    readAt: 1,
    createdAt: -1
});


/* ================================================================
 * 12. ACTIVITY
 * ================================================================
 *
 * Separate from notifications.
 *
 * Activity answers:
 * "What has happened in my network?"
 * ================================================================ */

const activitySchema = new Schema(
    {
        publicId: {
            type: String,
            unique: true,
            index: true,
            default: () => generatePublicId('act')
        },

        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },

        type: {
            type: String,
            enum: [
                'message_sent',
                'connection_created',
                'group_joined',
                'group_created',
                'file_shared',
                'community_joined',
                'profile_updated',
                'status_updated',
                'system'
            ],
            required: true,
            index: true
        },

        entityType: {
            type: String,
            default: null
        },

        entityId: {
            type: Schema.Types.ObjectId,
            default: null
        },

        metadata: {
            type: Schema.Types.Mixed,
            default: {}
        }
    },
    commonSchemaOptions
);

activitySchema.index({
    userId: 1,
    createdAt: -1
});


/* ================================================================
 * 13. SAVED ITEM
 * ================================================================
 *
 * Allows users to save:
 *   messages
 *   files
 *   links
 *   media
 *   notes
 * ================================================================ */

const savedItemSchema = new Schema(
    {
        publicId: {
            type: String,
            unique: true,
            index: true,
            default: () => generatePublicId('sav')
        },

        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },

        itemType: {
            type: String,
            enum: [
                'message',
                'media',
                'link',
                'note'
            ],
            required: true,
            index: true
        },

        itemId: {
            type: Schema.Types.ObjectId,
            required: true,
            index: true
        },

        note: {
            type: String,
            default: '',
            maxlength: 500
        }
    },
    commonSchemaOptions
);

savedItemSchema.index({
    userId: 1,
    itemType: 1,
    itemId: 1
}, {
    unique: true
});


/* ================================================================
 * 14. INVITATION
 * ================================================================
 *
 * Used for:
 *   user invitations
 *   group invitations
 *   community invitations
 *
 * Public URLs can eventually look like:
 *
 * /connect/invite/xxxxxxxx
 * ================================================================ */

const invitationSchema = new Schema(
    {
        publicId: {
            type: String,
            unique: true,
            index: true,
            default: () => generatePublicId('inv')
        },

        tokenHash: {
            type: String,
            required: true,
            unique: true,
            select: false
        },

        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },

        targetType: {
            type: String,
            enum: [
                'user',
                'group',
                'community'
            ],
            required: true
        },

        targetId: {
            type: Schema.Types.ObjectId,
            required: true,
            index: true
        },

        maxUses: {
            type: Number,
            default: null,
            min: 1
        },

        uses: {
            type: Number,
            default: 0,
            min: 0
        },

        expiresAt: {
            type: Date,
            default: null,
            index: true
        },

        revokedAt: {
            type: Date,
            default: null,
            index: true
        }
    },
    commonSchemaOptions
);

invitationSchema.index({
    expiresAt: 1
}, {
    expireAfterSeconds: 0,
    partialFilterExpression: {
        expiresAt: {
            $type: 'date'
        }
    }
});


/* ================================================================
 * 15. USER STATUS
 * ================================================================
 *
 * Optional story/status system.
 *
 * Designed for future 24-hour status functionality.
 * ================================================================ */

const userStatusSchema = new Schema(
    {
        publicId: {
            type: String,
            unique: true,
            index: true,
            default: () => generatePublicId('sts')
        },

        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },

        type: {
            type: String,
            enum: [
                'text',
                'image',
                'video'
            ],
            required: true
        },

        text: {
            type: String,
            default: '',
            maxlength: 500
        },

        mediaId: {
            type: Schema.Types.ObjectId,
            ref: 'Media',
            default: null
        },

        expiresAt: {
            type: Date,
            required: true,
            index: true
        }
    },
    commonSchemaOptions
);

userStatusSchema.index({
    expiresAt: 1
}, {
    expireAfterSeconds: 0
});

userStatusSchema.index({
    userId: 1,
    createdAt: -1
});


/* ================================================================
 * 16. BLOCKED USER
 * ================================================================ */

const blockedUserSchema = new Schema(
    {
        blockerId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },

        blockedId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        }
    },
    commonSchemaOptions
);

blockedUserSchema.index({
    blockerId: 1,
    blockedId: 1
}, {
    unique: true
});


/* ================================================================
 * 17. DEVICE
 * ================================================================
 *
 * Used by Security Center.
 *
 * Examples:
 *   Chrome — Windows
 *   Android
 *   iPhone
 * ================================================================ */

const deviceSchema = new Schema(
    {
        publicId: {
            type: String,
            unique: true,
            index: true,
            default: () => generatePublicId('dev')
        },

        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },

        deviceName: {
            type: String,
            default: 'Unknown device',
            maxlength: 120
        },

        platform: {
            type: String,
            default: 'unknown',
            maxlength: 50
        },

        browser: {
            type: String,
            default: 'unknown',
            maxlength: 100
        },

        lastActiveAt: {
            type: Date,
            default: Date.now,
            index: true
        },

        firstSeenAt: {
            type: Date,
            default: Date.now
        },

        trusted: {
            type: Boolean,
            default: false
        },

        revokedAt: {
            type: Date,
            default: null
        }
    },
    commonSchemaOptions
);

deviceSchema.index({
    userId: 1,
    lastActiveAt: -1
});


/* ================================================================
 * 18. AI CONVERSATION MEMORY
 * ================================================================
 *
 * Future-ready structure for Nexus AI.
 *
 * We intentionally keep AI data separate from normal messages.
 * This allows AI features to evolve without corrupting the
 * communication model.
 * ================================================================ */

const aiMemorySchema = new Schema(
    {
        publicId: {
            type: String,
            unique: true,
            index: true,
            default: () => generatePublicId('aim')
        },

        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },

        conversationId: {
            type: Schema.Types.ObjectId,
            ref: 'Conversation',
            default: null,
            index: true
        },

        type: {
            type: String,
            enum: [
                'summary',
                'preference',
                'task',
                'context'
            ],
            required: true
        },

        content: {
            type: String,
            required: true,
            maxlength: 10000
        },

        expiresAt: {
            type: Date,
            default: null,
            index: true
        }
    },
    commonSchemaOptions
);

aiMemorySchema.index({
    userId: 1,
    conversationId: 1,
    createdAt: -1
});


/* ================================================================
 * MODEL REGISTRATION
 * ================================================================ */

const User =
    mongoose.models.User ||
    mongoose.model('User', userSchema);

const Session =
    mongoose.models.Session ||
    mongoose.model('Session', sessionSchema);

const Connection =
    mongoose.models.Connection ||
    mongoose.model('Connection', connectionSchema);

const Conversation =
    mongoose.models.Conversation ||
    mongoose.model('Conversation', conversationSchema);

const ConversationMember =
    mongoose.models.ConversationMember ||
    mongoose.model('ConversationMember', conversationMemberSchema);

const Message =
    mongoose.models.Message ||
    mongoose.model('Message', messageSchema);

const Media =
    mongoose.models.Media ||
    mongoose.model('Media', mediaSchema);

const Group =
    mongoose.models.Group ||
    mongoose.model('Group', groupSchema);

const Community =
    mongoose.models.Community ||
    mongoose.model('Community', communitySchema);

const CommunityMember =
    mongoose.models.CommunityMember ||
    mongoose.model('CommunityMember', communityMemberSchema);

const Notification =
    mongoose.models.Notification ||
    mongoose.model('Notification', notificationSchema);

const Activity =
    mongoose.models.Activity ||
    mongoose.model('Activity', activitySchema);

const SavedItem =
    mongoose.models.SavedItem ||
    mongoose.model('SavedItem', savedItemSchema);

const Invitation =
    mongoose.models.Invitation ||
    mongoose.model('Invitation', invitationSchema);

const UserStatus =
    mongoose.models.UserStatus ||
    mongoose.model('UserStatus', userStatusSchema);

const BlockedUser =
    mongoose.models.BlockedUser ||
    mongoose.model('BlockedUser', blockedUserSchema);

const Device =
    mongoose.models.Device ||
    mongoose.model('Device', deviceSchema);

const AiMemory =
    mongoose.models.AiMemory ||
    mongoose.model('AiMemory', aiMemorySchema);


/* ================================================================
 * EXPORTS
 * ================================================================ */

module.exports = {
    User,
    Session,
    Connection,
    Conversation,
    ConversationMember,
    Message,
    Media,
    Group,
    Community,
    CommunityMember,
    Notification,
    Activity,
    SavedItem,
    Invitation,
    UserStatus,
    BlockedUser,
    Device,
    AiMemory
};
