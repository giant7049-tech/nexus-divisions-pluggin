// ============================================================
// NEXUS CONNECT ENGINE
// Nexus Buildsolutions Limited
// Secure Real-Time Communication Platform
//
// Architecture:
// Express + MongoDB/Mongoose + Cloudinary + Socket.IO
// Nodemailer + JWT + bcrypt + security middleware
// Render compatible / CommonJS
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
const { Server } = require("socket.io");
const rateLimit = require("express-rate-limit");


// ============================================================
// 1. APPLICATION CONFIGURATION
// ============================================================

const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT || 10000);

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  "https://nexusbuildsolutions.rf.gd";

const NEXUS_LOGO_URL =
  "https://nexusbuildsolutions.rf.gd/wp-content/uploads/2026/08/cropped-Screenshot-2025-09-29-122409.png";


// ============================================================
// 2. SOCKET.IO
// ============================================================

const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"]
  }
});


// ============================================================
// 3. SECURITY / MIDDLEWARE
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
    origin: true,
    credentials: true
  })
);

app.use(cookieParser());

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

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false
});

app.use("/api", generalLimiter);

app.use("/api/auth", authLimiter);


// ============================================================
// 5. ENVIRONMENT VALIDATION
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

if (missingEnvironmentVariables.length > 0) {

  console.error(
    "MISSING ENVIRONMENT VARIABLES:",
    missingEnvironmentVariables.join(", ")
  );

}


// ============================================================
// 6. CLOUDINARY
// ============================================================

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});


// ============================================================
// 7. EMAIL ENGINE
// Nexus Buildsolutions Limited
// ============================================================

const transporter = nodemailer.createTransport({

  host:
    process.env.SMTP_HOST ||
    "smtp.gmail.com",

  port:
    Number(process.env.SMTP_PORT || 465),

  secure:
    String(
      process.env.SMTP_SECURE || "true"
    ).toLowerCase() === "true",

  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }

});


// ============================================================
// 8. EMAIL TRANSPORT VERIFICATION
// ============================================================

async function verifyEmailTransport() {

  try {

    await transporter.verify();

    console.log(
      "NEXUS EMAIL: SMTP CONNECTION READY"
    );

  } catch (error) {

    console.error(
      "NEXUS EMAIL: SMTP ERROR:",
      error.message
    );

  }

}


// ============================================================
// 9. PROFESSIONAL NEXUS EMAIL TEMPLATE
// ============================================================

function nexusEmailTemplate({

  title,
  greeting,
  message,
  buttonText,
  buttonUrl,
  footerMessage =
    "Nexus Buildsolutions Limited"

}) {

  return `

<!DOCTYPE html>

<html lang="en">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>${title}</title>

<style>

body {
  margin: 0;
  padding: 0;
  background: #f4f7f6;
  font-family:
    Arial,
    Helvetica,
    sans-serif;
  color: #17211f;
}

.email-wrapper {
  width: 100%;
  padding: 40px 15px;
  box-sizing: border-box;
}

.email-card {
  max-width: 620px;
  margin: 0 auto;
  background: #ffffff;
  border-radius: 20px;
  overflow: hidden;

  box-shadow:
    0 12px 40px
    rgba(0, 0, 0, 0.08);
}

.header {
  background:
    linear-gradient(
      135deg,
      #063d2e,
      #008f5a
    );

  padding: 35px 25px;
  text-align: center;
}

.logo {
  width: 120px;
  max-width: 45%;
  height: auto;
  background: #ffffff;
  padding: 8px;
  border-radius: 12px;
}

.brand {
  margin-top: 15px;
  color: #ffffff;
  font-size: 21px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.content {
  padding: 40px 35px;
}

h1 {
  margin-top: 0;
  color: #063d2e;
  font-size: 28px;
  line-height: 1.3;
}

p {
  color: #4b5754;
  font-size: 15px;
  line-height: 1.7;
}

.action {
  text-align: center;
  margin: 32px 0;
}

.button {
  display: inline-block;
  padding: 15px 28px;

  background: #008f5a;
  color: #ffffff !important;

  text-decoration: none;

  border-radius: 10px;

  font-weight: 700;
}

.security {
  margin-top: 25px;
  padding: 15px;

  background: #f1f8f5;

  border-radius: 10px;

  color: #52625d;

  font-size: 13px;
  line-height: 1.6;
}

.footer {
  border-top:
    1px solid #e5ebe8;

  padding: 22px;

  text-align: center;

  color: #77817e;

  font-size: 12px;
  line-height: 1.6;
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

${
  buttonUrl
    ? `

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

`
    : ""
}

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

${footerMessage}

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
// 10. CENTRAL EMAIL SENDER
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

${buttonUrl || ""}

Nexus Buildsolutions Limited
Nexus Connect`

    });


  console.log(
    "NEXUS EMAIL SENT:",
    info.messageId,
    "TO:",
    to
  );


  return info;

}


