# Changelog

All notable changes to **Passable HVAC Card** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.2] - 2026-11-23

### Fixed
- **Runtime & History Chart Overlap in Stats Modal**: Prevented flex-item compression in `.modal-scroll-area` and `.chart-analytics-card` by removing the fixed `min-height: 290px` override and adding `flex-shrink: 0` across `.modal-scroll-area > *`, `.passable-section-card`, `.chart-analytics-card`, and fixed modal header/tab containers, while switching both the **10-Day Bar** and **Today 24h** `<svg>` runtime plots to intrinsic responsive sizing (`display: block; width: 100%; height: auto;`).

## [1.4.1] - 2026-11-23

### Added
- **In-Modal Controls Switcher Button**: Added a circular `mdi:tune-variant` button in the **HVAC & Climate Stats** modal header so users can toggle directly back and forth between Stats and Zone Controls without closing and reopening, preserving the previously active Controls tab across round-trip switches.

## [1.4.0] - 2026-11-23

### Added
- **Dedicated HVAC & Climate Stats Popup**: Added a circular `mdi:chart-line` Stats button on the Smart Climate summary strip (and header/controls popup) that opens a dedicated multi-view analytics modal with `6h` / `24h` / `7d` timeframe selection, live Zone Scope pills (`All Zones`, `Upstairs`, `Downstairs`), 4 top KPI cards (`HOME AVG`, `TODAY RUNTIME`, `CYCLES & DRIFT`, `SPAN HVAC DRAW`), and 3 sub-views:
  - **Temperatures**: Dual-axis multi-room interactive SVG timeline showing all zone room sensors, outdoor temperature on a secondary axis, thermostat setpoints, Heating/Cooling active run shading, night bands, crosshair scrubbing, and toggleable room chips.
  - **Room Balance**: Diverging horizontal bar chart of every room's live `±°F` deviation from its zone setpoint with window min–max range whiskers and `Active` / `Standby` / `Limiting` status tags.
  - **Runtime & Power**: Migrated **10-Day Bar** and **Today 24h** SVG runtime charts alongside per-zone **SPAN Panel** power draw, fan recirculation status, and filter life summary cards.
- **Hybrid Recorder Telemetry Fetcher**: Fetches 6h/24h data via `history/history_during_period` and 7d hourly trends via `recorder/statistics_during_period` with automatic per-entity `history/history_during_period` fallback for sensors lacking `state_class` (such as weather temperature sensors) and attribute parsing for `weather.*` entities.
- **Home Average Temp Summary Metric & Editor Options**: Added `Home` average temperature readout (`sensor.home_average_temperature` with zone-average fallback) directly in `.hvac-summary-strip` with responsive container-query formatting, plus `show_stats_button`, `show_home_avg_in_strip`, `home_temp_sensor`, and `stats_tap_action` config/editor support.

### Changed
- **3-Tab Controls Hub & Inline Fan Recirculation**: Removed the `Stats & Power` tab from the zone Controls modal so it fits cleanly into 3 balanced tabs (**Setpoints**, **Advisor & Comfort**, **Filter & Maint**) across desktop and mobile, and relocated **Fan Recirculation Control** (`Recirculation Active` switch + `Min Fan Runtime` `-5m/+5m` stepper) inline inside the Hero Thermostat card directly beneath **AC Condensers Uncovered**.

## [1.3.9] - 2026-11-22

### Changed & Fixed
- **Per-Zone Thermal Trajectory Simulation**: Updated `_renderAdvisorTabContent` with `_parseSimulationTrajectory` to read each zone's individual forward trajectory (`parsed.zones[zone]` published by `passable_climate` `v1.2.4+`) rather than plotting the averaged whole-house `plan` curve on both Upstairs and Downstairs tabs, with automatic fallback to `plan` on older engine versions.
- **Scope Badge & Climate Outlook Alignment**: Updated the Thermal Trajectory Simulation horizon badge to show the curve scope (`Upstairs • 12h Horizon`, `Downstairs • 12h Horizon`, or `Whole House • 12h Horizon`), and aligned the Climate Outlook trend/RH chips with each zone's own trajectory and summary narrative.

