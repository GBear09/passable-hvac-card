# Changelog

All notable changes to **Passable HVAC Card** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.3] - 2026-11-13

### Fixed
- **Target Setpoint Stepper on Integer-Quantized Thermostats**: Reads `target_temp_step` from the climate entity (falling back to `1°F` / `0.5°C` when omitted, such as on HomeKit `*_hk` entities) instead of hardcoding `±0.5` steps, preventing `+`/`-` adjustments in the Setpoints popup from getting stuck when HomeKit rounds half-degree steps back. Also clamps adjustments within `min_temp`/`max_temp` and preserves half-degree display when `target_temp_step < 1`.

## [1.2.2] - 2026-11-11

### Fixed
- **14D Compliance String Parsing**: Parses compliance percentage directly from string-formatted `compliance_summary` attributes on `sensor.passable_climate_window_recommendation`.

## [1.2.1] - 2026-11-08

### Changed
- **Next Automatic HVAC Cycle Prediction vs. Action-Required Pre-Conditioning**: Distinguished informational next cycle predictions (`Next Heat ~7:25 PM` / `Next Cool ~2:10 PM`, shown in a calm neutral badge when the thermostat is already actively maintaining the zone) from action-required pre-conditioning (`Pre-Heat @ HH:MM` / `Pre-Cool @ HH:MM`, shown only when HVAC is off, windows are open, or during extreme weather prep).
- **Modal Learned Swing/Coast Attribute Resolution**: Added direct support for `learned_swing_heat_f`, `learned_swing_cool_f`, `learned_coast_f`, and `learned_coast_minutes` attributes on `sensor.hvac_time_to_temp_<zone>`.

## [1.2.0] - 2026-11-08

### Added
- **Smart Climate Engine (`passable_climate` v1.2.0) Telemetry Pills**: Auto-detects and renders optional main-card pills for post-compressor thermal coast (`Coasting`), open windows / debouncing windows (`X Windows Open` / `Window Debouncing`), and dynamic rate-derived pre-conditioning (`Pre-Cool @ HH:MM` / `Pre-Heat @ HH:MM`).
- **Expanded Mechanical & Comfort Diagnostics**: Supports `"Idle Comfort Stall"` and `"Filter Overdue"` states from `sensor.hvac_health_status_<zone>` with human-readable `stall_reason` alert banners in the Setpoints modal.
- **Learned Hysteresis Swing & Coast Readout**: Displays learned thermostat deadband swing and post-run coast (`Swing ±X°F • Coast Y°F (~Zm)`) inside the Setpoints Hero banner.
- **Per-Room Passive Thermal Drift & Sleep Limiting Bedroom Indicator**: Enriches Remote Room Sensor tiles with live passive room drift rates (`+0.4°/h` / `-0.3°/h`), highlights the sleep-limiting bedroom (`Limiting`), and provides a 1-tap **Apply Offset** chip when `recommended_sleep_offset_f` is non-zero.
- **Smart Climate Advisor & Learning Section (Stats & Fan Tab)**: Compact summary card showing active model source (`InfluxDB MLR` vs `Online EWMA`), live fault-tolerant zone drift rate, learned swing/coast, and 14-day window compliance metrics.

## [1.0.5] - 2026-10-02

### Added
- **Option 5 Thermal Range Summary Pill**: Replaced cluttered multi-row sensor badges on the main card with an ultra-compact single badge displaying sensor count and thermal spread (e.g. `[4 Sensors: 71.3° – 74.1° ▾]`).
- **Inline Expandable Sensor Tray**: Tapping the summary pill smoothly expands/collapses an inline tray displaying individual room temperature readings with participation dots (`Active` vs `Standby`).
- **Start Sensors Expanded Toggle**: Added `sensors_start_expanded` configuration and visual editor switch (both globally and per-system) to control whether the tray is initially open or collapsed.
- **Thermostat Sensor Filtering**: Automatically filters out redundant thermostat internal sensors (e.g. "Upstairs Thermostat") from the remote room list so only actual remote sensors are summarized. Added `exclude_thermostat_sensor` switch to override if desired.
- **Intelligent Room Name Shortener**: Automatically strips repetitive boilerplate suffixes (`"Bedroom"`, `"'s Room"`, `"Room"`) for clean, instant recognition (e.g. "Master", "Maggie", "Max", "Madeleine").

## [1.0.4] - 2026-10-02

### Added
- **Remote Room Sensors Integration**: Support for remote room temperature sensors tied to each thermostat (automatic discovery for Ecobee thermostats from `available_sensors` and `active_sensors`, with optional manual entity configuration).
- **Remote Sensor Main Card Strip**: Displays compact room temperature pills on the main card by default with active comfort-profile participation indicators.
- **Remote Room Sensors Modal Grid**: Dedicated room sensor grid in the Setpoints popup tab displaying room name, temperature, and participation state.
- **Sensor Visibility Options**: Added global and per-system `hide_sensors_on_card` toggles in both the visual editor and card configuration.

### Changed
- **Clickable Unit Blocks**: Clicking anywhere on an HVAC system unit block now opens the controls and analytics popup for that system.
- **Removed Separate Cog Button**: Replaced the separate far-right action button with full unit block touch targeting.
- **Static Notification Chips**: Removed pulse animations from "Replace Filter", filter warning chips, and alert indicator dots for clean, unobtrusive status reporting.

## [1.0.3] - 2026-10-02

### Changed
- **Popup & Tab Harmonization**: Aligned active tabs (`.popup-tab.active-tab`, `.hvac-tab-btn.active`) and active mode buttons (`.hvac-mode-btn.active`) to use filled `var(--primary-color)` with dynamic high-contrast text (`var(--text-primary-color, var(--primary-text-color))`), matching the Passable vehicle card and design system.
- **Theme-Adaptive Steppers & Panels**: Updated `.step-controller-pill` and preset/overshoot group sub-panels from hardcoded `rgba(0,0,0,0.4)` and `rgba(255,255,255,0.03)` to theme-adaptive CSS variables (`var(--secondary-background-color)`, `var(--divider-color)`), ensuring consistent readability in both light and dark themes.
- **Step Indicators**: Updated `.step-num` circle to dynamic `var(--primary-color)` and contrast text.

## [1.0.2] - 2026-10-02

### Changed
- **Light Theme Safety**: Replaced hardcoded charcoal dark background fallbacks (`#1c1c1e`) across tab buttons, popup dialogs, and selects with light-theme-adaptive CSS variables (`var(--card-background-color, #fff)`).
- **Registry Metadata**: Standardized `window.customCards` configuration with `documentationURL`.

## [1.0.1] - 2026-09-22

### Fixed
- Fan recirculation cycle and runtime analytics formatting.

## [1.0.0] - 2026-09-19

### Added
- Initial standalone release of Passable HVAC Card.
