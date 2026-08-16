// ============================================================
// NEXUS CONNECT ENGINE
// Nexus Buildsolutions Limited
//
// PHASE 2A — ADVANCED REAL AUTHENTICATION & SECURITY
//
// AUTHENTICATION SYSTEM
// ------------------------------------------------------------
// Registration:
// Email + Desired Username + 4-Digit PIN
//
// Login:
// Email + 4-Digit PIN
//
// NO EMAIL VERIFICATION
// NO PASSWORD
// NO VERIFICATION LINK
//
// Security:
// Express
// MongoDB / Mongoose
// bcrypt PIN hashing
// JWT
// HTTP-only cookies
// Cloudinary
// Socket.IO
// Helmet
// CORS
// Rate Limiting
// Crypto
//
// Render-compatible CommonJS architecture
//
// VERSION: 3.0.0
// ============================================================


require("dotenv").config();


const express =
  require("express");

const http =
  require("http");

const mongoose =
  require("mongoose");

const cloudinary =
  require("cloudinary").v2;

const multer =
  require("multer");

const cors =
  require("cors");

const helmet =
  require("helmet");

const cookieParser =
  require("cookie-parser");

const bcrypt =
  require("bcrypt");

const jwt =
  require("jsonwebtoken");

const crypto =
  require("crypto");

const rateLimit =
  require("express-rate-limit");

const {
  Server
} =
  require("socket.io");


// ============================================================
// 1. APPLICATION
// ============================================================


const app =
  express();


const server =
  http.createServer(app);


const PORT =
  Number(
    process.env.PORT || 10000
  );


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
  new Server(
    server,
    {

      cors: {

        origin:
          FRONTEND_URL,

        credentials:
          true,

        methods: [
          "GET",
          "POST"
        ]

      }

    }
  );


// ============================================================
// 3. SECURITY MIDDLEWARE
// ============================================================


app.use(
  helmet(
    {

      crossOriginResourcePolicy: {

        policy:
          "cross-origin"

      }

    }
  )
);


app.use(
  cors(
    {

      origin:
        FRONTEND_URL,

      credentials:
        true,

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

    }
  )
);


app.use(
  cookieParser()
);


app.use(
  express.json(
    {

      limit:
        "10mb"

    }
  )
);


app.use(
  express.urlencoded(
    {

      extended:
        true,

      limit:
        "10mb"

    }
  )
);


// ============================================================
// 4. RATE LIMITING
// ============================================================


const generalLimiter =
  rateLimit(
    {

      windowMs:
        15 * 60 * 1000,

      limit:
        300,

      standardHeaders:
        true,

      legacyHeaders:
        false,

      message: {

        success:
          false,

        message:
          "Too many requests. Please try again later."

      }

    }
  );


const authLimiter =
  rateLimit(
    {

      windowMs:
        15 * 60 * 1000,

      limit:
        20,

      standardHeaders:
        true,

      legacyHeaders:
        false,

      message: {

        success:
          false,

        message:
          "Too many authentication attempts. Please try again later."

      }

    }
  );


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

  "JWT_SECRET"

];


const missingEnvironmentVariables =
  requiredEnvironmentVariables.filter(
    (key) =>
      !process.env[key]
  );


if (
  missingEnvironmentVariables.length
) {

  console.error(
    "=================================================="
  );

  console.error(
    "NEXUS CONFIGURATION WARNING"
  );

  console.error(
    "Missing environment variables:"
  );

  console.error(
    missingEnvironmentVariables.join(
      ", "
    )
  );

  console.error(
    "=================================================="
  );

}


// ============================================================
// 6. CLOUDINARY
// ============================================================


cloudinary.config(
  {

    cloud_name:
      process.env.CLOUD_NAME,

    api_key:
      process.env.CLOUD_KEY,

    api_secret:
      process.env.CLOUD_SECRET

  }
);