## [1.3.8] - 2026-11-21

### Added
- **In-Popup Multi-System Switcher Pills**: Added a pill switcher bar below the popup header when more than one HVAC system is configured (`modalSystems.length > 1`), showing each system's icon, label, live indoor temperature, and active heating/cooling/fan dot so users can switch systems without closing and reopening the popup while preserving the active tab and loading per-system history analytics.

## [1.3.7] - 2026-11-21

### Fixed
- **Popup Background Scroll Lock**: Added a 3-layer scroll-isolation mechanism (`overscroll-behavior: contain` across all viewports, Shadow-DOM-aware ref-counted background scroll lock with `disconnectedCallback` cleanup, and non-passive `wheel`/`touchmove` boundary guards on `.popup-overlay`), removed `touch-action: none` from mobile `.popup-overlay` so inner touch scrolling remains responsive on iOS/Android, and added `Escape` key dismissal.

## [1.3.6] - 2026-11-20

### Fixed
- **Concentric Inner Corner Radii**: Adjusted `.card-content.no-header` padding (`10px`) and updated `.hvac-summary-strip` and `.hvac-unit-card` border radius to `max(12px, calc(var(--ha-card-border-radius, 20px) - 8px))` so inner box corners follow the outer `ha-card` arc seamlessly in Material You and rounded themes without corner pinching.

## [1.3.5] - 2026-11-14

### Fixed & Changed
- **HVAC Mode Transition Deadband Section**: Separated `input_number.hvac_transition_offset` out of **ASHRAE 55 COMFORT ENVELOPE** into its own **HVAC MODE TRANSITION** section on the **Advisor & Comfort** tab, replaced the misleading `"Pre-Sleep Transition Offset"` / `" min"` / `5`-step control with **Heat / Cool Transition Offset** reading the helper's `step` (`0.5`) and `unit_of_measurement` (`°F`), added a live summary of the resulting Cool→Heat / Heat→Cool mode-switch thresholds, and updated `_adjustNumberEntity` to clamp within `min`/`max` entity attributes.

## [1.3.4] - 2026-11-14

### Fixed
- **HVAC Filter Last Replaced Date**: Restored filter replacement date resolution in `_getZoneFilterMetrics` by checking `attributes.last_replaced` and `attributes.last_changed_<zone>` on both `sensor.hvac_filter_life_remaining_<zone>` and `sensor.hvac_<zone>_filter_runtime` prior to `last_reset`, normalized space-separated timestamps (`YYYY-MM-DD HH:MM:SS`) in `_formatShortDate` for Safari/iOS WebView compatibility, and surfaced `Changed <date>` in the Filter & Maint progress footer alongside a highlighted **Last Replaced** row.
- **Popup Modal Tab Truncation**: Widened `.popup-content` (`max-width: 480px`) and replaced the single-row ellipsis tab strip with a responsive CSS grid (`4` stacked icon-above-label columns on standard screens, transitioning to a `2×2` horizontal-pill grid at `<= 460px`) so all four modal tab labels (**Setpoints**, **Stats & Power**, **Advisor & Comfort**, **Filter & Maint**) render cleanly without clipping at any screen width.

## [1.3.3] - 2026-11-14

### Added
- **Pixel Weather–Style Climate Outlook Card**: Added a dedicated **Climate Outlook** card at the top of the **Advisor & Comfort** tab powered by `passable_climate` `v1.2.3` (`zone_outlook_summaries` / `daily_outlook_summary`) with a live client-side physics fallback (using `sensor.hvac_time_to_temp_${zone}`, `sensor.advisor_simulation_data`, and zone thermal drift). Displays a concise natural-language summary alongside quick-look pills for **Next Cycle / Active ETA**, **12h Passive Trajectory / Drift**, and **RH Trend**, and opens `input_text.hvac_advisor_prediction_message` on tap.

