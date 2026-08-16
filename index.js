// ============================================================
// NEXUS CONNECT ENGINE
// Nexus Buildsolutions Limited
//
// PHASE 2A — REAL AUTHENTICATION & SECURITY
//
// Architecture:
// Express
// MongoDB / Mongoose
// bcrypt
// JWT
// HTTP-only cookies
// Nodemailer / Gmail SMTP
// Cloudinary
// Socket.IO
// Helmet
// Rate Limiting
//
// Render-compatible CommonJS architecture
// ============================================================

require("dotenv").config();

const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");


// ============================================================
// 1. APPLICATION
// ============================================================

const app = express();

const server =
  http.createServer(app);

const PORT =
  Number(process.env.PORT || 10000);

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  "https://nexusbuildsolutions.rf.gd";

const NEXUS_LOGO_URL =
  "https://nexusbuildsolutions.rf.gd/wp-content/uploads/2026/08/cropped-Screenshot-2025-09-29-122409.png";

const JWT_EXPIRES_IN =
  process.env.JWT_EXPIRES_IN ||
  "7d";

const COOKIE_NAME =
  "nexus_access";


// ============================================================
// 2. SOCKET.IO
// ============================================================

const io =
  new Server(server, {

    cors: {

      origin: FRONTEND_URL,

      credentials: true,

      methods: [
        "GET",
        "POST"
      ]

    }

  });


// ============================================================
// 3. SECURITY MIDDLEWARE
// ============================================================

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin"
    }
  })
);


app.use(
  cors({

    origin: FRONTEND_URL,

    credentials: true,

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS"
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization"
    ]

  })
);


app.use(
  cookieParser()
);


app.use(
  express.json({
    limit: "10mb"
  })
);


app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb"
  })
);


// ============================================================
// 4. RATE LIMITING
// ============================================================

const generalLimiter =
  rateLimit({

    windowMs:
      15 * 60 * 1000,

    limit: 300,

    standardHeaders: true,

    legacyHeaders: false

  });


const authLimiter =
  rateLimit({

    windowMs:
      15 * 60 * 1000,

    limit: 20,

    standardHeaders: true,

    legacyHeaders: false

  });


app.use(
  "/api",
  generalLimiter
);


app.use(
  "/api/auth",
  authLimiter
);


// ============================================================
// 5. ENVIRONMENT CHECK
// ============================================================

const requiredEnvironmentVariables = [

  "MONGO_URI",

  "CLOUD_NAME",

  "CLOUD_KEY",

  "CLOUD_SECRET",

  "JWT_SECRET",

  "SMTP_USER",

  "SMTP_PASS"

];


const missingEnvironmentVariables =
  requiredEnvironmentVariables.filter(
    (key) => !process.env[key]
  );


if (
  missingEnvironmentVariables.length
) {

  console.error(
    "MISSING ENVIRONMENT VARIABLES:",
    missingEnvironmentVariables.join(", ")
  );

}


// ============================================================
// 6. CLOUDINARY
// ============================================================

cloudinary.config({

  cloud_name:
    process.env.CLOUD_NAME,

  api_key:
    process.env.CLOUD_KEY,

  api_secret:
    process.env.CLOUD_SECRET

});


const upload =
  multer({

    storage:
      multer.memoryStorage(),

    limits: {

      fileSize:
        50 * 1024 * 1024

    }

  });


// ============================================================
// 7. EMAIL ENGINE
// ============================================================

const transporter =
  nodemailer.createTransport({

    host:
      process.env.SMTP_HOST ||
      "smtp.gmail.com",

    port:
      Number(
        process.env.SMTP_PORT || 465
      ),

    secure:
      String(
        process.env.SMTP_SECURE ||
        "true"
      ).toLowerCase() === "true",

    auth: {

      user:
        process.env.SMTP_USER,

      pass:
        process.env.SMTP_PASS

    }

  });


// ============================================================
// 8. EMAIL VERIFICATION
// ============================================================

async function verifyEmailTransport() {

  try {

    await transporter.verify();

    console.log(
      "NEXUS EMAIL: SMTP CONNECTION READY"
    );

  } catch (error) {

    console.error(
      "NEXUS EMAIL ERROR:",
      error.message
    );

  }

}


// ============================================================
// 9. EMAIL TEMPLATE
// ============================================================

