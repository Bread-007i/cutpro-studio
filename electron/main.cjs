/* eslint @typescript-eslint/no-require-imports: "off" */
const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const APP_ID = "com.cutpro.studio";
const APP_TITLE = "CutPro Studio";
// A stable origin keeps the autosaved IndexedDB project across launches.
const APP_PORT = 32147;
const desktopSessionToken = randomBytes(32).toString("hex");

let splash;
let editorWindow;
let serverProcess;
let isQuitting = false;
let editorUrl;
let splashReady = false;
let splashProgress = [0, "กำลังเตรียมเปิดแอป…"];
let startupError;

app.setName(APP_TITLE);
app.setAppUserModelId(APP_ID);
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
else {
  app.on("second-instance", () => {
    if (editorWindow && !editorWindow.isDestroyed()) {
      if (editorWindow.isMinimized()) editorWindow.restore();
      editorWindow.focus();
    }
  });
}

function updateSplash(percentage, message) {
  splashProgress = [percentage, message];
  if (!splash || splash.isDestroyed()) return;
  const safeMessage = JSON.stringify(message);
  void splash.webContents.executeJavaScript(
    `window.updateProgress(${percentage}, ${safeMessage})`
  ).catch(() => {});
}

function getAppIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app.asar.unpacked", ".next", "standalone", "public", "icons", "icon-256.png")
    : path.join(__dirname, "..", "public", "icons", "icon-256.png");
}

function showSplash() {
  splash = new BrowserWindow({
    width: 430,
    height: 300,
    resizable: false,
    frame: false,
    show: false,
    backgroundColor: "#0b0b10",
    icon: getAppIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const html = `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${APP_TITLE}</title><style>
    *{box-sizing:border-box}body{margin:0;height:100vh;display:grid;place-items:center;background:#0b0b10;color:#f4f4f5;font:14px "Segoe UI",Tahoma,sans-serif}
    main{width:310px;text-align:center}.logo{width:68px;height:68px;border-radius:18px;object-fit:cover;box-shadow:0 0 35px #a855f766}
    h1{font-size:18px;margin:14px 0 22px}.row{display:flex;justify-content:space-between;gap:12px;color:#a1a1aa;font-size:12px;margin-bottom:9px}
    #percent{color:#e879f9;font-variant-numeric:tabular-nums} .track{height:6px;border-radius:9px;background:#27272a;overflow:hidden}
    #bar{height:100%;width:0;background:linear-gradient(90deg,#7c3aed,#d946ef);transition:width .25s ease}
    #error{display:none;margin-top:15px;color:#fda4af;font-size:11px;line-height:1.5;overflow-wrap:anywhere}
  </style><main><img class="logo" src="${pathToFileURL(getAppIconPath()).href}"><h1>${APP_TITLE}</h1><div class="row"><span id="message">กำลังเตรียมเปิดแอป…</span><span id="percent">0%</span></div><div class="track"><div id="bar"></div></div><div id="error"></div></main><script>
    window.updateProgress=(n,m)=>{document.getElementById("bar").style.width=n+"%";document.getElementById("percent").textContent=n+"%";document.getElementById("message").textContent=m};
    window.showError=(m)=>{document.getElementById("error").style.display="block";document.getElementById("error").textContent=m};
  </script></html>`;

  void splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  splash.webContents.once("did-finish-load", () => {
    splashReady = true;
    updateSplash(...splashProgress);
    if (startupError) showStartupError(startupError);
  });
  splash.once("ready-to-show", () => splash.show());
}

function getServerEntry() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar.unpacked", ".next", "standalone", "server.js");
  }
  return path.join(__dirname, "..", ".next", "standalone", "server.js");
}

function ensurePortAvailable(port) {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once("error", () => reject(new Error(
      `พอร์ต ${port} ถูกใช้งานอยู่ กรุณาปิดแอป CutPro Studio ที่เปิดค้างแล้วลองใหม่`
    )));
    socket.listen(port, "127.0.0.1", () => {
      socket.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });
}