### Changed
- **Advisor Prediction Alert Banner**: Scoped the amber **Overnight Heating Predicted** banner to only appear when an actual heating alert is active (`hasHeatPrediction` or `attributes.heat_prediction_alert`), preventing day-to-day outlook messages from duplicating inside an alert box.

## [1.3.2] - 2026-11-14

### Fixed
- **Thermal Trajectory Simulation Axis Labels & Action Plan Text**: Upgraded the **Advisor & Comfort** trajectory chart SVG to render proper `svg`-namespaced nodes across a 5-gridline dual Y-axis (`Temp (°F)` on the left, `RH (%)` on the right) and timestamped X-axis (`+1h`..`+12h` horizon offsets and local clock hours derived from `sensor.advisor_simulation_data`). Also parsed zone-specific action plan summaries from `sensor.passable_climate_window_recommendation` `attributes.details` instead of falling back to the phase name.

## [1.3.1] - 2026-11-13

### Fixed
- **Main Card Typography & Icon Legibility**: Replaced tiny relative `rem` font sizes (`0.63rem–0.90rem`) on the consolidated main card with explicit, high-legibility `px` typography and icons matching sibling Passable cards (`16px` zone titles, `13.5px` advisor strip, mode/power subtitles, setpoints, and room temps, `12px–13px` chips and room labels, `26px` primary temperature readout) so text does not shrink under Home Assistant's `14px` root font size.

## [1.3.0] - 2026-11-13

### Added
- **Consolidated Quick-Look Main Card**: Single-line **Smart Climate Advisor** summary strip at top (window advisor status, active profile, outdoor temperature, total live HVAC draw, and actionable alert indicator) above ultra-compact 2-line zone rows with inline room temp-range toggles (`3-column` collapsible room tray) and actionable-only status chips (`Coasting`, `Filter <=25%`, `Win Open`, `Pre-Heat/Cool`).
- **4-Tab Analytics & Comfort Modal**: Added a dedicated **Advisor & Comfort** tab with interactive ASHRAE 55 comfort envelope steppers (`comfort_temp_min/max`, `comfort_humidity_min/max`, `dew_point_max`, `hvac_transition_offset`), psychrometric comparison pills (specific enthalpy, enthalpy delta, indoor/outdoor absolute humidity), forward trajectory simulation chart (`sensor.advisor_simulation_data`), and overnight breach prediction alerts.
- **SPAN Panel Power & Ecobee Fan Control**: Upgraded **Stats & Power** tab with live 4-card KPI grid (today heating/cooling/fan runtime, cycles/hr & drift, SPAN air handler + condenser power draw, Ecobee `fan_min_on_time` recirculation stepper) plus quick Refresh Advisor & Retrain MLR action buttons.
- **Visual Air Filter Progress**: Added remaining-life percentage badge, color-coded progress bar, cumulative runtime breakdown, and formatted last-replaced date in **Filter & Maint**.

### Changed & Fixed
- **Dual-Entity HomeKit + Ecobee Bridge**: Automatically pairs `*_hk` HomeKit local climate control entities with companion Ecobee entities (`climate.<zone>`) for `0.1°F` current temperature precision, working `set_preset_mode` calls, `auto` ↔ `heat_cool` normalization, dual-setpoint `heat_cool` steppers, and `ecobee.set_fan_min_on_time` adjustments.
- **Explicit Room Sensor & MLR Mapping**: Preserves explicitly configured hallway/dining thermostat temperature sensors (`Upstairs Hall`, `Dining / Hall`), aligns Ecobee `active_sensors` status matching, and resolves `sensor.*_heat_loss_gain_windows_*` drift entities cleanly.
- **Rendering Performance & Theme Adaptability**: Added `shouldUpdate()` entity-level diff guard, moved history fetches out of `render()` into modal/tab lifecycle hooks, memoized chart datasets, and replaced hardcoded dark colors with Home Assistant theme-adaptive CSS variables for Light and Dark modes.

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