function nexusEmailTemplate({

  title,

  greeting,

  message,

  buttonText,

  buttonUrl

}) {

  return `

<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta
name="viewport"
content="width=device-width,initial-scale=1.0"
>

<title>${title}</title>

<style>

body {

margin:0;

padding:0;

background:#f4f7f6;

font-family:
Arial,
Helvetica,
sans-serif;

color:#17211f;

}

.email-wrapper {

width:100%;

padding:40px 15px;

box-sizing:border-box;

}

.email-card {

max-width:620px;

margin:auto;

background:#ffffff;

border-radius:20px;

overflow:hidden;

box-shadow:
0 12px 40px
rgba(0,0,0,.08);

}

.header {

background:
linear-gradient(
135deg,
#063d2e,
#008f5a
);

padding:35px 25px;

text-align:center;

}

.logo {

width:120px;

max-width:45%;

height:auto;

background:#ffffff;

padding:8px;

border-radius:12px;

}

.brand {

margin-top:15px;

color:#ffffff;

font-size:21px;

font-weight:700;

}

.content {

padding:40px 35px;

}

h1 {

margin-top:0;

font-size:28px;

color:#063d2e;

}

p {

font-size:15px;

line-height:1.7;

color:#4b5754;

}

.action {

text-align:center;

margin:32px 0;

}

.button {

display:inline-block;

padding:15px 28px;

background:#008f5a;

color:#ffffff !important;

text-decoration:none;

border-radius:10px;

font-weight:700;

}

.security {

margin-top:25px;

padding:15px;

background:#f1f8f5;

border-radius:10px;

font-size:13px;

color:#52625d;

}

.footer {

border-top:
1px solid #e5ebe8;

padding:22px;

text-align:center;

font-size:12px;

color:#77817e;

}

</style>

</head>

<body>

<div class="email-wrapper">

<div class="email-card">

<div class="header">

<img
class="logo"
src="${NEXUS_LOGO_URL}"
alt="Nexus Buildsolutions Limited"
>

<div class="brand">

NEXUS BUILDSOLUTIONS LIMITED

</div>

</div>

<div class="content">

<h1>
${title}
</h1>

<p>
${greeting}
</p>

<p>
${message}
</p>

<div class="action">

<a
class="button"
href="${buttonUrl}"
target="_blank"
rel="noopener noreferrer"
>

${buttonText}

</a>

</div>

<div class="security">

<strong>
Security Notice
</strong>

<br>

Nexus Connect will never ask you
to disclose your password or
verification code to another person.

</div>

</div>

<div class="footer">

Nexus Buildsolutions Limited

<br><br>

Secure communication infrastructure
powered by Nexus Connect.

</div>

</div>

</div>

</body>

</html>

`;

}


// ============================================================
// 10. SEND EMAIL
// ============================================================

async function sendNexusEmail({

  to,

  subject,

  title,

  greeting,

  message,

  buttonText,

  buttonUrl

}) {

  if (!to) {

    throw new Error(
      "Recipient email is required."
    );

  }


  const html =
    nexusEmailTemplate({

      title,

      greeting,

      message,

      buttonText,

      buttonUrl

    });


  const info =
    await transporter.sendMail({

      from:
        process.env.MAIL_FROM ||
        process.env.SMTP_USER,

      to,

      subject,

      html,

      text:

`${title}

${greeting}

${message}

${buttonUrl}

Nexus Buildsolutions Limited
Nexus Connect`

    });


  console.log(
    "NEXUS EMAIL SENT:",
    info.messageId
  );


  return info;

}


// ============================================================
// 11. USER DATABASE MODEL
// ============================================================

const userSchema =
  new mongoose.Schema(

    {

      username: {

        type: String,

        required: true,

        unique: true,

        trim: true,

        minlength: 3,

        maxlength: 40,

        index: true

      },


      email: {

        type: String,

        required: true,

        unique: true,

        lowercase: true,

        trim: true,

        index: true

      },


      passwordHash: {

        type: String,

        required: true,

        select: false

      },


      avatar: {

        type: String,

        default: ""

      },


      emailVerified: {

        type: Boolean,

        default: false,

        index: true

      },


      verificationTokenHash: {

        type: String,

        default: null,

        select: false

      },


      verificationExpiresAt: {

        type: Date,

        default: null,

        select: false

      },


      lastLoginAt: {

        type: Date,

        default: null

      }

    },

    {

      timestamps: true

    }

  );