const upload =
  multer(
    {

      storage:
        multer.memoryStorage(),

      limits: {

        fileSize:
          50 * 1024 * 1024

      }

    }
  );


// ============================================================
// 7. USER DATABASE MODEL
// ============================================================


const userSchema =
  new mongoose.Schema(

    {

      username: {

        type:
          String,

        required:
          true,

        unique:
          true,

        trim:
          true,

        minlength:
          3,

        maxlength:
          40,

        index:
          true

      },


      email: {

        type:
          String,

        required:
          true,

        unique:
          true,

        lowercase:
          true,

        trim:
          true,

        index:
          true

      },


      // ------------------------------------------------------
      // SECURITY
      // ------------------------------------------------------
      // The user's 4-digit PIN is NEVER stored directly.
      //
      // Only the bcrypt hash is stored.
      // ------------------------------------------------------


      pinHash: {

        type:
          String,

        required:
          true,

        select:
          false

      },


      avatar: {

        type:
          String,

        default:
          ""

      },


      lastLoginAt: {

        type:
          Date,

        default:
          null

      }

    },

    {

      timestamps:
        true

    }

  );


// ============================================================
// 8. MESSAGE MODEL
// ============================================================


const messageSchema =
  new mongoose.Schema(

    {

      from: {

        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        required:
          true,

        index:
          true

      },


      to: {

        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        default:
          null,

        index:
          true

      },


      room: {

        type:
          String,

        required:
          true,

        index:
          true

      },


      text: {

        type:
          String,

        default:
          "",

        maxlength:
          10000

      },


      fileUrl: {

        type:
          String,

        default:
          ""

      },


      fileType: {

        type:
          String,

        default:
          ""

      },


      messageType: {

        type:
          String,

        enum: [

          "text",
          "image",
          "file",
          "voice",
          "system"

        ],

        default:
          "text"

      }

    },

    {

      timestamps:
        true

    }

  );


// ============================================================
// 9. GROUP MODEL
// ============================================================


const groupSchema =
  new mongoose.Schema(

    {

      name: {

        type:
          String,

        required:
          true,

        trim:
          true,

        maxlength:
          100

      },


      members: [

        {

          type:
            mongoose.Schema.Types.ObjectId,

          ref:
            "User"

        }

      ],


      createdBy: {

        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        required:
          true

      }

    },

    {

      timestamps:
        true

    }

  );


// ============================================================
// 10. ACTIVITY MODEL
// ============================================================
//
// Stores personal Connect activity for authenticated users.
// This allows the frontend to display a user's activity feed.
//
// Examples:
// account_created
// login
// logout
// message
// upload
// group_created
//
// ============================================================


const activitySchema =
  new mongoose.Schema(

    {

      user: {

        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          "User",

        required:
          true,

        index:
          true

      },


      type: {

        type:
          String,

        required:
          true,

        maxlength:
          100

      },


      title: {

        type:
          String,

        default:
          "",

        maxlength:
          200

      },


      description: {

        type:
          String,

        default:
          "",

        maxlength:
          1000

      },


      metadata: {

        type:
          mongoose.Schema.Types.Mixed,

        default:
          {}

      }

    },

    {

      timestamps:
        true

    }

  );


// ============================================================
// 11. MODELS
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


const Activity =
  mongoose.model(
    "Activity",
    activitySchema
  );


// ============================================================
// 12. DATABASE
// ============================================================


