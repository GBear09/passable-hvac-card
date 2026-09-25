# Passable HVAC Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://github.com/hacs/default)
[![version](https://img.shields.io/github/v/release/GBear09/passable-hvac-card)](https://github.com/GBear09/passable-hvac-card/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A dynamic, consolidated multi-system HVAC, heat pump, and comfort control custom card for Home Assistant. Features multi-zone management, overshoot buffer control, active fan recirculation, 10-day heating/cooling runtime analytics, a 24-hour interactive SVG timeline, and air filter maintenance tracking.

---

## 🌟 Key Features

1. **Multi-System Zone Grid**:
   * Supports dual heat pumps (Downstairs & Upstairs) by default or 1–6 customizable HVAC systems.
   * Real-time temperature badges, rounded target setpoints (e.g. `73.9°` -> `74°`), humidity %, and active overshoot offset indicators (`+1°` / `-2°`).
   * Dynamic status chips (`COOLING`, `HEATING`, `FAN ONLY`, `IDLE`, `OFF`) with glowing cards and pulsing/spinning state icons.
   * Air filter lifespan badges with warning (`<= 10h`) and expired (`<= 0h`) indicators.

2. **3-Tab Bottom Sheet Management Hub**:
   * **Setpoints Tab**:
     * HVAC Mode selector (`COOL`, `HEAT`, `AUTO`, `OFF`).
     * Preset Mode selector (`Home`, `Sleep`, `Alt Sleep`, `Eco`, `Away`, etc.).
     * Fine-grained target setpoint step pill (`-` / `+` 0.5°F).
     * **AC Condensers Uncovered** toggle switch.
     * Thermostat-Specific Profile Presets (Home, Sleep, Alt Sleep).
     * Global System Presets (Away, Eco, Vacation, Protect).
     * 2-Column Overshoot Settings Panel with independent Heat & Cool threshold and amount step controls.
   * **Stats & Fan Tab**:
     * Fan Recirculation Active toggle and hourly circulation target stepper pill (min/hr in 5m increments).
     * 10-Day combined heating and cooling runtime bar chart with day selection.
     * Today 24-Hour interactive SVG timeline graph with hourly scrubber, setpoints, outdoor temperatures, and runtime intervals.
   * **Filter & Maintenance Tab**:
     * Filter life remaining hours display.
     * Recommended lifespan stepper pill.
     * 3-step physical air filter replacement guide.
     * One-tap **Reset Filter Life Counter** action button.

3. **Visual Card Editor**:
   * Full graphical card configuration (`custom:passable-hvac-card`).
   * Configurable system counts, entity selectors, and collapsible zone editor panels.

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