// ============================================================
// 12. MESSAGE MODEL
// ============================================================

const messageSchema =
  new mongoose.Schema(

    {

      from: {

        type:
          mongoose.Schema.Types.ObjectId,

        ref: "User",

        required: true,

        index: true

      },


      to: {

        type:
          mongoose.Schema.Types.ObjectId,

        ref: "User",

        default: null,

        index: true

      },


      room: {

        type: String,

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

          "voice",

          "system"

        ],

        default: "text"

      }

    },

    {

      timestamps: true

    }

  );


// ============================================================
// 13. GROUP MODEL
// ============================================================

const groupSchema =
  new mongoose.Schema(

    {

      name: {

        type: String,

        required: true,

        trim: true,

        maxlength: 100

      },


      members: [

        {

          type:
            mongoose.Schema.Types.ObjectId,

          ref: "User"

        }

      ],


      createdBy: {

        type:
          mongoose.Schema.Types.ObjectId,

        ref: "User",

        required: true

      }

    },

    {

      timestamps: true

    }

  );


// ============================================================
// 14. MODELS
// ============================================================

const User =
  mongoose.model(
    "User",
    userSchema
  );


const Message =
  mongoose.model(
    "Message",
    messageSchema
  );


const Group =
  mongoose.model(
    "Group",
    groupSchema
  );


// ============================================================
// 15. DATABASE
// ============================================================

async function connectDatabase() {

  try {

    await mongoose.connect(
      process.env.MONGO_URI
    );

    console.log(
      "NEXUS DATABASE: MONGODB CONNECTED"
    );

  } catch (error) {

    console.error(
      "NEXUS DATABASE ERROR:",
      error.message
    );

    process.exit(1);

  }

}


// ============================================================
// 16. SECURITY HELPERS
// ============================================================

function hashToken(token) {

  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

}


function generateVerificationToken() {

  return crypto
    .randomBytes(32)
    .toString("hex");

}


function createAccessToken(user) {

  return jwt.sign(

    {

      sub:
        user._id.toString(),

      username:
        user.username,

      email:
        user.email

    },

    process.env.JWT_SECRET,

    {

      expiresIn:
        JWT_EXPIRES_IN

    }

  );

}


// ============================================================
// 17. SESSION COOKIE
// ============================================================

function setAuthCookie(
  res,
  token
) {

  res.cookie(

    COOKIE_NAME,

    token,

    {

      httpOnly: true,

      secure: true,

      sameSite: "none",

      maxAge:
        7 * 24 * 60 * 60 * 1000,

      path: "/"

    }

  );

}


function clearAuthCookie(res) {

  res.clearCookie(

    COOKIE_NAME,

    {

      httpOnly: true,

      secure: true,

      sameSite: "none",

      path: "/"

    }

  );

}


// ============================================================
// 18. AUTHENTICATION MIDDLEWARE
// ============================================================

async function authenticateRequest(
  req,
  res,
  next
) {

  try {

    const token =
      req.cookies[COOKIE_NAME];


    if (!token) {

      return res.status(401).json({

        success: false,

        message:
          "Authentication required."

      });

    }


    const decoded =
      jwt.verify(

        token,

        process.env.JWT_SECRET

      );


    const user =
      await User.findById(
        decoded.sub
      );


    if (!user) {

      return res.status(401).json({

        success: false,

        message:
          "Account no longer exists."

      });

    }


    if (!user.emailVerified) {

      return res.status(403).json({

        success: false,

        message:
          "Email verification is required."

      });

    }


    req.user = user;


    next();

  } catch (error) {

    return res.status(401).json({

      success: false,

      message:
        "Invalid or expired session."

    });

  }

}


// ============================================================
// 19. PUBLIC HEALTH CHECK
// ============================================================

app.get(
  "/",
  (req, res) => {

    res.json({

      success: true,

      service:
        "Nexus Connect",

      company:
        "Nexus Buildsolutions Limited",

      status:
        "online",

      engine:
        "Nexus Connect Engine",

      version:
        "2.1.0",

      authentication:
        "enabled"

    });

  }
);


app.get(
  "/api/health",
  (req, res) => {

    res.json({

      success: true,

      database:
        mongoose.connection.readyState === 1
          ? "connected"
          : "disconnected",

      cloudinary:
        process.env.CLOUD_NAME
          ? "configured"
          : "missing",

      email:
        process.env.SMTP_USER
          ? "configured"
          : "missing",

      authentication:
        "enabled",

      timestamp:
        new Date().toISOString()

    });

  }
);


