require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 10000;

console.log("MONGO:",!!process.env.MONGO_URI, "CLOUD:",!!process.env.CLOUD_NAME)

app.use(cors());
app.use(express.json({limit: '50mb'}));

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET
});

const upload = multer({ storage: multer.memoryStorage() });

// MONGO MODELS - PROBLEM 3 & 8 FIXED
const User = mongoose.model('User', { username: String, email: String, pin: String, avatar: String });
const Message = mongoose.model('Message', { from: String, to: String, text: String, fileUrl: String, room: String, createdAt: {type: Date, default: Date.now} });
const Group = mongoose.model('Group', { name: String, members: [String], createdBy: String });

mongoose.connect(process.env.MONGO_URI).then(() => console.log("MONGO CONNECTED")).catch(e => console.log("MONGO ERR:",e));

// API ROUTES
app.post('/api/auth/register', async (req, res) => { // PROBLEM 1 FIXED
  const exists = await User.findOne({email: req.body.email});
  if(exists) return res.json({message: "User already exists"});
  const user = new User(req.body);
  await user.save();
  res.json({ message: "Registered Successfully" });
});

app.post('/api/auth/login', async (req, res) => { // PROBLEM 1 FIXED
  const user = await User.findOne({ email: req.body.email, pin: req.body.pin });
  res.json({ success:!!user, user });
});

app.get('/api/users', async (req, res) => { // PROBLEM 2 & 7 FIXED
  const users = await User.find();
  res.json(users);
});

app.post('/api/group/create', async (req, res) => { // PROBLEM 5 FIXED
  const group = new Group(req.body);
  await group.save();
  res.json({success: true, group});
})

app.get('/api/chat/get', async (req, res) => { // PROBLEM 3 FIXED
  const { user1, user2 } = req.query;
  const room = [user1, user2].sort().join('_');
  const msgs = await Message.find({ room }).sort({createdAt: 1});
  res.json(msgs);
});

app.post('/api/upload', upload.single('file'), async (req,res) => { // PROBLEM 6 FIXED
  const result = await cloudinary.uploader.upload_stream({resource_type: "auto"}, (err, result) => {
    res.json({url: result.secure_url})
  }).end(req.file.buffer);
});

// SOCKET - PROBLEM 4 FIXED
io.on('connection', (socket) => {
  socket.on('joinRoom', room => socket.join(room));
  socket.on('sendMessage', async (data) => {
    const room = [data.from, data.to].sort().join('_');
    const msg = new Message({...data, room });
    await msg.save();
    io.to(room).emit('newMessage', msg);
  });
});

server.listen(PORT, () => console.log(`NEXUS ENGINE v2030 LIVE on ${PORT}`));