function startServer(port) {
  const serverEntry = getServerEntry();
  if (!fs.existsSync(serverEntry)) {
    throw new Error("ไม่พบไฟล์เซิร์ฟเวอร์แอป กรุณาติดตั้งแอปใหม่");
  }
  const logPath = path.join(app.getPath("userData"), "server.log");
  const log = fs.createWriteStream(logPath, { flags: "a" });
  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: path.dirname(serverEntry),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      CUTPRO_DESKTOP_TOKEN: desktopSessionToken,
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  serverProcess.stdout.pipe(log);
  serverProcess.stderr.pipe(log);
  serverProcess.once("error", (error) => {
    log.end();
    if (!isQuitting) showStartupError(error);
  });
  serverProcess.once("exit", (code) => {
    log.end();
    if (!isQuitting && code !== 0) {
      showStartupError(new Error(`เซิร์ฟเวอร์แอปหยุดทำงาน (รหัส ${code ?? "ไม่ทราบ"})`));
    }
  });
  return serverProcess;
}

function waitForServer(port, child) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (child.exitCode !== null) {
        reject(new Error("เซิร์ฟเวอร์แอปปิดก่อนเริ่มทำงาน ดูรายละเอียดได้ที่ไฟล์ server.log"));
        return;
      }
      if (Date.now() - startedAt > 60_000) {
        reject(new Error("เริ่มแอปไม่สำเร็จภายใน 60 วินาที ดูรายละเอียดได้ที่ไฟล์ server.log"));
        return;
      }
      const request = http.get(`http://127.0.0.1:${port}`, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) resolve();
        else setTimeout(check, 250);
      });
      request.setTimeout(1500, () => request.destroy());
      request.once("error", () => setTimeout(check, 250));
    };
    check();
  });
}

function showStartupError(error) {
  console.error("[desktop] app startup failed", error);
  startupError = error;
  updateSplash(100, "เปิดแอปไม่สำเร็จ");
  if (splashReady && splash && !splash.isDestroyed()) {
    const safeError = JSON.stringify(error.message || "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ");
    void splash.webContents.executeJavaScript(`window.showError(${safeError})`).catch(() => {});
  }
}

async function openEditor() {
  editorWindow = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 980,
    minHeight: 680,
    show: false,
    backgroundColor: "#0b0b10",
    title: APP_TITLE,
    icon: getAppIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  editorWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  editorWindow.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== new URL(editorUrl).origin) event.preventDefault();
  });
  editorWindow.webContents.once("did-finish-load", () => {
    updateSplash(100, "พร้อมใช้งาน");
    editorWindow.show();
    if (splash && !splash.isDestroyed()) splash.close();
  });
  editorWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
    if (url.startsWith(editorUrl)) showStartupError(new Error(`${description} (${code})`));
  });
  try {
    await editorWindow.webContents.session.cookies.set({
      url: editorUrl,
      name: "cutpro-desktop-session",
      value: desktopSessionToken,
      httpOnly: true,
      sameSite: "strict",
    });
    await editorWindow.loadURL(editorUrl);
  } catch (error) {
    showStartupError(error instanceof Error ? error : new Error(String(error)));
  }
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  showSplash();
  updateSplash(8, "กำลังเตรียมสภาพแวดล้อม…");
  try {
    await ensurePortAvailable(APP_PORT);
    editorUrl = `http://127.0.0.1:${APP_PORT}`;
    updateSplash(20, "กำลังเริ่มเซิร์ฟเวอร์ในเครื่อง…");
    const child = startServer(APP_PORT);
    updateSplash(55, "กำลังโหลดส่วนประกอบของแอป…");
    await waitForServer(APP_PORT, child);
    updateSplash(88, "เซิร์ฟเวอร์พร้อม กำลังเปิดหน้าตัดต่อ…");
    await openEditor();
  } catch (error) {
    showStartupError(error instanceof Error ? error : new Error(String(error)));
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  if (serverProcess && serverProcess.exitCode === null) serverProcess.kill();
});