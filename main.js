const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const { autoUpdater } = require('electron-updater');
const path = require("path");
const { pathToFileURL } = require("url");
const fs = require("fs");
const os = require("os");
const preloadPath = path.resolve(__dirname, "preload.js");

const { PrintManager } = require("./printManager");

let printManager;
let mainWindow;


// Configure auto-updater
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowDowngrade = true;
autoUpdater.allowPrerelease = false;
autoUpdater.logger = console;


// Load config.json
const configPath = path.join(__dirname, "config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

console.log("API URL:", config.apiUrl);
console.log("devprinterName", config.devprinterName);
console.log("Page Size:", config.printSettings.pageSize);

const devprinterName = config.devprinterName;
const isdevenv = config.isdevenv;

const isslient = config.isslient == "yes" ? true : false;
const isprintBackground = config.isprintBackground == "yes" ? true : false;

app.whenReady().then(() => {
  printManager = new PrintManager({
    // optional defaults
    // defaultPrinter: "HP LaserJet XYZ",
  });

  // Example IPC handlers
  ipcMain.handle("print:html", async (event, html, options) => {
    await printManager.printHtml(html, options || {});
  });

  ipcMain.handle("print:pdf-buffer", async (event, pdfBuffer, options) => {
    // pdfBuffer will be transferred from renderer as Buffer or Uint8Array
    await printManager.printPdfBuffer(Buffer.from(pdfBuffer), options || {});
  });
  ipcMain.handle("print:pdfBuffer", async (event, pdfBytes, options) => {
    printerName = isdevenv ? devprinterName : printerName;
    const newoptions = {
      printer: printerName,
      copies: 1,
      duplex: "simplex",
    };
    try {
      await printManager.printPdfBuffer(Buffer.from(pdfBytes), newoptions);
      return { success: true };
    } catch (err) {
      console.error("Print failed:", err);
      return { success: false, error: err.message };
    }
  });
});

function createWindow() {
  console.log("Preload path:", preloadPath);
  console.log("Exists:", fs.existsSync(preloadPath));

  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.resolve(__dirname, preloadPath), // ensure this file exists
      contextIsolation: true,
      nodeIntegration: false, // safer
      session: require("electron").session.fromPartition("private-session", {
        persistent: false,
      }),
    },
  });

  //working
  // dialog.showMessageBox(win, {
  //           type: "info",
  //           title: "Print",
  //           message: "started!",
  //           buttons: ["OK"]
  //         });

  //win.webContents.openDevTools();

  // Create custom menu
  createMenu();

  // Resolve absolute path to index.html
  const printurl = config.apiUrl;
  // const indexPath = path.resolve(__dirname, 'index.html');
  // const indexUrl = pathToFileURL(indexPath).toString();
  mainWindow.loadURL(printurl);

  // Check for updates after window loads
  mainWindow.webContents.once('did-finish-load', () => {
    // Check for updates 5 seconds after app starts
    setTimeout(() => {
      checkForUpdates();
    }, 5000);
  });

  ipcMain.on("print-html-content", (event, htmlString, printerName) => {
    printerName = isdevenv ? devprinterName : printerName;
    const printWin = new BrowserWindow({ show: false });
    printWin.loadURL(
      "data:text/html;charset=utf-8," + encodeURIComponent(htmlString)
    );
    printWin.webContents.on("did-finish-load", () => {
      printWin.webContents.print({
        silent: isslient,
        printBackground: isprintBackground,
        deviceName: printerName,
      });
    });
  });
}

// Create custom menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Exit',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for updates',
          click: () => {
            checkForUpdatesMenu();
          }
        },
        {
          label: 'About',
          click: () => {
            showCurrentVersion();
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Global variable to store the update dialog window
let updateDialog = null;
let updateDialogMessage = null;

// Function to check for updates from menu
function checkForUpdatesMenu() {
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'QuesMatrix-QPPrint',
      message: 'Development mode - updates disabled',
      buttons: ['OK']
    });
    return;
  }

  // Show checking dialog without buttons initially
  updateDialogMessage = dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'QuesMatrix-QPPrint',
    message: 'Checking for updates...',
    buttons: [],
    noLink: true
  });
  
  // Set flag to show dialog for manual check
  global.showUpdateDialog = true;
  autoUpdater.checkForUpdates();
}

// Function to show current version
function showCurrentVersion() {
  const currentVersion = app.getVersion();
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'QuesMatrix-QPPrint',
    message: `Current version: ${currentVersion}`,
    buttons: ['OK']
  });
}


