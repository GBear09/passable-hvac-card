# Changelog

All notable changes to **Passable HVAC Card** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
