# The Meet Bridge clicks Meet's controls instead of pressing its shortcuts

The spec asked the Meet Bridge to prefer Meet's own keyboard shortcuts (Cmd+D, Cmd+E, Ctrl+Cmd+H), sent to the page as simulated key presses, and to click only where Meet has no shortcut. Against real Meet, the simulated mute shortcut worked with the Meeting Window focused and did nothing with another app focused, which defeats global hotkeys. Every Bridge action therefore clicks the control the Bridge already reads its Meet Signals from, which works whether or not the window is focused.

## Consequences

An action whose control is not in the page (for example, one Meet has moved into an overflow menu in a narrow window) does nothing.