// Auto-Updater Event Handlers
autoUpdater.on('checking-for-update', () => {
  console.log('Checking for updates...');
  sendStatusToWindow('Checking for updates...');
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info);
  
  const currentVersion = app.getVersion();
  
  // Show dialog to user
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'QuesMatrix-QPPrint',
    message: `Update Available`,
    detail: `Current version: ${currentVersion}\nLatest version: ${info.version}\n\nWould you like to install the latest version?`,
    buttons: ['Install Now', 'Install Later'],
    defaultId: 0,
    cancelId: 1
  }).then((result) => {
    if (result.response === 0) {
      // User clicked "Install Now"
      autoUpdater.downloadUpdate();
      sendStatusToWindow('Downloading update...');
    }
  });
});

autoUpdater.on('update-not-available', (info) => {
  console.log('Update not available:', info);
  sendStatusToWindow('App is up to date.');
  
  // Show result dialog when checking from menu
  if (global.showUpdateDialog) {
    const currentVersion = app.getVersion();
    // Close the checking dialog and show result
    setTimeout(() => {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'QuesMatrix-QPPrint',
        message: `You are using the latest version: ${currentVersion}`,
        buttons: ['OK']
      });
    }, 500);
    global.showUpdateDialog = false; // Reset flag
  }
});

autoUpdater.on('error', (err) => {
  console.error('Update error:', err);
  console.error('Error stack:', err.stack);
  sendStatusToWindow('Update error: ' + err.message);
  
  // Show error dialog to user
  dialog.showErrorBox('QuesMatrix-QPPrint', 
    `Failed to update: ${err.message}\n\nTry running as administrator or check antivirus settings.`);
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
  
  console.log(log_message);
  sendStatusToWindow(log_message);
  
  // Send progress to renderer
  if (mainWindow) {
    mainWindow.webContents.send('download-progress', progressObj.percent);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded:', info);
  console.log('Update file path:', info.downloadedFile || 'Unknown');
  
  // Show dialog to install now or later
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'QuesMatrix-QPPrint',
    message: 'Update has been downloaded.',
    detail: 'The application will restart to install the update. Make sure to run as administrator if needed.',
    buttons: ['Restart Now', 'Restart Later'],
    defaultId: 0,
    cancelId: 1
  }).then((result) => {
    if (result.response === 0) {
      // User clicked "Restart Now"
      console.log('User chose to restart now');
      setImmediate(() => {
        console.log('Calling quitAndInstall...');
        autoUpdater.quitAndInstall(false, true);
      });
    }
  });
});

// Function to send status messages to renderer
function sendStatusToWindow(text) {
  console.log(text);
  if (mainWindow) {
    mainWindow.webContents.send('update-status', text);
  }
}

// Function to manually check for updates
function checkForUpdates() {
  // Skip updates in development
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    console.log('Skipping update check in development mode');
    sendStatusToWindow('Development mode - updates disabled');
    return;
  }
  
  try {
    autoUpdater.checkForUpdates();
  } catch (error) {
    console.error('Failed to check for updates:', error);
    sendStatusToWindow('Failed to check for updates');
  }
}


// IPC Handlers
ipcMain.on('check-for-updates', () => {
  checkForUpdates();
});

ipcMain.on("print-bytes-file", (event, bytes, printerName) => {
  printerName = isdevenv ? devprinterName : printerName;
  const buffer = Buffer.from(bytes);
  // Write to a temporary file (e.g., HTML or PDF)
  const tempPath = path.join(app.getPath("temp"), "qp.pdf");
  console.log(tempPath);
  fs.writeFileSync(tempPath, buffer);
  // Load into hidden window for printing
  const printWin = new BrowserWindow({ show: false });
  printWin.loadFile(tempPath);
  printWin.webContents.on("did-finish-load", () => {
    printWin.webContents.print({
      silent: isslient,
      printBackground: isprintBackground,
      deviceName: printerName,
    });
  });
});

ipcMain.on("print-buffer-new", async (event, pdfbytes, printerName) => {
  try {
    printerName = isdevenv ? devprinterName : printerName;
    const win = new BrowserWindow({ show: false });
    // hidden window // Load the PDF into the window
    const base64Data = Buffer.from(pdfbytes).toString("base64");
    const dataUrl = `data:application/pdf;base64,${base64Data}`;
    await win.loadURL(dataUrl);
    // Silent print
    win.webContents.print(
      {
        silent: isslient,
        printBackground: isprintBackground,
        deviceName: printerName,
        pageSize: "A4",
        margins: { marginType: "none" },
      },
      (success, failureReason) => {
        if (success) {
          event.reply("print-buffer-new-result", { success: true });
        } else {
          console.error("Print failed:", failureReason);
          event.reply("print-buffer-new-result", {
            success: false,
            error: failureReason || "Unknown error",
          });
        }
      }
    );
  } catch (err) {
    console.error("Error in print-buffer handler:", err);
  }
});


app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
