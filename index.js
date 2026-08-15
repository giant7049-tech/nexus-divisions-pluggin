require("dotenv").config();

const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const nodemailer = require("nodemailer");
const cookieParser = require("cookie-parser");
const { Server } = require("socket.io");
const cloudinary = require("cloudinary").v2;

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 10000;

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error("FATAL ERROR: JWT_SECRET is missing.");
    process.exit(1);
}

/*
|--------------------------------------------------------------------------
| SECURITY
|--------------------------------------------------------------------------
*/

app.disable("x-powered-by");

app.use(
    helmet({
        crossOriginResourcePolicy: false
    })
);

app.use(
    cors({
        origin: process.env.FRONTEND_URL
            ? process.env.FRONTEND_URL.split(",")
            : true,
        credentials: true
    })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/*
|--------------------------------------------------------------------------
| RATE LIMITING
|--------------------------------------------------------------------------
*/

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false
});

app.use("/api/", generalLimiter);
app.use("/api/auth/", authLimiter);

/*
|--------------------------------------------------------------------------
| CLOUDINARY
|--------------------------------------------------------------------------
*/

cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.CLOUD_KEY,
    api_secret: process.env.CLOUD_SECRET
});

/*
|--------------------------------------------------------------------------
| FILE UPLOAD
|--------------------------------------------------------------------------
*/

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 25 * 1024 * 1024
    }
});

/*
|--------------------------------------------------------------------------
| MONGODB
|--------------------------------------------------------------------------
*/

mongoose.set("strictQuery", true);

/*
|--------------------------------------------------------------------------
| USER MODEL
|--------------------------------------------------------------------------
*/

const UserSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            minlength: 3,
            maxlength: 30
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },

        passwordHash: {
            type: String,
            required: true
        },

        avatar: {
            type: String,
            default: ""
        },

        emailVerified: {
            type: Boolean,
            default: false
        },

        verificationTokenHash: {
            type: String,
            default: null
        },

        verificationExpiresAt: {
            type: Date,
            default: null
        },

        lastLoginAt: {
            type: Date,
            default: null
        },

        active: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true
    }
);

UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ username: 1 }, { unique: true });

const User = mongoose.model("User", UserSchema);

/*
|--------------------------------------------------------------------------
| MESSAGE MODEL
|--------------------------------------------------------------------------
*/

const MessageSchema = new mongoose.Schema(
    {
        conversationKey: {
            type: String,
            required: true,
            index: true
        },

        from: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        to: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        text: {
            type: String,
            default: "",
            maxlength: 10000
        },

        fileUrl: {
            type: String,
            default: ""
        },

        fileType: {
            type: String,
            default: ""
        },

        messageType: {
            type: String,
            enum: [
                "text",
                "image",
                "file",
                "voice"
            ],
            default: "text"
        },

        createdAt: {
            type: Date,
            default: Date.now,
            index: true
        }
    }
);

MessageSchema.index({
    conversationKey: 1,
    createdAt: 1
});

const Message = mongoose.model("Message", MessageSchema);

/*
|--------------------------------------------------------------------------
| CONVERSATION KEY
|--------------------------------------------------------------------------
*/

function conversationKey(userA, userB) {
    return [String(userA), String(userB)]
        .sort()
        .join("_");
}

/*
|--------------------------------------------------------------------------
| JWT
|--------------------------------------------------------------------------
*/

function createToken(user) {
    return jwt.sign(
        {
            sub: String(user._id),
            username: user.username
        },
        JWT_SECRET,
        {
            expiresIn: "7d"
        }
    );
}

function setAuthCookie(res, token) {
    res.cookie("nexus_session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production"
            ? "none"
            : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000
    });
}

function clearAuthCookie(res) {
    res.clearCookie("nexus_session");
}

/*
|--------------------------------------------------------------------------
| AUTH MIDDLEWARE
|--------------------------------------------------------------------------
*/

