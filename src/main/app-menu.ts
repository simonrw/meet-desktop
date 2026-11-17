import { app, Menu } from "electron";

import type { Updates } from "./updates";

/**
 * Opens the app's own windows from a menu.
 */
export interface WindowOpeners {
  openJoinPrompt(): void;
  openSettings(): void;
}

/**
 * Sets the macOS menu bar menus, with Check for Updates and Settings (Cmd+,) items in the app menu and a Join Meeting
 * item (Cmd+J) in the File menu.
 */
export function setAppMenu({ openSettings, openJoinPrompt }: WindowOpeners, updates: Updates): void {
  const menu = Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { id: "check-for-updates", label: "Check for Updates…", click: () => void updates.checkForUpdates() },
        { type: "separator" },
        { id: "settings", label: "Settings…", accelerator: "CommandOrControl+,", click: openSettings },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        { id: "join-meeting", label: "Join Meeting…", accelerator: "CommandOrControl+J", click: openJoinPrompt },
        { type: "separator" },
        { role: "close" },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ]);

  Menu.setApplicationMenu(menu);
}
