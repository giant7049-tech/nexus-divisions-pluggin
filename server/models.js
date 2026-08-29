/**
 * NEXUS OS
 * server/models.js
 *
 * Production data models and persistence layer.
 *
 * Responsibilities:
 * - Define persistent MongoDB/Mongoose models
 * - Enforce schema-level data integrity
 * - Define indexes for high-value query paths
 * - Support authentication and identity
 * - Support organizations and professional profiles
 * - Support advertisements and marketplace discovery
 * - Support plans, payments and transaction ledger
 * - Support conversations, messages and read receipts
 * - Support notifications
 * - Support analytics events
 * - Support immutable audit records
 *
 * Architecture:
 *
 * services.js
 *      ↓
 * models.js
 *      ↓
 * MongoDB
 *
 * No business workflows should be hidden inside this file.
 * Business rules belong in server/services.js.
 */

import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

/* -------------------------------------------------------------------------- */
/* CONSTANTS                                                                  */
/* -------------------------------------------------------------------------- */

export const USER_ROLES = Object.freeze([
  "user",
  "professional",
  "business",
  "moderator",
  "admin",
  "super_admin",
]);

export const USER_STATUS = Object.freeze([
  "pending",
  "active",
  "suspended",
  "disabled",
  "deleted",
]);

export const ORGANIZATION_TYPES = Object.freeze([
  "company",
  "business",
  "contractor",
  "developer",
  "agency",
  "ngo",
  "government",
  "other",
]);

export const ADVERTISEMENT_STATUS = Object.freeze([
  "draft",
  "pending_review",
  "active",
  "paused",
  "expired",
  "rejected",
  "archived",
]);

export const PAYMENT_STATUS = Object.freeze([
  "pending",
  "processing",
  "successful",
  "failed",
  "cancelled",
  "refunded",
  "partially_refunded",
]);

export const MESSAGE_TYPES = Object.freeze([
  "text",
  "image",
  "file",
  "system",
]);

export const NOTIFICATION_TYPES = Object.freeze([
  "system",
  "message",
  "connection",
  "advertisement",
  "payment",
  "project",
  "job",
  "security",
]);

/* -------------------------------------------------------------------------- */
/* SHARED SCHEMAS                                                             */
/* -------------------------------------------------------------------------- */

const timestamps = {
  createdAt: true,
  updatedAt: true,
};

const AddressSchema = new Schema(
  {
    country: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    state: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    city: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    addressLine1: {
      type: String,
      trim: true,
      maxlength: 300,
    },

    addressLine2: {
      type: String,
      trim: true,
      maxlength: 300,
    },

    postalCode: {
      type: String,
      trim: true,
      maxlength: 30,
    },

    latitude: {
      type: Number,
      min: -90,
      max: 90,
    },

    longitude: {
      type: Number,
      min: -180,
      max: 180,
    },
  },
  {
    _id: false,
  },
);

const MediaSchema = new Schema(
  {
    provider: {
      type: String,
      enum: ["cloudinary", "external", "local"],
      required: true,
    },

    publicId: {
      type: String,
      trim: true,
    },

    url: {
      type: String,
      trim: true,
      maxlength: 2048,
    },

    secureUrl: {
      type: String,
      trim: true,
      maxlength: 2048,
    },

    resourceType: {
      type: String,
      enum: ["image", "video", "raw", "file"],
      default: "image",
    },

    mimeType: {
      type: String,
      trim: true,
      maxlength: 150,
    },

    width: Number,

    height: Number,

    sizeBytes: {
      type: Number,
      min: 0,
    },
  },
  {
    _id: false,
  },
);

/* -------------------------------------------------------------------------- */
/* USER / IDENTITY                                                             */
/* -------------------------------------------------------------------------- */

const UserSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 320,
      index: true,
    },

    phone: {
      type: String,
      trim: true,
      maxlength: 40,
      sparse: true,
      index: true,
    },

    username: {
      type: String,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 50,
      sparse: true,
      index: true,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      enum: USER_ROLES,
      default: "user",
      index: true,
    },

    status: {
      type: String,
      enum: USER_STATUS,
      default: "pending",
      index: true,
    },

    emailVerifiedAt: {
      type: Date,
      default: null,
    },

    phoneVerifiedAt: {
      type: Date,
      default: null,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    lastSeenAt: {
      type: Date,
      default: null,
      index: true,
    },

    avatar: {
      type: MediaSchema,
      default: null,
    },

    profile: {
      firstName: {
        type: String,
        trim: true,
        maxlength: 100,
      },

      lastName: {
        type: String,
        trim: true,
        maxlength: 100,
      },

      displayName: {
        type: String,
        trim: true,
        maxlength: 160,
      },

      bio: {
        type: String,
        trim: true,
        maxlength: 2000,
      },

      profession: {
        type: String,
        trim: true,
        maxlength: 150,
      },

      companyName: {
        type: String,
        trim: true,
        maxlength: 200,
      },

      website: {
        type: String,
        trim: true,
        maxlength: 2048,
      },

      location: {
        type: AddressSchema,
        default: null,
      },
    },

    organizationIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Organization",
      },
    ],

    permissions: {
      type: [String],
      default: [],
    },

    security: {
      failedLoginAttempts: {
        type: Number,
        default: 0,
        min: 0,
      },

      lockedUntil: {
        type: Date,
        default: null,
      },

      passwordChangedAt: {
        type: Date,
        default: null,
      },

      tokenVersion: {
        type: Number,
        default: 0,
        min: 0,
      },

      mfaEnabled: {
        type: Boolean,
        default: false,
      },
    },

    preferences: {
      emailNotifications: {
        type: Boolean,
        default: true,
      },

      pushNotifications: {
        type: Boolean,
        default: true,
      },

      marketingNotifications: {
        type: Boolean,
        default: false,
      },

      language: {
        type: String,
        default: "en",
        maxlength: 10,
      },

      timezone: {
        type: String,
        default: "Africa/Lagos",
        maxlength: 100,
      },
    },

    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps,
    versionKey: false,
  },
);

UserSchema.index({
  "profile.displayName": "text",
  "profile.profession": "text",
  "profile.companyName": "text",
});

UserSchema.index({
  status: 1,
  role: 1,
  createdAt: -1,
});

/* -------------------------------------------------------------------------- */
/* PROFESSIONAL PROFILE                                                        */
/* -------------------------------------------------------------------------- */

const ProfessionalProfileSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    headline: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    professionalSummary: {
      type: String,
      trim: true,
      maxlength: 5000,
    },

    specialties: {
      type: [String],
      default: [],
      index: true,
    },

    skills: {
      type: [String],
      default: [],
      index: true,
    },

    certifications: [
      {
        name: {
          type: String,
          required: true,
          trim: true,
          maxlength: 200,
        },

        issuer: {
          type: String,
          trim: true,
          maxlength: 200,
        },

        credentialId: {
          type: String,
          trim: true,
          maxlength: 200,
        },

        issuedAt: Date,

        expiresAt: Date,

        verified: {
          type: Boolean,
          default: false,
        },
      },
    ],

    yearsOfExperience: {
      type: Number,
      min: 0,
      max: 100,
    },

    portfolio: {
      type: [MediaSchema],
      default: [],
    },

    serviceAreas: {
      type: [String],
      default: [],
      index: true,
    },

    hourlyRate: {
      amount: {
        type: Number,
        min: 0,
      },

      currency: {
        type: String,
        uppercase: true,
        maxlength: 10,
      },
    },

    verification: {
      status: {
        type: String,
        enum: ["unverified", "pending", "verified", "rejected"],
        default: "unverified",
        index: true,
      },

      verifiedAt: Date,

      verifiedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    },

    rating: {
      average: {
        type: Number,
        min: 0,
        max: 5,
        default: 0,
      },

      count: {
        type: Number,
        min: 0,
        default: 0,
      },
    },
  },
  {
    timestamps,
    versionKey: false,
  },
);

ProfessionalProfileSchema.index({
  specialties: 1,
  serviceAreas: 1,
});

