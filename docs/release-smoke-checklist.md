# Release smoke checklist

The end-to-end tests run against a stub Meet page, so they can't catch changes to the real Meet DOM. Run this checklist against real Google Meet before each release, using a packaged build (`npm run package`) and a Google account whose language is English.

If a step fails, the Meet hooks in `src/preload/meet-bridge.ts` are the first place to look. For screen sharing, look at `src/main/screen-share.ts`.

## Join

- [ ] Launch the app and start or open a meeting. In the lobby (Meet's pre-join screen), the app has not yet treated you as in a call (the mute hotkey does nothing).
- [ ] Join the meeting. Camera and microphone work.

## Join prompt and URL scheme

- [ ] Copy a real Meet link (from a calendar invite), focus another app and choose Join Meeting… in the menu bar menu: the prompt comes to the front with the meeting code filled in. Press Return: the Meeting Window comes to the front on that meeting's pre-join screen.
- [ ] Copy some ordinary text and press Cmd+J in the app: the prompt opens empty. Type `nonsense` and press Return: an error shows under the field and nothing else happens. Press Escape: the prompt closes.
- [ ] Join a call, then use the prompt to join another meeting: the window asks "Leave the call and join …?". Cancel: the call carries on. Try again and choose Leave and Join: the other meeting's pre-join screen opens and you have left the first call (check from a second device).
- [ ] With the app running and its window hidden, run `open meet-desktop://<code>` in Terminal: the Meeting Window comes to the front on that meeting's pre-join screen.
- [ ] Quit the app and run the same command: the app launches straight onto that meeting's pre-join screen.

## Mute by hotkey

The default mute hotkey is Control+Option+M.

- [ ] With the Meeting Window focused, press the hotkey: Meet's microphone button shows muted. Press it again: unmuted.
- [ ] Focus another app and press the hotkey: the microphone toggles in Meet.
- [ ] Close the Meeting Window (it hides) and press the hotkey: after showing the window again from the Dock, the microphone has toggled.
- [ ] Click in Meet's chat box, type a few characters, then press the hotkey: the microphone toggles and nothing extra is typed.
- [ ] Mute with Meet's own microphone button, then press the hotkey: it unmutes (the app followed the change made inside Meet).

## Camera, hand and show window by hotkey

The defaults are Control+Option+C (camera), Control+Option+H (hand) and Control+Option+S (show window).

- [ ] Focus another app and press the camera hotkey: the camera toggles in Meet. Press it again: it toggles back.
- [ ] Focus another app and press the hand hotkey: your hand is raised in Meet. Press it again: it is lowered.
- [ ] Raise your hand with Meet's own button, then press the hand hotkey: it lowers (the app followed the change made inside Meet).
- [ ] Click in Meet's chat box, type a few characters, then press the camera and hand hotkeys: both toggle and nothing extra is typed.
- [ ] Focus another app and press the show-window hotkey: the Meeting Window comes to the front. It also does so when the window is hidden or minimised, and outside a call.

## Screen sharing

Join from a second device or browser profile to see what other participants see.

- [ ] Click Meet's "Share screen" button: the Source Picker lists screens and windows, with thumbnails and names.
- [ ] Pick a screen: the other participant sees it. Stop the share from Meet's own controls: it ends for both sides and the call carries on.
- [ ] Share again and pick a single window: the other participant sees only that window.
- [ ] Share again and cancel the picker (Cancel or Escape): Meet shows no error and the call carries on.
- [ ] Turn off Meet under System Settings > Privacy & Security > Screen & System Audio Recording, relaunch and click "Share screen": the app explains the permission and "Open System Settings" opens that pane, with Meet listed. Turn it back on afterwards.

## Leave

The default leave hotkey is Control+Option+L.

- [ ] In the lobby, press the camera, hand and leave hotkeys: nothing happens.
- [ ] In a call, focus another app and press the leave hotkey: the Meeting Window comes forward asking "Leave the call?". Cancel: the call carries on. Press it again and choose Leave: Meet shows "You left the meeting".
- [ ] Rejoin and close the Meeting Window: the same question appears. Cancel: the window stays and the call carries on. Close again and choose Leave: the call ends and the window hides.
- [ ] Outside a call, close the Meeting Window: it hides without asking.
- [ ] Leave the call with Meet's leave button. On the "You left the meeting" screen, the mute hotkey does nothing.
- [ ] Rejoin from that screen: the mute hotkey works again.
- [ ] Return to the Meet home screen: the mute hotkey does nothing.

## Menu bar

- [ ] Outside a call, the menu bar shows an outlined microphone that is legible in both a light and a dark menu bar (switch System Settings > Appearance). In its menu, Mute, Turn Off Camera and Leave Call… are greyed out.
- [ ] Join a call: the icon fills in. Mute with Meet's own button, then with the hotkey, then from the menu: the icon is crossed out while muted and filled while unmuted.
- [ ] Close the Meeting Window, then use Turn Off Camera and Show Window from the menu: the camera toggles in Meet and the window comes back.
- [ ] Choose Leave Call… from the menu: the window comes forward asking "Leave the call?". Choose Leave: the icon goes back to outlined.
- [ ] Settings… opens the settings window, and Quit Meet quits the app.

## Focus

Create the two Shortcuts described in the README's "Focus during calls" section, using a Focus whose indicator you can see in the menu bar.

- [ ] In settings, press Test in the Focus section: the Focus turns on and then off, and the window says both Shortcuts ran.
- [ ] Turn on "Turn on a Focus during calls". Open a meeting: in the lobby the Focus stays off. Join: the Focus turns on.
- [ ] Leave with Meet's leave button: about 30 seconds later the Focus turns off.
- [ ] Join, leave, and rejoin within 30 seconds: the Focus stays on throughout, and turns off about 30 seconds after the final leave.
- [ ] Join and leave with the leave hotkey, then join and close the Meeting Window choosing Leave: each time the Focus turns off about 30 seconds later.
- [ ] Join and quit Meet with Cmd+Q: the Focus turns off before the app quits.
- [ ] Join, then force quit Meet (Activity Monitor > Force Quit): the Focus stays on. Open Meet again: the Focus turns off.
- [ ] Rename the turn on Shortcut in the Shortcuts app and join: the menu bar menu says the Focus wasn't turned on, and the call carries on. Rename it back.

## Settings

- [ ] Press Cmd+, in the app: the settings window opens, listing each hotkey's combination.
- [ ] Record a new combination for Mute, focus another app and press it: the microphone toggles in a call. The old combination does nothing.
- [ ] Turn off the camera hotkey: pressing its old combination in another app does nothing in Meet, and reaches that app instead.
- [ ] Record a combination another app already uses as a global shortcut (for example, one set up in Raycast or Alfred): the settings window says Mute couldn't use it. Record a different one: the message goes.
- [ ] Quit and relaunch: the changed and turned-off hotkeys are as you left them.
- [ ] Turn on "Launch at login": Meet appears under System Settings > General > Login Items. Turn it off: it disappears.
