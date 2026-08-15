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
const bcrypt = require("bcrypt"); 

const app = express(); 
const server = http.createServer(app); 
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } }); 

app.use(cors()); 
app.use(express.json({ limit: '50mb' })); 

// 1. CONNECT CLOUDINARY 
cloudinary.config({ cloudinary_url: process.env.CLOUDINARY_URL }); 

// 2. CONNECT MONGODB 
mongoose.connect(process.env.MONGODB_URI) 
.then(() => console.log("✅ MongoDB Connected")) 
.catch(err => console.log("❌ DB Error:", err)); 

// 3. DATABASE MODELS 
const MessageSchema = new mongoose.Schema({ 
  from: { type: String, required: true }, 
  to: { type: String }, 
  group: { type: String }, 
  text: { type: String }, 
  type: { type: String, default: "text" }, 
  fileUrl: { type: String }, 
  fileName: { type: String }, 
  timestamp: { type: Date, default: Date.now } 
}); 
const Message = mongoose.model("Message", MessageSchema); 

const UserSchema = new mongoose.Schema({ 
  username: { type: String, required: true }, 
  email: { type: String, required: true, unique: true }, 
  pin: { type: String, required: true }, 
  createdAt: { type: Date, default: Date.now } 
}); 
const User = mongoose.model("User", UserSchema); 

// 4. FILE UPLOAD SETUP 
const storage = multer.diskStorage({ 
  destination: '/tmp/', 
  filename: (req, file, cb) => cb(null, uuidv4() + "-" + file.originalname) 
}); 
const upload = multer({ storage }); 

// 5. UPLOAD ROUTE -> CLOUDINARY 
app.post("/upload", upload.single("file"), async (req, res) => { 
  try { 
    if (!req.file) return res.status(400).json({ error: "No file uploaded" }); 
    const result = await cloudinary.uploader.upload(req.file.path, { 
      resource_type: "auto", folder: "nexus_uploads", use_filename: true 
    }); 
    fs.unlinkSync(req.file.path); 
    res.json({ success: true, url: result.secure_url, public_id: result.public_id }); 
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  } 
}); 

// 6. GET CHAT HISTORY - NEW
app.get("/api/chat/get", async (req, res) => { 
  try {
    const { email } = req.query;
    const messages = await Message.find({ 
      $or: [{ from: email }, { to: email }] 
    }).sort({ timestamp: -1 }).limit(50); 
    res.json({ chats: messages }); 
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. BUTTON ROUTES 
app.post("/api/auth/register", async (req, res) => { 
  try { 
    const { username, email, pin } = req.body; 
    const existing = await User.findOne({ email }); 
    if (existing) return res.json({ success: false, message: 'User already exists' }); 
    const hashedPin = await bcrypt.hash(pin, 10); 
    await User.create({ username, email, pin: hashedPin }); 
    res.json({ success: true, message: 'Account Created!' }); 
  } catch (err) { 
    res.status(500).json({ success: false, message: err.message }); 
  } 
}); 

// LOGIN ROUTE - NEW
app.post("/api/auth/login", async (req, res) => { 
  try { 
    const { email, pin } = req.body; 
    const user = await User.findOne({ email }); 
    if (!user) return res.json({ success: false, message: 'User not found' }); 
    
    const isMatch = await bcrypt.compare(pin, user.pin);
    if (isMatch) {
      res.json({ success: true, message: 'Login Successful!' });
    } else {
      res.json({ success: false, message: 'Invalid PIN' });
    }
  } catch (err) { 
    res.status(500).json({ success: false, message: err.message }); 
  } 
}); 

app.post("/api/chat/send", async (req, res) => { 
  try { 
    const { from, to, message } = req.body; 
    const msg = new Message({ from: from, to: to, text: message }); 
    await msg.save(); 
    res.json({ status: 'delivered', message: 'Message Delivered' }); 
  } catch (err) { 
    res.status(500).json({ status: 'error', message: err.message }); 
  } 
}); 

// 8. HEALTH CHECK 
app.get("/", (req, res) => { 
  res.json({ status: "Nexus Pro Engine v4.2 - Login + Dashboard Live" }); 
}); 

// 9. SOCKET.IO 
io.on("connection", (socket) => { 
  console.log("User connected:", socket.id); 
  socket.on("join", (userId) => { socket.join(userId); }); 
  socket.on("sendMessage", async (data) => { 
    try { 
      const msg = new Message(data); 
      await msg.save(); 
      if(data.to) io.to(data.to).emit("newMessage", msg); 
      if(data.from) io.to(data.from).emit("newMessage", msg); 
    } catch (err) { console.log("Socket Error:", err); } 
  }); 
  socket.on("disconnect", () => { console.log("User disconnected:", socket.id); }); 
}); 

const PORT = process.env.PORT || 10000; 
server.listen(PORT, () => console.log(`🚀 Nexus running on port ${PORT}`));