/* -------------------------------------------------------------------------- */
/* ORGANIZATIONS                                                               */
/* -------------------------------------------------------------------------- */

const OrganizationMemberSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    role: {
      type: String,
      enum: ["owner", "admin", "manager", "member", "viewer"],
      default: "member",
    },

    permissions: {
      type: [String],
      default: [],
    },

    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false,
  },
);

const OrganizationSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250,
      index: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 120,
      index: true,
    },

    type: {
      type: String,
      enum: ORGANIZATION_TYPES,
      default: "company",
      index: true,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 5000,
    },

    logo: {
      type: MediaSchema,
      default: null,
    },

    website: {
      type: String,
      trim: true,
      maxlength: 2048,
    },

    contactEmail: {
      type: String,
      lowercase: true,
      trim: true,
      maxlength: 320,
    },

    contactPhone: {
      type: String,
      trim: true,
      maxlength: 40,
    },

    address: {
      type: AddressSchema,
      default: null,
    },

    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    members: {
      type: [OrganizationMemberSchema],
      default: [],
    },

    verification: {
      status: {
        type: String,
        enum: ["unverified", "pending", "verified", "rejected"],
        default: "unverified",
        index: true,
      },

      verifiedAt: Date,
    },

    status: {
      type: String,
      enum: ["active", "suspended", "archived"],
      default: "active",
      index: true,
    },
  },
  {
    timestamps,
    versionKey: false,
  },
);

OrganizationSchema.index({
  name: "text",
  description: "text",
});

/* -------------------------------------------------------------------------- */
/* ADVERTISEMENTS                                                              */
/* -------------------------------------------------------------------------- */

const AdvertisementSchema = new Schema(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 180,
      index: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 10000,
    },

    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      index: true,
    },

    subcategory: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    media: {
      type: [MediaSchema],
      default: [],
    },

    location: {
      type: AddressSchema,
      default: null,
    },

    price: {
      amount: {
        type: Number,
        min: 0,
      },

      currency: {
        type: String,
        uppercase: true,
        maxlength: 10,
      },

      negotiable: {
        type: Boolean,
        default: false,
      },
    },

    status: {
      type: String,
      enum: ADVERTISEMENT_STATUS,
      default: "draft",
      index: true,
    },

    visibility: {
      type: String,
      enum: ["public", "network", "private"],
      default: "public",
      index: true,
    },

    featured: {
      type: Boolean,
      default: false,
      index: true,
    },

    featuredUntil: {
      type: Date,
      default: null,
      index: true,
    },

    tags: {
      type: [String],
      default: [],
      index: true,
    },

    publishedAt: {
      type: Date,
      default: null,
      index: true,
    },

    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },

    analytics: {
      impressions: {
        type: Number,
        default: 0,
        min: 0,
      },

      views: {
        type: Number,
        default: 0,
        min: 0,
      },

      uniqueViews: {
        type: Number,
        default: 0,
        min: 0,
      },

      clicks: {
        type: Number,
        default: 0,
        min: 0,
      },

      enquiries: {
        type: Number,
        default: 0,
        min: 0,
      },

      shares: {
        type: Number,
        default: 0,
        min: 0,
      },

      saves: {
        type: Number,
        default: 0,
        min: 0,
      },

      conversions: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
  },
  {
    timestamps,
    versionKey: false,
  },
);

AdvertisementSchema.index({
  title: "text",
  description: "text",
  category: "text",
  tags: "text",
});

AdvertisementSchema.index({
  status: 1,
  visibility: 1,
  featured: -1,
  publishedAt: -1,
});

AdvertisementSchema.index({
  ownerId: 1,
  status: 1,
  createdAt: -1,
});

/* -------------------------------------------------------------------------- */
/* PLANS                                                                       */
/* -------------------------------------------------------------------------- */

const PlanSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 100,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 3000,
    },

    currency: {
      type: String,
      uppercase: true,
      required: true,
      maxlength: 10,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    interval: {
      type: String,
      enum: ["one_time", "monthly", "quarterly", "yearly"],
      default: "one_time",
    },

    features: {
      type: [String],
      default: [],
    },

    entitlements: {
      type: [String],
      default: [],
    },

    active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps,
    versionKey: false,
  },
);

