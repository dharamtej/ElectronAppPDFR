// printManager.js
const path = require("path");
const fs = require("fs");
const os = require("os");
const { BrowserWindow } = require("electron");
// const { print } = require("pdf-to-printer");

class PrintManager {
  constructor(options = {}) {
    this.tempDir =
      options.tempDir || path.join(os.tmpdir(), "my-electron-print-jobs");
    this.defaultPrinter = options.defaultPrinter || undefined;
    this.ensureTempDir();
  }

  ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  getTempFilePath(extension = ".pdf") {
    const fileName = `print_${Date.now()}_${Math.random()
      .toString(16)
      .slice(2)}${extension}`;
    return path.join(this.tempDir, fileName);
  }

  /**
   * Core method: print a file via Windows spooler
   *
   * @param {string} filePath - Absolute path to file (PDF recommended)
   * @param {object} options
   *   options.printer: string (printer name)
   *   options.copies: number
   *   options.duplex: 'simplex' | 'short-edge' | 'long-edge'
   *   options.silent: boolean (for your own logic, not used by pdf-to-printer)
   */
  async printFile(filePath, options = {}) {
    const printerOptions = {
      printer: options.printer || this.defaultPrinter,
      copies: options.copies || 1,
      // pdf-to-printer options (Windows specific)
      // paperSize, monochrome, orientation, etc. can also go here
      // e.g., paperSize: "A4",
      //       monochrome: true,
      //       orientation: "portrait"
    };

    // Duplex handling (pdf-to-printer passes this to OS)
    if (options.duplex) {
      printerOptions.duplex = options.duplex;
    }

    return print(filePath, printerOptions);
  }

  /**
   * Print a PDF buffer (byte array) via Windows spooler
   *
   * @param {Buffer | Uint8Array} pdfBuffer
   * @param {object} options - same as printFile
   */
  async printPdfBuffer(pdfBuffer, options = {}) {
    if (!pdfBuffer) {
      throw new Error("printPdfBuffer: pdfBuffer is required");
    }

    const filePath = this.getTempFilePath(".pdf");
    await fs.promises.writeFile(filePath, pdfBuffer);
    try {
      await this.printFile(filePath, options);
    } finally {
      // Cleanup temp file (optional, but recommended)
      fs.promises.unlink(filePath).catch(() => {});
    }
  }

  /**
   * Print HTML by rendering it in a hidden BrowserWindow and using printToPDF()
   *
   * @param {string} html - Full HTML string (with <html>, <body>) or snippet
   * @param {object} options
   *   options.pageSize: "A4" | "Letter" | custom (Electron printToPDF)
   *   options.marginsType: 0 | 1 | 2
   *   options.landscape: boolean
   *   plus printFile options: printer, copies, duplex
   */
  async printHtml(html, options = {}) {
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        offscreen: true,
      },
    });

    try {
      const htmlToLoad = this.wrapHtmlIfNeeded(html);

      await win.loadURL(
        "data:text/html;charset=UTF-8," + encodeURIComponent(htmlToLoad)
      );

      // Wait for render
      await new Promise((resolve) => {
        if (win.webContents.isLoading()) {
          win.webContents.once("did-finish-load", resolve);
        } else {
          resolve();
        }
      });

      const pdfOptions = {
        printBackground: true,
        landscape: !!options.landscape,
        marginsType:
          typeof options.marginsType === "number" ? options.marginsType : 0,
        pageSize: options.pageSize || "A4",
      };

      const pdfData = await win.webContents.printToPDF(pdfOptions);

      await this.printPdfBuffer(pdfData, {
        printer: options.printer,
        copies: options.copies,
        duplex: options.duplex,
      });
    } finally {
      // Clean up window
      if (!win.isDestroyed()) {
        win.close();
      }
    }
  }

  /**
   * Utility: ensure valid HTML document
   */
  wrapHtmlIfNeeded(html) {
    const trimmed = html.trim().toLowerCase();
    const hasHtmlTag =
      trimmed.startsWith("<!doctype") || trimmed.startsWith("<html");

    if (hasHtmlTag) return html;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            /* Put your consistent print CSS here */
            body {
              margin: 0;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              font-size: 12pt;
            }
          </style>
        </head>
        <body>
          ${html}
        </body>
      </html>
    `;
  }
}

module.exports = { PrintManager };
