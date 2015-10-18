require('date-utils'); // > Date
var fs          = require('fs');
var https       = require('https');
var auth        = require('http-auth');
var connect     = require('connect');
var serveStatic = require('serve-static');
var socketio    = require("socket.io");

var CONFIG      = JSON.parse(fs.readFileSync(__dirname + "/config.json", 'utf8'));
var PUBLIC_DIR  = __dirname + "/public";

//==============================================================================
// アプリ本体
//==============================================================================
function App(datapath){ return{
  datapath: datapath,
  obj     : JSON.parse(fs.readFileSync(datapath, 'utf8')),

  updateList : function(){
    // broadcast all clients (including the sender)
    g_io.sockets.emit("update_list", this.obj);
  },

  store : function(suffix){
    var suffix = (suffix !== undefined) ? suffix : "";
    var buf = JSON.stringify(this.obj, null, 2);
    fs.writeFileSync(this.datapath + suffix, buf, 'utf-8');
  },

  addNewCard : function(obj){
    if (obj.i != undefined && obj.o != undefined){
      // backup
      var formatted = new Date().toFormat(".YYYYMMDDHH24MISS");
      this.store(formatted);      // 保存
      console.log("Stored backup", formatted);

      // update
      var record = {"i": obj.i, "o":obj.o, "t":[0]};
      this.obj.data.push(record);

      console.log("new record", record);

      this.store();      // 保存
      this.updateList(); // 最新データ配信
    } else {
      console.log("Error: undefined format", obj);
    }
  },

  // websocketとしての応答内容を記述
  onWebSocket : function(socket){
    this.updateList(); // websocket接続時に一度現状を送る

    socket.on("add_new_card", this.addNewCard.bind(this) );
  },

}}

//==============================================================================
// start!
//==============================================================================

var g_app = App(__dirname + "/" + CONFIG.datapath);

// openssl req -new -newkey rsa:2048 -nodes -subj "/O=test" -keyout pem/key.pem -out pem/csr.pem && openssl x509 -req -in pem/csr.pem -signkey pem/key.pem -out pem/cert.pem
var g_sslopts = {
  key:  fs.readFileSync(__dirname + "/" + 'pem/key.pem'),
  cert: fs.readFileSync(__dirname + "/" + 'pem/cert.pem'),
}

// Basic authentication
var authMiddleware = auth.connect(auth.basic({
        realm: "Basic authentication.",
    }, function (username, password, callback) { // Custom authentication method.
        callback(username === CONFIG.username && password === CONFIG.password);
    }
));

// httpsサーバーの起動
var g_httpApp = connect();
g_httpApp.use(authMiddleware);          // Basic認証をつなぐ
g_httpApp.use(serveStatic(PUBLIC_DIR)); // PUBLIC_DIR以下を普通のhttpサーバーとしてlisten
var g_server = https.createServer(g_sslopts, g_httpApp);
g_server.listen(CONFIG.listen);

// websocketとしてlistenして、応答内容を記述
var g_io = socketio.listen(g_server);
g_io.sockets.on("connection", g_app.onWebSocket.bind(g_app));

console.log("================================================");
console.log("listening web socket on port " + CONFIG.listen);
console.log("connection control at https://localhost:" + CONFIG.listen + "/");
console.log("================================================");

//==============================================================================
// graceful shutdown
//==============================================================================

function graceful_shutdown(){
  process.exit();
}

// 例外
process.on('uncaughtException', function(err) {
    console.log(err.stack);
    graceful_shutdown();
});

// windowsのctrl-c
if (process.platform === "win32") {
  var rl = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.on("SIGINT", function () {
    console.log("Caught interrupt signal");
    graceful_shutdown();
  });
}

// それ以外のctrl-c
process.on("SIGINT", function () {
  //graceful shutdown
  console.log("Caught interrupt signal");
  graceful_shutdown();
});
