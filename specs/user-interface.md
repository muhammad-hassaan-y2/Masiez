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
  - **Drone Recovery**: Reset the drone to the level spawn point.

## In-Game Flight HUD
- **Telemetry Readout**: Displays altitude, speed, heading, battery, and flight state.
- **Targeting & Optics**: Displays the aiming reticle, target lock status, optical zoom overlay, and any AI vision bounding boxes received via LiveKit.
