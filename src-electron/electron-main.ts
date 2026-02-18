import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';

// needed in case process is undefined under Linux
const platform = process.platform || os.platform();

const currentDir = fileURLToPath(new URL('.', import.meta.url));

// Para que las notificaciones funcionen en Windows, necesitamos un ID de modelo de usuario
if (process.platform === 'win32') {
  app.setAppUserModelId('TelasEmanuel');
}

let mainWindow: BrowserWindow | undefined;

function runPowerShell(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || stdout || error.message));
          return;
        }
        resolve();
      },
    );
  });
}

function quoteForPowerShell(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function getPreferredPrinterName(): Promise<string> {
  const printers = await mainWindow?.webContents.getPrintersAsync();
  const list = printers ?? [];
  const thermalPrinter = list.find((p) => {
    const n = p.name.toLowerCase();
    return n.includes('pos') || n.includes('thermal') || n.includes('ticket') || n.includes('tm-t20') || n.includes('xprinter');
  });
  return thermalPrinter?.name || list[0]?.name || '';
}

async function openCashDrawerWindows(printerName: string): Promise<void> {
  const psPrinter = quoteForPowerShell(printerName);
  const script = `
$printerName = ${psPrinter}
$escpos = [byte[]](27,112,0,25,250)

$source = @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] data, int dwCount, out int dwWritten);

  public static bool SendBytesToPrinter(string printerName, byte[] bytes) {
    IntPtr hPrinter;
    DOCINFOA docInfo = new DOCINFOA();
    docInfo.pDocName = "OpenCashDrawer";
    docInfo.pDataType = "RAW";
    int dwWritten = 0;

    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return false;
    try {
      if (!StartDocPrinter(hPrinter, 1, docInfo)) return false;
      try {
        if (!StartPagePrinter(hPrinter)) return false;
        try {
          return WritePrinter(hPrinter, bytes, bytes.Length, out dwWritten);
        } finally {
          EndPagePrinter(hPrinter);
        }
      } finally {
        EndDocPrinter(hPrinter);
      }
    } finally {
      ClosePrinter(hPrinter);
    }
  }
}
"@

Add-Type -TypeDefinition $source -Language CSharp
$ok = [RawPrinterHelper]::SendBytesToPrinter($printerName, $escpos)
if (-not $ok) { throw "No se pudo enviar comando ESC/POS a la impresora: $printerName" }
`;

  await runPowerShell(script);
}

async function createWindow() {
  /**
   * Initial window options
   */
  mainWindow = new BrowserWindow({
    icon: path.resolve(
      currentDir,
      process.env.DEV ? '../../src-electron/icons/win/icon.ico' : 'icons/win/icon.ico',
    ), // tray icon
    width: 1000,
    height: 600,
    useContentSize: true,
    webPreferences: {
      contextIsolation: true,
      // More info: https://v2.quasar.dev/quasar-cli-vite/developing-electron-apps/electron-preload-script
      preload: path.resolve(
        currentDir,
        path.join(
          process.env.QUASAR_ELECTRON_PRELOAD_FOLDER,
          'electron-preload' + process.env.QUASAR_ELECTRON_PRELOAD_EXTENSION,
        ),
      ),
    },
  });

  if (process.env.DEV) {
    await mainWindow.loadURL(process.env.APP_URL);
  } else {
    await mainWindow.loadFile('index.html');
  }

  if (process.env.DEBUGGING) {
    // if on DEV or Production with debug enabled
    mainWindow.webContents.openDevTools();
  } else {
    // we're on production; no access to devtools pls
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow?.webContents.closeDevTools();
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = undefined;
  });
}

/*ipcMain.handle('print-ticket', async (event, html: string) => {
  const win = new BrowserWindow({ show: false })
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  
  // Obtener lista de impresoras
  const printers = await win.webContents.getPrintersAsync()
  console.log('Impresoras disponibles:', printers)
  
  // Buscar impresora térmica (ajusta el nombre según tu impresora)
  const thermalPrinter = printers.find(p => 
    p.name.toLowerCase().includes('pos') || 
    p.name.toLowerCase().includes('thermal') ||
    p.name.toLowerCase().includes('ticket')
  )
  
  const options = {
    silent: true,
    deviceName: thermalPrinter?.name || printers[0]?.name || '',
    margins: { marginType: 'none' as const },
    pageSize: { width: 80000, height: 297000 },
    printBackground: true
  }

  win.webContents.print(options)
  win.close()
  return { success: true }
})*/

ipcMain.handle('print-ticket', async (event, html: string) => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false
    }
  })

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  const printers = await win.webContents.getPrintersAsync()
  const thermalPrinter = printers.find((p) => {
    const n = p.name.toLowerCase()
    return n.includes('pos') || n.includes('thermal') || n.includes('ticket') || n.includes('tm-t20') || n.includes('xprinter')
  })
  
  // Configuración de impresión para tickets térmicos 58mm
  const options: Parameters<typeof win.webContents.print>[0] = {
    silent: true, // Imprimir sin diálogo
    margins: {
      marginType: 'none' as const
    },
    pageSize: {
      width: 58000, // 58mm en micrones
      height: 200000 // Largo suficiente para ticket
    },
    printBackground: true,
    scaleFactor: 100,
    deviceName: thermalPrinter?.name || printers[0]?.name || ''
  }

  try {
    // print() no es async, pero necesitamos dar tiempo para que se procese
    win.webContents.print(options, () => {
      // Cerrar la ventana después de que se complete la impresión
      setTimeout(() => {
        if (!win.isDestroyed()) {
          win.close()
        }
      }, 1000)
    })
    
    return { success: true }
  } catch (error) {
    console.error('Error printing:', error)
    if (!win.isDestroyed()) {
      win.close()
    }
    throw error
  }
})

ipcMain.handle('open-cash-drawer', async () => {
  if (process.platform !== 'win32') {
    return { success: false, message: 'Apertura de caja RAW implementada para Windows' };
  }

  const printerName = await getPreferredPrinterName();
  if (!printerName) {
    throw new Error('No se encontró impresora para abrir caja');
  }

  await openCashDrawerWindows(printerName);
  return { success: true, printerName };
});

void app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === undefined) {
    void createWindow();
  }
});

/*
ipcMain.handle('print-ticket', async (event, html: string) => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false
    }
  })

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  
  // Configuración de impresión para tickets de 80mm
  const options = {
    silent: true, // Imprimir sin diálogo
    margins: {
      marginType: 'none'
    },
    pageSize: {
      width: 80000, // 80mm en micrones
      height: 297000 // Altura auto (largo)
    },
    printBackground: true,
    deviceName: '' // Usar impresora predeterminada, o especifica el nombre
  }

  try {
    await win.webContents.print(options)
    win.close()
    return { success: true }
  } catch (error) {
    console.error('Error printing:', error)
    win.close()
    throw error
  }
})

app.whenReady().then(createWindow)
*/