/* -------------------------------------------------------------------------- */
/* TRANSACTIONS / PAYMENTS                                                     */
/* -------------------------------------------------------------------------- */

const TransactionSchema = new Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 200,
      index: true,
    },

    provider: {
      type: String,
      enum: ["paystack"],
      required: true,
      index: true,
    },

    providerReference: {
      type: String,
      trim: true,
      maxlength: 300,
      index: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },

    planId: {
      type: Schema.Types.ObjectId,
      ref: "Plan",
      default: null,
    },

    advertisementId: {
      type: Schema.Types.ObjectId,
      ref: "Advertisement",
      default: null,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      uppercase: true,
      required: true,
      maxlength: 10,
    },

    status: {
      type: String,
      enum: PAYMENT_STATUS,
      default: "pending",
      index: true,
    },

    type: {
      type: String,
      enum: [
        "payment",
        "subscription",
        "refund",
        "adjustment",
        "payout",
      ],
      default: "payment",
      index: true,
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },

    paidAt: {
      type: Date,
      default: null,
    },

    refundedAt: {
      type: Date,
      default: null,
    },

    failureReason: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  {
    timestamps,
    versionKey: false,
  },
);

TransactionSchema.index({
  userId: 1,
  createdAt: -1,
});

TransactionSchema.index({
  provider: 1,
  providerReference: 1,
});

/* -------------------------------------------------------------------------- */
/* PAYMENT WEBHOOK EVENTS                                                      */
/* -------------------------------------------------------------------------- */

const PaymentWebhookSchema = new Schema(
  {
    provider: {
      type: String,
      enum: ["paystack"],
      required: true,
    },

    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    eventType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    signatureVerified: {
      type: Boolean,
      required: true,
    },

    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },

    processed: {
      type: Boolean,
      default: false,
      index: true,
    },

    processedAt: {
      type: Date,
      default: null,
    },

    processingError: {
      type: String,
      maxlength: 3000,
    },
  },
  {
    timestamps,
    versionKey: false,
  },
);

/* -------------------------------------------------------------------------- */
/* CONVERSATIONS                                                               */
/* -------------------------------------------------------------------------- */

const ConversationParticipantSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    joinedAt: {
      type: Date,
      default: Date.now,
    },

    lastReadAt: {
      type: Date,
      default: null,
    },

    muted: {
      type: Boolean,
      default: false,
    },

    archived: {
      type: Boolean,
      default: false,
    },
  },
  {
    _id: false,
  },
);

const ConversationSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["direct", "group", "system"],
      default: "direct",
      index: true,
    },

    participants: {
      type: [ConversationParticipantSchema],
      required: true,
      validate: {
        validator(value) {
          return Array.isArray(value) && value.length >= 2;
        },
        message: "A conversation requires at least two participants.",
      },
    },

    title: {
      type: String,
      trim: true,
      maxlength: 250,
    },

    avatar: {
      type: MediaSchema,
      default: null,
    },

    lastMessageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },

    lastMessageAt: {
      type: Date,
      default: null,
      index: true,
    },

    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
      index: true,
    },
  },
  {
    timestamps,
    versionKey: false,
  },
);

ConversationSchema.index({
  "participants.userId": 1,
  lastMessageAt: -1,
});

/* -------------------------------------------------------------------------- */
/* MESSAGES                                                                    */
/* -------------------------------------------------------------------------- */

const MessageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },

    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: MESSAGE_TYPES,
      default: "text",
    },

    body: {
      type: String,
      trim: true,
      maxlength: 20000,
    },

    media: {
      type: [MediaSchema],
      default: [],
    },

    replyToMessageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },

    clientMessageId: {
      type: String,
      trim: true,
      maxlength: 200,
    },

    deliveredAt: {
      type: Date,
      default: null,
    },

    readBy: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: "User",
        },

        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    deletedAt: {
      type: Date,
      default: null,
    },

    editedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps,
    versionKey: false,
  },
);

