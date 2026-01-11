// preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  printHtmlContent: (htmlString, printername) => {
    ipcRenderer.send("print-html-content", htmlString, printername);
  },
  printbytesfile: (bytes, printerName) => {
    console.log("bytes ", bytes, "printer ", printerName);
    ipcRenderer.send("print-bytes-file", bytes, printerName);
  },
  printBytes: (pdfbytes, printerName) => {
    console.log("print-buffer-new ", pdfbytes, "printer ", printerName);
    //ipcRenderer.send("print-buffer-new", pdfbytes, printerName);

    return ipcRenderer.invoke("print:pdfBuffer", pdfbytes, {
      printer: printerName,
      copies: 1,
      duplex: "simplex",
    });
  },
  printPdfBuffer: async (pdfBytes, options = {}) => {
    return await ipcRenderer.invoke("print:pdfBuffer", pdfBytes, options);
  },



  // Auto-update API
  checkForUpdates: () => {
    ipcRenderer.send('check-for-updates');
  },
  
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (event, message) => callback(message));
  },
  
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (event, percent) => callback(percent));
  }
});


