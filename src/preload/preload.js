'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * 通过 contextBridge 安全暴露 API 给渲染进程
 * 渲染进程通过 window.dashboard.* 访问
 */
contextBridge.exposeInMainWorld('dashboard', {
  // ===== 交互模式控制 =====
  setInteractionMode: (interactive) => ipcRenderer.send('set-interaction-mode', interactive),
  toggleInteractionMode: () => ipcRenderer.send('toggle-interaction-mode'),
  // 动态控制鼠标穿透（区域穿透用）
  setMouseIgnore: (ignore) => ipcRenderer.send('set-mouse-ignore', ignore),
  getInteractionMode: () => ipcRenderer.invoke('get-interaction-mode'),

  // ===== 事件监听 =====
  onInteractionModeChanged: (callback) => {
    const handler = (_event, interactive) => callback(interactive);
    ipcRenderer.on('interaction-mode-changed', handler);
    return () => ipcRenderer.removeListener('interaction-mode-changed', handler);
  },
  onRefreshAll: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('refresh-all', handler);
    return () => ipcRenderer.removeListener('refresh-all', handler);
  },
  onAutoArrange: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('auto-arrange', handler);
    return () => ipcRenderer.removeListener('auto-arrange', handler);
  },
  onConfigUpdated: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('config-updated', handler);
    return () => ipcRenderer.removeListener('config-updated', handler);
  },

  // ===== 系统 =====
  getScreenSize: () => ipcRenderer.invoke('get-screen-size'),
  getPlatformInfo: () => ipcRenderer.invoke('get-platform-info'),

  // ===== 多显示器 =====
  getAllDisplays: () => ipcRenderer.invoke('get-all-displays'),
  getCurrentDisplayId: () => ipcRenderer.invoke('get-current-display-id'),

  // ===== 应用信息 =====
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  // ===== 配置持久化（主进程文件） =====
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (data) => ipcRenderer.invoke('config:set', data),

  // ===== 数据获取 =====
  fetchWeather: () => ipcRenderer.invoke('data:weather'),
  fetchStocks: () => ipcRenderer.invoke('data:stocks'),
  fetchNews: () => ipcRenderer.invoke('data:news'),
  fetchIpLocation: () => ipcRenderer.invoke('data:ip-location'),
  fetchHotSearch: () => ipcRenderer.invoke('data:hotsearch'),
  fetchSysMonitor: () => ipcRenderer.invoke('data:sysmonitor'),

  // ===== 设置窗口专用 =====
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  refreshMain: () => ipcRenderer.send('refresh-main'),

  // ===== 桌面整理 =====
  scanDesktop: () => ipcRenderer.invoke('desktop:scan'),
  openDesktopItem: (path) => ipcRenderer.invoke('desktop:open', path),
});
