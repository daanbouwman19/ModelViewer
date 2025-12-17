import { ipcMain, IpcMainInvokeEvent } from 'electron';

export interface IpcOptions {
  validators?: ((...args: any[]) => Promise<void> | void)[];
}

export function handleIpc<T>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<T> | T,
  options: IpcOptions = {},
) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      if (options.validators) {
        for (const validator of options.validators) {
          await validator(...args);
        }
      }
      const data = await handler(event, ...args);
      return { success: true, data };
    } catch (error: unknown) {
      console.error(`[IPC] Error on ${channel}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });
}
