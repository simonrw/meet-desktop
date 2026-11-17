# Meet Desktop

A macOS desktop app that hosts Google Meet in its own window and ties the rest of the system (hotkeys, menu bar, Focus, Slack) to the state of the call.

## Language

**Meeting Window**:
The app window hosting Meet. It has two presentations: **Full** and **Mini Mode**, a compact always-on-top window that floats over other apps. The user can also keep the Full presentation on top of other apps' windows with the "Keep window on top" setting. The window returns to Full when a call ends, and can enter Mini Mode by itself when the user switches to another app during a call (**auto Mini Mode**).
_Avoid_: Main window, browser window, PiP

**Meeting State**:
Where the user is in Meet: `idle` (Meet home or nothing loaded), `lobby` (Meet's pre-join screen) or `in-call`. Mute, camera and raised-hand states are attached while `in-call`.
_Avoid_: Call state, call status

**Meet Signal**:
An observation from the Meet page, for example "entered lobby", "entered call", "left call", "mute changed", "camera changed" or "hand changed". "Left call" covers any return to a page with no meeting on it, including backing out of the lobby.
_Avoid_: Event, page event

**Command**:
A user intent from a hotkey, the menu bar or the UI, for example "toggle mute", "leave call", "show window", "toggle Mini Mode", "close window" or "join meeting". Call-only Commands (mute, camera, hand, leave) do nothing outside `in-call`. The leave call Command, and the close window and join meeting Commands during a call, leave only once the user confirms.
_Avoid_: Action, shortcut

**Join Prompt**:
A small window that takes a Meet link or meeting code and opens that meeting's pre-join screen in the Meeting Window. It is prefilled with a Meet link or code found on the clipboard.
_Avoid_: Join dialog, join box

**Meeting Code**:
The `abc-defg-hij` part of a Meet link, which names a meeting. The app's own URL scheme opens one, as in `meet-desktop://abc-defg-hij`.
_Avoid_: Meeting ID, room

**Hotkey**:
A system-wide key combination that sends a Command whichever app is focused. The user can record a different combination for each hotkey, or turn it off.
_Avoid_: Shortcut, keybinding

**Meet Bridge**:
The part of the app that lives in the Meet page: it turns what it sees there into Meet Signals and carries out Bridge actions (such as clicking Meet's microphone button) on request.
_Avoid_: Content script, injector

**Source Picker**:
The app's own dialog listing the screens and windows that can be shared, shown when Meet asks to share the screen.
_Avoid_: Screen picker, share dialog

**Integration**:
A system side effect tied to being in a call, with an apply step and a restore step. The first two are the Focus Integration and the Slack Integration.
_Avoid_: Plugin, hook

**Integration Ledger**:
A saved record of which Integrations are applied and the state each needs to restore. An entry is added as an Integration starts to apply and removed once it restores, so entries found at launch mean the app crashed during a call, and are restored then.
_Avoid_: Journal, restore log

**Release**:
A build of `main` published on GitHub Releases, numbered `major.minor.patch` with the patch taken from the release workflow's run number.
_Avoid_: Build, version (for the published artifact)

**Update**:
A Release newer than the running app, which the app downloads in the background and installs when the user quits or restarts to update.
_Avoid_: Upgrade, patch, OTA update
