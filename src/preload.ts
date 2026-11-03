import { contextBridge, ipcRenderer } from "electron";
import type {
  ModelInfo,
  Settings,
  TranslateRequest,
  WordDetailResult,
} from "./types";
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
  modelsGet: (apiEndpoint: string, apiKey: string) =>
    ipcRenderer.invoke(IpcChannels.MODELS_GET, apiEndpoint, apiKey) as Promise<
      ModelInfo[]
    >,

  // Translate events carry the id of the TranslateRequest they belong to.
  onTranslateChunk: (callback: (requestId: number, chunk: string) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      requestId: number,
      chunk: string,
    ) => callback(requestId, chunk);
    ipcRenderer.on(IpcChannels.TRANSLATE_CHUNK, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.TRANSLATE_CHUNK, listener);
    };
  },
  onTranslateDone: (callback: (requestId: number) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, requestId: number) =>
      callback(requestId);
    ipcRenderer.on(IpcChannels.TRANSLATE_DONE, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.TRANSLATE_DONE, listener);
    };
  },
  onTranslateError: (callback: (requestId: number, error: string) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      requestId: number,
      error: string,
    ) => callback(requestId, error);
    ipcRenderer.on(IpcChannels.TRANSLATE_ERROR, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.TRANSLATE_ERROR, listener);
    };
  },
  onTranslateWordDetail: (
    callback: (requestId: number, result: WordDetailResult) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      requestId: number,
      result: WordDetailResult,
    ) => callback(requestId, result);
    ipcRenderer.on(IpcChannels.TRANSLATE_WORD_DETAIL, listener);
    return () => {
      ipcRenderer.removeListener(IpcChannels.TRANSLATE_WORD_DETAIL, listener);
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
