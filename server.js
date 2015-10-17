var fs          = require('fs');
var http        = require('http');
var connect     = require('connect');
var serveStatic = require('serve-static');
var socketio    = require("socket.io")

var LISTEN_PORT = 16080;
var PUBLIC_DIR  = __dirname + "/public"
var FILE_PATH   = "data.json"

//==============================================================================
// アプリ本体
//==============================================================================
function App(){ return{
  obj : JSON.parse(fs.readFileSync(FILE_PATH, 'utf8')),

  updateList : function(){
    // broadcast all clients (including the sender)
    g_io.sockets.emit("update_list", this.obj);
  },

  store : function(){
    var buf = JSON.stringify(this.obj, null, 2);
    fs.writeFileSync(FILE_PATH, buf, 'utf-8');
  },

  addNewCard : function(obj){
    if (obj.i != undefined && obj.o != undefined){
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
var g_app       = App();

// PUBLIC_DIR以下を普通のhttpサーバーとしてlisten
var g_httpApp = connect();
g_httpApp.use(serveStatic(PUBLIC_DIR));
var g_server = http.createServer(g_httpApp);
g_server.listen(LISTEN_PORT);

// websocketとしてlistenして、応答内容を記述
var g_io = socketio.listen(g_server);
g_io.sockets.on("connection", g_app.onWebSocket.bind(g_app));

console.log("================================================");
console.log("listening web socket on port " + LISTEN_PORT);
console.log("connection control at http://localhost:" + LISTEN_PORT + "/");
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