MessageSchema.index({
  conversationId: 1,
  createdAt: -1,
});

MessageSchema.index(
  {
    conversationId: 1,
    senderId: 1,
    clientMessageId: 1,
  },
  {
    unique: true,
    sparse: true,
  },
);

/* -------------------------------------------------------------------------- */
/* NOTIFICATIONS                                                               */
/* -------------------------------------------------------------------------- */

const NotificationSchema = new Schema(
  {
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250,
    },

    body: {
      type: String,
      trim: true,
      maxlength: 2000,
    },

    data: {
      type: Schema.Types.Mixed,
      default: {},
    },

    readAt: {
      type: Date,
      default: null,
      index: true,
    },

    deliveredAt: {
      type: Date,
      default: null,
    },

    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps,
    versionKey: false,
  },
);

NotificationSchema.index({
  recipientId: 1,
  readAt: 1,
  createdAt: -1,
});

/* -------------------------------------------------------------------------- */
/* ANALYTICS EVENTS                                                            */
/* -------------------------------------------------------------------------- */

const AnalyticsEventSchema = new Schema(
  {
    eventName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
      index: true,
    },

    eventVersion: {
      type: String,
      default: "1.0",
      maxlength: 30,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    anonymousId: {
      type: String,
      trim: true,
      maxlength: 200,
      index: true,
    },

    advertisementId: {
      type: Schema.Types.ObjectId,
      ref: "Advertisement",
      default: null,
      index: true,
    },

    sessionId: {
      type: String,
      trim: true,
      maxlength: 200,
      index: true,
    },

    requestId: {
      type: String,
      trim: true,
      maxlength: 200,
      index: true,
    },

    source: {
      type: String,
      enum: ["web", "mobile", "api", "system", "admin"],
      default: "web",
      index: true,
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },

    occurredAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },

    organic: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  },
);

AnalyticsEventSchema.index({
  eventName: 1,
  occurredAt: -1,
});

AnalyticsEventSchema.index({
  advertisementId: 1,
  eventName: 1,
  occurredAt: -1,
});

/* -------------------------------------------------------------------------- */
/* AUDIT LOG                                                                   */
/* -------------------------------------------------------------------------- */

const AuditLogSchema = new Schema(
  {
    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    action: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      index: true,
    },

    resourceType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      index: true,
    },

    resourceId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    requestId: {
      type: String,
      trim: true,
      maxlength: 200,
      index: true,
    },

    ipAddress: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    userAgent: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    reason: {
      type: String,
      trim: true,
      maxlength: 3000,
    },

    before: {
      type: Schema.Types.Mixed,
      default: null,
    },

    after: {
      type: Schema.Types.Mixed,
      default: null,
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },

    category: {
      type: String,
      enum: [
        "authentication",
        "authorization",
        "security",
        "financial",
        "administrative",
        "data",
        "system",
      ],
      required: true,
      index: true,
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
    versionKey: false,
  },
);

AuditLogSchema.index({
  resourceType: 1,
  resourceId: 1,
  createdAt: -1,
});

AuditLogSchema.index({
  actorId: 1,
  createdAt: -1,
});

/* -------------------------------------------------------------------------- */
/* SESSION / REFRESH TOKEN RECORDS                                             */
/* -------------------------------------------------------------------------- */

const SessionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    tokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
      index: true,
    },

    deviceId: {
      type: String,
      trim: true,
      maxlength: 200,
      index: true,
    },

    userAgent: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    ipAddress: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    revokedAt: {
      type: Date,
      default: null,
      index: true,
    },

    lastUsedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps,
    versionKey: false,
  },
);

SessionSchema.index(
  {
    expiresAt: 1,
  },
  {
    expireAfterSeconds: 0,
  },
);

/* -------------------------------------------------------------------------- */
/* MODEL REGISTRATION                                                          */
/* -------------------------------------------------------------------------- */

function registerModel(name, schema) {
  return models[name] ?? model(name, schema);
}

export const User = registerModel("User", UserSchema);