async function connectDatabase() {

  try {

    if (
      !process.env.MONGO_URI
    ) {

      throw new Error(
        "MONGO_URI is missing."
      );

    }


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
// 13. SECURITY HELPERS
// ============================================================


function createAccessToken(
  user
) {

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
// 14. SESSION COOKIE
// ============================================================


function setAuthCookie(
  res,
  token
) {

  res.cookie(

    COOKIE_NAME,

    token,

    {

      httpOnly:
        true,

      secure:
        true,

      sameSite:
        "none",

      maxAge:
        7 *
        24 *
        60 *
        60 *
        1000,

      path:
        "/"

    }

  );

}


function clearAuthCookie(
  res
) {

  res.clearCookie(

    COOKIE_NAME,

    {

      httpOnly:
        true,

      secure:
        true,

      sameSite:
        "none",

      path:
        "/"

    }

  );

}


// ============================================================
// 15. PIN VALIDATION
// ============================================================


function isValidPin(
  pin
) {

  return /^\d{4}$/.test(
    String(pin)
  );

}


// ============================================================
// 16. USERNAME VALIDATION
// ============================================================


function isValidUsername(
  username
) {

  return /^[a-zA-Z0-9._-]{3,40}$/.test(
    String(username)
  );

}


// ============================================================
// 17. EMAIL VALIDATION
// ============================================================


function isValidEmail(
  email
) {

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(email)
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
      req.cookies[
        COOKIE_NAME
      ];


    if (!token) {

      return res.status(401).json({

        success:
          false,

        authenticated:
          false,

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

      clearAuthCookie(
        res
      );

      return res.status(401).json({

        success:
          false,

        authenticated:
          false,

        message:
          "Account no longer exists."

      });

    }


    req.user =
      user;


    next();

  } catch (error) {

    clearAuthCookie(
      res
    );

    return res.status(401).json({

      success:
        false,

      authenticated:
        false,

      message:
        "Invalid or expired session."

    });

  }

}


// ============================================================
// 19. ACTIVITY HELPER
// ============================================================


async function recordActivity({

  userId,

  type,

  title,

  description,

  metadata

}) {

  try {

    await Activity.create({

      user:
        userId,

      type:
        type || "system",

      title:
        title || "",

      description:
        description || "",

      metadata:
        metadata || {}

    });

  } catch (error) {

    console.error(
      "ACTIVITY RECORD ERROR:",
      error.message
    );

  }

}


// ============================================================
// 20. PUBLIC HEALTH CHECK
// ============================================================


app.get(
  "/",
  (req, res) => {

    res.json({

      success:
        true,

      service:
        "Nexus Connect",

      company:
        "Nexus Buildsolutions Limited",

      status:
        "online",

      engine:
        "Nexus Connect Engine",

      version:
        "3.0.0",

      authentication:
        "email + username + 4-digit PIN",

      emailVerification:
        false,

      passwordAuthentication:
        false,

      socketAuthentication:
        true,

      cloudinary:
        Boolean(
          process.env.CLOUD_NAME
        )

    });

  }
);


// ============================================================
// 21. API HEALTH CHECK
// ============================================================


app.get(
  "/api/health",
  (req, res) => {

    res.json({

      success:
        true,

      database:
        mongoose.connection.readyState === 1
          ? "connected"
          : "disconnected",

      cloudinary:
        process.env.CLOUD_NAME
          ? "configured"
          : "missing",

      authentication:
        "email + username + 4-digit PIN",

      emailVerification:
        "disabled",

      password:
        "disabled",

      jwt:
        process.env.JWT_SECRET
          ? "configured"
          : "missing",

      socket:
        "enabled",

      timestamp:
        new Date().toISOString()

    });

  }
);


// ============================================================
// 22. REAL REGISTRATION
// ============================================================
//
// REGISTER WITH:
//
// email
// username
// pin
// confirmPin
//
// NO EMAIL VERIFICATION
// NO PASSWORD
//
// ============================================================


app.post(
  "/api/auth/register",
  async (req, res) => {

    try {

      const {

        username,

        email,

        pin,

        confirmPin

      } =
        req.body;


      // ------------------------------------------------------
      // REQUIRED FIELDS
      // ------------------------------------------------------


      if (
        !username ||
        !email ||
        !pin
      ) {

        return res.status(400).json({

          success:
            false,

          message:
            "Email, username and 4-digit PIN are required."

        });

      }


      // ------------------------------------------------------
      // CLEAN INPUT
      // ------------------------------------------------------


      const cleanUsername =
        String(
          username
        ).trim();


      const cleanEmail =
        String(
          email
        )
          .trim()
          .toLowerCase();


      const cleanPin =
        String(
          pin
        ).trim();


      // ------------------------------------------------------
      // USERNAME VALIDATION
      // ------------------------------------------------------


      if (
        !isValidUsername(
          cleanUsername
        )
      ) {

        return res.status(400).json({

          success:
            false,

          message:
            "Username must contain 3-40 letters, numbers, dots, underscores or hyphens."

        });

      }


      // ------------------------------------------------------
      // EMAIL VALIDATION
      // ------------------------------------------------------


      if (
        !isValidEmail(
          cleanEmail
        )
      ) {

        return res.status(400).json({

          success:
            false,

          message:
            "Please provide a valid email address."

        });

      }


      // ------------------------------------------------------
      // PIN VALIDATION
      // ------------------------------------------------------


      if (
        !isValidPin(
          cleanPin
        )
      ) {

        return res.status(400).json({

          success:
            false,

          message:
            "PIN must be exactly 4 digits."

        });

      }


      // ------------------------------------------------------
      // CONFIRM PIN
      // ------------------------------------------------------


      if (
        confirmPin !== undefined &&
        String(
          confirmPin
        ) !== cleanPin
      ) {

        return res.status(400).json({

          success:
            false,

          message:
            "PIN confirmation does not match."

        });

      }


      // ------------------------------------------------------
      // CHECK EXISTING USER
      // ------------------------------------------------------


      const existingUser =
        await User.findOne(

          {

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

          }

        );


      if (
        existingUser
      ) {

        if (
          existingUser.email ===
          cleanEmail
        ) {

          return res.status(409).json({

            success:
              false,

            code:
              "EMAIL_ALREADY_REGISTERED",

            message:
              "That email address is already registered."

          });

        }


        if (
          existingUser.username ===
          cleanUsername
        ) {

          return res.status(409).json({

            success:
              false,

            code:
              "USERNAME_ALREADY_TAKEN",

            message:
              "That username is already taken. Please choose another username."

          });

        }


        return res.status(409).json({

          success:
            false,

          message:
            "That account already exists."

        });

      }


      // ------------------------------------------------------
      // HASH 4-DIGIT PIN
      // ------------------------------------------------------
      //
      // IMPORTANT:
      // We NEVER save the raw PIN.
      //
      // bcrypt creates a secure one-way hash.
      // ------------------------------------------------------


      const pinHash =
        await bcrypt.hash(

          cleanPin,

          12

        );


      // ------------------------------------------------------
      // CREATE USER
      // ------------------------------------------------------


      const user =
        await User.create({

          username:
            cleanUsername,

          email:
            cleanEmail,

          pinHash,

          avatar:
            ""

        });


      // ------------------------------------------------------
      // RECORD ACTIVITY
      // ------------------------------------------------------


      await recordActivity({

        userId:
          user._id,

        type:
          "account_created",

        title:
          "Connect account created",

        description:
          "Your Nexus Connect personal account was created successfully."

      });


      // ------------------------------------------------------
      // CREATE SESSION IMMEDIATELY
      // ------------------------------------------------------
      //
      // User does NOT need to verify email.
      //
      // Registration automatically authenticates the user.
      // ------------------------------------------------------


      const token =
        createAccessToken(
          user
        );


      setAuthCookie(
        res,
        token
      );


      // ------------------------------------------------------
      // RESPONSE
      // ------------------------------------------------------


      return res.status(201).json({

        success:
          true,

        authenticated:
          true,

        message:
          "Account created successfully. Welcome to Nexus Connect.",

        redirect:
          "connect",

        user: {

          id:
            user._id,

          username:
            user.username,

          email:
            user.email,

          avatar:
            user.avatar

        }

      });

    } catch (error) {

      console.error(
        "REGISTRATION ERROR:",
        error
      );


      // ------------------------------------------------------
      // DUPLICATE DATABASE ERROR
      // ------------------------------------------------------


      if (
        error.code === 11000
      ) {

        const duplicateField =
          Object.keys(
            error.keyPattern ||
            {}
          )[0];


        if (
          duplicateField ===
          "email"
        ) {

          return res.status(409).json({

            success:
              false,

            code:
              "EMAIL_ALREADY_REGISTERED",

            message:
              "That email address is already registered."

          });

        }


        if (
          duplicateField ===
          "username"
        ) {

          return res.status(409).json({

            success:
              false,

            code:
              "USERNAME_ALREADY_TAKEN",

            message:
              "That username is already taken."

          });

        }

      }


      return res.status(500).json({

        success:
          false,

        message:
          "Registration failed. Please try again."

      });

    }

  }
);


// ============================================================
// 23. REAL LOGIN
// ============================================================
//
// LOGIN WITH:
//
// email
// pin
//
// NO PASSWORD
// NO EMAIL VERIFICATION
//
// ============================================================


app.post(
  "/api/auth/login",
  async (req, res) => {

    try {

      const {

        email,

        pin

      } =
        req.body;


      // ------------------------------------------------------
      // REQUIRED FIELDS
      // ------------------------------------------------------


      if (
        !email ||
        !pin
      ) {

        return res.status(400).json({

          success:
            false,

          message:
            "Email and 4-digit PIN are required."

        });

      }


      // ------------------------------------------------------
      // CLEAN INPUT
      // ------------------------------------------------------


      const cleanEmail =
        String(
          email
        )
          .trim()
          .toLowerCase();


      const cleanPin =
        String(
          pin
        ).trim();


      // ------------------------------------------------------
      // EMAIL VALIDATION
      // ------------------------------------------------------


      if (
        !isValidEmail(
          cleanEmail
        )
      ) {

        return res.status(400).json({

          success:
            false,

          message:
            "Please provide a valid email address."

        });

      }


      // ------------------------------------------------------
      // PIN VALIDATION
      // ------------------------------------------------------


      if (
        !isValidPin(
          cleanPin
        )
      ) {

        return res.status(400).json({

          success:
            false,

          message:
            "PIN must be exactly 4 digits."

        });

      }


      // ------------------------------------------------------
      // FIND USER
      // ------------------------------------------------------


      const user =
        await User.findOne({

          email:
            cleanEmail

        })
          .select(
            "+pinHash"
          );


      // ------------------------------------------------------
      // ACCOUNT NOT FOUND
      // ------------------------------------------------------


      if (
        !user
      ) {

        return res.status(401).json({

          success:
            false,

          message:
            "Invalid email or PIN."

        });

      }


      // ------------------------------------------------------
      // VERIFY PIN
      // ------------------------------------------------------


      const pinCorrect =
        await bcrypt.compare(

          cleanPin,

          user.pinHash

        );


      if (
        !pinCorrect
      ) {

        return res.status(401).json({

          success:
            false,

          message:
            "Invalid email or PIN."

        });

      }


      // ------------------------------------------------------
      // UPDATE LAST LOGIN
      // ------------------------------------------------------


      user.lastLoginAt =
        new Date();


      await user.save();


      // ------------------------------------------------------
      // CREATE JWT SESSION
      // ------------------------------------------------------


      const token =
        createAccessToken(
          user
        );


      setAuthCookie(
        res,
        token
      );


      // ------------------------------------------------------
      // RECORD LOGIN ACTIVITY
      // ------------------------------------------------------


      await recordActivity({

        userId:
          user._id,

        type:
          "login",

        title:
          "Successful login",

        description:
          "You successfully signed in to Nexus Connect."

      });


      // ------------------------------------------------------
      // SUCCESS
      // ------------------------------------------------------


      return res.json({

        success:
          true,

        authenticated:
          true,

        message:
          "Login successful. Welcome back.",

        redirect:
          "connect",

        user: {

          id:
            user._id,

          username:
            user.username,

          email:
            user.email,

          avatar:
            user.avatar

        }

      });

    } catch (error) {

      console.error(
        "LOGIN ERROR:",
        error
      );


      return res.status(500).json({

        success:
          false,

        message:
          "Login failed. Please try again."

      });

    }

  }
);


// ============================================================
// 24. CURRENT SESSION
// ============================================================
//
// FRONTEND SHOULD CALL THIS FIRST WHEN CONNECT PAGE LOADS.
//
// 200 = logged in
// 401 = show registration/login screen
//
// ============================================================


app.get(
  "/api/auth/me",
  authenticateRequest,
  async (req, res) => {

    return res.json({

      success:
        true,

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

        lastLoginAt:
          req.user.lastLoginAt,

        createdAt:
          req.user.createdAt

      }

    });

  }
);


// ============================================================
// 25. LOGOUT
// ============================================================


app.post(
  "/api/auth/logout",
  authenticateRequest,
  async (req, res) => {

    try {

      await recordActivity({

        userId:
          req.user._id,

        type:
          "logout",

        title:
          "Logged out",

        description:
          "You signed out of Nexus Connect."

      });

    } catch (error) {

      console.error(
        "LOGOUT ACTIVITY ERROR:",
        error.message
      );

    }


    clearAuthCookie(
      res
    );


    return res.json({

      success:
        true,

      authenticated:
        false,

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

          _id: {

            $ne:
              req.user._id

          }

        })
          .select(
            "username email avatar"
          )
          .sort({

            username:
              1

          });


      return res.json({

        success:
          true,

        users

      });

    } catch (error) {

      console.error(
        "USER DIRECTORY ERROR:",
        error
      );


      return res.status(500).json({

        success:
          false,

        message:
          "Unable to load users."

      });

    }

  }
);


// ============================================================
// 27. PERSONAL ACTIVITY FEED
// ============================================================
//
// Returns activities belonging ONLY to the authenticated user.
//
// ============================================================


app.get(
  "/api/activities",
  authenticateRequest,
  async (req, res) => {

    try {

      const limit =
        Math.min(

          Math.max(

            Number(
              req.query.limit || 50
            ),

            1

          ),

          100

        );


      const activities =
        await Activity.find({

          user:
            req.user._id

        })
          .sort({

            createdAt:
              -1

          })
          .limit(
            limit
          )
          .lean();


      return res.json({

        success:
          true,

        activities

      });

    } catch (error) {

      console.error(
        "ACTIVITY FEED ERROR:",
        error
      );


      return res.status(500).json({

        success:
          false,

        message:
          "Unable to load personal activities."

      });

    }

  }
);


// ============================================================
// 28. PERSONAL PROFILE
// ============================================================


app.get(
  "/api/profile",
  authenticateRequest,
  async (req, res) => {

    return res.json({

      success:
        true,

      profile: {

        id:
          req.user._id,

        username:
          req.user.username,

        email:
          req.user.email,

        avatar:
          req.user.avatar,

        createdAt:
          req.user.createdAt,

        lastLoginAt:
          req.user.lastLoginAt

      }

    });

  }
);


// ============================================================
// 29. CLOUDINARY MEDIA UPLOAD
// PROTECTED — AUTHENTICATED USERS ONLY
// ============================================================


app.post(
  "/api/upload",
  authenticateRequest,
  upload.single("file"),
  async (req, res) => {

    try {

      if (
        !req.file
      ) {

        return res.status(400).json({

          success:
            false,

          message:
            "No file supplied."

        });

      }


      const result =
        await new Promise(

          (resolve, reject) => {

            const stream =
              cloudinary
                .uploader
                .upload_stream(

                  {

                    resource_type:
                      "auto"

                  },

                  (
                    error,
                    result
                  ) => {

                    if (
                      error
                    ) {

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


      // ------------------------------------------------------
      // RECORD UPLOAD ACTIVITY
      // ------------------------------------------------------


      await recordActivity({

        userId:
          req.user._id,

        type:
          "upload",

        title:
          "Media uploaded",

        description:
          "A file was uploaded to Nexus Connect.",

        metadata: {

          resourceType:
            result.resource_type,

          publicId:
            result.public_id

        }

      });


      return res.json({

        success:
          true,

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

        success:
          false,

        message:
          "Media upload failed."

      });

    }

  }
);


// ============================================================
// 30. SOCKET.IO AUTHENTICATION
// ============================================================


io.use(
  async (
    socket,
    next
  ) => {

    try {

      const cookieHeader =
        socket
          .handshake
          .headers
          .cookie ||
        "";


      const cookies =
        Object.fromEntries(

          cookieHeader

            .split(";")

            .map(
              part =>
                part.trim()
            )

            .filter(
              Boolean
            )

            .map(
              part => {

                const index =
                  part.indexOf("=");


                if (
                  index === -1
                ) {

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
        cookies[
          COOKIE_NAME
        ];


      if (
        !token
      ) {

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


      if (
        !user
      ) {

        return next(

          new Error(
            "User not found."
          )

        );

      }


      socket.user =
        user;


      next();

    } catch (error) {

      console.error(
        "SOCKET AUTH ERROR:",
        error.message
      );


      next(

        new Error(
          "Invalid authentication session."
        )

      );

    }

  }
);


// ============================================================
// 31. SOCKET.IO REALTIME ENGINE
// ============================================================


io.on(
  "connection",
  (socket) => {

    console.log(

      "NEXUS SOCKET AUTHENTICATED:",

      socket.user.username,

      socket.id

    );


    // --------------------------------------------------------
    // JOIN ROOM
    // --------------------------------------------------------


    socket.on(
      "joinRoom",
      (room) => {

        if (

          typeof room !==
            "string" ||

          !room.trim()

        ) {

          return;

        }


        socket.join(
          room.trim()
        );

      }
    );


    // --------------------------------------------------------
    // LEAVE ROOM
    // --------------------------------------------------------


    socket.on(
      "leaveRoom",
      (room) => {

        if (

          typeof room !==
            "string" ||

          !room.trim()

        ) {

          return;

        }


        socket.leave(
          room.trim()
        );

      }
    );


    // --------------------------------------------------------
    // DISCONNECT
    // --------------------------------------------------------


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
// 32. GLOBAL ERROR HANDLER
// ============================================================


app.use(
  (
    error,
    req,
    res,
    next
  ) => {

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

      success:
        false,

      message:
        "An internal server error occurred."

    });

  }
);


// ============================================================
// 33. START SERVER
// ============================================================


async function startServer() {

  try {

    await connectDatabase();


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
          "VERSION: 3.0.0"
        );


        console.log(
          `PORT: ${PORT}`
        );


        console.log(
          `FRONTEND: ${FRONTEND_URL}`
        );


        console.log(
          "=================================================="
        );


        console.log(
          "AUTHENTICATION: EMAIL + USERNAME + 4-DIGIT PIN"
        );


        console.log(
          "PASSWORD AUTHENTICATION: DISABLED"
        );


        console.log(
          "EMAIL VERIFICATION: DISABLED"
        );


        console.log(
          "JWT AUTHENTICATION: READY"
        );


        console.log(
          "HTTP-ONLY SESSION COOKIE: READY"
        );


        console.log(
          "MONGODB: READY"
        );


        console.log(
          "CLOUDINARY: READY"
        );


        console.log(
          "SOCKET.IO: READY"
        );


        console.log(
          "PERSONAL ACTIVITY ENGINE: READY"
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
