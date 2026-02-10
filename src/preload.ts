import { contextBridge, ipcRenderer } from "electron";
import type { Settings, TranslateRequest } from "./types";
import { IpcChannels } from "./types";

const electronAPI = {
  translateStart: (request: TranslateRequest) =>
    ipcRenderer.invoke(IpcChannels.TRANSLATE_START, request),
  translateCancel: () => ipcRenderer.invoke(IpcChannels.TRANSLATE_CANCEL),
  settingsGet: () =>
    ipcRenderer.invoke(IpcChannels.SETTINGS_GET) as Promise<Settings>,
  settingsSet: (settings: Settings) =>
    ipcRenderer.invoke(IpcChannels.SETTINGS_SET, settings),
  clipboardCopy: (text: string) =>
    ipcRenderer.invoke(IpcChannels.CLIPBOARD_COPY, text),
  shortcutSuspend: () => ipcRenderer.invoke(IpcChannels.SHORTCUT_SUSPEND),
  shortcutResume: () => ipcRenderer.invoke(IpcChannels.SHORTCUT_RESUME),

  onTranslateChunk: (callback: (chunk: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, chunk: string) =>
      callback(chunk);
    ipcRenderer.on(IpcChannels.TRANSLATE_CHUNK, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.TRANSLATE_CHUNK, listener);
    };
  },
  onTranslateDone: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on(IpcChannels.TRANSLATE_DONE, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.TRANSLATE_DONE, listener);
    };
  },
  onTranslateError: (callback: (error: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, error: string) =>
      callback(error);
    ipcRenderer.on(IpcChannels.TRANSLATE_ERROR, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.TRANSLATE_ERROR, listener);
    };
  },
  onSelectionText: (callback: (text: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, text: string) =>
      callback(text);
    ipcRenderer.on(IpcChannels.SELECTION_TEXT, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.SELECTION_TEXT, listener);
    };
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

export type ElectronAPI = typeof electronAPI;
