import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

// needed in case process is undefined under Linux
const platform = process.platform || os.platform();

const currentDir = fileURLToPath(new URL('.', import.meta.url));

// Para que las notificaciones funcionen en Windows, necesitamos un ID de modelo de usuario
if (process.platform === 'win32') {
  app.setAppUserModelId('TelasEmanuel');
}

let mainWindow: BrowserWindow | undefined;

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
  
  // Configuración de impresión para tickets de 80mm
  const options: Parameters<typeof win.webContents.print>[0] = {
    silent: true, // Imprimir sin diálogo
    margins: {
      marginType: 'none' as const
    },
    pageSize: {
      width: 80000, // 80mm en micrones
      height: 297000 // Altura auto (largo)
    },
    printBackground: true,
    deviceName: '' // Usar impresora predeterminada, o especifica el nombre
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