# Mini Mode moves Meet between two windows

Electron can't add or remove a window's frame after the window is created, and reloading Meet into a new window would drop the call. The Meeting Window therefore hosts Meet in a `WebContentsView` and moves it between two `BaseWindow`s: a framed Full window and a frameless, always-on-top mini window. Each window keeps its own bounds, saved to its own file. The mini window is created the first time the user enters Mini Mode.

A frameless window can't be dragged by its content, and Meet's page isn't ours to add a drag region to. A thin handle page of our own sits over the top of the mini window instead. It moves the window as the user drags it and returns to Full on a double-click.

## Consequences

- The Meeting Window is a `BaseWindow`, not a `BrowserWindow`, so `BrowserWindow.getAllWindows()` and `BrowserWindow.fromWebContents` don't find it. End-to-end tests reach it through `BaseWindow.getAllWindows()`, and screen sharing is handed the window to show the Source Picker over.
- The handle is a page of its own, so end-to-end tests see it as an extra window once Mini Mode has been entered.
- Moving a window while Playwright sends mouse input hangs the test, so dragging the handle is checked by hand in the release smoke checklist.
