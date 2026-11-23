/**
 * Passable HVAC Card
 * Version: 1.4.2
 * GitHub: https://github.com/GBear09/passable-hvac-card
 *
 * Dynamic Multi-System HVAC, Heat Pump, and Comfort Control Custom Card for Home Assistant.
 * Features multi-zone management, overshoot buffer control, inline fan recirculation,
 * dedicated multi-room climate & runtime statistics popup, and air filter maintenance tracking.
 */

const CARD_VERSION = "1.4.2";

const HVAC_ROOM_PALETTE = [
  "#38bdf8",
  "#f59e0b",
  "#a855f7",
  "#22c55e",
  "#f43f5e",
  "#14b8a6",
  "#fb923c",
  "#6366f1",
  "#ec4899",
  "#84cc16",
  "#06b6d4",
  "#eab308",
];

const LitElement = Object.getPrototypeOf(
  customElements.get("hui-entities-card")
);
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;
const svg = LitElement.prototype.svg || ((strings, ...values) => {
  const result = html(strings, ...values);
  if (result && typeof result === "object") {
    return Object.assign({}, result, { _$litType$: 2, type: "svg" });
  }
  return result;
});

console.info(
  `%c PASSABLE-HVAC-CARD %c v${CARD_VERSION} IS LOADED `,
  "color: white; background: #0284c7; font-weight: bold; padding: 2px 6px; border-radius: 4px 0 0 4px;",
  "color: #0284c7; background: #e0f2fe; font-weight: bold; padding: 2px 6px; border-radius: 0 4px 4px 0;"
);

class PassableHvacCard extends LitElement {
  static get properties() {
    return {
      hass: {},
      config: {},
      _hvacModal: { state: true },
      _activeHvacTab: { state: true },
      _selectedHvacDayIndex: { state: true },
      _selectedHvacChunkIndex: { state: true },
      _hvacGraphMode: { state: true },
      _hvacTimelineRes: { state: true },
      _hvacHistoryCache: { state: true },
      _expandedSensorUnits: { state: true },
      _expandedModalSections: { state: true },
      _statsModalOpen: { state: true },
      _statsTab: { state: true },
      _statsZone: { state: true },
      _statsHours: { state: true },
      _statsLoading: { state: true },
      _statsError: { state: true },
      _statsCache: { state: true },
      _statsHiddenSensors: { state: true },
      _statsShowOutdoor: { state: true },
      _statsShowSetpoint: { state: true },
      _statsHoverIdx: { state: true },
      _statsRuntimeZone: { state: true },
    };
  }

  constructor() {
    super();
    this._hvacModal = null;
    this._activeHvacTab = "setpoints";
    this._selectedHvacDayIndex = 9;
    this._selectedHvacChunkIndex = null;
    this._hvacGraphMode = "multiday";
    this._hvacTimelineRes = 15;
    this._hvacHistoryCache = {};
    this._analyticsMemo = {};
    this._expandedSensorUnits = {};
    this._expandedModalSections = {};
    this._statsModalOpen = false;
    this._statsTab = "temps";
    this._statsZone = "all";
    this._statsHours = 24;
    this._statsLoading = false;
    this._statsError = null;
    this._statsCache = {};
    this._statsHiddenSensors = {};
    this._statsShowOutdoor = true;
    this._statsShowSetpoint = true;
    this._statsHoverIdx = {};
    this._statsRuntimeZone = null;
    this._lastHvacControlsTab = null;
    this._statsInFlight = new Set();
    this._cardId = `phc-${Math.random().toString(36).substr(2, 9)}`;
    this._scrollLockedElements = null;
    this._scrollGuardOverlay = null;
    this._guardTouchY = 0;
    this._guardTouchX = 0;
    this._touchInScroll = false;
    this._touchDragging = false;
    this._touchLockedHorizontal = false;
    this._onOverlayWheel = this._onOverlayWheel.bind(this);
    this._onOverlayTouchStart = this._onOverlayTouchStart.bind(this);
    this._onOverlayTouchMove = this._onOverlayTouchMove.bind(this);
    this._onKeyDown = (ev) => {
      if (ev.key === "Escape") {
        if (this._statsModalOpen) {
          this._closeStatsModal();
        } else if (this._hvacModal) {
          this._closeHvacModal();
        }
      }
    };
  }

  _getHvacSystems() {
    const c = this.config || {};
    return c.systems || c.hvac_systems || [
      { key: "upstairs", name: "Upstairs", icon: "mdi:home-floor-2", climate: c.upstairs_climate_hk || c.upstairs_climate || "climate.upstairs_hk" },
      { key: "downstairs", name: "Downstairs", icon: "mdi:home-floor-1", climate: c.downstairs_climate_hk || c.downstairs_climate || "climate.downstairs_hk" }
    ];
  }

  _resolveZoneClimate(unitKey, sysConfig = {}) {
    const c = this.config || {};
    const zone = (unitKey || sysConfig.key || "downstairs").toLowerCase();
    const configuredPrimary = sysConfig.climate || c[`${unitKey}_climate_hk`] || c[`${unitKey}_climate`];
    const configuredCompanion = sysConfig.climate_companion || sysConfig.ecobee_climate || c[`${unitKey}_climate_companion`];
    const configuredHk = sysConfig.climate_hk || c[`${unitKey}_climate_hk`];

    let controlId = configuredPrimary;
    let companionId = configuredCompanion || null;

    if (!controlId) {
      controlId = this._hasEntity(`climate.${zone}_hk`) ? `climate.${zone}_hk` : `climate.${zone}`;
    }

    if (!companionId) {
      if (/_hk$/i.test(controlId)) {
        const candidate = controlId.replace(/_hk$/i, "");
        if (candidate !== controlId && this._hasEntity(candidate)) {
          companionId = candidate;
        }
      } else {
        const ecobeeCandidate = c[`${unitKey}_climate`];
        if (ecobeeCandidate && ecobeeCandidate !== controlId && this._hasEntity(ecobeeCandidate)) {
          companionId = ecobeeCandidate;
        } else if (configuredHk && configuredHk !== controlId && this._hasEntity(configuredHk)) {
          // Primary is Ecobee; keep HK reference if available
          companionId = null;
        }
      }
    }

    const controlObj = this._getEntity(controlId);
    const companionObj = companionId ? this._getEntity(companionId) : null;
    const isValid = (obj) => !!(obj && obj.state && obj.state !== "unavailable" && obj.state !== "unknown");

    const controlValid = isValid(controlObj);
    const companionValid = isValid(companionObj);
    const effectiveControlId = controlValid ? controlId : (companionValid ? companionId : controlId);
    const effectiveControlObj = this._getEntity(effectiveControlId);

    const compTemp = companionObj?.attributes?.current_temperature;
    const ctrlTemp = effectiveControlObj?.attributes?.current_temperature;
    const currentTemp = (companionValid && compTemp != null && !isNaN(parseFloat(compTemp)))
      ? parseFloat(compTemp)
      : (ctrlTemp != null && !isNaN(parseFloat(ctrlTemp)) ? parseFloat(ctrlTemp) : null);

    const compHum = companionObj?.attributes?.current_humidity;
    const ctrlHum = effectiveControlObj?.attributes?.current_humidity;
    const currentHumidity = (companionValid && compHum != null && !isNaN(parseFloat(compHum)))
      ? parseFloat(compHum)
      : (ctrlHum != null && !isNaN(parseFloat(ctrlHum)) ? parseFloat(ctrlHum) : null);

    const compPresets = companionObj?.attributes?.preset_modes;
    const ctrlPresets = effectiveControlObj?.attributes?.preset_modes;
    const hasCompPresets = companionValid && Array.isArray(compPresets) && compPresets.length > 0;
    const hasCtrlPresets = Array.isArray(ctrlPresets) && ctrlPresets.length > 0;

    const presetEntityId = hasCompPresets ? companionId : (hasCtrlPresets ? effectiveControlId : (companionId || effectiveControlId));
    const presetSourceObj = this._getEntity(presetEntityId);
    const presetModes = Array.isArray(presetSourceObj?.attributes?.preset_modes) ? presetSourceObj.attributes.preset_modes : [];
    const activePresetMode = presetSourceObj?.attributes?.preset_mode || null;
    const climateModeName = companionObj?.attributes?.climate_mode || activePresetMode;

    return {
      zone,
      controlId: effectiveControlId,
      configuredControlId: controlId,
      companionId,
      controlObj: effectiveControlObj,
      companionObj,
      presetEntityId,
      presetModes,
      activePresetMode,
      climateModeName,
      currentTemp,
      currentHumidity,
      hvacModes: Array.isArray(effectiveControlObj?.attributes?.hvac_modes) && effectiveControlObj.attributes.hvac_modes.length > 0
        ? effectiveControlObj.attributes.hvac_modes
        : (Array.isArray(companionObj?.attributes?.hvac_modes) ? companionObj.attributes.hvac_modes : ["off", "heat", "cool", "heat_cool"]),
      equipmentRunning: companionObj?.attributes?.equipment_running || "",
      fanMinOnTime: companionObj?.attributes?.fan_min_on_time != null ? companionObj.attributes.fan_min_on_time : null,
      activeSensors: Array.isArray(companionObj?.attributes?.active_sensors) ? companionObj.attributes.active_sensors : [],
    };
  }

  _getWatchedEntityIds() {
    const c = this.config || {};
    const ids = new Set([
      c.global_setpoint_preset || "input_select.home_mode",
      c.home_temp_sensor || "sensor.home_average_temperature",
      "sensor.home_average_humidity",
      c.ac_condensers_uncovered || "input_boolean.ac_condensers_uncovered",
      c.outdoor_temp_sensor || "sensor.outside_temperature",
      c.outdoor_weather_entity || "weather.home",
      c.window_recommendation_entity || "sensor.passable_climate_window_recommendation",
      "input_text.hvac_active_profile",
      "input_text.hvac_active_profile_override",
      "input_text.hvac_advisor_prediction_message",
      "input_boolean.hvac_advisor_predicts_heat_needed",
      c.hvac_transition_offset_entity || "input_number.hvac_transition_offset",
      "sensor.advisor_simulation_data",
      "sensor.passable_climate_14d_comfort_compliance",
      "sensor.passable_climate_model_accuracy",
      "sensor.outdoor_specific_enthalpy",
      "sensor.outside_absolute_humidity",
      "sensor.total_hvac_power",
      "sensor.span_panel_air_handler_attic_power",
      "sensor.span_panel_ac_condenser_power",
      "sensor.span_panel_air_handler_basement_power",
      "sensor.span_panel_ac_condenser_2_power",
      "number.passable_climate_comfort_temp_min",
      "number.passable_climate_comfort_temp_max",
      "number.passable_climate_comfort_humidity_min",
      "number.passable_climate_comfort_humidity_max",
      "number.passable_climate_comfort_dew_point_max",
      "button.passable_climate_refresh_window_recommendation",
      "button.passable_climate_retrain_thermal_models",
    ]);

    const systems = this._getHvacSystems();
    systems.forEach((sys) => {
      const unitKey = sys.key || "downstairs";
      const zone = unitKey.toLowerCase();
      const baseClimate = sys.climate || c[`${unitKey}_climate_hk`] || c[`${unitKey}_climate`] || `climate.${zone}_hk`;
      ids.add(baseClimate);
      ids.add(baseClimate.replace(/_hk$/i, ""));
      if (sys.climate_companion) ids.add(sys.climate_companion);
      if (sys.climate_hk) ids.add(sys.climate_hk);
      if (sys.setpoint_preset) ids.add(sys.setpoint_preset);
      if (c[`${unitKey}_climate`]) ids.add(c[`${unitKey}_climate`]);
      if (c[`${unitKey}_climate_hk`]) ids.add(c[`${unitKey}_climate_hk`]);
      if (c[`${unitKey}_setpoint_preset`]) ids.add(c[`${unitKey}_setpoint_preset`]);
      if (c[`${unitKey}_overshoot_active`]) ids.add(c[`${unitKey}_overshoot_active`]);
      if (c[`${unitKey}_filter_hours`]) ids.add(c[`${unitKey}_filter_hours`]);
      if (c[`${unitKey}_filter_life`]) ids.add(c[`${unitKey}_filter_life`]);
      if (c[`${unitKey}_heating_today_sensor`]) ids.add(c[`${unitKey}_heating_today_sensor`]);
      if (c[`${unitKey}_cooling_today_sensor`]) ids.add(c[`${unitKey}_cooling_today_sensor`]);

      [
        `sensor.hvac_${zone}_heating_today`,
        `sensor.hvac_${zone}_cooling_today`,
        `sensor.hvac_${zone}_fan_today`,
        `sensor.hvac_${zone}_heating_daily`,
        `sensor.hvac_${zone}_cooling_daily`,
        `sensor.hvac_${zone}_cycles_per_hour`,
        `sensor.hvac_${zone}_filter_runtime`,
        `sensor.hvac_filter_life_remaining_${zone}`,
        `number.hvac_filter_life_${zone}`,
        `button.reset_hvac_filter_${zone}`,
        `input_boolean.hvac_overshoot_active_${zone}`,
        `input_boolean.hvac_fan_circulation_active_${zone}`,
        `input_boolean.hvac_${zone}_coasting`,
        `input_number.hvac_fan_circulation_${zone}`,
        `sensor.${zone}_heat_loss_rate`,
        `sensor.${zone}_cool_loss_rate`,
        `sensor.${zone}_enthalpy_delta`,
        `sensor.${zone}_absolute_humidity`,
        `binary_sensor.${zone}_windows_open`,
        `sensor.${zone}_window_open_count`,
        `sensor.hvac_time_to_temp_${zone}`,
        `sensor.hvac_health_status_${zone}`,
      ].forEach((id) => ids.add(id));

      if (Array.isArray(sys.sensors)) {
        sys.sensors.forEach((s) => {
          const eid = typeof s === "string" ? s : s?.entity;
          if (eid) ids.add(eid);
        });
      }
      if (Array.isArray(sys.span_power_entities)) {
        sys.span_power_entities.forEach((eid) => eid && ids.add(eid));
      }
      if (Array.isArray(sys.window_entities)) {
        sys.window_entities.forEach((eid) => eid && ids.add(eid));
      }
    });

    if (this.hass && this.hass.states) {
      const roomDefaults = [
        "sensor.master_bedroom_temperature",
        "sensor.maggies_room_temperature",
        "sensor.maxs_room_temperature",
        "sensor.upstairs_temperature",
        "sensor.madeleines_room_temperature",
        "sensor.office_temperature",
        "sensor.living_room_temperature",
        "sensor.downstairs_temperature",
        "sensor.kitchen_temperature",
        "sensor.bathroom_temperature",
        "sensor.playroom_temperature",
        "sensor.basement_temperature",
      ];
      roomDefaults.forEach((id) => ids.add(id));

      Object.keys(this.hass.states).forEach((entId) => {
        if (
          entId.includes("_heat_loss_gain_windows_") ||
          entId.includes("hvac_overshoot_") ||
          entId.startsWith("input_number.hvac_") && (entId.includes("_day_") || entId.includes("_sleep_") || entId.includes("_away_") || entId.includes("_eco_"))
        ) {
          ids.add(entId);
        }
      });
    }

    return Array.from(ids);
  }

  shouldUpdate(changedProps) {
    if (!changedProps.has("hass")) return true;
    for (const key of changedProps.keys()) {
      if (key !== "hass") return true;
    }
    const oldHass = changedProps.get("hass");
    const newHass = this.hass;
    if (!oldHass || !newHass || !oldHass.states || !newHass.states) return true;
    if (!this.config) return true;

    const watched = this._getWatchedEntityIds();
    for (let i = 0; i < watched.length; i++) {
      const id = watched[i];
      if (oldHass.states[id] !== newHass.states[id]) {
        return true;
      }
    }
    return false;
  }

  setConfig(config) {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    const c = { ...config };

    const p = c.device_prefix || "hvac";
    c.downstairs_climate = c.downstairs_climate || (c.device_prefix ? `climate.${p}_downstairs` : "climate.downstairs");
    c.downstairs_climate_hk = c.downstairs_climate_hk || (c.device_prefix ? `climate.${p}_downstairs_hk` : "climate.downstairs_hk");
    c.downstairs_setpoint_preset = c.downstairs_setpoint_preset || (c.device_prefix ? `input_text.${p}_active_profile` : "input_text.hvac_active_profile");
    c.downstairs_overshoot_active = c.downstairs_overshoot_active || "input_boolean.hvac_overshoot_active_downstairs";
    c.downstairs_cool_overshoot = c.downstairs_cool_overshoot || "input_number.hvac_overshoot_amount_cool";
    c.downstairs_heat_overshoot = c.downstairs_heat_overshoot || "input_number.hvac_overshoot_amount_heat";
    c.downstairs_cool_overshoot_thresh = c.downstairs_cool_overshoot_thresh || "input_number.hvac_overshoot_threshold_cool";
    c.downstairs_heat_overshoot_thresh = c.downstairs_heat_overshoot_thresh || "input_number.hvac_overshoot_threshold_heat";
    c.downstairs_filter_hours = c.downstairs_filter_hours || "sensor.hvac_filter_life_remaining_downstairs";
    c.downstairs_filter_life = c.downstairs_filter_life || "number.hvac_filter_life_downstairs";

    c.upstairs_climate = c.upstairs_climate || (c.device_prefix ? `climate.${p}_upstairs` : "climate.upstairs");
    c.upstairs_climate_hk = c.upstairs_climate_hk || (c.device_prefix ? `climate.${p}_upstairs_hk` : "climate.upstairs_hk");
    c.upstairs_setpoint_preset = c.upstairs_setpoint_preset || (c.device_prefix ? `input_text.${p}_active_profile` : "input_text.hvac_active_profile");
    c.upstairs_overshoot_active = c.upstairs_overshoot_active || "input_boolean.hvac_overshoot_active_upstairs";
    c.upstairs_cool_overshoot = c.upstairs_cool_overshoot || "input_number.hvac_overshoot_amount_cool";
    c.upstairs_heat_overshoot = c.upstairs_heat_overshoot || "input_number.hvac_overshoot_amount_heat";
    c.upstairs_cool_overshoot_thresh = c.upstairs_cool_overshoot_thresh || "input_number.hvac_overshoot_threshold_cool";
    c.upstairs_heat_overshoot_thresh = c.upstairs_heat_overshoot_thresh || "input_number.hvac_overshoot_threshold_heat";
    c.upstairs_filter_hours = c.upstairs_filter_hours || "sensor.hvac_filter_life_remaining_upstairs";
    c.upstairs_filter_life = c.upstairs_filter_life || "number.hvac_filter_life_upstairs";

    c.global_setpoint_preset = c.global_setpoint_preset || "input_select.home_mode";

    this.config = c;
  }

  static getConfigElement() {
    return document.createElement("passable-hvac-card-editor");
  }

  getCardSize() {
    const systems = this.config.systems || this.config.hvac_systems || [1, 2];
    return Math.max(3, systems.length * 2);
  }

  _fireHaptic(type = "light") {
    const event = new Event("haptic", { bubbles: true, composed: true });
    event.detail = type;
    this.dispatchEvent(event);
  }

  _hasEntity(entityId) {
    return !!(this.hass && entityId && this.hass.states && this.hass.states[entityId]);
  }

  _getEntity(entityId) {
    if (!this.hass || !entityId) {
      return { state: "unavailable", attributes: {} };
    }
    const state = this.hass.states[entityId];
    if (!state) {
      return { state: "unavailable", attributes: {} };
    }
    return state;
  }

  _showMoreInfo(entityId) {
    if (!entityId) return;
    this._fireHaptic("light");
    const event = new Event("hass-more-info", {
      bubbles: true,
      composed: true,
    });
    event.detail = { entityId: entityId };
    this.dispatchEvent(event);
  }

  _toggleEntity(entity_id) {
    if (!entity_id) return;
    this._fireHaptic("light");
    this.hass.callService("homeassistant", "toggle", { entity_id });
  }

  _setNumberEntity(entityId, value) {
    if (!entityId) return;
    const domain = entityId.split(".")[0];
    if (domain === "input_number") {
      this.hass.callService("input_number", "set_value", { entity_id: entityId, value });
    } else if (domain === "number") {
      this.hass.callService("number", "set_value", { entity_id: entityId, value });
    } else {
      this.hass.callService("input_number", "set_value", { entity_id: entityId, value }).catch(() => {
        this.hass.callService("sensor", "set_value", { entity_id: entityId, value });
      });
    }
  }

  _adjustNumberEntity(entityId, delta) {
    this._fireHaptic("light");
    const numObj = this._getEntity(entityId);
    const curVal = parseFloat(numObj.state) || 0;
    const attrMin = parseFloat(numObj?.attributes?.min);
    const attrMax = parseFloat(numObj?.attributes?.max);
    const minVal = !isNaN(attrMin) ? attrMin : 0;
    const maxVal = !isNaN(attrMax) ? attrMax : null;
    let newVal = Math.round((curVal + delta) * 10) / 10;
    newVal = Math.max(minVal, newVal);
    if (maxVal !== null) newVal = Math.min(maxVal, newVal);
    this._setNumberEntity(entityId, newVal);
  }

  _setHvacMode(climateEntity, mode, companionId = null) {
    this._fireHaptic("medium");
    const targetObj = this._getEntity(climateEntity);
    const fallbackObj = companionId ? this._getEntity(companionId) : null;
    const useFallback = (!targetObj || targetObj.state === "unavailable" || targetObj.state === "unknown") && fallbackObj && fallbackObj.state !== "unavailable";
    const activeId = useFallback ? companionId : climateEntity;
    const activeObj = useFallback ? fallbackObj : targetObj;
    const supported = Array.isArray(activeObj?.attributes?.hvac_modes) ? activeObj.attributes.hvac_modes : [];

    let mappedMode = mode;
    if (supported.length > 0 && !supported.includes(mode)) {
      if (mode === "auto" && supported.includes("heat_cool")) mappedMode = "heat_cool";
      else if (mode === "heat_cool" && supported.includes("auto")) mappedMode = "auto";
    }

    this.hass.callService("climate", "set_hvac_mode", {
      entity_id: activeId,
      hvac_mode: mappedMode,
    });
  }

  _setHvacPresetMode(climateEntity, presetMode) {
    this._fireHaptic("medium");
    let targetId = climateEntity;
    const primaryObj = this._getEntity(climateEntity);
    const hasPrimaryPresets = Array.isArray(primaryObj?.attributes?.preset_modes) && primaryObj.attributes.preset_modes.length > 0;
    if (!hasPrimaryPresets && climateEntity && /_hk$/i.test(climateEntity)) {
      const companionCandidate = climateEntity.replace(/_hk$/i, "");
      if (this._hasEntity(companionCandidate)) {
        targetId = companionCandidate;
      }
    }
    this.hass.callService("climate", "set_preset_mode", {
      entity_id: targetId,
      preset_mode: presetMode,
    });
  }

  _getHvacTempStep(climate) {
    const stepAttr = parseFloat(climate?.attributes?.target_temp_step);
    if (!isNaN(stepAttr) && stepAttr > 0) return stepAttr;
    const unit = climate?.attributes?.temperature_unit || this.hass?.config?.unit_system?.temperature;
    return unit === "°C" ? 0.5 : 1;
  }

  _adjustHvacTemp(climateEntity, delta, rangeBound = null) {
    this._fireHaptic("light");
    const climate = this._getEntity(climateEntity);
    const minTemp = parseFloat(climate?.attributes?.min_temp);
    const maxTemp = parseFloat(climate?.attributes?.max_temp);
    const clamp = (val) => {
      let v = Math.round(val * 10) / 10;
      if (!isNaN(minTemp)) v = Math.max(minTemp, v);
      if (!isNaN(maxTemp)) v = Math.min(maxTemp, v);
      return v;
    };

    const low = parseFloat(climate?.attributes?.target_temp_low);
    const high = parseFloat(climate?.attributes?.target_temp_high);
    if ((climate?.state === "heat_cool" || climate?.state === "auto") && !isNaN(low) && !isNaN(high)) {
      if (rangeBound === "low") {
        const nextLow = Math.min(high - 1, clamp(low + delta));
        this.hass.callService("climate", "set_temperature", {
          entity_id: climateEntity,
          target_temp_low: nextLow,
          target_temp_high: high,
        });
        return;
      }
      if (rangeBound === "high") {
        const nextHigh = Math.max(low + 1, clamp(high + delta));
        this.hass.callService("climate", "set_temperature", {
          entity_id: climateEntity,
          target_temp_low: low,
          target_temp_high: nextHigh,
        });
        return;
      }
      const nextLow = clamp(low + delta);
      const nextHigh = clamp(high + delta);
      this.hass.callService("climate", "set_temperature", {
        entity_id: climateEntity,
        target_temp_low: nextLow,
        target_temp_high: nextHigh,
      });
      return;
    }

    const curTarget = parseFloat(climate?.attributes?.temperature);
    const baseTarget = !isNaN(curTarget) ? curTarget : 70;
    const newTarget = clamp(baseTarget + delta);
    this.hass.callService("climate", "set_temperature", {
      entity_id: climateEntity,
      temperature: newTarget,
    });
  }

  _adjustFanMinOnTime(companionEntity, deltaMinutes, fallbackNumberId = null) {
    this._fireHaptic("light");
    const compObj = companionEntity ? this._getEntity(companionEntity) : null;
    if (companionEntity && compObj && compObj.attributes && compObj.attributes.fan_min_on_time != null && this.hass?.services?.ecobee?.set_fan_min_on_time) {
      const cur = parseFloat(compObj.attributes.fan_min_on_time) || 0;
      const next = Math.max(0, Math.min(55, Math.round(cur + deltaMinutes)));
      this.hass.callService("ecobee", "set_fan_min_on_time", {
        entity_id: companionEntity,
        fan_min_on_time: next,
      });
      return;
    }
    if (fallbackNumberId && this._hasEntity(fallbackNumberId)) {
      this._adjustNumberEntity(fallbackNumberId, deltaMinutes);
    }
  }

  _pressButtonEntity(entityId) {
    if (!entityId || !this._hasEntity(entityId)) return;
    this._fireHaptic("medium");
    this.hass.callService("button", "press", { entity_id: entityId });
  }

  _adjustFilterLifeAndHours(filterHoursId, filterLifeId, delta) {
    this._fireHaptic("light");
    const filterLife = this._getEntity(filterLifeId);
    const filterHours = this._getEntity(filterHoursId);
    const rawLife = (filterLife && filterLife.state !== "unavailable" && filterLife.state !== "unknown")
      ? parseFloat(filterLife.state)
      : NaN;
    const fallbackCap = (filterHours && filterHours.attributes && filterHours.attributes.capacity_hours !== undefined)
      ? parseFloat(filterHours.attributes.capacity_hours)
      : 300;
    let val = !isNaN(rawLife) ? rawLife : (!isNaN(fallbackCap) ? fallbackCap : 300);
    val = Math.max(50, Math.round(val + delta));
    this._setNumberEntity(filterLifeId, val);

    if (filterHoursId && (filterHoursId.startsWith("input_number.") || filterHoursId.startsWith("number."))) {
      this._setNumberEntity(filterHoursId, val);
    }
  }

  _resetHvacFilter(unitKey, filterHoursId, filterLifeId) {
    this._fireHaptic("heavy");
    const zone = (unitKey || "downstairs").toLowerCase();
    if (this.hass && this.hass.services && this.hass.services.passable_climate && this.hass.services.passable_climate.reset_filter) {
      this.hass.callService("passable_climate", "reset_filter", { zone });
      return;
    }
    const resetBtnId = `button.reset_hvac_filter_${zone}`;
    if (this.hass && this.hass.states && this.hass.states[resetBtnId]) {
      this.hass.callService("button", "press", { entity_id: resetBtnId });
      return;
    }
    const scriptId = `script.reset_hvac_filter_${zone}`;
    if (this.hass && this.hass.states && this.hass.states[scriptId]) {
      this.hass.callService("script", "turn_on", { entity_id: scriptId });
      return;
    }
    const meterId = `sensor.hvac_${zone}_filter_runtime`;
    if (this.hass && this.hass.states && this.hass.states[meterId] && this.hass.services?.utility_meter?.reset) {
      this.hass.callService("utility_meter", "reset", { entity_id: meterId });
      return;
    }
    if (filterHoursId && (filterHoursId.startsWith("input_number.") || filterHoursId.startsWith("number."))) {
      const filterLife = this._getEntity(filterLifeId);
      const maxVal = parseFloat(filterLife.state) || 300;
      this._setNumberEntity(filterHoursId, maxVal);
    }
  }

  _getPresetIcon(presetName) {
    const p = (presetName || "").toLowerCase();
    if (p.includes("day") || p.includes("home")) return "mdi:weather-sunny";
    if (p.includes("sleep") || p.includes("night")) return "mdi:weather-night";
    if (p.includes("away") || p.includes("vacation")) return "mdi:home-export-outline";
    if (p.includes("eco")) return "mdi:leaf";
    return "mdi:clock-outline";
  }

  _getPresetColor(presetName) {
    const p = (presetName || "").toLowerCase();
    if (p.includes("day") || p.includes("home")) return "#facc15";
    if (p.includes("sleep") || p.includes("night")) return "#a855f7";
    if (p.includes("away") || p.includes("vacation")) return "#3b82f6";
    if (p.includes("eco")) return "#22c55e";
    return "var(--primary-color)";
  }

  _ensureHistoryFetched(unitKey, sysConfig = null) {
    if (!this.hass || !unitKey) return;
    const c = this.config || {};
    const systems = this._getHvacSystems();
    const sys = sysConfig || systems.find((s) => s.key === unitKey) || { key: unitKey, name: unitKey };
    const zoneClimate = this._resolveZoneClimate(unitKey, sys);
    const zone = zoneClimate.zone;
    const climateId = zoneClimate.controlId;
    const resolveEntity = (primaryId, fallbacks) => {
      if (primaryId && this.hass && this.hass.states[primaryId]) return primaryId;
      for (const fb of fallbacks) {
        if (this.hass && this.hass.states[fb]) return fb;
      }
      return primaryId;
    };
    const outdoorTempId =
      resolveEntity(
        sys.outdoor_temp || c.outdoor_temp_sensor || c.outdoor_temp,
        ["sensor.outside_temperature", "sensor.outdoor_temperature", "weather.home", "weather.downstairs", "weather.upstairs"]
      ) || "sensor.outside_temperature";
    const coolDailySensorId = sys.cool_daily || c[`${unitKey}_cool_daily`] || c[`${unitKey}_cooling_daily_sensor`] || `sensor.hvac_${zone}_cooling_daily`;
    const heatDailySensorId = sys.heat_daily || c[`${unitKey}_heat_daily`] || c[`${unitKey}_heating_daily_sensor`] || `sensor.hvac_${zone}_heating_daily`;
    const coolTodaySensorId = sys.cool_today || c[`${unitKey}_cool_today`] || c[`${unitKey}_cooling_today_sensor`] || `sensor.hvac_${zone}_cooling_today`;
    const heatTodaySensorId = sys.heat_today || c[`${unitKey}_heat_today`] || c[`${unitKey}_heating_today_sensor`] || `sensor.hvac_${zone}_heating_today`;
    this._fetchHvacHistoryData(unitKey, climateId, outdoorTempId, coolDailySensorId, heatDailySensorId, coolTodaySensorId, heatTodaySensorId);
  }

  _executeActionConfig(actionConfig, fallbackEntityId = null) {
    if (!actionConfig || !this.hass) return;
    const action = actionConfig.action;
    if (action === "none") return;
    this._fireHaptic("light");

    if (action === "fire-dom-event") {
      const event = new Event("ll-custom", { bubbles: true, composed: true, cancelable: false });
      event.detail = actionConfig;
      this.dispatchEvent(event);
    } else if (action === "call-service" || action === "perform-action") {
      const serviceString = actionConfig.perform_action || actionConfig.service || "";
      if (serviceString.includes(".")) {
        const [domain, service] = serviceString.split(".", 2);
        const serviceData = {
          ...(actionConfig.data || {}),
          ...(actionConfig.target || {}),
        };
        if (fallbackEntityId && !serviceData.entity_id && !actionConfig.target) {
          serviceData.entity_id = fallbackEntityId;
        }
        this.hass.callService(domain, service, serviceData);
      }
    } else if (action === "navigate" && actionConfig.navigation_path) {
      window.history.pushState(null, "", actionConfig.navigation_path);
      window.dispatchEvent(new Event("location-changed", { bubbles: true, composed: true }));
    } else if (action === "url" && actionConfig.url_path) {
      window.open(actionConfig.url_path, "_blank");
    } else if (action === "toggle") {
      const target = actionConfig.entity || fallbackEntityId;
      if (target) this._toggleEntity(target);
    } else if (action === "more-info") {
      this._showMoreInfo(actionConfig.entity || fallbackEntityId);
    }
  }

  _handleStatsButtonClick(systems = null, initialZone = "all", initialTab = "temps") {
    if (this.config?.stats_tap_action?.action) {
      this._executeActionConfig(this.config.stats_tap_action);
      return;
    }
    this._openStatsModal(systems || this._getHvacSystems(), initialZone, initialTab);
  }

  _showHvacModal(unitKey, type) {
    if (type === "stats") {
      this._openStatsModal(this._getHvacSystems(), unitKey || "all", "runtime");
      return;
    }
    this._fireHaptic("light");
    clearTimeout(this._closeModalTimer);
    clearTimeout(this._swipeResetTimer);
    if (this._statsModalOpen) {
      this._statsModalOpen = false;
      this._statsHoverIdx = {};
    }
    this._activeHvacTab = type || "setpoints";
    this._hvacModal = { unitKey, type: this._activeHvacTab };
    this._lockBackgroundScroll();
    if (this._activeHvacTab === "advisor") {
      this._ensureHistoryFetched(unitKey);
    }
    this.requestUpdate();
  }

  _switchHvacTab(tabName) {
    if (tabName === "stats") {
      const curUnit = this._hvacModal?.unitKey || "all";
      this._openStatsModal(this._getHvacSystems(), curUnit, "runtime");
      return;
    }
    this._fireHaptic("light");
    this._activeHvacTab = tabName;
    if (this._hvacModal) {
      this._hvacModal.type = tabName;
      if (tabName === "advisor") {
        this._ensureHistoryFetched(this._hvacModal.unitKey);
      }
    }
    this.requestUpdate();
  }

  _switchHvacSystem(unitKey, sysConfig = null) {
    if (!this._hvacModal || !unitKey || this._hvacModal.unitKey === unitKey) return;
    this._fireHaptic("light");
    const activeTab = this._activeHvacTab || this._hvacModal.type || "setpoints";
    this._hvacModal = { unitKey, type: activeTab };
    this._selectedHvacChunkIndex = null;
    if (activeTab === "advisor") {
      this._ensureHistoryFetched(unitKey, sysConfig);
    }
    this.requestUpdate();
  }

  _openStatsModal(systems = null, initialZone = "all", initialTab = "temps") {
    this._fireHaptic("light");
    clearTimeout(this._closeModalTimer);
    clearTimeout(this._swipeResetTimer);
    const modalSystems = Array.isArray(systems) && systems.length > 0 ? systems : this._getHvacSystems();
    if (this._hvacModal) {
      this._lastHvacControlsTab = this._activeHvacTab || this._hvacModal.type || "setpoints";
      this._hvacModal = null;
      this._activeHvacTab = null;
    } else {
      this._lastHvacControlsTab = null;
    }
    const resolvedZone = initialZone || "all";
    this._statsZone = resolvedZone;
    this._statsTab = ["temps", "balance", "runtime"].includes(initialTab) ? initialTab : "temps";
    this._statsHoverIdx = {};
    if (resolvedZone !== "all") {
      this._statsRuntimeZone = resolvedZone;
    } else if (!this._statsRuntimeZone || !modalSystems.some((s) => s.key === this._statsRuntimeZone)) {
      this._statsRuntimeZone = modalSystems[0]?.key || "upstairs";
    }
    this._statsModalOpen = true;
    this._lockBackgroundScroll();
    this._fetchClimateStats(this._statsHours, false);
    const runtimeSys = modalSystems.find((s) => s.key === this._statsRuntimeZone) || modalSystems[0];
    if (runtimeSys) {
      this._ensureHistoryFetched(runtimeSys.key, runtimeSys);
    }
    this.requestUpdate();
  }

  _closeStatsModal() {
    this._fireHaptic("light");
    clearTimeout(this._swipeResetTimer);
    const overlay = this.shadowRoot?.querySelector(".popup-overlay");
    const content = this.shadowRoot?.querySelector(".popup-content");
    if (overlay) overlay.classList.add("closing");
    if (content) {
      content.classList.add("closing");
      content.style.transform = "";
    }

    clearTimeout(this._closeModalTimer);
    this._closeModalTimer = setTimeout(() => {
      this._statsModalOpen = false;
      this._lastHvacControlsTab = null;
      this._statsHoverIdx = {};
      this._detachOverlayScrollGuard();
      this._unlockBackgroundScroll();
      this.requestUpdate();
    }, 180);
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("keydown", this._onKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("keydown", this._onKeyDown);
    this._detachOverlayScrollGuard();
    this._unlockBackgroundScroll();
    clearTimeout(this._closeModalTimer);
    clearTimeout(this._swipeResetTimer);
  }

  updated(changedProps) {
    super.updated(changedProps);
    if (this._hvacModal || this._statsModalOpen) {
      this._attachOverlayScrollGuard();
    } else {
      this._detachOverlayScrollGuard();
    }
  }

  _closeHvacModal() {
    this._fireHaptic("light");
    clearTimeout(this._swipeResetTimer);
    const overlay = this.shadowRoot?.querySelector(".popup-overlay");
    const content = this.shadowRoot?.querySelector(".popup-content");
    if (overlay) overlay.classList.add("closing");
    if (content) {
      content.classList.add("closing");
      content.style.transform = "";
      content.classList.remove("visible");
    }

    clearTimeout(this._closeModalTimer);
    this._closeModalTimer = setTimeout(() => {
      this._activeHvacTab = null;
      this._hvacModal = null;
      this._lastHvacControlsTab = null;
      this._detachOverlayScrollGuard();
      this._unlockBackgroundScroll();
      this.requestUpdate();
    }, 180);
  }

  _lockBackgroundScroll() {
    if (this._scrollLockedElements) return;
    const lockMap = (window.__passableScrollLocks = window.__passableScrollLocks || new Map());
    const targets = new Set();
    if (document.documentElement) targets.add(document.documentElement);
    if (document.body) targets.add(document.body);
    if (document.scrollingElement) targets.add(document.scrollingElement);

    let node = this.parentNode;
    while (node) {
      if (node.nodeType === 1) {
        const oy = window.getComputedStyle(node).overflowY;
        if (oy === "auto" || oy === "scroll" || oy === "overlay" || node.id === "view") {
          targets.add(node);
        }
      }
      node = node.parentNode || node.host || null;
    }

    const locked = [];
    targets.forEach((el) => {
      let entry = lockMap.get(el);
      if (!entry) {
        entry = {
          count: 0,
          overflow: el.style.overflow,
          overflowY: el.style.overflowY,
          overscrollBehavior: el.style.overscrollBehavior,
        };
        lockMap.set(el, entry);
      }
      if (entry.count === 0) {
        el.style.overflowY = "hidden";
        el.style.overscrollBehavior = "none";
      }
      entry.count += 1;
      locked.push(el);
    });
    this._scrollLockedElements = locked;
  }

  _unlockBackgroundScroll() {
    if (!this._scrollLockedElements) return;
    const lockMap = window.__passableScrollLocks;
    this._scrollLockedElements.forEach((el) => {
      const entry = lockMap && lockMap.get(el);
      if (!entry) return;
      entry.count -= 1;
      if (entry.count <= 0) {
        el.style.overflow = entry.overflow;
        el.style.overflowY = entry.overflowY;
        el.style.overscrollBehavior = entry.overscrollBehavior;
        lockMap.delete(el);
      }
    });
    this._scrollLockedElements = null;
  }

  _attachOverlayScrollGuard() {
    const overlay = this.shadowRoot?.querySelector(".popup-overlay");
    if (overlay === this._scrollGuardOverlay) return;
    this._detachOverlayScrollGuard();
    if (!overlay) return;
    overlay.addEventListener("wheel", this._onOverlayWheel, { passive: false });
    overlay.addEventListener("touchstart", this._onOverlayTouchStart, { passive: true });
    overlay.addEventListener("touchmove", this._onOverlayTouchMove, { passive: false });
    this._scrollGuardOverlay = overlay;
  }

  _detachOverlayScrollGuard() {
    if (!this._scrollGuardOverlay) return;
    this._scrollGuardOverlay.removeEventListener("wheel", this._onOverlayWheel);
    this._scrollGuardOverlay.removeEventListener("touchstart", this._onOverlayTouchStart);
    this._scrollGuardOverlay.removeEventListener("touchmove", this._onOverlayTouchMove);
    this._scrollGuardOverlay = null;
  }

  _findModalScrollContainer(ev, overlay) {
    const path = typeof ev.composedPath === "function" ? ev.composedPath() : [];
    const contentEl = overlay ? overlay.querySelector(".popup-content") : null;
    if (!contentEl || !path.includes(contentEl)) return null;
    for (const el of path) {
      if (el === overlay) break;
      if (!el || el.nodeType !== 1 || !contentEl.contains(el)) continue;
      const oy = window.getComputedStyle(el).overflowY;
      if ((oy === "auto" || oy === "scroll" || oy === "overlay") && el.scrollHeight > el.clientHeight + 1) {
        return el;
      }
    }
    return null;
  }

  _isInteractiveDragTarget(ev) {
    const path = typeof ev.composedPath === "function" ? ev.composedPath() : [];
    return path.some((el) => {
      if (!el || el.nodeType !== 1) return false;
      if (el.tagName === "HA-SLIDER" || el.tagName === "SELECT") return true;
      if (el.tagName === "INPUT" && el.type === "range") return true;
      if (el.getAttribute && el.getAttribute("data-graph-drag") === "true") return true;
      if (el.classList && el.classList.contains("stats-chart-interactive")) return true;
      if (el.closest && el.closest(".stats-chart-interactive")) return true;
      if (el.tagName && el.tagName.toLowerCase() === "svg" && el.closest && el.closest(".chart-analytics-card")) {
        return true;
      }
      return false;
    });
  }

  _onOverlayWheel(ev) {
    const overlay = this._scrollGuardOverlay;
    const scroller = this._findModalScrollContainer(ev, overlay);
    if (!scroller) {
      if (ev.cancelable) ev.preventDefault();
      return;
    }
    if (Math.abs(ev.deltaX) > Math.abs(ev.deltaY) && scroller.scrollWidth > scroller.clientWidth + 1) {
      return;
    }
    const atTop = scroller.scrollTop <= 0;
    const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
    if ((ev.deltaY < 0 && atTop) || (ev.deltaY > 0 && atBottom)) {
      if (ev.cancelable) ev.preventDefault();
    }
  }

  _onOverlayTouchStart(ev) {
    if (ev.touches && ev.touches.length === 1) {
      this._guardTouchY = ev.touches[0].clientY;
      this._guardTouchX = ev.touches[0].clientX;
    }
  }

  _onOverlayTouchMove(ev) {
    if (!ev.touches || ev.touches.length !== 1 || this._isInteractiveDragTarget(ev)) return;
    const curY = ev.touches[0].clientY;
    const curX = ev.touches[0].clientX;
    const dy = curY - this._guardTouchY;
    const dx = curX - this._guardTouchX;
    this._guardTouchY = curY;
    this._guardTouchX = curX;

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 4) return;

    const overlay = this._scrollGuardOverlay;
    const scroller = this._findModalScrollContainer(ev, overlay);
    if (!scroller) {
      if (ev.cancelable) ev.preventDefault();
      return;
    }
    const atTop = scroller.scrollTop <= 0;
    const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
    if ((dy > 0 && atTop) || (dy < 0 && atBottom)) {
      if (ev.cancelable) ev.preventDefault();
    }
  }

  _selectHvacHistoryDay(idx) {
    this._fireHaptic("light");
    this._selectedHvacDayIndex = idx;
    this.requestUpdate();
  }

  _selectTimelineChunk(idx) {
    this._fireHaptic("light");
    this._selectedHvacChunkIndex = idx;
    this.requestUpdate();
  }

  _handleGraphClick(e, timelineData) {
    if (!timelineData || timelineData.length === 0) return;
    const svgEl = e.currentTarget;
    const rect = svgEl.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const svgWidth = rect.width;
    const normalizedX = (clickX / svgWidth) * 340;

    let closestIdx = 0;
    let minDiff = Infinity;
    timelineData.forEach((pt, i) => {
      const diff = Math.abs(pt.cx - normalizedX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    });

    this._selectTimelineChunk(closestIdx);
  }

  _handleGraphDrag(e, timelineData) {
    if (e.buttons === 1) {
      this._handleGraphClick(e, timelineData);
    }
  }

  _handleGraphTouchDrag(e, timelineData) {
    if (e.touches && e.touches.length > 0) {
      const touch = e.touches[0];
      const svgEl = e.currentTarget;
      const rect = svgEl.getBoundingClientRect();
      const clickX = touch.clientX - rect.left;
      const svgWidth = rect.width;
      const normalizedX = (clickX / svgWidth) * 340;

      let closestIdx = 0;
      let minDiff = Infinity;
      timelineData.forEach((pt, i) => {
        const diff = Math.abs(pt.cx - normalizedX);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = i;
        }
      });

      this._selectTimelineChunk(closestIdx);
    }
  }

  _handleTouchStart(e) {
    if (!e.touches || e.touches.length !== 1) return;
    if (this._isInteractiveDragTarget(e)) return;
    const popupContent = e.currentTarget;
    const scrollArea = popupContent.querySelector(".modal-scroll-area");
    const inScroll = Boolean(scrollArea && e.target && scrollArea.contains(e.target));
    if ((inScroll && scrollArea.scrollTop > 0) || popupContent.scrollTop > 0) return;

    clearTimeout(this._swipeResetTimer);
    this._startY = e.touches[0].clientY;
    this._startX = e.touches[0].clientX;
    this._currentY = this._startY;
    this._touchTarget = popupContent;
    this._touchInScroll = inScroll;
    this._touchDragging = false;
    this._touchLockedHorizontal = false;
  }

  _handleTouchMove(e) {
    if (this._startY === undefined || !this._touchTarget || this._touchLockedHorizontal) return;
    if (!e.touches || e.touches.length !== 1) return;
    const popupContent = this._touchTarget;
    const currentY = e.touches[0].clientY;
    const currentX = e.touches[0].clientX;
    const deltaY = currentY - this._startY;
    const deltaX = currentX - (this._startX ?? currentX);

    if (!this._touchDragging) {
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 8) {
        this._touchLockedHorizontal = true;
        return;
      }
      if (this._touchInScroll) {
        const scrollArea = popupContent.querySelector(".modal-scroll-area");
        if (scrollArea && scrollArea.scrollTop > 0) {
          this._startY = undefined;
          this._touchTarget = null;
          return;
        }
      }
      if (popupContent.scrollTop > 0) {
        this._startY = undefined;
        this._touchTarget = null;
        return;
      }
      if (deltaY > 6) {
        this._touchDragging = true;
        clearTimeout(this._swipeResetTimer);
        popupContent.style.animation = "none";
        popupContent.style.transition = "none";
      } else {
        return;
      }
    }

    if (deltaY > 0 && popupContent.scrollTop <= 0) {
      if (e.cancelable) e.preventDefault();
      this._currentY = currentY;
      popupContent.style.transform = `translateY(${deltaY}px)`;
      const overlay = this.shadowRoot?.querySelector(".popup-overlay");
      if (overlay) {
        overlay.style.animation = "none";
        overlay.style.opacity = String(Math.max(0.2, 1 - deltaY / 360));
      }
    } else {
      this._currentY = this._startY;
      popupContent.style.transform = "translateY(0px)";
    }
  }

  _handleTouchEnd() {
    if (this._startY === undefined || !this._touchTarget) return;
    const popupContent = this._touchTarget;
    const overlay = this.shadowRoot?.querySelector(".popup-overlay");
    const wasDragging = this._touchDragging;
    const deltaY = wasDragging && this._currentY !== undefined ? (this._currentY - this._startY) : 0;

    this._startY = undefined;
    this._startX = undefined;
    this._currentY = undefined;
    this._touchTarget = null;
    this._touchInScroll = false;
    this._touchDragging = false;
    this._touchLockedHorizontal = false;

    if (deltaY > 80) {
      this._fireHaptic("light");
      popupContent.style.transition = "transform 180ms ease-in, opacity 180ms ease-in";
      popupContent.style.transform = "translateY(100%)";
      popupContent.style.opacity = "0";
      if (overlay) {
        overlay.style.transition = "opacity 180ms ease-in";
        overlay.style.opacity = "0";
      }
      clearTimeout(this._closeModalTimer);
      this._closeModalTimer = setTimeout(() => {
        this._activeHvacTab = null;
        this._hvacModal = null;
        this._lastHvacControlsTab = null;
        this._statsModalOpen = false;
        this._statsHoverIdx = {};
        this._detachOverlayScrollGuard();
        this._unlockBackgroundScroll();
        this.requestUpdate();
      }, 180);
    } else if (wasDragging) {
      popupContent.style.transition = "transform 250ms cubic-bezier(0.2, 0, 0, 1)";
      popupContent.style.transform = "translateY(0px)";
      if (overlay) {
        overlay.style.transition = "opacity 250ms cubic-bezier(0.2, 0, 0, 1)";
        overlay.style.opacity = "1";
      }
      clearTimeout(this._swipeResetTimer);
      this._swipeResetTimer = setTimeout(() => {
        popupContent.style.transition = "";
        popupContent.style.transform = "";
        popupContent.style.animation = "";
        if (overlay) {
          overlay.style.transition = "";
          overlay.style.opacity = "";
          overlay.style.animation = "";
        }
      }, 250);
    }
  }

  _handleTouchCancel() {
    this._handleTouchEnd();
  }

  async _fetchHvacHistoryData(unitKey, climateId, outdoorTempId, coolDailySensorId, heatDailySensorId, coolTodaySensorId, heatTodaySensorId) {
    if (!this.hass || !climateId) return;

    if (
      this._hvacHistoryCache &&
      this._hvacHistoryCache[unitKey] &&
      Date.now() - this._hvacHistoryCache[unitKey].fetchedAt < 30000
    ) {
      return;
    }
    if (!this._hvacHistoryInFlight) this._hvacHistoryInFlight = new Set();
    if (this._hvacHistoryInFlight.has(unitKey)) return;
    this._hvacHistoryInFlight.add(unitKey);
    try {

    const now = new Date();
    const endTime = now;
    const startTime24h = new Date(endTime.getTime() - 24 * 3600 * 1000);
    const start24hIso = startTime24h.toISOString();
    const endIso = endTime.toISOString();

    // 10-day start aligned to local midnight 10 days ago
    const start10d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 10, 0, 0, 0, 0);
    const start10dIso = start10d.toISOString();

    const timelineEntities = [climateId, outdoorTempId].filter(Boolean);
    let climateHistory = [];
    let outdoorHistory = [];
    let fetchedSuccess = false;

    // 1. Fetch 24-hour timeline history for climate and outdoor temp
    if (typeof this.hass.callWS === "function") {
      try {
        const wsRes = await this.hass.callWS({
          type: "history/history_during_period",
          start_time: start24hIso,
          end_time: endIso,
          entity_ids: timelineEntities,
          no_attributes: false,
        });
        if (wsRes && typeof wsRes === "object") {
          if (Array.isArray(wsRes[climateId])) climateHistory = wsRes[climateId];
          if (outdoorTempId && Array.isArray(wsRes[outdoorTempId])) outdoorHistory = wsRes[outdoorTempId];
          fetchedSuccess = true;
        }
      } catch (wsErr) {
        console.warn("Home Assistant WebSocket History API error, falling back to REST API:", wsErr);
      }
    }

    if (!fetchedSuccess && typeof this.hass.callApi === "function") {
      const filterStr = timelineEntities.join(",");
      const endpoint = `history/period/${encodeURIComponent(start24hIso)}?filter_entity_id=${encodeURIComponent(filterStr)}&end_time=${encodeURIComponent(endIso)}&minimal_response=0&no_attributes=0`;
      try {
        const historyRes = await this.hass.callApi("GET", endpoint);
        if (historyRes && Array.isArray(historyRes)) {
          historyRes.forEach((entityArr) => {
            if (Array.isArray(entityArr) && entityArr.length > 0) {
              const entId = entityArr[0].entity_id;
              if (entId === climateId) {
                climateHistory = entityArr;
              } else if (entId === outdoorTempId) {
                outdoorHistory = entityArr;
              }
            }
          });
        }
      } catch (apiErr) {
        console.warn("Home Assistant History REST API warning:", apiErr);
      }
    }

    const sortByTime = (arr) => {
      if (!Array.isArray(arr)) return [];
      return arr.slice().sort((a, b) => {
        const tA = new Date(a.last_updated || a.last_changed || 0).getTime();
        const tB = new Date(b.last_updated || b.last_changed || 0).getTime();
        return tA - tB;
      });
    };

    climateHistory = sortByTime(climateHistory);
    outdoorHistory = sortByTime(outdoorHistory);

    // 2. Fetch 10-day daily statistics (recorder/statistics_during_period)
    const statEntities = [coolDailySensorId, heatDailySensorId, coolTodaySensorId, heatTodaySensorId, outdoorTempId].filter(Boolean);
    let statisticsData = {};
    if (typeof this.hass.callWS === "function" && statEntities.length > 0) {
      try {
        const statsRes = await this.hass.callWS({
          type: "recorder/statistics_during_period",
          start_time: start10dIso,
          end_time: endIso,
          statistic_ids: statEntities,
          period: "day",
          types: ["change", "state", "mean", "min", "max", "sum"]
        });
        if (statsRes && typeof statsRes === "object") {
          statisticsData = statsRes;
        }
      } catch (statsErr) {
        console.warn("Home Assistant Statistics API error:", statsErr);
      }
    }

    // 3. 10-Day outdoor temperature: if statistics didn't provide daily mean for outdoorTempId, fetch 10-day history for outdoorTempId
    let outdoorHistory10d = [];
    const hasOutdoorStats = outdoorTempId && statisticsData[outdoorTempId] && statisticsData[outdoorTempId].length > 0;
    if (!hasOutdoorStats && outdoorTempId && typeof this.hass.callWS === "function") {
      try {
        const outRes = await this.hass.callWS({
          type: "history/history_during_period",
          start_time: start10dIso,
          end_time: endIso,
          entity_ids: [outdoorTempId],
          significant_changes_only: true,
          minimal_response: true
        });
        if (outRes && Array.isArray(outRes[outdoorTempId])) {
          outdoorHistory10d = sortByTime(outRes[outdoorTempId]);
        }
      } catch (e) {
        console.warn("Failed to fetch 10d outdoor history:", e);
      }
    }

    // 4. Fallback: if neither coolDailySensorId nor heatDailySensorId returned statistics, fetch 10-day history for climateId
    let climateHistory10d = [];
    const hasCoolStats = coolDailySensorId && statisticsData[coolDailySensorId] && statisticsData[coolDailySensorId].length > 0;
    const hasHeatStats = heatDailySensorId && statisticsData[heatDailySensorId] && statisticsData[heatDailySensorId].length > 0;
    if (!hasCoolStats && !hasHeatStats && climateId && typeof this.hass.callWS === "function") {
      try {
        const clim10Res = await this.hass.callWS({
          type: "history/history_during_period",
          start_time: start10dIso,
          end_time: endIso,
          entity_ids: [climateId],
          significant_changes_only: true,
          no_attributes: false
        });
        if (clim10Res && Array.isArray(clim10Res[climateId])) {
          climateHistory10d = sortByTime(clim10Res[climateId]);
        }
      } catch (e) {
        console.warn("Failed to fetch 10d climate history:", e);
      }
    }

    if (!this._hvacHistoryCache) this._hvacHistoryCache = {};
    this._hvacHistoryCache[unitKey] = {
      fetchedAt: Date.now(),
      startTime: startTime24h.getTime(),
      endTime: endTime.getTime(),
      climateId,
      outdoorTempId,
      climateHistory,
      outdoorHistory,
      statisticsData,
      outdoorHistory10d,
      climateHistory10d
    };
    this.requestUpdate();
    } finally {
      this._hvacHistoryInFlight.delete(unitKey);
    }
  }

  _getNumericTempFromStateObj(obj) {
    if (!obj) return null;
    const attrT = obj.attributes?.temperature;
    if (attrT !== undefined && attrT !== null && !isNaN(parseFloat(attrT))) {
      return parseFloat(attrT);
    }
    const raw = obj.state;
    if (raw !== undefined && raw !== null && raw !== "unavailable" && raw !== "unknown" && !isNaN(parseFloat(raw))) {
      return parseFloat(raw);
    }
    return null;
  }

  _resolveOutdoorTempEntity(sysConfig = {}) {
    const c = this.config || {};
    const candidates = [
      sysConfig.outdoor_temp,
      c.outdoor_temp_sensor,
      c.outdoor_temp,
      "sensor.outside_temperature",
      "sensor.outdoor_temperature",
      c.outdoor_weather_entity,
      "weather.home",
      "weather.downstairs",
      "weather.upstairs",
    ].filter(Boolean);
    for (const id of candidates) {
      if (this._hasEntity(id)) return id;
    }
    return c.outdoor_temp_sensor || c.outdoor_temp || "sensor.outside_temperature";
  }

  _getHomeAverageTemp(systems = null) {
    const c = this.config || {};
    const primaryId = c.home_temp_sensor || "sensor.home_average_temperature";
    const primaryObj = this._getEntity(primaryId);
    const primaryVal = this._getNumericTempFromStateObj(primaryObj);
    if (primaryVal !== null) {
      return {
        temp: Math.round(primaryVal * 10) / 10,
        formatted: `${primaryVal.toFixed(1)}°`,
        entityId: primaryId,
      };
    }
    const activeSystems = Array.isArray(systems) ? systems : this._getHvacSystems();
    const zoneTemps = activeSystems
      .map((s) => this._resolveZoneClimate(s.key, s).currentTemp)
      .filter((t) => typeof t === "number" && !isNaN(t));
    if (zoneTemps.length > 0) {
      const avg = zoneTemps.reduce((acc, v) => acc + v, 0) / zoneTemps.length;
      return {
        temp: Math.round(avg * 10) / 10,
        formatted: `${avg.toFixed(1)}°`,
        entityId: null,
      };
    }
    return { temp: null, formatted: null, entityId: primaryId };
  }

  _parseHaTimestampMs(val) {
    if (val === undefined || val === null || val === "") return 0;
    if (typeof val === "number") {
      if (!isFinite(val)) return 0;
      return val > 1e11 ? val : val * 1000;
    }
    const ms = new Date(val).getTime();
    return isNaN(ms) ? 0 : ms;
  }

  _buildStatsTimestamps(hours, endMs = Date.now()) {
    const h = [6, 24, 168].includes(Number(hours)) ? Number(hours) : 24;
    const stepMs = h <= 6 ? 5 * 60000 : h <= 24 ? 15 * 60000 : 60 * 60000;
    const startMs = endMs - h * 3600000;
    const count = Math.max(2, Math.round((endMs - startMs) / stepMs) + 1);
    const timestampsMs = Array.from({ length: count }, (_, i) =>
      i === count - 1 ? endMs : startMs + i * stepMs
    );
    return { hours: h, stepMs, startMs, endMs, timestampsMs };
  }

  _bucketNumericHistory(rawList, timestampsMs, liveVal = null, isWeather = false) {
    const n = timestampsMs.length;
    const series = new Array(n).fill(null);
    const parsed = [];

    (Array.isArray(rawList) ? rawList : []).forEach((item) => {
      if (!item || typeof item !== "object") return;
      const ms = this._parseHaTimestampMs(
        item.lu ?? item.last_updated ?? item.lc ?? item.last_changed ?? item.start
      );
      if (!ms) return;
      const attrs = item.a || item.attributes || {};
      const stateRaw = item.s !== undefined ? item.s : item.state;
      let val = NaN;
      if (isWeather) {
        val = parseFloat(attrs.temperature);
      } else {
        val = parseFloat(stateRaw);
        if (isNaN(val) && attrs.temperature !== undefined) {
          val = parseFloat(attrs.temperature);
        }
      }
      if (!isNaN(val) && isFinite(val)) {
        parsed.push({ ms, val: Math.round(val * 10) / 10 });
      }
    });

    parsed.sort((a, b) => a.ms - b.ms);

    let p = 0;
    let lastVal = null;
    let minVal = Infinity;
    let maxVal = -Infinity;

    for (let i = 0; i < n; i++) {
      const ts = timestampsMs[i];
      while (p < parsed.length && parsed[p].ms <= ts) {
        lastVal = parsed[p].val;
        if (parsed[p].ms >= timestampsMs[0]) {
          if (lastVal < minVal) minVal = lastVal;
          if (lastVal > maxVal) maxVal = lastVal;
        }
        p++;
      }
      series[i] = lastVal;
      if (lastVal !== null) {
        if (lastVal < minVal) minVal = lastVal;
        if (lastVal > maxVal) maxVal = lastVal;
      }
    }

    if (liveVal !== null && liveVal !== undefined && !isNaN(Number(liveVal))) {
      const roundedLive = Math.round(Number(liveVal) * 10) / 10;
      series[n - 1] = roundedLive;
      if (roundedLive < minVal) minVal = roundedLive;
      if (roundedLive > maxVal) maxVal = roundedLive;
    }

    return {
      series,
      min: minVal === Infinity ? null : Math.round(minVal * 10) / 10,
      max: maxVal === -Infinity ? null : Math.round(maxVal * 10) / 10,
    };
  }

  _bucketHourlyStats(statRows, timestampsMs, liveVal = null) {
    const n = timestampsMs.length;
    const series = new Array(n).fill(null);
    const rows = [];
    let minVal = Infinity;
    let maxVal = -Infinity;

    (Array.isArray(statRows) ? statRows : []).forEach((row) => {
      if (!row) return;
      const startMs = this._parseHaTimestampMs(row.start);
      if (!startMs) return;
      const meanRaw = row.mean !== undefined && row.mean !== null ? parseFloat(row.mean) : parseFloat(row.state);
      if (isNaN(meanRaw)) return;
      const mean = Math.round(meanRaw * 10) / 10;
      const rMin = row.min !== undefined && row.min !== null && !isNaN(parseFloat(row.min)) ? parseFloat(row.min) : mean;
      const rMax = row.max !== undefined && row.max !== null && !isNaN(parseFloat(row.max)) ? parseFloat(row.max) : mean;
      rows.push({ startMs, endMs: startMs + 3600000, mean, rMin, rMax });
    });

    rows.sort((a, b) => a.startMs - b.startMs);

    let rIdx = 0;
    let lastVal = null;
    for (let i = 0; i < n; i++) {
      const ts = timestampsMs[i];
      while (rIdx < rows.length && rows[rIdx].endMs <= ts) {
        lastVal = rows[rIdx].mean;
        if (rows[rIdx].rMin < minVal) minVal = rows[rIdx].rMin;
        if (rows[rIdx].rMax > maxVal) maxVal = rows[rIdx].rMax;
        rIdx++;
      }
      if (rIdx < rows.length && rows[rIdx].startMs <= ts && ts < rows[rIdx].endMs) {
        lastVal = rows[rIdx].mean;
        if (rows[rIdx].rMin < minVal) minVal = rows[rIdx].rMin;
        if (rows[rIdx].rMax > maxVal) maxVal = rows[rIdx].rMax;
      }
      series[i] = lastVal;
    }

    if (liveVal !== null && liveVal !== undefined && !isNaN(Number(liveVal))) {
      const roundedLive = Math.round(Number(liveVal) * 10) / 10;
      series[n - 1] = roundedLive;
      if (roundedLive < minVal) minVal = roundedLive;
      if (roundedLive > maxVal) maxVal = roundedLive;
    }

    return {
      series,
      min: minVal === Infinity ? null : Math.round(minVal * 10) / 10,
      max: maxVal === -Infinity ? null : Math.round(maxVal * 10) / 10,
    };
  }

  _extractClimateTimeline(rawList, timestampsMs, fallbackSetpoint = null, liveAction = "idle") {
    const n = timestampsMs.length;
    const startMs = timestampsMs[0];
    const endMs = timestampsMs[n - 1];
    const events = [];

    (Array.isArray(rawList) ? rawList : []).forEach((item) => {
      if (!item || typeof item !== "object") return;
      const ms = this._parseHaTimestampMs(item.lu ?? item.last_updated ?? item.lc ?? item.last_changed);
      if (!ms) return;
      const attrs = item.a || item.attributes || {};
      const stateRaw = String(item.s !== undefined ? item.s : (item.state || "")).toLowerCase();
      let sp = parseFloat(attrs.temperature);
      if (isNaN(sp)) {
        const low = parseFloat(attrs.target_temp_low);
        const high = parseFloat(attrs.target_temp_high);
        if (!isNaN(low) && !isNaN(high)) sp = (low + high) / 2;
        else if (!isNaN(low)) sp = low;
        else if (!isNaN(high)) sp = high;
      }
      const actRaw = String(attrs.hvac_action || "").toLowerCase();
      let action = "idle";
      if (actRaw === "heating" || actRaw === "heat") action = "heating";
      else if (actRaw === "cooling" || actRaw === "cool") action = "cooling";
      else if (actRaw === "fan") action = "fan";
      else if (!actRaw && (stateRaw === "heating" || stateRaw === "cooling")) {
        action = stateRaw;
      }
      events.push({
        ms,
        setpoint: !isNaN(sp) && isFinite(sp) ? Math.round(sp * 10) / 10 : null,
        action,
      });
    });

    events.sort((a, b) => a.ms - b.ms);

    const setpointSeries = new Array(n).fill(null);
    let eIdx = 0;
    let curSp = null;
    for (let i = 0; i < n; i++) {
      const ts = timestampsMs[i];
      while (eIdx < events.length && events[eIdx].ms <= ts) {
        if (events[eIdx].setpoint !== null) curSp = events[eIdx].setpoint;
        eIdx++;
      }
      setpointSeries[i] = curSp;
    }

    if (fallbackSetpoint !== null && fallbackSetpoint !== undefined && !isNaN(Number(fallbackSetpoint))) {
      const fb = Math.round(Number(fallbackSetpoint) * 10) / 10;
      if (setpointSeries.every((v) => v === null)) {
        setpointSeries.fill(fb);
      } else {
        setpointSeries[n - 1] = fb;
      }
    }

    const actionBands = [];
    let bandAction = null;
    let bandStart = null;
    events.forEach((ev) => {
      const clampedMs = Math.max(startMs, Math.min(endMs, ev.ms));
      const nextAct = ev.action === "heating" || ev.action === "cooling" ? ev.action : null;
      if (nextAct === bandAction) return;
      if (bandAction && bandStart !== null && clampedMs > bandStart) {
        actionBands.push({ startMs: bandStart, endMs: clampedMs, action: bandAction });
      }
      bandAction = nextAct;
      bandStart = nextAct ? clampedMs : null;
    });
    if (bandAction && bandStart !== null && endMs > bandStart) {
      actionBands.push({ startMs: bandStart, endMs, action: bandAction });
    } else if (
      events.length === 0 &&
      (liveAction === "heating" || liveAction === "cooling")
    ) {
      actionBands.push({ startMs: Math.max(startMs, endMs - 900000), endMs, action: liveAction });
    }

    return { setpointSeries, actionBands };
  }

  _computeNightBands(startMs, endMs) {
    const sunAttrs = this.hass?.states?.["sun.sun"]?.attributes || {};
    const nextSetting = sunAttrs.next_setting ? new Date(sunAttrs.next_setting) : null;
    const nextRising = sunAttrs.next_rising ? new Date(sunAttrs.next_rising) : null;

    const sunsetMins = nextSetting && !isNaN(nextSetting.getTime())
      ? nextSetting.getHours() * 60 + nextSetting.getMinutes()
      : 18 * 60 + 30;
    const sunriseMins = nextRising && !isNaN(nextRising.getTime())
      ? nextRising.getHours() * 60 + nextRising.getMinutes()
      : 6 * 60 + 30;

    const bands = [];
    const cursor = new Date(startMs);
    cursor.setHours(0, 0, 0, 0);
    cursor.setDate(cursor.getDate() - 1);

    const endLimit = endMs + 86400000;
    while (cursor.getTime() <= endLimit) {
      const nStart = new Date(cursor.getTime());
      nStart.setMinutes(sunsetMins, 0, 0);
      const nEnd = new Date(cursor.getTime());
      nEnd.setDate(nEnd.getDate() + 1);
      nEnd.setMinutes(sunriseMins, 0, 0);

      const sMs = Math.max(startMs, nStart.getTime());
      const eMs = Math.min(endMs, nEnd.getTime());
      if (eMs > sMs) {
        bands.push({ startMs: sMs, endMs: eMs });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return bands;
  }

  async _fetchClimateStats(hours = this._statsHours, force = false) {
    if (!this.hass) return;
    const reqHours = [6, 24, 168].includes(Number(hours)) ? Number(hours) : 24;
    const cached = this._statsCache?.[reqHours];
    if (!force && cached && Date.now() - cached.fetchedAt < 60000) {
      this._statsError = null;
      this._statsLoading = false;
      this.requestUpdate();
      return;
    }
    if (!this._statsInFlight) this._statsInFlight = new Set();
    if (this._statsInFlight.has(reqHours)) return;
    this._statsInFlight.add(reqHours);

    this._statsLoading = true;
    this._statsError = null;
    this.requestUpdate();

    try {
      const systems = this._getHvacSystems();
      const { stepMs, startMs, endMs, timestampsMs } = this._buildStatsTimestamps(reqHours, Date.now());
      const startIso = new Date(startMs).toISOString();
      const endIso = new Date(endMs).toISOString();

      const sensors = [];
      const seenSensors = new Set();
      let colorCursor = 0;
      const zoneMetas = [];

      systems.forEach((sys) => {
        const zc = this._resolveZoneClimate(sys.key, sys);
        const sysSensors = this._getSystemSensors(sys.key, sys, zc.controlId);
        const zoneName = sys.name || sys.title || sys.key;
        const cObj = zc.controlObj;
        const mode = String(cObj?.state || "").toLowerCase();
        const action = String(cObj?.attributes?.hvac_action || "idle").toLowerCase();
        let liveSetpoint = parseFloat(cObj?.attributes?.temperature);
        if (isNaN(liveSetpoint)) {
          const low = parseFloat(cObj?.attributes?.target_temp_low);
          const high = parseFloat(cObj?.attributes?.target_temp_high);
          if (!isNaN(low) && !isNaN(high)) liveSetpoint = (low + high) / 2;
          else if (!isNaN(low)) liveSetpoint = low;
          else if (!isNaN(high)) liveSetpoint = high;
        }
        zoneMetas.push({
          key: sys.key,
          zone: zc.zone,
          name: zoneName,
          controlId: zc.controlId,
          companionId: zc.companionId,
          liveTemp: zc.currentTemp,
          liveHumidity: zc.currentHumidity,
          liveSetpoint: !isNaN(liveSetpoint) ? Math.round(liveSetpoint * 10) / 10 : null,
          mode,
          action,
        });

        sysSensors.forEach((s) => {
          if (!s?.entityId || seenSensors.has(s.entityId)) return;
          seenSensors.add(s.entityId);
          const color = HVAC_ROOM_PALETTE[colorCursor % HVAC_ROOM_PALETTE.length];
          colorCursor++;
          const liveT = typeof s.temp === "number" ? s.temp : parseFloat(s.temp);
          sensors.push({
            entityId: s.entityId,
            cleanName: s.cleanName || s.entityId,
            name: s.name || s.cleanName || s.entityId,
            zoneKey: sys.key,
            zoneName,
            color,
            currentTemp: !isNaN(liveT) ? Math.round(liveT * 10) / 10 : null,
            isActive: Boolean(s.isActive),
            isLimiting: Boolean(s.isLimiting),
            passiveRate: s.passiveRate || null,
          });
        });
      });

      const outdoorTempId = this._resolveOutdoorTempEntity();
      const outdoorIsWeather = Boolean(outdoorTempId && outdoorTempId.startsWith("weather."));
      const outdoorLive = outdoorTempId ? this._getNumericTempFromStateObj(this._getEntity(outdoorTempId)) : null;

      const homeAvgId = (this.config?.home_temp_sensor || "sensor.home_average_temperature");
      const hasHomeAvgSensor = this._hasEntity(homeAvgId);
      const homeAvgLive = this._getHomeAverageTemp(systems).temp;

      const numericSensorIds = [
        ...sensors.map((s) => s.entityId),
        ...(!outdoorIsWeather && outdoorTempId && this._hasEntity(outdoorTempId) ? [outdoorTempId] : []),
        ...(hasHomeAvgSensor ? [homeAvgId] : []),
      ];
      const climateAttrIds = Array.from(
        new Set(
          [
            ...zoneMetas.flatMap((z) => [z.controlId, z.companionId].filter(Boolean)),
            ...(outdoorIsWeather && outdoorTempId ? [outdoorTempId] : []),
          ].filter(Boolean)
        )
      );

      let numericHistoryMap = {};
      let statsHourlyMap = {};
      let attrHistoryMap = {};
      let anyRecorderSuccess = false;
      let recorderAvailable = true;

      const fetchHistoryDuring = async (entityIds, minimalResponse) => {
        if (!entityIds.length) return {};
        if (typeof this.hass.callWS === "function") {
          const res = await this.hass.callWS({
            type: "history/history_during_period",
            start_time: startIso,
            end_time: endIso,
            entity_ids: entityIds,
            significant_changes_only: true,
            minimal_response: minimalResponse,
            no_attributes: minimalResponse,
          });
          return res && typeof res === "object" ? res : {};
        }
        return {};
      };

      if (typeof this.hass.callWS === "function") {
        if (reqHours <= 24) {
          const [numRes, attrRes] = await Promise.allSettled([
            fetchHistoryDuring(numericSensorIds, true),
            fetchHistoryDuring(climateAttrIds, false),
          ]);
          if (numRes.status === "fulfilled") {
            numericHistoryMap = numRes.value;
            anyRecorderSuccess = true;
          }
          if (attrRes.status === "fulfilled") {
            attrHistoryMap = attrRes.value;
            anyRecorderSuccess = true;
          }
        } else {
          const [statRes, attrRes] = await Promise.allSettled([
            numericSensorIds.length
              ? this.hass.callWS({
                  type: "recorder/statistics_during_period",
                  start_time: startIso,
                  end_time: endIso,
                  statistic_ids: numericSensorIds,
                  period: "hour",
                  types: ["mean", "min", "max", "state"],
                })
              : Promise.resolve({}),
            fetchHistoryDuring(climateAttrIds, false),
          ]);
          if (statRes.status === "fulfilled" && statRes.value && typeof statRes.value === "object") {
            statsHourlyMap = statRes.value;
            anyRecorderSuccess = true;
          }
          if (attrRes.status === "fulfilled") {
            attrHistoryMap = attrRes.value;
            anyRecorderSuccess = true;
          }
          // Fall back to history_during_period for any entity lacking long-term statistics (e.g. sensor.weather_temperature without state_class)
          const missingIds = numericSensorIds.filter(
            (id) => !Array.isArray(statsHourlyMap[id]) || statsHourlyMap[id].length === 0
          );
          if (missingIds.length > 0) {
            try {
              const fbMap = await fetchHistoryDuring(missingIds, true);
              Object.assign(numericHistoryMap, fbMap);
              anyRecorderSuccess = true;
            } catch (fbErr) {
              console.warn("Climate stats fallback history warning:", fbErr);
            }
          }
        }
      } else {
        recorderAvailable = false;
      }

      if (!anyRecorderSuccess && numericSensorIds.length > 0) {
        recorderAvailable = false;
      }

      const buildNumericSeries = (entityId, liveVal, isWeather = false) => {
        if (!isWeather && Array.isArray(statsHourlyMap[entityId]) && statsHourlyMap[entityId].length > 0) {
          return this._bucketHourlyStats(statsHourlyMap[entityId], timestampsMs, liveVal);
        }
        const raw = isWeather ? attrHistoryMap[entityId] : numericHistoryMap[entityId];
        return this._bucketNumericHistory(raw, timestampsMs, liveVal, isWeather);
      };

      const processedSensors = sensors.map((s) => {
        const res = buildNumericSeries(s.entityId, s.currentTemp, false);
        return {
          ...s,
          series: res.series,
          min: res.min,
          max: res.max,
        };
      });

      const outdoorBucket = outdoorTempId
        ? buildNumericSeries(outdoorTempId, outdoorLive, outdoorIsWeather)
        : { series: new Array(timestampsMs.length).fill(null), min: null, max: null };

      const homeAvgBucket = hasHomeAvgSensor
        ? buildNumericSeries(homeAvgId, homeAvgLive, false)
        : { series: new Array(timestampsMs.length).fill(null), min: null, max: null };

      const processedZones = zoneMetas.map((zm) => {
        const rawCtrl = Array.isArray(attrHistoryMap[zm.controlId]) && attrHistoryMap[zm.controlId].length > 0
          ? attrHistoryMap[zm.controlId]
          : (zm.companionId ? attrHistoryMap[zm.companionId] : []);
        const timeline = this._extractClimateTimeline(rawCtrl, timestampsMs, zm.liveSetpoint, zm.action);
        return {
          ...zm,
          setpointSeries: timeline.setpointSeries,
          actionBands: timeline.actionBands,
        };
      });

      const data = {
        hours: reqHours,
        stepMs,
        startMs,
        endMs,
        timestampsMs,
        nightBands: this._computeNightBands(startMs, endMs),
        recorderAvailable,
        outdoor: {
          entityId: outdoorTempId,
          liveTemp: outdoorLive !== null ? Math.round(outdoorLive * 10) / 10 : null,
          series: outdoorBucket.series,
          min: outdoorBucket.min,
          max: outdoorBucket.max,
        },
        homeAvg: {
          entityId: homeAvgId,
          liveTemp: homeAvgLive,
          series: homeAvgBucket.series,
        },
        zones: processedZones,
        sensors: processedSensors,
      };

      this._statsCache = {
        ...(this._statsCache || {}),
        [reqHours]: { fetchedAt: Date.now(), data },
      };
    } catch (err) {
      if (this._statsHours === reqHours) {
        this._statsError = err?.message || "Failed to load HVAC & climate statistics";
      }
    } finally {
      this._statsInFlight.delete(reqHours);
      this._statsLoading = false;
      this.requestUpdate();
    }
  }

  _getZoneRuntimeBundle(unitKey, sysConfig = {}) {
    const c = this.config || {};
    const zoneClimate = this._resolveZoneClimate(unitKey, sysConfig);
    const zone = zoneClimate.zone;
    const climateId = zoneClimate.controlId;
    const companionId = zoneClimate.companionId;
    const climate = zoneClimate.controlObj;

    const outdoorTempId = this._resolveOutdoorTempEntity(sysConfig);
    const outdoorTempObj = this._getEntity(outdoorTempId);

    const coolTodaySensorId = sysConfig.cool_today || c[`${unitKey}_cool_today`] || `sensor.hvac_${zone}_cooling_today`;
    const heatTodaySensorId = sysConfig.heat_today || c[`${unitKey}_heat_today`] || `sensor.hvac_${zone}_heating_today`;
    const fanTodaySensorId = `sensor.hvac_${zone}_fan_today`;
    const cyclesPerHrSensorId = `sensor.hvac_${zone}_cycles_per_hour`;
    const coolDailySensorId = sysConfig.cool_daily || c[`${unitKey}_cool_daily`] || `sensor.hvac_${zone}_cooling_daily`;
    const heatDailySensorId = sysConfig.heat_daily || c[`${unitKey}_heat_daily`] || `sensor.hvac_${zone}_heating_daily`;

    const coolTodayObj = this._getEntity(coolTodaySensorId) || this._getEntity(`sensor.hvac_${zone}_cooling_runtime_today`);
    const heatTodayObj = this._getEntity(heatTodaySensorId) || this._getEntity(`sensor.hvac_${zone}_heating_runtime_today`);
    const fanTodayObj = this._getEntity(fanTodaySensorId);
    const cyclesObj = this._getEntity(cyclesPerHrSensorId);

    const liveCoolToday = (coolTodayObj?.state && !isNaN(parseFloat(coolTodayObj.state)))
      ? parseFloat(parseFloat(coolTodayObj.state).toFixed(1))
      : 0.0;
    const liveHeatToday = (heatTodayObj?.state && !isNaN(parseFloat(heatTodayObj.state)))
      ? parseFloat(parseFloat(heatTodayObj.state).toFixed(1))
      : 0.0;
    const liveFanToday = (fanTodayObj?.state && !isNaN(parseFloat(fanTodayObj.state)))
      ? parseFloat(parseFloat(fanTodayObj.state).toFixed(1))
      : null;
    const liveCyclesPerHr = (cyclesObj?.state && !isNaN(parseFloat(cyclesObj.state)))
      ? parseFloat(cyclesObj.state).toFixed(1)
      : null;

    const fanCircId = sysConfig.fan_circulation || c[`${unitKey}_fan_circulation`] || `input_number.hvac_fan_circulation_${zone}`;
    const fanCircActiveId = sysConfig.fan_circ_active || c[`${unitKey}_fan_circ_active`] || `input_boolean.hvac_fan_circulation_active_${zone}`;
    const fanCircObj = this._getEntity(fanCircId);
    const fanCircActiveObj = this._getEntity(fanCircActiveId);
    const fanMinVal = zoneClimate.fanMinOnTime !== null
      ? Math.round(parseFloat(zoneClimate.fanMinOnTime))
      : (fanCircObj && fanCircObj.state !== "unavailable" && !isNaN(parseFloat(fanCircObj.state)) ? Math.round(parseFloat(fanCircObj.state)) : null);

    const zonePower = this._getZonePowerMetrics(zone, sysConfig);
    const filterMetrics = this._getZoneFilterMetrics(unitKey, sysConfig);
    const zoneRateObj = this.hass?.states?.[`sensor.${zone}_fault_tolerant_temp_rate`] || null;

    const isHeatingSeason = Boolean(
      climate && (climate.state === "heat" || climate?.attributes?.hvac_action === "heating")
    );
    const liveOutdoorTemp = this._getNumericTempFromStateObj(outdoorTempObj);
    const liveOutdoorTempStr = liveOutdoorTemp !== null ? liveOutdoorTemp.toFixed(1) : "--";

    const cachedHistory = this._hvacHistoryCache?.[unitKey] || null;
    const fallbackIndoor = zoneClimate.currentTemp !== null ? zoneClimate.currentTemp : 72;
    const fallbackSetpoint = climate?.attributes?.temperature ?? climate?.attributes?.target_temp_low ?? climate?.attributes?.target_temp_high ?? 72;

    const analytics = this._getProcessedHvacAnalytics({
      unitKey,
      cachedHistory,
      selectedDayIdx: (this._selectedHvacDayIndex !== undefined && this._selectedHvacDayIndex !== null) ? this._selectedHvacDayIndex : 9,
      selectedChunkIdxInput: this._selectedHvacChunkIndex,
      stepMinutes: parseInt(this._hvacTimelineRes || 15, 10),
      isHeatingSeason,
      liveCoolToday,
      liveHeatToday,
      liveOutdoorTemp,
      liveOutdoorTempStr,
      fallbackIndoor,
      fallbackSetpoint,
      coolDailySensorId,
      heatDailySensorId,
      coolTodaySensorId,
      heatTodaySensorId,
      outdoorTempId,
    });

    return {
      zoneClimate,
      zone,
      climateId,
      companionId,
      climate,
      liveCoolToday,
      liveHeatToday,
      liveFanToday,
      liveCyclesPerHr,
      fanCircId,
      fanCircActiveId,
      fanCircActiveObj,
      fanMinVal,
      zonePower,
      filterMetrics,
      zoneRateObj,
      isHeatingSeason,
      liveOutdoorTemp,
      liveOutdoorTempStr,
      analytics,
    };
  }

  _formatStatsAxisTime(tsMs, hours) {
    if (!tsMs) return "";
    const d = new Date(tsMs);
    if (hours >= 168) {
      return d.toLocaleDateString([], { weekday: "short" });
    }
    if (hours <= 6) {
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(":00 ", " ");
    }
    return d.toLocaleTimeString([], { hour: "numeric" });
  }

  _formatStatsTooltipTime(tsMs, hours) {
    if (!tsMs) return "";
    const d = new Date(tsMs);
    if (hours >= 168) {
      return d.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
    }
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  _computeTempAxis(vals, minSpan = 4, pad = 1) {
    const valid = (Array.isArray(vals) ? vals : []).filter((v) => v !== null && v !== undefined && !isNaN(Number(v)));
    if (valid.length === 0) {
      return { yMin: 60, yMax: 80, ticks: [60, 65, 70, 75, 80] };
    }
    let rawMin = Math.floor(Math.min(...valid) - pad);
    let rawMax = Math.ceil(Math.max(...valid) + pad);
    if (rawMax - rawMin < minSpan) {
      const mid = (rawMin + rawMax) / 2;
      rawMin = Math.floor(mid - minSpan / 2);
      rawMax = Math.ceil(mid + minSpan / 2);
    }
    const span = rawMax - rawMin;
    const rawStep = span / 4;
    const stepCandidates = [1, 2, 3, 4, 5, 10, 15, 20];
    const step = stepCandidates.find((s) => s >= rawStep) || Math.ceil(rawStep / 5) * 5;
    const yMin = Math.floor(rawMin / step) * step;
    const yMax = Math.max(yMin + step * 4, Math.ceil(rawMax / step) * step);
    const ticks = [];
    for (let v = yMin; v <= yMax + 0.001; v += step) {
      ticks.push(Math.round(v));
    }
    return { yMin, yMax: ticks[ticks.length - 1] || yMax, ticks };
  }

  _buildStatsPolylines(values, timestampsMs, toX, toY) {
    const segments = [];
    let curSeg = [];
    for (let i = 0; i < timestampsMs.length; i++) {
      const val = values?.[i];
      if (val === null || val === undefined || isNaN(Number(val))) {
        if (curSeg.length > 0) {
          segments.push(curSeg);
          curSeg = [];
        }
        continue;
      }
      curSeg.push(`${toX(timestampsMs[i]).toFixed(1)},${toY(Number(val)).toFixed(1)}`);
    }
    if (curSeg.length > 0) segments.push(curSeg);
    return segments.filter((seg) => seg.length >= 2).map((seg) => seg.join(" "));
  }

  _handleStatsChartScrub(chartKey, ev, padLeft, plotW, svgW, data) {
    const timestamps = data?.timestampsMs || [];
    const count = timestamps.length;
    if (!count) return;
    const rect = ev.currentTarget?.getBoundingClientRect?.();
    if (!rect || rect.width <= 0) return;

    const clientX =
      ev.touches && ev.touches.length > 0
        ? ev.touches[0].clientX
        : ev.changedTouches && ev.changedTouches.length > 0
          ? ev.changedTouches[0].clientX
          : ev.clientX;
    if (clientX === undefined) return;

    const svgX = ((clientX - rect.left) / rect.width) * svgW;
    const clamped = Math.max(padLeft, Math.min(padLeft + plotW, svgX));
    const frac = (clamped - padLeft) / plotW;
    const startMs = data.startMs ?? timestamps[0];
    const endMs = data.endMs ?? timestamps[count - 1];
    const targetMs = startMs + frac * Math.max(1, endMs - startMs);

    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < count; i++) {
      const dist = Math.abs(timestamps[i] - targetMs);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    if (this._statsHoverIdx?.[chartKey] !== bestIdx) {
      this._statsHoverIdx = { ...(this._statsHoverIdx || {}), [chartKey]: bestIdx };
    }
  }

  _clearStatsChartScrub(chartKey) {
    if (this._statsHoverIdx?.[chartKey] != null) {
      this._statsHoverIdx = { ...(this._statsHoverIdx || {}), [chartKey]: null };
    }
  }

  _getZonePowerMetrics(zone, sysConfig = {}) {
    const z = (zone || "").toLowerCase();
    const explicit = Array.isArray(sysConfig.span_power_entities) ? sysConfig.span_power_entities : null;
    const defaultIds = z === "upstairs"
      ? ["sensor.span_panel_air_handler_attic_power", "sensor.span_panel_ac_condenser_power"]
      : z === "downstairs"
      ? ["sensor.span_panel_air_handler_basement_power", "sensor.span_panel_ac_condenser_2_power"]
      : [];
    const entityIds = explicit || defaultIds;

    let airHandlerW = null;
    let condenserW = null;
    let totalW = 0;
    let count = 0;

    entityIds.forEach((eid, idx) => {
      const obj = this._getEntity(eid);
      const val = parseFloat(obj?.state);
      if (!isNaN(val)) {
        totalW += val;
        count++;
        if (idx === 0 || eid.includes("air_handler")) airHandlerW = (airHandlerW || 0) + val;
        else if (idx === 1 || eid.includes("condenser")) condenserW = (condenserW || 0) + val;
      }
    });

    const formatted = count > 0
      ? (totalW >= 1000 ? `${(totalW / 1000).toFixed(2)}kW` : `${Math.round(totalW * 10) / 10}W`)
      : null;

    return {
      airHandlerW,
      condenserW,
      totalW: count > 0 ? Math.round(totalW * 10) / 10 : null,
      formatted,
      hasPower: count > 0,
      entityIds,
    };
  }

  _getTotalHvacPower(systems) {
    const totalObj = this._getEntity("sensor.total_hvac_power");
    const totalNum = parseFloat(totalObj?.state);
    if (!isNaN(totalNum)) {
      return {
        watts: Math.round(totalNum * 10) / 10,
        formatted: totalNum >= 1000 ? `${(totalNum / 1000).toFixed(2)}kW` : `${totalNum.toFixed(1)}W`,
        entityId: "sensor.total_hvac_power",
      };
    }
    let sum = 0;
    let hasAny = false;
    (systems || []).forEach((sys) => {
      const p = this._getZonePowerMetrics(sys.key, sys);
      if (p.hasPower && p.totalW !== null) {
        sum += p.totalW;
        hasAny = true;
      }
    });
    return {
      watts: hasAny ? Math.round(sum * 10) / 10 : null,
      formatted: hasAny ? (sum >= 1000 ? `${(sum / 1000).toFixed(2)}kW` : `${sum.toFixed(1)}W`) : null,
      entityId: null,
    };
  }

  _getZoneWindowState(zone, sysConfig = {}) {
    const c = this.config || {};
    const z = (zone || "").toLowerCase();
    const candidates = [
      sysConfig.open_windows_count,
      c[`${zone}_open_windows_count`],
      `sensor.${z}_window_open_count`,
      `sensor.${z}_open_windows_count`,
    ].filter(Boolean);

    let count = 0;
    let pendingDebounceCount = 0;
    let countObj = null;

    for (const cid of candidates) {
      const st = this.hass?.states?.[cid];
      if (st && st.state !== "unavailable" && st.state !== "unknown") {
        const parsed = parseInt(st.state, 10);
        if (!isNaN(parsed)) {
          count = parsed;
          countObj = st;
          if (Array.isArray(st.attributes?.pending_debounce_sensors)) {
            pendingDebounceCount = st.attributes.pending_debounce_sensors.length;
          }
          break;
        }
      }
    }

    if (!countObj) {
      const binObj = this.hass?.states?.[`binary_sensor.${z}_windows_open`];
      if (binObj && binObj.state === "on") {
        count = 1;
      }
    }

    return {
      openCount: count,
      pendingDebounceCount,
      isDebouncing: count === 0 && pendingDebounceCount > 0,
    };
  }

  _getZoneFilterMetrics(unitKey, sysConfig = {}) {
    const c = this.config || {};
    const zone = (unitKey || "downstairs").toLowerCase();
    const runtimeId = sysConfig.filter_runtime || `sensor.hvac_${zone}_filter_runtime`;
    const hoursId = sysConfig.filter_hours || c[`${unitKey}_filter_hours`] || `sensor.hvac_filter_life_remaining_${zone}`;
    const lifeId = sysConfig.filter_life || c[`${unitKey}_filter_life`] || (this._hasEntity(`number.hvac_filter_life_${zone}`) ? `number.hvac_filter_life_${zone}` : `input_number.hvac_filter_life_${zone}`);

    const runtimeObj = this._getEntity(runtimeId);
    const hoursObj = this._getEntity(hoursId);
    const lifeObj = this._getEntity(lifeId);

    const lifeNum = parseFloat(lifeObj?.state);
    const attrMax = parseFloat(runtimeObj?.attributes?.max_hours ?? hoursObj?.attributes?.capacity_hours);
    const maxHours = !isNaN(lifeNum) && lifeNum > 0 ? lifeNum : (!isNaN(attrMax) && attrMax > 0 ? attrMax : 300);

    const attrRuntime = parseFloat(runtimeObj?.attributes?.runtime_hours);
    const stateRuntime = parseFloat(runtimeObj?.state);
    const usedHours = !isNaN(attrRuntime) ? attrRuntime : (!isNaN(stateRuntime) ? stateRuntime : null);

    const stateRem = parseFloat(hoursObj?.state);
    const remHours = !isNaN(stateRem)
      ? stateRem
      : (usedHours !== null ? Math.max(0, Math.round((maxHours - usedHours) * 10) / 10) : null);

    const attrPct = parseFloat(runtimeObj?.attributes?.percent_remaining);
    const percentRemaining = !isNaN(attrPct)
      ? Math.max(0, Math.min(100, Math.round(attrPct)))
      : (remHours !== null && maxHours > 0 ? Math.max(0, Math.min(100, Math.round((remHours / maxHours) * 100))) : null);

    const computedUsed = usedHours !== null ? Math.round(usedHours * 10) / 10 : (remHours !== null ? Math.max(0, Math.round((maxHours - remHours) * 10) / 10) : 0);
    const lastResetRaw =
      hoursObj?.attributes?.last_replaced ||
      hoursObj?.attributes?.[`last_changed_${zone}`] ||
      hoursObj?.attributes?.[`last_changed_${unitKey}`] ||
      runtimeObj?.attributes?.last_replaced ||
      runtimeObj?.attributes?.[`last_changed_${zone}`] ||
      runtimeObj?.attributes?.[`last_changed_${unitKey}`] ||
      runtimeObj?.attributes?.last_reset ||
      hoursObj?.attributes?.last_reset ||
      null;
    const isExpired = (percentRemaining !== null && percentRemaining <= 0) || (remHours !== null && remHours <= 0);
    const isLow = !isExpired && ((percentRemaining !== null && percentRemaining <= 25) || (remHours !== null && remHours <= 25));

    return {
      runtimeId,
      hoursId,
      lifeId,
      maxHours,
      usedHours: computedUsed,
      remHours,
      percentRemaining,
      lastResetRaw,
      isExpired,
      isLow,
      isAlert: isExpired || isLow,
    };
  }

  _formatWindowAdvisorLabel(rawState) {
    if (!rawState || rawState === "unavailable" || rawState === "unknown") return { text: "Advisor Standby", tone: "neutral" };
    const clean = String(rawState).trim();
    const low = clean.toLowerCase();
    const formatted = clean
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
    if (low.includes("open")) return { text: formatted, tone: "open" };
    if (low.includes("close")) return { text: formatted, tone: "close" };
    return { text: formatted, tone: "neutral" };
  }

  _renderSmartClimateSummaryStrip(systems) {
    const c = this.config || {};
    const winRecObj = this._getEntity(c.window_recommendation_entity || "sensor.passable_climate_window_recommendation");
    const profileObj = this._getEntity("input_text.hvac_active_profile");
    const overrideObj = this._getEntity("input_text.hvac_active_profile_override");
    const globalPresetObj = this._getEntity(c.global_setpoint_preset);
    const outdoorObj = this._getEntity(c.outdoor_temp_sensor || "sensor.outside_temperature");
    const weatherObj = this._getEntity(c.outdoor_weather_entity || "weather.home");
    const heatPredictObj = this._getEntity("input_boolean.hvac_advisor_predicts_heat_needed");

    const winMeta = this._formatWindowAdvisorLabel(winRecObj?.state);
    const overrideText = overrideObj?.state && overrideObj.state !== "unavailable" && overrideObj.state !== "unknown" && overrideObj.state.trim() !== "" ? overrideObj.state.trim() : null;
    const activeProfile = overrideText
      || (profileObj?.state && profileObj.state !== "unavailable" && profileObj.state !== "unknown" ? profileObj.state : null)
      || (globalPresetObj?.state && globalPresetObj.state !== "unavailable" && globalPresetObj.state !== "unknown" ? globalPresetObj.state : null);

    let outTemp = this._getNumericTempFromStateObj(outdoorObj);
    if (outTemp === null) {
      outTemp = this._getNumericTempFromStateObj(weatherObj);
    }
    const outTempStr = outTemp !== null ? `${Math.round(outTemp)}°` : "--";
    const homeAvg = this._getHomeAverageTemp(systems);

    const powerSummary = this._getTotalHvacPower(systems);
    const totalOpenWindows = (systems || []).reduce((acc, s) => acc + this._getZoneWindowState(s.key, s).openCount, 0);
    const hasHeatPrediction = heatPredictObj?.state === "on";
    const hasAttention = hasHeatPrediction || totalOpenWindows > 0;
    const firstUnitKey = systems?.[0]?.key || "upstairs";

    return html`
      <div
        class="hvac-summary-strip ${winMeta.tone}"
        @click=${() => this._showHvacModal(firstUnitKey, "advisor")}
        title="Smart Climate Advisor: Tap for comfort envelope, psychrometrics & forecast trajectory"
      >
        <div class="summary-strip-left">
          <span class="summary-status-dot ${winMeta.tone}"></span>
          <span class="summary-win-label">${winMeta.text}</span>
          ${activeProfile
            ? html`
                <span class="summary-sep">•</span>
                <span class="summary-profile-pill" title="Active Thermal Profile">
                  <ha-icon icon="${this._getPresetIcon(activeProfile)}"></ha-icon>
                  <span>${activeProfile}</span>
                </span>
              `
            : ""}
        </div>

        <div class="summary-strip-right">
          ${c.show_home_avg_in_strip !== false && homeAvg.formatted
            ? html`
                <span class="summary-metric home-avg" title="Home Average Temperature">
                  <ha-icon icon="mdi:home-thermometer-outline"></ha-icon>
                  <span class="home-avg-prefix">Home </span><span>${homeAvg.formatted}</span>
                </span>
                <span class="summary-sep">•</span>
              `
            : ""}
          <span class="summary-metric" title="Outdoor Temperature">
            <ha-icon icon="mdi:thermometer"></ha-icon>
            <span class="out-prefix">Out </span><span>${outTempStr}</span>
          </span>
          ${powerSummary.formatted
            ? html`
                <span class="summary-sep">•</span>
                <span class="summary-metric ${powerSummary.watts > 350 ? 'power-active' : ''}" title="Total Live HVAC Power Draw">
                  <ha-icon icon="mdi:lightning-bolt"></ha-icon>
                  <span>${powerSummary.formatted}</span>
                </span>
              `
            : ""}
          ${hasAttention
            ? html`
                <span
                  class="summary-alert-dot ${hasHeatPrediction ? 'heat' : 'open'}"
                  title="${hasHeatPrediction ? 'Overnight heating recovery predicted — tap for details' : `${totalOpenWindows} window(s) open`}"
                >
                  <ha-icon icon="${hasHeatPrediction ? 'mdi:alert-outline' : 'mdi:window-open-variant'}"></ha-icon>
                </span>
              `
            : ""}
          ${c.show_stats_button !== false
            ? html`
                <button
                  type="button"
                  class="icon-circle-btn"
                  @click=${(ev) => {
                    ev.stopPropagation();
                    this._handleStatsButtonClick(systems, "all", "temps");
                  }}
                  title="Open HVAC & Climate Stats"
                  aria-label="Open HVAC & Climate Stats"
                >
                  <ha-icon icon="mdi:chart-line" style="--mdc-icon-size:16px;"></ha-icon>
                </button>
              `
            : ""}
        </div>
      </div>
    `;
  }

  render() {
    if (!this.hass || !this.config) return html``;

    const c = this.config;
    const globalPresetObj = this._getEntity(c.global_setpoint_preset);

    const systems = c.systems || c.hvac_systems || [
      {
        key: "upstairs",
        name: c.upstairs_name || "Upstairs & Attic",
        icon: c.upstairs_icon || "mdi:home-floor-2",
        climate: c.upstairs_climate_hk || c.upstairs_climate || "climate.upstairs_hk"
      },
      {
        key: "downstairs",
        name: c.downstairs_name || "Downstairs & Basement",
        icon: c.downstairs_icon || "mdi:home-floor-1",
        climate: c.downstairs_climate_hk || c.downstairs_climate || "climate.downstairs_hk"
      }
    ];

    return html`
      <ha-card>
        ${c.show_header !== false
          ? html`
              <div class="header">
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:8px;">
                  <h1 class="title">
                    <ha-icon icon="mdi:hvac" style="margin-right:8px; color: var(--primary-color);"></ha-icon>
                    ${c.title || "HVAC Systems"}
                  </h1>
                  <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                    ${globalPresetObj && globalPresetObj.state !== "unavailable" && globalPresetObj.state !== "unknown"
                      ? html`
                          <div class="global-preset-badge" @click=${() => this._showMoreInfo(c.global_setpoint_preset)}>
                            <ha-icon icon="mdi:tune-vertical" style="--mdc-icon-size:16px; margin-right:4px;"></ha-icon>
                            <span>${globalPresetObj.state}</span>
                          </div>
                        `
                      : ""}
                    ${c.show_advisor_strip === false && c.show_stats_button !== false
                      ? html`
                          <button
                            type="button"
                            class="icon-circle-btn"
                            @click=${(ev) => {
                              ev.stopPropagation();
                              this._handleStatsButtonClick(systems, "all", "temps");
                            }}
                            title="Open HVAC & Climate Stats"
                            aria-label="Open HVAC & Climate Stats"
                          >
                            <ha-icon icon="mdi:chart-line" style="--mdc-icon-size:16px;"></ha-icon>
                          </button>
                        `
                      : ""}
                  </div>
                </div>
                <div class="header-subtitle-row">
                  <p class="subtitle">${systems.length} Local HVAC System${systems.length > 1 ? "s" : ""} & Comfort Control</p>
                </div>
              </div>
            `
          : ""}

        <div class="card-content ${c.show_header === false ? 'no-header' : ''}">
          ${c.show_advisor_strip !== false ? this._renderSmartClimateSummaryStrip(systems) : ""}
          <div class="hvac-grid">
            ${systems.map((sys) => this._renderHvacUnitCard(sys.key, sys.name, sys.icon, sys.climate, sys))}
          </div>
        </div>

        ${this._renderHvacModal(systems)}
        ${this._renderStatsModal(systems)}
      </ha-card>
    `;
  }

  _getCleanRoomName(rawName, entId = "") {
    const eidLow = String(entId || "").toLowerCase();
    const rawLow = String(rawName || "").toLowerCase();
    if (eidLow === "sensor.upstairs_temperature" || rawLow.includes("upstairs thermostat")) {
      return "Upstairs Hall";
    }
    if (eidLow === "sensor.downstairs_temperature" || rawLow.includes("downstairs thermostat")) {
      return "Dining / Hall";
    }
    if (!rawName) return "";
    let name = rawName
      .replace(/ecobee sensor/gi, "")
      .replace(/temperature/gi, "")
      .replace(/temp/gi, "")
      .replace(/sensor/gi, "")
      .replace(/[()]/g, "")
      .trim();
    // Strip possessives and room words
    name = name
      .replace(/['’]s\s*room\b/gi, "")
      .replace(/['’]s\b/gi, "")
      .replace(/\s*bedroom\b/gi, "")
      .replace(/\s*room\b/gi, "")
      .trim();
    if (rawLow.includes("bonus room") && name.toLowerCase() === "bonus") return "Bonus Room";
    if (rawLow.includes("downstairs bath") && name.toLowerCase().includes("downstairs bath")) return "Downstairs Bath";
    return name || rawName;
  }

  _toggleSensorTray(e, unitKey) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    this._fireHaptic("light");
    if (!this._expandedSensorUnits) {
      this._expandedSensorUnits = {};
    }
    this._expandedSensorUnits = {
      ...this._expandedSensorUnits,
      [unitKey]: !this._expandedSensorUnits[unitKey]
    };
    this.requestUpdate();
  }

  _toggleModalSection(sectionKey, e) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    this._fireHaptic("light");
    this._expandedModalSections = {
      ...(this._expandedModalSections || {}),
      [sectionKey]: !(this._expandedModalSections && this._expandedModalSections[sectionKey])
    };
    this.requestUpdate();
  }

  _getSystemSensors(unitKey, sysConfig = {}, defaultClimateId = null) {
    if (!this.hass) return [];
    const c = this.config;

    // 1. Explicit configuration per system or global card
    const explicit = sysConfig.sensors || (c.sensors && c.sensors[unitKey]);

    // Resolve climate entity & companion Ecobee entity for active_sensors / available_sensors
    const zoneClimate = this._resolveZoneClimate(unitKey, { climate: defaultClimateId, ...sysConfig });
    const activeSensors = zoneClimate.activeSensors || [];
    const availableSensors = (zoneClimate.companionObj?.attributes?.available_sensors)
      || (zoneClimate.controlObj?.attributes?.available_sensors)
      || [];

    const excludeThermostatAuto = sysConfig.exclude_thermostat_sensor !== false && c.exclude_thermostat_sensor !== false;
    const excludeThermostatExplicit = sysConfig.exclude_thermostat_sensor === true || c.exclude_thermostat_sensor === true;

    const checkSensorActive = (roomLabel, rawName = "", entId = "") => {
      if (!Array.isArray(activeSensors) || activeSensors.length === 0) return false;
      const targets = new Set();
      [roomLabel, rawName, this._getCleanRoomName(rawName, entId)].forEach((label) => {
        if (!label) return;
        const norm = String(label)
          .replace(/ecobee sensor|temperature|temp|sensor/gi, "")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
        if (norm) targets.add(norm);
      });
      if (entId === "sensor.upstairs_temperature") targets.add("upstairsthermostat");
      if (entId === "sensor.downstairs_temperature") targets.add("downstairsthermostat");
      if (targets.size === 0) return false;

      return activeSensors.some((act) => {
        const actRawNorm = String(act).toLowerCase().replace(/[^a-z0-9]/g, "");
        const actCleanNorm = this._getCleanRoomName(act).toLowerCase().replace(/[^a-z0-9]/g, "");
        for (const t of targets) {
          if ((actRawNorm && (actRawNorm.includes(t) || t.includes(actRawNorm))) ||
              (actCleanNorm && (actCleanNorm.includes(t) || t.includes(actCleanNorm)))) {
            return true;
          }
        }
        return false;
      });
    };

    const advisorRecObj = this.hass?.states?.["sensor.passable_climate_window_recommendation"];
    const limitingRoomEntity = advisorRecObj?.attributes?.sleep_limiting_room_entity || null;
    const winState = this._getZoneWindowState(unitKey, sysConfig);
    const hasOpenWindows = winState.openCount > 0;

    const resolveRoomPassiveRate = (entId, roomLabel, rawFriendly = "") => {
      if (!this.hass || !this.hass.states) return null;
      const suffix = hasOpenWindows ? "open" : "closed";
      const candidateSlugs = [];
      const addSlug = (s) => {
        const clean = String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
        if (clean && !candidateSlugs.includes(clean)) candidateSlugs.push(clean);
      };

      if (entId) {
        const entSlug = String(entId).replace(/^sensor\./, "").replace(/_temperature$/, "").replace(/_temp$/, "");
        addSlug(entSlug);
        if (entSlug === "downstairs") addSlug("dining_room");
        if (entSlug === "upstairs") addSlug("upstairs");
        if (entSlug === "bathroom") addSlug("bathroom");
        if (entSlug === "basement") addSlug("basement");
      }
      if (roomLabel) {
        const rSlug = String(roomLabel).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
        addSlug(rSlug);
        if (rSlug === "dining_hall") addSlug("dining_room");
        if (rSlug === "downstairs_bath") addSlug("bathroom");
        if (rSlug === "upstairs_hall") addSlug("upstairs");
        if (rSlug === "bonus_room") addSlug("basement");
      }
      if (rawFriendly) {
        addSlug(rawFriendly.replace(/ecobee sensor|temperature|thermostat/gi, ""));
      }

      for (const slug of candidateSlugs) {
        const st = this.hass.states[`sensor.${slug}_heat_loss_gain_windows_${suffix}`];
        if (st && st.state !== "unavailable" && st.state !== "unknown" && !isNaN(parseFloat(st.state))) {
          const val = parseFloat(st.state);
          return `${val >= 0 ? "+" : ""}${val.toFixed(1)}°/h`;
        }
      }
      return null;
    };

    if (Array.isArray(explicit) && explicit.length > 0) {
      return explicit.map((item) => {
        const entId = typeof item === "string" ? item : item.entity;
        const stateObj = this.hass.states[entId];
        if (!stateObj) return null;
        const hasCustomName = Boolean(typeof item === "object" && item.name);
        const rawFriendlyName = hasCustomName ? item.name : (stateObj.attributes.friendly_name || entId);

        if (excludeThermostatExplicit) {
          const isThermostat = rawFriendlyName.toLowerCase().includes("thermostat") || entId.toLowerCase().includes("thermostat");
          if (isThermostat) return null;
        }

        const cleanName = hasCustomName ? item.name : this._getCleanRoomName(rawFriendlyName, entId);
        const rawTemp = parseFloat(stateObj.state);
        const temp = !isNaN(rawTemp) ? Math.round(rawTemp * 10) / 10 : stateObj.state;
        const unit = stateObj.attributes.unit_of_measurement || "°";
        const isActive = checkSensorActive(cleanName, rawFriendlyName, entId);
        const passiveRate = resolveRoomPassiveRate(entId, cleanName, rawFriendlyName);
        const isLimiting = Boolean(limitingRoomEntity && entId === limitingRoomEntity);
        return {
          entityId: entId,
          name: rawFriendlyName,
          cleanName: cleanName || entId,
          temp,
          unit,
          isActive,
          passiveRate,
          isLimiting,
          stateObj
        };
      }).filter(Boolean);
    }

    // 2. Auto-discovery from available_sensors attribute
    if (Array.isArray(availableSensors) && availableSensors.length > 0) {
      const discovered = [];
      const allStates = Object.values(this.hass.states);
      const tempSensors = allStates.filter((s) =>
        s.entity_id.startsWith("sensor.") &&
        (s.attributes.device_class === "temperature" ||
         s.attributes.unit_of_measurement === "°F" ||
         s.attributes.unit_of_measurement === "°C")
      );

      availableSensors.forEach((sensorStr) => {
        let cleanName = sensorStr.replace(/\([0-9a-fA-F]{20,}\)/g, "").trim();
        const isMainThermostat = cleanName.toLowerCase().includes("thermostat");
        if (excludeThermostatAuto && isMainThermostat) return;

        cleanName = cleanName.replace(/ecobee sensor/gi, "").replace(/[()]/g, "").trim();

        const match = tempSensors.find((s) => {
          const fn = (s.attributes.friendly_name || "").toLowerCase();
          const eid = s.entity_id.toLowerCase();
          const cn = cleanName.toLowerCase();
          const simplifiedCn = cn.replace(/[^a-z0-9]/g, "");
          const simplifiedEid = eid.replace(/[^a-z0-9]/g, "");
          const simplifiedFn = fn.replace(/[^a-z0-9]/g, "");
          return (
            fn.includes(cn) ||
            simplifiedFn.includes(simplifiedCn) ||
            simplifiedEid.includes(simplifiedCn)
          );
        });

        if (match) {
          const rawTemp = parseFloat(match.state);
          const temp = !isNaN(rawTemp) ? Math.round(rawTemp * 10) / 10 : match.state;
          const unit = match.attributes.unit_of_measurement || "°";
          const shortName = this._getCleanRoomName(match.attributes.friendly_name || cleanName, match.entity_id);
          const isActive = checkSensorActive(shortName || cleanName, match.attributes.friendly_name || cleanName, match.entity_id);
          const passiveRate = resolveRoomPassiveRate(match.entity_id, shortName || cleanName, match.attributes.friendly_name || cleanName);
          const isLimiting = Boolean(limitingRoomEntity && match.entity_id === limitingRoomEntity);
          discovered.push({
            entityId: match.entity_id,
            name: match.attributes.friendly_name || cleanName,
            cleanName: shortName || match.entity_id,
            temp,
            unit,
            isActive,
            passiveRate,
            isLimiting,
            stateObj: match
          });
        }
      });

      if (discovered.length > 0) {
        return discovered;
      }
    }

    return [];
  }

  _renderHvacUnitCard(unitKey, title, icon, defaultClimate, sysConfig = {}) {
    const c = this.config;
    const zoneClimate = this._resolveZoneClimate(unitKey, { climate: defaultClimate, ...sysConfig });
    const climateId = zoneClimate.controlId;
    const zone = zoneClimate.zone;
    const climate = zoneClimate.controlObj;

    const timeToTempId = sysConfig.time_to_temp || c[`${unitKey}_time_to_temp`] || `sensor.hvac_time_to_temp_${zone}`;
    const healthStatusId = sysConfig.health_status || c[`${unitKey}_health_status`] || `sensor.hvac_health_status_${zone}`;
    const fanCircActiveId = sysConfig.fan_circ_active || c[`${unitKey}_fan_circ_active`] || `input_boolean.hvac_fan_circulation_active_${zone}`;
    const lastActivityId = sysConfig.last_activity || c[`${unitKey}_last_activity`] || `sensor.hvac_last_activity_${zone}`;
    const coastingBoolId = `input_boolean.hvac_${zone}_coasting`;

    const timeToTempObj = this._getEntity(timeToTempId);
    const healthStatusObj = this._getEntity(healthStatusId);
    const fanCircActiveObj = this._getEntity(fanCircActiveId);
    const lastActivityObj = this.hass?.states?.[lastActivityId] || null;
    const coastingBoolObj = this.hass?.states?.[coastingBoolId] || null;
    const filterMetrics = this._getZoneFilterMetrics(unitKey, sysConfig);
    const winState = this._getZoneWindowState(unitKey, sysConfig);
    const systemSensors = this._getSystemSensors(unitKey, sysConfig, climateId);

    const hvacAction = climate.attributes.hvac_action || climate.state || "idle";
    const currentTemp = zoneClimate.currentTemp !== null ? zoneClimate.currentTemp.toFixed(1) : "--";

    const mode = (climate.state || climate.attributes.hvac_mode || "").toLowerCase();
    const lowTarget = climate.attributes.target_temp_low;
    const highTarget = climate.attributes.target_temp_high;
    const targetRaw = climate.attributes.temperature ?? highTarget ?? lowTarget;
    let targetDisplay = "--";
    if ((mode === "heat_cool" || mode === "auto") && lowTarget != null && highTarget != null && !isNaN(parseFloat(lowTarget)) && !isNaN(parseFloat(highTarget))) {
      targetDisplay = `${Math.round(parseFloat(lowTarget))}–${Math.round(parseFloat(highTarget))}`;
    } else if (targetRaw !== undefined && targetRaw !== null && !isNaN(parseFloat(targetRaw))) {
      targetDisplay = `${Math.round(parseFloat(targetRaw))}`;
    }

    const humidity = zoneClimate.currentHumidity !== null ? Math.round(zoneClimate.currentHumidity) : "--";

    const timeToTempMins = (timeToTempObj && timeToTempObj.state && !isNaN(parseFloat(timeToTempObj.state)))
      ? Math.round(parseFloat(timeToTempObj.state))
      : 0;
    const timeToTargetStr = ((hvacAction === "cooling" || hvacAction === "heating") && timeToTempMins > 0)
      ? `~${timeToTempMins}m`
      : "";

    const healthState = (healthStatusObj && healthStatusObj.state && healthStatusObj.state !== "unavailable" && healthStatusObj.state !== "unknown")
      ? String(healthStatusObj.state)
      : "Optimal";
    const isHealthAlert = healthState !== "Optimal" && healthState !== "Healthy";
    const stallReason = healthStatusObj?.attributes?.stall_reason ? String(healthStatusObj.attributes.stall_reason) : "";
    const isFanCircActive = fanCircActiveObj && fanCircActiveObj.state === "on";
    const isCoasting = Boolean(
      hvacAction === "idle" &&
      ((lastActivityObj && lastActivityObj.attributes && lastActivityObj.attributes.is_coasting === true) ||
       (coastingBoolObj && coastingBoolObj.state === "on"))
    );
    const preConditionNeeded = Boolean(timeToTempObj && timeToTempObj.attributes && timeToTempObj.attributes.pre_condition_needed === true);
    const preConditionMode = timeToTempObj?.attributes?.pre_condition_mode ? String(timeToTempObj.attributes.pre_condition_mode) : "";
    const preConditionStart = timeToTempObj?.attributes?.pre_condition_start_time ? String(timeToTempObj.attributes.pre_condition_start_time) : "";

    let stateClass = "idle";
    let stateLabel = "Idle";
    let stateIcon = "mdi:hvac-off";
    let dynamicCardStyle = "";

    if (hvacAction === "cooling") {
      stateClass = "active-cool";
      stateLabel = "Cooling";
      stateIcon = "mdi:snowflake";
      dynamicCardStyle = "background: rgba(var(--rgb-info-color, 3, 169, 244), 0.10); border-color: rgba(var(--rgb-info-color, 3, 169, 244), 0.45); box-shadow: 0 3px 12px rgba(var(--rgb-info-color, 3, 169, 244), 0.14);";
    } else if (hvacAction === "heating") {
      stateClass = "active-heat";
      stateLabel = "Heating";
      stateIcon = "mdi:fire";
      dynamicCardStyle = "background: rgba(var(--rgb-warning-color, 255, 152, 0), 0.10); border-color: rgba(var(--rgb-warning-color, 255, 152, 0), 0.45); box-shadow: 0 3px 12px rgba(var(--rgb-warning-color, 255, 152, 0), 0.14);";
    } else if (hvacAction === "fan") {
      stateClass = "active-fan";
      stateLabel = "Fan Only";
      stateIcon = "mdi:fan";
      dynamicCardStyle = "background: rgba(var(--rgb-success-color, 76, 175, 80), 0.10); border-color: rgba(var(--rgb-success-color, 76, 175, 80), 0.45); box-shadow: 0 3px 12px rgba(var(--rgb-success-color, 76, 175, 80), 0.14);";
    } else if (mode === "cool") {
      stateClass = "idle-cool";
      stateLabel = "Cool (Idle)";
      stateIcon = "mdi:snowflake";
    } else if (mode === "heat") {
      stateClass = "idle-heat";
      stateLabel = "Heat (Idle)";
      stateIcon = "mdi:fire";
    } else if (mode === "auto" || mode === "heat_cool") {
      stateClass = "idle-auto";
      stateLabel = "Auto (Idle)";
      stateIcon = "mdi:theme-light-dark";
    } else if (mode === "off") {
      stateClass = "power-off";
      stateLabel = "Off";
      stateIcon = "mdi:power";
    }

    const unitTitle = sysConfig.name || sysConfig.title || climate.attributes?.friendly_name || title || "HVAC System";
    const hasSensors = !c.hide_sensors_on_card && !sysConfig.hide_sensors_on_card && systemSensors.length > 0;
    const defaultExpanded = sysConfig.sensors_start_expanded === true || c.sensors_start_expanded === true;
    const isExpanded = (this._expandedSensorUnits && this._expandedSensorUnits[unitKey] !== undefined)
      ? this._expandedSensorUnits[unitKey]
      : defaultExpanded;

    let tempRangeStr = "";
    if (hasSensors) {
      const validTemps = systemSensors
        .map((s) => (typeof s.temp === "number" ? s.temp : parseFloat(s.temp)))
        .filter((t) => !isNaN(t));
      if (validTemps.length > 0) {
        const minTemp = Math.min(...validTemps).toFixed(1);
        const maxTemp = Math.max(...validTemps).toFixed(1);
        tempRangeStr = (minTemp === maxTemp) ? `${minTemp}°` : `${minTemp}°–${maxTemp}°`;
      }
    }

    return html`
      <div
        class="hvac-unit-card ${stateClass}"
        style="${dynamicCardStyle}"
        @click=${() => this._showHvacModal(unitKey, "setpoints")}
        title="Tap to open controls & analytics for ${unitTitle}"
      >
        <div class="hvac-zone-header">
          <div class="hvac-zone-identity">
            <div class="hvac-zone-icon-wrap ${stateClass}">
              <ha-icon
                icon="${icon || stateIcon}"
                class="${stateClass === 'active-fan' ? 'hvac-spin-icon' : (stateClass.startsWith('active-') ? 'hvac-pulse-icon' : '')}"
              ></ha-icon>
            </div>
            <div class="hvac-zone-title-wrap">
              <div class="hvac-zone-title-row">
                <h3 class="hvac-zone-title">${unitTitle}</h3>
                ${isCoasting
                  ? html`<span class="zone-inline-chip info" title="Post-cycle thermal coast lockout active">Coasting</span>`
                  : ""}
                ${winState.openCount > 0
                  ? html`<span class="zone-inline-chip info" title="${winState.openCount} open window${winState.openCount === 1 ? '' : 's'} detected">${winState.openCount} Win Open</span>`
                  : winState.isDebouncing
                  ? html`<span class="zone-inline-chip neutral" title="Window sensor debouncing">Debounce</span>`
                  : ""}
                ${preConditionNeeded
                  ? html`<span class="zone-inline-chip ${preConditionMode === 'cool' ? 'info' : 'warning'}" title="Pre-conditioning recommended${preConditionStart ? ' @ ' + preConditionStart : ''}">Pre-${preConditionMode === 'cool' ? 'Cool' : 'Heat'}</span>`
                  : ""}
                ${filterMetrics.isAlert
                  ? html`
                      <span
                        class="zone-inline-chip ${filterMetrics.isExpired ? 'danger' : 'warning'} clickable"
                        @click=${(e) => { e.stopPropagation(); this._showHvacModal(unitKey, "filter"); }}
                        title="Air filter life ${filterMetrics.percentRemaining != null ? filterMetrics.percentRemaining + '%' : 'low'} — tap to manage"
                      >Filter ${filterMetrics.percentRemaining != null ? `${filterMetrics.percentRemaining}%` : "Low"}</span>
                    `
                  : ""}
                ${isHealthAlert
                  ? html`
                      <span
                        class="zone-inline-chip warning clickable"
                        @click=${(e) => { e.stopPropagation(); this._showMoreInfo(healthStatusId); }}
                        title="${stallReason ? `${healthState}: ${stallReason}` : healthState}"
                      >${healthState}</span>
                    `
                  : ""}
              </div>

              <div class="hvac-zone-subtitle">
                <span class="hvac-mode-inline ${stateClass}">
                  <ha-icon icon="${stateIcon}" class="${stateClass === 'active-fan' ? 'hvac-spin-icon' : ''}"></ha-icon>
                  <span>${stateLabel}${timeToTargetStr ? ` ${timeToTargetStr}` : ""}</span>
                </span>
                ${isFanCircActive
                  ? html`<ha-icon icon="mdi:fan" class="hvac-spin-icon inline-fan-icon" title="Fan Recirculation Active"></ha-icon>`
                  : ""}
                ${hasSensors && tempRangeStr
                  ? html`
                      <span class="hvac-subtitle-dot">•</span>
                      <button
                        type="button"
                        class="hvac-inline-range-btn ${isExpanded ? 'open' : ''}"
                        @click=${(e) => this._toggleSensorTray(e, unitKey)}
                        title="Tap to ${isExpanded ? 'hide' : 'view'} ${systemSensors.length} room sensors"
                      >
                        <span>${tempRangeStr}</span>
                        <ha-icon icon="${isExpanded ? 'mdi:chevron-up' : 'mdi:chevron-down'}"></ha-icon>
                      </button>
                    `
                  : ""}
              </div>
            </div>
          </div>

          <div class="hvac-zone-primary">
            <div class="hvac-zone-current-temp">${currentTemp}°</div>
            <div class="hvac-zone-target-row">
              <span class="hvac-target-val">Set ${targetDisplay}°</span>
              <span class="hvac-target-sep">•</span>
              <span class="hvac-humidity-inline">${humidity}%</span>
            </div>
          </div>
        </div>

        ${hasSensors && isExpanded
          ? html`
              <div class="hvac-sensor-tray-grid" @click=${(e) => e.stopPropagation()}>
                ${systemSensors.map(
                  (s) => html`
                    <div
                      class="hvac-room-mini-card ${s.isActive ? 'active' : ''}"
                      @click=${(e) => { e.stopPropagation(); this._showMoreInfo(s.entityId); }}
                      title="${s.name}: ${s.temp}${s.unit}${s.passiveRate ? ` (${s.passiveRate})` : ''} ${s.isLimiting ? '[Sleep Limiting Room]' : (s.isActive ? '(Active in comfort profile)' : '(Standby)')}"
                    >
                      <div class="room-mini-top">
                        <span class="room-mini-dot ${s.isActive ? 'active' : 'standby'}" style="${s.isLimiting ? 'background:#f59e0b;' : ''}"></span>
                        <span class="room-mini-name">${s.cleanName}</span>
                      </div>
                      <span class="room-mini-temp">${typeof s.temp === 'number' ? s.temp.toFixed(1) : s.temp}°</span>
                    </div>
                  `
                )}
              </div>
            `
          : ""}
      </div>
    `;
  }

  _renderPresetSetpointRow(label, heatEntityId, coolEntityId) {
    const heatObj = this._getEntity(heatEntityId);
    const coolObj = this._getEntity(coolEntityId);

    const hasHeat = heatObj && heatObj.state !== "unavailable" && heatObj.state !== "unknown";
    const hasCool = coolObj && coolObj.state !== "unavailable" && coolObj.state !== "unknown";

    if (!hasHeat && !hasCool) return html``;

    return html`
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; gap:8px;">
        <span class="control-label" style="font-size:0.85rem; font-weight:600; flex:1;">${label}</span>
        <div style="display:flex; gap:6px; align-items:center;">
          ${hasHeat
            ? html`
                <div class="step-controller-pill" style="padding:2px 8px;">
                  <ha-icon icon="mdi:fire" style="--mdc-icon-size:13px; color:#f97316; margin-right:2px;"></ha-icon>
                  <button class="pill-btn" style="padding:0 5px; font-size:1.1rem;" @click=${() => this._adjustNumberEntity(heatEntityId, -1)}>-</button>
                  <span class="pill-value" style="font-size:1rem; font-weight:700; min-width:28px; text-align:center; color:var(--primary-text-color);">${Math.round(parseFloat(heatObj.state))}°</span>
                  <button class="pill-btn" style="padding:0 5px; font-size:1.1rem;" @click=${() => this._adjustNumberEntity(heatEntityId, 1)}>+</button>
                </div>
              `
            : ""}
          ${hasCool
            ? html`
                <div class="step-controller-pill" style="padding:2px 8px;">
                  <ha-icon icon="mdi:snowflake" style="--mdc-icon-size:13px; color:#38bdf8; margin-right:2px;"></ha-icon>
                  <button class="pill-btn" style="padding:0 5px; font-size:1.1rem;" @click=${() => this._adjustNumberEntity(coolEntityId, -1)}>-</button>
                  <span class="pill-value" style="font-size:1rem; font-weight:700; min-width:28px; text-align:center; color:var(--primary-text-color);">${Math.round(parseFloat(coolObj.state))}°</span>
                  <button class="pill-btn" style="padding:0 5px; font-size:1.1rem;" @click=${() => this._adjustNumberEntity(coolEntityId, 1)}>+</button>
                </div>
              `
            : ""}
        </div>
      </div>
    `;
  }

  _formatShortDate(rawVal) {
    if (!rawVal) return "";
    const normalized = String(rawVal).trim().replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
    const d = new Date(normalized);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    }
    return String(rawVal);
  }

  _getProcessedHvacAnalytics({
    unitKey,
    cachedHistory,
    selectedDayIdx,
    selectedChunkIdxInput,
    stepMinutes,
    isHeatingSeason,
    liveCoolToday,
    liveHeatToday,
    liveOutdoorTemp,
    liveOutdoorTempStr,
    fallbackIndoor,
    fallbackSetpoint,
    coolDailySensorId,
    heatDailySensorId,
    coolTodaySensorId,
    heatTodaySensorId,
    outdoorTempId,
  }) {
    const fetchedAt = cachedHistory?.fetchedAt || 0;
    const memoKey = [
      unitKey,
      fetchedAt,
      selectedDayIdx,
      selectedChunkIdxInput ?? "latest",
      stepMinutes,
      isHeatingSeason ? 1 : 0,
      liveCoolToday,
      liveHeatToday,
      liveOutdoorTempStr,
      fallbackIndoor,
      fallbackSetpoint,
    ].join("|");

    if (this._analyticsMemo && this._analyticsMemo[unitKey]?.key === memoKey) {
      return this._analyticsMemo[unitKey].value;
    }

    const outdoorTimeline = cachedHistory ? cachedHistory.outdoorHistory : [];
    const climateTimeline = cachedHistory ? cachedHistory.climateHistory : [];
    const statisticsData = cachedHistory ? (cachedHistory.statisticsData || {}) : {};
    const outdoorHistory10d = cachedHistory ? (cachedHistory.outdoorHistory10d || []) : [];
    const climateHistory10d = cachedHistory ? (cachedHistory.climateHistory10d || []) : [];

    const normalizeState = (item) => {
      if (!item) return null;
      const state = item.state !== undefined ? item.state : item.s;
      const attributes = item.attributes !== undefined ? item.attributes : (item.a || {});
      let timeMs = 0;
      if (item.last_updated !== undefined) {
        timeMs = typeof item.last_updated === "number" ? (item.last_updated > 1e11 ? item.last_updated : item.last_updated * 1000) : new Date(item.last_updated).getTime();
      } else if (item.lu !== undefined) {
        timeMs = typeof item.lu === "number" ? (item.lu > 1e11 ? item.lu : item.lu * 1000) : new Date(item.lu).getTime();
      } else if (item.last_changed !== undefined) {
        timeMs = typeof item.last_changed === "number" ? (item.last_changed > 1e11 ? item.last_changed : item.last_changed * 1000) : new Date(item.last_changed).getTime();
      } else if (item.lc !== undefined) {
        timeMs = typeof item.lc === "number" ? (item.lc > 1e11 ? item.lc : item.lc * 1000) : new Date(item.lc).getTime();
      }
      return { state, attributes, timeMs };
    };

    let calculatedTodayAvgOutdoor = null;
    if (outdoorTimeline && outdoorTimeline.length > 0) {
      const validTemps = outdoorTimeline
        .map((s) => {
          if (s.attributes?.temperature !== undefined && s.attributes.temperature !== null && !isNaN(parseFloat(s.attributes.temperature))) {
            return parseFloat(s.attributes.temperature);
          }
          if (s.state && !isNaN(parseFloat(s.state))) {
            return parseFloat(s.state);
          }
          return null;
        })
        .filter((v) => v !== null && !isNaN(v));
      if (validTemps.length > 0) {
        calculatedTodayAvgOutdoor = (validTemps.reduce((acc, v) => acc + v, 0) / validTemps.length).toFixed(1);
      }
    }
    const todayOutdoorAvgStr = calculatedTodayAvgOutdoor || liveOutdoorTempStr;

    const getLocalDateKey = (ts) => {
      const d = ts instanceof Date ? ts : new Date(ts);
      if (isNaN(d.getTime())) return "";
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    const indexStatsByDate = (statArray) => {
      const map = {};
      if (!Array.isArray(statArray)) return map;
      statArray.forEach((s) => {
        if (!s || !s.start) return;
        const key = getLocalDateKey(s.start);
        if (key) map[key] = s;
      });
      return map;
    };

    const coolDailyMap = indexStatsByDate(statisticsData[coolDailySensorId]);
    const heatDailyMap = indexStatsByDate(statisticsData[heatDailySensorId]);
    const coolTodayMap = indexStatsByDate(statisticsData[coolTodaySensorId]);
    const heatTodayMap = indexStatsByDate(statisticsData[heatTodaySensorId]);
    const outdoorStatsMap = indexStatsByDate(statisticsData[outdoorTempId]);

    const outdoorHistoryByDate = {};
    (outdoorHistory10d || []).forEach((item) => {
      const norm = normalizeState(item);
      if (!norm || norm.timeMs === 0) return;
      const key = getLocalDateKey(norm.timeMs);
      let temp = null;
      if (norm.attributes?.temperature !== undefined && !isNaN(parseFloat(norm.attributes.temperature))) {
        temp = parseFloat(norm.attributes.temperature);
      } else if (norm.state !== undefined && !isNaN(parseFloat(norm.state))) {
        temp = parseFloat(norm.state);
      }
      if (temp !== null) {
        if (!outdoorHistoryByDate[key]) outdoorHistoryByDate[key] = [];
        outdoorHistoryByDate[key].push(temp);
      }
    });

    const climateDailyDurations = {};
    if (climateHistory10d && climateHistory10d.length > 0) {
      for (let idx = 0; idx < climateHistory10d.length; idx++) {
        const cur = normalizeState(climateHistory10d[idx]);
        if (!cur) continue;
        const nextTime = idx < climateHistory10d.length - 1 ? (normalizeState(climateHistory10d[idx + 1])?.timeMs || Date.now()) : Date.now();
        const durationHours = Math.max(0, (nextTime - cur.timeMs) / 3600000);
        const act = (cur.attributes?.hvac_action || cur.state || "").toLowerCase();
        const isCool = act === "cooling" || act === "cool";
        const isHeat = act === "heating" || act === "heat";
        if (isCool || isHeat) {
          const dateKey = getLocalDateKey(cur.timeMs);
          if (!climateDailyDurations[dateKey]) climateDailyDurations[dateKey] = { coolHours: 0, heatHours: 0 };
          if (isCool) climateDailyDurations[dateKey].coolHours += durationHours;
          if (isHeat) climateDailyDurations[dateKey].heatHours += durationHours;
        }
      }
    }

    const now = new Date();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const historyDataRaw = Array.from({ length: 10 }, (_, i) => {
      const daysAgo = 9 - i;
      const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 12, 0, 0);
      const dateKey = getLocalDateKey(targetDate);
      const dayNum = String(targetDate.getDate()).padStart(2, "0");
      const monthStr = monthNames[targetDate.getMonth()];
      const dayLabel = daysAgo === 0 ? "Today" : `${dayNum} ${monthStr}`;
      const cx = 45 + i * 28;
      let cool = 0.0;
      let heat = 0.0;
      let avgTemp = todayOutdoorAvgStr;

      if (daysAgo === 0) {
        cool = liveCoolToday;
        heat = liveHeatToday;
        avgTemp = todayOutdoorAvgStr;
      } else {
        const coolStat = coolDailyMap[dateKey] || coolTodayMap[dateKey];
        if (coolStat) {
          if (coolStat.change !== undefined && coolStat.change !== null && !isNaN(parseFloat(coolStat.change))) {
            cool = Math.max(0, parseFloat(coolStat.change));
          } else if (coolStat.state !== undefined && coolStat.state !== null && !isNaN(parseFloat(coolStat.state))) {
            cool = Math.max(0, parseFloat(coolStat.state));
          } else if (coolStat.max !== undefined && coolStat.max !== null && !isNaN(parseFloat(coolStat.max))) {
            cool = Math.max(0, parseFloat(coolStat.max));
          }
        } else if (climateDailyDurations[dateKey]) {
          cool = climateDailyDurations[dateKey].coolHours;
        }

        const heatStat = heatDailyMap[dateKey] || heatTodayMap[dateKey];
        if (heatStat) {
          if (heatStat.change !== undefined && heatStat.change !== null && !isNaN(parseFloat(heatStat.change))) {
            heat = Math.max(0, parseFloat(heatStat.change));
          } else if (heatStat.state !== undefined && heatStat.state !== null && !isNaN(parseFloat(heatStat.state))) {
            heat = Math.max(0, parseFloat(heatStat.state));
          } else if (heatStat.max !== undefined && heatStat.max !== null && !isNaN(parseFloat(heatStat.max))) {
            heat = Math.max(0, parseFloat(heatStat.max));
          }
        } else if (climateDailyDurations[dateKey]) {
          heat = climateDailyDurations[dateKey].heatHours;
        }

        const outStat = outdoorStatsMap[dateKey];
        if (outStat && outStat.mean !== undefined && outStat.mean !== null && !isNaN(parseFloat(outStat.mean))) {
          avgTemp = parseFloat(outStat.mean).toFixed(1);
        } else if (outdoorHistoryByDate[dateKey] && outdoorHistoryByDate[dateKey].length > 0) {
          const temps = outdoorHistoryByDate[dateKey];
          avgTemp = (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1);
        } else {
          avgTemp = todayOutdoorAvgStr;
        }
      }

      return {
        dayLabel,
        cool: parseFloat((cool || 0).toFixed(1)),
        heat: parseFloat((heat || 0).toFixed(1)),
        avgTemp,
        cx,
      };
    });

    const allRuntimes = historyDataRaw.map((d) => (isHeatingSeason ? parseFloat(d.heat) : parseFloat(d.cool)));
    const maxRecordedRuntime = Math.max(0, ...allRuntimes);
    let maxGridHours = 2.0;
    if (maxRecordedRuntime > 9.5) maxGridHours = Math.ceil((maxRecordedRuntime * 1.15) / 4) * 4;
    else if (maxRecordedRuntime > 7.5) maxGridHours = 10.0;
    else if (maxRecordedRuntime > 5.5) maxGridHours = 8.0;
    else if (maxRecordedRuntime > 3.5) maxGridHours = 6.0;
    else if (maxRecordedRuntime > 1.8) maxGridHours = 4.0;

    const maxTopStr = maxGridHours.toFixed(maxGridHours >= 10 ? 0 : 1);
    const runtimeYLabels = isHeatingSeason
      ? { top: "0.0", midHigh: (maxGridHours * 0.25).toFixed(1), mid: (maxGridHours * 0.5).toFixed(1), midLow: (maxGridHours * 0.75).toFixed(1), bottom: maxTopStr }
      : { top: maxTopStr, midHigh: (maxGridHours * 0.75).toFixed(1), mid: (maxGridHours * 0.5).toFixed(1), midLow: (maxGridHours * 0.25).toFixed(1), bottom: "0.0" };

    const barTemps = historyDataRaw.map((d) => parseFloat(d.avgTemp)).filter((t) => !isNaN(t));
    const minBarTemp = barTemps.length > 0 ? Math.floor(Math.min(...barTemps) - 2) : 60;
    const maxBarTemp = barTemps.length > 0 ? Math.ceil(Math.max(...barTemps) + 2) : 90;
    const barTempSpan = Math.max(1, maxBarTemp - minBarTemp);

    const calcBarY = (tempVal) => {
      const v = Math.max(minBarTemp, Math.min(maxBarTemp, parseFloat(tempVal) || minBarTemp));
      return 160 - ((v - minBarTemp) / barTempSpan) * 140;
    };

    const historyData = historyDataRaw.map((d) => ({ ...d, cy: calcBarY(d.avgTemp) }));
    const activeDay = historyData[selectedDayIdx] || historyData[9];
    const barYGridLabels = {
      top: `${maxBarTemp}`,
      midHigh: `${Math.round(minBarTemp + barTempSpan * 0.75)}`,
      mid: `${Math.round(minBarTemp + barTempSpan * 0.5)}`,
      midLow: `${Math.round(minBarTemp + barTempSpan * 0.25)}`,
      bottom: `${minBarTemp}`,
    };

    const buildSmoothPath = (pts) => {
      if (!pts || pts.length === 0) return "";
      if (pts.length === 1) return `M ${pts[0].cx} ${pts[0].cy}`;
      let d = `M ${pts[0].cx.toFixed(1)} ${pts[0].cy.toFixed(1)}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];
        const cp1x = p1.cx + (p2.cx - p0.cx) / 6;
        const cp1y = p1.cy + (p2.cy - p0.cy) / 6;
        const cp2x = p2.cx - (p3.cx - p1.cx) / 6;
        const cp2y = p2.cy - (p3.cy - p1.cy) / 6;
        d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.cx.toFixed(1)} ${p2.cy.toFixed(1)}`;
      }
      return d;
    };
    const multiDayPathString = buildSmoothPath(historyData);

    const endTimeMs = cachedHistory ? cachedHistory.endTime : Date.now();
    const startTimeMs = cachedHistory ? cachedHistory.startTime : endTimeMs - 24 * 3600 * 1000;
    const totalChunks = Math.max(1, Math.floor((24 * 60) / stepMinutes));
    const selectedChunkIdx = selectedChunkIdxInput !== undefined && selectedChunkIdxInput !== null
      ? Math.min(totalChunks - 1, selectedChunkIdxInput)
      : totalChunks - 1;

    const getStateAt = (timeline, targetMs) => {
      if (!timeline || timeline.length === 0) return null;
      let active = null;
      for (let i = 0; i < timeline.length; i++) {
        const norm = normalizeState(timeline[i]);
        if (norm && norm.timeMs <= targetMs) {
          active = norm;
        } else if (norm && norm.timeMs > targetMs) {
          break;
        }
      }
      return active || normalizeState(timeline[0]);
    };

    const fallbackOutdoor = liveOutdoorTemp !== null ? liveOutdoorTemp : 72;
    const rawTimelineData = Array.from({ length: totalChunks }, (_, idx) => {
      const cx = 30 + (idx / Math.max(1, totalChunks - 1)) * 280;
      const pointTimeMs = startTimeMs + (idx / Math.max(1, totalChunks - 1)) * (24 * 3600 * 1000);
      const pointDate = new Date(pointTimeMs);
      const hours = pointDate.getHours();
      const mins = pointDate.getMinutes();
      const displayHour = hours % 12 === 0 ? 12 : hours % 12;
      const ampm = hours < 12 ? "AM" : "PM";
      const timeLabel = `${displayHour}:${String(mins).padStart(2, "0")} ${ampm}`;

      let indoorTemp = fallbackIndoor;
      let setpoint = fallbackSetpoint;
      let outdoorTemp = fallbackOutdoor;
      let isActive = false;

      if (climateTimeline.length > 0) {
        const cState = getStateAt(climateTimeline, pointTimeMs);
        if (cState && cState.attributes) {
          const attrs = cState.attributes;
          if (attrs.current_temperature !== undefined && attrs.current_temperature !== null) {
            indoorTemp = parseFloat(attrs.current_temperature);
          }
          if (attrs.temperature !== undefined && attrs.temperature !== null) {
            setpoint = parseFloat(attrs.temperature);
          } else if (attrs.target_temp_low !== undefined && attrs.target_temp_low !== null) {
            setpoint = parseFloat(attrs.target_temp_low);
          } else if (attrs.target_temp_high !== undefined && attrs.target_temp_high !== null) {
            setpoint = parseFloat(attrs.target_temp_high);
          }
          const act = (attrs.hvac_action || "").toLowerCase();
          const st = (cState.state || "").toLowerCase();
          if (act === "cooling" || act === "heating") isActive = true;
          else if (act === "idle" || act === "off") isActive = false;
          else if (st === "cool" || st === "cooling") isActive = parseFloat(indoorTemp) > parseFloat(setpoint) + 0.1;
          else if (st === "heat" || st === "heating") isActive = parseFloat(indoorTemp) < parseFloat(setpoint) - 0.1;
          else if (st === "auto" || st === "heat_cool") {
            isActive = parseFloat(indoorTemp) > parseFloat(setpoint) + 0.1 || parseFloat(indoorTemp) < parseFloat(setpoint) - 0.1;
          }
        }
      }

      if (outdoorTimeline.length > 0) {
        const oState = getStateAt(outdoorTimeline, pointTimeMs);
        if (oState) {
          const attrs = oState.attributes || {};
          if (attrs.temperature !== undefined && attrs.temperature !== null && !isNaN(parseFloat(attrs.temperature))) {
            outdoorTemp = parseFloat(attrs.temperature);
          } else if (oState.state !== undefined && oState.state !== null && !isNaN(parseFloat(oState.state))) {
            outdoorTemp = parseFloat(oState.state);
          }
        }
      }

      return {
        idx,
        pointTimeMs,
        timeLabel,
        indoorTemp: parseFloat(indoorTemp).toFixed(1),
        setpoint: parseFloat(setpoint).toFixed(1),
        outdoorTemp: parseFloat(outdoorTemp).toFixed(1),
        isActive,
        cx,
      };
    });

    const allTemps = rawTimelineData.flatMap((pt) => [parseFloat(pt.indoorTemp), parseFloat(pt.setpoint), parseFloat(pt.outdoorTemp)]);
    const minGridTemp = Math.floor(Math.min(...allTemps) - 2);
    const maxGridTemp = Math.ceil(Math.max(...allTemps) + 2);
    const tempSpan = Math.max(1, maxGridTemp - minGridTemp);
    const calcTimelineY = (tempVal) => {
      const v = Math.max(minGridTemp, Math.min(maxGridTemp, parseFloat(tempVal) || minGridTemp));
      return 140 - ((v - minGridTemp) / tempSpan) * 120;
    };

    const timelineData = rawTimelineData.map((pt) => ({
      ...pt,
      indoorY: calcTimelineY(pt.indoorTemp),
      setpointY: calcTimelineY(pt.setpoint),
      outdoorY: calcTimelineY(pt.outdoorTemp),
    }));

    const activeHourData = timelineData[selectedChunkIdx] || timelineData[timelineData.length - 1];
    let activeRunRangeStr = "";
    if (activeHourData && activeHourData.isActive && timelineData.length > 0) {
      let startIdx = selectedChunkIdx;
      while (startIdx > 0 && timelineData[startIdx - 1]?.isActive) startIdx--;
      let endIdx = selectedChunkIdx;
      while (endIdx < timelineData.length - 1 && timelineData[endIdx + 1]?.isActive) endIdx++;
      const durMins = (endIdx - startIdx + 1) * stepMinutes;
      const formatTimeShort = (labelStr) => {
        if (!labelStr) return "";
        const m = labelStr.match(/(\d+:\d+\s*(?:AM|PM))/i);
        return m ? m[1] : labelStr;
      };
      const durStr = durMins >= 60 ? (durMins % 60 > 0 ? `${Math.floor(durMins / 60)}h ${durMins % 60}m` : `${Math.floor(durMins / 60)}h`) : `${durMins}m`;
      const sStr = formatTimeShort(timelineData[startIdx].timeLabel);
      const eStr = formatTimeShort(timelineData[endIdx].timeLabel);
      activeRunRangeStr = sStr === eStr ? `${sStr} (${durStr})` : `${sStr} - ${eStr} (${durStr})`;
    }

    const ttWidth = activeRunRangeStr ? 144 : 126;
    const ttHeight = activeRunRangeStr ? 54 : 44;
    let ttX = activeHourData.cx > 170 ? activeHourData.cx - ttWidth - 10 : activeHourData.cx + 10;
    ttX = Math.max(10, Math.min(340 - ttWidth - 10, ttX));
    const minLineY = Math.min(activeHourData.indoorY, activeHourData.setpointY, activeHourData.outdoorY);
    const maxLineY = Math.max(activeHourData.indoorY, activeHourData.setpointY, activeHourData.outdoorY);
    let ttY;
    if (minLineY > ttHeight + 15) ttY = Math.max(10, minLineY - ttHeight - 6);
    else if (maxLineY < 140 - ttHeight - 6) ttY = Math.min(140 - ttHeight, maxLineY + 6);
    else ttY = activeHourData.indoorY > 80 ? 12 : 90;

    const yGridLabels = {
      top: `${maxGridTemp}°`,
      midHigh: `${Math.round(minGridTemp + tempSpan * 0.75)}°`,
      mid: `${Math.round(minGridTemp + tempSpan * 0.5)}°`,
      midLow: `${Math.round(minGridTemp + tempSpan * 0.25)}°`,
      bottom: `${minGridTemp}°`,
    };

    const activeBands = [];
    let currentBandStart = null;
    let currentBandEnd = null;
    const chunkWidth = totalChunks > 1 ? 280 / (totalChunks - 1) : 10;
    timelineData.forEach((pt) => {
      if (pt.isActive) {
        const xStart = Math.max(30, pt.cx - chunkWidth / 2);
        const xEnd = Math.min(310, pt.cx + chunkWidth / 2);
        if (currentBandStart === null) {
          currentBandStart = xStart;
          currentBandEnd = xEnd;
        } else {
          currentBandEnd = xEnd;
        }
      } else if (currentBandStart !== null) {
        activeBands.push({ x: currentBandStart, width: Math.max(3, currentBandEnd - currentBandStart) });
        currentBandStart = null;
        currentBandEnd = null;
      }
    });
    if (currentBandStart !== null) {
      activeBands.push({ x: currentBandStart, width: Math.max(3, currentBandEnd - currentBandStart) });
    }
    const activeBandsPath = activeBands.map((b) => `M ${b.x.toFixed(1)} 20 H ${(b.x + b.width).toFixed(1)} V 140 H ${b.x.toFixed(1)} Z`).join(" ");

    const xLabels = timelineData.length > 0
      ? Array.from({ length: 7 }, (_, i) => timelineData[Math.min(timelineData.length - 1, Math.floor((i * (timelineData.length - 1)) / 6))]).filter(Boolean)
      : [];

    const result = {
      historyData,
      activeDay,
      maxGridHours,
      runtimeYLabels,
      barYGridLabels,
      multiDayPathString,
      timelineData,
      selectedChunkIdx,
      activeHourData,
      activeRunRangeStr,
      ttX,
      ttY,
      yGridLabels,
      activeBandsPath,
      xLabels,
      indoorPathString: "M " + timelineData.map((pt) => `${pt.cx.toFixed(1)} ${pt.indoorY.toFixed(1)}`).join(" L "),
      setpointPathString: "M " + timelineData.map((pt) => `${pt.cx.toFixed(1)} ${pt.setpointY.toFixed(1)}`).join(" L "),
      outdoorPathString: "M " + timelineData.map((pt) => `${pt.cx.toFixed(1)} ${pt.outdoorY.toFixed(1)}`).join(" L "),
    };

    if (!this._analyticsMemo) this._analyticsMemo = {};
    this._analyticsMemo[unitKey] = { key: memoKey, value: result };
    return result;
  }

  _renderComfortStepperRow(label, icon, entityId, step, unit, iconColor = "var(--primary-color)") {
    const obj = this._getEntity(entityId);
    if (!obj || obj.state === "unavailable" || obj.state === "unknown") return html``;
    const rawVal = parseFloat(obj.state);
    const valStr = !isNaN(rawVal) ? (step < 1 ? rawVal.toFixed(1) : Math.round(rawVal)) : obj.state;
    return html`
      <div class="control-row comfort-stepper-row">
        <div class="control-label-group">
          <ha-icon icon="${icon}" style="color:${iconColor};"></ha-icon>
          <span class="control-label">${label}</span>
        </div>
        <div class="step-controller-pill">
          <button class="pill-btn" @click=${() => this._adjustNumberEntity(entityId, -step)}>-</button>
          <span class="pill-value" @click=${() => this._showMoreInfo(entityId)} style="cursor:pointer;">${valStr}${unit}</span>
          <button class="pill-btn" @click=${() => this._adjustNumberEntity(entityId, step)}>+</button>
        </div>
      </div>
    `;
  }

  _parseSimulationTrajectory(simDataObj, zone, unitTitle = "") {
    const empty = { points: [], scopeLabel: "", isZoneSpecific: false };
    const rawSimJson = simDataObj?.attributes?.data;
    if (typeof rawSimJson !== "string" || !rawSimJson.trim()) {
      return empty;
    }

    let parsed;
    try {
      parsed = JSON.parse(rawSimJson);
    } catch (e) {
      return empty;
    }

    const normalizePoints = (arr) => {
      if (!Array.isArray(arr)) return [];
      return arr
        .map((pt, i) => {
          if (!pt || typeof pt !== "object") return null;
          const t = parseFloat(pt.temp ?? pt.indoor_temp ?? pt.temperature);
          const h = parseFloat(pt.humidity ?? pt.rh);
          return isNaN(t) ? null : { idx: i, temp: t, humidity: isNaN(h) ? null : h };
        })
        .filter(Boolean);
    };

    const zoneKey = typeof zone === "string" ? zone.trim().toLowerCase() : "";
    const zoneRaw = zoneKey && parsed && typeof parsed === "object" && parsed.zones && typeof parsed.zones === "object"
      ? parsed.zones[zoneKey]
      : null;
    const zonePoints = normalizePoints(zoneRaw);
    if (zonePoints.length >= 2) {
      const cleanZoneTitle = (unitTitle ? String(unitTitle).split("&")[0].trim() : "")
        || (zoneKey ? zoneKey.charAt(0).toUpperCase() + zoneKey.slice(1) : "");
      return {
        points: zonePoints,
        scopeLabel: cleanZoneTitle,
        isZoneSpecific: true,
      };
    }

    const fallbackRaw = Array.isArray(parsed)
      ? parsed
      : (Array.isArray(parsed?.plan) ? parsed.plan : (Array.isArray(parsed?.trajectory) ? parsed.trajectory : []));
    const fallbackPoints = normalizePoints(fallbackRaw);
    return {
      points: fallbackPoints,
      scopeLabel: fallbackPoints.length >= 2 ? "Whole House" : "",
      isZoneSpecific: false,
    };
  }

  _buildZoneClimateOutlook({
    zone,
    unitTitle,
    advisorRecObj,
    zoneRateObj,
    simPoints = [],
    winReason = "",
    timeToTempObj = null,
  }) {
    const serverZoneSummary = advisorRecObj?.attributes?.zone_outlook_summaries?.[zone];
    const serverDailySummary = advisorRecObj?.attributes?.daily_outlook_summary;
    const rawServerText = typeof serverZoneSummary === "string" && serverZoneSummary.trim()
      ? serverZoneSummary.trim()
      : (typeof serverDailySummary === "string" && serverDailySummary.trim() ? serverDailySummary.trim() : "");

    const tttAttrs = timeToTempObj?.attributes || {};
    const hvacAction = String(tttAttrs.hvac_action || "").toLowerCase();
    const rawEta = tttAttrs.formatted ? String(tttAttrs.formatted).trim() : "";
    const etaFormatted = rawEta && !["idle", "unavailable", "unknown", "none"].includes(rawEta.toLowerCase()) ? rawEta : "";
    const rawEtaMins = timeToTempObj && !isNaN(parseFloat(timeToTempObj.state)) ? Math.round(parseFloat(timeToTempObj.state)) : null;

    const currTemp = tttAttrs.current_temperature != null && !isNaN(parseFloat(tttAttrs.current_temperature))
      ? parseFloat(tttAttrs.current_temperature)
      : null;
    const targetTemp = tttAttrs.target_temperature != null && !isNaN(parseFloat(tttAttrs.target_temperature))
      ? parseFloat(tttAttrs.target_temperature)
      : null;

    const nextMode = tttAttrs.next_hvac_cycle_mode ? String(tttAttrs.next_hvac_cycle_mode).toLowerCase() : "";
    const nextTime = tttAttrs.next_hvac_cycle_time ? String(tttAttrs.next_hvac_cycle_time).trim() : "";
    const nextMins = tttAttrs.next_hvac_cycle_minutes != null && !isNaN(parseFloat(tttAttrs.next_hvac_cycle_minutes))
      ? Math.round(parseFloat(tttAttrs.next_hvac_cycle_minutes))
      : null;
    const nextTrigger = tttAttrs.next_hvac_trigger_temp != null && !isNaN(parseFloat(tttAttrs.next_hvac_trigger_temp))
      ? parseFloat(tttAttrs.next_hvac_trigger_temp)
      : null;

    const chips = [];
    let cycleSentence = "";
    if (hvacAction === "heating" || hvacAction === "cooling") {
      const actionVerb = hvacAction === "heating" ? "Heating" : "Cooling";
      const etaSuffix = etaFormatted ? ` (${etaFormatted})` : (rawEtaMins && rawEtaMins > 0 ? ` (~${rawEtaMins}m)` : "");
      chips.push({
        icon: hvacAction === "heating" ? "mdi:fire" : "mdi:snowflake",
        text: `${actionVerb}${etaSuffix}`,
        tone: hvacAction === "heating" ? "warm" : "cool",
      });
      const tempPhrase = currTemp !== null ? ` (${currTemp.toFixed(1)}°F` + (targetTemp !== null ? ` → ${targetTemp.toFixed(1)}°F)` : ")") : "";
      cycleSentence = `${unitTitle}${tempPhrase} is actively ${hvacAction}${etaSuffix}.`;
    } else if (tttAttrs.pre_condition_needed && tttAttrs.pre_condition_start_time) {
      const preMode = String(tttAttrs.pre_condition_mode || "condition").toLowerCase();
      chips.push({
        icon: "mdi:clock-start",
        text: `Pre-${preMode} @ ${tttAttrs.pre_condition_start_time}`,
        tone: preMode === "heat" ? "warm" : "cool",
      });
      cycleSentence = `${unitTitle}${currTemp !== null ? ` is ${currTemp.toFixed(1)}°F` : ""}; pre-${preMode} starts at ${tttAttrs.pre_condition_start_time}.`;
    } else if (nextTime) {
      const modeName = nextMode === "heat" ? "heat" : (nextMode === "cool" ? "cool" : "cycle");
      const minsPart = nextMins !== null ? ` (~${nextMins}m)` : "";
      chips.push({
        icon: nextMode === "heat" ? "mdi:fire-circle" : (nextMode === "cool" ? "mdi:snowflake-variant" : "mdi:clock-fast"),
        text: `Next ${modeName} ${nextTime}${minsPart}`,
        tone: nextMode === "heat" ? "warm" : (nextMode === "cool" ? "cool" : "neutral"),
      });
      const tempStr = currTemp !== null ? ` is ${currTemp.toFixed(1)}°F` : "";
      const trigStr = nextTrigger !== null ? ` at ${nextTrigger.toFixed(1)}°F` : "";
      cycleSentence = `${unitTitle}${tempStr}; next ${modeName} expected around ${nextTime}${minsPart}${trigStr}.`;
    } else {
      chips.push({
        icon: "mdi:check-circle-outline",
        text: "Holding steady",
        tone: "neutral",
      });
      cycleSentence = `${unitTitle}${currTemp !== null ? ` is holding steady near ${currTemp.toFixed(1)}°F` : " is holding steady"}.`;
    }

    let driftSentence = "";
    if (simPoints.length >= 2) {
      const startPt = simPoints[0];
      const endPt = simPoints[simPoints.length - 1];
      const deltaT = endPt.temp - startPt.temp;
      const horizonHrs = simPoints.length;
      chips.push({
        icon: deltaT >= 0 ? "mdi:trending-up" : "mdi:trending-down",
        text: `${horizonHrs}h: ${startPt.temp.toFixed(1)}° → ${endPt.temp.toFixed(1)}° (${deltaT >= 0 ? "+" : ""}${deltaT.toFixed(1)}°)`,
        tone: "neutral",
      });

      let rhPart = "";
      if (startPt.humidity != null && endPt.humidity != null) {
        const deltaH = Math.round(endPt.humidity - startPt.humidity);
        chips.push({
          icon: "mdi:water-percent",
          text: `RH ${Math.round(startPt.humidity)}% → ${Math.round(endPt.humidity)}% (${deltaH >= 0 ? "+" : ""}${deltaH}%)`,
          tone: "rh",
        });
        rhPart = deltaH === 0
          ? `, RH steady near ${Math.round(endPt.humidity)}%`
          : `, RH ${deltaH > 0 ? "rising" : "easing"} to ${Math.round(endPt.humidity)}%`;
      }

      const outObj = this._getEntity("sensor.outside_temperature") || this._getEntity("sensor.outdoor_temperature");
      const outTempVal = outObj && !isNaN(parseFloat(outObj.state)) ? Math.round(parseFloat(outObj.state)) : null;
      const outPart = outTempVal !== null ? ` with ${outTempVal}°F outside` : "";
      const driftVerb = Math.abs(deltaT) < 0.4 ? "stays nearly flat near" : (deltaT > 0 ? "warms passively toward" : "drifts gently toward");
      driftSentence = `Passive ${horizonHrs}h outlook ${driftVerb} ${endPt.temp.toFixed(1)}°F (${deltaT >= 0 ? "+" : ""}${deltaT.toFixed(1)}°F)${rhPart}${outPart}.`;
    } else if (zoneRateObj && zoneRateObj.state && !isNaN(parseFloat(zoneRateObj.state))) {
      const rateVal = parseFloat(zoneRateObj.state);
      chips.push({
        icon: rateVal >= 0 ? "mdi:trending-up" : "mdi:trending-down",
        text: `Drift ${rateVal >= 0 ? "+" : ""}${rateVal.toFixed(2)}°/h`,
        tone: "neutral",
      });
    }

    const fallbackSummary = rawServerText || [cycleSentence, driftSentence || winReason].filter(Boolean).join(" ");
    return {
      summaryText: fallbackSummary,
      badgeText: rawServerText ? "Physics AI • 15m" : "Live Physics",
      chips,
    };
  }

  _renderAdvisorTabContent({
    unitKey,
    zone,
    unitTitle,
    advisorRecObj,
    zoneRateObj,
    activeModelSource,
    complianceSummary,
    hasLearnedSwingCoast,
    learnedSwing,
    learnedCoastMag,
    hasHeatPrediction,
    predictionMsgObj,
    profileObj,
    overrideObj,
  }) {
    const winMeta = this._formatWindowAdvisorLabel(advisorRecObj?.state);
    let winReason = advisorRecObj?.attributes?.reason || advisorRecObj?.attributes?.recommended_action || "";
    const rawDetails = advisorRecObj?.attributes?.details;
    if (!winReason && typeof rawDetails === "string" && rawDetails.trim()) {
      const detailLines = rawDetails
        .split(/\r?\n/)
        .map((l) => l.replace(/\*\*/g, "").trim())
        .filter((l) => l && !/^Action Plan as of/i.test(l));
      const zoneRegex = zone === "downstairs" ? /^Downstairs:\s*/i : /^Upstairs:\s*/i;
      const zoneLine = detailLines.find((l) => zoneRegex.test(l));
      const wholeLine = detailLines.find((l) => /^Whole House:\s*/i.test(l));
      const pickedLine = zoneLine || wholeLine || detailLines.find((l) => !/^(Pre-Conditioning|\(|Note:)/i.test(l)) || detailLines[0];
      if (pickedLine) {
        winReason = pickedLine.replace(/^(Upstairs|Downstairs|Whole House):\s*/i, "").trim();
      }
    }
    if (!winReason) {
      winReason = advisorRecObj?.attributes?.phase || "";
    }
    const outEnthalpyObj = this._getEntity("sensor.outdoor_specific_enthalpy");
    const zoneEnthalpyDeltaObj = this._getEntity(`sensor.${zone}_enthalpy_delta`);
    const zoneAhObj = this._getEntity(`sensor.${zone}_absolute_humidity`);
    const outAhObj = this._getEntity("sensor.outside_absolute_humidity");
    const modelAccuracyObj = this._getEntity("sensor.passable_climate_model_accuracy");
    const complianceSensorObj = this._getEntity("sensor.passable_climate_14d_comfort_compliance");
    const simDataObj = this._getEntity("sensor.advisor_simulation_data");

    const fmtNum = (obj, decimals = 1, unit = "") => {
      if (!obj || obj.state === "unavailable" || obj.state === "unknown" || isNaN(parseFloat(obj.state))) return "--";
      return `${parseFloat(obj.state).toFixed(decimals)}${unit ? ` ${unit}` : ""}`;
    };

    const timeToTempObj = this._getEntity(`sensor.hvac_time_to_temp_${zone}`);
    const predictionText = (predictionMsgObj && predictionMsgObj.state && predictionMsgObj.state !== "unavailable" && predictionMsgObj.state !== "unknown")
      ? String(predictionMsgObj.state).trim()
      : "";
    const showPredictionBanner = Boolean(hasHeatPrediction || advisorRecObj?.attributes?.heat_prediction_alert);

    // Parse zone-specific trajectory points from sensor.advisor_simulation_data (with whole-house fallback)
    const simParsed = this._parseSimulationTrajectory(simDataObj, zone, unitTitle);
    const simPoints = simParsed.points;
    const simScopeLabel = simParsed.scopeLabel;

    const tempMinObj = this._getEntity("number.passable_climate_comfort_temp_min");
    const tempMaxObj = this._getEntity("number.passable_climate_comfort_temp_max");
    const bandMin = !isNaN(parseFloat(tempMinObj?.state)) ? parseFloat(tempMinObj.state) : null;
    const bandMax = !isNaN(parseFloat(tempMaxObj?.state)) ? parseFloat(tempMaxObj.state) : null;

    const transOffsetId = this.config?.hvac_transition_offset_entity || "input_number.hvac_transition_offset";
    const transOffsetObj = this._getEntity(transOffsetId);
    const hasTransOffset = Boolean(transOffsetObj && transOffsetObj.state !== "unavailable" && transOffsetObj.state !== "unknown");
    const transStepAttr = parseFloat(transOffsetObj?.attributes?.step);
    const transStep = !isNaN(transStepAttr) && transStepAttr > 0 ? transStepAttr : 0.5;
    const transUnit = transOffsetObj?.attributes?.unit_of_measurement || "°F";
    const transVal = parseFloat(transOffsetObj?.state);
    const transSubtext = (!isNaN(transVal) && bandMin !== null && bandMax !== null)
      ? `Mode-switch buffer outside comfort limits (Cool → Heat < ${(bandMin - transVal).toFixed(1)}${transUnit} • Heat → Cool > ${(bandMax + transVal).toFixed(1)}${transUnit})`
      : "Mode-switch hysteresis buffer preventing rapid Heat ↔ Cool transitions.";

    let complianceText = "N/A";
    if (complianceSensorObj && complianceSensorObj.state !== "unavailable" && complianceSensorObj.state !== "unknown" && !isNaN(parseFloat(complianceSensorObj.state))) {
      complianceText = `${Math.round(parseFloat(complianceSensorObj.state))}%`;
    } else if (complianceSummary && typeof complianceSummary === "object" && complianceSummary.overall_compliance_pct != null) {
      complianceText = `${Math.round(parseFloat(complianceSummary.overall_compliance_pct))}%`;
    } else if (typeof complianceSummary === "string") {
      const m = complianceSummary.match(/\((\d+(?:\.\d+)?)%\)/);
      if (m) complianceText = `${Math.round(parseFloat(m[1]))}%`;
    }

    let simSvgHtml = html`
      <div class="advisor-empty-sim">
        No active trajectory simulation points yet. Tap <strong>Refresh</strong> to sample.
      </div>
    `;

    if (simPoints.length >= 2) {
      const plotLeft = 32;
      const plotRight = 304;
      const plotWidth = plotRight - plotLeft;
      const yGridPositions = [24, 48, 72, 96, 120];

      const temps = simPoints.map((p) => p.temp);
      if (bandMin !== null) temps.push(bandMin);
      if (bandMax !== null) temps.push(bandMax);
      const rawMin = Math.floor(Math.min(...temps) - 0.5);
      const rawMax = Math.ceil(Math.max(...temps) + 0.5);
      const stepT = Math.max(1, Math.ceil((rawMax - rawMin) / 4));
      const yMin = rawMin;
      const yMax = yMin + stepT * 4;
      const ySpan = Math.max(1, yMax - yMin);
      const toX = (i) => plotLeft + (i / Math.max(1, simPoints.length - 1)) * plotWidth;
      const toY = (t) => 120 - ((t - yMin) / ySpan) * 96;

      const tempTicks = yGridPositions.map((y, idx) => ({
        y,
        label: `${yMax - idx * stepT}°`,
      }));

      const tempPath = "M " + simPoints.map((p, i) => `${toX(i).toFixed(1)} ${toY(p.temp).toFixed(1)}`).join(" L ");
      const hasHum = simPoints.every((p) => p.humidity !== null);
      let humPath = "";
      let humTicks = [];
      if (hasHum) {
        const hums = simPoints.map((p) => p.humidity);
        const rawHMin = Math.max(0, Math.floor(Math.min(...hums) - 2));
        const rawHMax = Math.min(100, Math.ceil(Math.max(...hums) + 2));
        const stepH = Math.max(1, Math.ceil((rawHMax - rawHMin) / 4));
        const hMax = Math.min(100, rawHMin + stepH * 4);
        const hMin = Math.max(0, hMax - stepH * 4);
        const hSpan = Math.max(1, hMax - hMin);
        const toHY = (h) => 120 - ((h - hMin) / hSpan) * 96;
        humPath = "M " + simPoints.map((p, i) => `${toX(i).toFixed(1)} ${toHY(p.humidity).toFixed(1)}`).join(" L ");
        humTicks = yGridPositions.map((y, idx) => ({
          y,
          label: `${hMax - idx * stepH}%`,
        }));
      }

      const baseSimTimeMs = simDataObj?.state && !isNaN(Date.parse(simDataObj.state))
        ? Date.parse(simDataObj.state)
        : Date.now();
      const formatClockHour = (stepIdx) => {
        const dt = new Date(baseSimTimeMs + (stepIdx + 1) * 3600000);
        const hr24 = dt.getHours();
        const hr12 = hr24 % 12 || 12;
        return `${hr12}${hr24 < 12 ? "a" : "p"}`;
      };
      const tickIndices = [...new Set(
        [0, 1, 2, 3, 4].map((k) => Math.round((k * (simPoints.length - 1)) / 4))
      )];
      const xAxisTicks = tickIndices.map((idx) => ({
        x: toX(idx),
        horizon: `+${idx + 1}h`,
        clock: formatClockHour(idx),
      }));

      const startPt = simPoints[0];
      const endPt = simPoints[simPoints.length - 1];
      const deltaT = endPt.temp - startPt.temp;
      const bandTopY = bandMax !== null ? Math.max(24, Math.min(120, toY(bandMax))) : null;
      const bandBotY = bandMin !== null ? Math.max(24, Math.min(120, toY(bandMin))) : null;

      simSvgHtml = html`
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.72rem; margin-bottom:6px; color:var(--secondary-text-color);">
          <span>Start <strong style="color:var(--primary-text-color);">${startPt.temp.toFixed(1)}°F</strong> → Horizon <strong style="color:${deltaT >= 0 ? '#fb923c' : '#38bdf8'};">${endPt.temp.toFixed(1)}°F</strong> (${deltaT >= 0 ? "+" : ""}${deltaT.toFixed(1)}°)</span>
          <span style="display:flex; align-items:center; gap:8px;">
            <span style="display:inline-flex; align-items:center; gap:3px;"><span style="width:8px; height:2px; background:#38bdf8; display:inline-block;"></span>Temp</span>
            ${hasHum ? html`<span style="display:inline-flex; align-items:center; gap:3px;"><span style="width:8px; height:2px; background:#a855f7; display:inline-block;"></span>RH</span>` : ""}
          </span>
        </div>
        <div style="width:100%; aspect-ratio: 2.18 / 1;">
          <svg viewBox="0 0 340 156" style="width:100%; height:100%; overflow:visible;">
            <text x="4" y="11" fill="#38bdf8" font-size="9.5" font-weight="700">Temp (°F)</text>
            ${hasHum ? svg`<text x="336" y="11" fill="#a855f7" font-size="9.5" font-weight="700" text-anchor="end">RH (%)</text>` : ""}
            ${bandTopY !== null && bandBotY !== null
              ? svg`<rect x="${plotLeft}" y="${Math.min(bandTopY, bandBotY)}" width="${plotWidth}" height="${Math.max(2, Math.abs(bandBotY - bandTopY))}" fill="rgba(34,197,94,0.10)" rx="4"/>`
              : ""}
            ${tempTicks.map((tick, idx) => svg`
              <line
                x1="${plotLeft}"
                y1="${tick.y}"
                x2="${plotRight}"
                y2="${tick.y}"
                stroke="${idx === tempTicks.length - 1 ? 'var(--secondary-text-color, rgba(148,163,184,0.45))' : 'var(--divider-color, rgba(148,163,184,0.22))'}"
                stroke-dasharray="${idx === tempTicks.length - 1 ? 'none' : '3 3'}"
              />
              <text x="28" y="${tick.y + 3}" fill="var(--secondary-text-color, #94a3b8)" font-size="9.5" font-weight="600" text-anchor="end">${tick.label}</text>
            `)}
            ${hasHum ? humTicks.map((tick) => svg`
              <text x="308" y="${tick.y + 3}" fill="#a855f7" font-size="9.5" font-weight="600" text-anchor="start" opacity="0.9">${tick.label}</text>
            `) : ""}
            ${xAxisTicks.map((xt) => svg`
              <line x1="${xt.x.toFixed(1)}" y1="120" x2="${xt.x.toFixed(1)}" y2="124" stroke="var(--secondary-text-color, rgba(148,163,184,0.5))"/>
              <text x="${xt.x.toFixed(1)}" y="135" fill="var(--primary-text-color, #e2e8f0)" font-size="9" font-weight="700" text-anchor="middle">${xt.horizon}</text>
              <text x="${xt.x.toFixed(1)}" y="147" fill="var(--secondary-text-color, #94a3b8)" font-size="8.5" font-weight="500" text-anchor="middle">${xt.clock}</text>
            `)}
            ${humPath ? svg`<path d="${humPath}" fill="none" stroke="#a855f7" stroke-width="1.6" stroke-dasharray="3 3" opacity="0.85"/>` : ""}
            <path d="${tempPath}" fill="none" stroke="#38bdf8" stroke-width="2.4" stroke-linecap="round"/>
            <circle cx="${toX(0)}" cy="${toY(startPt.temp)}" r="3.5" fill="#38bdf8"/>
            <circle cx="${toX(simPoints.length - 1)}" cy="${toY(endPt.temp)}" r="4" fill="${deltaT >= 0 ? '#fb923c' : '#38bdf8'}" stroke="var(--card-background-color, #fff)" stroke-width="1.5"/>
          </svg>
        </div>
      `;
    }

    const activeProfStr = (overrideObj?.state && overrideObj.state !== "unavailable" && overrideObj.state !== "unknown" && overrideObj.state.trim())
      || (profileObj?.state && profileObj.state !== "unavailable" && profileObj.state !== "unknown" ? profileObj.state : null);

    const outlook = this._buildZoneClimateOutlook({
      zone,
      unitTitle,
      advisorRecObj,
      zoneRateObj,
      simPoints,
      winReason,
      timeToTempObj,
    });

    return html`
      <!-- 0. PIXEL-STYLE DAILY CLIMATE OUTLOOK -->
      <div
        class="climate-outlook-card"
        @click=${() => this._showMoreInfo("input_text.hvac_advisor_prediction_message")}
        title="Tap to inspect input_text.hvac_advisor_prediction_message"
      >
        <div class="climate-outlook-header">
          <div class="climate-outlook-title">
            <ha-icon icon="mdi:creation" style="--mdc-icon-size:18px; color:var(--primary-color);"></ha-icon>
            <span>CLIMATE OUTLOOK</span>
          </div>
          <span class="climate-outlook-badge">${outlook.badgeText}</span>
        </div>
        <div class="climate-outlook-text">${outlook.summaryText}</div>
        ${outlook.chips.length > 0
          ? html`
              <div class="climate-outlook-chips">
                ${outlook.chips.map((chip) => html`
                  <span class="climate-outlook-chip ${chip.tone}">
                    <ha-icon icon="${chip.icon}"></ha-icon>
                    <span>${chip.text}</span>
                  </span>
                `)}
              </div>
            `
          : ""}
      </div>

      <!-- 1. WINDOW & OVERNIGHT ADVISOR BANNER -->
      <div class="passable-section-card">
        <div class="passable-section-header" style="margin-bottom:8px;">
          <div class="passable-section-title">
            <ha-icon icon="mdi:window-open-variant" style="--mdc-icon-size:18px; color:var(--primary-color);"></ha-icon>
            <span>WINDOW & CLIMATE ADVISOR</span>
          </div>
          <div style="display:flex; gap:6px; align-items:center;">
            <span class="advisor-tone-badge ${winMeta.tone}">${winMeta.text}</span>
            ${this._hasEntity("button.passable_climate_refresh_window_recommendation")
              ? html`
                  <button
                    class="action-mini-btn"
                    @click=${() => this._pressButtonEntity("button.passable_climate_refresh_window_recommendation")}
                    title="Recalculate window & thermal recommendation now"
                  >
                    <ha-icon icon="mdi:refresh"></ha-icon>
                    <span>Refresh</span>
                  </button>
                `
              : ""}
          </div>
        </div>

        ${winReason || activeProfStr
          ? html`
              <div style="font-size:0.76rem; color:var(--secondary-text-color); line-height:1.4; margin-bottom:8px;">
                ${activeProfStr ? html`<span style="font-weight:700; color:var(--primary-text-color);">Profile: ${activeProfStr}</span>${winReason ? " • " : ""}` : ""}
                ${winReason}
              </div>
            `
          : ""}

        ${showPredictionBanner
          ? html`
              <div class="advisor-alert-banner ${hasHeatPrediction ? 'warn' : 'info'}" @click=${() => this._showMoreInfo("input_text.hvac_advisor_prediction_message")} style="cursor:pointer;">
                <ha-icon icon="${hasHeatPrediction ? 'mdi:fire-alert' : 'mdi:information-outline'}"></ha-icon>
                <div>
                  <strong>${hasHeatPrediction ? "Overnight Heating Predicted" : "Advisor Forecast Note"}</strong>
                  ${predictionText ? html`<div style="font-size:0.72rem; opacity:0.9;">${predictionText}</div>` : ""}
                </div>
              </div>
            `
          : ""}

        <!-- Psychrometric Telemetry Row -->
        <div class="hvac-psychro-row">
          <div class="psychro-pill" @click=${() => this._showMoreInfo(`sensor.${zone}_enthalpy_delta`)}>
            <span class="psychro-label">${unitTitle.split("&")[0].trim()} Δh</span>
            <span class="psychro-val">${fmtNum(zoneEnthalpyDeltaObj, 1, zoneEnthalpyDeltaObj?.attributes?.unit_of_measurement || "")}</span>
          </div>
          <div class="psychro-pill" @click=${() => this._showMoreInfo("sensor.outdoor_specific_enthalpy")}>
            <span class="psychro-label">Out Enthalpy</span>
            <span class="psychro-val">${fmtNum(outEnthalpyObj, 1, outEnthalpyObj?.attributes?.unit_of_measurement || "")}</span>
          </div>
          <div class="psychro-pill" @click=${() => this._showMoreInfo(`sensor.${zone}_absolute_humidity`)}>
            <span class="psychro-label">In / Out AH</span>
            <span class="psychro-val">${fmtNum(zoneAhObj, 1)} / ${fmtNum(outAhObj, 1, outAhObj?.attributes?.unit_of_measurement || "g/m³")}</span>
          </div>
        </div>
      </div>

      <!-- 2. FORWARD TRAJECTORY SIMULATION -->
      <div class="passable-section-card">
        <div class="passable-section-header" style="margin-bottom:6px;">
          <div class="passable-section-title">
            <ha-icon icon="mdi:chart-bell-curve-cumulative" style="--mdc-icon-size:18px; color:#38bdf8;"></ha-icon>
            <span>THERMAL TRAJECTORY SIMULATION</span>
          </div>
          ${simPoints.length >= 2 ? html`<span class="passable-count-pill">${simScopeLabel ? `${simScopeLabel} • ` : ""}${simPoints.length}h Horizon</span>` : ""}
        </div>
        ${simSvgHtml}
      </div>

      <!-- 3. MLR LEARNING & MODEL TELEMETRY -->
      <div class="passable-section-card">
        <div class="passable-section-header" style="margin-bottom:8px;">
          <div class="passable-section-title">
            <ha-icon icon="mdi:brain" style="--mdc-icon-size:18px; color:var(--primary-color);"></ha-icon>
            <span>MLR THERMAL MODELING</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            ${activeModelSource
              ? html`
                  <span
                    class="passable-count-pill"
                    style="${activeModelSource === 'InfluxDB MLR' ? 'background:rgba(34,197,94,0.16); color:#16a34a;' : 'background:rgba(56,189,248,0.16); color:#0284c7;'}"
                  >${activeModelSource}</span>
                `
              : ""}
            ${this._hasEntity("button.passable_climate_retrain_thermal_models")
              ? html`
                  <button
                    class="action-mini-btn"
                    @click=${() => this._pressButtonEntity("button.passable_climate_retrain_thermal_models")}
                    title="Retrain MLR thermal coefficients from InfluxDB history"
                  >
                    <ha-icon icon="mdi:school-outline"></ha-icon>
                    <span>Retrain</span>
                  </button>
                `
              : ""}
          </div>
        </div>

        <div class="passable-stat-grid" style="margin-bottom:6px;">
          <div class="passable-stat-block">
            <span class="stat-block-label">ZONE DRIFT</span>
            <span class="stat-block-val" style="font-size:1.05rem; color:#0284c7;">
              ${(zoneRateObj && zoneRateObj.state && !isNaN(parseFloat(zoneRateObj.state)))
                ? `${parseFloat(zoneRateObj.state) >= 0 ? "+" : ""}${parseFloat(zoneRateObj.state).toFixed(2)}°/h`
                : "--"}
            </span>
          </div>
          <div class="passable-stat-block">
            <span class="stat-block-label">SWING / COAST</span>
            <span class="stat-block-val" style="font-size:0.95rem; color:#d97706;">
              ${hasLearnedSwingCoast
                ? `±${parseFloat(learnedSwing).toFixed(1)}° / ${learnedCoastMag !== undefined && learnedCoastMag !== null && !isNaN(parseFloat(learnedCoastMag)) ? `${parseFloat(learnedCoastMag).toFixed(1)}°` : "--"}`
                : "--"}
            </span>
          </div>
          <div class="passable-stat-block">
            <span class="stat-block-label">14D COMPLIANCE</span>
            <span class="stat-block-val" style="font-size:1.05rem; color:#16a34a;">
              ${complianceText}
            </span>
          </div>
        </div>

        ${(modelAccuracyObj && modelAccuracyObj.state !== "unavailable" && modelAccuracyObj.state !== "unknown") ||
          (complianceSummary?.avg_response_lag_mins != null)
          ? html`
              <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.74rem; color:var(--secondary-text-color); padding-top:6px; border-top:1px solid var(--divider-color, rgba(128,128,128,0.16));">
                ${modelAccuracyObj && modelAccuracyObj.state !== "unavailable" && modelAccuracyObj.state !== "unknown"
                  ? html`<span>Model Accuracy: <strong style="color:var(--primary-text-color);">${modelAccuracyObj.state}${modelAccuracyObj.attributes?.unit_of_measurement || "%"}</strong></span>`
                  : html`<span>Advisor: <strong style="color:var(--primary-text-color);">${winMeta.text}</strong></span>`}
                ${complianceSummary && complianceSummary.avg_response_lag_mins != null
                  ? html`<span>Avg Response: <strong style="color:var(--primary-text-color);">${Math.round(parseFloat(complianceSummary.avg_response_lag_mins))}m</strong></span>`
                  : ""}
              </div>
            `
          : ""}
      </div>

      <!-- 4. INTERACTIVE ASHRAE 55 COMFORT ENVELOPE -->
      <div class="passable-section-card">
        <div class="passable-section-header" style="margin-bottom:8px;">
          <div class="passable-section-title">
            <ha-icon icon="mdi:thermometer-lines" style="--mdc-icon-size:18px; color:var(--primary-color);"></ha-icon>
            <span>ASHRAE 55 COMFORT ENVELOPE</span>
          </div>
        </div>
        ${this._renderComfortStepperRow("Comfort Temp Min", "mdi:thermometer-chevron-down", "number.passable_climate_comfort_temp_min", 0.5, "°F", "#38bdf8")}
        ${this._renderComfortStepperRow("Comfort Temp Max", "mdi:thermometer-chevron-up", "number.passable_climate_comfort_temp_max", 0.5, "°F", "#fb923c")}
        ${this._renderComfortStepperRow("Humidity Min", "mdi:water-minus", "number.passable_climate_comfort_humidity_min", 1, "%", "#0284c7")}
        ${this._renderComfortStepperRow("Humidity Max", "mdi:water-plus", "number.passable_climate_comfort_humidity_max", 1, "%", "#6366f1")}
        ${this._renderComfortStepperRow("Dew Point Max", "mdi:weather-fog", "number.passable_climate_comfort_dew_point_max", 0.5, "°F", "#14b8a6")}
      </div>

      ${hasTransOffset
        ? html`
            <!-- 5. HVAC MODE TRANSITION DEADBAND -->
            <div class="passable-section-card">
              <div class="passable-section-header" style="margin-bottom:6px;">
                <div class="passable-section-title">
                  <ha-icon icon="mdi:swap-vertical" style="--mdc-icon-size:18px; color:#a855f7;"></ha-icon>
                  <span>HVAC MODE TRANSITION</span>
                </div>
              </div>
              ${this._renderComfortStepperRow("Heat / Cool Transition Offset", "mdi:thermometer-plus", transOffsetId, transStep, transUnit, "#a855f7")}
              <div style="font-size:0.70rem; color:var(--secondary-text-color); line-height:1.35; margin-top:6px;">
                ${transSubtext}
              </div>
            </div>
          `
        : ""}
    `;
  }

  _renderHvacModal(systems = []) {
    if (!this._hvacModal) return html``;

    const modalSystems = (systems && systems.length > 0) ? systems : this._getHvacSystems();
    const { unitKey, type } = this._hvacModal;
    const rawTab = this._activeHvacTab || type || "setpoints";
    const activeTab = rawTab === "stats" ? "setpoints" : rawTab;
    const c = this.config;
    const sysConfig = modalSystems.find((s) => s.key === unitKey) || {};
    const unitTitle = sysConfig.name || (unitKey === "downstairs" ? "Downstairs & Basement" : "Upstairs & Attic");

    const zoneClimate = this._resolveZoneClimate(unitKey, sysConfig);
    const zone = zoneClimate.zone;
    const climateId = zoneClimate.controlId;
    const companionId = zoneClimate.companionId;
    const climate = zoneClimate.controlObj;

    const acCondensersId = c.ac_condensers_uncovered || "input_boolean.ac_condensers_uncovered";
    const fanCircId = sysConfig.fan_circulation || c[`${unitKey}_fan_circulation`] || `input_number.hvac_fan_circulation_${zone}`;
    const fanCircActiveId = sysConfig.fan_circ_active || c[`${unitKey}_fan_circ_active`] || `input_boolean.hvac_fan_circulation_active_${zone}`;
    const overshootActiveId = sysConfig.overshoot_active || c[`${unitKey}_overshoot_active`] || `input_boolean.hvac_overshoot_active_${zone}`;
    const coolOvershootId = sysConfig.cool_overshoot || c[`${unitKey}_cool_overshoot`] || "input_number.hvac_overshoot_amount_cool";
    const heatOvershootId = sysConfig.heat_overshoot || c[`${unitKey}_heat_overshoot`] || "input_number.hvac_overshoot_amount_heat";
    const coolThreshId = sysConfig.cool_overshoot_thresh || c[`${unitKey}_cool_overshoot_thresh`] || "input_number.hvac_overshoot_threshold_cool";
    const heatThreshId = sysConfig.heat_overshoot_thresh || c[`${unitKey}_heat_overshoot_thresh`] || "input_number.hvac_overshoot_threshold_heat";

    const acCondensersObj = this._getEntity(acCondensersId);
    const fanCircObj = this._getEntity(fanCircId);
    const fanCircActiveObj = this._getEntity(fanCircActiveId);
    const overshootActiveObj = this._getEntity(overshootActiveId);
    const heatOvershoot = this._getEntity(heatOvershootId);
    const coolOvershoot = this._getEntity(coolOvershootId);
    const coolThresh = this._getEntity(coolThreshId);
    const heatThresh = this._getEntity(heatThreshId);

    const filterMetrics = this._getZoneFilterMetrics(unitKey, sysConfig);
    const modalSensors = this._getSystemSensors(unitKey, sysConfig, climateId);

    const presetModes = zoneClimate.presetModes.length > 0 ? zoneClimate.presetModes : ["home", "away", "sleep", "ECO", "Alt Sleep"];
    const presetEntityId = zoneClimate.presetEntityId || climateId;
    const profileObj = this._getEntity("input_text.hvac_active_profile");
    const overrideObj = this._getEntity("input_text.hvac_active_profile_override");
    const presetConfigObj = this._getEntity(sysConfig.setpoint_preset || c[`${unitKey}_setpoint_preset`] || "input_text.hvac_active_profile");
    const currentPreset = (zoneClimate.activePresetMode && zoneClimate.activePresetMode !== "temp" && zoneClimate.activePresetMode !== "none")
      ? zoneClimate.activePresetMode
      : ((presetConfigObj && presetConfigObj.state && presetConfigObj.state !== "unavailable" && presetConfigObj.state !== "unknown") ? presetConfigObj.state : "home");
    const isUpstairs = zone === "upstairs";

    const timeToTempId = sysConfig.time_to_temp || c[`${unitKey}_time_to_temp`] || `sensor.hvac_time_to_temp_${zone}`;
    const timeToTempObj = this._getEntity(timeToTempId);
    const healthStatusId = sysConfig.health_status || c[`${unitKey}_health_status`] || `sensor.hvac_health_status_${zone}`;
    const healthStatusObj = this.hass?.states?.[healthStatusId] || null;
    const modalHealthState = (healthStatusObj && healthStatusObj.state && healthStatusObj.state !== "unavailable" && healthStatusObj.state !== "unknown")
      ? String(healthStatusObj.state)
      : "Optimal";
    const modalIsHealthAlert = modalHealthState !== "Optimal" && modalHealthState !== "Healthy";
    const modalStallReason = healthStatusObj?.attributes?.stall_reason ? String(healthStatusObj.attributes.stall_reason) : "";

    const isModalHeat = climate && (climate.state === "heat" || (climate.attributes && climate.attributes.hvac_action === "heating"));
    const learnedSwing = timeToTempObj?.attributes?.learned_deadband_swing_f
      ?? (isModalHeat ? timeToTempObj?.attributes?.learned_swing_heat_f : timeToTempObj?.attributes?.learned_swing_cool_f)
      ?? timeToTempObj?.attributes?.learned_swing_heat_f;
    const learnedCoastMag = timeToTempObj?.attributes?.learned_coast_magnitude_f
      ?? timeToTempObj?.attributes?.learned_coast_f;
    const learnedCoastDur = timeToTempObj?.attributes?.learned_coast_duration_mins
      ?? timeToTempObj?.attributes?.learned_coast_minutes;
    const hasLearnedSwingCoast = learnedSwing !== undefined && learnedSwing !== null && !isNaN(parseFloat(learnedSwing));
    const modalNextCycleMode = (!timeToTempObj?.attributes?.pre_condition_needed && timeToTempObj?.attributes?.next_hvac_cycle_mode)
      ? String(timeToTempObj.attributes.next_hvac_cycle_mode)
      : "";
    const modalNextCycleTime = (!timeToTempObj?.attributes?.pre_condition_needed && timeToTempObj?.attributes?.next_hvac_cycle_time)
      ? String(timeToTempObj.attributes.next_hvac_cycle_time)
      : "";

    const advisorRecObj = this.hass?.states?.[c.window_recommendation_entity || "sensor.passable_climate_window_recommendation"] || null;
    const sleepOffsetF = (isUpstairs && advisorRecObj?.attributes?.recommended_sleep_offset_f)
      ? parseFloat(advisorRecObj.attributes.recommended_sleep_offset_f)
      : 0;
    const sleepOffsetReason = (isUpstairs && advisorRecObj?.attributes?.sleep_offset_reason) ? String(advisorRecObj.attributes.sleep_offset_reason) : "";
    const sleepLimitingRoom = (isUpstairs && advisorRecObj?.attributes?.sleep_limiting_room) ? String(advisorRecObj.attributes.sleep_limiting_room) : "";

    const zoneRateObj = this.hass?.states?.[`sensor.${zone}_fault_tolerant_temp_rate`] || null;
    const profileClosedObj = this.hass?.states?.[`sensor.plot_data_${zone}_temp_profile_win_closed`] || null;
    const activeModelSource = profileClosedObj?.attributes?.active_model_source || null;
    const complianceSummary = advisorRecObj?.attributes?.compliance_summary || null;
    const hasHeatPrediction = this._getEntity("input_boolean.hvac_advisor_predicts_heat_needed")?.state === "on";
    const predictionMsgObj = this._getEntity("input_text.hvac_advisor_prediction_message");

    const modalHvacAction = (climate && climate.attributes && climate.attributes.hvac_action) || (climate && climate.state) || "idle";
    const modalCurrentTemp = zoneClimate.currentTemp !== null ? zoneClimate.currentTemp.toFixed(1) : "--";
    const modalHumidity = zoneClimate.currentHumidity !== null ? Math.round(zoneClimate.currentHumidity) : null;
    const modalTempStep = this._getHvacTempStep(climate);
    const modalMode = (climate.state || "").toLowerCase();
    const isHeatCoolRange = (modalMode === "heat_cool" || modalMode === "auto") && climate?.attributes?.target_temp_low != null && climate?.attributes?.target_temp_high != null;
    const modalLowTarget = parseFloat(climate?.attributes?.target_temp_low);
    const modalHighTarget = parseFloat(climate?.attributes?.target_temp_high);
    const modalTargetRaw = parseFloat(climate?.attributes?.temperature);
    const modalTargetTemp = !isNaN(modalTargetRaw)
      ? (modalTempStep < 1 ? Math.round(modalTargetRaw * 10) / 10 : Math.round(modalTargetRaw))
      : 70;
    const modalTimeMins = (timeToTempObj && timeToTempObj.state && !isNaN(parseFloat(timeToTempObj.state))) ? Math.round(parseFloat(timeToTempObj.state)) : 0;
    const modalTimeStr = ((modalHvacAction === "cooling" || modalHvacAction === "heating") && modalTimeMins > 0) ? `~${modalTimeMins}m` : "";
    const modalOvershootOn = overshootActiveObj && overshootActiveObj.state === "on";
    const isPresetsExpanded = Boolean(this._expandedModalSections && this._expandedModalSections[`presets_${unitKey}`]);
    const isOvershootExpanded = Boolean(this._expandedModalSections && this._expandedModalSections[`overshoot_${unitKey}`]);

    const fanMinVal = zoneClimate.fanMinOnTime !== null
      ? Math.round(parseFloat(zoneClimate.fanMinOnTime))
      : (fanCircObj && fanCircObj.state !== "unavailable" && !isNaN(parseFloat(fanCircObj.state)) ? Math.round(parseFloat(fanCircObj.state)) : null);
    const hasFanCircActive = Boolean(fanCircActiveObj && fanCircActiveObj.state !== "unavailable" && fanCircActiveObj.state !== "unknown");
    const hasFanRecircRow = hasFanCircActive || fanMinVal !== null;

    return html`
      <div class="popup-overlay" @click=${() => this._closeHvacModal()}>
        <div
          class="popup-content"
          @click=${(e) => e.stopPropagation()}
          @touchstart=${this._handleTouchStart}
          @touchmove=${this._handleTouchMove}
          @touchend=${this._handleTouchEnd}
          @touchcancel=${this._handleTouchCancel}
        >
          <div class="drag-handle"></div>
          <div class="popup-header">
            <button class="close-button" @click=${() => this._closeHvacModal()}>
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
            <h3>${unitTitle} Controls</h3>
            ${c.show_stats_button !== false
              ? html`
                  <button
                    type="button"
                    class="icon-circle-btn"
                    style="margin-left:auto;"
                    @click=${() => this._handleStatsButtonClick(modalSystems, unitKey, "temps")}
                    title="Open HVAC & Climate Stats for ${unitTitle}"
                    aria-label="Open HVAC & Climate Stats"
                  >
                    <ha-icon icon="mdi:chart-line" style="--mdc-icon-size:16px;"></ha-icon>
                  </button>
                `
              : ""}
          </div>

          ${modalSystems.length > 1
            ? html`
                <div class="hvac-switcher-row" role="group" aria-label="Switch HVAC system">
                  ${modalSystems.map((sys) => {
                    const sysClimate = this._resolveZoneClimate(sys.key, sys);
                    const sysTempStr = sysClimate.currentTemp !== null ? `${sysClimate.currentTemp.toFixed(1)}°` : "";
                    const sysAction = String(sysClimate.controlObj?.attributes?.hvac_action || "").toLowerCase();
                    const dotClass = sysAction === "heating"
                      ? "heating"
                      : sysAction === "cooling"
                      ? "cooling"
                      : sysAction === "fan"
                      ? "fan"
                      : "";
                    const sysLabel = sys.name || sys.title || (sys.key === "downstairs" ? "Downstairs & Basement" : (sys.key === "upstairs" ? "Upstairs & Attic" : sys.key));
                    const sysIcon = sys.icon || (sys.key === "downstairs" ? "mdi:home-floor-1" : "mdi:home-floor-2");
                    const isActive = sys.key === unitKey;
                    return html`
                      <button
                        type="button"
                        class="hvac-switch-pill ${isActive ? "active" : ""}"
                        aria-pressed="${isActive ? "true" : "false"}"
                        @click=${() => this._switchHvacSystem(sys.key, sys)}
                      >
                        ${dotClass ? html`<span class="hvac-switch-dot ${dotClass}"></span>` : ""}
                        <ha-icon icon="${sysIcon}"></ha-icon>
                        <span class="hvac-switch-name">${sysLabel}</span>
                        ${sysTempStr ? html`<span class="hvac-switch-temp">${sysTempStr}</span>` : ""}
                      </button>
                    `;
                  })}
                </div>
              `
            : ""}

          <!-- 3-Tab Header Bar -->
          <div class="popup-tabs">
            <button
              class="popup-tab ${activeTab === 'setpoints' ? 'active-tab' : ''}"
              @click=${() => this._switchHvacTab('setpoints')}
            >
              <ha-icon icon="mdi:tune"></ha-icon>
              <span>Setpoints</span>
            </button>
            <button
              class="popup-tab ${activeTab === 'advisor' ? 'active-tab' : ''}"
              @click=${() => this._switchHvacTab('advisor')}
            >
              <ha-icon icon="mdi:brain"></ha-icon>
              <span>Advisor & Comfort</span>
            </button>
            <button
              class="popup-tab ${activeTab === 'filter' ? 'active-tab' : ''}"
              @click=${() => this._switchHvacTab('filter')}
            >
              <ha-icon icon="mdi:air-filter"></ha-icon>
              <span>Filter & Maint</span>
            </button>
          </div>

          <div style="display:flex; flex-direction:column; gap:12px;">
            ${activeTab === "setpoints"
              ? html`
                  <!-- HERO THERMOSTAT CONTROL CARD -->
                  <div class="passable-section-card">
                    <div class="hero-setpoint-banner">
                      <div class="hero-current-col">
                        <span class="hero-col-label">CURRENT INDOOR</span>
                        <div class="hero-current-val-row">
                          <span class="hero-current-temp">${modalCurrentTemp}°</span>
                          ${modalHumidity !== null
                            ? html`<span class="hero-current-hum"><ha-icon icon="mdi:water-percent"></ha-icon>${modalHumidity}%</span>`
                            : ""}
                        </div>
                        <div class="hero-status-badges">
                          ${modalTimeStr
                            ? html`<span class="passable-badge ${modalHvacAction === 'heating' ? 'badge-heat' : 'badge-cool'}"><ha-icon icon="mdi:clock-fast"></ha-icon>${modalTimeStr} to ${modalTargetTemp}°</span>`
                            : html`<span class="passable-badge badge-neutral">${modalHvacAction === 'heating' ? 'Heating Active' : modalHvacAction === 'cooling' ? 'Cooling Active' : (modalNextCycleMode && modalNextCycleTime ? `Next ${modalNextCycleMode === 'cool' ? 'Cool' : 'Heat'} ~${modalNextCycleTime}` : 'Holding Target')}</span>`}
                          ${modalOvershootOn
                            ? html`<span class="passable-badge badge-overshoot"><ha-icon icon="mdi:delta"></ha-icon>Overshoot Active</span>`
                            : ""}
                          ${hasLearnedSwingCoast
                            ? html`
                                <span
                                  class="passable-badge badge-neutral"
                                  title="Learned Thermostat Hysteresis Swing & Post-Run Thermal Coast"
                                >
                                  <ha-icon icon="mdi:sine-wave"></ha-icon>
                                  Swing ±${parseFloat(learnedSwing).toFixed(1)}°F${learnedCoastMag !== undefined && learnedCoastMag !== null && !isNaN(parseFloat(learnedCoastMag)) ? ` • Coast ${parseFloat(learnedCoastMag).toFixed(1)}°F` : ""}${learnedCoastDur ? ` (~${Math.round(parseFloat(learnedCoastDur))}m)` : ""}
                                </span>
                              `
                            : ""}
                        </div>
                      </div>

                      <div class="hero-target-col">
                        <span class="hero-col-label">${isHeatCoolRange ? "HEAT / COOL BAND" : "TARGET SETPOINT"}</span>
                        ${isHeatCoolRange
                          ? html`
                              <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
                                <div class="hero-stepper-pill compact-dual">
                                  <ha-icon icon="mdi:fire" style="--mdc-icon-size:14px; color:#f97316;"></ha-icon>
                                  <button class="hero-step-btn" @click=${() => this._adjustHvacTemp(climateId, -modalTempStep, "low")}>-</button>
                                  <span class="hero-step-val">${Math.round(modalLowTarget)}°</span>
                                  <button class="hero-step-btn" @click=${() => this._adjustHvacTemp(climateId, modalTempStep, "low")}>+</button>
                                </div>
                                <div class="hero-stepper-pill compact-dual">
                                  <ha-icon icon="mdi:snowflake" style="--mdc-icon-size:14px; color:#38bdf8;"></ha-icon>
                                  <button class="hero-step-btn" @click=${() => this._adjustHvacTemp(climateId, -modalTempStep, "high")}>-</button>
                                  <span class="hero-step-val">${Math.round(modalHighTarget)}°</span>
                                  <button class="hero-step-btn" @click=${() => this._adjustHvacTemp(climateId, modalTempStep, "high")}>+</button>
                                </div>
                              </div>
                            `
                          : html`
                              <div class="hero-stepper-pill">
                                <button class="hero-step-btn" @click=${() => this._adjustHvacTemp(climateId, -modalTempStep)}>-</button>
                                <span class="hero-step-val">${modalTargetTemp}°F</span>
                                <button class="hero-step-btn" @click=${() => this._adjustHvacTemp(climateId, modalTempStep)}>+</button>
                              </div>
                            `}
                      </div>
                    </div>

                    ${modalIsHealthAlert && modalStallReason
                      ? html`
                          <div class="advisor-alert-banner warn" style="margin-bottom:10px;">
                            <ha-icon icon="mdi:alert-circle-outline"></ha-icon>
                            <div><strong>${modalHealthState}:</strong> ${modalStallReason}</div>
                          </div>
                        `
                      : ""}

                    ${isUpstairs && sleepOffsetF !== 0 && !isNaN(sleepOffsetF)
                      ? html`
                          <div class="advisor-alert-banner info" style="margin-bottom:10px; justify-content:space-between;">
                            <div style="line-height:1.3;">
                              <div style="font-weight:700; display:flex; align-items:center; gap:4px;">
                                <ha-icon icon="mdi:bed-clock" style="--mdc-icon-size:14px;"></ha-icon>
                                <span>Sleep Comfort Advisory${sleepLimitingRoom ? ` (${sleepLimitingRoom})` : ""}</span>
                              </div>
                              <div style="color:var(--secondary-text-color); font-size:0.7rem;">
                                ${sleepOffsetReason || `Recommended ${sleepOffsetF > 0 ? `+${sleepOffsetF}` : sleepOffsetF}°F thermostat offset for limiting bedroom`}
                              </div>
                            </div>
                            <button
                              class="hvac-mode-btn active"
                              style="padding:5px 10px; font-size:0.72rem; white-space:nowrap; flex-shrink:0;"
                              @click=${() => this._adjustHvacTemp(climateId, sleepOffsetF)}
                              title="Apply ${sleepOffsetF > 0 ? `+${sleepOffsetF}` : sleepOffsetF}°F offset to ${unitTitle}"
                            >
                              Apply ${sleepOffsetF > 0 ? `+${sleepOffsetF}` : sleepOffsetF}°F
                            </button>
                          </div>
                        `
                      : ""}

                    <!-- Segmented Mode Selector -->
                    <div class="passable-control-group">
                      <span class="passable-group-label">HVAC Mode</span>
                      <div class="passable-segmented-row">
                        ${["cool", "heat", "auto", "off"].map(
                          (m) => {
                            const isActiveMode = modalMode === m || (m === "auto" && modalMode === "heat_cool");
                            return html`
                              <button
                                class="hvac-mode-btn ${isActiveMode ? "active" : ""}"
                                @click=${() => this._setHvacMode(climateId, m, companionId)}
                              >
                                ${m.toUpperCase()}
                              </button>
                            `;
                          }
                        )}
                      </div>
                    </div>

                    <!-- Segmented Preset Selector (routed to companion Ecobee entity when HK primary lacks presets) -->
                    <div class="passable-control-group" style="margin-top:8px;">
                      <span class="passable-group-label">Active Preset${zoneClimate.companionId ? " (Ecobee)" : ""}</span>
                      <div class="passable-segmented-row" style="flex-wrap:wrap;">
                        ${presetModes.map(
                          (p) => html`
                            <button
                              class="hvac-mode-btn ${currentPreset.toLowerCase() === p.toLowerCase() ? "active" : ""}"
                              style="flex:1 1 auto; min-width:58px;"
                              @click=${() => this._setHvacPresetMode(presetEntityId, p)}
                            >
                              ${p === "away_indefinitely" ? "Away Indef" : p}
                            </button>
                          `
                        )}
                      </div>
                    </div>

                    <!-- AC CONDENSERS UNCOVERED TOGGLE -->
                    ${acCondensersObj && acCondensersObj.state !== "unavailable"
                      ? html`
                          <div class="divider" style="margin:10px 0 8px 0;"></div>
                          <div class="control-row" style="padding:2px 0;">
                            <div class="control-label-group">
                              <ha-icon icon="mdi:snowflake-melt" style="color:var(--info-color, #0284c7);"></ha-icon>
                              <span class="control-label">AC Condensers Uncovered</span>
                            </div>
                            <ha-switch
                              .checked=${acCondensersObj.state === "on"}
                              @change=${() => this._toggleEntity(acCondensersId)}
                              class="popup-switch"
                            ></ha-switch>
                          </div>
                        `
                      : ""}

                    <!-- FAN RECIRCULATION CONTROL (INLINE UNDER CONDENSERS) -->
                    ${hasFanRecircRow
                      ? html`
                          <div class="divider" style="margin:10px 0 8px 0;"></div>
                          ${hasFanCircActive
                            ? html`
                                <div class="control-row" style="padding:2px 0;${fanMinVal !== null ? ' margin-bottom:6px;' : ''}">
                                  <div class="control-label-group">
                                    <ha-icon icon="mdi:recycle-variant" style="color:var(--info-color, #0284c7);"></ha-icon>
                                    <span class="control-label">Fan Recirculation</span>
                                  </div>
                                  <ha-switch
                                    .checked=${fanCircActiveObj.state === "on"}
                                    @change=${() => this._toggleEntity(fanCircActiveId)}
                                    class="popup-switch"
                                  ></ha-switch>
                                </div>
                              `
                            : ""}
                          ${fanMinVal !== null
                            ? html`
                                <div class="control-row" style="padding:2px 0;">
                                  <div class="control-label-group">
                                    <ha-icon icon="mdi:fan-clock" style="color:var(--info-color, #0284c7);"></ha-icon>
                                    <span class="control-label">Min Fan Runtime</span>
                                  </div>
                                  <div class="step-controller-pill">
                                    <button class="pill-btn" @click=${() => this._adjustFanMinOnTime(companionId, -5, fanCircId)}>-5m</button>
                                    <span class="pill-value">${fanMinVal} m/h</span>
                                    <button class="pill-btn" @click=${() => this._adjustFanMinOnTime(companionId, 5, fanCircId)}>+5m</button>
                                  </div>
                                </div>
                              `
                            : ""}
                        `
                      : ""}
                  </div>

                  <!-- REMOTE ROOM SENSORS SECTION -->
                  ${modalSensors.length > 0 ? html`
                    <div class="passable-section-card">
                      <div class="passable-section-header">
                        <div class="passable-section-title">
                          <ha-icon icon="mdi:home-thermometer-outline" style="--mdc-icon-size:18px; color:var(--primary-color);"></ha-icon>
                          <span>REMOTE ROOM SENSORS</span>
                        </div>
                        <span class="passable-count-pill">${modalSensors.length} Connected</span>
                      </div>
                      <div class="hvac-modal-sensors-grid">
                        ${modalSensors.map((s) => html`
                          <div class="hvac-modal-sensor-tile ${s.isActive ? 'active' : ''}" @click=${() => this._showMoreInfo(s.entityId)} title="${s.name}${s.passiveRate ? ` • Drift ${s.passiveRate}` : ''} (Tap for details)">
                            <div class="sensor-tile-top">
                              <span class="sensor-tile-name">${s.cleanName}</span>
                              <span
                                class="sensor-tile-status ${s.isActive ? 'active' : 'standby'}"
                                style="${s.isLimiting ? 'background:rgba(245,158,11,0.22); color:#d97706;' : ''}"
                              >
                                ${s.isLimiting ? "Limiting" : (s.isActive ? "Active" : "Standby")}
                              </span>
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:baseline; gap:4px;">
                              <div class="sensor-tile-temp">${typeof s.temp === 'number' ? s.temp.toFixed(1) : s.temp}°</div>
                              ${s.passiveRate
                                ? html`<span style="font-size:0.65rem; font-weight:700; color:var(--secondary-text-color);">${s.passiveRate}</span>`
                                : ""}
                            </div>
                          </div>
                        `)}
                      </div>
                    </div>
                  ` : ""}

                  <!-- COLLAPSIBLE ACCORDION 1: PRESET TEMPERATURE SETPOINTS -->
                  <div class="passable-accordion-card ${isPresetsExpanded ? 'expanded' : ''}">
                    <div class="passable-accordion-header" @click=${(e) => this._toggleModalSection('presets_' + unitKey, e)}>
                      <div class="passable-accordion-title">
                        <ha-icon icon="mdi:thermometer-cog" style="--mdc-icon-size:18px; color:var(--primary-color);"></ha-icon>
                        <div>
                          <div class="accordion-main-text">Preset Temperature Setpoints</div>
                          <div class="accordion-sub-text">Configure Home, Sleep, Away, Eco & Protect targets</div>
                        </div>
                      </div>
                      <ha-icon class="accordion-chevron" icon="${isPresetsExpanded ? 'mdi:chevron-up' : 'mdi:chevron-down'}"></ha-icon>
                    </div>

                    ${isPresetsExpanded ? html`
                      <div class="passable-accordion-body">
                        <div style="background:var(--secondary-background-color, rgba(128, 128, 128, 0.08)); border:1px solid var(--divider-color, rgba(128, 128, 128, 0.14)); border-radius:12px; padding:10px 12px; margin-bottom:10px;">
                          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <div style="font-size:0.78rem; font-weight:700; color:var(--primary-text-color); display:flex; align-items:center; gap:6px;">
                              <ha-icon icon="mdi:home-thermometer" style="--mdc-icon-size:16px; color:var(--info-color, #0284c7);"></ha-icon>
                              <span>${unitTitle.split('&')[0].trim()} Specific Presets</span>
                            </div>
                            <span style="font-size:0.65rem; font-weight:600; padding:2px 6px; border-radius:6px; background:rgba(56,189,248,0.15); color:#0284c7;">Unit Specific</span>
                          </div>

                          ${this._renderPresetSetpointRow("Home Profile", `input_number.hvac_preset_${zone}_home_heat`, `input_number.hvac_preset_${zone}_home_cool`)}
                          ${this._renderPresetSetpointRow("Sleep Profile", `input_number.hvac_preset_${zone}_sleep_heat`, `input_number.hvac_preset_${zone}_sleep_cool`)}
                          ${this._renderPresetSetpointRow("Alt Sleep Profile", `input_number.hvac_preset_${zone}_alt_sleep_heat`, `input_number.hvac_preset_${zone}_alt_sleep_cool`)}
                        </div>

                        <div style="background:var(--secondary-background-color, rgba(128, 128, 128, 0.08)); border:1px solid var(--divider-color, rgba(128, 128, 128, 0.14)); border-radius:12px; padding:10px 12px;">
                          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <div style="font-size:0.78rem; font-weight:700; color:var(--primary-text-color); display:flex; align-items:center; gap:6px;">
                              <ha-icon icon="mdi:earth" style="--mdc-icon-size:16px; color:#3b82f6;"></ha-icon>
                              <span>Global System Presets</span>
                            </div>
                            <span style="font-size:0.65rem; font-weight:600; padding:2px 6px; border-radius:6px; background:rgba(59,130,246,0.15); color:#3b82f6;">All Thermostats</span>
                          </div>

                          ${this._renderPresetSetpointRow("Away Mode", "input_number.hvac_preset_away_heat", "input_number.hvac_preset_away_cool")}
                          ${this._renderPresetSetpointRow("Eco Mode", "input_number.hvac_preset_eco_heat", "input_number.hvac_preset_eco_cool")}
                          ${this._renderPresetSetpointRow("Vacation Mode", "input_number.hvac_preset_vacation_heat", "input_number.hvac_preset_vacation_cool")}
                          ${this._renderPresetSetpointRow("Protect Mode", "input_number.hvac_preset_protect_heat", "input_number.hvac_preset_protect_cool")}
                        </div>
                      </div>
                    ` : ""}
                  </div>

                  <!-- COLLAPSIBLE ACCORDION 2: OVERSHOOT SETTINGS -->
                  <div class="passable-accordion-card ${isOvershootExpanded ? 'expanded' : ''}">
                    <div class="passable-accordion-header" @click=${(e) => this._toggleModalSection('overshoot_' + unitKey, e)}>
                      <div class="passable-accordion-title">
                        <ha-icon icon="mdi:delta" style="--mdc-icon-size:18px; color:#fb923c;"></ha-icon>
                        <div>
                          <div class="accordion-main-text">Overshoot Settings</div>
                          <div class="accordion-sub-text">
                            ${modalOvershootOn ? "Currently Active • " : "Standby • "}Heat ${heatOvershoot && heatOvershoot.state !== "unavailable" ? `+${heatOvershoot.state}°F` : "+2°F"} / Cool ${coolOvershoot && coolOvershoot.state !== "unavailable" ? `-${coolOvershoot.state}°F` : "-1°F"}
                          </div>
                        </div>
                      </div>
                      <ha-icon class="accordion-chevron" icon="${isOvershootExpanded ? 'mdi:chevron-up' : 'mdi:chevron-down'}"></ha-icon>
                    </div>

                    ${isOvershootExpanded ? html`
                      <div class="passable-accordion-body">
                        ${overshootActiveObj && overshootActiveObj.state !== "unavailable"
                          ? html`
                              <div class="control-row" style="margin-bottom:10px;">
                                <div class="control-label-group">
                                  <ha-icon icon="mdi:delta" style="color:var(--primary-color);"></ha-icon>
                                  <span class="control-label">Overshoot State</span>
                                </div>
                                <ha-switch
                                  .checked=${overshootActiveObj.state === "on"}
                                  @change=${() => this._toggleEntity(overshootActiveId)}
                                  class="popup-switch"
                                ></ha-switch>
                              </div>
                            `
                          : ""}

                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                          <div style="background:var(--card-background-color, rgba(128, 128, 128, 0.05)); border:1px solid var(--divider-color, rgba(128, 128, 128, 0.14)); border-radius:14px; padding:10px; display:flex; flex-direction:column; gap:8px;">
                            <div style="display:flex; align-items:center; gap:6px; font-weight:700; font-size:0.9rem; color:#ea580c;">
                              <ha-icon icon="mdi:fire" style="--mdc-icon-size:16px;"></ha-icon>
                              <span>Heat</span>
                            </div>

                            <div style="background:var(--secondary-background-color, rgba(128, 128, 128, 0.12)); border-radius:10px; padding:8px 10px; display:flex; flex-direction:column; gap:4px;">
                              <div style="display:flex; align-items:center; gap:6px; font-size:0.75rem; font-weight:600; color:var(--primary-text-color);">
                                <ha-icon icon="mdi:fire" style="--mdc-icon-size:14px; color:#ea580c;"></ha-icon>
                                <span>Threshold</span>
                              </div>
                              <div style="display:flex; justify-content:space-between; align-items:center;">
                                <button class="pill-btn" style="width:24px; height:24px; font-size:1rem;" @click=${() => this._adjustNumberEntity(heatThreshId, -0.5)}>-</button>
                                <span style="font-weight:700; font-size:0.85rem;">${heatThresh && heatThresh.state && heatThresh.state !== "unavailable" ? `${heatThresh.state} °F` : "4 °F"}</span>
                                <button class="pill-btn" style="width:24px; height:24px; font-size:1rem;" @click=${() => this._adjustNumberEntity(heatThreshId, 0.5)}>+</button>
                              </div>
                            </div>

                            <div style="background:var(--secondary-background-color, rgba(128, 128, 128, 0.12)); border-radius:10px; padding:8px 10px; display:flex; flex-direction:column; gap:4px;">
                              <div style="display:flex; align-items:center; gap:6px; font-size:0.75rem; font-weight:600; color:var(--primary-text-color);">
                                <ha-icon icon="mdi:fire" style="--mdc-icon-size:14px; color:#ea580c;"></ha-icon>
                                <span>Amount</span>
                              </div>
                              <div style="display:flex; justify-content:space-between; align-items:center;">
                                <button class="pill-btn" style="width:24px; height:24px; font-size:1rem;" @click=${() => this._adjustNumberEntity(heatOvershootId, -0.5)}>-</button>
                                <span style="font-weight:700; font-size:0.85rem;">${heatOvershoot && heatOvershoot.state && heatOvershoot.state !== "unavailable" ? `${heatOvershoot.state} °F` : "2 °F"}</span>
                                <button class="pill-btn" style="width:24px; height:24px; font-size:1rem;" @click=${() => this._adjustNumberEntity(heatOvershootId, 0.5)}>+</button>
                              </div>
                            </div>
                          </div>

                          <div style="background:var(--card-background-color, rgba(128, 128, 128, 0.05)); border:1px solid var(--divider-color, rgba(128, 128, 128, 0.14)); border-radius:14px; padding:10px; display:flex; flex-direction:column; gap:8px;">
                            <div style="display:flex; align-items:center; gap:6px; font-weight:700; font-size:0.9rem; color:#0284c7;">
                              <ha-icon icon="mdi:snowflake" style="--mdc-icon-size:16px;"></ha-icon>
                              <span>Cool</span>
                            </div>

                            <div style="background:var(--secondary-background-color, rgba(128, 128, 128, 0.12)); border-radius:10px; padding:8px 10px; display:flex; flex-direction:column; gap:4px;">
                              <div style="display:flex; align-items:center; gap:6px; font-size:0.75rem; font-weight:600; color:var(--primary-text-color);">
                                <ha-icon icon="mdi:snowflake" style="--mdc-icon-size:14px; color:#0284c7;"></ha-icon>
                                <span>Threshold</span>
                              </div>
                              <div style="display:flex; justify-content:space-between; align-items:center;">
                                <button class="pill-btn" style="width:24px; height:24px; font-size:1rem;" @click=${() => this._adjustNumberEntity(coolThreshId, -0.5)}>-</button>
                                <span style="font-weight:700; font-size:0.85rem;">${coolThresh && coolThresh.state && coolThresh.state !== "unavailable" ? `${coolThresh.state} °F` : "5 °F"}</span>
                                <button class="pill-btn" style="width:24px; height:24px; font-size:1rem;" @click=${() => this._adjustNumberEntity(coolThreshId, 0.5)}>+</button>
                              </div>
                            </div>

                            <div style="background:var(--secondary-background-color, rgba(128, 128, 128, 0.12)); border-radius:10px; padding:8px 10px; display:flex; flex-direction:column; gap:4px;">
                              <div style="display:flex; align-items:center; gap:6px; font-size:0.75rem; font-weight:600; color:var(--primary-text-color);">
                                <ha-icon icon="mdi:snowflake" style="--mdc-icon-size:14px; color:#0284c7;"></ha-icon>
                                <span>Amount</span>
                              </div>
                              <div style="display:flex; justify-content:space-between; align-items:center;">
                                <button class="pill-btn" style="width:24px; height:24px; font-size:1rem;" @click=${() => this._adjustNumberEntity(coolOvershootId, -0.5)}>-</button>
                                <span style="font-weight:700; font-size:0.85rem;">${coolOvershoot && coolOvershoot.state && coolOvershoot.state !== "unavailable" ? `${coolOvershoot.state} °F` : "1 °F"}</span>
                                <button class="pill-btn" style="width:24px; height:24px; font-size:1rem;" @click=${() => this._adjustNumberEntity(coolOvershootId, 0.5)}>+</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ` : ""}
                  </div>
                `
              : activeTab === "advisor"
              ? this._renderAdvisorTabContent({
                  unitKey,
                  zone,
                  unitTitle,
                  advisorRecObj,
                  zoneRateObj,
                  activeModelSource,
                  complianceSummary,
                  hasLearnedSwingCoast,
                  learnedSwing,
                  learnedCoastMag,
                  hasHeatPrediction,
                  predictionMsgObj,
                  profileObj,
                  overrideObj,
                })
              : html`
                  <!-- TAB 4: AIR FILTER MAINTENANCE -->
                  <div class="passable-section-card">
                    <div class="passable-section-header" style="margin-bottom:10px;">
                      <div class="passable-section-title">
                        <ha-icon icon="mdi:air-filter" style="--mdc-icon-size:18px; color:var(--primary-color);"></ha-icon>
                        <span>AIR FILTER LIFESPAN & SETTINGS</span>
                      </div>
                      ${filterMetrics.percentRemaining !== null
                        ? html`
                            <span class="advisor-tone-badge ${filterMetrics.isExpired ? 'close' : (filterMetrics.isLow ? 'warn' : 'open')}">
                              ${filterMetrics.percentRemaining}% Left
                            </span>
                          `
                        : ""}
                    </div>

                    ${filterMetrics.percentRemaining !== null
                      ? html`
                          <div class="filter-progress-wrap">
                            <div class="filter-progress-track">
                              <div
                                class="filter-progress-fill ${filterMetrics.isExpired ? 'danger' : (filterMetrics.isLow ? 'warn' : 'good')}"
                                style="width:${Math.max(2, filterMetrics.percentRemaining)}%;"
                              ></div>
                            </div>
                            <div class="filter-progress-meta">
                              <span>${filterMetrics.usedHours}h used</span>
                              ${filterMetrics.lastResetRaw ? html`<span>Changed ${this._formatShortDate(filterMetrics.lastResetRaw)}</span>` : ""}
                              <span>${filterMetrics.remHours !== null ? `${Math.round(filterMetrics.remHours * 10) / 10}h remaining` : `${filterMetrics.maxHours}h limit`}</span>
                            </div>
                          </div>
                        `
                      : ""}

                    <div class="control-row" style="margin-bottom:10px;">
                      <div class="control-label-group">
                        <ha-icon icon="mdi:timer-outline"></ha-icon>
                        <span class="control-label">Filter Life Remaining</span>
                      </div>
                      <span class="control-value" style="font-weight:700; color:var(--primary-color);">
                        ${filterMetrics.remHours !== null ? `${Math.round(filterMetrics.remHours * 10) / 10} hrs` : `${filterMetrics.maxHours} hrs`}
                      </span>
                    </div>

                    ${filterMetrics.lastResetRaw
                      ? html`
                          <div class="control-row" style="margin-bottom:10px;">
                            <div class="control-label-group">
                              <ha-icon icon="mdi:calendar-check-outline"></ha-icon>
                              <span class="control-label">Last Replaced</span>
                            </div>
                            <span
                              class="control-value"
                              style="font-size:0.85rem; font-weight:600; color:var(--primary-text-color);"
                              title="${filterMetrics.lastResetRaw}"
                            >
                              ${this._formatShortDate(filterMetrics.lastResetRaw)}
                            </span>
                          </div>
                        `
                      : ""}

                    <div class="control-row">
                      <div class="control-label-group">
                        <ha-icon icon="mdi:speedometer"></ha-icon>
                        <span class="control-label">Max Recommended Lifespan</span>
                      </div>
                      <div class="step-controller-pill">
                        <button class="pill-btn" @click=${() => this._adjustFilterLifeAndHours(filterMetrics.hoursId, filterMetrics.lifeId, -25)}>-25h</button>
                        <span class="pill-value">${Math.round(filterMetrics.maxHours)} hrs</span>
                        <button class="pill-btn" @click=${() => this._adjustFilterLifeAndHours(filterMetrics.hoursId, filterMetrics.lifeId, 25)}>+25h</button>
                      </div>
                    </div>
                  </div>

                  <div class="step-timeline">
                    <div class="step">
                      <div class="step-num">1</div>
                      <div class="step-content">
                        <h4>Power Off System</h4>
                        <p>Turn off unit power at thermostat or breaker before replacing filter.</p>
                      </div>
                    </div>
                    <div class="step">
                      <div class="step-num">2</div>
                      <div class="step-content">
                        <h4>Replace Filter Slot</h4>
                        <p>Slide out old filter. Insert clean filter matching airflow directional arrows.</p>
                      </div>
                    </div>
                    <div class="step">
                      <div class="step-num">3</div>
                      <div class="step-content">
                        <h4>Reset Hours Counter</h4>
                        <p>Tap the reset button below to restore filter lifespan back to max limit.</p>
                      </div>
                    </div>
                  </div>

                  <button class="recirc-button active" style="width:100%; margin-top:16px;" @click=${() => this._resetHvacFilter(unitKey, filterMetrics.hoursId, filterMetrics.lifeId)}>
                    <ha-icon icon="mdi:refresh"></ha-icon>
                    <span>RESET FILTER LIFE COUNTER</span>
                  </button>
                `}
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================
  // DEDICATED HVAC & CLIMATE STATS MODAL
  // ==========================================

  _renderRuntimeChartCard(unitKey, sysConfig, unitTitle, modalSystems, allowZoneSwitch = false) {
    const bundle = this._getZoneRuntimeBundle(unitKey, sysConfig);
    const {
      liveCoolToday,
      liveHeatToday,
      isHeatingSeason,
      liveOutdoorTempStr,
      analytics,
    } = bundle;

    const {
      historyData,
      activeDay,
      maxGridHours,
      runtimeYLabels,
      barYGridLabels,
      multiDayPathString,
      timelineData,
      selectedChunkIdx,
      activeHourData,
      activeRunRangeStr,
      ttX,
      ttY,
      yGridLabels,
      activeBandsPath,
      xLabels,
      indoorPathString,
      setpointPathString,
      outdoorPathString,
    } = analytics;

    const selectedDayIdx = (this._selectedHvacDayIndex !== undefined && this._selectedHvacDayIndex !== null) ? this._selectedHvacDayIndex : 9;
    const graphMode = this._hvacGraphMode || "multiday";
    const stepMinutes = parseInt(this._hvacTimelineRes || 15, 10);

    return html`
      <div class="passable-section-card chart-analytics-card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; gap:8px; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <div style="font-weight:800; font-size:0.85rem; letter-spacing:0.03em; text-transform:uppercase; color:var(--primary-text-color);">
              HVAC Runtime & History (${unitTitle.split('&')[0].trim()})
            </div>
            ${allowZoneSwitch && Array.isArray(modalSystems) && modalSystems.length > 1
              ? html`
                  <div class="stats-segmented">
                    ${modalSystems.map(
                      (sys) => html`
                        <button
                          type="button"
                          class="stats-seg-btn ${sys.key === unitKey ? "active" : ""}"
                          @click=${() => {
                            this._fireHaptic("light");
                            this._statsRuntimeZone = sys.key;
                            this._selectedHvacChunkIndex = null;
                            this._ensureHistoryFetched(sys.key, sys);
                          }}
                        >
                          ${(sys.name || sys.key).split("&")[0].trim()}
                        </button>
                      `
                    )}
                  </div>
                `
              : ""}
          </div>
          <div class="chart-mode-toggle-group">
            <button
              class="hvac-tab-btn ${graphMode === 'multiday' ? 'active' : ''}"
              style="padding:4px 10px; font-size:0.72rem; white-space:nowrap;"
              @click=${() => { this._hvacGraphMode = 'multiday'; this.requestUpdate(); }}
            >
              <ha-icon icon="mdi:chart-bar" style="--mdc-icon-size:13px; margin-right:4px;"></ha-icon>
              10-Day Bar
            </button>
            <button
              class="hvac-tab-btn ${graphMode === 'timeline' ? 'active' : ''}"
              style="padding:4px 10px; font-size:0.72rem; white-space:nowrap;"
              @click=${() => { this._hvacGraphMode = 'timeline'; this.requestUpdate(); }}
            >
              <ha-icon icon="mdi:chart-timeline-variant" style="--mdc-icon-size:13px; margin-right:4px;"></ha-icon>
              Today 24h
            </button>
          </div>
        </div>

        ${graphMode === 'timeline'
          ? html`
              <div style="display:flex; justify-content:flex-end; align-items:center; gap:4px; margin-bottom:8px;">
                <span style="font-size:0.65rem; color:var(--secondary-text-color); font-weight:700; margin-right:2px;">Res:</span>
                <div class="chart-mode-toggle-group" style="padding:3px;">
                  ${[5, 15, 30, 60].map(
                    (r) => html`
                      <button
                        class="hvac-tab-btn ${stepMinutes === r ? 'active' : ''}"
                        style="padding:3px 8px; font-size:0.65rem; border-radius:7px; white-space:nowrap;"
                        @click=${() => {
                          this._hvacTimelineRes = r;
                          this._selectedHvacChunkIndex = null;
                          this.requestUpdate();
                        }}
                      >
                        ${r === 60 ? '1h' : r + 'm'}
                      </button>
                    `
                  )}
                </div>
              </div>
            `
          : ''}

        ${graphMode === 'multiday'
          ? html`
              <div class="passable-stat-grid">
                <div class="passable-stat-block">
                  <span class="stat-block-label">HEATING (${activeDay.dayLabel})</span>
                  <span class="stat-block-val" style="color:#ea580c;">${activeDay.heat}<small>h</small></span>
                </div>
                <div class="passable-stat-block">
                  <span class="stat-block-label">COOLING (${activeDay.dayLabel})</span>
                  <span class="stat-block-val" style="color:#0284c7;">${activeDay.cool}<small>h</small></span>
                </div>
                <div class="passable-stat-block">
                  <span class="stat-block-label">AVG OUTDOOR</span>
                  <span class="stat-block-val" style="color:var(--primary-text-color);">${activeDay.avgTemp}<small>°F</small></span>
                </div>
              </div>

              ${isHeatingSeason
                ? html`<div style="font-size:0.68rem; color:var(--secondary-text-color); text-align:center; margin-bottom:4px;">
                    <ha-icon icon="mdi:arrow-down-bold-circle-outline" style="--mdc-icon-size:12px; color:#ea580c; vertical-align:middle;"></ha-icon>
                    Heating bars grow downward from 0.0h to align with colder outdoor temperatures
                  </div>`
                : ""}

              <div style="position:relative; width:100%; overflow:visible;">
                <svg viewBox="0 0 340 195" style="display:block; width:100%; height:auto; overflow:visible;">
                  <line x1="30" y1="20" x2="310" y2="20" stroke="${isHeatingSeason ? 'var(--secondary-text-color, rgba(148,163,184,0.45))' : 'var(--divider-color, rgba(148,163,184,0.25))'}" stroke-dasharray="${isHeatingSeason ? 'none' : '3 3'}"/>
                  <text x="5" y="24" fill="var(--secondary-text-color, #94a3b8)" font-size="10" font-weight="600">${runtimeYLabels.top}</text>
                  <text x="315" y="24" fill="var(--secondary-text-color, #94a3b8)" font-size="10" font-weight="600">${barYGridLabels.top}</text>

                  <line x1="30" y1="55" x2="310" y2="55" stroke="var(--divider-color, rgba(148,163,184,0.22))" stroke-dasharray="3 3"/>
                  <text x="5" y="59" fill="var(--secondary-text-color, #94a3b8)" font-size="10" font-weight="600">${runtimeYLabels.midHigh}</text>
                  <text x="315" y="59" fill="var(--secondary-text-color, #94a3b8)" font-size="10" font-weight="600">${barYGridLabels.midHigh}</text>

                  <line x1="30" y1="90" x2="310" y2="90" stroke="var(--divider-color, rgba(148,163,184,0.22))" stroke-dasharray="3 3"/>
                  <text x="5" y="94" fill="var(--secondary-text-color, #94a3b8)" font-size="10" font-weight="600">${runtimeYLabels.mid}</text>
                  <text x="315" y="94" fill="var(--secondary-text-color, #94a3b8)" font-size="10" font-weight="600">${barYGridLabels.mid}</text>

                  <line x1="30" y1="125" x2="310" y2="125" stroke="var(--divider-color, rgba(148,163,184,0.22))" stroke-dasharray="3 3"/>
                  <text x="5" y="129" fill="var(--secondary-text-color, #94a3b8)" font-size="10" font-weight="600">${runtimeYLabels.midLow}</text>
                  <text x="315" y="129" fill="var(--secondary-text-color, #94a3b8)" font-size="10" font-weight="600">${barYGridLabels.midLow}</text>

                  <line x1="30" y1="160" x2="310" y2="160" stroke="${isHeatingSeason ? 'var(--divider-color, rgba(148,163,184,0.25))' : 'var(--secondary-text-color, rgba(148,163,184,0.45))'}" stroke-dasharray="${isHeatingSeason ? '3 3' : 'none'}"/>
                  <text x="5" y="164" fill="var(--secondary-text-color, #94a3b8)" font-size="10" font-weight="600">${runtimeYLabels.bottom}</text>
                  <text x="315" y="164" fill="var(--secondary-text-color, #94a3b8)" font-size="10" font-weight="600">${barYGridLabels.bottom}</text>

                  ${historyData.map((d, i) => {
                    const runtimeVal = isHeatingSeason ? parseFloat(d.heat) : parseFloat(d.cool);
                    const rawHeight = (runtimeVal / maxGridHours) * 140;
                    const barHeight = runtimeVal > 0 ? Math.max(4, Math.min(140, rawHeight)) : 2;
                    const barY = isHeatingSeason ? 20 : (160 - barHeight);
                    return svg`
                      <rect
                        x="${d.cx - 7}"
                        y="${barY}"
                        width="14"
                        height="${barHeight}"
                        rx="3"
                        fill="${isHeatingSeason ? '#ea580c' : '#2563eb'}"
                        fill-opacity="${runtimeVal > 0 ? 0.9 : 0.35}"
                        stroke="${selectedDayIdx === i ? 'var(--primary-text-color, #38bdf8)' : '#38bdf8'}"
                        stroke-width="${selectedDayIdx === i ? 2.5 : (runtimeVal > 0 ? 1.2 : 0.6)}"
                        style="cursor:pointer;"
                        @click=${() => this._selectHvacHistoryDay(i)}
                      />
                    `;
                  })}

                  <path
                    d="${multiDayPathString}"
                    fill="none"
                    stroke="var(--primary-text-color, #94a3b8)"
                    stroke-width="2.5"
                    stroke-linecap="round"
                  />

                  <circle cx="${activeDay.cx}" cy="${activeDay.cy}" r="5" fill="var(--card-background-color, #ffffff)" stroke="${isHeatingSeason ? '#ea580c' : '#2563eb'}" stroke-width="2.5"/>
                  <g transform="translate(${Math.max(10, Math.min(290, activeDay.cx - 18))}, ${Math.max(8, activeDay.cy - 24)})">
                    <rect x="0" y="0" width="36" height="16" rx="4" fill="#0f172a" stroke="rgba(148,163,184,0.45)" stroke-width="0.8"/>
                    <text x="18" y="11" fill="#f8fafc" font-size="9" font-weight="800" text-anchor="middle">${activeDay.avgTemp}</text>
                  </g>

                  ${[0, 2, 4, 6, 8].map((i) => historyData[i] ? svg`
                    <text
                      x="${historyData[i].cx}"
                      y="176"
                      fill="${selectedDayIdx === i ? 'var(--primary-text-color, #38bdf8)' : 'var(--secondary-text-color, #94a3b8)'}"
                      font-size="9"
                      font-weight="${selectedDayIdx === i ? '700' : '400'}"
                      text-anchor="middle"
                      style="cursor:pointer;"
                      @click=${() => this._selectHvacHistoryDay(i)}
                    >
                      ${historyData[i].dayLabel}
                    </text>
                  ` : "")}
                </svg>
              </div>
            `
          : html`
              <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:8px; font-family:sans-serif;">
                <div>
                  <div style="font-size:1.4rem; font-weight:800; color:${isHeatingSeason ? '#ea580c' : '#0284c7'}; line-height:1;">
                    ${isHeatingSeason ? liveHeatToday : liveCoolToday}<span style="font-size:0.9rem; font-weight:600;">h</span>
                  </div>
                  <div style="font-size:0.65rem; color:var(--secondary-text-color);">Today ${isHeatingSeason ? 'Heating' : 'Cooling'} (${activeHourData.timeLabel})</div>
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; font-size:0.65rem; font-weight:600;">
                  <span style="color:var(--primary-text-color); display:flex; align-items:center; gap:3px;"><span style="display:inline-block; width:8px; height:2px; background:var(--primary-text-color);"></span> Outdoor (${liveOutdoorTempStr}°F)</span>
                  <span style="color:#ca8a04; display:flex; align-items:center; gap:3px;"><span style="display:inline-block; width:8px; height:2px; background:#eab308;"></span> Setpoint</span>
                  <span style="color:#0284c7; display:flex; align-items:center; gap:3px;"><span style="display:inline-block; width:8px; height:2px; background:#38bdf8;"></span> Indoor</span>
                  <span style="color:${isHeatingSeason ? '#ea580c' : '#0284c7'}; display:flex; align-items:center; gap:3px;"><span style="display:inline-block; width:6px; height:6px; background:${isHeatingSeason ? 'rgba(234,88,12,0.5)' : 'rgba(2,132,199,0.5)'}; border-radius:2px;"></span> Active</span>
                </div>
              </div>

              <div style="position:relative; width:100%; overflow:visible;">
                <svg
                  viewBox="0 0 340 178"
                  data-graph-drag="true"
                  style="display:block; width:100%; height:auto; overflow:visible; cursor:pointer;"
                  @click=${(e) => this._handleGraphClick(e, timelineData)}
                  @mousemove=${(e) => this._handleGraphDrag(e, timelineData)}
                  @touchmove=${(e) => this._handleGraphTouchDrag(e, timelineData)}
                >
                  <line x1="30" y1="20" x2="310" y2="20" stroke="var(--divider-color, rgba(148,163,184,0.22))" stroke-dasharray="3 3"/>
                  <text x="5" y="24" fill="var(--secondary-text-color, #94a3b8)" font-size="10" font-weight="600">${yGridLabels.top}</text>

                  <line x1="30" y1="50" x2="310" y2="50" stroke="var(--divider-color, rgba(148,163,184,0.22))" stroke-dasharray="3 3"/>
                  <text x="5" y="54" fill="var(--secondary-text-color, #94a3b8)" font-size="10" font-weight="600">${yGridLabels.midHigh}</text>

                  <line x1="30" y1="80" x2="310" y2="80" stroke="var(--divider-color, rgba(148,163,184,0.22))" stroke-dasharray="3 3"/>
                  <text x="5" y="84" fill="var(--secondary-text-color, #94a3b8)" font-size="10" font-weight="600">${yGridLabels.mid}</text>

                  <line x1="30" y1="110" x2="310" y2="110" stroke="var(--divider-color, rgba(148,163,184,0.22))" stroke-dasharray="3 3"/>
                  <text x="5" y="114" fill="var(--secondary-text-color, #94a3b8)" font-size="10" font-weight="600">${yGridLabels.midLow}</text>

                  <line x1="30" y1="140" x2="310" y2="140" stroke="var(--secondary-text-color, rgba(148,163,184,0.45))"/>
                  <text x="5" y="144" fill="var(--secondary-text-color, #94a3b8)" font-size="10" font-weight="600">${yGridLabels.bottom}</text>

                  <path
                    d="${activeBandsPath}"
                    fill="${isHeatingSeason ? 'rgba(249,115,22,0.30)' : 'rgba(56,189,248,0.30)'}"
                  />

                  <line x1="${activeHourData.cx}" y1="20" x2="${activeHourData.cx}" y2="140" stroke="var(--secondary-text-color, rgba(148,163,184,0.5))" stroke-dasharray="2 2"/>

                  <path
                    d="${outdoorPathString}"
                    fill="none"
                    stroke="var(--primary-text-color, #94a3b8)"
                    stroke-width="2"
                    stroke-dasharray="4 3"
                    stroke-linecap="round"
                  />

                  <path d="${setpointPathString}" fill="none" stroke="#eab308" stroke-width="2.2"/>
                  <path d="${indoorPathString}" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"/>

                  <circle cx="${activeHourData.cx}" cy="${activeHourData.outdoorY}" r="4" fill="var(--primary-text-color, #94a3b8)" stroke="var(--card-background-color, #ffffff)" stroke-width="1.5"/>
                  <circle cx="${activeHourData.cx}" cy="${activeHourData.setpointY}" r="4" fill="#eab308" stroke="var(--card-background-color, #ffffff)" stroke-width="1.5"/>
                  <circle cx="${activeHourData.cx}" cy="${activeHourData.indoorY}" r="5" fill="#38bdf8" stroke="var(--card-background-color, #ffffff)" stroke-width="2"/>

                  <g transform="translate(${ttX}, ${ttY})">
                    <rect x="0" y="0" width="${activeRunRangeStr ? 144 : 126}" height="${activeRunRangeStr ? 52 : 44}" rx="6" fill="rgba(15,23,42,0.95)" stroke="rgba(148,163,184,0.4)" stroke-width="1.2"/>
                    <text x="7" y="13" fill="#f8fafc" font-size="9" font-weight="700">${activeHourData.timeLabel}</text>
                    <text x="${activeRunRangeStr ? 137 : 119}" y="13" fill="#38bdf8" font-size="9" font-weight="800" text-anchor="end">In: ${activeHourData.indoorTemp}°F</text>
                    <text x="7" y="26" fill="${activeHourData.isActive ? (isHeatingSeason ? '#f97316' : '#38bdf8') : '#94a3b8'}" font-size="8" font-weight="600">
                      ${activeHourData.isActive ? (isHeatingSeason ? 'Heating Active' : 'Cooling Active') : 'Idle'}
                    </text>
                    <text x="${activeRunRangeStr ? 137 : 119}" y="26" fill="#eab308" font-size="8.5" font-weight="800" text-anchor="end">Set: ${activeHourData.setpoint}°F</text>
                    <text x="7" y="37" fill="#cbd5e1" font-size="8" font-weight="500">Out: ${activeHourData.outdoorTemp}°F</text>
                    ${activeRunRangeStr ? svg`<text x="7" y="47" fill="#38bdf8" font-size="7.5" font-weight="700">Ran ${activeRunRangeStr}</text>` : ''}
                  </g>

                  ${timelineData.map(
                    (pt) => svg`
                      <rect
                        x="${pt.cx - (280 / Math.max(1, timelineData.length - 1)) / 2}"
                        y="20"
                        width="${Math.max(3, 280 / Math.max(1, timelineData.length - 1))}"
                        height="120"
                        fill="rgba(0,0,0,0.001)"
                        pointer-events="all"
                        style="cursor:pointer;"
                        @click=${() => this._selectTimelineChunk(pt.idx)}
                      />
                    `
                  )}

                  ${(xLabels || []).map(
                    (xl) => xl ? svg`
                      <text
                        x="${xl.cx}"
                        y="162"
                        fill="${selectedChunkIdx === xl.idx ? 'var(--primary-text-color, #38bdf8)' : 'var(--secondary-text-color, #94a3b8)'}"
                        font-size="8.5"
                        font-weight="${selectedChunkIdx === xl.idx ? '700' : '400'}"
                        text-anchor="middle"
                        style="cursor:pointer;"
                        @click=${() => this._selectTimelineChunk(xl.idx)}
                      >
                        ${xl.timeLabel}
                      </text>
                    ` : ''
                  )}
                </svg>
              </div>
            `}
      </div>
    `;
  }

  _renderStatsTempsTab(data, modalSystems) {
    const visibleZones = this._statsZone === "all"
      ? (data?.zones || [])
      : (data?.zones || []).filter((z) => z.key === this._statsZone);
    const scopeSensors = this._statsZone === "all"
      ? (data?.sensors || [])
      : (data?.sensors || []).filter((s) => s.zoneKey === this._statsZone);
    const hiddenMap = this._statsHiddenSensors || {};
    const visibleSensors = scopeSensors.filter((s) => !hiddenMap[s.entityId]);
    const timestamps = data?.timestampsMs || [];

    if (scopeSensors.length === 0) {
      return html`
        <div class="advisor-empty-sim">
          No room temperature sensors discovered for this selection.
        </div>
      `;
    }

    const indoorVals = [];
    visibleSensors.forEach((s) => {
      (s.series || []).forEach((v) => v !== null && indoorVals.push(v));
      if (s.currentTemp !== null) indoorVals.push(s.currentTemp);
    });
    if (this._statsShowSetpoint) {
      visibleZones.forEach((z) => {
        (z.setpointSeries || []).forEach((v) => v !== null && indoorVals.push(v));
        if (z.liveSetpoint !== null) indoorVals.push(z.liveSetpoint);
      });
    }

    const outSeries = data?.outdoor?.series || [];
    const hasOutdoorData = outSeries.some((v) => v !== null && !isNaN(Number(v)));
    const showOutdoorAxis = this._statsShowOutdoor !== false && hasOutdoorData;

    const indoorAxis = this._computeTempAxis(indoorVals, 4, 1);
    const outdoorAxis = showOutdoorAxis ? this._computeTempAxis(outSeries, 6, 2) : null;

    const svgW = 560;
    const svgH = 220;
    const padLeft = 38;
    const padRight = showOutdoorAxis ? 36 : 14;
    const padTop = 14;
    const plotH = 176;
    const y0 = padTop + plotH;
    const plotW = svgW - padLeft - padRight;

    const startMs = data.startMs || timestamps[0] || Date.now() - 86400000;
    const endMs = data.endMs || timestamps[timestamps.length - 1] || Date.now();
    const spanMs = Math.max(1, endMs - startMs);
    const toTimeX = (ms) => padLeft + Math.max(0, Math.min(1, (ms - startMs) / spanMs)) * plotW;
    const toIndoorY = (v) =>
      padTop + plotH - Math.max(0, Math.min(1, (Number(v) - indoorAxis.yMin) / Math.max(1, indoorAxis.yMax - indoorAxis.yMin))) * plotH;
    const toOutdoorY = (v) =>
      outdoorAxis
        ? padTop + plotH - Math.max(0, Math.min(1, (Number(v) - outdoorAxis.yMin) / Math.max(1, outdoorAxis.yMax - outdoorAxis.yMin))) * plotH
        : y0;

    const tickFracs = (data.hours || 24) >= 168 ? [0, 1 / 7, 2 / 7, 3 / 7, 4 / 7, 5 / 7, 6 / 7, 1] : [0, 0.25, 0.5, 0.75, 1];
    const hoverIdx = this._statsHoverIdx?.temps;
    const hasHover = hoverIdx !== null && hoverIdx !== undefined && hoverIdx >= 0 && hoverIdx < timestamps.length;
    const hoverTs = hasHover ? timestamps[hoverIdx] : null;
    const hoverX = hasHover ? toTimeX(hoverTs) : 0;
    const hoverOutdoorVal = hasHover && showOutdoorAxis ? outSeries[hoverIdx] : null;
    const hoverRooms = hasHover
      ? visibleSensors
          .map((s) => ({ sensor: s, val: s.series?.[hoverIdx] }))
          .filter((e) => e.val !== null && e.val !== undefined)
          .sort((a, b) => b.val - a.val)
      : [];

    const controlsUnitKey = this._statsZone !== "all" ? this._statsZone : (visibleZones[0]?.key || modalSystems[0]?.key || "upstairs");
    const hiddenCount = scopeSensors.length - visibleSensors.length;

    return html`
      <div class="stats-compare-toolbar">
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <button
            type="button"
            class="stats-chip-toggle ${this._statsShowOutdoor !== false ? "active" : ""}"
            @click=${() => {
              this._fireHaptic("light");
              this._statsShowOutdoor = this._statsShowOutdoor === false;
            }}
          >
            <span class="stats-legend-dash" style="border-color:#94a3b8;"></span>
            <span>Outdoor${data?.outdoor?.liveTemp != null ? ` (${data.outdoor.liveTemp}°)` : ""}</span>
          </button>
          <button
            type="button"
            class="stats-chip-toggle ${this._statsShowSetpoint !== false ? "active-amber" : ""}"
            @click=${() => {
              this._fireHaptic("light");
              this._statsShowSetpoint = this._statsShowSetpoint === false;
            }}
          >
            <span class="stats-legend-dash" style="border-color:#eab308;"></span>
            <span>Setpoint & Runs</span>
          </button>
        </div>

        <button
          type="button"
          class="stats-tune-btn"
          @click=${() => this._showHvacModal(controlsUnitKey, "setpoints")}
        >
          Zone Controls →
        </button>
      </div>

      <div class="passable-section-card">
        <div class="stats-scrub-bar">
          ${hasHover
            ? html`
                <span class="stats-scrub-time">${this._formatStatsTooltipTime(hoverTs, data.hours)}</span>
                ${hoverOutdoorVal != null
                  ? html`<span class="stats-scrub-item">Out: <strong>${hoverOutdoorVal}°</strong></span>`
                  : ""}
                ${this._statsShowSetpoint !== false
                  ? visibleZones.map((z) => {
                      const sp = z.setpointSeries?.[hoverIdx];
                      if (sp == null) return "";
                      return html`<span class="stats-scrub-item" style="color:#eab308;">${visibleZones.length > 1 ? `${z.name.split("&")[0].trim()} ` : ""}Set: <strong>${sp}°</strong></span>`;
                    })
                  : ""}
                ${hoverRooms.slice(0, 4).map(
                  (e) => html`
                    <span class="stats-scrub-item">
                      <span class="stats-legend-dot" style="background:${e.sensor.color};"></span>
                      ${e.sensor.cleanName}: <strong>${e.val}°</strong>
                    </span>
                  `
                )}
              `
            : html`
                <span class="stats-scrub-hint">
                  Hover or drag chart to inspect readings • Tap chips below to isolate rooms
                </span>
                ${data?.outdoor?.min != null && data?.outdoor?.max != null
                  ? html`<span class="stats-scrub-summary">Out ${data.outdoor.min}°–${data.outdoor.max}°</span>`
                  : ""}
              `}
        </div>

        <svg
          viewBox="0 0 ${svgW} ${svgH}"
          class="stats-svg stats-chart-interactive"
          data-graph-drag="true"
          role="img"
          aria-label="Multi-room temperature and climate history"
          @mousemove=${(ev) => this._handleStatsChartScrub("temps", ev, padLeft, plotW, svgW, data)}
          @mouseleave=${() => this._clearStatsChartScrub("temps")}
          @touchstart=${(ev) => this._handleStatsChartScrub("temps", ev, padLeft, plotW, svgW, data)}
          @touchmove=${(ev) => this._handleStatsChartScrub("temps", ev, padLeft, plotW, svgW, data)}
          @touchend=${() => this._clearStatsChartScrub("temps")}
          @touchcancel=${() => this._clearStatsChartScrub("temps")}
        >
          ${(data.nightBands || []).map((b) => {
            const x1 = toTimeX(b.startMs);
            const x2 = toTimeX(b.endMs);
            const w = x2 - x1;
            if (w <= 0.5) return "";
            return svg`<rect x="${x1.toFixed(1)}" y="${padTop}" width="${w.toFixed(1)}" height="${plotH}" fill="rgba(99, 102, 241, 0.08)"></rect>`;
          })}

          ${this._statsShowSetpoint !== false
            ? visibleZones.map((z, zIdx) => {
                const bandCount = Math.max(1, visibleZones.length);
                const bandH = plotH / bandCount;
                const bandTop = padTop + zIdx * bandH;
                return (z.actionBands || []).map((ab) => {
                  const x1 = toTimeX(ab.startMs);
                  const x2 = toTimeX(ab.endMs);
                  const w = Math.max(1.5, x2 - x1);
                  const fill = ab.action === "heating" ? "rgba(249, 115, 22, 0.16)" : "rgba(56, 189, 248, 0.16)";
                  return svg`<rect x="${x1.toFixed(1)}" y="${bandTop.toFixed(1)}" width="${w.toFixed(1)}" height="${bandH.toFixed(1)}" fill="${fill}"></rect>`;
                });
              })
            : ""}

          ${tickFracs.map((frac, idx) => {
            const ts = startMs + frac * spanMs;
            const x = toTimeX(ts);
            const anchor = idx === 0 ? "start" : idx === tickFracs.length - 1 ? "end" : "middle";
            return svg`
              <line x1="${x.toFixed(1)}" y1="${padTop}" x2="${x.toFixed(1)}" y2="${y0}" stroke="rgba(148, 163, 184, 0.14)" stroke-dasharray="3 3" stroke-width="1"></line>
              <text x="${x.toFixed(1)}" y="${y0 + 15}" text-anchor="${anchor}" fill="var(--secondary-text-color)" font-size="9.5">${this._formatStatsAxisTime(ts, data.hours)}</text>
            `;
          })}

          ${indoorAxis.ticks.map((t) => {
            const y = toIndoorY(t);
            return svg`
              <line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${padLeft + plotW}" y2="${y.toFixed(1)}" stroke="rgba(148, 163, 184, 0.16)" stroke-dasharray="3 3" stroke-width="1"></line>
              <text x="${padLeft - 5}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" fill="var(--secondary-text-color)" font-size="9.5">${t}°</text>
            `;
          })}

          ${showOutdoorAxis && outdoorAxis
            ? outdoorAxis.ticks.map((t) => {
                const y = toOutdoorY(t);
                return svg`
                  <text x="${padLeft + plotW + 5}" y="${(y + 3.5).toFixed(1)}" text-anchor="start" fill="#94a3b8" font-size="9">${t}°</text>
                `;
              })
            : ""}

          ${showOutdoorAxis
            ? this._buildStatsPolylines(outSeries, timestamps, toTimeX, toOutdoorY).map(
                (pts) => svg`
                  <polyline
                    fill="none"
                    stroke="#94a3b8"
                    stroke-opacity="0.75"
                    stroke-width="1.6"
                    stroke-dasharray="4 3"
                    stroke-linecap="round"
                    points="${pts}"
                  ></polyline>
                `
              )
            : ""}

          ${this._statsShowSetpoint !== false
            ? visibleZones.map((z, idx) => {
                const spColor = idx === 0 ? "#eab308" : "#f59e0b";
                return this._buildStatsPolylines(z.setpointSeries, timestamps, toTimeX, toIndoorY).map(
                  (pts) => svg`
                    <polyline
                      fill="none"
                      stroke="${spColor}"
                      stroke-opacity="0.88"
                      stroke-width="1.8"
                      stroke-dasharray="5 3"
                      points="${pts}"
                    ></polyline>
                  `
                );
              })
            : ""}

          ${visibleSensors.map((s) =>
            this._buildStatsPolylines(s.series, timestamps, toTimeX, toIndoorY).map(
              (pts) => svg`
                <polyline
                  fill="none"
                  stroke="${s.color}"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  points="${pts}"
                ></polyline>
              `
            )
          )}

          ${hasHover
            ? svg`
                <line x1="${hoverX.toFixed(1)}" y1="${padTop}" x2="${hoverX.toFixed(1)}" y2="${y0}" stroke="var(--primary-text-color)" stroke-opacity="0.45" stroke-width="1.2"></line>
                ${hoverOutdoorVal != null
                  ? svg`<circle cx="${hoverX.toFixed(1)}" cy="${toOutdoorY(hoverOutdoorVal).toFixed(1)}" r="3.5" fill="#94a3b8" stroke="#ffffff" stroke-width="1.2"></circle>`
                  : ""}
                ${hoverRooms.map(
                  (e) => svg`<circle cx="${hoverX.toFixed(1)}" cy="${toIndoorY(e.val).toFixed(1)}" r="3.8" fill="${e.sensor.color}" stroke="#ffffff" stroke-width="1.3"></circle>`
                )}
              `
            : ""}
        </svg>

        <div class="stats-compare-legend" style="margin-top:4px;">
          ${scopeSensors.map((s) => {
            const isHidden = Boolean(hiddenMap[s.entityId]);
            return html`
              <div class="stats-compare-chip ${isHidden ? "hidden-series" : ""}">
                <button
                  type="button"
                  class="stats-compare-toggle"
                  @click=${() => {
                    this._fireHaptic("light");
                    this._statsHiddenSensors = {
                      ...(this._statsHiddenSensors || {}),
                      [s.entityId]: !isHidden,
                    };
                  }}
                  title="${isHidden ? "Show" : "Hide"} ${s.cleanName}"
                >
                  <span class="stats-legend-dot" style="background:${s.color};"></span>
                  <span>${s.cleanName}</span>
                  <span class="stats-compare-val">${s.currentTemp !== null ? `${s.currentTemp.toFixed(1)}°` : "--"}</span>
                </button>
                <button
                  type="button"
                  class="stats-compare-jump"
                  @click=${() => this._showMoreInfo(s.entityId)}
                  title="Open ${s.cleanName} entity history"
                >
                  ↗
                </button>
              </div>
            `;
          })}
          ${hiddenCount > 0
            ? html`
                <button
                  type="button"
                  class="stats-tune-btn"
                  @click=${() => {
                    this._fireHaptic("light");
                    this._statsHiddenSensors = {};
                  }}
                >
                  Show All (${scopeSensors.length})
                </button>
              `
            : ""}
        </div>
      </div>
    `;
  }

  _renderStatsBalanceTab(data) {
    const visibleZones = this._statsZone === "all"
      ? (data?.zones || [])
      : (data?.zones || []).filter((z) => z.key === this._statsZone);
    const scopeSensors = (this._statsZone === "all"
      ? (data?.sensors || [])
      : (data?.sensors || []).filter((s) => s.zoneKey === this._statsZone)
    ).filter((s) => s.currentTemp !== null);

    if (scopeSensors.length === 0) {
      return html`<div class="advisor-empty-sim">No live room temperatures available for balance analysis.</div>`;
    }

    const sortedByTemp = [...scopeSensors].sort((a, b) => b.currentTemp - a.currentTemp);
    const warmest = sortedByTemp[0];
    const coolest = sortedByTemp[sortedByTemp.length - 1];
    const spread = Math.round((warmest.currentTemp - coolest.currentTemp) * 10) / 10;

    const zoneByKey = Object.fromEntries(visibleZones.map((z) => [z.key, z]));
    const allDeltas = scopeSensors
      .map((s) => {
        const sp = zoneByKey[s.zoneKey]?.liveSetpoint;
        return sp != null ? s.currentTemp - sp : null;
      })
      .filter((d) => d !== null);
    const meanDelta = allDeltas.length > 0
      ? allDeltas.reduce((a, b) => a + b, 0) / allDeltas.length
      : null;
    const maxScale = Math.max(3, Math.ceil(Math.max(1, ...allDeltas.map((d) => Math.abs(d))) + 0.5));

    return html`
      <div class="stats-mini-metrics" style="grid-template-columns: repeat(3, minmax(0, 1fr));">
        <div class="stats-mini-metric">
          <span class="mini-label">Warmest Room</span>
          <span class="mini-val" style="color:#f97316;">${warmest.cleanName} (${warmest.currentTemp.toFixed(1)}°)</span>
        </div>
        <div class="stats-mini-metric">
          <span class="mini-label">Coolest Room</span>
          <span class="mini-val" style="color:#38bdf8;">${coolest.cleanName} (${coolest.currentTemp.toFixed(1)}°)</span>
        </div>
        <div class="stats-mini-metric">
          <span class="mini-label">Home Spread • Avg Δ</span>
          <span class="mini-val">
            Δ${spread.toFixed(1)}°${meanDelta !== null ? ` • ${meanDelta >= 0 ? "+" : ""}${meanDelta.toFixed(1)}°` : ""}
          </span>
        </div>
      </div>

      ${visibleZones.map((zm) => {
        const zSensors = scopeSensors
          .filter((s) => s.zoneKey === zm.key)
          .map((s) => {
            const delta = zm.liveSetpoint != null ? Math.round((s.currentTemp - zm.liveSetpoint) * 10) / 10 : null;
            return { ...s, delta };
          })
          .sort((a, b) => (b.delta ?? b.currentTemp) - (a.delta ?? a.currentTemp));
        if (zSensors.length === 0) return "";
        const actLabel = zm.action === "heating" ? "Heating" : zm.action === "cooling" ? "Cooling" : zm.action === "fan" ? "Fan" : "Idle";

        return html`
          <div class="passable-section-card">
            <div class="passable-section-header" style="margin-bottom:8px;">
              <div class="passable-section-title">
                <span>${zm.name}</span>
              </div>
              <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                ${zm.liveSetpoint != null
                  ? html`<span class="zone-inline-chip neutral">Set ${zm.liveSetpoint}°F</span>`
                  : ""}
                <span class="zone-inline-chip ${zm.action === "heating" ? "warning" : (zm.action === "cooling" ? "info" : "neutral")}">${actLabel}</span>
              </div>
            </div>

            <div class="stats-balance-list">
              ${zSensors.map((s) => {
                const d = s.delta;
                const toneClass = d == null ? "balanced" : (d > 0.5 ? "warm" : (d < -0.5 ? "cool" : "balanced"));
                const barWidthPct = d == null ? 0 : Math.min(50, (Math.abs(d) / maxScale) * 50);
                const barLeftPct = d == null ? 50 : (d >= 0 ? 50 : 50 - barWidthPct);

                let rangeStyle = "";
                if (zm.liveSetpoint != null && s.min != null && s.max != null) {
                  const minD = Math.max(-maxScale, Math.min(maxScale, s.min - zm.liveSetpoint));
                  const maxD = Math.max(-maxScale, Math.min(maxScale, s.max - zm.liveSetpoint));
                  const leftPct = 50 + (minD / maxScale) * 50;
                  const rightPct = 50 + (maxD / maxScale) * 50;
                  rangeStyle = `left:${leftPct.toFixed(1)}%; width:${Math.max(1.5, rightPct - leftPct).toFixed(1)}%;`;
                }

                return html`
                  <button
                    type="button"
                    class="stats-balance-row"
                    @click=${() => this._showMoreInfo(s.entityId)}
                    title="${s.name} — tap for entity history"
                  >
                    <div class="stats-balance-top">
                      <div class="stats-usage-name-wrap">
                        <span class="stats-legend-dot" style="background:${s.color};"></span>
                        <span class="stats-usage-name">${s.cleanName}</span>
                        <span class="zone-inline-chip ${s.isLimiting ? "warning" : (s.isActive ? "info" : "neutral")}">
                          ${s.isLimiting ? "Limiting" : (s.isActive ? "Active" : "Standby")}
                        </span>
                        ${s.passiveRate
                          ? html`<span class="stats-balance-drift">${s.passiveRate}</span>`
                          : ""}
                      </div>
                      <div class="stats-balance-vals">
                        <span class="stats-balance-temp">${s.currentTemp.toFixed(1)}°F</span>
                        ${d != null
                          ? html`<span class="stats-delta-pill ${toneClass}">${d >= 0 ? "+" : ""}${d.toFixed(1)}°</span>`
                          : ""}
                      </div>
                    </div>

                    <div class="stats-balance-track">
                      <span class="stats-balance-zero"></span>
                      ${rangeStyle
                        ? html`<span class="stats-balance-whisker" style="${rangeStyle}"></span>`
                        : ""}
                      ${d != null
                        ? html`<span class="stats-balance-fill ${toneClass}" style="left:${barLeftPct.toFixed(1)}%; width:${Math.max(1.5, barWidthPct).toFixed(1)}%;"></span>`
                        : ""}
                    </div>
                  </button>
                `;
              })}
            </div>
          </div>
        `;
      })}
    `;
  }

  _renderStatsRuntimeTab(modalSystems) {
    const scopeSystems = this._statsZone === "all"
      ? modalSystems
      : modalSystems.filter((s) => s.key === this._statsZone);
    const runtimeZoneKey = this._statsZone !== "all"
      ? this._statsZone
      : (this._statsRuntimeZone && modalSystems.some((s) => s.key === this._statsRuntimeZone)
          ? this._statsRuntimeZone
          : (modalSystems[0]?.key || "upstairs"));
    const runtimeSys = modalSystems.find((s) => s.key === runtimeZoneKey) || modalSystems[0] || { key: runtimeZoneKey };
    const runtimeTitle = runtimeSys.name || (runtimeZoneKey === "downstairs" ? "Downstairs & Basement" : "Upstairs & Attic");

    const winRecObj = this._getEntity(this.config?.window_recommendation_entity || "sensor.passable_climate_window_recommendation");
    const outlookText = runtimeSys && this._statsZone !== "all"
      ? (winRecObj?.attributes?.zone_outlook_summaries?.[runtimeZoneKey] || winRecObj?.attributes?.daily_outlook_summary)
      : (winRecObj?.attributes?.daily_outlook_summary || winRecObj?.state);

    return html`
      ${this._renderRuntimeChartCard(
        runtimeZoneKey,
        runtimeSys,
        runtimeTitle,
        modalSystems,
        this._statsZone === "all"
      )}

      <div class="passable-section-card">
        <div class="passable-section-header" style="margin-bottom:8px;">
          <div class="passable-section-title">
            <ha-icon icon="mdi:lightning-bolt" style="--mdc-icon-size:17px; color:#f59e0b;"></ha-icon>
            <span>ZONE POWER, RECIRCULATION & FILTERS</span>
          </div>
        </div>
        <div class="stats-usage-list">
          ${scopeSystems.map((sys) => {
            const b = this._getZoneRuntimeBundle(sys.key, sys);
            const title = sys.name || sys.key;
            const recircOn = b.fanCircActiveObj?.state === "on";
            const fm = b.filterMetrics;
            return html`
              <div class="stats-zone-health-row">
                <div class="stats-usage-row-top">
                  <span class="stats-usage-name">${title}</span>
                  <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
                    <button
                      type="button"
                      class="zone-inline-chip ${b.zonePower.totalW > 300 ? "warning" : "neutral"} clickable"
                      @click=${() => b.zonePower.entityIds?.[0] && this._showMoreInfo(b.zonePower.entityIds[0])}
                    >
                      ${b.zonePower.formatted || "--"}${b.zonePower.hasPower ? ` (AH ${b.zonePower.airHandlerW != null ? Math.round(b.zonePower.airHandlerW) : "--"}W)` : ""}
                    </button>
                    <button
                      type="button"
                      class="zone-inline-chip ${recircOn ? "info" : "neutral"} clickable"
                      @click=${() => this._showHvacModal(sys.key, "setpoints")}
                      title="Open Zone Controls to adjust Fan Recirculation"
                    >
                      Fan ${recircOn ? "Active" : "Standby"}${b.fanMinVal != null ? ` • ${b.fanMinVal}m/h` : ""}
                    </button>
                    ${fm.percentRemaining !== null
                      ? html`
                          <button
                            type="button"
                            class="zone-inline-chip ${fm.isExpired ? "danger" : (fm.isLow ? "warning" : "neutral")} clickable"
                            @click=${() => this._showHvacModal(sys.key, "filter")}
                            title="Open Filter Maintenance"
                          >
                            Filter ${fm.percentRemaining}%${fm.remHours != null ? ` (${Math.round(fm.remHours)}h)` : ""}
                          </button>
                        `
                      : ""}
                  </div>
                </div>
                ${fm.percentRemaining !== null
                  ? html`
                      <div class="filter-progress-track" style="height:6px; margin-top:4px;">
                        <div
                          class="filter-progress-fill ${fm.isExpired ? "danger" : (fm.isLow ? "warn" : "good")}"
                          style="width:${Math.max(2, fm.percentRemaining)}%;"
                        ></div>
                      </div>
                    `
                  : ""}
              </div>
            `;
          })}
        </div>
      </div>

      ${outlookText && outlookText !== "unavailable" && outlookText !== "unknown"
        ? html`
            <div class="passable-section-card">
              <div style="font-size:0.78rem; line-height:1.45; color:var(--primary-text-color); margin-bottom:8px;">
                ${outlookText}
              </div>
              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button
                  type="button"
                  class="stats-tune-btn"
                  @click=${() => this._showHvacModal(runtimeZoneKey, "setpoints")}
                >
                  Open Zone Controls →
                </button>
                <button
                  type="button"
                  class="stats-tune-btn"
                  @click=${() => this._showHvacModal(runtimeZoneKey, "advisor")}
                >
                  Advisor & Comfort →
                </button>
              </div>
            </div>
          `
        : ""}
    `;
  }

  _renderStatsModal(systems = []) {
    if (!this._statsModalOpen) return html``;

    const modalSystems = Array.isArray(systems) && systems.length > 0 ? systems : this._getHvacSystems();
    const reqHours = [6, 24, 168].includes(Number(this._statsHours)) ? Number(this._statsHours) : 24;
    const hoursLabel = reqHours === 168 ? "7d" : `${reqHours}h`;
    const cachedEntry = this._statsCache?.[reqHours];
    const data = cachedEntry?.data || null;

    const scopeSystems = this._statsZone === "all"
      ? modalSystems
      : modalSystems.filter((s) => s.key === this._statsZone);
    const activeSys = scopeSystems[0] || modalSystems[0];

    const scopeBundles = scopeSystems.map((sys) => ({
      sys,
      bundle: this._getZoneRuntimeBundle(sys.key, sys),
    }));

    const homeAvg = this._getHomeAverageTemp(modalSystems);
    const scopeTempVal = this._statsZone === "all"
      ? homeAvg.temp
      : scopeBundles[0]?.bundle?.zoneClimate?.currentTemp ?? null;
    const scopeSensorsLive = (data?.sensors || [])
      .filter((s) => this._statsZone === "all" || s.zoneKey === this._statsZone)
      .map((s) => s.currentTemp)
      .filter((t) => typeof t === "number" && !isNaN(t));
    const spreadSub = scopeSensorsLive.length >= 2
      ? `Spread Δ${(Math.max(...scopeSensorsLive) - Math.min(...scopeSensorsLive)).toFixed(1)}° (${Math.min(...scopeSensorsLive).toFixed(1)}–${Math.max(...scopeSensorsLive).toFixed(1)}°)`
      : (activeSys?.name || "All rooms");

    const sumHeat = Math.round(scopeBundles.reduce((a, x) => a + (x.bundle.liveHeatToday || 0), 0) * 10) / 10;
    const sumCool = Math.round(scopeBundles.reduce((a, x) => a + (x.bundle.liveCoolToday || 0), 0) * 10) / 10;
    const fanVals = scopeBundles.map((x) => x.bundle.liveFanToday).filter((v) => v !== null);
    const sumFan = fanVals.length > 0 ? Math.round(fanVals.reduce((a, b) => a + b, 0) * 10) / 10 : null;

    const cycleVals = scopeBundles
      .map((x) => (x.bundle.liveCyclesPerHr !== null ? parseFloat(x.bundle.liveCyclesPerHr) : null))
      .filter((v) => v !== null && !isNaN(v));
    const cyclesStr = cycleVals.length === 1
      ? `${cycleVals[0].toFixed(1)}/hr`
      : (cycleVals.length > 1 ? `${Math.max(...cycleVals).toFixed(1)}/hr` : "--");
    const activeEquipList = scopeBundles.map((x) => x.bundle.zoneClimate.equipmentRunning).filter(Boolean);
    const driftVals = scopeBundles
      .map((x) => {
        const v = parseFloat(x.bundle.zoneRateObj?.state);
        return !isNaN(v) ? v : null;
      })
      .filter((v) => v !== null);
    const cyclesSub = activeEquipList.length > 0
      ? activeEquipList.join(" • ")
      : (driftVals.length > 0
          ? `Drift ${driftVals[0] >= 0 ? "+" : ""}${driftVals[0].toFixed(2)}°/h`
          : "Idle");

    const totalPowerSummary = this._statsZone === "all"
      ? this._getTotalHvacPower(modalSystems)
      : {
          watts: scopeBundles[0]?.bundle?.zonePower?.totalW ?? null,
          formatted: scopeBundles[0]?.bundle?.zonePower?.formatted || null,
          entityId: scopeBundles[0]?.bundle?.zonePower?.entityIds?.[0] || null,
        };
    const singlePower = scopeBundles[0]?.bundle?.zonePower;
    const anyRecircOn = scopeBundles.some((x) => x.bundle.fanCircActiveObj?.state === "on");
    const powerSub = this._statsZone !== "all" && singlePower
      ? `AH ${singlePower.airHandlerW != null ? Math.round(singlePower.airHandlerW) : "--"}W • Cond ${singlePower.condenserW != null ? Math.round(singlePower.condenserW) : "--"}W`
      : (scopeBundles.length > 1
          ? scopeBundles.map((x) => {
              const tag = x.sys.key === "downstairs" ? "Dn" : (x.sys.key === "upstairs" ? "Up" : (x.sys.key || "").slice(0, 2));
              return `${tag} ${x.bundle.zonePower.formatted || "--"}`;
            }).join(" • ") + (anyRecircOn ? " • Recirc" : "")
          : (anyRecircOn ? "Fan Recirc Active" : "SPAN Total"));

    const tabs = [
      { id: "temps", label: "Temperatures", icon: "mdi:thermometer-lines" },
      { id: "balance", label: "Room Balance", icon: "mdi:scale-balance" },
      { id: "runtime", label: "Runtime & Power", icon: "mdi:chart-bar" },
    ];
    const sensorCount = (data?.sensors || []).length;

    return html`
      <div class="popup-overlay" @click=${(ev) => ev.target === ev.currentTarget && this._closeStatsModal()}>
        <div
          class="popup-content stats-modal"
          @click=${(e) => e.stopPropagation()}
          @touchstart=${this._handleTouchStart}
          @touchmove=${this._handleTouchMove}
          @touchend=${this._handleTouchEnd}
          @touchcancel=${this._handleTouchCancel}
        >
          <div class="drag-handle"></div>

          <div class="popup-header">
            <div class="popup-header-left">
              <div class="hvac-stats-icon-box">
                <ha-icon icon="mdi:chart-line" style="--mdc-icon-size:20px;"></ha-icon>
              </div>
              <div>
                <h3>HVAC & Climate Stats</h3>
                <div class="popup-header-sub">
                  Last ${hoursLabel} • ${modalSystems.length} Zone${modalSystems.length === 1 ? "" : "s"}${sensorCount > 0 ? ` • ${sensorCount} Sensors` : ""}
                </div>
              </div>
            </div>

            <div class="popup-header-actions">
              <div class="stats-segmented">
                ${[
                  { h: 6, label: "6h" },
                  { h: 24, label: "24h" },
                  { h: 168, label: "7d" },
                ].map(
                  (opt) => html`
                    <button
                      type="button"
                      class="stats-seg-btn ${reqHours === opt.h ? "active" : ""}"
                      @click=${() => {
                        this._fireHaptic("light");
                        if (reqHours !== opt.h) {
                          this._statsHours = opt.h;
                          this._statsHoverIdx = {};
                          this._fetchClimateStats(opt.h, false);
                        }
                      }}
                    >
                      ${opt.label}
                    </button>
                  `
                )}
              </div>

              <button
                type="button"
                class="icon-circle-btn ${this._statsLoading ? "spinning" : ""}"
                @click=${() => {
                  this._fireHaptic("light");
                  this._fetchClimateStats(reqHours, true);
                  const rtKey = this._statsZone !== "all" ? this._statsZone : (this._statsRuntimeZone || modalSystems[0]?.key);
                  const rtSys = modalSystems.find((s) => s.key === rtKey);
                  if (rtKey && rtSys) {
                    if (this._hvacHistoryCache?.[rtKey]) delete this._hvacHistoryCache[rtKey];
                    this._ensureHistoryFetched(rtKey, rtSys);
                  }
                }}
                title="Refresh stats"
                aria-label="Refresh stats"
              >
                <ha-icon icon="mdi:refresh" style="--mdc-icon-size:16px;"></ha-icon>
              </button>

              <button
                type="button"
                class="icon-circle-btn"
                @click=${() => {
                  const targetUnit = this._statsZone !== "all"
                    ? this._statsZone
                    : (this._statsRuntimeZone || modalSystems[0]?.key || "upstairs");
                  this._showHvacModal(targetUnit, this._lastHvacControlsTab || "setpoints");
                }}
                title="Switch to HVAC Controls"
                aria-label="Switch to HVAC Controls"
              >
                <ha-icon icon="mdi:tune-variant" style="--mdc-icon-size:16px;"></ha-icon>
              </button>

              <button
                type="button"
                class="close-button"
                @click=${() => this._closeStatsModal()}
                aria-label="Close"
              >
                <ha-icon icon="mdi:close"></ha-icon>
              </button>
            </div>
          </div>

          ${modalSystems.length > 1
            ? html`
                <div class="hvac-switcher-row" role="group" aria-label="Filter stats by HVAC zone">
                  <button
                    type="button"
                    class="hvac-switch-pill ${this._statsZone === "all" ? "active" : ""}"
                    @click=${() => {
                      this._fireHaptic("light");
                      this._statsZone = "all";
                      this._statsHoverIdx = {};
                    }}
                  >
                    <ha-icon icon="mdi:home-thermometer-outline"></ha-icon>
                    <span class="hvac-switch-name">All Zones</span>
                    ${homeAvg.formatted ? html`<span class="hvac-switch-temp">${homeAvg.formatted}</span>` : ""}
                  </button>
                  ${modalSystems.map((sys) => {
                    const sc = this._resolveZoneClimate(sys.key, sys);
                    const sysTempStr = sc.currentTemp !== null ? `${sc.currentTemp.toFixed(1)}°` : "";
                    const sysAction = String(sc.controlObj?.attributes?.hvac_action || "").toLowerCase();
                    const dotClass = sysAction === "heating" ? "heating" : sysAction === "cooling" ? "cooling" : sysAction === "fan" ? "fan" : "";
                    const sysLabel = (sys.name || sys.key).split("&")[0].trim();
                    const sysIcon = sys.icon || (sys.key === "downstairs" ? "mdi:home-floor-1" : "mdi:home-floor-2");
                    const isActive = this._statsZone === sys.key;
                    return html`
                      <button
                        type="button"
                        class="hvac-switch-pill ${isActive ? "active" : ""}"
                        @click=${() => {
                          this._fireHaptic("light");
                          this._statsZone = sys.key;
                          this._statsRuntimeZone = sys.key;
                          this._statsHoverIdx = {};
                          this._selectedHvacChunkIndex = null;
                          this._ensureHistoryFetched(sys.key, sys);
                        }}
                      >
                        ${dotClass ? html`<span class="hvac-switch-dot ${dotClass}"></span>` : ""}
                        <ha-icon icon="${sysIcon}"></ha-icon>
                        <span class="hvac-switch-name">${sysLabel}</span>
                        ${sysTempStr ? html`<span class="hvac-switch-temp">${sysTempStr}</span>` : ""}
                      </button>
                    `;
                  })}
                </div>
              `
            : ""}

          <div class="popup-tabs">
            ${tabs.map(
              (t) => html`
                <button
                  type="button"
                  class="popup-tab ${this._statsTab === t.id ? "active-tab" : ""}"
                  @click=${() => {
                    this._fireHaptic("light");
                    this._statsTab = t.id;
                    if (t.id === "runtime") {
                      const rtKey = this._statsZone !== "all" ? this._statsZone : (this._statsRuntimeZone || modalSystems[0]?.key);
                      const rtSys = modalSystems.find((s) => s.key === rtKey);
                      if (rtKey && rtSys) this._ensureHistoryFetched(rtKey, rtSys);
                    }
                  }}
                >
                  <ha-icon icon="${t.icon}"></ha-icon>
                  <span>${t.label}</span>
                </button>
              `
            )}
          </div>

          <div class="modal-scroll-area thin-scroll">
            <div class="hvac-kpi-grid">
              <div class="hvac-kpi-card">
                <span class="kpi-label">${this._statsZone === "all" ? "HOME AVG" : `${(activeSys?.name || this._statsZone).split("&")[0].trim().toUpperCase()} AVG`}</span>
                <span class="kpi-val">${scopeTempVal !== null ? `${scopeTempVal.toFixed(1)}°F` : "--"}</span>
                <span class="kpi-sub">${spreadSub}</span>
              </div>
              <div class="hvac-kpi-card">
                <span class="kpi-label">TODAY RUNTIME</span>
                <span class="kpi-val">${sumHeat > 0 ? `${sumHeat}h H` : (sumCool > 0 ? `${sumCool}h C` : "0.0h")}</span>
                <span class="kpi-sub">${sumFan !== null ? `Fan ${sumFan}h • ${sumHeat}h H/${sumCool}h C` : `${sumHeat}h Heat • ${sumCool}h Cool`}</span>
              </div>
              <div class="hvac-kpi-card">
                <span class="kpi-label">CYCLES & DRIFT</span>
                <span class="kpi-val">${cyclesStr}</span>
                <span class="kpi-sub">${cyclesSub}</span>
              </div>
              <div
                class="hvac-kpi-card ${totalPowerSummary.entityId ? "clickable" : ""}"
                @click=${() => totalPowerSummary.entityId && this._showMoreInfo(totalPowerSummary.entityId)}
              >
                <span class="kpi-label">SPAN HVAC DRAW</span>
                <span class="kpi-val ${(totalPowerSummary.watts || 0) > 300 ? "active" : ""}">${totalPowerSummary.formatted || "--"}</span>
                <span class="kpi-sub">${powerSub}</span>
              </div>
            </div>

            ${this._statsTab === "runtime"
              ? this._renderStatsRuntimeTab(modalSystems)
              : this._statsLoading && !data
                ? html`
                    <div class="stats-loading-state">
                      <ha-icon icon="mdi:chart-timeline-variant" style="--mdc-icon-size:28px; color:var(--primary-color);"></ha-icon>
                      <span>Loading ${hoursLabel} climate telemetry...</span>
                    </div>
                  `
                : this._statsError && !data
                  ? html`
                      <div class="stats-error-state">
                        <span>${this._statsError}</span>
                        <button
                          type="button"
                          class="recirc-button"
                          style="padding:7px 14px;"
                          @click=${() => this._fetchClimateStats(reqHours, true)}
                        >
                          Retry
                        </button>
                      </div>
                    `
                  : !data
                    ? html`
                        <div class="stats-loading-state">
                          <span>Waiting for climate telemetry...</span>
                        </div>
                      `
                    : html`
                        ${data.recorderAvailable === false
                          ? html`
                              <div class="stats-warn-banner">
                                Recorder history unavailable — showing live sensor snapshots only.
                              </div>
                            `
                          : ""}
                        ${this._statsTab === "temps"
                          ? this._renderStatsTempsTab(data, modalSystems)
                          : this._renderStatsBalanceTab(data)}
                      `}
          </div>
        </div>
      </div>
    `;
  }

  static get styles() {
    return css`
      ha-card {
        border-radius: var(--ha-card-border-radius, 12px);
        background: var(--ha-card-background, #fff);
        box-shadow: var(--ha-card-box-shadow, 0 2px 4px rgba(0, 0, 0, 0.1));
        overflow: hidden;
        color: var(--primary-text-color);
      }

      /* HEADER */
      .header {
        padding: 16px 16px 0;
        display: flex;
        flex-direction: column;
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
        padding-bottom: 16px;
        margin-bottom: 16px;
        flex-shrink: 0;
        gap: 4px;
      }
      .title {
        font-size: 24px;
        font-weight: 500;
        margin: 0;
        letter-spacing: -0.01em;
        display: flex;
        align-items: center;
        width: 100%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .header-subtitle-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        margin-top: 4px;
      }
      .subtitle {
        color: var(--secondary-text-color, #757575);
        font-size: 14px;
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .card-content {
        padding: 10px 12px;
        container-type: inline-size;
      }
      .card-content.no-header {
        padding: 10px;
      }
      .header + .card-content, .header ~ .card-content {
        padding-top: 0;
      }

      /* PASSABLE DESIGN SYSTEM: SMART ADVISOR STRIP & CONSOLIDATED HVAC ZONE CARD */
      .hvac-summary-strip {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 7px 12px;
        margin-bottom: 8px;
        border-radius: max(12px, calc(var(--ha-card-border-radius, 20px) - 8px));
        font-size: 13.5px;
        font-weight: 600;
        background: var(--secondary-background-color, rgba(128, 128, 128, 0.10));
        border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.16));
        cursor: pointer;
        transition: all 0.2s ease;
        min-height: 36px;
        box-sizing: border-box;
      }
      .hvac-summary-strip:hover {
        border-color: rgba(var(--rgb-primary-color, 3, 169, 244), 0.35);
      }
      .hvac-summary-strip.open {
        background: rgba(34, 197, 94, 0.08);
        border-color: rgba(34, 197, 94, 0.28);
      }
      .hvac-summary-strip.close {
        background: rgba(245, 158, 11, 0.08);
        border-color: rgba(245, 158, 11, 0.28);
      }
      .summary-strip-left {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
      }
      .summary-strip-right {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
        white-space: nowrap;
      }
      .summary-status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
        background: #0284c7;
      }
      .summary-status-dot.open { background: #22c55e; box-shadow: 0 0 6px rgba(34, 197, 94, 0.55); }
      .summary-status-dot.close { background: #f59e0b; box-shadow: 0 0 6px rgba(245, 158, 11, 0.55); }
      .summary-win-label {
        font-size: 13.5px;
        font-weight: 700;
        color: var(--primary-text-color);
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .summary-sep { opacity: 0.4; }
      .summary-profile-pill,
      .summary-metric {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: var(--secondary-text-color);
        font-size: 13px;
        font-weight: 600;
      }
      .summary-profile-pill ha-icon,
      .summary-metric ha-icon {
        --mdc-icon-size: 15px;
      }
      .summary-metric.power-active {
        color: #d97706;
        font-weight: 700;
      }
      .summary-alert-dot {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .summary-alert-dot ha-icon { --mdc-icon-size: 14px; }
      .summary-alert-dot.heat { background: rgba(245, 158, 11, 0.2); color: #d97706; }
      .summary-alert-dot.open { background: rgba(14, 165, 233, 0.2); color: #0284c7; }
      .icon-circle-btn {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--card-background-color, rgba(128, 128, 128, 0.10));
        border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.20));
        color: var(--primary-text-color);
        cursor: pointer;
        flex-shrink: 0;
        transition: border-color 0.15s ease;
      }
      .icon-circle-btn:hover {
        border-color: var(--primary-color, #03a9f4);
      }
      .icon-circle-btn.spinning ha-icon {
        animation: statsSpin 0.9s linear infinite;
      }
      @keyframes statsSpin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      @container (max-width: 430px) {
        .hvac-summary-strip {
          gap: 6px;
          padding: 6px 9px;
        }
        .summary-strip-right {
          gap: 4px;
        }
        .summary-profile-pill {
          display: none;
        }
        .home-avg-prefix,
        .out-prefix {
          display: none;
        }
      }

      .hvac-grid { display: flex; flex-direction: column; gap: 8px; }
      .hvac-unit-card {
        background: var(--secondary-background-color, rgba(128,128,128,0.10));
        border-radius: max(12px, calc(var(--ha-card-border-radius, 20px) - 8px));
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        border: 1px solid var(--divider-color, rgba(128,128,128,0.14));
        transition: background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
        cursor: pointer;
      }
      .hvac-unit-card:hover {
        background: var(--secondary-background-color, rgba(128,128,128,0.16));
        border-color: rgba(var(--rgb-primary-color, 3, 169, 244), 0.35);
        box-shadow: 0 3px 10px rgba(0, 0, 0, 0.10);
      }

      /* Zone Header: Icon + 2-Line Title/Subtitle + Right Primary Readout */
      .hvac-zone-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        width: 100%;
        min-width: 0;
      }
      .hvac-zone-identity {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        flex: 1;
        overflow: hidden;
      }
      .hvac-zone-icon-wrap {
        width: 40px;
        height: 40px;
        border-radius: 11px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        position: relative;
        background: rgba(128, 128, 128, 0.14);
        color: var(--secondary-text-color);
        border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.16));
        transition: all 0.25s ease;
      }
      .hvac-zone-icon-wrap ha-icon {
        --mdc-icon-size: 21px;
      }
      .hvac-zone-icon-wrap.active-heat {
        background: rgba(234, 88, 12, 0.22);
        color: #ea580c;
        border-color: rgba(234, 88, 12, 0.45);
        box-shadow: 0 0 10px rgba(234, 88, 12, 0.24);
      }
      .hvac-zone-icon-wrap.idle-heat {
        background: rgba(234, 88, 12, 0.12);
        color: #ea580c;
        border-color: rgba(234, 88, 12, 0.25);
      }
      .hvac-zone-icon-wrap.active-cool {
        background: rgba(2, 132, 199, 0.22);
        color: #0284c7;
        border-color: rgba(2, 132, 199, 0.45);
        box-shadow: 0 0 10px rgba(2, 132, 199, 0.24);
      }
      .hvac-zone-icon-wrap.idle-cool {
        background: rgba(2, 132, 199, 0.12);
        color: #0284c7;
        border-color: rgba(2, 132, 199, 0.25);
      }
      .hvac-zone-icon-wrap.active-fan {
        background: rgba(22, 163, 74, 0.22);
        color: #16a34a;
        border-color: rgba(22, 163, 74, 0.45);
      }
      .hvac-zone-icon-wrap.idle-auto {
        background: rgba(168, 85, 247, 0.15);
        color: #9333ea;
        border-color: rgba(168, 85, 247, 0.3);
      }

      .hvac-zone-title-wrap {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
        flex: 1;
        overflow: hidden;
      }
      .hvac-zone-title-row {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        overflow: hidden;
      }
      .hvac-zone-title {
        font-size: 16px;
        font-weight: 700;
        color: var(--primary-text-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        letter-spacing: -0.01em;
        margin: 0;
        line-height: 1.2;
      }
      .zone-inline-chip {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
        line-height: 1.3;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .zone-inline-chip.info {
        background: rgba(14, 165, 233, 0.16);
        color: #0284c7;
        border: 1px solid rgba(14, 165, 233, 0.28);
      }
      .zone-inline-chip.warning {
        background: rgba(245, 158, 11, 0.16);
        color: #d97706;
        border: 1px solid rgba(245, 158, 11, 0.30);
      }
      .zone-inline-chip.danger {
        background: rgba(239, 68, 68, 0.16);
        color: #dc2626;
        border: 1px solid rgba(239, 68, 68, 0.30);
      }
      .zone-inline-chip.neutral {
        background: rgba(128, 128, 128, 0.16);
        color: var(--secondary-text-color);
        border: 1px solid rgba(128, 128, 128, 0.24);
      }
      .zone-inline-chip.clickable { cursor: pointer; }

      .hvac-zone-subtitle {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13.5px;
        font-weight: 600;
        color: var(--secondary-text-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
        line-height: 1.25;
      }
      .hvac-mode-inline {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
      }
      .hvac-mode-inline ha-icon {
        --mdc-icon-size: 15px;
        flex-shrink: 0;
      }
      .hvac-mode-inline.active-heat { color: #ea580c; font-weight: 700; }
      .hvac-mode-inline.idle-heat { color: #d97706; }
      .hvac-mode-inline.active-cool { color: #0284c7; font-weight: 700; }
      .hvac-mode-inline.idle-cool { color: #0284c7; }
      .hvac-mode-inline.active-fan { color: #16a34a; font-weight: 700; }
      .inline-fan-icon {
        --mdc-icon-size: 14px;
        color: #16a34a;
        flex-shrink: 0;
      }
      .hvac-subtitle-dot { opacity: 0.4; flex-shrink: 0; }
      .hvac-inline-range-btn {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 2px 8px;
        border-radius: 999px;
        background: var(--card-background-color, rgba(128, 128, 128, 0.12));
        border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.2));
        color: var(--primary-text-color);
        font-family: inherit;
        font-size: 12.5px;
        font-weight: 700;
        line-height: 1.3;
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
        transition: all 0.15s ease;
      }
      .hvac-inline-range-btn ha-icon {
        --mdc-icon-size: 14px;
        color: var(--secondary-text-color);
      }
      .hvac-inline-range-btn:hover,
      .hvac-inline-range-btn.open {
        background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.14);
        border-color: rgba(var(--rgb-primary-color, 3, 169, 244), 0.35);
      }

      /* Right Primary Readout: Big 0.1°F Temp + Set & Humidity Subline */
      .hvac-zone-primary {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        justify-content: center;
        flex-shrink: 0;
        gap: 1px;
      }
      .hvac-zone-current-temp {
        font-size: 26px;
        font-weight: 800;
        line-height: 1;
        color: var(--primary-text-color);
        letter-spacing: -0.03em;
      }
      .hvac-zone-target-row {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 5px;
        font-size: 13.5px;
        font-weight: 700;
        white-space: nowrap;
        margin-top: 3px;
      }
      .hvac-target-val {
        color: var(--secondary-text-color);
      }
      .hvac-target-sep {
        display: inline;
        opacity: 0.4;
      }
      .hvac-humidity-inline {
        display: inline;
        color: var(--info-color, #0284c7);
      }

      /* Dynamic Operational & Alert Badges Row */
      .hvac-zone-badges-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 5px;
        margin-top: 1px;
      }
      .passable-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 0.72rem;
        font-weight: 700;
        line-height: 1.2;
        white-space: nowrap;
        border: 1px solid transparent;
      }
      .passable-badge ha-icon {
        --mdc-icon-size: 13px;
      }
      .passable-badge.badge-humidity {
        background: rgba(2, 132, 199, 0.15);
        color: #38bdf8;
        border-color: rgba(56, 189, 248, 0.3);
      }
      .passable-badge.badge-heat, .passable-badge.warning {
        background: rgba(234, 88, 12, 0.18);
        color: #fb923c;
        border-color: rgba(251, 146, 60, 0.35);
      }
      .passable-badge.badge-cool, .passable-badge.info {
        background: rgba(2, 132, 199, 0.18);
        color: #38bdf8;
        border-color: rgba(56, 189, 248, 0.35);
      }
      .passable-badge.badge-overshoot {
        background: rgba(245, 158, 11, 0.18);
        color: #fbbf24;
        border-color: rgba(251, 191, 36, 0.35);
      }
      .passable-badge.badge-fan, .passable-badge.success {
        background: rgba(22, 163, 74, 0.16);
        color: #4ade80;
        border-color: rgba(74, 222, 128, 0.3);
      }
      .passable-badge.badge-warning {
        background: rgba(245, 158, 11, 0.22);
        color: #f59e0b;
        border-color: rgba(245, 158, 11, 0.5);
        cursor: pointer;
      }
      .passable-badge.badge-danger, .passable-badge.danger {
        background: rgba(239, 68, 68, 0.22);
        color: #f87171;
        border-color: rgba(239, 68, 68, 0.5);
        cursor: pointer;
      }
      .passable-badge.badge-neutral {
        background: rgba(128, 128, 128, 0.16);
        color: var(--secondary-text-color);
        border-color: rgba(255, 255, 255, 0.08);
      }

      /* Full-Width Remote Room Sensors Footer Bar & Expandable Mini-Card Grid */
      .hvac-sensor-expand-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding: 5px 8px;
        margin-top: 1px;
        border-radius: 8px;
        font-size: 0.74rem;
        background: var(--card-background-color, rgba(128, 128, 128, 0.08));
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.07));
        color: var(--secondary-text-color);
        cursor: pointer;
        transition: all 0.2s ease;
        user-select: none;
      }
      .hvac-sensor-expand-bar:hover {
        background: var(--secondary-background-color, rgba(128, 128, 128, 0.2));
        border-color: rgba(var(--rgb-primary-color, 3, 169, 244), 0.35);
        color: var(--primary-text-color);
      }
      .hvac-sensor-expand-bar.open {
        background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.10);
        border-color: rgba(var(--rgb-primary-color, 3, 169, 244), 0.30);
        color: var(--primary-text-color);
      }
      .sensor-bar-left {
        display: flex;
        align-items: center;
        gap: 5px;
        min-width: 0;
      }
      .sensor-bar-right {
        display: flex;
        align-items: center;
        gap: 5px;
        flex-shrink: 0;
      }
      .sensor-summary-icon {
        --mdc-icon-size: 14px;
        color: var(--primary-color, #03a9f4);
      }
      .sensor-summary-label {
        font-weight: 600;
        color: var(--secondary-text-color);
      }
      .sensor-summary-range {
        font-weight: 800;
        font-size: 0.78rem;
        color: var(--primary-text-color);
      }
      .sensor-summary-chevron {
        --mdc-icon-size: 15px;
        color: var(--secondary-text-color);
      }

      .hvac-sensor-tray-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
        margin-top: 5px;
        padding-top: 6px;
        border-top: 1px dashed var(--divider-color, rgba(128, 128, 128, 0.22));
        width: 100%;
        animation: slideDown 0.18s ease-out forwards;
      }
      @media (max-width: 340px) {
        .hvac-sensor-tray-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @keyframes slideDown {
        from { opacity: 0; transform: translateY(-3px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .hvac-room-mini-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding: 6px 9px;
        border-radius: 8px;
        background: var(--card-background-color, rgba(128, 128, 128, 0.08));
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.06));
        cursor: pointer;
        transition: all 0.15s ease;
        user-select: none;
      }
      .hvac-room-mini-card:hover {
        background: var(--secondary-background-color, rgba(128, 128, 128, 0.22));
        border-color: var(--primary-color);
      }
      .hvac-room-mini-card.active {
        background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.10);
        border-color: rgba(var(--rgb-primary-color, 3, 169, 244), 0.30);
      }
      .room-mini-top {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }
      .room-mini-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--success-color, #22c55e);
        flex-shrink: 0;
      }
      .room-mini-dot.standby {
        background: var(--disabled-text-color, #888);
        opacity: 0.5;
      }
      .room-mini-name {
        font-size: 13px;
        font-weight: 600;
        color: var(--primary-text-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .room-mini-temp {
        font-size: 13.5px;
        font-weight: 800;
        color: var(--primary-text-color);
        flex-shrink: 0;
      }

      /* PASSABLE MODAL COMMAND CENTER STYLES */
      .passable-section-card {
        background: var(--secondary-background-color, rgba(128, 128, 128, 0.08));
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
        border-radius: 16px;
        padding: 14px;
        flex-shrink: 0;
        box-sizing: border-box;
      }
      .passable-section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
      }
      .passable-section-title {
        font-size: 0.78rem;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--primary-text-color);
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .passable-count-pill {
        font-size: 0.68rem;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(3, 169, 244, 0.15);
        color: var(--primary-color, #38bdf8);
      }

      /* Hero Setpoint Banner inside Modal */
      .hero-setpoint-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding-bottom: 12px;
        margin-bottom: 12px;
        border-bottom: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
      }
      .hero-current-col {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .hero-col-label {
        font-size: 0.66rem;
        font-weight: 800;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .hero-current-val-row {
        display: flex;
        align-items: baseline;
        gap: 8px;
      }
      .hero-current-temp {
        font-size: 2.3rem;
        font-weight: 800;
        line-height: 1;
        color: var(--primary-text-color);
        letter-spacing: -0.03em;
      }
      .hero-current-hum {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        font-size: 0.88rem;
        font-weight: 700;
        color: var(--info-color, #38bdf8);
      }
      .hero-current-hum ha-icon {
        --mdc-icon-size: 15px;
      }
      .hero-status-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin-top: 2px;
      }
      .hero-target-col {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 6px;
      }
      .hero-stepper-pill {
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--secondary-background-color, rgba(128, 128, 128, 0.12));
        border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.2));
        border-radius: 14px;
        padding: 5px 8px;
      }
      .hero-stepper-pill.compact-dual {
        gap: 5px;
        padding: 3px 6px;
        border-radius: 10px;
      }
      .hero-stepper-pill.compact-dual .hero-step-btn {
        width: 26px;
        height: 26px;
        font-size: 1rem;
      }
      .hero-stepper-pill.compact-dual .hero-step-val {
        font-size: 1.05rem;
        min-width: 34px;
      }
      .hero-step-btn {
        width: 34px;
        height: 34px;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: var(--secondary-background-color, rgba(255, 255, 255, 0.08));
        color: var(--primary-text-color);
        font-size: 1.25rem;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
      }
      .hero-step-btn:hover {
        background: var(--primary-color, #3b82f6);
        color: #ffffff;
        border-color: var(--primary-color, #3b82f6);
      }
      .hero-step-val {
        font-size: 1.35rem;
        font-weight: 800;
        color: var(--primary-text-color);
        min-width: 54px;
        text-align: center;
      }

      .passable-control-group {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;
      }
      .passable-group-label {
        font-size: 0.82rem;
        font-weight: 600;
        color: var(--secondary-text-color);
      }
      .passable-segmented-row {
        display: flex;
        gap: 5px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      /* Collapsible Accordions inside Modal */
      .passable-accordion-card {
        background: var(--secondary-background-color, rgba(128, 128, 128, 0.08));
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
        border-radius: 16px;
        overflow: hidden;
        transition: border-color 0.2s ease;
      }
      .passable-accordion-card.expanded {
        border-color: rgba(var(--rgb-primary-color, 3, 169, 244), 0.35);
      }
      .passable-accordion-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px;
        cursor: pointer;
        user-select: none;
        transition: background 0.15s ease;
      }
      .passable-accordion-header:hover {
        background: rgba(255, 255, 255, 0.04);
      }
      .passable-accordion-title {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .accordion-main-text {
        font-size: 0.88rem;
        font-weight: 700;
        color: var(--primary-text-color);
      }
      .accordion-sub-text {
        font-size: 0.72rem;
        color: var(--secondary-text-color);
      }
      .accordion-chevron {
        --mdc-icon-size: 20px;
        color: var(--secondary-text-color);
      }
      .passable-accordion-body {
        padding: 0 14px 14px 14px;
        border-top: 1px solid var(--divider-color, rgba(255, 255, 255, 0.06));
        padding-top: 12px;
        animation: slideDown 0.18s ease-out forwards;
      }

      /* Passable 3-Column Stat Blocks for Analytics */
      .passable-stat-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        margin-bottom: 10px;
      }
      .passable-stat-block {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .stat-block-label {
        font-size: 0.62rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .stat-block-val {
        font-size: 1.35rem;
        font-weight: 800;
        line-height: 1.1;
      }
      .stat-block-val small {
        font-size: 0.8rem;
        font-weight: 600;
        margin-left: 1px;
      }

      .hvac-modal-sensors-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
        gap: 8px;
      }
      .hvac-modal-sensor-tile {
        background: var(--card-background-color, rgba(128, 128, 128, 0.06));
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
        border-radius: 10px;
        padding: 8px 10px;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .hvac-modal-sensor-tile:hover {
        border-color: var(--primary-color);
        transform: translateY(-1px);
      }
      .hvac-modal-sensor-tile.active {
        border-color: rgba(var(--rgb-primary-color, 3, 169, 244), 0.4);
        background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.08);
      }
      .sensor-tile-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 4px;
      }
      .sensor-tile-name {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--primary-text-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .sensor-tile-status {
        font-size: 0.6rem;
        padding: 1px 4px;
        border-radius: 4px;
        font-weight: 600;
      }
      .sensor-tile-status.active {
        background: rgba(34, 197, 94, 0.2);
        color: #22c55e;
      }
      .sensor-tile-status.standby {
        background: rgba(128, 128, 128, 0.15);
        color: var(--secondary-text-color);
      }
      .sensor-tile-temp {
        font-size: 1.15rem;
        font-weight: 700;
        color: var(--primary-text-color);
      }

      @keyframes spin-slow {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .hvac-spin-icon {
        animation: spin-slow 2.5s linear infinite;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transform-origin: center center;
      }
      @keyframes gentle-pulse {
        0% { opacity: 0.75; transform: scale(0.94); }
        50% { opacity: 1; transform: scale(1.08); }
        100% { opacity: 0.75; transform: scale(0.94); }
      }
      .hvac-pulse-icon {
        animation: gentle-pulse 2s ease-in-out infinite;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transform-origin: center center;
      }

      .filter-alert-dot {
        position: absolute;
        top: -2px;
        right: -2px;
        width: 9px;
        height: 9px;
        background-color: #ef4444;
        border-radius: 50%;
        border: 1.5px solid rgba(0,0,0,0.7);
      }
      .filter-alert-dot.warning {
        background-color: #f59e0b;
      }

      .hvac-mode-btn {
        background: var(--secondary-background-color, rgba(128, 128, 128, 0.15));
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
        color: var(--primary-text-color);
        padding: 5px 10px;
        border-radius: 8px;
        font-weight: 600;
        font-size: 0.75rem;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .hvac-mode-btn.active {
        background: var(--primary-color, #3b82f6);
        color: var(--text-primary-color, var(--primary-text-color, #fff)) !important;
        border-color: var(--primary-color, #3b82f6);
        font-weight: 800;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
      }
      .global-preset-badge { display: flex; align-items: center; background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.4); color: #60a5fa; padding: 3px 8px; border-radius: 10px; font-size: 0.75rem; font-weight: 600; cursor: pointer; }
      
      .hvac-tab-btn {
        flex: 1;
        background: transparent;
        border: none;
        color: var(--secondary-text-color, #a1a1aa);
        padding: 6px 8px;
        border-radius: 8px;
        font-weight: 600;
        font-size: 0.75rem;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
      }
      .hvac-tab-btn.active {
        background: var(--primary-color, #3b82f6);
        color: var(--text-primary-color, var(--primary-text-color, #fff)) !important;
        font-weight: 700;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
      }
      .hvac-tab-btn.active ha-icon {
        color: var(--text-primary-color, var(--primary-text-color, #fff));
      }

      /* HIGH CONTRAST STATUS CHIPS */
      .status-chip { display: inline-flex; align-items: center; padding: 2px 7px; border-radius: 8px; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.02em; }
      .status-chip.active-cool {
        background: var(--info-color, #0284c7);
        color: #ffffff !important;
        border: 1px solid rgba(255, 255, 255, 0.4);
        box-shadow: 0 0 8px rgba(var(--rgb-info-color, 3, 169, 244), 0.4);
      }
      .status-chip.idle-cool {
        background: rgba(var(--rgb-info-color, 3, 169, 244), 0.12);
        color: var(--info-color, #38bdf8);
        border: 1px solid rgba(var(--rgb-info-color, 3, 169, 244), 0.3);
      }
      .status-chip.active-heat {
        background: var(--warning-color, #ea580c);
        color: #ffffff !important;
        border: 1px solid rgba(255, 255, 255, 0.4);
        box-shadow: 0 0 8px rgba(var(--rgb-warning-color, 255, 152, 0), 0.4);
      }
      .status-chip.idle-heat {
        background: rgba(var(--rgb-warning-color, 255, 152, 0), 0.12);
        color: var(--warning-color, #ff9800);
        border: 1px solid rgba(var(--rgb-warning-color, 255, 152, 0), 0.3);
      }
      .status-chip.active-fan {
        background: var(--success-color, #16a34a);
        color: #ffffff !important;
        border: 1px solid rgba(255, 255, 255, 0.4);
      }
      .status-chip.idle-auto {
        background: rgba(168, 85, 247, 0.15);
        color: #c084fc;
        border: 1px solid rgba(168, 85, 247, 0.3);
      }
      .status-chip.power-off {
        background: rgba(255, 255, 255, 0.08);
        color: var(--secondary-text-color, #a1a1aa);
        border: 1px solid rgba(255, 255, 255, 0.15);
      }

      /* STEPPER PILL CONTROLLER */
      .step-controller-pill {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: var(--secondary-background-color, rgba(128, 128, 128, 0.15));
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.08));
        border-radius: 20px;
        padding: 4px 10px;
        gap: 8px;
        flex-shrink: 0;
        box-sizing: border-box;
      }
      .pill-btn {
        background: none;
        border: none;
        color: var(--primary-text-color);
        cursor: pointer;
        padding: 2px 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.82rem;
        font-weight: 700;
        opacity: 0.85;
        white-space: nowrap;
        flex-shrink: 0;
        transition: opacity 0.15s ease;
      }
      .pill-btn:hover { opacity: 1; }
      .pill-value {
        font-weight: 600;
        font-size: 0.9rem;
        color: var(--primary-text-color);
        white-space: nowrap;
        text-align: center;
      }

      .control-row { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 34px; margin: 2px 0; }
      .control-label-group { display: flex; align-items: center; gap: 10px; color: var(--primary-text-color); }
      .control-label-group ha-icon { --mdc-icon-size: 20px; color: var(--secondary-text-color, #a1a1aa); }
      .control-label { font-size: 0.95rem; font-weight: 500; color: var(--primary-text-color); }
      .popup-switch { margin-left: auto; }
      .control-value { margin-left: auto; font-weight: 600; font-size: 0.95rem; }
      .divider { border-top: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12)); margin: 4px 0; width: 100%; }

      /* MATERIALS & STEP TIMELINE (FILTER TAB) */
      .materials-section { background: rgba(34, 197, 94, 0.1); padding: 16px; border-radius: 16px; margin-bottom: 12px; border: 1px solid rgba(34, 197, 94, 0.2); }
      .materials-section h3 { margin: 0 0 10px 0; font-size: 1rem; display: flex; align-items: center; gap: 8px; color: #4ade80; }
      .step-timeline { display: flex; flex-direction: column; gap: 16px; }
      .step { display: flex; gap: 14px; }
      .step-num {
        background: var(--primary-color, #3b82f6);
        color: var(--text-primary-color, var(--primary-text-color, #fff));
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 0.9rem;
        flex-shrink: 0;
        margin-top: 2px;
      }
      .step-content h4 { margin: 0 0 4px 0; font-size: 1.05rem; }
      .step-content p { margin: 0 0 4px 0; font-size: 0.9rem; color: var(--secondary-text-color); line-height: 1.4; }

      .recirc-button {
        display: flex; align-items: center; justify-content: center; gap: 8px;
        background: var(--primary-color, #3b82f6); color: white; border: none;
        border-radius: 12px; padding: 12px 16px; font-weight: 700; font-size: 0.9rem;
        cursor: pointer; transition: all 0.2s ease;
      }
      .recirc-button:hover { opacity: 0.9; }

      /* UNIFORM POPUP STYLES & BOTTOM SHEET */
      @keyframes ha-popup-backdrop-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes ha-popup-backdrop-fade-out {
        from { opacity: 1; }
        to { opacity: 0; }
      }
      @keyframes ha-popup-dialog-in {
        from {
          opacity: 0;
          transform: translateY(20px) scale(0.96);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      @keyframes ha-popup-dialog-out {
        from {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        to {
          opacity: 0;
          transform: translateY(12px) scale(0.97);
        }
      }
      @keyframes ha-popup-sheet-in {
        from {
          transform: translateY(100%);
          opacity: 0.5;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
      @keyframes ha-popup-sheet-out {
        from {
          transform: translateY(0);
          opacity: 1;
        }
        to {
          transform: translateY(100%);
          opacity: 0;
        }
      }

      .popup-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        height: 100%;
        background-color: var(--mdc-dialog-scrim-color, var(--dialog-backdrop-background, rgba(0, 0, 0, 0.32)));
        backdrop-filter: var(--dialog-backdrop-filter, none);
        -webkit-backdrop-filter: var(--dialog-backdrop-filter, none);
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 16px;
        box-sizing: border-box;
        overflow-x: hidden;
        overscroll-behavior: contain;
        z-index: 9999;
        animation: ha-popup-backdrop-fade-in var(--motion-duration-medium, var(--ha-animation-duration, 280ms)) var(--motion-easing-standard, cubic-bezier(0.2, 0, 0, 1)) forwards;
        will-change: opacity;
      }
      .popup-overlay.closing {
        animation: ha-popup-backdrop-fade-out var(--motion-duration-short, 180ms) var(--motion-easing-standard, cubic-bezier(0.2, 0, 0, 1)) forwards;
      }

      .popup-content {
        background-color: var(--ha-card-background, var(--card-background-color, #fff));
        padding: 16px 18px 20px;
        border-radius: var(--ha-dialog-border-radius, var(--ha-card-border-radius, 24px));
        width: 100%;
        max-width: 480px;
        max-height: 90vh;
        overflow-y: auto;
        overflow-x: hidden;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-y;
        position: relative;
        color: var(--primary-text-color);
        display: flex;
        flex-direction: column;
        gap: 8px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.1));
        box-sizing: border-box;
        animation: ha-popup-dialog-in var(--motion-duration-medium, var(--ha-animation-duration, 280ms)) var(--motion-easing-emphasized, var(--motion-easing-standard, cubic-bezier(0.2, 0, 0, 1))) forwards;
        will-change: transform, opacity;
      }
      .popup-content.closing {
        animation: ha-popup-dialog-out var(--motion-duration-short, 180ms) var(--motion-easing-standard, cubic-bezier(0.2, 0, 0, 1)) forwards;
      }
      .drag-handle { display: none; }
      
      .popup-header {
        display: flex; align-items: center; justify-content: flex-start; gap: 10px; width: 100%;
        padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px solid var(--divider-color, rgba(255, 255, 255, 0.12));
        flex-shrink: 0;
      }
      .popup-header h3 {
        margin: 0; font-size: 1.15rem; font-weight: 600; color: var(--primary-text-color); letter-spacing: 0.01em;
      }
      .close-button {
        background: none; border: none; padding: 4px; cursor: pointer; color: var(--primary-text-color);
        display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: background-color 0.2s;
      }
      .close-button:hover { background-color: rgba(255, 255, 255, 0.1); }
      .close-button ha-icon { --mdc-icon-size: 20px; }

      .hvac-switcher-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin: -2px 0 4px;
        width: 100%;
        flex-shrink: 0;
        box-sizing: border-box;
      }
      .hvac-switch-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 11px;
        border-radius: 999px;
        border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.22));
        background: var(--secondary-background-color, rgba(128, 128, 128, 0.1));
        color: var(--secondary-text-color);
        font-family: inherit;
        font-size: 0.78rem;
        font-weight: 600;
        line-height: 1.2;
        cursor: pointer;
        transition: all 0.2s ease;
        user-select: none;
        max-width: 100%;
      }
      .hvac-switch-pill ha-icon {
        --mdc-icon-size: 14px;
        flex-shrink: 0;
      }
      .hvac-switch-pill:hover {
        color: var(--primary-text-color);
        background: rgba(128, 128, 128, 0.16);
      }
      .hvac-switch-pill.active {
        background: var(--primary-color, #3b82f6);
        border-color: var(--primary-color, #3b82f6);
        color: var(--text-primary-color, #ffffff);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
      }
      .hvac-switch-pill.active ha-icon {
        color: var(--text-primary-color, #ffffff);
      }
      .hvac-switch-temp {
        opacity: 0.85;
        font-variant-numeric: tabular-nums;
      }
      .hvac-switch-pill.active .hvac-switch-temp {
        opacity: 0.95;
      }
      .hvac-switch-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .hvac-switch-dot.heating { background: #f97316; }
      .hvac-switch-dot.cooling { background: #38bdf8; }
      .hvac-switch-dot.fan { background: #22c55e; }
      .hvac-switch-pill.active .hvac-switch-dot {
        box-shadow: 0 0 0 1.5px rgba(255, 255, 255, 0.75);
      }

      /* POPUP TABS NAVIGATION (3-TAB RESPONSIVE) */
      .popup-tabs {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        background: var(--secondary-background-color, rgba(128, 128, 128, 0.12));
        padding: 4px;
        border-radius: 14px;
        gap: 4px;
        margin-bottom: 14px;
        width: 100%;
        flex-shrink: 0;
        box-sizing: border-box;
      }
      .popup-tab {
        min-width: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        padding: 7px 4px;
        border-radius: 10px;
        background: transparent;
        border: none;
        color: var(--secondary-text-color);
        font-size: 0.72rem;
        line-height: 1.15;
        font-weight: 600;
        text-align: center;
        white-space: normal;
        overflow: visible;
        cursor: pointer;
        transition: all 0.2s ease;
        user-select: none;
        box-sizing: border-box;
      }
      .popup-tab ha-icon {
        --mdc-icon-size: 16px;
        flex-shrink: 0;
      }
      .popup-tab:hover {
        color: var(--primary-text-color);
        background: rgba(128, 128, 128, 0.15);
      }
      .popup-tab.active-tab {
        background: var(--primary-color, #3b82f6);
        color: var(--text-primary-color, #ffffff);
        font-weight: 700;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22);
      }
      .popup-tab.active-tab ha-icon {
        color: var(--text-primary-color, #ffffff);
      }
      @media (max-width: 460px) {
        .popup-tabs {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .popup-tab {
          flex-direction: column;
          gap: 3px;
          padding: 7px 4px;
          font-size: 0.70rem;
        }
        .popup-tab ha-icon {
          --mdc-icon-size: 15px;
        }
      }

      /* STATS KPI, ADVISOR, COMFORT ENVELOPE & FILTER PROGRESS */
      .hvac-kpi-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      @media (min-width: 560px) {
        .hvac-kpi-grid {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
      }
      .hvac-kpi-card {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 9px 10px;
        border-radius: 12px;
        background: var(--secondary-background-color, rgba(128, 128, 128, 0.08));
        border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.16));
      }
      .hvac-kpi-card.clickable { cursor: pointer; }
      .hvac-kpi-card.clickable:hover { border-color: rgba(var(--rgb-primary-color, 3, 169, 244), 0.35); }
      .kpi-label {
        font-size: 0.62rem;
        font-weight: 800;
        letter-spacing: 0.04em;
        color: var(--secondary-text-color);
      }
      .kpi-val {
        font-size: 1.08rem;
        font-weight: 800;
        color: var(--primary-text-color);
        line-height: 1.2;
      }
      .kpi-val.active { color: #d97706; }
      .kpi-sub {
        font-size: 0.66rem;
        color: var(--secondary-text-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .chart-analytics-card {
        padding: 12px;
        background: var(--secondary-background-color, rgba(128, 128, 128, 0.08));
        border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.16));
        flex-shrink: 0;
        box-sizing: border-box;
      }
      .chart-mode-toggle-group {
        display: flex;
        gap: 4px;
        background: var(--card-background-color, rgba(128, 128, 128, 0.12));
        border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.16));
        padding: 3px;
        border-radius: 10px;
      }

      .advisor-tone-badge {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 0.68rem;
        font-weight: 700;
      }
      .advisor-tone-badge.open { background: rgba(34, 197, 94, 0.16); color: #16a34a; }
      .advisor-tone-badge.close,
      .advisor-tone-badge.warn { background: rgba(245, 158, 11, 0.18); color: #d97706; }
      .advisor-tone-badge.neutral { background: rgba(14, 165, 233, 0.16); color: #0284c7; }

      .action-mini-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 8px;
        border-radius: 8px;
        background: var(--card-background-color, rgba(128, 128, 128, 0.14));
        border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.22));
        color: var(--primary-text-color);
        font-family: inherit;
        font-size: 0.68rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .action-mini-btn ha-icon { --mdc-icon-size: 13px; color: var(--primary-color); }
      .action-mini-btn:hover { border-color: var(--primary-color); }

      .advisor-alert-banner {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        border-radius: 10px;
        padding: 8px 10px;
        margin-bottom: 8px;
        font-size: 0.75rem;
        color: var(--primary-text-color);
      }
      .advisor-alert-banner ha-icon { --mdc-icon-size: 16px; flex-shrink: 0; margin-top: 1px; }
      .advisor-alert-banner.warn { background: rgba(245, 158, 11, 0.14); border: 1px solid rgba(245, 158, 11, 0.35); }
      .advisor-alert-banner.warn ha-icon { color: #d97706; }
      .advisor-alert-banner.info { background: rgba(14, 165, 233, 0.12); border: 1px solid rgba(14, 165, 233, 0.32); }
      .advisor-alert-banner.info ha-icon { color: #0284c7; }
      .climate-outlook-card {
        background: linear-gradient(135deg, rgba(var(--rgb-primary-color, 3, 169, 244), 0.11) 0%, rgba(168, 85, 247, 0.08) 100%);
        border: 1px solid rgba(var(--rgb-primary-color, 3, 169, 244), 0.28);
        border-radius: 12px;
        padding: 12px 14px;
        margin-bottom: 10px;
        cursor: pointer;
        transition: border-color 0.2s ease, transform 0.15s ease;
      }
      .climate-outlook-card:hover {
        border-color: var(--primary-color);
      }
      .climate-outlook-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
      }
      .climate-outlook-title {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.78rem;
        font-weight: 800;
        letter-spacing: 0.05em;
        color: var(--primary-text-color);
      }
      .climate-outlook-badge {
        font-size: 0.70rem;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: 999px;
        background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.14);
        color: var(--primary-color);
        white-space: nowrap;
      }
      .climate-outlook-text {
        font-size: 0.85rem;
        line-height: 1.48;
        font-weight: 500;
        color: var(--primary-text-color);
        margin-bottom: 10px;
      }
      .climate-outlook-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .climate-outlook-chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 0.74rem;
        font-weight: 600;
        padding: 4px 9px;
        border-radius: 999px;
        background: var(--secondary-background-color, rgba(128, 128, 128, 0.12));
        border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.2));
        color: var(--primary-text-color);
      }
      .climate-outlook-chip ha-icon {
        --mdc-icon-size: 14px;
      }
      .climate-outlook-chip.warm {
        background: rgba(249, 115, 22, 0.12);
        border-color: rgba(249, 115, 22, 0.30);
        color: #ea580c;
      }
      .climate-outlook-chip.cool {
        background: rgba(14, 165, 233, 0.12);
        border-color: rgba(14, 165, 233, 0.30);
        color: #0284c7;
      }
      .climate-outlook-chip.rh {
        background: rgba(168, 85, 247, 0.12);
        border-color: rgba(168, 85, 247, 0.28);
        color: #9333ea;
      }

      .hvac-psychro-row {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
      }
      .psychro-pill {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 6px 8px;
        border-radius: 10px;
        background: var(--card-background-color, rgba(128, 128, 128, 0.08));
        border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.16));
        cursor: pointer;
      }
      .psychro-label { font-size: 0.63rem; font-weight: 700; color: var(--secondary-text-color); }
      .psychro-val { font-size: 0.78rem; font-weight: 800; color: var(--primary-text-color); }

      .advisor-empty-sim {
        font-size: 0.75rem;
        color: var(--secondary-text-color);
        padding: 14px 10px;
        text-align: center;
        border-radius: 10px;
        background: var(--card-background-color, rgba(128, 128, 128, 0.06));
        border: 1px dashed var(--divider-color, rgba(128, 128, 128, 0.25));
      }

      .comfort-stepper-row {
        padding: 5px 0;
        border-bottom: 1px solid var(--divider-color, rgba(128, 128, 128, 0.12));
      }
      .comfort-stepper-row:last-child { border-bottom: none; }

      .filter-progress-wrap {
        margin-bottom: 12px;
      }
      .filter-progress-track {
        width: 100%;
        height: 10px;
        border-radius: 999px;
        background: var(--card-background-color, rgba(128, 128, 128, 0.18));
        border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.16));
        overflow: hidden;
      }
      .filter-progress-fill {
        height: 100%;
        border-radius: 999px;
        transition: width 0.3s ease;
      }
      .filter-progress-fill.good { background: linear-gradient(90deg, #22c55e, #4ade80); }
      .filter-progress-fill.warn { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
      .filter-progress-fill.danger { background: linear-gradient(90deg, #ef4444, #f87171); }
      .filter-progress-meta {
        display: flex;
        justify-content: space-between;
        margin-top: 5px;
        font-size: 0.70rem;
        font-weight: 600;
        color: var(--secondary-text-color);
      }

      /* DEDICATED HVAC STATS MODAL STYLES */
      .popup-content.stats-modal {
        max-width: 640px;
        overflow: hidden;
      }
      .popup-content.stats-modal .popup-header {
        justify-content: space-between;
        flex-wrap: wrap;
        row-gap: 8px;
        padding-bottom: 10px;
        margin-bottom: 2px;
      }
      .popup-content.stats-modal .popup-tabs {
        margin-bottom: 2px;
      }
      .popup-header-left {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .popup-header-sub {
        font-size: 12px;
        color: var(--secondary-text-color);
        font-variant-numeric: tabular-nums;
      }
      .popup-header-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-left: auto;
        flex-shrink: 0;
      }
      .hvac-stats-icon-box {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(14, 165, 233, 0.16);
        color: #0284c7;
        border: 1px solid rgba(14, 165, 233, 0.34);
        flex-shrink: 0;
      }
      .modal-scroll-area {
        flex: 1 1 auto;
        min-height: 0;
        max-height: 58vh;
        overflow-y: auto;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-y;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding-right: 3px;
      }
      .modal-scroll-area > * {
        flex-shrink: 0;
      }
      .thin-scroll::-webkit-scrollbar { width: 4px; }
      .thin-scroll::-webkit-scrollbar-thumb {
        background: rgba(148, 163, 184, 0.35);
        border-radius: 999px;
      }
      .stats-segmented {
        display: inline-flex;
        align-items: center;
        padding: 2px;
        border-radius: 999px;
        background: var(--secondary-background-color, rgba(128, 128, 128, 0.14));
        border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.20));
        gap: 2px;
        flex-shrink: 0;
      }
      .stats-seg-btn {
        border: none;
        background: transparent;
        color: var(--secondary-text-color);
        font-family: inherit;
        font-size: 11.5px;
        font-weight: 700;
        padding: 3px 9px;
        border-radius: 999px;
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
      }
      .stats-seg-btn.active {
        background: var(--primary-color, #3b82f6);
        color: var(--text-primary-color, #ffffff);
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
      }
      .stats-loading-state,
      .stats-error-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 36px 16px;
        text-align: center;
        font-size: 13px;
        color: var(--secondary-text-color);
      }
      .stats-warn-banner {
        padding: 7px 11px;
        border-radius: 10px;
        font-size: 12px;
        font-weight: 600;
        background: rgba(245, 158, 11, 0.12);
        border: 1px solid rgba(245, 158, 11, 0.35);
        color: #f59e0b;
      }
      .stats-compare-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .stats-chip-toggle {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 999px;
        border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.22));
        background: var(--secondary-background-color, rgba(128, 128, 128, 0.10));
        color: var(--secondary-text-color);
        font-family: inherit;
        font-size: 11.5px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .stats-chip-toggle.active {
        background: rgba(148, 163, 184, 0.16);
        border-color: rgba(148, 163, 184, 0.45);
        color: var(--primary-text-color);
      }
      .stats-chip-toggle.active-amber {
        background: rgba(234, 179, 8, 0.14);
        border-color: rgba(234, 179, 8, 0.45);
        color: var(--primary-text-color);
      }
      .stats-tune-btn {
        border: 1px solid rgba(var(--rgb-primary-color, 59, 130, 246), 0.38);
        background: rgba(var(--rgb-primary-color, 59, 130, 246), 0.12);
        color: var(--primary-color, #3b82f6);
        border-radius: 999px;
        padding: 3px 10px;
        font-family: inherit;
        font-size: 11.5px;
        font-weight: 700;
        cursor: pointer;
      }
      .stats-scrub-bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        min-height: 22px;
        padding: 4px 8px;
        margin-bottom: 6px;
        border-radius: 8px;
        background: var(--card-background-color, rgba(128, 128, 128, 0.08));
        border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.14));
        font-size: 11.5px;
        font-variant-numeric: tabular-nums;
      }
      .stats-scrub-time { font-weight: 800; color: var(--primary-text-color); }
      .stats-scrub-item { display: inline-flex; align-items: center; gap: 4px; color: var(--secondary-text-color); }
      .stats-scrub-item strong { color: var(--primary-text-color); }
      .stats-scrub-hint { color: var(--secondary-text-color); font-size: 11.5px; }
      .stats-scrub-summary { margin-left: auto; font-weight: 600; color: var(--primary-text-color); font-size: 11.5px; }
      .stats-svg {
        width: 100%;
        height: auto;
        display: block;
        user-select: none;
        -webkit-user-select: none;
      }
      .stats-chart-interactive { cursor: crosshair; touch-action: pan-y; }
      .stats-legend-dot {
        width: 7px;
        height: 7px;
        border-radius: 999px;
        display: inline-block;
        flex-shrink: 0;
      }
      .stats-legend-dash {
        width: 12px;
        height: 0;
        border-top: 2px dashed;
        display: inline-block;
        flex-shrink: 0;
      }
      .stats-compare-legend { display: flex; flex-wrap: wrap; gap: 6px; }
      .stats-compare-chip {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.22));
        background: var(--card-background-color, rgba(128, 128, 128, 0.10));
        overflow: hidden;
        transition: opacity 0.15s ease;
      }
      .stats-compare-chip.hidden-series { opacity: 0.45; }
      .stats-compare-toggle {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        border: none;
        background: transparent;
        color: var(--primary-text-color);
        font-family: inherit;
        font-size: 11.5px;
        font-weight: 600;
        padding: 4px 7px 4px 9px;
        cursor: pointer;
      }
      .stats-compare-val {
        color: var(--secondary-text-color);
        font-variant-numeric: tabular-nums;
        font-size: 11px;
      }
      .stats-compare-jump {
        border: none;
        border-left: 1px solid var(--divider-color, rgba(128, 128, 128, 0.18));
        background: transparent;
        color: var(--secondary-text-color);
        font-family: inherit;
        font-size: 12px;
        font-weight: 700;
        padding: 4px 8px 4px 6px;
        cursor: pointer;
      }
      .stats-compare-jump:hover { color: var(--primary-color, #3b82f6); }
      .stats-mini-metrics {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
      }
      .stats-mini-metric {
        background: var(--secondary-background-color, rgba(128, 128, 128, 0.08));
        border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.14));
        border-radius: 10px;
        padding: 7px 9px;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .mini-label { font-size: 10.5px; font-weight: 700; color: var(--secondary-text-color); }
      .mini-val { font-size: 12.5px; font-weight: 800; color: var(--primary-text-color); font-variant-numeric: tabular-nums; }
      .stats-balance-list, .stats-usage-list { display: flex; flex-direction: column; gap: 7px; }
      .stats-balance-row, .stats-zone-health-row {
        display: flex;
        flex-direction: column;
        gap: 5px;
        width: 100%;
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.14));
        background: var(--card-background-color, rgba(128, 128, 128, 0.08));
        text-align: left;
        font-family: inherit;
        box-sizing: border-box;
      }
      .stats-balance-row { cursor: pointer; transition: border-color 0.15s ease; }
      .stats-balance-row:hover { border-color: rgba(var(--rgb-primary-color, 59, 130, 246), 0.45); }
      .stats-balance-top, .stats-usage-row-top {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
      }
      .stats-usage-name-wrap { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; }
      .stats-usage-name { font-size: 12.5px; font-weight: 700; color: var(--primary-text-color); }
      .stats-balance-drift { font-size: 11px; color: var(--secondary-text-color); font-variant-numeric: tabular-nums; }
      .stats-balance-vals { display: inline-flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums; }
      .stats-balance-temp { font-size: 12.5px; font-weight: 700; color: var(--primary-text-color); }
      .stats-delta-pill {
        font-size: 11px;
        font-weight: 800;
        padding: 1px 7px;
        border-radius: 999px;
      }
      .stats-delta-pill.warm { background: rgba(249, 115, 22, 0.18); color: #ea580c; }
      .stats-delta-pill.cool { background: rgba(14, 165, 233, 0.18); color: #0284c7; }
      .stats-delta-pill.balanced { background: rgba(34, 197, 94, 0.16); color: #16a34a; }
      .stats-balance-track {
        position: relative;
        width: 100%;
        height: 8px;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.16);
        overflow: hidden;
      }
      .stats-balance-zero {
        position: absolute;
        left: 50%;
        top: 0;
        bottom: 0;
        width: 1.5px;
        background: var(--secondary-text-color, rgba(148, 163, 184, 0.55));
        transform: translateX(-50%);
        z-index: 2;
      }
      .stats-balance-whisker {
        position: absolute;
        top: 2px;
        bottom: 2px;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.34);
        z-index: 1;
      }
      .stats-balance-fill {
        position: absolute;
        top: 1px;
        bottom: 1px;
        border-radius: 999px;
        z-index: 3;
      }
      .stats-balance-fill.warm { background: #f97316; }
      .stats-balance-fill.cool { background: #38bdf8; }
      .stats-balance-fill.balanced { background: #22c55e; }

      @media (max-width: 768px) {
        .popup-overlay {
          align-items: flex-end;
          justify-content: center;
          padding: 0;
          overscroll-behavior: contain;
        }
        .popup-content {
          width: 100%;
          max-width: 100%;
          border-radius: var(--ha-dialog-border-radius, 24px) var(--ha-dialog-border-radius, 24px) 0 0;
          border-bottom: none;
          border-left: none;
          border-right: none;
          padding-bottom: max(24px, env(safe-area-inset-bottom, 24px));
          overscroll-behavior: contain;
          animation: ha-popup-sheet-in var(--motion-duration-medium, var(--ha-animation-duration, 300ms)) var(--motion-easing-emphasized, var(--motion-easing-standard, cubic-bezier(0.2, 0, 0, 1))) forwards;
        }
        .popup-content.stats-modal {
          max-width: 100%;
        }
        .popup-content.stats-modal .modal-scroll-area {
          max-height: none;
        }
        .popup-content.closing {
          animation: ha-popup-sheet-out var(--motion-duration-short, 180ms) var(--motion-easing-standard, cubic-bezier(0.2, 0, 0, 1)) forwards;
        }
        .drag-handle { display: block; width: 36px; height: 5px; background-color: var(--secondary-text-color, #888); border-radius: 3px; margin: -4px auto 12px auto; flex-shrink: 0; position: sticky; top: -12px; z-index: 10; }
      }

      @media (prefers-reduced-motion: reduce) {
        .popup-overlay, .popup-content {
          animation: none !important;
          transition: none !important;
        }
      }
    `;
  }
}

// ==========================================
// VISUAL CARD EDITOR
// ==========================================
class PassableHvacCardEditor extends LitElement {
  static get properties() {
    return {
      hass: {},
      config: {},
    };
  }

  setConfig(config) {
    this.config = config || {};
  }

  _updateConfig(newConfig) {
    this.config = newConfig;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: this.config },
        bubbles: true,
        composed: true,
      })
    );
    this.requestUpdate();
  }

  _onFieldChange(ev) {
    if (!this.config) return;
    const target = ev.target;
    const key = target.configValue || target.getAttribute("configValue");
    if (!key) return;

    let val = ev.detail && ev.detail.value !== undefined
      ? ev.detail.value
      : (target.checked !== undefined ? target.checked : target.value);

    const newConfig = { ...this.config };
    if (val === "" || val === undefined || val === null) {
      delete newConfig[key];
    } else {
      newConfig[key] = val;
    }
    this._updateConfig(newConfig);
  }

  render() {
    if (!this.hass || !this.config) return html``;

    const c = this.config;
    const systems = c.systems || c.hvac_systems || [
      {
        key: "upstairs",
        name: c.upstairs_name || "Upstairs & Attic",
        icon: c.upstairs_icon || "mdi:home-floor-2",
        climate: c.upstairs_climate_hk || c.upstairs_climate || "climate.upstairs_hk"
      },
      {
        key: "downstairs",
        name: c.downstairs_name || "Downstairs & Basement",
        icon: c.downstairs_icon || "mdi:home-floor-1",
        climate: c.downstairs_climate_hk || c.downstairs_climate || "climate.downstairs_hk"
      }
    ];

    const systemCount = systems.length;

    return html`
      <div class="editor-container">
        <!-- Card Title Input -->
        <div class="form-group">
          <label class="form-label">Card Title</label>
          <ha-textfield
            label="Title (Optional, default: HVAC Systems)"
            .value=${this.config.title || ""}
            .configValue=${"title"}
            @input=${this._onFieldChange}
          ></ha-textfield>
        </div>

        <!-- Show Header Switch -->
        <div class="form-group" style="display:flex; align-items:center; justify-content:space-between;">
          <label class="form-label">Show Card Header</label>
          <ha-switch
            .checked=${this.config.show_header !== false}
            .configValue=${"show_header"}
            @change=${this._onFieldChange}
          ></ha-switch>
        </div>

        <!-- Hide Remote Sensors on Main Card Switch -->
        <div class="form-group" style="display:flex; align-items:center; justify-content:space-between;">
          <div>
            <label class="form-label" style="margin:0;">Hide Remote Sensors on Main Card</label>
            <p class="form-help" style="margin:2px 0 0 0; font-size:0.72rem; color:var(--secondary-text-color);">
              Default shows remote room temperature sensors on card.
            </p>
          </div>
          <ha-switch
            .checked=${this.config.hide_sensors_on_card === true}
            .configValue=${"hide_sensors_on_card"}
            @change=${this._onFieldChange}
          ></ha-switch>
        </div>

        <div class="section-box">
          <h3>HVAC System Configuration</h3>
          <p class="form-help" style="margin:2px 0 8px 0; font-size:0.75rem; color:var(--secondary-text-color);">
            Configure local HomeKit climate systems & optional helper overrides.
          </p>

          <!-- Number of Systems Selector -->
          <div class="form-group" style="margin-bottom:10px;">
            <label class="form-label">Number of HVAC Systems</label>
            <select
              class="custom-select"
              .value=${systemCount}
              @change=${(e) => this._onHVACSystemCountChange(parseInt(e.target.value))}
            >
              <option value="1">1 System</option>
              <option value="2">2 Systems</option>
              <option value="3">3 Systems</option>
              <option value="4">4 Systems</option>
              <option value="5">5 Systems</option>
              <option value="6">6 Systems</option>
            </select>
          </div>

          <!-- Global Preset Select Selector -->
          <ha-selector
            .hass=${this.hass}
            .selector=${{ entity: { domain: ["input_select", "select"] } }}
            .value=${c.global_setpoint_preset || "input_select.home_mode"}
            .configValue=${"global_setpoint_preset"}
            .label=${"Global Setpoint Preset Helper (e.g. input_select.home_mode)"}
            @value-changed=${this._onFieldChange}
          ></ha-selector>

          <!-- AC Condensers Uncovered Boolean Selector -->
          <ha-selector
            .hass=${this.hass}
            .selector=${{ entity: { domain: ["input_boolean", "switch"] } }}
            .value=${c.ac_condensers_uncovered || "input_boolean.ac_condensers_uncovered"}
            .configValue=${"ac_condensers_uncovered"}
            .label=${"AC Condensers Uncovered Boolean (e.g. input_boolean.ac_condensers_uncovered)"}
            @value-changed=${this._onFieldChange}
          ></ha-selector>

          <!-- Outdoor Weather / Temperature Entity Selector -->
          <ha-selector
            .hass=${this.hass}
            .selector=${{ entity: { domain: ["weather", "sensor"] } }}
            .value=${c.outdoor_weather_entity || c.outdoor_temp_sensor || c.outdoor_temp || "weather.home"}
            .configValue=${"outdoor_weather_entity"}
            .label=${"Outdoor Weather or Temperature Entity (e.g. weather.home or sensor.outdoor_temperature)"}
            @value-changed=${this._onFieldChange}
          ></ha-selector>

          <!-- Global Hide Remote Sensors -->
          <div class="form-group" style="display:flex; align-items:center; justify-content:space-between; margin-top:2px;">
            <label class="form-label" style="font-size:0.8rem; margin:0;">Hide Remote Sensors Globally on Card</label>
            <ha-switch
              .checked=${c.hide_sensors_on_card === true}
              @change=${(e) => this._updateConfig({ ...this.config, hide_sensors_on_card: e.target.checked })}
            ></ha-switch>
          </div>

          <!-- Global Start Sensors Expanded -->
          <div class="form-group" style="display:flex; align-items:center; justify-content:space-between; margin-top:2px;">
            <label class="form-label" style="font-size:0.8rem; margin:0;">Start Sensor Trays Expanded Globally</label>
            <ha-switch
              .checked=${c.sensors_start_expanded === true}
              @change=${(e) => this._updateConfig({ ...this.config, sensors_start_expanded: e.target.checked })}
            ></ha-switch>
          </div>

          <!-- Show Smart Climate Advisor Summary Strip -->
          <div class="form-group" style="display:flex; align-items:center; justify-content:space-between; margin-top:2px;">
            <label class="form-label" style="font-size:0.8rem; margin:0;">Show Smart Climate Advisor Strip</label>
            <ha-switch
              .checked=${c.show_advisor_strip !== false}
              @change=${(e) => this._updateConfig({ ...this.config, show_advisor_strip: e.target.checked })}
            ></ha-switch>
          </div>

          <!-- Show HVAC Stats Button -->
          <div class="form-group" style="display:flex; align-items:center; justify-content:space-between; margin-top:2px;">
            <label class="form-label" style="font-size:0.8rem; margin:0;">Show HVAC & Climate Stats Button</label>
            <ha-switch
              .checked=${c.show_stats_button !== false}
              @change=${(e) => this._updateConfig({ ...this.config, show_stats_button: e.target.checked })}
            ></ha-switch>
          </div>

          <!-- Show Home Avg Temp in Summary Strip -->
          <div class="form-group" style="display:flex; align-items:center; justify-content:space-between; margin-top:2px;">
            <label class="form-label" style="font-size:0.8rem; margin:0;">Show Home Avg Temp in Summary Strip</label>
            <ha-switch
              .checked=${c.show_home_avg_in_strip !== false}
              @change=${(e) => this._updateConfig({ ...this.config, show_home_avg_in_strip: e.target.checked })}
            ></ha-switch>
          </div>

          <!-- Home Average Temperature Entity Selector -->
          <ha-selector
            .hass=${this.hass}
            .selector=${{ entity: { domain: "sensor", device_class: "temperature" } }}
            .value=${c.home_temp_sensor || "sensor.home_average_temperature"}
            .configValue=${"home_temp_sensor"}
            .label=${"Home Average Temperature Entity (e.g. sensor.home_average_temperature)"}
            @value-changed=${this._onFieldChange}
          ></ha-selector>

          <!-- Collapsible Visual System Editors -->
          <div style="display:flex; flex-direction:column; gap:10px; margin-top:10px;">
            ${systems.map((sys, index) => this._renderHVACSystemEditorPanel(sys, index))}
          </div>
        </div>
      </div>
    `;
  }

  _renderHVACSystemEditorPanel(sys, index) {
    const overrideStateKey = `_override_helper_${sys.key || index}`;
    const showOverride = this[overrideStateKey] || false;

    return html`
      <details class="system-editor-details" style="background:var(--secondary-background-color, rgba(128,128,128,0.08)); border:1px solid var(--divider-color, rgba(128,128,128,0.18)); border-radius:10px; padding:10px 12px;">
        <summary style="font-weight:600; font-size:0.9rem; cursor:pointer; display:flex; align-items:center; justify-content:space-between; color:var(--primary-color);">
          <span>System ${index + 1}: ${sys.name || sys.key || `Zone ${index + 1}`}</span>
          <span style="font-size:0.75rem; opacity:0.7;">Click to expand</span>
        </summary>

        <div style="display:flex; flex-direction:column; gap:10px; margin-top:10px;">
          <ha-selector
            .hass=${this.hass}
            .selector=${{ text: {} }}
            .value=${sys.name || undefined}
            .label=${"Custom System Name (Optional, e.g. Upstairs & Attic)"}
            @value-changed=${(e) => this._updateHVACSystemConfig(index, "name", e.detail.value)}
          ></ha-selector>

          <ha-selector
            .hass=${this.hass}
            .selector=${{ text: {} }}
            .value=${sys.icon || "mdi:hvac"}
            .label=${"Custom System Icon (Optional, e.g. mdi:home-floor-2)"}
            @value-changed=${(e) => this._updateHVACSystemConfig(index, "icon", e.detail.value)}
          ></ha-selector>

          <!-- Primary Local Climate Entity Picker (HomeKit) -->
          <ha-selector
            .hass=${this.hass}
            .selector=${{ entity: { domain: "climate" } }}
            .value=${sys.climate || undefined}
            .label=${"Local Climate Entity (HomeKit)"}
            @value-changed=${(e) => this._updateHVACSystemConfig(index, "climate", e.detail.value)}
          ></ha-selector>

          <!-- Hide Remote Sensors for this system -->
          <div class="form-group" style="display:flex; align-items:center; justify-content:space-between; margin-top:2px;">
            <label class="form-label" style="font-size:0.8rem; margin:0;">Hide Sensors on Card for this System</label>
            <ha-switch
              .checked=${sys.hide_sensors_on_card === true}
              @change=${(e) => this._updateHVACSystemConfig(index, "hide_sensors_on_card", e.target.checked)}
            ></ha-switch>
          </div>

          <!-- Start Sensors Expanded on Card for this system -->
          <div class="form-group" style="display:flex; align-items:center; justify-content:space-between; margin-top:2px;">
            <label class="form-label" style="font-size:0.8rem; margin:0;">Start Sensor Tray Expanded</label>
            <ha-switch
              .checked=${sys.sensors_start_expanded === true}
              @change=${(e) => this._updateHVACSystemConfig(index, "sensors_start_expanded", e.target.checked)}
            ></ha-switch>
          </div>

          <!-- Exclude Thermostat itself from sensors list -->
          <div class="form-group" style="display:flex; align-items:center; justify-content:space-between; margin-top:2px;">
            <label class="form-label" style="font-size:0.8rem; margin:0;">Exclude Main Thermostat from Sensor List</label>
            <ha-switch
              .checked=${sys.exclude_thermostat_sensor !== false}
              @change=${(e) => this._updateHVACSystemConfig(index, "exclude_thermostat_sensor", e.target.checked)}
            ></ha-switch>
          </div>

          <!-- Remote Temperature Sensors Selector -->
          <ha-selector
            .hass=${this.hass}
            .selector=${{ entity: { domain: "sensor", device_class: "temperature", multiple: true } }}
            .value=${sys.sensors || undefined}
            .label=${"Remote Room Temperature Sensors (Auto-discovered if empty)"}
            @value-changed=${(e) => this._updateHVACSystemConfig(index, "sensors", e.detail.value)}
          ></ha-selector>

          <!-- On-demand Manual Entity Override Toggle -->
          <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,0.05); padding:8px 10px; border-radius:8px; margin-top:4px;">
            <span style="font-size:0.8rem; font-weight:600;">Manual Entity Overrides</span>
            <button
              type="button"
              style="background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:white; border-radius:6px; padding:4px 8px; font-size:0.75rem; cursor:pointer;"
              @click=${() => { this[overrideStateKey] = !showOverride; this.requestUpdate(); }}
            >
              ${showOverride ? "Hide Selectors" : "➕ Add / Override Helpers"}
            </button>
          </div>

          ${showOverride
            ? html`
                <div style="display:flex; flex-direction:column; gap:8px; padding-left:8px; border-left:2px solid var(--primary-color);">
                  <p style="font-size:0.7rem; color:var(--secondary-text-color); margin:0;">
                    Helpers auto-discover by default. Override specific helper entities below if needed.
                  </p>

                  <ha-selector
                    .hass=${this.hass}
                    .selector=${{ entity: { domain: "input_boolean" } }}
                    .value=${sys.overshoot_active || undefined}
                    .label=${"Overshoot Active Boolean"}
                    @value-changed=${(e) => this._updateHVACSystemConfig(index, "overshoot_active", e.detail.value)}
                  ></ha-selector>

                  <ha-selector
                    .hass=${this.hass}
                    .selector=${{ entity: { domain: ["input_number", "number"] } }}
                    .value=${sys.cool_overshoot || undefined}
                    .label=${"Cool Overshoot Helper Number"}
                    @value-changed=${(e) => this._updateHVACSystemConfig(index, "cool_overshoot", e.detail.value)}
                  ></ha-selector>

                  <ha-selector
                    .hass=${this.hass}
                    .selector=${{ entity: { domain: ["input_number", "number"] } }}
                    .value=${sys.heat_overshoot || undefined}
                    .label=${"Heat Overshoot Helper Number"}
                    @value-changed=${(e) => this._updateHVACSystemConfig(index, "heat_overshoot", e.detail.value)}
                  ></ha-selector>

                  <ha-selector
                    .hass=${this.hass}
                    .selector=${{ entity: { domain: ["sensor", "input_number"] } }}
                    .value=${sys.filter_hours || undefined}
                    .label=${"Filter Life Remaining Sensor"}
                    @value-changed=${(e) => this._updateHVACSystemConfig(index, "filter_hours", e.detail.value)}
                  ></ha-selector>

                  <ha-selector
                    .hass=${this.hass}
                    .selector=${{ entity: { domain: ["input_number", "number"] } }}
                    .value=${sys.filter_life || undefined}
                    .label=${"Max Filter Life Helper Number"}
                    @value-changed=${(e) => this._updateHVACSystemConfig(index, "filter_life", e.detail.value)}
                  ></ha-selector>

                  <ha-selector
                    .hass=${this.hass}
                    .selector=${{ entity: { domain: ["sensor"] } }}
                    .value=${sys.cool_daily || undefined}
                    .label=${"Daily Cooling Runtime Sensor (Optional)"}
                    @value-changed=${(e) => this._updateHVACSystemConfig(index, "cool_daily", e.detail.value)}
                  ></ha-selector>

                  <ha-selector
                    .hass=${this.hass}
                    .selector=${{ entity: { domain: ["sensor"] } }}
                    .value=${sys.heat_daily || undefined}
                    .label=${"Daily Heating Runtime Sensor (Optional)"}
                    @value-changed=${(e) => this._updateHVACSystemConfig(index, "heat_daily", e.detail.value)}
                  ></ha-selector>

                  <ha-selector
                    .hass=${this.hass}
                    .selector=${{ entity: { domain: ["sensor"] } }}
                    .value=${sys.cool_today || undefined}
                    .label=${"Today Cooling Runtime Sensor (Optional)"}
                    @value-changed=${(e) => this._updateHVACSystemConfig(index, "cool_today", e.detail.value)}
                  ></ha-selector>

                  <ha-selector
                    .hass=${this.hass}
                    .selector=${{ entity: { domain: ["sensor"] } }}
                    .value=${sys.heat_today || undefined}
                    .label=${"Today Heating Runtime Sensor (Optional)"}
                    @value-changed=${(e) => this._updateHVACSystemConfig(index, "heat_today", e.detail.value)}
                  ></ha-selector>
                </div>
              `
            : ""}
        </div>
      </details>
    `;
  }

  _onHVACSystemCountChange(newCount) {
    const c = this.config;
    const currentSystems = c.systems || c.hvac_systems || [
      { key: "upstairs", name: c.upstairs_name || "Upstairs & Attic", icon: c.upstairs_icon || "mdi:home-floor-2", climate: c.upstairs_climate_hk || c.upstairs_climate || "climate.upstairs_hk" },
      { key: "downstairs", name: c.downstairs_name || "Downstairs & Basement", icon: c.downstairs_icon || "mdi:home-floor-1", climate: c.downstairs_climate_hk || c.downstairs_climate || "climate.downstairs_hk" }
    ];

    const updatedSystems = [...currentSystems];
    while (updatedSystems.length < newCount) {
      const idx = updatedSystems.length + 1;
      updatedSystems.push({
        key: `system_${idx}`,
        name: `HVAC System ${idx}`,
        icon: "mdi:hvac",
        climate: `climate.hvac_system_${idx}_hk`
      });
    }
    while (updatedSystems.length > newCount) {
      updatedSystems.pop();
    }

    this._updateConfig({ ...this.config, systems: updatedSystems, hvac_systems: updatedSystems });
  }

  _updateHVACSystemConfig(index, field, value) {
    const c = this.config;
    const currentSystems = c.systems || c.hvac_systems || [
      { key: "upstairs", name: c.upstairs_name || "Upstairs & Attic", icon: c.upstairs_icon || "mdi:home-floor-2", climate: c.upstairs_climate_hk || c.upstairs_climate || "climate.upstairs_hk" },
      { key: "downstairs", name: c.downstairs_name || "Downstairs & Basement", icon: c.downstairs_icon || "mdi:home-floor-1", climate: c.downstairs_climate_hk || c.downstairs_climate || "climate.downstairs_hk" }
    ];

    const updatedSystems = currentSystems.map((s, i) => {
      if (i === index) {
        const updated = { ...s };
        if (value === "" || value === undefined || value === null) {
          delete updated[field];
        } else {
          updated[field] = value;
        }
        return updated;
      }
      return s;
    });

    this._updateConfig({ ...this.config, systems: updatedSystems, hvac_systems: updatedSystems });
  }

  static get styles() {
    return css`
      .editor-container {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 8px 0;
      }
      .form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .form-label {
        font-size: 0.9rem;
        font-weight: 600;
        color: var(--primary-text-color, #ffffff);
      }
      .form-help {
        font-size: 0.75rem;
        color: var(--secondary-text-color, #a1a1aa);
      }
      .custom-select {
        width: 100%;
        padding: 10px 12px;
        border-radius: 8px;
        background: var(--card-background-color, #242426);
        color: var(--primary-text-color, #ffffff);
        border: 1px solid var(--divider-color, rgba(255, 255, 255, 0.15));
        font-size: 0.95rem;
        outline: none;
      }
      .section-box {
        background: rgba(255, 255, 255, 0.03);
        border-radius: 12px;
        padding: 12px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .section-box h3 {
        margin: 0 0 4px 0;
        font-size: 0.95rem;
        color: var(--primary-color, #60a5fa);
      }
      ha-textfield, ha-selector {
        width: 100%;
      }
    `;
  }
}

if (!customElements.get("passable-hvac-card")) {
  customElements.define("passable-hvac-card", PassableHvacCard);
}
if (!customElements.get("passable-hvac-card-editor")) {
  customElements.define("passable-hvac-card-editor", PassableHvacCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "passable-hvac-card")) {
  window.customCards.push({
    type: "passable-hvac-card",
    name: "Passable HVAC Card",
    preview: true,
    documentationURL: "https://github.com/GBear09/passable-hvac-card",
    description: "Dynamic multi-system HVAC, heat pump, and comfort control card.",
  });
}
