import { app, Menu } from "electron";

/**
 * Sets the macOS menu bar menus, with a Settings item (Cmd+,) in the app menu that calls `openSettings`.
 */
export function setAppMenu(openSettings: () => void): void {
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
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ]);

  Menu.setApplicationMenu(menu);
}
