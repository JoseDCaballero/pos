/**
 * Utility functions for controlling a cash drawer (caja registradora)
 * Supports ESC/POS protocol which is common for receipt printers and cash drawers
 */

// Extend Navigator interface for USB API
declare global {
  interface Navigator {
    usb?: USB;
    serial?: SerialPortAPI;
  }
}

interface USB {
  requestDevice(options: {
    filters: Array<{ vendorId?: number; productId?: number }>;
  }): Promise<USBDevice>;
}

interface USBDevice {
  open(): Promise<void>;
  close(): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  transferOut(endpointNumber: number, data: BufferSource): Promise<USBOutTransferResult>;
}

interface USBOutTransferResult {
  bytesWritten: number;
  status: string;
}

interface SerialPortAPI {
  requestPort(): Promise<SerialPort>;
}

interface SerialPort {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  writable: WritableStream<Uint8Array>;
}

/**
 * Generate ESC/POS command to open cash drawer
 * Uses the standard ESC POS command: ESC p (decimal: 27 112)
 * @returns Uint8Array with the ESC POS command
 */
export function generateOpenDrawerCommand(): Uint8Array {
  // ESC p m t1 t2
  // m = 0 (printer default), t1 = 50ms, t2 = 100ms (total time drawer stays open)
  const command = new Uint8Array([
    0x1b, // ESC
    0x70, // p
    0x00, // m (printer default)
    0x64, // t1 (100ms)
    0xc8, // t2 (200ms)
  ]);
  return command;
}

/**
 * Open cash drawer via USB printer or network connection
 * This sends an ESC/POS command to open the drawer
 * @param printerUrl - Optional printer URL for network printers (e.g., 'http://localhost:9100')
 */
export async function openCashDrawer(printerUrl?: string): Promise<void> {
  const command = generateOpenDrawerCommand();

  if (printerUrl) {
    // Network printer approach
    try {
      const response = await fetch(printerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: new Blob([command as unknown as BlobPart]),
      });
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }
    } catch (networkError) {
      console.error('Error opening cash drawer via network:', networkError);
      throw networkError;
    }
  } else {
    // Local USB printer via Web USB API
    try {
      if (!navigator.usb) {
        throw new Error('Web USB API not available');
      }

      const device = await navigator.usb.requestDevice({
        filters: [
          { vendorId: 0x04b8 }, // Epson
          { vendorId: 0x0a81 }, // Star Micronics
          { vendorId: 0x0519 }, // Zebra
        ],
      });

      await device.open();
      await device.claimInterface(0);

      await device.transferOut(1, command.buffer as ArrayBuffer);

      await device.close();
    } catch (usbError) {
      // Fallback: Try to use Web Serial API if USB fails
      try {
        await openCashDrawerViaSerial();
      } catch (serialError) {
        console.error('Error opening cash drawer via USB and serial:', usbError, serialError);
        console.warn('Cash drawer opening failed. Make sure printer is connected and configured.');
      }
    }
  }
}

/**
 * Alternative method using Web Serial API for serial port printers
 */
async function openCashDrawerViaSerial(): Promise<void> {
  try {
    if (!navigator.serial) {
      throw new Error('Web Serial API not available');
    }

    const port = await navigator.serial.requestPort();

    await port.open({ baudRate: 9600 });

    const writer = port.writable.getWriter();
    const command = generateOpenDrawerCommand();
    await writer.write(command);
    writer.releaseLock();

    await port.close();
  } catch (error) {
    console.error('Web Serial API error:', error);
    throw error;
  }
}

/**
 * Simulate cash drawer opening for testing
 * Shows a visual indicator and plays sound
 */
export function simulateCashDrawer(): void {
  // Play a sound
  const audioContext = new (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  )();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = 800;
  gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.5);

  // Log for debugging
  console.log('🎵 Simulated cash drawer opening sound');
}
