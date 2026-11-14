# Passable HVAC Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://github.com/hacs/default)
[![version](https://img.shields.io/github/v/release/GBear09/passable-hvac-card)](https://github.com/GBear09/passable-hvac-card/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A dynamic, consolidated multi-system HVAC, heat pump, and comfort control custom card for Home Assistant. Features multi-zone management, overshoot buffer control, active fan recirculation, 10-day heating/cooling runtime analytics, a 24-hour interactive SVG timeline, and air filter maintenance tracking.

---

## 🌟 Key Features

1. **Consolidated Quick-Look Zone View**:
   * Single-line **Smart Climate Advisor** summary strip at top (window advisor state, active profile, outdoor temp, total HVAC power draw, and alert indicator — tap to jump straight to Advisor & Comfort).
   * Ultra-compact 2-line zone rows with state-tinted circular icons, `0.1°F` current temperature precision, target & humidity subline, actionable-only inline status chips (`Coasting`, `Filter <=25%`, `Win Open`, `Pre-Heat/Cool`, health alerts), and an inline clickable room temperature range chip toggling a 3-column room sensor tray.
   * Dual-entity HomeKit (`*_hk`) + companion Ecobee (`climate.<zone>`) bridging for instant local HVAC action tracking alongside `0.1°F` precision, working preset modes, and `ecobee.set_fan_min_on_time` fan recirculation.

2. **4-Tab Bottom Sheet Management Hub**:
   * **Setpoints Tab**:
     * HVAC Mode selector (`COOL`, `HEAT`, `AUTO` / `heat_cool`, `OFF`) and routed Ecobee Preset selector (`Home`, `Sleep`, `Alt Sleep`, `Eco`, `Away`).
     * Single or dual (`heat_cool`) target setpoint steppers and **AC Condensers Uncovered** toggle.
     * Remote room sensor grid showing Active / Standby / Limiting states and passive drift rates (`°/h`).
     * Collapsible accordions for Profile Preset Setpoints and independent Heat/Cool Overshoot settings.
   * **Stats & Power Tab**:
     * 4-KPI header grid: Today Runtime (Heat/Cool/Fan), Cycles/hr & Drift, live **SPAN Panel** Air Handler + Condenser zone draw, and Fan Recirculation runtime.
     * Recirculation toggle & Ecobee minimum fan runtime stepper (`min/hr`), plus 10-Day Bar & Today 24h interactive SVG analytics.
   * **Advisor & Comfort Tab**:
     * Window recommendation phase & overnight breach prediction banner with **Refresh** and **Retrain MLR** controls.
     * Psychrometric comparison pills (outdoor enthalpy, zone enthalpy delta, indoor vs. outdoor absolute humidity).
     * Forward Thermal Trajectory Simulation SVG (`sensor.advisor_simulation_data`) and MLR learning telemetry (`InfluxDB MLR` vs. `EWMA`, drift rate, swing/coast, 14-day compliance).
     * Interactive ASHRAE 55 comfort envelope steppers (`comfort_temp_min/max`, `comfort_humidity_min/max`, `dew_point_max`, `hvac_transition_offset`).
   * **Filter & Maint Tab**:
     * Visual filter lifespan progress bar, remaining percentage badge, runtime hours, formatted last-replaced date, lifespan stepper, and one-tap **Reset Filter Life Counter**.

3. **Visual Card Editor**:
   * Full graphical card configuration (`custom:passable-hvac-card`) with advisor strip toggle, global/per-system sensor visibility options, and theme-adaptive styling.

---

## 📦 Installation via HACS

1. Open **HACS** in your Home Assistant instance.
2. Click the three dots in the top-right corner and select **Custom repositories**.
3. Add Repository URL: `https://github.com/GBear09/passable-hvac-card`
4. Select Category: **Dashboard** (or **Lovelace**).
5. Click **Add**, find **Passable HVAC Card**, and click **Download**.
6. Hard refresh your browser (`Ctrl + Shift + R` or `Cmd + Shift + R`).

---

## ⚙️ Configuration Examples

### Minimal / Auto-Detected Example
```yaml
type: custom:passable-hvac-card
show_header: false
outdoor_temp_sensor: sensor.weather_temperature
outdoor_weather_entity: weather.home
```

### Full Dual Heat Pump Example (with Custom Helpers)
```yaml
type: custom:passable-hvac-card
title: HVAC Systems
show_header: true

# Downstairs Unit
downstairs_climate: climate.downstairs
downstairs_climate_hk: climate.downstairs_hk
downstairs_setpoint_preset: input_text.hvac_active_profile
downstairs_overshoot_active: input_boolean.hvac_overshoot_active_downstairs
downstairs_cool_overshoot: input_number.hvac_overshoot_amount_cool
downstairs_heat_overshoot: input_number.hvac_overshoot_amount_heat
downstairs_filter_hours: sensor.hvac_filter_life_remaining_downstairs
downstairs_filter_life: input_number.hvac_filter_life_downstairs
downstairs_cool_daily: sensor.hvac_downstairs_cooling_daily
downstairs_heat_daily: sensor.hvac_downstairs_heating_daily
downstairs_cool_today: sensor.hvac_downstairs_cooling_today
downstairs_heat_today: sensor.hvac_downstairs_heating_today

# Upstairs Unit
upstairs_climate: climate.upstairs
upstairs_climate_hk: climate.upstairs_hk
upstairs_setpoint_preset: input_text.hvac_active_profile
upstairs_overshoot_active: input_boolean.hvac_overshoot_active_upstairs
upstairs_cool_overshoot: input_number.hvac_overshoot_amount_cool
upstairs_heat_overshoot: input_number.hvac_overshoot_amount_heat
upstairs_filter_hours: sensor.hvac_filter_life_remaining_upstairs
upstairs_filter_life: input_number.hvac_filter_life_upstairs
upstairs_cool_daily: sensor.hvac_upstairs_cooling_daily
upstairs_heat_daily: sensor.hvac_upstairs_heating_daily
upstairs_cool_today: sensor.hvac_upstairs_cooling_today
upstairs_heat_today: sensor.hvac_upstairs_heating_today

# Global Helpers
global_setpoint_preset: input_select.home_mode
ac_condensers_uncovered: input_boolean.ac_condensers_uncovered
outdoor_weather_entity: weather.home
```

---

## 📄 License
MIT License. Created by GBear09.