async function authenticate(req, res, next) {
    try {
        const header = req.headers.authorization;

        let token = null;

        if (header && header.startsWith("Bearer ")) {
            token = header.substring(7);
        }

        if (!token && req.cookies.nexus_session) {
            token = req.cookies.nexus_session;
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        const decoded = jwt.verify(token, JWT_SECRET);

        const user = await User.findById(decoded.sub);

        if (!user || !user.active) {
            return res.status(401).json({
                success: false,
                message: "Invalid or inactive account."
            });
        }

        if (!user.emailVerified) {
            return res.status(403).json({
                success: false,
                message: "Please verify your email first."
            });
        }

        req.user = user;

        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired session."
        });
    }
}

/*
|--------------------------------------------------------------------------
| SAFE USER RESPONSE
|--------------------------------------------------------------------------
*/

function publicUser(user) {
    return {
        id: String(user._id),
        username: user.username,
        email: user.email,
        avatar: user.avatar || "",
        emailVerified: user.emailVerified,
        createdAt: user.createdAt
    };
}

/*
|--------------------------------------------------------------------------
| EMAIL
|--------------------------------------------------------------------------
*/

let transporter = null;

if (
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
) {
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE) === "true",
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });

    console.log("SMTP: CONFIGURED");
} else {
    console.log(
        "SMTP: NOT CONFIGURED - email verification cannot send real emails yet."
    );
}

/*
|--------------------------------------------------------------------------
| SEND VERIFICATION EMAIL
|--------------------------------------------------------------------------
*/