// ============================================================
// 20. REAL REGISTRATION
// ============================================================

app.post(
  "/api/auth/register",
  async (req, res) => {

    try {

      const {
        username,
        email,
        password
      } = req.body;


      if (
        !username ||
        !email ||
        !password
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Username, email and password are required."

        });

      }


      const cleanUsername =
        String(username).trim();


      const cleanEmail =
        String(email)
          .trim()
          .toLowerCase();


      if (
        !/^[a-zA-Z0-9._-]{3,40}$/
          .test(cleanUsername)
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Username must contain 3-40 letters, numbers, dots, underscores or hyphens."

        });

      }


      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
          .test(cleanEmail)
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Please provide a valid email address."

        });

      }


      if (
        String(password).length < 8
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Password must contain at least 8 characters."

        });

      }


      const existingUser =
        await User.findOne({

          $or: [

            {
              email:
                cleanEmail
            },

            {
              username:
                cleanUsername
            }

          ]

        });


      if (existingUser) {

        return res.status(409).json({

          success: false,

          message:
            "That username or email is already registered."

        });

      }


      const passwordHash =
        await bcrypt.hash(
          password,
          12
        );


      const verificationToken =
        generateVerificationToken();


      const verificationTokenHash =
        hashToken(
          verificationToken
        );


      const verificationExpiresAt =
        new Date(
          Date.now() +
          30 * 60 * 1000
        );


      const user =
        await User.create({

          username:
            cleanUsername,

          email:
            cleanEmail,

          passwordHash,

          emailVerified:
            false,

          verificationTokenHash,

          verificationExpiresAt

        });


      const verificationUrl =
        `${FRONTEND_URL}/?nexus_verify=${verificationToken}`;


      try {

        await sendNexusEmail({

          to:
            user.email,

          subject:
            "Verify your Nexus Connect account",

          title:
            "Verify Your Nexus Connect Account",

          greeting:
            `Hello ${user.username},`,

          message:
            "Your Nexus Connect account has been created successfully. Please verify your email address to activate your account and access secure communication.",

          buttonText:
            "VERIFY EMAIL",

          buttonUrl:
            verificationUrl

        });

      } catch (emailError) {

        await User.findByIdAndDelete(
          user._id
        );

        console.error(
          "VERIFICATION EMAIL FAILED:",
          emailError.message
        );

        return res.status(500).json({

          success: false,

          message:
            "Account could not be activated because the verification email could not be sent."

        });

      }


      return res.status(201).json({

        success: true,

        message:
          "Registration successful. Check your email to verify your account.",

        user: {

          id:
            user._id,

          username:
            user.username,

          email:
            user.email,

          emailVerified:
            false

        }

      });

    } catch (error) {

      console.error(
        "REGISTRATION ERROR:",
        error
      );

      return res.status(500).json({

        success: false,

        message:
          "Registration failed."

      });

    }

  }
);


// ============================================================
// 21. EMAIL VERIFICATION
// ============================================================

app.get(
  "/api/auth/verify",
  async (req, res) => {

    try {

      const token =
        String(
          req.query.token || ""
        ).trim();


      if (!token) {

        return res.status(400).send(
          "Invalid verification request."
        );

      }


      const tokenHash =
        hashToken(token);


      const user =
        await User.findOne({

          verificationTokenHash:
            tokenHash,

          verificationExpiresAt: {
            $gt: new Date()
          }

        }).select(
          "+verificationTokenHash +verificationExpiresAt"
        );


      if (!user) {

        return res.status(400).send(
          "This verification link is invalid or has expired."
        );

      }


      user.emailVerified =
        true;

      user.verificationTokenHash =
        null;

      user.verificationExpiresAt =
        null;


      await user.save();


      return res.redirect(
        `${FRONTEND_URL}/?verified=1`
      );

    } catch (error) {

      console.error(
        "EMAIL VERIFICATION ERROR:",
        error
      );

      return res.status(500).send(
        "Email verification failed."
      );

    }

  }
);


// ============================================================
// 22. RESEND VERIFICATION
// ============================================================

