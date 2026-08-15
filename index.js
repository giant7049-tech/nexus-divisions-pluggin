<div style="max-width:1000px;margin:20px auto;height:90vh;border-radius:20px;background:rgba(0,255,136,0.1);backdrop-filter:blur(10px);border:2px solid #00ff88;box-shadow:0 0 40px #00ff88;display:flex;overflow:hidden;font-family:'Segoe UI'">

  <!-- LEFT: AUTH + CONTACTS -->
  <div style="width:30%;background:linear-gradient(180deg,rgba(0,255,136,0.2),rgba(0,100,50,0.3));border-right:1px solid #00ff88;padding:15px;display:flex;flex-direction:column">
    
    <!-- LOGO -->
    <div style="text-align:center">
      <label for="profileUpload">
        <img id="profilePic" src="https://nexusbuildsolutions.rf.gd/wp-content/uploads/2026/08/cropped-Screenshot-2025-09-29-122409.png"
          style="width:80px;height:80px;border-radius:12px;border:2px solid #00ff88;cursor:pointer">
      </label>
      <input id="profileUpload" type="file" accept="image/*" style="display:none" onchange="uploadProfile()">
      <h3 style="color:#00ff88;margin:5px 0">NEXUS CONNECT</h3>
    </div>

    <!-- 1. LOGIN / REGISTER - PROBLEM 8 FIXED -->
    <div id="authBox">
      <input id="username" placeholder="Username" style="width:100%;padding:10px;margin:5px 0;border-radius:8px;border:1px solid #333;background:#1a1a1a;color:#fff">
      <input id="email" placeholder="Email" style="width:100%;padding:10px;margin:5px 0;border-radius:8px;border:1px solid #333;background:#1a1a1a;color:#fff">
      <input id="pin" type="password" placeholder="4 Digit PIN" maxlength="4" style="width:100%;padding:10px;margin:5px 0;border-radius:8px;border:1px solid #333;background:#1a1a1a;color:#fff">
      <button onclick="register()" style="width:100%;padding:12px;background:#00ff88;color:#000;border:none;border-radius:8px;font-weight:bold;margin:5px 0">REGISTER</button>
      <button onclick="login()" style="width:100%;padding:12px;background:#00cc6a;color:#000;border:none;border-radius:8px;font-weight:bold;margin:5px 0">LOGIN</button>
      <p id="authMsg" style="color:#00ff88;text-align:center"></p>
    </div>

    <!-- 2. USER SEARCH - PROBLEM 2 FIXED -->
    <div id="appBox" style="display:none;flex:1;flex-direction:column">
      <button onclick="createRoom()" style="padding:10px;background:#00ff88;color:#000;border:none;border-radius:8px;font-weight:bold;margin:10px 0">+ Nexus Room</button>
      <input id="searchUser" onkeyup="searchUsers()" placeholder="Search users..." 
        style="padding:10px;border-radius:8px;border:1px solid #333;background:#1a1a1a;color:#fff;margin-bottom:10px">
      <div id="userList" style="flex:1;overflow-y:auto"></div>
    </div>
  </div>

  <!-- RIGHT: CHAT -->
  <div style="width:70%;display:flex;flex-direction:column;background:#0a0a0a">
    <div style="padding:15px;border-bottom:1px solid #222">
      <h3 id="chatTitle" style="color:#00ff88;margin:0">Select a chat</h3>
    </div>
    <div id="chatBox" style="flex:1;overflow-y:auto;padding:20px"></div>
    <div style="padding:15px;background:#111;display:flex;gap:10px">
      <button onclick="document.getElementById('fileUpload').click()" style="padding:10px;background:#1a1a1a;border:none;border-radius:8px;color:#00ff88">📎</button>
      <button onclick="recordVoice()" style="padding:10px;background:#1a1a1a;border:none;border-radius:8px;color:#00ff88">🎤</button>
      <input id="fileUpload" type="file" style="display:none" onchange="sendFile()">
      <input id="message" type="text" placeholder="Type message..." style="flex:1;padding:12px;border-radius:20px;border:1px solid #333;background:#1a1a1a;color:#fff">
      <button onclick="sendMsg()" style="width:45px;height:45px;border-radius:50%;background:#00ff88;border:none;color:#000">➤</button>
    </div>
  </div>
</div>

<script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
<script>
const API = "https://nexusbuildsolutions.onrender.com";
const socket = io(API);
let currentUser = null;
let activeChat = null;

// 1. REGISTER
async function register(){
  const res = await fetch(API+"/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
    username:username.value,email:email.value,pin:pin.value
  })});
  const data = await res.json();
  authMsg.innerText = data.message;
}

// 2. LOGIN - PROBLEM 8 FIXED
async function login(){
  const res = await fetch(API+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
    email:email.value,pin:pin.value
  })});
  const data = await res.json();
  if(data.success){
    currentUser = data.user;
    authBox.style.display="none";
    appBox.style.display="flex";
    loadUsers(); // Load all users for search
  } else authMsg.innerText = "Login Failed";
}

// 3. LOAD USERS - PROBLEM 2 FIXED
async function loadUsers(){
  const res = await fetch(API+"/api/users");
  const users = await res.json();
  userList.innerHTML = users.map(u=>`<div onclick="openChat('${u.username}')" style="padding:10px;background:#1a1a1a;margin:5px 0;border-radius:8px;cursor:pointer">@${u.username}</div>`).join('');
}

// 4. OPEN CHAT - PROBLEM 3 FIXED
function openChat(user){
  activeChat = user;
  chatTitle.innerText = "@"+user;
  socket.emit("joinRoom", [currentUser.username,user].sort().join('_'));
  loadMessages();
}

async function loadMessages(){
  const res = await fetch(API+`/api/chat/get?user1=${currentUser.username}&user2=${activeChat}`);
  const msgs = await res.json();
  chatBox.innerHTML = msgs.map(m=>`<div style="text-align:${m.from===currentUser.username?'right':'left'}"><b>@${m.from}</b>: ${m.text||`<img src=${m.fileUrl} width=200>`}</div>`).join('');
}

async function sendMsg(){
  socket.emit("sendMessage",{from:currentUser.username,to:activeChat,text:message.value});
  message.value="";
}

socket.on("newMessage", loadMessages); // REALTIME - PROBLEM 3 FIXED
</script>
