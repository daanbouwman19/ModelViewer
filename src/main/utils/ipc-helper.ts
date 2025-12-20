import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { IpcContract } from '../../shared/ipc-contract';

export interface IpcOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  validators?: ((...args: any[]) => Promise<void> | void)[];
}

export function handleIpc<K extends keyof IpcContract>(
  channel: K,
  handler: (
    event: IpcMainInvokeEvent,
    ...args: IpcContract[K]['payload']
  ) => Promise<IpcContract[K]['response']> | IpcContract[K]['response'],
  options: IpcOptions = {},
) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      if (options.validators) {
        for (const validator of options.validators) {
          await validator(...args);
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await handler(event, ...(args as any));
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
