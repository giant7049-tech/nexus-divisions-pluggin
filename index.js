const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const PORT = process.env.PORT || 3000;

// TEMP DATABASE - We will connect real DB later
let users = [];
let messages = [];
let groups = [];

app.use(cors());
app.use(express.json());

// File upload setup for voice note, images, files
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// 1. TEST ROUTE
app.get('/', (req, res) => {
  res.json({ status: "Nexus Pro Engine Running", version: "2.0.0" });
});


// 2. PERSONAL ACCOUNT + PROFILE PIC
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  const user = { id: uuidv4(), name, email, profile_pic: "", privacy: "public" };
  users.push(user);
  res.json({ success: true, user });
});

app.post('/api/profile/upload', upload.single('file'), (req, res) => {
  // This will upload profile pic. We will connect Cloudinary later
  res.json({ success: true, message: "Profile pic uploaded" });
});

app.post('/api/privacy', (req, res) => {
  const { user_id, setting } = req.body; // setting: public, friends, private
  res.json({ success: true, message: `Privacy set to ${setting}` });
});


// 3. REAL CHAT - 1 IN 1 + GROUP
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join_chat', (chat_id) => {
    socket.join(chat_id);
  });

  socket.on('send_message', (data) => {
    // data = {chat_id, sender_id, message, type: "text/voice/file"}
    messages.push(data);
    io.to(data.chat_id).emit('receive_message', data);
  });
});

app.post('/api/chat/create-group', (req, res) => {
  const { name, members } = req.body;
  const group = { id: uuidv4(), name, members };
  groups.push(group);
  res.json({ success: true, group });
});


// 4. ACCESS MEDIA + VOICE NOTE + FILES
app.post('/api/chat/upload', upload.single('file'), (req, res) => {
  // This receives voice note, images, pdf, etc
  // We will connect Cloudinary here later so files don't disappear
  res.json({ success: true, url: "file_url_will_be_here" });
});


// 5. VOICE CALL / VOICE CHAT - Audio only
app.post('/api/call/start', (req, res) => {
  const { caller_id, receiver_id } = req.body;
  // We use Socket.io rooms for voice chat. No video
  io.to(receiver_id).emit('incoming_call', { caller_id });
  res.json({ success: true, message: "Calling..." });
});


// 6. BROADCAST
app.post('/api/broadcast', (req, res) => {
  const { sender_id, message, recipients } = req.body;
  // recipients = array of user_ids
  recipients.forEach(id => {
    io.to(id).emit('broadcast_message', { sender_id, message });
  });
  res.json({ success: true, message: "Broadcast sent" });
});


// 7. PAYMENT - PAYSTACK FOR ANY CARD NIGERIA
app.post('/api/payment/init', async (req, res) => {
  const { email, amount } = req.body; // amount in kobo. 1000 = 10 naira
  
  // Connect to Paystack here. This auto-detects card and is fast
  const paystack_url = "https://api.paystack.co/transaction/initialize";
  
  res.json({ 
    success: true, 
    message: "Connect Paystack Secret Key here",
    checkout_url: "https://paystack.com/pay/..."
  });
});

app.post('/api/payment/webhook', (req, res) => {
  // Paystack will ping here automatically when payment succeeds
  console.log("Payment Verified:", req.body);
  res.sendStatus(200);
});


server.listen(PORT, () => {
  console.log(`Nexus Pro Engine running on port ${PORT}`);
});
