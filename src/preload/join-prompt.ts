// The Join Prompt's page: sends what the user enters to the main process and shows any error inline. It runs as a
// sandboxed preload script, which cannot load other local modules.

import { ipcRenderer } from "electron";

import type { CloseChannel, JoinChannel, JoinResult, PrefillChannel } from "../main/join-prompt";

const PREFILL_CHANNEL: PrefillChannel = "join-prompt:prefill";
const JOIN_CHANNEL: JoinChannel = "join-prompt:join";
const CLOSE_CHANNEL: CloseChannel = "join-prompt:close";

window.addEventListener("DOMContentLoaded", async () => {
  const form = document.querySelector("form")!;
  const input = document.querySelector("input")!;
  const error = document.querySelector<HTMLElement>(".error")!;

  input.value = await ipcRenderer.invoke(PREFILL_CHANNEL);
  input.select();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const result: JoinResult = await ipcRenderer.invoke(JOIN_CHANNEL, input.value);

    error.hidden = result === undefined;
    error.textContent = result?.error ?? "";
  });

  input.addEventListener("input", () => {
    error.hidden = true;
  });
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    ipcRenderer.send(CLOSE_CHANNEL);
  }
});
