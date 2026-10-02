# Changelog

All notable changes to **Passable HVAC Card** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
