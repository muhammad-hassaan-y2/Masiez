# User Interface Specification

## Purpose
Provide a clean flight HUD for piloting and a dedicated **User Menu** for configuring settings and switching levels.

## User Menu (Toggled with `` ` ``)
- **Activation**: Pressing the backquote key (`` ` ``) toggles the User Menu modal and releases pointer lock so the user can interact with settings using the mouse.
- **Level Selection**: Users change maps/levels exclusively from within the User Menu, rather than via hotkeys or toolbars during active flight.
- **Game Settings**:
  - **Sound / Audio**: Toggle game audio mute/unmute.
  - **Flight Speed Profile**: Switch between speed modes (Cruise, Sport, Turbo).
  - **Camera Perspective**: Switch between First-Person View (FPV) and Chase view.
  - **LiveKit Connection**: View WebRTC robot connection status and reconnect if needed.
  - **Mission & Fleet Controls**: Deploy the next drone or restart the mission (resetting targets and drone fleet).

## In-Game Flight HUD
- **Telemetry & Mission Readout**: Displays altitude, speed, heading, warhead status, targets destroyed (`Targets Hit / Total Targets`), remaining drone fleet (`Drones Remaining / Total Drones`), and mission score.
- **Targeting & Optics**: Displays the kamikaze impact reticle, screen-space hostile target markers, target lock status, optical zoom overlay, and any AI vision bounding boxes received via LiveKit.