export const ProfessionalProfile = registerModel(
  "ProfessionalProfile",
  ProfessionalProfileSchema,
);

export const Organization = registerModel(
  "Organization",
  OrganizationSchema,
);

export const Advertisement = registerModel(
  "Advertisement",
  AdvertisementSchema,
);

export const Plan = registerModel("Plan", PlanSchema);

export const Transaction = registerModel(
  "Transaction",
  TransactionSchema,
);

export const PaymentWebhook = registerModel(
  "PaymentWebhook",
  PaymentWebhookSchema,
);

export const Conversation = registerModel(
  "Conversation",
  ConversationSchema,
);

export const Message = registerModel("Message", MessageSchema);

export const Notification = registerModel(
  "Notification",
  NotificationSchema,
);

export const AnalyticsEvent = registerModel(
  "AnalyticsEvent",
  AnalyticsEventSchema,
);

export const AuditLog = registerModel(
  "AuditLog",
  AuditLogSchema,
);

export const Session = registerModel("Session", SessionSchema);

/* -------------------------------------------------------------------------- */
/* MODEL COLLECTION                                                            */
/* -------------------------------------------------------------------------- */

export const modelsRegistry = Object.freeze({
  User,
  ProfessionalProfile,
  Organization,
  Advertisement,
  Plan,
  Transaction,
  PaymentWebhook,
  Conversation,
  Message,
  Notification,
  AnalyticsEvent,
  AuditLog,
  Session,
});

/* -------------------------------------------------------------------------- */
/* DATABASE HELPERS                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Returns the current Mongoose connection state.
 *
 * 0 = disconnected
 * 1 = connected
 * 2 = connecting
 * 3 = disconnecting
 */
export function getDatabaseState() {
  return mongoose.connection.readyState;
}

export function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}

/**
 * Exposes the native MongoDB connection.
 *
 * This allows future repository implementations to use
 * native MongoDB operations where appropriate without
 * replacing the model layer.
 */
export function getDatabaseConnection() {
  return mongoose.connection;
}

/**
 * Creates indexes for all registered models.
 *
 * This should normally be called during controlled
 * application startup/migration rather than on every
 * ordinary request.
 */
export async function ensureIndexes() {
  const modelList = Object.values(modelsRegistry);

  for (const currentModel of modelList) {
    await currentModel.createIndexes();
  }

  return {
    models: modelList.map((currentModel) => currentModel.modelName),
    indexed: true,
  };
}

/**
 * Returns a safe database health snapshot.
 */
export function getDatabaseHealth() {
  const state = mongoose.connection.readyState;

  const states = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };

  return {
    connected: state === 1,
    state,
    status: states[state] ?? "unknown",
    databaseName: mongoose.connection.name || null,
  };
}

/* -------------------------------------------------------------------------- */
/* DATABASE BOOTSTRAP                                                        */
/* -------------------------------------------------------------------------- */

export async function connectDatabase() {
  const configuredUrl =
    process.env.DATABASE_URL ||
    process.env.MONGODB_URI ||
    "mongodb://127.0.0.1:27017/nexus_os";

  if (
    process.env.DATABASE_DISABLED === "true" ||
    process.env.DATABASE_DISABLED === "1"
  ) {
    return mongoose.connection;
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  await mongoose.connect(configuredUrl, {
    serverSelectionTimeoutMS: 5000,
    retryWrites: true,
    retryReads: true,
  });

  return mongoose.connection;
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState === 0) {
    return mongoose.connection;
  }

  await mongoose.disconnect();
  return mongoose.connection;
}

/* -------------------------------------------------------------------------- */
/* EXPORTS                                                                     */
/* -------------------------------------------------------------------------- */

export {
  mongoose,
  UserSchema,
  ProfessionalProfileSchema,
  OrganizationSchema,
  AdvertisementSchema,
  PlanSchema,
  TransactionSchema,
  PaymentWebhookSchema,
  ConversationSchema,
  MessageSchema,
  NotificationSchema,
  AnalyticsEventSchema,
  AuditLogSchema,
  SessionSchema,
};

export default modelsRegistry;
