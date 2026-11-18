'use strict';
/**
 * Shell preload: exposes a narrow, promise-based bridge as window.polaris.
 * No Node.js or Electron objects cross the bridge — only plain data.
 */
const { contextBridge, ipcRenderer } = require('electron');

const INVOKE = /^(win|shell|app|game|settings|config|profiles|library|dialog|analytics|metrics|maps|replays|updates|plugins|server|cloud|market|workspace|journal|automation|backups|diagnostics|realtime):[a-zA-Z]{2,32}$/;
const EVENTS = new Set(['win:state', 'game:state', 'game:match', 'metrics:sample', 'updates:status', 'hotkey', 'toast', 'config:changed', 'settings:changed', 'realtime:status', 'realtime:event']);

async function invoke(channel, ...args) {
  if (typeof channel !== 'string' || !INVOKE.test(channel)) throw new Error(`Channel not allowed: ${channel}`);
  const r = await ipcRenderer.invoke(channel, ...args);
  if (r && r.__error) {
    const e = new Error(r.message);
    e.code = r.code; e.status = r.status; e.details = r.details;
    throw e;
  }
  return r;
}

function on(event, fn) {
  if (!EVENTS.has(event) || typeof fn !== 'function') throw new Error(`Event not allowed: ${event}`);
  const wrapped = (_e, data) => fn(data);
  ipcRenderer.on(event, wrapped);
  return () => ipcRenderer.removeListener(event, wrapped);
}

contextBridge.exposeInMainWorld('polaris', { invoke, on, platform: process.platform });