app.post(
  "/api/auth/resend-verification",
  async (req, res) => {

    try {

      const email =
        String(
          req.body.email || ""
        )
          .trim()
          .toLowerCase();


      if (!email) {

        return res.status(400).json({

          success: false,

          message:
            "Email is required."

        });

      }


      const user =
        await User.findOne({
          email
        }).select(
          "+verificationTokenHash +verificationExpiresAt"
        );


      if (!user) {

        return res.json({

          success: true,

          message:
            "If the account exists, a verification email has been sent."

        });

      }


      if (user.emailVerified) {

        return res.json({

          success: true,

          message:
            "This account is already verified."

        });

      }


      const verificationToken =
        generateVerificationToken();


      user.verificationTokenHash =
        hashToken(
          verificationToken
        );


      user.verificationExpiresAt =
        new Date(
          Date.now() +
          30 * 60 * 1000
        );


      await user.save();


      const verificationUrl =
        `${FRONTEND_URL}/?nexus_verify=${verificationToken}`;


      await sendNexusEmail({

        to:
          user.email,

        subject:
          "Verify your Nexus Connect account",

        title:
          "Verify Your Nexus Connect Account",

        greeting:
          `Hello ${user.username},`,

        message:
          "Use the button below to verify your Nexus Connect account.",

        buttonText:
          "VERIFY EMAIL",

        buttonUrl:
          verificationUrl

      });


      return res.json({

        success: true,

        message:
          "A new verification email has been sent."

      });

    } catch (error) {

      console.error(
        "RESEND VERIFICATION ERROR:",
        error
      );

      return res.status(500).json({

        success: false,

        message:
          "Unable to send verification email."

      });

    }

  }
);


// ============================================================
// 23. REAL LOGIN
// ============================================================

app.post(
  "/api/auth/login",
  async (req, res) => {

    try {

      const {
        email,
        password
      } = req.body;


      if (
        !email ||
        !password
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Email and password are required."

        });

      }


      const cleanEmail =
        String(email)
          .trim()
          .toLowerCase();


      const user =
        await User.findOne({
          email:
            cleanEmail
        })
        .select(
          "+passwordHash"
        );


      if (!user) {

        return res.status(401).json({

          success: false,

          message:
            "Invalid email or password."

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

          message:
            "Invalid email or password."

        });

      }


      if (!user.emailVerified) {

        return res.status(403).json({

          success: false,

          code:
            "EMAIL_NOT_VERIFIED",

          message:
            "Please verify your email before logging in."

        });

      }


      user.lastLoginAt =
        new Date();


      await user.save();


      const token =
        createAccessToken(
          user
        );


      setAuthCookie(
        res,
        token
      );


      return res.json({

        success: true,

        message:
          "Login successful.",

        user: {

          id:
            user._id,

          username:
            user.username,

          email:
            user.email,

          avatar:
            user.avatar,

          emailVerified:
            user.emailVerified

        }

      });

    } catch (error) {

      console.error(
        "LOGIN ERROR:",
        error
      );

      return res.status(500).json({

        success: false,

        message:
          "Login failed."

      });

    }

  }
);


// ============================================================
// 24. CURRENT SESSION
// ============================================================

app.get(
  "/api/auth/me",
  authenticateRequest,
  async (req, res) => {

    return res.json({

      success: true,

      authenticated:
        true,

      user: {

        id:
          req.user._id,

        username:
          req.user.username,

        email:
          req.user.email,

        avatar:
          req.user.avatar,

        emailVerified:
          req.user.emailVerified,

        lastLoginAt:
          req.user.lastLoginAt

      }

    });

  }
);


// ============================================================
// 25. LOGOUT
// ============================================================

app.post(
  "/api/auth/logout",
  (req, res) => {

    clearAuthCookie(
      res
    );


    return res.json({

      success: true,

      message:
        "Logged out successfully."

    });

  }
);


// ============================================================
// 26. PROTECTED USER DIRECTORY
// ============================================================

app.get(
  "/api/users",
  authenticateRequest,
  async (req, res) => {

    try {

      const users =
        await User.find({

          emailVerified:
            true,

          _id: {
            $ne:
              req.user._id
          }

        })
        .select(
          "username email avatar emailVerified"
        )
        .sort({
          username: 1
        });


      return res.json({

        success: true,

        users

      });

    } catch (error) {

      console.error(
        "USER DIRECTORY ERROR:",
        error
      );

      return res.status(500).json({

        success: false,

        message:
          "Unable to load users."

      });

    }

  }
);


