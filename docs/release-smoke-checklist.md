# Release smoke checklist

The end-to-end tests run against a stub Meet page, so they can't catch changes to the real Meet DOM or its keyboard shortcuts. Run this checklist against real Google Meet before each release, using a packaged build (`npm run package`) and a Google account whose language is English.

If a step fails, the Meet hooks in `src/preload/meet-bridge.ts` are the first place to look. For screen sharing, look at `src/main/screen-share.ts`.

## Join

- [ ] Launch the app and start or open a meeting. In the lobby (Meet's pre-join screen), the app has not yet treated you as in a call (the mute hotkey does nothing).
- [ ] Join the meeting. Camera and microphone work.

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
