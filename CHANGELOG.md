# Changelog

All notable changes to **Passable HVAC Card** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