// ============================================================
// 27. CLOUDINARY MEDIA UPLOAD
// PROTECTED — ONLY AUTHENTICATED USERS
// ============================================================

app.post(
  "/api/upload",
  authenticateRequest,
  upload.single("file"),
  async (req, res) => {

    try {

      if (!req.file) {

        return res.status(400).json({

          success: false,

          message:
            "No file supplied."

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

                    reject(
                      error
                    );

                  } else {

                    resolve(
                      result
                    );

                  }

                }

              );


            stream.end(
              req.file.buffer
            );

          }
        );


      return res.json({

        success: true,

        url:
          result.secure_url,

        publicId:
          result.public_id,

        resourceType:
          result.resource_type

      });

    } catch (error) {

      console.error(
        "UPLOAD ERROR:",
        error
      );

      return res.status(500).json({

        success: false,

        message:
          "Media upload failed."

      });

    }

  }
);


// ============================================================
// 28. SOCKET.IO AUTHENTICATION
// ============================================================

io.use(
  async (socket, next) => {

    try {

      const cookieHeader =
        socket.handshake.headers.cookie ||
        "";


      const cookies =
        Object.fromEntries(

          cookieHeader
            .split(";")
            .map(
              part =>
                part.trim()
            )
            .filter(Boolean)
            .map(
              part => {

                const index =
                  part.indexOf("=");

                if (index === -1) {
                  return [
                    part,
                    ""
                  ];
                }

                return [

                  part.slice(
                    0,
                    index
                  ),

                  decodeURIComponent(
                    part.slice(
                      index + 1
                    )
                  )

                ];

              }
            )

        );


      const token =
        cookies[COOKIE_NAME];


      if (!token) {

        return next(
          new Error(
            "Authentication required."
          )
        );

      }


      const decoded =
        jwt.verify(

          token,

          process.env.JWT_SECRET

        );


      const user =
        await User.findById(
          decoded.sub
        );


      if (!user) {

        return next(
          new Error(
            "User not found."
          )
        );

      }


      if (!user.emailVerified) {

        return next(
          new Error(
            "Email verification required."
          )
        );

      }


      socket.user = user;


      next();

    } catch (error) {

      next(
        new Error(
          "Invalid authentication session."
        )
      );

    }

  }
);


// ============================================================
// 29. SOCKET.IO REALTIME ENGINE
// ============================================================

io.on(
  "connection",
  (socket) => {

    console.log(

      "NEXUS SOCKET AUTHENTICATED:",

      socket.user.username,

      socket.id

    );


    socket.on(
      "joinRoom",
      (room) => {

        if (
          typeof room !== "string" ||
          !room.trim()
        ) {

          return;

        }


        socket.join(
          room.trim()
        );

      }
    );


    socket.on(
      "disconnect",
      () => {

        console.log(

          "NEXUS SOCKET DISCONNECTED:",

          socket.user.username

        );

      }
    );

  }
);


// ============================================================
// 30. GLOBAL ERROR HANDLER
// ============================================================

app.use(
  (error, req, res, next) => {

    console.error(
      "NEXUS SERVER ERROR:",
      error
    );


    if (
      res.headersSent
    ) {

      return next(
        error
      );

    }


    return res.status(500).json({

      success: false,

      message:
        "An internal server error occurred."

    });

  }
);


// ============================================================
// 31. START SERVER
// ============================================================

async function startServer() {

  try {

    await connectDatabase();

    await verifyEmailTransport();


    server.listen(

      PORT,

      () => {

        console.log(
          "=================================================="
        );

        console.log(
          "NEXUS CONNECT ENGINE LIVE"
        );

        console.log(
          "VERSION: 2.1.0"
        );

        console.log(
          `PORT: ${PORT}`
        );

        console.log(
          `FRONTEND: ${FRONTEND_URL}`
        );

        console.log(
          "MONGODB: READY"
        );

        console.log(
          "CLOUDINARY: READY"
        );

        console.log(
          "EMAIL: READY"
        );

        console.log(
          "JWT AUTHENTICATION: READY"
        );

        console.log(
          "SOCKET AUTHENTICATION: READY"
        );

        console.log(
          "=================================================="
        );

      }

    );

  } catch (error) {

    console.error(
      "NEXUS STARTUP FAILED:",
      error
    );

    process.exit(1);

  }

}


startServer();