// ============================================================
// 11. MONGOOSE DATABASE MODELS
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
        required: true
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
        default: null
      },

      verificationExpiresAt: {
        type: Date,
        default: null
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


const messageSchema =
  new mongoose.Schema(

    {

      from: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
      },

      to: {
        type: mongoose.Schema.Types.ObjectId,
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
// 12. DATABASE CONNECTION
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
// 13. JWT HELPER
// ============================================================

function createAccessToken(user) {

  return jwt.sign(

    {
      sub: user._id.toString(),
      username: user.username,
      email: user.email
    },

    process.env.JWT_SECRET,

    {
      expiresIn:
        process.env.JWT_EXPIRES_IN ||
        "7d"
    }

  );

}


// ============================================================
// 14. BASIC HEALTH CHECK
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
        "2.0.0"

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

      email:
        "configured",

      cloudinary:
        process.env.CLOUD_NAME
          ? "configured"
          : "missing",

      timestamp:
        new Date().toISOString()

    });

  }
);


// ============================================================
// 15. AUTHENTICATION — REGISTRATION FOUNDATION
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


      if (password.length < 8) {

        return res.status(400).json({

          success: false,

          message:
            "Password must contain at least 8 characters."

        });

      }


      const normalizedEmail =
        email.trim().toLowerCase();

      const normalizedUsername =
        username.trim();


      const existingUser =
        await User.findOne({

          $or: [
            {
              email:
                normalizedEmail
            },

            {
              username:
                normalizedUsername
            }
          ]

        });


      if (existingUser) {

        return res.status(409).json({

          success: false,

          message:
            "Username or email is already registered."

        });

      }


      const passwordHash =
        await bcrypt.hash(
          password,
          12
        );


      const user =
        await User.create({

          username:
            normalizedUsername,

          email:
            normalizedEmail,

          passwordHash,

          emailVerified:
            false

        });


      return res.status(201).json({

        success: true,

        message:
          "Account created. Email verification will be completed in the authentication layer.",

        user: {

          id:
            user._id,

          username:
            user.username,

          email:
            user.email,

          emailVerified:
            user.emailVerified

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
// 16. CLOUDINARY UPLOAD FOUNDATION
// ============================================================

app.post(
  "/api/upload",
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
                    reject(error);
                  } else {
                    resolve(result);
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
// 17. SOCKET.IO REALTIME FOUNDATION
// ============================================================

io.on(
  "connection",
  (socket) => {

    console.log(
      "NEXUS SOCKET CONNECTED:",
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
          socket.id
        );

      }
    );

  }
);


// ============================================================
// 18. GLOBAL ERROR HANDLER
// ============================================================

app.use(
  (error, req, res, next) => {

    console.error(
      "NEXUS SERVER ERROR:",
      error
    );


    if (res.headersSent) {
      return next(error);
    }


    return res.status(500).json({

      success: false,

      message:
        "An internal server error occurred."

    });

  }
);


// ============================================================
// 19. STARTUP
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
          "EMAIL ENGINE: READY"
        );

        console.log(
          "SOCKET.IO: READY"
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
