# Meet

Google Meet in its own macOS window, with system-wide hotkeys to control the call from any app.

## Features

- **Its own window**: Meet runs in a dedicated window with its own Google login, kept separate from your browser profile. The login survives relaunches, and the window remembers its size and position.
- **Quick joining**: paste a Meet link or meeting code into the join prompt (Cmd+J), or open a `meet-desktop://` URL from a script, Raycast or Alfred.
- **Menu bar item**: a microphone icon in the menu bar shows whether you're in a call and whether you're muted, and its menu controls the call.
- **Global hotkeys**: mute, toggle the camera, raise your hand, bring the window forward or leave the call, whichever app is focused.
- **Screen sharing**: pick a whole screen or a single window to share from the app's own picker.
- **Safe closing**: closing the window during a call asks before leaving. Outside a call, closing just hides the window.
- **Links open in your browser**: links clicked inside Meet (for example in chat) open in your default browser. Meet and Google sign-in pages stay in the window.

## Requirements

- macOS
- A Google account whose language is set to English (the hotkeys find Meet's buttons by their English labels)

## Install

There are no prebuilt releases yet, so build the app from source. You need [Node.js](https://nodejs.org/) (the version is pinned in `mise.toml`).

```sh
npm install
npm run package
```

The app is written to `release/mac-arm64/Meet.app` (or `release/mac/Meet.app` on Intel). Drag it into `/Applications`.

## Using Meet

Open the app and sign in to Google as you would in a browser, then start or join a meeting.

The first time you join a call, macOS asks for camera and microphone access. Allow both.

### Joining a meeting

Press Cmd+J (or File > Join Meeting…, or Join Meeting… in the menu bar menu) and enter a Meet link such as `https://meet.google.com/abc-defg-hij`, or just the code `abc-defg-hij`. Press Return to open the meeting's pre-join screen. If you copied a Meet link or code before opening the prompt, it's already filled in, so Return joins it straight away. Escape closes the prompt.

To open a meeting from a script, Raycast or Alfred, open a URL in the app's own scheme:

```sh
open meet-desktop://abc-defg-hij
```

This works whether or not Meet is running. The scheme is only registered for the packaged app, not for `npm start`.

Joining another meeting during a call asks first whether to leave the current one.

### Hotkeys

The hotkeys work from any app, but only while you're in a call (not on Meet's home screen or the pre-join screen). Show window works at any time.

| Action      | Default            |
| ----------- | ------------------ |
| Mute        | Control+Option+M   |
| Camera      | Control+Option+C   |
| Raise hand  | Control+Option+H   |
| Show window | Control+Option+S   |
| Leave call  | Control+Option+L   |

The hotkeys stay in step with Meet: if you mute with Meet's own button, the mute hotkey unmutes.

Leave call brings the window forward and asks "Leave the call?" before hanging up. Pressing Return cancels, so a stray keypress while typing in another app won't end the call.

### Menu bar

The microphone icon in the menu bar shows where you are:

- **Outlined**: not in a call.
- **Filled**: in a call.
- **Crossed out**: in a call and muted.

Click it for Mute, Turn Off Camera, Show Window, Leave Call…, Join Meeting…, Settings… and Quit Meet. Mute, camera and Leave Call are greyed out outside a call. Leave Call asks before hanging up, as the hotkey does. The menu works while the window is hidden.

### Settings

Open settings with Cmd+, (or Meet > Settings…, or Settings… in the menu bar menu). Changes take effect straight away.

- **Change a hotkey**: click Record, then press the new combination. Press Escape to cancel.
- **Turn off a hotkey**: click Turn off to free its combination for other apps. Record a combination to turn it back on.
- **Launch at login**: opens Meet when you log in. This is the same setting as System Settings > General > Login Items.

If another app (for example Raycast or Alfred) already uses a combination, or another hotkey in Meet does, the settings window says so and keeps your previous combination. Record a different one.

### Sharing your screen

Click Meet's "Share screen" button and pick a screen or window. Stop sharing from Meet's own controls.

macOS only lets approved apps record the screen. The first time you share, Meet explains this and offers to open System Settings. Turn on Meet under Privacy & Security > Screen & System Audio Recording, reopen Meet when macOS asks, then share again.

### Closing and quitting

- Closing the window hides it. Bring it back from the Dock, the menu bar menu or the show window hotkey.
- During a call, closing the window asks whether to leave first. Choosing Cancel keeps the window open and the call going.
- Quit with Cmd+Q or Quit Meet in the menu bar menu. Hotkeys stop working once Meet has quit.

## Troubleshooting

- **A hotkey does nothing**: check you're in a call rather than in the pre-join screen. Check the settings window for a message saying another app owns the combination.
- **Mute or camera hotkeys stopped working after a Meet update**: Google may have changed Meet's page. Please open an issue.
- **A control is missing in a narrow window**: when Meet moves a button into its overflow menu, its hotkey can't reach it. Widen the window.
- **Screen sharing shows a permission message every time**: check Meet is turned on under System Settings > Privacy & Security > Screen & System Audio Recording, then quit and reopen Meet.

## Development

```sh
npm start            # build and run
npm test             # unit tests
npm run test:e2e     # end-to-end tests against a stub Meet page
npm run typecheck
```

Before a release, run through [docs/release-smoke-checklist.md](docs/release-smoke-checklist.md) against real Google Meet.
