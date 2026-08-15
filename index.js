require('dotenv').config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const cloudinary = require("cloudinary").v2;
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
  cors: { 
    origin: "*", 
    methods: ["GET", "POST"] 
  } 
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 1. CONNECT CLOUDINARY
cloudinary.config({
  cloudinary_url: process.env.CLOUDINARY_URL
});

// 2. CONNECT MONGODB
mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.log("❌ DB Error:", err));

// 3. MESSAGE SCHEMA - NOW SAVES FILE URLS
const MessageSchema = new mongoose.Schema({
  from: { type: String, required: true },
  to: { type: String },
  group: { type: String },
  text: { type: String },
  type: { type: String, default: "text" }, // text, image, audio, video, file
  fileUrl: { type: String }, // Cloudinary permanent link
  fileName: { type: String },
  timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model("Message", MessageSchema);

// 4. FILE UPLOAD SETUP
const storage = multer.diskStorage({ 
  destination: '/tmp/', 
  filename: (req, file, cb) => cb(null, uuidv4() + "-" + file.originalname) 
});
const upload = multer({ storage });

// 5. UPLOAD ROUTE -> SENDS TO CLOUDINARY
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    
    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: "auto", // auto detects image, video, audio
      folder: "nexus_uploads",
      use_filename: true
    });

    // delete temp file
    fs.unlinkSync(req.file.path);

    res.json({ 
      success: true,
      url: result.secure_url,
      public_id: result.public_id,
      type: result.resource_type,
      message: "Uploaded to Cloudinary - Permanent" 
    });
  } catch (err) {
    console.log("Upload Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 6. GET CHAT HISTORY
app.get("/messages/:userId", async (req, res) => {
  const messages = await Message.find({
    $or: [{ from: req.params.userId }, { to: req.params.userId }]
  }).sort({ timestamp: 1 }).limit(100);
  res.json(messages);
});

// 7. HEALTH CHECK
app.get("/", (req, res) => {
  res.json({ 
    status: "Nexus Pro Engine v4.0 Cloudinary Live",
    cloudinary: "Connected",
    db: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected"
  });
});

// 8. SOCKET.IO REALTIME CHAT
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join", (userId) => {
    socket.join(userId);
    console.log("User joined room:", userId);
  });

  socket.on("sendMessage", async (data) => {
    try {
      const msg = new Message(data);
      await msg.save();
      
      // send to receiver
      if(data.to) io.to(data.to).emit("newMessage", msg);
      // send back to sender
      if(data.from) io.to(data.from).emit("newMessage", msg);
      // send to group
      if(data.group) io.to(data.group).emit("newMessage", msg);
      
    } catch (err) {
      console.log("Socket Error:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Nexus running on port ${PORT}`));
