import { app, Menu, Tray } from "electron";

import type { Command, MeetingController, MeetingState } from "./meeting-controller";
import { menuBarIconImage, type MenuBarIcon } from "./menu-bar-icons";

export interface MenuBar {
  readonly icon: MenuBarIcon;
  readonly menu: Menu;
}

/**
 * Puts the menu bar item in place: its icon shows the Meeting State, and its menu sends Commands to the Meeting
 * Controller and opens settings through `openSettings`.
 */
export function startMenuBar(controller: MeetingController, openSettings: () => void): MenuBar {
  const send = (type: Command["type"]) => () => controller.command({ type });

  let icon = iconFor(controller.state);
  let menu = buildMenu(controller.state, send, openSettings);

  const tray = new Tray(menuBarIconImage(icon));
  tray.setContextMenu(menu);

  controller.onStateChange((state) => {
    icon = iconFor(state);
    menu = buildMenu(state, send, openSettings);

    tray.setImage(menuBarIconImage(icon));
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
  send: (type: Command["type"]) => () => void,
  openSettings: () => void,
): Menu {
  const inCall = state.status === "in-call";

  return Menu.buildFromTemplate([
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
    { type: "separator" },
    { id: "settings", label: "Settings…", click: openSettings },
    { id: "quit", label: `Quit ${app.name}`, click: () => app.quit() },
  ]);
}
