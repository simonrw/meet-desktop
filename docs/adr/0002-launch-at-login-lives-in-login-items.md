# Launch at login lives in macOS login items, not the settings file

The spec lists launch at login among the settings in the JSON settings store. The user can also remove the app from login items in System Settings, which the app isn't told about, so a stored copy could say "on" while the app no longer launches. The settings window therefore reads the option from macOS login items each time it shows it, and writes it straight back to them.

## Consequences

In unpackaged builds the option changes the login item for the Electron binary, so end-to-end tests replace the login item calls.