async function sendVerificationEmail(user, rawToken) {
    if (!transporter) {
        throw new Error("SMTP is not configured.");
    }

    const verificationBase =
        process.env.EMAIL_VERIFY_URL ||
        `${process.env.BACKEND_URL || ""}/api/auth/verify`;

    const verificationUrl =
        `${verificationBase}?token=${encodeURIComponent(rawToken)}`;

    await transporter.sendMail({
        from:
            process.env.MAIL_FROM ||
            `"Nexus Buildsolutions Limited" <${process.env.SMTP_USER}>`,

        to: user.email,

        subject: "Verify your Nexus Connect account",

        text:
            `Welcome to Nexus Connect.\n\n` +
            `Please verify your account using this link:\n\n` +
            `${verificationUrl}\n\n` +
            `This verification link expires in 30 minutes.`,

        html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
                <h2>Nexus Connect</h2>

                <p>Hello ${user.username},</p>

                <p>
                    Welcome to Nexus Connect.
                    Please verify your email address to activate your account.
                </p>

                <p>
                    <a
                        href="${verificationUrl}"
                        style="
                            display:inline-block;
                            padding:12px 20px;
                            background:#008f5a;
                            color:white;
                            text-decoration:none;
                            border-radius:8px;
                        "
                    >
                        Verify My Account
                    </a>
                </p>

                <p>
                    This verification link expires in 30 minutes.
                </p>

                <p>
                    Nexus Buildsolutions Limited
                </p>
            </div>
        `
    });
}

/*
|--------------------------------------------------------------------------
| HEALTH CHECK
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
    res.json({
        success: true,
        service: "Nexus Connect",
        engine: "NEXUS ENGINE v2030",
        status: "online"
    });
});

app.get("/health", (req, res) => {
    res.json({
        success: true,
        server: "online",
        mongodb:
            mongoose.connection.readyState === 1
                ? "connected"
                : "disconnected"
    });
});

/*
|--------------------------------------------------------------------------
| REGISTER
|--------------------------------------------------------------------------
*/

app.post("/api/auth/register", async (req, res) => {
    try {
        const {
            username,
            email,
            password
        } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({
                success: false,
                message:
                    "Username, email and password are required."
            });
        }

        const cleanUsername = String(username).trim();

        const cleanEmail =
            String(email).trim().toLowerCase();

        if (!/^[a-zA-Z0-9_]{3,30}$/.test(cleanUsername)) {
            return res.status(400).json({
                success: false,
                message:
                    "Username must be 3-30 characters and contain only letters, numbers or underscore."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message:
                    "Password must contain at least 8 characters."
            });
        }

        const existingEmail = await User.findOne({
            email: cleanEmail
        });

        if (existingEmail) {
            return res.status(409).json({
                success: false,
                message: "Email is already registered."
            });
        }

        const existingUsername = await User.findOne({
            username: cleanUsername
        });

        if (existingUsername) {
            return res.status(409).json({
                success: false,
                message: "Username is already taken."
            });
        }

        const passwordHash =
            await bcrypt.hash(password, 12);

        const rawVerificationToken =
            crypto.randomBytes(32).toString("hex");

        const verificationTokenHash =
            crypto
                .createHash("sha256")
                .update(rawVerificationToken)
                .digest("hex");

        const user = new User({
            username: cleanUsername,
            email: cleanEmail,
            passwordHash,
            verificationTokenHash,
            verificationExpiresAt:
                new Date(Date.now() + 30 * 60 * 1000)
        });

        await user.save();

        let emailSent = false;

        try {
            await sendVerificationEmail(
                user,
                rawVerificationToken
            );

            emailSent = true;
        } catch (mailError) {
            console.error(
                "VERIFICATION EMAIL ERROR:",
                mailError.message
            );
        }

        return res.status(201).json({
            success: true,
            message: emailSent
                ? "Registration successful. Check your email to verify your account."
                : "Registration created, but email verification service is not configured yet.",
            user: publicUser(user),
            emailVerificationRequired: true,
            emailSent
        });

    } catch (error) {
        console.error("REGISTER ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Registration failed."
        });
    }
});

/*
|--------------------------------------------------------------------------
| VERIFY EMAIL
|--------------------------------------------------------------------------
*/

app.get("/api/auth/verify", async (req, res) => {
    try {
        const rawToken = req.query.token;

        if (!rawToken) {
            return res.status(400).json({
                success: false,
                message: "Verification token is missing."
            });
        }

        const tokenHash =
            crypto
                .createHash("sha256")
                .update(String(rawToken))
                .digest("hex");

        const user = await User.findOne({
            verificationTokenHash: tokenHash,
            verificationExpiresAt: {
                $gt: new Date()
            }
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message:
                    "Verification link is invalid or expired."
            });
        }

        user.emailVerified = true;
        user.verificationTokenHash = null;
        user.verificationExpiresAt = null;

        await user.save();

        res.json({
            success: true,
            message:
                "Email verified successfully. Your Nexus Connect account is now active."
        });

    } catch (error) {
        console.error("VERIFY ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Email verification failed."
        });
    }
});

/*
|--------------------------------------------------------------------------
| LOGIN
|--------------------------------------------------------------------------
*/

app.post("/api/auth/login", async (req, res) => {
    try {
        const {
            email,
            password
        } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message:
                    "Email and password are required."
            });
        }

        const user = await User.findOne({
            email: String(email).trim().toLowerCase()
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        const passwordCorrect =
            await bcrypt.compare(
                password,
                user.passwordHash
            );

        if (!passwordCorrect) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        if (!user.emailVerified) {
            return res.status(403).json({
                success: false,
                message:
                    "Please verify your email before logging in."
            });
        }

        user.lastLoginAt = new Date();
        await user.save();

        const token = createToken(user);

        setAuthCookie(res, token);

        res.json({
            success: true,
            message: "Login successful.",
            user: publicUser(user)
        });

    } catch (error) {
        console.error("LOGIN ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Login failed."
        });
    }
});

/*
|--------------------------------------------------------------------------
| CURRENT USER
|--------------------------------------------------------------------------
*/

app.get("/api/auth/me", authenticate, async (req, res) => {
    res.json({
        success: true,
        user: publicUser(req.user)
    });
});

/*
|--------------------------------------------------------------------------
| LOGOUT
|--------------------------------------------------------------------------
*/

app.post("/api/auth/logout", authenticate, async (req, res) => {
    clearAuthCookie(res);

    res.json({
        success: true,
        message: "Logged out successfully."
    });
});

/*
|--------------------------------------------------------------------------
| USERS
|--------------------------------------------------------------------------
*/

app.get("/api/users", authenticate, async (req, res) => {
    try {
        const users = await User.find({
            active: true,
            emailVerified: true
        })
            .select(
                "_id username email avatar emailVerified createdAt"
            )
            .sort({ username: 1 });

        res.json({
            success: true,
            users
        });

    } catch (error) {
        console.error("USERS ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Unable to load users."
        });
    }
});

/*
|--------------------------------------------------------------------------
| PRIVATE CHAT HISTORY
|--------------------------------------------------------------------------
*/

app.get("/api/chat/get", authenticate, async (req, res) => {
    try {
        const otherUserId = req.query.user;

        if (!otherUserId) {
            return res.status(400).json({
                success: false,
                message: "User ID is required."
            });
        }

        const otherUser =
            await User.findById(otherUserId);

        if (!otherUser) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const room = conversationKey(
            req.user._id,
            otherUser._id
        );

        const messages =
            await Message.find({
                conversationKey: room
            })
                .sort({ createdAt: 1 })
                .limit(500)
                .populate(
                    "from",
                    "_id username avatar"
                );

        res.json({
            success: true,
            messages
        });

    } catch (error) {
        console.error(
            "CHAT HISTORY ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Unable to load conversation."
        });
    }
});

/*
|--------------------------------------------------------------------------
| SEND MESSAGE - HTTP
|--------------------------------------------------------------------------
*/

app.post("/api/chat/send", authenticate, async (req, res) => {
    try {
        const {
            to,
            text = "",
            fileUrl = "",
            fileType = "",
            messageType = "text"
        } = req.body;

        if (!to) {
            return res.status(400).json({
                success: false,
                message: "Recipient is required."
            });
        }

        const recipient =
            await User.findById(to);

        if (!recipient || !recipient.active) {
            return res.status(404).json({
                success: false,
                message: "Recipient not found."
            });
        }

        if (!recipient.emailVerified) {
            return res.status(403).json({
                success: false,
                message:
                    "Recipient account is not verified."
            });
        }

        if (
            !text &&
            !fileUrl
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Message must contain text or media."
            });
        }

        const room = conversationKey(
            req.user._id,
            recipient._id
        );

        const message =
            await Message.create({
                conversationKey: room,
                from: req.user._id,
                to: recipient._id,
                text: String(text).slice(0, 10000),
                fileUrl,
                fileType,
                messageType
            });

        const populated =
            await message.populate(
                "from",
                "_id username avatar"
            );

        io.to(room).emit(
            "message:new",
            populated
        );

        res.status(201).json({
            success: true,
            message: populated
        });

    } catch (error) {
        console.error(
            "SEND MESSAGE ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Message could not be sent."
        });
    }
});

/*
|--------------------------------------------------------------------------
| CLOUDINARY UPLOAD
|--------------------------------------------------------------------------
*/

app.post(
    "/api/upload",
    authenticate,
    upload.single("file"),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: "No file uploaded."
                });
            }

            const result =
                await new Promise(
                    (resolve, reject) => {
                        const stream =
                            cloudinary.uploader.upload_stream(
                                {
                                    resource_type:
                                        "auto"
                                },
                                (error, result) => {
                                    if (error) {
                                        reject(error);
                                    } else {
                                        resolve(result);
                                    }
                                }
                            );

                        stream.end(req.file.buffer);
                    }
                );

            res.json({
                success: true,
                url: result.secure_url,
                publicId: result.public_id,
                resourceType:
                    result.resource_type,
                originalName:
                    req.file.originalname
            });

        } catch (error) {
            console.error(
                "UPLOAD ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message: "Media upload failed."
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| SOCKET.IO
|--------------------------------------------------------------------------
*/

const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL
            ? process.env.FRONTEND_URL.split(",")
            : true,
        credentials: true
    }
});

/*
|--------------------------------------------------------------------------
| SOCKET AUTHENTICATION
|--------------------------------------------------------------------------
*/

io.use(async (socket, next) => {
    try {
        const token =
            socket.handshake.auth?.token;

        if (!token) {
            return next(
                new Error("Authentication required.")
            );
        }

        const decoded =
            jwt.verify(token, JWT_SECRET);

        const user =
            await User.findById(decoded.sub);

        if (
            !user ||
            !user.active ||
            !user.emailVerified
        ) {
            return next(
                new Error("Invalid user.")
            );
        }

        socket.user = user;

        next();

    } catch (error) {
        next(
            new Error("Socket authentication failed.")
        );
    }
});

/*
|--------------------------------------------------------------------------
| SOCKET EVENTS
|--------------------------------------------------------------------------
*/

io.on("connection", (socket) => {

    console.log(
        `Socket connected: ${socket.user.username}`
    );

    socket.on("joinPrivateRoom", async (otherUserId) => {

        try {
            const room =
                conversationKey(
                    socket.user._id,
                    otherUserId
                );

            socket.join(room);

        } catch (error) {
            console.error(
                "JOIN ROOM ERROR:",
                error
            );
        }
    });

    socket.on(
        "message:send",
        async (data, callback) => {

            try {

                const {
                    to,
                    text = "",
                    fileUrl = "",
                    fileType = "",
                    messageType = "text"
                } = data || {};

                if (!to) {
                    throw new Error(
                        "Recipient is required."
                    );
                }

                const recipient =
                    await User.findById(to);

                if (
                    !recipient ||
                    !recipient.active ||
                    !recipient.emailVerified
                ) {
                    throw new Error(
                        "Recipient is unavailable."
                    );
                }

                if (!text && !fileUrl) {
                    throw new Error(
                        "Empty message."
                    );
                }

                const room =
                    conversationKey(
                        socket.user._id,
                        recipient._id
                    );

                const message =
                    await Message.create({
                        conversationKey: room,
                        from: socket.user._id,
                        to: recipient._id,
                        text:
                            String(text).slice(
                                0,
                                10000
                            ),
                        fileUrl,
                        fileType,
                        messageType
                    });

                const populated =
                    await message.populate(
                        "from",
                        "_id username avatar"
                    );

                io.to(room).emit(
                    "message:new",
                    populated
                );

                if (callback) {
                    callback({
                        success: true,
                        message: populated
                    });
                }

            } catch (error) {

                console.error(
                    "SOCKET MESSAGE ERROR:",
                    error
                );

                if (callback) {
                    callback({
                        success: false,
                        message:
                            error.message ||
                            "Message failed."
                    });
                }
            }
        }
    );

    socket.on("disconnect", () => {

        console.log(
            `Socket disconnected: ${socket.user.username}`
        );

    });
});

/*
|--------------------------------------------------------------------------
| DATABASE + SERVER START
|--------------------------------------------------------------------------
*/

async function startServer() {

    try {

        await mongoose.connect(
            process.env.MONGO_URI
        );

        console.log("================================");
        console.log("NEXUS CONNECT");
        console.log("MongoDB: CONNECTED");
        console.log(
            "Cloudinary:",
            process.env.CLOUD_NAME
                ? "CONFIGURED"
                : "NOT CONFIGURED"
        );
        console.log(
            "SMTP:",
            transporter
                ? "CONFIGURED"
                : "NOT CONFIGURED"
        );
        console.log("================================");

        server.listen(PORT, "0.0.0.0", () => {

            console.log(
                `NEXUS ENGINE v2030 LIVE ON PORT ${PORT}`
            );

        });

    } catch (error) {

        console.error(
            "SERVER STARTUP FAILED:",
            error
        );

        process.exit(1);
    }
}

startServer();
