export {}

declare global {
  interface Window {
    electron?: boolean
    pos?: {
      printTicket: (html: string) => Promise<{ success: boolean }>
      openCashDrawer?: () => Promise<{ success: boolean; message?: string; printerName?: string }>
    }
  }
}