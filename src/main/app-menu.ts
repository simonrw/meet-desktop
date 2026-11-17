import { app, Menu } from "electron";

/**
 * Opens the app's own windows from a menu.
 */
export interface WindowOpeners {
  openJoinPrompt(): void;
  openSettings(): void;
}

/**
 * Sets the macOS menu bar menus, with a Settings item (Cmd+,) in the app menu and a Join Meeting item (Cmd+J) in the
 * File menu.
 */
export function setAppMenu({ openSettings, openJoinPrompt }: WindowOpeners): void {
  const menu = Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: "about" },
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
