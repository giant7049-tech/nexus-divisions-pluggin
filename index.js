const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

// 1. CONNECT MONGODB
mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.log("❌ DB Error:", err));

// 2. MESSAGE SCHEMA
const MessageSchema = new mongoose.Schema({
  from: String, to: String, group: String,
  text: String, type: {type: String, default: "text"},
  fileUrl: String, timestamp: {type: Date, default: Date.now}
});
const Message = mongoose.model("Message", MessageSchema);

// 3. HEALTH
app.get("/", (req, res) => {
  res.json({ status: "Nexus Pro Engine Running", version: "3.0.0 DB Live" });
});

// 4. FILE UPLOAD FOR VOICE/IMAGE
const storage = multer.diskStorage({
  destination: '/tmp/',
  filename: (req, file, cb) => cb(null, uuidv4() + "-" + file.originalname)
});
const upload = multer({ storage });

app.post("/upload", upload.single("file"), (req, res) => {
  res.json({ url: `/files/${req.file.filename}`, message: "Uploaded. Next: Cloudinary for permanent storage" });
});

// 5. GET CHAT HISTORY
app.get("/messages/:user1/:user2", async (req, res) => {
  const { user1, user2 } = req.params;
  const messages = await Message.find({
    $or: [{from: user1, to: user2}, {from: user2, to: user1}]
  }).sort({timestamp: 1}).limit(200);
  res.json(messages);
});

// 6. SOCKET.IO REAL TIME CHAT
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);
  socket.on("join", (userId) => socket.join(userId));
  
  socket.on("sendMessage", async (data) => {
    const msg = new Message(data);
    await msg.save();
    io.to(data.to).emit("newMessage", msg);
    io.to(data.from).emit("newMessage", msg);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Nexus running on ${PORT}`));
