/* ReGen - preload. The game needs nothing from Node, so this exposes only a
 * read-only marker the renderer can use to know it is running as a desktop
 * build (used to show the Quit button and hide the browser-only hints). */
'use strict';
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('ReGenNative', {
  platform: 'windows',
  shell: 'electron',
  version: process.versions.electron
});
