import { app, Menu, Tray, type MenuItemConstructorOptions } from "electron";

import type { MeetingController, MeetingState, PlainCommand } from "./meeting-controller";
import { menuBarIconImage, type MenuBarIcon } from "./menu-bar-icons";

export interface MenuBar {
  readonly icon: MenuBarIcon;
  readonly menu: Menu;
}

export interface MenuBarWindows {
  openJoinPrompt(): void;
  openSettings(): void;
}

/**
 * Puts the menu bar item in place: its icon shows the Meeting State, and its menu shows Integration failures, sends
 * Commands to the Meeting Controller and opens the join prompt and settings.
 */
export function startMenuBar(controller: MeetingController, windows: MenuBarWindows): MenuBar {
  const send = (type: PlainCommand["type"]) => () => controller.command({ type });
  const menuFor = () => buildMenu(controller.state, controller.integrationFailures, send, windows);

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

  controller.onIntegrationFailuresChange(() => {
    menu = menuFor();
    tray.setContextMenu(menu);
  });

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

function buildMenu(
  state: MeetingState,
  integrationFailures: string[],
  send: (type: PlainCommand["type"]) => () => void,
  windows: MenuBarWindows,
): Menu {
  const inCall = state.status === "in-call";

  const failureItems: MenuItemConstructorOptions[] = integrationFailures.map((failure) => ({
    label: failure,
    enabled: false,
  }));
  if (failureItems.length > 0) {
    failureItems.push({ type: "separator" });
  }

  return Menu.buildFromTemplate([
    ...failureItems,
    {
      id: "toggle-mute",
      label: inCall && state.muted ? "Unmute" : "Mute",
      enabled: inCall,
      click: send("toggle-mute"),
    },
    {
      id: "toggle-camera",
      label: inCall && !state.cameraOn ? "Turn On Camera" : "Turn Off Camera",
      enabled: inCall,
      click: send("toggle-camera"),
    },
    { type: "separator" },
    { id: "show-window", label: "Show Window", click: send("show-window") },
    { id: "leave-call", label: "Leave Call…", enabled: inCall, click: send("leave-call") },
    { id: "join-meeting", label: "Join Meeting…", click: () => windows.openJoinPrompt() },
    { type: "separator" },
    { id: "settings", label: "Settings…", click: () => windows.openSettings() },
    { id: "quit", label: `Quit ${app.name}`, click: () => app.quit() },
  ]);
}
