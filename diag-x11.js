const { app, screen, BrowserWindow } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");

const LOG = path.join(os.tmpdir(), "uos-diag.log");
fs.writeFileSync(LOG, "");
function log(msg) { const line = new Date().toISOString() + " " + msg; fs.appendFileSync(LOG, line + "\n"); }

app.commandLine.appendSwitch("no-sandbox");
app.disableHardwareAcceleration();

app.whenReady().then(() => {
  log("=== UOS 穿透诊断 ===");

  // 1. 显示器信息
  const displays = screen.getAllDisplays();
  log("显示器数量: " + displays.length);
  displays.forEach((d, i) => {
    log("Display " + i + ": " + JSON.stringify(d.bounds) + " primary=" + (d.id === screen.getPrimaryDisplay().id));
  });

  // 2. 创建测试窗口
  const win = new BrowserWindow({
    width: 500, height: 400, x: 200, y: 200,
    frame: false, transparent: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });

  win.loadURL("data:text/html," + encodeURIComponent(
    '<html><body style="margin:0;background:rgba(0,80,160,0.3);width:100vw;height:100vh">' +
    '<input id="t" style="margin:20px;padding:10px;width:300px" placeholder="点我测试">' +
    '<div id="m" style="color:#0f0;font:14px monospace;padding:20px">等待鼠标...</div>' +
    '<script>' +
    'var c=0;' +
    'document.addEventListener("mousemove",function(e){c++;document.getElementById("m").textContent="mousemove #"+c+" ("+e.clientX+","+e.clientY+")";});' +
    'document.addEventListener("click",function(){document.getElementById("m").textContent+=" CLICK";});' +
    '</script></body></html>'
  ));

  win.webContents.on("did-finish-load", () => {
    log("窗口加载完成");

    // 3. 测试1：不开穿透，5秒内收到的 mousemove 数量
    setTimeout(() => {
      win.webContents.executeJavaScript("document.getElementById('m').textContent").then(text => {
        log("阶段1(无穿透): " + text);
      });
    }, 3000);

    // 4. 测试2：开穿透 forward，5秒内是否收到 mousemove
    setTimeout(() => {
      try {
        win.setIgnoreMouseEvents(true, { forward: true });
        log("setIgnoreMouseEvents(true,{forward:true}) 已调用");
      } catch(e) { log("setIgnoreMouseEvents失败: " + e.message); }
    }, 5000);

    setTimeout(() => {
      win.webContents.executeJavaScript("document.getElementById('m').textContent").then(text => {
        log("阶段2(forward穿透): " + text);
        if (text.includes("#")) {
          const nums = text.match(/#\d+/g);
          if (nums && nums.length > 0) {
            const last = parseInt(nums[nums.length - 1].substring(1));
            log(last > 1 ? "✅ forward 生效（收到多次 mousemove）" : "❌ forward 不生效");
          }
        }
      });
    }, 8000);

    // 5. 测试3：不用 forward 的穿透
    setTimeout(() => {
      win.setIgnoreMouseEvents(true);
      log("setIgnoreMouseEvents(true) 无forward 已调用");
    }, 10000);

    // 6. 退出
    setTimeout(() => {
      log("=== 诊断完成 ===");
      app.exit(0);
    }, 13000);
  });
});
