import { app, Menu, Tray, type MenuItemConstructorOptions } from "electron";

import type { WindowOpeners } from "./app-menu";
import type { MeetingController, MeetingState, PlainCommand } from "./meeting-controller";
import { menuBarIconImage, type MenuBarIcon } from "./menu-bar-icons";
import type { Updates } from "./updates";

export interface MenuBar {
  readonly icon: MenuBarIcon;
  readonly menu: Menu;
}

/**
 * Puts the menu bar item in place: its icon shows the Meeting State, and its menu shows Integration failures, sends
 * Commands to the Meeting Controller, opens the Join Prompt and settings, checks for Updates, and restarts to install a
 * downloaded Update.
 */
export function startMenuBar(controller: MeetingController, updates: Updates, openers: WindowOpeners): MenuBar {
  const menuFor = () => buildMenu(controller, updates, openers);

  let icon = iconFor(controller.state);
  let menu = menuFor();

  const tray = new Tray(menuBarIconImage(icon));
  tray.setContextMenu(menu);

  controller.onStateChange((state) => {
    icon = iconFor(state);
    menu = menuFor();

    tray.setImage(menuBarIconImage(icon));
    tray.setContextMenu(menu);
  });

  const rebuildMenu = () => {
    menu = menuFor();
    tray.setContextMenu(menu);
  };
  controller.onIntegrationFailuresChange(rebuildMenu);
  updates.onStateChange(rebuildMenu);

  return {
    get icon() {
      return icon;
    },

    get menu() {
      return menu;
    },
  };
}

function iconFor(state: MeetingState): MenuBarIcon {
  if (state.status !== "in-call") {
    return "not-in-call";
  }

  return state.muted ? "muted" : "in-call";
}

function buildMenu(controller: MeetingController, updates: Updates, openers: WindowOpeners): Menu {
  const { state, inCall } = controller;
  const send = (type: PlainCommand["type"]) => () => controller.command({ type });

  // The menu is used while another app is active, and what it opens must come in front of that app's windows.
  const inFront = (open: () => void) => () => {
    app.focus({ steal: true });
    open();
  };

  const failureItems: MenuItemConstructorOptions[] = controller.integrationFailures.map((failure) => ({
    label: failure,
    enabled: false,
  }));
  if (failureItems.length > 0) {
    failureItems.push({ type: "separator" });
  }

  const update = updates.state;
  const updateItems: MenuItemConstructorOptions[] =
    update.status === "ready"
      ? [
          {
            id: "restart-to-update",
            label: `Restart to Update (${update.version})`,
            enabled: !inCall,
            click: () => void updates.restartToUpdate(),
          },
        ]
      : [];

  return Menu.buildFromTemplate([
    ...failureItems,
    {
      id: "toggle-mute",
      label: state.status === "in-call" && state.muted ? "Unmute" : "Mute",
      enabled: inCall,
      click: send("toggle-mute"),
    },
    {
      id: "toggle-camera",
      label: state.status === "in-call" && !state.cameraOn ? "Turn On Camera" : "Turn Off Camera",
      enabled: inCall,
      click: send("toggle-camera"),
    },
    { type: "separator" },
    { id: "show-window", label: "Show Window", click: send("show-window") },
    { id: "toggle-mini-mode", label: "Toggle Mini Mode", click: send("toggle-mini-mode") },
    { id: "leave-call", label: "Leave Call…", enabled: inCall, click: send("leave-call") },
    { id: "join-meeting", label: "Join Meeting…", click: inFront(openers.openJoinPrompt) },
    { type: "separator" },
    { id: "settings", label: "Settings…", click: inFront(openers.openSettings) },
    { id: "check-for-updates", label: "Check for Updates…", click: inFront(() => void updates.checkForUpdates()) },
    ...updateItems,
    { id: "quit", label: `Quit ${app.name}`, click: () => app.quit() },
  ]);
}
