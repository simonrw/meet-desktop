// The source picker's page: lists the screens and windows on offer and reports the one picked. It runs as a
// sandboxed preload script, which cannot load other local modules.

import { ipcRenderer } from "electron";

import type { PickChannel, PickerSource, SourcesChannel } from "../main/screen-share";

const SOURCES_CHANNEL: SourcesChannel = "source-picker:sources";
const PICK_CHANNEL: PickChannel = "source-picker:pick";

function sourceButton(source: PickerSource): HTMLButtonElement {
  const thumbnail = document.createElement("img");
  thumbnail.src = source.thumbnail;
  thumbnail.alt = "";

  const name = document.createElement("span");
  name.textContent = source.name;

  const button = document.createElement("button");
  button.title = source.name;
  button.append(thumbnail, name);
  button.addEventListener("click", () => ipcRenderer.send(PICK_CHANNEL, source.id));

  return button;
}

function sourceSection(title: string, sources: PickerSource[]): HTMLElement {
  const heading = document.createElement("h2");
  heading.textContent = title;

  const grid = document.createElement("div");
  grid.className = "sources";
  grid.append(...sources.map(sourceButton));

  const section = document.createElement("section");
  section.setAttribute("aria-label", title);
  section.append(heading, grid);

  return section;
}

function cancelButton(): HTMLElement {
  const button = document.createElement("button");
  button.textContent = "Cancel";
  button.addEventListener("click", () => window.close());

  const footer = document.createElement("footer");
  footer.append(button);

  return footer;
}

async function showSources(): Promise<void> {
  const sources: PickerSource[] = await ipcRenderer.invoke(SOURCES_CHANNEL);

  const screens = sources.filter((source) => source.id.startsWith("screen:"));
  const windows = sources.filter((source) => source.id.startsWith("window:"));

  document.body.append(sourceSection("Screens", screens), sourceSection("Windows", windows), cancelButton());
}

window.addEventListener("DOMContentLoaded", showSources);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    window.close();
  }
});
