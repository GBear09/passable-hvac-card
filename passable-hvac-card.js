/**
 * Passable HVAC Card
 * Version: 1.0.4
 * GitHub: https://github.com/GBear09/passable-hvac-card
 * 
 * Dynamic Multi-System HVAC, Heat Pump, and Comfort Control Custom Card for Home Assistant.
 * Features multi-zone management, overshoot buffer control, active fan recirculation,
 * 10-day heating/cooling runtime analytics, a 24-hour interactive SVG timeline,
 * and air filter lifespan maintenance tracking.
 */

const CARD_VERSION = "1.0.4";

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
    this._cardId = `phc-${Math.random().toString(36).substr(2, 9)}`;
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
    c.downstairs_filter_life = c.downstairs_filter_life || "input_number.hvac_filter_life_downstairs";

    c.upstairs_climate = c.upstairs_climate || (c.device_prefix ? `climate.${p}_upstairs` : "climate.upstairs");
    c.upstairs_climate_hk = c.upstairs_climate_hk || (c.device_prefix ? `climate.${p}_upstairs_hk` : "climate.upstairs_hk");
    c.upstairs_setpoint_preset = c.upstairs_setpoint_preset || (c.device_prefix ? `input_text.${p}_active_profile` : "input_text.hvac_active_profile");
    c.upstairs_overshoot_active = c.upstairs_overshoot_active || "input_boolean.hvac_overshoot_active_upstairs";
    c.upstairs_cool_overshoot = c.upstairs_cool_overshoot || "input_number.hvac_overshoot_amount_cool";
    c.upstairs_heat_overshoot = c.upstairs_heat_overshoot || "input_number.hvac_overshoot_amount_heat";
    c.upstairs_cool_overshoot_thresh = c.upstairs_cool_overshoot_thresh || "input_number.hvac_overshoot_threshold_cool";
    c.upstairs_heat_overshoot_thresh = c.upstairs_heat_overshoot_thresh || "input_number.hvac_overshoot_threshold_heat";
    c.upstairs_filter_hours = c.upstairs_filter_hours || "sensor.hvac_filter_life_remaining_upstairs";
    c.upstairs_filter_life = c.upstairs_filter_life || "input_number.hvac_filter_life_upstairs";

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
    const newVal = Math.max(0, Math.round((curVal + delta) * 10) / 10);
    this._setNumberEntity(entityId, newVal);
  }

  _setHvacMode(climateEntity, mode) {
    this._fireHaptic("medium");
    this.hass.callService("climate", "set_hvac_mode", {
      entity_id: climateEntity,
      hvac_mode: mode,
    });
  }

  _setHvacPresetMode(climateEntity, presetMode) {
    this._fireHaptic("medium");
    this.hass.callService("climate", "set_preset_mode", {
      entity_id: climateEntity,
      preset_mode: presetMode,
    });
  }

  _adjustHvacTemp(climateEntity, delta) {
    this._fireHaptic("light");
    const climate = this._getEntity(climateEntity);
    const curTarget = parseFloat(climate.attributes.temperature) || 70;
    this.hass.callService("climate", "set_temperature", {
      entity_id: climateEntity,
      temperature: curTarget + delta,
    });
  }

  _adjustFilterLifeAndHours(filterHoursId, filterLifeId, delta) {
    this._fireHaptic("light");
    const filterLife = this._getEntity(filterLifeId);
    let val = parseFloat(filterLife.state) || 300;
    val = Math.max(50, val + delta);
    this._setNumberEntity(filterLifeId, val);
    
    if (filterHoursId) {
      this._setNumberEntity(filterHoursId, val);
    }
  }

  _resetHvacFilter(filterHoursId, filterLifeId) {
    this._fireHaptic("heavy");
    const filterLife = this._getEntity(filterLifeId);
    const maxVal = parseFloat(filterLife.state) || 300;
    this._setNumberEntity(filterHoursId, maxVal);
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

  _showHvacModal(unitKey, type) {
    this._fireHaptic("light");
    this._activeHvacTab = type || "setpoints";
    this._hvacModal = { unitKey, type };
    this.requestUpdate();
  }

  _switchHvacTab(tabName) {
    this._fireHaptic("light");
    this._activeHvacTab = tabName;
    if (this._hvacModal) {
      this._hvacModal.type = tabName;
    }
    this.requestUpdate();
  }

  _closeHvacModal() {
    this._fireHaptic("light");
    const overlay = this.shadowRoot.querySelector(".popup-overlay");
    const content = this.shadowRoot.querySelector(".popup-content");
    if (overlay) overlay.classList.add("closing");
    if (content) {
      content.classList.add("closing");
      content.style.transform = "";
      content.classList.remove("visible");
    }

    setTimeout(() => {
      this._activeHvacTab = null;
      this._hvacModal = null;
      this.requestUpdate();
    }, 180);
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
    const popupContent = e.currentTarget;
    if (popupContent.scrollTop > 0) return;
    this._startY = e.touches[0].clientY;
    this._currentY = this._startY;
    this._touchTarget = popupContent;
    popupContent.style.animation = "none";
    popupContent.style.transition = "none";
  }

  _handleTouchMove(e) {
    if (this._startY === undefined || !this._touchTarget) return;
    const popupContent = this._touchTarget;
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - this._startY;

    if (deltaY > 0 && popupContent.scrollTop <= 0) {
      if (e.cancelable) e.preventDefault();
      this._currentY = currentY;
      popupContent.style.transform = `translateY(${deltaY}px)`;
    } else if (this._currentY !== undefined && currentY <= this._startY) {
      this._currentY = currentY;
      popupContent.style.transform = `translateY(0px)`;
    }
  }

  _handleTouchEnd(e) {
    if (this._startY === undefined || !this._touchTarget) return;
    const popupContent = this._touchTarget;
    const deltaY = (this._currentY !== undefined) ? (this._currentY - this._startY) : 0;

    if (deltaY > 80) {
      popupContent.style.transition = "transform 180ms ease-in, opacity 180ms ease-in";
      popupContent.style.transform = "translateY(100%)";
      popupContent.style.opacity = "0";
      setTimeout(() => {
        this._closeHvacModal();
      }, 180);
    } else {
      popupContent.style.transition = "transform 250ms cubic-bezier(0.2, 0, 0, 1)";
      popupContent.style.transform = "translateY(0px)";
    }
    this._startY = undefined;
    this._currentY = undefined;
    this._touchTarget = null;
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
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                  <h1 class="title">
                    <ha-icon icon="mdi:hvac" style="margin-right:8px; color: var(--primary-color);"></ha-icon>
                    ${c.title || "HVAC Systems"}
                  </h1>
                  ${globalPresetObj && globalPresetObj.state !== "unavailable" && globalPresetObj.state !== "unknown"
                    ? html`
                        <div class="global-preset-badge" @click=${() => this._showMoreInfo(c.global_setpoint_preset)}>
                          <ha-icon icon="mdi:tune-vertical" style="--mdc-icon-size:16px; margin-right:4px;"></ha-icon>
                          <span>${globalPresetObj.state}</span>
                        </div>
                      `
                    : ""}
                </div>
                <div class="header-subtitle-row">
                  <p class="subtitle">${systems.length} Local HVAC System${systems.length > 1 ? "s" : ""} & Comfort Control</p>
                </div>
              </div>
            `
          : ""}

        <div class="card-content">
          <div class="hvac-grid">
            ${systems.map((sys) => this._renderHvacUnitCard(sys.key, sys.name, sys.icon, sys.climate, sys))}
          </div>
        </div>

        ${this._renderHvacModal(systems)}
      </ha-card>
    `;
  }

  _getSystemSensors(unitKey, sysConfig = {}, defaultClimateId = null) {
    if (!this.hass) return [];
    const c = this.config;

    // 1. Explicit configuration per system or global card
    const explicit = sysConfig.sensors || (c.sensors && c.sensors[unitKey]);

    // Resolve climate entity for Ecobee attributes
    const climateKey = sysConfig.climate || c[`${unitKey}_climate`] || defaultClimateId;
    const climateState = this.hass.states[climateKey] || 
                         this.hass.states[`climate.${unitKey}`] || 
                         (defaultClimateId ? this.hass.states[defaultClimateId] : null);

    const activeSensors = (climateState && climateState.attributes && Array.isArray(climateState.attributes.active_sensors))
      ? climateState.attributes.active_sensors
      : [];
    const availableSensors = (climateState && climateState.attributes && Array.isArray(climateState.attributes.available_sensors))
      ? climateState.attributes.available_sensors
      : [];

    if (Array.isArray(explicit) && explicit.length > 0) {
      return explicit.map((item) => {
        const entId = typeof item === "string" ? item : item.entity;
        const stateObj = this.hass.states[entId];
        if (!stateObj) return null;
        let cleanName = (typeof item === "object" && item.name) ? item.name : stateObj.attributes.friendly_name || entId;
        cleanName = cleanName.replace(/ecobee sensor/gi, "")
                             .replace(/temperature/gi, "")
                             .replace(/[()]/g, "")
                             .trim();
        const rawTemp = parseFloat(stateObj.state);
        const temp = !isNaN(rawTemp) ? Math.round(rawTemp * 10) / 10 : stateObj.state;
        const unit = stateObj.attributes.unit_of_measurement || "°";
        const isActive = activeSensors.some((act) => {
          const actClean = act.replace(/ecobee sensor/gi, "").replace(/[()]/g, "").trim().toLowerCase();
          return actClean.includes(cleanName.toLowerCase()) || cleanName.toLowerCase().includes(actClean);
        });
        return {
          entityId: entId,
          name: (typeof item === "object" && item.name) ? item.name : (stateObj.attributes.friendly_name || entId),
          cleanName: cleanName || entId,
          temp,
          unit,
          isActive,
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
        if (isMainThermostat) return; // Keep remote room sensors only

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
          const isActive = activeSensors.some((act) => {
            const actClean = act.replace(/ecobee sensor/gi, "").replace(/[()]/g, "").trim().toLowerCase();
            return actClean.includes(cleanName.toLowerCase()) || cleanName.toLowerCase().includes(actClean);
          });
          discovered.push({
            entityId: match.entity_id,
            name: match.attributes.friendly_name || cleanName,
            cleanName: cleanName || match.entity_id,
            temp,
            unit,
            isActive,
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
    const climateId = sysConfig.climate || c[`${unitKey}_climate_hk`] || c[`${unitKey}_climate`] || defaultClimate;
    const presetId = sysConfig.setpoint_preset || c[`${unitKey}_setpoint_preset`] || "input_text.hvac_active_profile";
    const overshootActiveId = sysConfig.overshoot_active || c[`${unitKey}_overshoot_active`] || `input_boolean.hvac_overshoot_active_${unitKey}`;
    const coolOvershootId = sysConfig.cool_overshoot || c[`${unitKey}_cool_overshoot`] || "input_number.hvac_overshoot_amount_cool";
    const heatOvershootId = sysConfig.heat_overshoot || c[`${unitKey}_heat_overshoot`] || "input_number.hvac_overshoot_amount_heat";
    const filterHoursId = sysConfig.filter_hours || c[`${unitKey}_filter_hours`] || `sensor.hvac_filter_life_remaining_${unitKey}`;
    const filterLifeId = sysConfig.filter_life || c[`${unitKey}_filter_life`] || `input_number.hvac_filter_life_${unitKey}`;

    const climate = this._getEntity(climateId);
    const preset = this._getEntity(presetId);
    const overshootActiveObj = this._getEntity(overshootActiveId);
    const heatOvershoot = this._getEntity(heatOvershootId);
    const coolOvershoot = this._getEntity(coolOvershootId);
    const filterHours = this._getEntity(filterHoursId);
    const filterLife = this._getEntity(filterLifeId);

    const systemSensors = this._getSystemSensors(unitKey, sysConfig, climateId);

    const hvacAction = climate.attributes.hvac_action || climate.state || "idle";
    const currentTemp = climate.attributes.current_temperature ?? "--";
    
    // Round target setpoint to integer (e.g. 73.9 -> 74°)
    const targetRaw = climate.attributes.temperature ?? climate.attributes.target_temp_high ?? climate.attributes.target_temp_low;
    const targetTemp = targetRaw !== undefined && targetRaw !== null && !isNaN(parseFloat(targetRaw))
      ? Math.round(parseFloat(targetRaw))
      : "--";

    const humidity = climate.attributes.current_humidity ?? "--";

    let stateClass = "idle";
    let stateLabel = "IDLE";
    let stateIcon = "mdi:hvac-off";
    let dynamicCardStyle = "";
    let isAnimated = false;

    const mode = (climate.state || climate.attributes.hvac_mode || "").toLowerCase();

    if (hvacAction === "cooling") {
      stateClass = "active-cool";
      stateLabel = "COOLING";
      stateIcon = "mdi:snowflake";
      isAnimated = true;
      dynamicCardStyle = "background: rgba(var(--rgb-info-color, 3, 169, 244), 0.14); border: 1px solid var(--info-color, #03a9f4); box-shadow: 0 2px 10px rgba(var(--rgb-info-color, 3, 169, 244), 0.2);";
    } else if (hvacAction === "heating") {
      stateClass = "active-heat";
      stateLabel = "HEATING";
      stateIcon = "mdi:fire";
      isAnimated = true;
      dynamicCardStyle = "background: rgba(var(--rgb-warning-color, 255, 152, 0), 0.14); border: 1px solid var(--warning-color, #ff9800); box-shadow: 0 2px 10px rgba(var(--rgb-warning-color, 255, 152, 0), 0.2);";
    } else if (hvacAction === "fan") {
      stateClass = "active-fan";
      stateLabel = "FAN ONLY";
      stateIcon = "mdi:fan";
      isAnimated = true;
      dynamicCardStyle = "background: rgba(var(--rgb-success-color, 76, 175, 80), 0.14); border: 1px solid var(--success-color, #4caf50); box-shadow: 0 2px 10px rgba(var(--rgb-success-color, 76, 175, 80), 0.2);";
    } else if (mode === "cool") {
      stateClass = "idle-cool";
      stateLabel = "COOL (IDLE)";
      stateIcon = "mdi:snowflake";
    } else if (mode === "heat") {
      stateClass = "idle-heat";
      stateLabel = "HEAT (IDLE)";
      stateIcon = "mdi:fire";
    } else if (mode === "auto" || mode === "heat_cool") {
      stateClass = "idle-auto";
      stateLabel = "AUTO (IDLE)";
      stateIcon = "mdi:theme-light-dark";
    } else if (mode === "off") {
      stateClass = "power-off";
      stateLabel = "OFF";
      stateIcon = "mdi:power";
    }

    // Filter calculations & alert
    const remHours = (filterHours && filterHours.state !== "unavailable" && filterHours.state !== "unknown" && !isNaN(parseFloat(filterHours.state)))
      ? parseFloat(filterHours.state)
      : null;
    const isFilterExpired = remHours !== null && remHours <= 0;
    const isFilterWarning = remHours !== null && remHours > 0 && remHours <= 10;
    const isFilterAlert = isFilterExpired || isFilterWarning;

    // Overshoot display calculation
    const isOvershootActive = overshootActiveObj.state === "on" || (overshootActiveObj.state !== "off" && (hvacAction === "cooling" || hvacAction === "heating"));
    let activeOvershootOffset = null;
    if (isOvershootActive) {
      if (hvacAction === "cooling" && coolOvershoot.state && coolOvershoot.state !== "unavailable" && coolOvershoot.state !== "unknown") {
        activeOvershootOffset = `+${coolOvershoot.state}°`;
      } else if (hvacAction === "heating" && heatOvershoot.state && heatOvershoot.state !== "unavailable" && heatOvershoot.state !== "unknown") {
        activeOvershootOffset = `-${heatOvershoot.state}°`;
      } else if (overshootActiveObj.state === "on") {
        activeOvershootOffset = `Active`;
      }
    }

    const unitTitle = sysConfig.name || sysConfig.title || climate.attributes?.friendly_name || title || "HVAC System";

    // Preset display calculation
    const activePresetName = (climate.attributes.preset_mode && climate.attributes.preset_mode !== "temp" && climate.attributes.preset_mode !== "none") 
      ? climate.attributes.preset_mode 
      : (preset && preset.state !== "unavailable" && preset.state !== "unknown" ? preset.state : null);

    return html`
      <div
        class="hvac-unit-card ${stateClass}"
        style="${dynamicCardStyle}"
        @click=${() => this._showHvacModal(unitKey, "setpoints")}
        title="Tap to open controls & analytics for ${unitTitle}"
      >
        <!-- Left Section: Title Line with Inline Icon + Side-by-Side Meta Chips + Remote Sensors -->
        <div class="hvac-compact-left">
          <div class="hvac-compact-title-group">
            <span class="hvac-compact-name" style="display:inline-flex; align-items:center;">
              <ha-icon icon="${icon}" style="--mdc-icon-size:15px; margin-right:5px; color:var(--primary-color); flex-shrink:0;"></ha-icon>
              ${unitTitle}
            </span>

            <div class="hvac-compact-meta">
              <span class="status-chip ${stateClass}">
                <ha-icon icon="${stateIcon}" class="${stateClass === 'active-fan' ? 'hvac-spin-icon' : ''}" style="--mdc-icon-size:11px; margin-right:3px;"></ha-icon>
                ${stateLabel}
              </span>
              ${activePresetName
                ? html`
                    <span
                      class="hvac-mini-badge clickable"
                      @click=${(e) => { e.stopPropagation(); this._showHvacModal(unitKey, "setpoints"); }}
                      style="cursor:pointer; display:inline-flex; align-items:center;"
                      title="Active Preset: ${activePresetName} (Tap to change)"
                    >
                      <ha-icon
                        icon="${this._getPresetIcon(activePresetName)}"
                        style="--mdc-icon-size:11px; margin-right:2px; color:${this._getPresetColor(activePresetName)};"
                      ></ha-icon>
                      ${activePresetName}
                    </span>
                  `
                : ""}
              ${isFilterAlert
                ? html`
                    <span
                      class="hvac-mini-badge ${isFilterExpired ? 'alert-filter' : 'warning-filter'}"
                      @click=${(e) => { e.stopPropagation(); this._showHvacModal(unitKey, "filter"); }}
                      style="cursor:pointer;"
                      title="${isFilterExpired ? 'Air filter life expired (<= 0h)! Tap to view maintenance steps.' : 'Air filter life low (<= 10h)! Tap to view maintenance steps.'}"
                    >
                      ⚠️ ${isFilterExpired ? 'Replace Filter' : 'Filter Warning'}
                    </span>
                  `
                : ""}
            </div>

            ${(!c.hide_sensors_on_card && !sysConfig.hide_sensors_on_card && systemSensors.length > 0)
              ? html`
                  <div class="hvac-remote-sensors-strip">
                    ${systemSensors.map((s) => html`
                      <span
                        class="hvac-sensor-pill ${s.isActive ? 'active' : ''}"
                        @click=${(e) => { e.stopPropagation(); this._showMoreInfo(s.entityId); }}
                        title="${s.name}: ${s.temp}${s.unit} ${s.isActive ? '(Participating in comfort profile)' : '(Standby)'}"
                      >
                        ${s.isActive ? html`<span class="hvac-sensor-active-dot"></span>` : ""}
                        <span class="hvac-sensor-name">${s.cleanName}</span>
                        <span class="hvac-sensor-temp">${s.temp}°</span>
                      </span>
                    `)}
                  </div>
                `
              : ""}
          </div>
        </div>

        <!-- Center Section: Current Temp + Target Setpoint (with inline Overshoot offset) + Humidity -->
        <div class="hvac-compact-center">
          <div class="hvac-compact-temp">${currentTemp}°</div>
          <div class="hvac-compact-subtemp">
            Set ${targetTemp}°${activeOvershootOffset ? ` (${activeOvershootOffset})` : ""} • ${humidity}% RH
          </div>
        </div>
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

  _renderHvacModal(systems = []) {
    if (!this._hvacModal) return html``;

    const { unitKey, type } = this._hvacModal;
    const activeTab = this._activeHvacTab || type || "setpoints";
    const c = this.config;
    const sysConfig = (systems || []).find((s) => s.key === unitKey) || {};
    const unitTitle = sysConfig.name || (unitKey === "downstairs" ? "Downstairs & Basement" : "Upstairs & Attic");
    const resolveEntity = (primaryId, fallbacks) => {
      if (this.hass && this.hass.states[primaryId]) return primaryId;
      for (const fb of fallbacks) {
        if (this.hass && this.hass.states[fb]) return fb;
      }
      return primaryId;
    };

    const climateId = resolveEntity(
      sysConfig.climate || c[`${unitKey}_climate`],
      [`climate.${unitKey}`, `climate.${unitKey}_hk`, `climate.${unitKey}_thermostat`, `climate.hvac_${unitKey}`]
    );
    const acCondensersId = c.ac_condensers_uncovered || "input_boolean.ac_condensers_uncovered";
    const outdoorTempId = resolveEntity(
      sysConfig.outdoor_temp || c.outdoor_temp_sensor || c.outdoor_temp,
      ["sensor.outdoor_temperature", "weather.home", "weather.downstairs", "weather.upstairs"]
    );
    const fanCircId = sysConfig.fan_circulation || c[`${unitKey}_fan_circulation`] || `input_number.hvac_fan_circulation_${unitKey}`;
    const fanCircActiveId = sysConfig.fan_circ_active || c[`${unitKey}_fan_circ_active`] || `input_boolean.hvac_fan_circulation_active_${unitKey}`;
    const overshootActiveId = sysConfig.overshoot_active || c[`${unitKey}_overshoot_active`] || `input_boolean.hvac_overshoot_active_${unitKey}`;
    const coolOvershootId = sysConfig.cool_overshoot || c[`${unitKey}_cool_overshoot`] || "input_number.hvac_overshoot_amount_cool";
    const heatOvershootId = sysConfig.heat_overshoot || c[`${unitKey}_heat_overshoot`] || "input_number.hvac_overshoot_amount_heat";
    const coolThreshId = sysConfig.cool_overshoot_thresh || c[`${unitKey}_cool_overshoot_thresh`] || "input_number.hvac_overshoot_threshold_cool";
    const heatThreshId = sysConfig.heat_overshoot_thresh || c[`${unitKey}_heat_overshoot_thresh`] || "input_number.hvac_overshoot_threshold_heat";
    const filterHoursId = sysConfig.filter_hours || c[`${unitKey}_filter_hours`] || `sensor.hvac_filter_life_remaining_${unitKey}`;
    const filterLifeId = sysConfig.filter_life || c[`${unitKey}_filter_life`] || `input_number.hvac_filter_life_${unitKey}`;

    const climate = this._getEntity(climateId);
    const acCondensersObj = this._getEntity(acCondensersId);
    const outdoorTempObj = this._getEntity(outdoorTempId);
    const fanCircObj = this._getEntity(fanCircId);
    const fanCircActiveObj = this._getEntity(fanCircActiveId);
    const overshootActiveObj = this._getEntity(overshootActiveId);
    const heatOvershoot = this._getEntity(heatOvershootId);
    const coolOvershoot = this._getEntity(coolOvershootId);
    const coolThresh = this._getEntity(coolThreshId);
    const heatThresh = this._getEntity(heatThreshId);
    const filterHours = this._getEntity(filterHoursId);
    const filterLife = this._getEntity(filterLifeId);

    const modalSensors = this._getSystemSensors(unitKey, sysConfig, climateId);

    const coolTodaySensorId = sysConfig.cool_today || c[`${unitKey}_cool_today`] || `sensor.hvac_${unitKey}_cooling_today`;
    const heatTodaySensorId = sysConfig.heat_today || c[`${unitKey}_heat_today`] || `sensor.hvac_${unitKey}_heating_today`;
    const coolDailySensorId = sysConfig.cool_daily || c[`${unitKey}_cool_daily`] || `sensor.hvac_${unitKey}_cooling_daily`;
    const heatDailySensorId = sysConfig.heat_daily || c[`${unitKey}_heat_daily`] || `sensor.hvac_${unitKey}_heating_daily`;

    const coolTodayObj = this._getEntity(coolTodaySensorId) || this._getEntity(`sensor.hvac_${unitKey}_cooling_runtime_today`);
    const heatTodayObj = this._getEntity(heatTodaySensorId) || this._getEntity(`sensor.hvac_${unitKey}_heating_runtime_today`);

    const liveCoolToday = (coolTodayObj && coolTodayObj.state && !isNaN(parseFloat(coolTodayObj.state)))
      ? parseFloat(parseFloat(coolTodayObj.state).toFixed(1))
      : 0.0;

    const liveHeatToday = (heatTodayObj && heatTodayObj.state && !isNaN(parseFloat(heatTodayObj.state)))
      ? parseFloat(parseFloat(heatTodayObj.state).toFixed(1))
      : 0.0;

    const presetModes = (climate && climate.attributes && climate.attributes.preset_modes) || ["home", "away", "sleep", "ECO", "Alt Sleep"];
    const currentPreset = (climate && climate.attributes && climate.attributes.preset_mode) || "home";
    const isUpstairs = unitKey === "upstairs";

    const isHeatingSeason = climate && (climate.state === "heat" || (climate.attributes && climate.attributes.hvac_action === "heating"));
    const selectedDayIdx = (this._selectedHvacDayIndex !== undefined && this._selectedHvacDayIndex !== null) ? this._selectedHvacDayIndex : 9;
    const graphMode = this._hvacGraphMode || "multiday";

    const getOutdoorTempNum = (obj) => {
      if (!obj) return null;
      if (obj.attributes && obj.attributes.temperature !== undefined && obj.attributes.temperature !== null && !isNaN(parseFloat(obj.attributes.temperature))) {
        return parseFloat(obj.attributes.temperature);
      }
      if (obj.state && !isNaN(parseFloat(obj.state))) {
        return parseFloat(obj.state);
      }
      return null;
    };
    const liveOutdoorTemp = getOutdoorTempNum(outdoorTempObj);
    const liveOutdoorTempStr = liveOutdoorTemp !== null ? liveOutdoorTemp.toFixed(1) : "--";

    // Trigger History REST API / WS fetch if missing or stale (>30s)
    const cachedHistory = (this._hvacHistoryCache && this._hvacHistoryCache[unitKey]) ? this._hvacHistoryCache[unitKey] : null;
    if (!cachedHistory || Date.now() - cachedHistory.fetchedAt > 30000) {
      this._fetchHvacHistoryData(unitKey, climateId, outdoorTempId, coolDailySensorId, heatDailySensorId, coolTodaySensorId, heatTodaySensorId);
    }

    const outdoorTimeline = cachedHistory ? cachedHistory.outdoorHistory : [];
    const climateTimeline = cachedHistory ? cachedHistory.climateHistory : [];
    const statisticsData = cachedHistory ? (cachedHistory.statisticsData || {}) : {};
    const outdoorHistory10d = cachedHistory ? (cachedHistory.outdoorHistory10d || []) : [];
    const climateHistory10d = cachedHistory ? (cachedHistory.climateHistory10d || []) : [];

    // Helper: Normalize state item from HA WebSocket or REST API
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

    // Calculate actual average outdoor temperature today from outdoorTimeline if available
    let calculatedTodayAvgOutdoor = null;
    if (outdoorTimeline && outdoorTimeline.length > 0) {
      const validTemps = outdoorTimeline
        .map(s => {
          if (s.attributes && s.attributes.temperature !== undefined && s.attributes.temperature !== null && !isNaN(parseFloat(s.attributes.temperature))) {
            return parseFloat(s.attributes.temperature);
          }
          if (s.state && !isNaN(parseFloat(s.state))) {
            return parseFloat(s.state);
          }
          return null;
        })
        .filter(v => v !== null && !isNaN(v));
      if (validTemps.length > 0) {
        const sum = validTemps.reduce((acc, v) => acc + v, 0);
        calculatedTodayAvgOutdoor = (sum / validTemps.length).toFixed(1);
      }
    }

    const todayOutdoorAvgStr = calculatedTodayAvgOutdoor || liveOutdoorTempStr;

    // Helper: Local date key YYYY-MM-DD
    const getLocalDateKey = (ts) => {
      const d = (ts instanceof Date) ? ts : new Date(ts);
      if (isNaN(d.getTime())) return "";
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    // Index daily statistics arrays by local date key
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

    // Group 10-day outdoor history samples by local date key for average calculation
    const outdoorHistoryByDate = {};
    (outdoorHistory10d || []).forEach((item) => {
      const norm = normalizeState(item);
      if (!norm || norm.timeMs === 0) return;
      const key = getLocalDateKey(norm.timeMs);
      let temp = null;
      if (norm.attributes && norm.attributes.temperature !== undefined && !isNaN(parseFloat(norm.attributes.temperature))) {
        temp = parseFloat(norm.attributes.temperature);
      } else if (norm.state !== undefined && !isNaN(parseFloat(norm.state))) {
        temp = parseFloat(norm.state);
      }
      if (temp !== null) {
        if (!outdoorHistoryByDate[key]) outdoorHistoryByDate[key] = [];
        outdoorHistoryByDate[key].push(temp);
      }
    });

    // If climateHistory10d fallback is used, calculate daily run durations in hours
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

    // Compute 10 consecutive daily records ending on Today (0 to 9 days ago)
    const now = new Date();
    const historyDataRaw = Array.from({ length: 10 }, (_, i) => {
      const daysAgo = 9 - i;
      const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 12, 0, 0);
      const dateKey = getLocalDateKey(targetDate);

      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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
          const sum = temps.reduce((a, b) => a + b, 0);
          avgTemp = (sum / temps.length).toFixed(1);
        } else {
          avgTemp = todayOutdoorAvgStr;
        }
      }

      cool = parseFloat((cool || 0).toFixed(1));
      heat = parseFloat((heat || 0).toFixed(1));

      return { dayLabel, cool, heat, avgTemp, cx };
    });

    // DYNAMIC RUNTIME Y-AXIS SCALE CALCULATION
    const allRuntimes = historyDataRaw.map(d => isHeatingSeason ? parseFloat(d.heat) : parseFloat(d.cool));
    const maxRecordedRuntime = Math.max(0, ...allRuntimes);

    let maxGridHours = 2.0;
    if (maxRecordedRuntime > 9.5) {
      maxGridHours = Math.ceil(maxRecordedRuntime * 1.15 / 4) * 4;
    } else if (maxRecordedRuntime > 7.5) {
      maxGridHours = 10.0;
    } else if (maxRecordedRuntime > 5.5) {
      maxGridHours = 8.0;
    } else if (maxRecordedRuntime > 3.5) {
      maxGridHours = 6.0;
    } else if (maxRecordedRuntime > 1.8) {
      maxGridHours = 4.0;
    } else if (maxRecordedRuntime > 0.8) {
      maxGridHours = 2.0;
    } else {
      maxGridHours = 2.0;
    }

    const runtimeYLabels = {
      top: maxGridHours.toFixed(maxGridHours >= 10 ? 0 : 1),
      midHigh: (maxGridHours * 0.75).toFixed(1),
      mid: (maxGridHours * 0.50).toFixed(1),
      midLow: (maxGridHours * 0.25).toFixed(1),
      bottom: "0.0"
    };

    // Dynamic Y-Axis scale calculation for 10-day outdoor temperature curve
    const barTemps = historyDataRaw.map(d => parseFloat(d.avgTemp)).filter(t => !isNaN(t));
    const minBarTemp = barTemps.length > 0 ? Math.floor(Math.min(...barTemps) - 2) : 60;
    const maxBarTemp = barTemps.length > 0 ? Math.ceil(Math.max(...barTemps) + 2) : 90;
    const barTempSpan = Math.max(1, maxBarTemp - minBarTemp);

    const calcBarY = (tempVal) => {
      const v = Math.max(minBarTemp, Math.min(maxBarTemp, parseFloat(tempVal) || minBarTemp));
      return 160 - ((v - minBarTemp) / barTempSpan) * 140;
    };

    const historyData = historyDataRaw.map(d => ({
      ...d,
      cy: calcBarY(d.avgTemp)
    }));

    const activeDay = historyData[selectedDayIdx] || historyData[9];

    const barYGridLabels = {
      top: `${maxBarTemp}`,
      midHigh: `${Math.round(minBarTemp + barTempSpan * 0.75)}`,
      mid: `${Math.round(minBarTemp + barTempSpan * 0.50)}`,
      midLow: `${Math.round(minBarTemp + barTempSpan * 0.25)}`,
      bottom: `${minBarTemp}`
    };

    // Smooth SVG path builder function
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
    const startTimeMs = cachedHistory ? cachedHistory.startTime : (endTimeMs - 24 * 3600 * 1000);

    const stepMinutes = parseInt(this._hvacTimelineRes || 15, 10);
    const totalChunks = Math.max(1, Math.floor((24 * 60) / stepMinutes));

    const selectedChunkIdx = (this._selectedHvacChunkIndex !== undefined && this._selectedHvacChunkIndex !== null)
      ? Math.min(totalChunks - 1, this._selectedHvacChunkIndex)
      : (totalChunks - 1); // Default to current moment (Now)

    // Helper: Find active state in history stream for a given timestamp
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

    // Current live fallbacks if historical sample is missing
    const fallbackIndoor = (climate && climate.attributes && climate.attributes.current_temperature) ? climate.attributes.current_temperature : 72;
    const fallbackSetpoint = (climate && climate.attributes && (climate.attributes.temperature || climate.attributes.target_temp_low || climate.attributes.target_temp_high)) ? (climate.attributes.temperature || climate.attributes.target_temp_low || climate.attributes.target_temp_high) : 72;

    let fallbackOutdoor = liveOutdoorTemp !== null ? liveOutdoorTemp : 72;

    // Generate timelineData points directly from Home Assistant Recorder History API
    const rawTimelineData = Array.from({ length: totalChunks }, (_, idx) => {
      const cx = 30 + (idx / Math.max(1, totalChunks - 1)) * 280;
      const pointTimeMs = startTimeMs + (idx / Math.max(1, totalChunks - 1)) * (24 * 3600 * 1000);
      const pointDate = new Date(pointTimeMs);

      const hours = pointDate.getHours();
      const mins = pointDate.getMinutes();
      const displayHour = hours % 12 === 0 ? 12 : hours % 12;
      const ampm = hours < 12 ? "AM" : "PM";
      const minStr = String(mins).padStart(2, "0");
      const timeLabel = `${displayHour}:${minStr} ${ampm}`;

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

          if (act === "cooling" || act === "heating") {
            isActive = true;
          } else if (act === "idle" || act === "off") {
            isActive = false;
          } else {
            if (st === "cool" || st === "cooling") {
              isActive = parseFloat(indoorTemp) > (parseFloat(setpoint) + 0.1);
            } else if (st === "heat" || st === "heating") {
              isActive = parseFloat(indoorTemp) < (parseFloat(setpoint) - 0.1);
            } else if (st === "auto" || st === "heat_cool") {
              isActive = parseFloat(indoorTemp) > (parseFloat(setpoint) + 0.1) || parseFloat(indoorTemp) < (parseFloat(setpoint) - 0.1);
            }
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

      return { idx, pointTimeMs, timeLabel, indoorTemp: parseFloat(indoorTemp).toFixed(1), setpoint: parseFloat(setpoint).toFixed(1), outdoorTemp: parseFloat(outdoorTemp).toFixed(1), isActive, cx };
    });

    // DYNAMIC AUTOFIT Y-AXIS BOUNDS CALCULATION
    const allTemps = rawTimelineData.flatMap(pt => [parseFloat(pt.indoorTemp), parseFloat(pt.setpoint), parseFloat(pt.outdoorTemp)]);
    const rawMinTemp = Math.min(...allTemps);
    const rawMaxTemp = Math.max(...allTemps);

    // Autofit min/max grid temperatures with 2°F padding
    const minGridTemp = Math.floor(rawMinTemp - 2);
    const maxGridTemp = Math.ceil(rawMaxTemp + 2);
    const tempSpan = Math.max(1, maxGridTemp - minGridTemp);

    const calcTimelineY = (tempVal) => {
      const v = Math.max(minGridTemp, Math.min(maxGridTemp, parseFloat(tempVal) || minGridTemp));
      return 140 - ((v - minGridTemp) / tempSpan) * 120;
    };

    // Apply calculated Y-coordinates to timelineData
    const timelineData = rawTimelineData.map(pt => ({
      ...pt,
      indoorY: calcTimelineY(pt.indoorTemp),
      setpointY: calcTimelineY(pt.setpoint),
      outdoorY: calcTimelineY(pt.outdoorTemp)
    }));

    const activeHourData = timelineData[selectedChunkIdx] || timelineData[timelineData.length - 1];

    // Calculate contiguous active compressor run duration for selected chunk
    let activeRunRangeStr = "";
    if (activeHourData && activeHourData.isActive && timelineData && timelineData.length > 0) {
      let startIdx = selectedChunkIdx;
      while (startIdx > 0 && timelineData[startIdx - 1] && timelineData[startIdx - 1].isActive) {
        startIdx--;
      }
      let endIdx = selectedChunkIdx;
      while (endIdx < timelineData.length - 1 && timelineData[endIdx + 1] && timelineData[endIdx + 1].isActive) {
        endIdx++;
      }
      const startPt = timelineData[startIdx];
      const endPt = timelineData[endIdx];
      const count = (endIdx - startIdx + 1);
      const durMins = count * stepMinutes;

      const formatTimeShort = (labelStr) => {
        if (!labelStr) return "";
        const match = labelStr.match(/(\d+:\d+\s*(?:AM|PM))/i);
        return match ? match[1] : labelStr;
      };

      let durStr = `${durMins}m`;
      if (durMins >= 60) {
        const hrs = Math.floor(durMins / 60);
        const mins = durMins % 60;
        durStr = mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
      }

      const sStr = formatTimeShort(startPt.timeLabel);
      const eStr = formatTimeShort(endPt.timeLabel);
      activeRunRangeStr = (sStr === eStr) ? `${sStr} (${durStr})` : `${sStr} - ${eStr} (${durStr})`;
    }

    // Smart non-blocking tooltip position calculation
    const ttWidth = activeRunRangeStr ? 144 : 126;
    const ttHeight = activeRunRangeStr ? 54 : 44;
    let ttX = activeHourData.cx > 170 ? activeHourData.cx - ttWidth - 10 : activeHourData.cx + 10;
    ttX = Math.max(10, Math.min(340 - ttWidth - 10, ttX));

    const minLineY = Math.min(activeHourData.indoorY, activeHourData.setpointY, activeHourData.outdoorY);
    const maxLineY = Math.max(activeHourData.indoorY, activeHourData.setpointY, activeHourData.outdoorY);

    let ttY;
    if (minLineY > (ttHeight + 15)) {
      ttY = Math.max(10, minLineY - ttHeight - 6);
    } else if (maxLineY < (140 - ttHeight - 6)) {
      ttY = Math.min(140 - ttHeight, maxLineY + 6);
    } else {
      ttY = activeHourData.indoorY > 80 ? 12 : 90;
    }

    // Dynamic Y-axis labels
    const yGridLabels = {
      top: `${maxGridTemp}°`,
      midHigh: `${Math.round(minGridTemp + tempSpan * 0.75)}°`,
      mid: `${Math.round(minGridTemp + tempSpan * 0.50)}°`,
      midLow: `${Math.round(minGridTemp + tempSpan * 0.25)}°`,
      bottom: `${minGridTemp}°`
    };

    // Compute active compressor bands dynamically from real HA recorder history
    let activeBands = [];
    let currentBandStart = null;
    let currentBandEnd = null;

    const chunkWidth = totalChunks > 1 ? (280 / (totalChunks - 1)) : 10;

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
      } else {
        if (currentBandStart !== null) {
          activeBands.push({ x: currentBandStart, width: Math.max(3, currentBandEnd - currentBandStart) });
          currentBandStart = null;
          currentBandEnd = null;
        }
      }
    });

    if (currentBandStart !== null) {
      activeBands.push({ x: currentBandStart, width: Math.max(3, currentBandEnd - currentBandStart) });
    }

    const activeBandsPath = activeBands.map(b => 
      `M ${b.x.toFixed(1)} 20 H ${(b.x + b.width).toFixed(1)} V 140 H ${b.x.toFixed(1)} Z`
    ).join(" ");

    // Dynamic X-axis 24h rolling labels (7 timestamps across 24h)
    const xLabels = (timelineData && timelineData.length > 0)
      ? Array.from({ length: 7 }, (_, i) => {
          const idx = Math.min(timelineData.length - 1, Math.floor(i * (timelineData.length - 1) / 6));
          return timelineData[idx];
        }).filter(Boolean)
      : [];

    const indoorPathString = "M " + timelineData.map(pt => `${pt.cx.toFixed(1)} ${pt.indoorY.toFixed(1)}`).join(" L ");
    const setpointPathString = "M " + timelineData.map(pt => `${pt.cx.toFixed(1)} ${pt.setpointY.toFixed(1)}`).join(" L ");
    const outdoorPathString = "M " + timelineData.map(pt => `${pt.cx.toFixed(1)} ${pt.outdoorY.toFixed(1)}`).join(" L ");

    return html`
      <div class="popup-overlay" @click=${() => this._closeHvacModal()}>
        <div
          class="popup-content"
          @click=${(e) => e.stopPropagation()}
          @touchstart=${this._handleTouchStart}
          @touchmove=${this._handleTouchMove}
          @touchend=${this._handleTouchEnd}
        >
          <div class="drag-handle"></div>
          <div class="popup-header">
            <button class="close-button" @click=${() => this._closeHvacModal()}>
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
            <h3>${unitTitle} Controls & Analytics</h3>
          </div>

          <!-- Tabbed Header Bar -->
          <div class="popup-tabs">
            <button
              class="popup-tab ${activeTab === 'setpoints' ? 'active-tab' : ''}"
              @click=${() => this._switchHvacTab('setpoints')}
            >
              <ha-icon icon="mdi:tune"></ha-icon>
              <span>Setpoints</span>
            </button>
            <button
              class="popup-tab ${activeTab === 'stats' ? 'active-tab' : ''}"
              @click=${() => this._switchHvacTab('stats')}
            >
              <ha-icon icon="mdi:chart-box"></ha-icon>
              <span>Stats & Fan</span>
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
                  <!-- HVAC Mode -->
                  <div class="control-row">
                    <span class="control-label">HVAC Mode</span>
                    <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
                      ${["cool", "heat", "auto", "off"].map(
                        (m) => html`
                          <button
                            class="hvac-mode-btn ${climate.state === m ? "active" : ""}"
                            @click=${() => this._setHvacMode(climateId, m)}
                          >
                            ${m.toUpperCase()}
                          </button>
                        `
                      )}
                    </div>
                  </div>

                  <!-- Preset Modes -->
                  <div class="control-row">
                    <span class="control-label">Preset Mode</span>
                    <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
                      ${presetModes.map(
                        (p) => html`
                          <button
                            class="hvac-mode-btn ${currentPreset.toLowerCase() === p.toLowerCase() ? "active" : ""}"
                            @click=${() => this._setHvacPresetMode(climateId, p)}
                          >
                            ${p}
                          </button>
                        `
                      )}
                    </div>
                  </div>

                  <!-- Target Setpoint -->
                  <div class="control-row">
                    <span class="control-label">Target Setpoint</span>
                    <div class="step-controller-pill">
                      <button class="pill-btn" @click=${() => this._adjustHvacTemp(climateId, -0.5)}>-</button>
                      <span class="pill-value">${Math.round(climate.attributes.temperature || 70)}°F</span>
                      <button class="pill-btn" @click=${() => this._adjustHvacTemp(climateId, 0.5)}>+</button>
                    </div>
                  </div>

                  <!-- AC CONDENSERS UNCOVERED TOGGLE -->
                  ${acCondensersObj && acCondensersObj.state !== "unavailable"
                    ? html`
                        <div class="divider"></div>
                        <div class="control-row">
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

                  ${modalSensors.length > 0 ? html`
                    <div class="divider"></div>
                    <div style="background:var(--secondary-background-color, rgba(128, 128, 128, 0.08)); border:1px solid var(--divider-color, rgba(255, 255, 255, 0.08)); border-radius:14px; padding:12px; margin-bottom:12px;">
                      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <div style="font-size:0.85rem; font-weight:700; color:var(--primary-text-color); display:flex; align-items:center; gap:6px;">
                          <ha-icon icon="mdi:home-thermometer-outline" style="--mdc-icon-size:18px; color:var(--primary-color);"></ha-icon>
                          <span>Remote Room Sensors</span>
                        </div>
                        <span style="font-size:0.68rem; font-weight:600; padding:2px 6px; border-radius:6px; background:rgba(3,169,244,0.15); color:var(--primary-color);">${modalSensors.length} Connected</span>
                      </div>
                      <div class="hvac-modal-sensors-grid">
                        ${modalSensors.map((s) => html`
                          <div class="hvac-modal-sensor-tile ${s.isActive ? 'active' : ''}" @click=${() => this._showMoreInfo(s.entityId)} title="${s.name} (Tap for details)">
                            <div class="sensor-tile-top">
                              <span class="sensor-tile-name">${s.cleanName}</span>
                              <span class="sensor-tile-status ${s.isActive ? 'active' : 'standby'}">
                                ${s.isActive ? "Active" : "Standby"}
                              </span>
                            </div>
                            <div class="sensor-tile-temp">${s.temp}°</div>
                          </div>
                        `)}
                      </div>
                    </div>
                  ` : ""}

                  <div class="divider"></div>
                  <h4 style="margin:4px 0 10px 0; color:var(--primary-color); display:flex; align-items:center; gap:6px;">
                    <ha-icon icon="mdi:thermometer-cog" style="--mdc-icon-size:18px;"></ha-icon>
                    <span>Preset Temperature Setpoints</span>
                  </h4>

                  <!-- Group 1: Thermostat Specific Presets -->
                  <div style="background:var(--secondary-background-color, rgba(128, 128, 128, 0.08)); border:1px solid var(--divider-color, rgba(255, 255, 255, 0.08)); border-radius:14px; padding:12px; margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                      <div style="font-size:0.8rem; font-weight:700; color:var(--primary-text-color); display:flex; align-items:center; gap:6px;">
                        <ha-icon icon="mdi:home-thermometer" style="--mdc-icon-size:16px; color:var(--info-color, #38bdf8);"></ha-icon>
                        <span>Thermostat Specific Presets (${unitTitle.split('&')[0].trim()})</span>
                      </div>
                      <span style="font-size:0.65rem; font-weight:600; padding:2px 6px; border-radius:6px; background:rgba(56,189,248,0.15); color:#38bdf8;">Unit Specific</span>
                    </div>

                    ${this._renderPresetSetpointRow("Home Profile", `input_number.hvac_preset_${unitKey}_home_heat`, `input_number.hvac_preset_${unitKey}_home_cool`)}
                    ${this._renderPresetSetpointRow("Sleep Profile", `input_number.hvac_preset_${unitKey}_sleep_heat`, `input_number.hvac_preset_${unitKey}_sleep_cool`)}
                    ${this._renderPresetSetpointRow("Alt Sleep Profile", `input_number.hvac_preset_${unitKey}_alt_sleep_heat`, `input_number.hvac_preset_${unitKey}_alt_sleep_cool`)}
                  </div>

                  <!-- Group 2: Global System Presets -->
                  <div style="background:var(--secondary-background-color, rgba(128, 128, 128, 0.08)); border:1px solid var(--divider-color, rgba(255, 255, 255, 0.08)); border-radius:14px; padding:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                      <div style="font-size:0.8rem; font-weight:700; color:var(--primary-text-color); display:flex; align-items:center; gap:6px;">
                        <ha-icon icon="mdi:earth" style="--mdc-icon-size:16px; color:#3b82f6;"></ha-icon>
                        <span>Global System Presets</span>
                      </div>
                      <span style="font-size:0.65rem; font-weight:600; padding:2px 6px; border-radius:6px; background:rgba(59,130,246,0.15); color:#60a5fa;">All Thermostats</span>
                    </div>

                    ${this._renderPresetSetpointRow("Away Mode", "input_number.hvac_preset_away_heat", "input_number.hvac_preset_away_cool")}
                    ${this._renderPresetSetpointRow("Eco Mode", "input_number.hvac_preset_eco_heat", "input_number.hvac_preset_eco_cool")}
                    ${this._renderPresetSetpointRow("Vacation Mode", "input_number.hvac_preset_vacation_heat", "input_number.hvac_preset_vacation_cool")}
                    ${this._renderPresetSetpointRow("Protect Mode", "input_number.hvac_preset_protect_heat", "input_number.hvac_preset_protect_cool")}
                  </div>

                  <!-- 2-COLUMN OVERSHOOT SETTINGS PANEL -->
                  <div class="materials-section" style="padding:14px; margin-top:12px; background:var(--secondary-background-color, rgba(128, 128, 128, 0.08)); border:1px solid var(--divider-color, rgba(255, 255, 255, 0.12)); border-radius:16px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                      <h4 style="margin:0; font-size:1rem; font-weight:700; color:var(--primary-text-color);">Overshoot Settings</h4>
                      <ha-icon icon="mdi:thermometer" style="--mdc-icon-size:20px; opacity:0.7;"></ha-icon>
                    </div>

                    ${overshootActiveObj && overshootActiveObj.state !== "unavailable"
                      ? html`
                          <div class="control-row" style="margin-bottom:8px;">
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
                      <!-- HEAT COLUMN -->
                      <div style="background:var(--card-background-color, rgba(128, 128, 128, 0.05)); border:1px solid var(--divider-color, rgba(255, 255, 255, 0.08)); border-radius:14px; padding:10px; display:flex; flex-direction:column; gap:8px;">
                        <div style="display:flex; align-items:center; gap:6px; font-weight:700; font-size:0.9rem; color:#ea580c;">
                          <ha-icon icon="mdi:fire" style="--mdc-icon-size:16px;"></ha-icon>
                          <span>Heat</span>
                        </div>

                        <!-- Heat Threshold Box -->
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

                        <!-- Heat Amount Box -->
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

                      <!-- COOL COLUMN -->
                      <div style="background:var(--card-background-color, rgba(128, 128, 128, 0.05)); border:1px solid var(--divider-color, rgba(255, 255, 255, 0.08)); border-radius:14px; padding:10px; display:flex; flex-direction:column; gap:8px;">
                        <div style="display:flex; align-items:center; gap:6px; font-weight:700; font-size:0.9rem; color:#0284c7;">
                          <ha-icon icon="mdi:snowflake" style="--mdc-icon-size:16px;"></ha-icon>
                          <span>Cool</span>
                        </div>

                        <!-- Cool Threshold Box -->
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

                        <!-- Cool Amount Box -->
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
                `
              : activeTab === "stats"
              ? html`
                  <!-- TAB 2: FAN CIRCULATION & 10-DAY RUNTIME ANALYTICS -->
                  <div class="materials-section" style="background:rgba(14,165,233,0.08); border-color:rgba(14,165,233,0.25);">
                    <h3 style="color:var(--info-color, #0284c7); margin:0 0 10px 0;">
                      <ha-icon icon="mdi:fan-clock"></ha-icon>
                      Fan Recirculation Control
                    </h3>

                    <!-- Dedicated Fan Circulation Algorithm Toggle -->
                    <div class="control-row" style="margin-bottom:8px;">
                      <div class="control-label-group">
                        <ha-icon icon="mdi:recycle-variant" style="color:var(--info-color, #0284c7);"></ha-icon>
                        <span class="control-label">Recirculation Active</span>
                      </div>
                      <ha-switch
                        .checked=${fanCircActiveObj && fanCircActiveObj.state === "on"}
                        @change=${() => this._toggleEntity(fanCircActiveId)}
                        class="popup-switch"
                      ></ha-switch>
                    </div>

                    ${fanCircObj && fanCircObj.state && fanCircObj.state !== "unavailable"
                      ? html`
                          <div class="control-row">
                            <div class="control-label-group">
                              <ha-icon icon="mdi:timer-sand"></ha-icon>
                              <span class="control-label">Circulation Target (Min/Hr)</span>
                            </div>
                            <div class="step-controller-pill">
                              <button class="pill-btn" @click=${() => this._adjustNumberEntity(fanCircId, -5)}>-5m</button>
                              <span class="pill-value">${fanCircObj.state} m/h</span>
                              <button class="pill-btn" @click=${() => this._adjustNumberEntity(fanCircId, 5)}>+5m</button>
                            </div>
                          </div>
                        `
                      : ""}
                  </div>

                  <!-- 10-DAY COMBINED RUNTIME & TODAY 24H TIMELINE PLOT -->
                  <div class="materials-section" style="padding:10px 12px; background:rgba(0,0,0,0.35); min-height:275px; box-sizing:border-box;">
                    <div style="font-weight:700; font-size:0.9rem; color:var(--primary-text-color); text-align:center; margin-bottom:6px;">
                      HVAC Runtime & History (${unitTitle.split('&')[0].trim()})
                    </div>
                    <div style="display:flex; justify-content:center; gap:4px; background:rgba(0,0,0,0.4); padding:3px; border-radius:10px; margin:0 auto 8px auto; width:fit-content;">
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

                    ${graphMode === 'timeline'
                      ? html`
                          <!-- Resolution Selector (5m, 15m, 30m, 1h) -->
                          <div style="display:flex; justify-content:center; align-items:center; gap:4px; margin-bottom:8px;">
                            <span style="font-size:0.65rem; color:var(--secondary-text-color); font-weight:700; margin-right:2px;">Res:</span>
                            <div style="display:flex; gap:3px; background:rgba(0,0,0,0.4); padding:3px; border-radius:10px;">
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
                          <!-- MODE A: 10-DAY MULTI-DAY BAR CHART -->
                          <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:8px; font-family:sans-serif;">
                            <div>
                              <div style="font-size:1.4rem; font-weight:800; color:#ea580c; line-height:1;">${activeDay.heat}<span style="font-size:0.9rem; font-weight:600;">h</span></div>
                              <div style="font-size:0.65rem; color:var(--secondary-text-color);">Heating (${activeDay.dayLabel})</div>
                            </div>
                            <div>
                              <div style="font-size:1.4rem; font-weight:800; color:#3b82f6; line-height:1;">${activeDay.cool}<span style="font-size:0.9rem; font-weight:600;">h</span></div>
                              <div style="font-size:0.65rem; color:var(--secondary-text-color);">Cooling (${activeDay.dayLabel})</div>
                            </div>
                            <div style="text-align:right;">
                              <div style="font-size:1.4rem; font-weight:800; color:#ffffff; line-height:1;">${activeDay.avgTemp}<span style="font-size:0.9rem;">°F</span></div>
                              <div style="font-size:0.65rem; color:var(--secondary-text-color);">Avg Outdoor</div>
                            </div>
                          </div>

                          <!-- Combined Bar + Curve Line SVG Canvas -->
                          <div style="position:relative; width:100%; aspect-ratio: 1.75 / 1; overflow:visible;">
                            <svg viewBox="0 0 340 195" style="width:100%; height:100%; overflow:visible;">
                              <!-- Horizontal Grid Lines & Y-Axis Labels -->
                              <line x1="30" y1="20" x2="310" y2="20" stroke="rgba(255,255,255,0.15)" stroke-dasharray="3 3"/>
                              <text x="5" y="24" fill="#a1a1aa" font-size="10" font-weight="600">${runtimeYLabels.top}</text>
                              <text x="315" y="24" fill="#a1a1aa" font-size="10" font-weight="600">${barYGridLabels.top}</text>

                              <line x1="30" y1="55" x2="310" y2="55" stroke="rgba(255,255,255,0.12)" stroke-dasharray="3 3"/>
                              <text x="5" y="59" fill="#a1a1aa" font-size="10" font-weight="600">${runtimeYLabels.midHigh}</text>
                              <text x="315" y="59" fill="#a1a1aa" font-size="10" font-weight="600">${barYGridLabels.midHigh}</text>

                              <line x1="30" y1="90" x2="310" y2="90" stroke="rgba(255,255,255,0.12)" stroke-dasharray="3 3"/>
                              <text x="5" y="94" fill="#a1a1aa" font-size="10" font-weight="600">${runtimeYLabels.mid}</text>
                              <text x="315" y="94" fill="#a1a1aa" font-size="10" font-weight="600">${barYGridLabels.mid}</text>

                              <line x1="30" y1="125" x2="310" y2="125" stroke="rgba(255,255,255,0.12)" stroke-dasharray="3 3"/>
                              <text x="5" y="129" fill="#a1a1aa" font-size="10" font-weight="600">${runtimeYLabels.midLow}</text>
                              <text x="315" y="129" fill="#a1a1aa" font-size="10" font-weight="600">${barYGridLabels.midLow}</text>

                              <line x1="30" y1="160" x2="310" y2="160" stroke="rgba(255,255,255,0.3)"/>
                              <text x="5" y="164" fill="#a1a1aa" font-size="10" font-weight="600">${runtimeYLabels.bottom}</text>
                              <text x="315" y="164" fill="#a1a1aa" font-size="10" font-weight="600">${barYGridLabels.bottom}</text>

                              <!-- 10 Daily Cooling/Heating Bars in SVG Namespace with Click Event -->
                              ${historyData.map((d, i) => {
                                const runtimeVal = isHeatingSeason ? parseFloat(d.heat) : parseFloat(d.cool);
                                const rawHeight = (runtimeVal / maxGridHours) * 140;
                                const barHeight = runtimeVal > 0 ? Math.max(4, Math.min(140, rawHeight)) : 2;
                                const barY = 160 - barHeight;
                                return svg`
                                  <rect
                                    x="${d.cx - 7}"
                                    y="${barY}"
                                    width="14"
                                    height="${barHeight}"
                                    rx="3"
                                    fill="${isHeatingSeason ? '#ea580c' : '#2563eb'}"
                                    fill-opacity="${runtimeVal > 0 ? 1 : 0.35}"
                                    stroke="${selectedDayIdx === i ? '#ffffff' : '#38bdf8'}"
                                    stroke-width="${selectedDayIdx === i ? 2.5 : (runtimeVal > 0 ? 1.2 : 0.6)}"
                                    style="cursor:pointer;"
                                    @click=${() => this._selectHvacHistoryDay(i)}
                                  />
                                `;
                              })}

                              <!-- Outdoor Temperature Curved Overlay Line -->
                              <path
                                d="${multiDayPathString}"
                                fill="none"
                                stroke="#ffffff"
                                stroke-width="2.5"
                                stroke-linecap="round"
                              />

                              <!-- Dynamic Selected Day Point Tooltip Badge -->
                              <circle cx="${activeDay.cx}" cy="${activeDay.cy}" r="5" fill="#ffffff" stroke="${isHeatingSeason ? '#ea580c' : '#2563eb'}" stroke-width="2.5"/>
                              <g transform="translate(${Math.max(10, Math.min(290, activeDay.cx - 18))}, ${Math.max(8, activeDay.cy - 24)})">
                                <rect x="0" y="0" width="36" height="16" rx="4" fill="#ffffff"/>
                                <text x="18" y="11" fill="#000000" font-size="9" font-weight="800" text-anchor="middle">${activeDay.avgTemp}</text>
                              </g>

                              <!-- X-Axis Dynamic Clickable Dates -->
                              ${[0, 2, 4, 6, 8].map(i => historyData[i] ? svg`
                                <text
                                  x="${historyData[i].cx}"
                                  y="176"
                                  fill="${selectedDayIdx === i ? '#ffffff' : '#a1a1aa'}"
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
                          <!-- MODE B: TODAY 24H HIGH-RESOLUTION INTERACTIVE TIMELINE PLOT -->
                          <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:8px; font-family:sans-serif;">
                            <div>
                              <div style="font-size:1.4rem; font-weight:800; color:${isHeatingSeason ? '#ea580c' : '#3b82f6'}; line-height:1;">
                                ${isHeatingSeason ? liveHeatToday : liveCoolToday}<span style="font-size:0.9rem; font-weight:600;">h</span>
                              </div>
                              <div style="font-size:0.65rem; color:var(--secondary-text-color);">Today ${isHeatingSeason ? 'Heating' : 'Cooling'} (${activeHourData.timeLabel})</div>
                            </div>
                            <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; font-size:0.65rem; font-weight:600;">
                              <span style="color:#ffffff; display:flex; align-items:center; gap:3px;"><span style="display:inline-block; width:8px; height:2px; background:#ffffff;"></span> Outdoor (${liveOutdoorTempStr}°F)</span>
                              <span style="color:#eab308; display:flex; align-items:center; gap:3px;"><span style="display:inline-block; width:8px; height:2px; background:#eab308;"></span> Setpoint</span>
                              <span style="color:#38bdf8; display:flex; align-items:center; gap:3px;"><span style="display:inline-block; width:8px; height:2px; background:#38bdf8;"></span> Indoor</span>
                              <span style="color:${isHeatingSeason ? '#ea580c' : '#0284c7'}; display:flex; align-items:center; gap:3px;"><span style="display:inline-block; width:6px; height:6px; background:${isHeatingSeason ? 'rgba(234,88,12,0.5)' : 'rgba(2,132,199,0.5)'}; border-radius:2px;"></span> Active</span>
                            </div>
                          </div>

                          <!-- 24-Hour Timeline Plot SVG Canvas -->
                          <div style="position:relative; width:100%; aspect-ratio: 1.75 / 1; overflow:visible;">
                            <svg
                              viewBox="0 0 340 178"
                              style="width:100%; height:100%; overflow:visible; cursor:pointer;"
                              @click=${(e) => this._handleGraphClick(e, timelineData)}
                              @mousemove=${(e) => this._handleGraphDrag(e, timelineData)}
                              @touchmove=${(e) => this._handleGraphTouchDrag(e, timelineData)}
                            >
                              <!-- Horizontal Grid Lines & Dynamic Autofit Y-Axis Labels (°F) -->
                              <line x1="30" y1="20" x2="310" y2="20" stroke="rgba(255,255,255,0.12)" stroke-dasharray="3 3"/>
                              <text x="5" y="24" fill="#a1a1aa" font-size="10" font-weight="600">${yGridLabels.top}</text>

                              <line x1="30" y1="50" x2="310" y2="50" stroke="rgba(255,255,255,0.12)" stroke-dasharray="3 3"/>
                              <text x="5" y="54" fill="#a1a1aa" font-size="10" font-weight="600">${yGridLabels.midHigh}</text>

                              <line x1="30" y1="80" x2="310" y2="80" stroke="rgba(255,255,255,0.12)" stroke-dasharray="3 3"/>
                              <text x="5" y="84" fill="#a1a1aa" font-size="10" font-weight="600">${yGridLabels.mid}</text>

                              <line x1="30" y1="110" x2="310" y2="110" stroke="rgba(255,255,255,0.12)" stroke-dasharray="3 3"/>
                              <text x="5" y="114" fill="#a1a1aa" font-size="10" font-weight="600">${yGridLabels.midLow}</text>

                              <line x1="30" y1="140" x2="310" y2="140" stroke="rgba(255,255,255,0.3)"/>
                              <text x="5" y="144" fill="#a1a1aa" font-size="10" font-weight="600">${yGridLabels.bottom}</text>

                              <!-- Shaded Active HVAC Compressor Bands (Real HA History Data) -->
                              <path
                                d="${activeBandsPath}"
                                fill="${isHeatingSeason ? 'rgba(249,115,22,0.30)' : 'rgba(56,189,248,0.30)'}"
                              />

                              <!-- Vertical Hairline Indicator Line for Selected Hour -->
                              <line x1="${activeHourData.cx}" y1="20" x2="${activeHourData.cx}" y2="140" stroke="rgba(255,255,255,0.4)" stroke-dasharray="2 2"/>

                              <!-- White Dashed Line: Outdoor Temperature Curve -->
                              <path
                                d="${outdoorPathString}"
                                fill="none"
                                stroke="#ffffff"
                                stroke-width="2"
                                stroke-dasharray="4 3"
                                stroke-linecap="round"
                              />

                              <!-- Yellow/Orange Step Line: Target Setpoint -->
                              <path
                                d="${setpointPathString}"
                                fill="none"
                                stroke="#eab308"
                                stroke-width="2.2"
                              />

                              <!-- Blue Line: Indoor Temperature Curve -->
                              <path
                                d="${indoorPathString}"
                                fill="none"
                                stroke="#38bdf8"
                                stroke-width="2.5"
                                stroke-linecap="round"
                              />

                              <!-- Glowing Selection Point Markers for Active Chunk -->
                              <circle cx="${activeHourData.cx}" cy="${activeHourData.outdoorY}" r="4" fill="#ffffff" stroke="#000000" stroke-width="1.5"/>
                              <circle cx="${activeHourData.cx}" cy="${activeHourData.setpointY}" r="4" fill="#eab308" stroke="#000000" stroke-width="1.5"/>
                              <circle cx="${activeHourData.cx}" cy="${activeHourData.indoorY}" r="5" fill="#38bdf8" stroke="#ffffff" stroke-width="2"/>

                              <!-- Dynamic Smart Non-Blocking Tooltip Annotation Badge -->
                              <g transform="translate(${ttX}, ${ttY})">
                                <rect x="0" y="0" width="${activeRunRangeStr ? 144 : 126}" height="${activeRunRangeStr ? 52 : 44}" rx="6" fill="rgba(15,23,42,0.95)" stroke="rgba(255,255,255,0.3)" stroke-width="1.2"/>
                                <text x="7" y="13" fill="#ffffff" font-size="9" font-weight="700">${activeHourData.timeLabel}</text>
                                <text x="${activeRunRangeStr ? 137 : 119}" y="13" fill="#38bdf8" font-size="9" font-weight="800" text-anchor="end">In: ${activeHourData.indoorTemp}°F</text>
                                
                                <text x="7" y="26" fill="${activeHourData.isActive ? (isHeatingSeason ? '#f97316' : '#38bdf8') : '#a1a1aa'}" font-size="8" font-weight="600">
                                  ${activeHourData.isActive ? (isHeatingSeason ? 'Heating Active' : 'Cooling Active') : 'Idle'}
                                </text>
                                <text x="${activeRunRangeStr ? 137 : 119}" y="26" fill="#eab308" font-size="8.5" font-weight="800" text-anchor="end">Set: ${activeHourData.setpoint}°F</text>
                                
                                <text x="7" y="37" fill="#a1a1aa" font-size="8" font-weight="500">Out: ${activeHourData.outdoorTemp}°F</text>
                                ${activeRunRangeStr ? svg`<text x="7" y="47" fill="#38bdf8" font-size="7.5" font-weight="700">Ran ${activeRunRangeStr}</text>` : ''}
                              </g>

                              <!-- Interactive Resolution Touch Targets -->
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

                              <!-- X-Axis Dynamic 24h Timestamps -->
                              ${(xLabels || []).map(
                                (xl) => xl ? svg`
                                  <text
                                    x="${xl.cx}"
                                    y="162"
                                    fill="${selectedChunkIdx === xl.idx ? '#ffffff' : '#a1a1aa'}"
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
                `
              : html`
                  <!-- TAB 3: AIR FILTER MAINTENANCE -->
                  <div class="materials-section">
                    <h3><ha-icon icon="mdi:air-filter"></ha-icon> Air Filter Lifespan & Settings</h3>
                    
                    <div class="control-row" style="margin-bottom:12px;">
                      <div class="control-label-group">
                        <ha-icon icon="mdi:timer-outline"></ha-icon>
                        <span class="control-label">Filter Life Remaining</span>
                      </div>
                      <span class="control-value" style="font-weight:700; color:var(--primary-color);">${(filterHours && filterHours.state) || 0} hrs</span>
                    </div>

                    <div class="control-row">
                      <div class="control-label-group">
                        <ha-icon icon="mdi:speedometer"></ha-icon>
                        <span class="control-label">Max Recommended Lifespan</span>
                      </div>
                      <div class="step-controller-pill">
                        <button class="pill-btn" @click=${() => this._adjustFilterLifeAndHours(filterHoursId, filterLifeId, -25)}>-25h</button>
                        <span class="pill-value">${(filterLife && filterLife.state) || 300} hrs</span>
                        <button class="pill-btn" @click=${() => this._adjustFilterLifeAndHours(filterHoursId, filterLifeId, 25)}>+25h</button>
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

                  <button class="recirc-button active" style="width:100%; margin-top:16px;" @click=${() => this._resetHvacFilter(filterHoursId, filterLifeId)}>
                    <ha-icon icon="mdi:refresh"></ha-icon>
                    <span>RESET FILTER LIFE COUNTER</span>
                  </button>
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
        padding: 16px;
        container-type: inline-size;
      }
      .header + .card-content, .header ~ .card-content {
        padding-top: 0;
      }

      /* HVAC ULTRA-COMPACT MICRO-ROW STYLES */
      .hvac-grid { display: flex; flex-direction: column; gap: 8px; }
      .hvac-unit-card {
        background: var(--secondary-background-color, rgba(128,128,128,0.12));
        border-radius: 14px;
        padding: 8px 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        border: 1px solid var(--divider-color, rgba(255,255,255,0.08));
        transition: background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
        min-height: 54px;
        cursor: pointer;
      }
      .hvac-unit-card:hover {
        background: var(--secondary-background-color, rgba(128,128,128,0.18));
        border-color: rgba(var(--rgb-primary-color, 3, 169, 244), 0.35);
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
      }
      .hvac-compact-left { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
      .hvac-compact-title-group { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .hvac-compact-name { font-weight: 600; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--primary-text-color); }
      .hvac-compact-meta { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
      .hvac-mini-badge { font-size: 0.65rem; padding: 1px 5px; border-radius: 6px; background: rgba(0,0,0,0.3); color: var(--secondary-text-color); white-space: nowrap; }
      .hvac-mini-badge.overshoot { background: rgba(251, 146, 60, 0.2); color: #fb923c; }

      /* REMOTE ROOM SENSORS */
      .hvac-remote-sensors-strip {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 4px;
        align-items: center;
      }
      .hvac-sensor-pill {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 1px 6px;
        border-radius: 6px;
        font-size: 0.68rem;
        background: var(--card-background-color, rgba(128,128,128,0.1));
        border: 1px solid var(--divider-color, rgba(255,255,255,0.08));
        color: var(--secondary-text-color);
        cursor: pointer;
        transition: all 0.15s ease;
        user-select: none;
      }
      .hvac-sensor-pill:hover {
        background: var(--secondary-background-color, rgba(128,128,128,0.2));
        border-color: var(--primary-color);
        color: var(--primary-text-color);
      }
      .hvac-sensor-pill.active {
        background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.12);
        border-color: rgba(var(--rgb-primary-color, 3, 169, 244), 0.35);
        color: var(--primary-text-color);
        font-weight: 500;
      }
      .hvac-sensor-active-dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: var(--success-color, #22c55e);
        flex-shrink: 0;
      }
      .hvac-sensor-name {
        white-space: nowrap;
      }
      .hvac-sensor-temp {
        font-weight: 700;
        color: var(--primary-text-color);
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

      .hvac-compact-center { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 4px; flex-shrink: 0; }
      .hvac-compact-temp { font-size: 1.85rem; font-weight: 800; line-height: 0.9; color: var(--primary-text-color); letter-spacing: -0.03em; }
      .hvac-compact-subtemp { font-size: 0.65rem; color: var(--secondary-text-color); white-space: nowrap; margin-top: 1px; }

      .hvac-compact-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
      .hvac-icon-btn {
        width: 32px; height: 32px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.06); color: var(--primary-text-color);
        display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;
      }
      .hvac-icon-btn:hover { background: rgba(255,255,255,0.16); }
      .hvac-icon-btn ha-icon { --mdc-icon-size: 16px; }
      .hvac-icon-btn.warning { border-color: rgba(250, 204, 21, 0.5); color: #facc15; }
      .hvac-icon-btn.expired { border-color: rgba(239, 68, 68, 0.6); color: #ef4444; }

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
        top: -3px;
        right: -3px;
        width: 8px;
        height: 8px;
        background-color: #ef4444;
        border-radius: 50%;
        border: 1px solid rgba(0,0,0,0.6);
      }
      .filter-alert-dot.warning {
        background-color: #f59e0b;
      }
      .hvac-mini-badge.alert-filter {
        background: rgba(239, 68, 68, 0.25);
        color: #ef4444;
        border: 1px solid rgba(239, 68, 68, 0.6);
        font-weight: 700;
      }
      .hvac-mini-badge.warning-filter {
        background: rgba(245, 158, 11, 0.25);
        color: #f59e0b;
        border: 1px solid rgba(245, 158, 11, 0.6);
        font-weight: 700;
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
        z-index: 9999;
        animation: ha-popup-backdrop-fade-in var(--motion-duration-medium, var(--ha-animation-duration, 280ms)) var(--motion-easing-standard, cubic-bezier(0.2, 0, 0, 1)) forwards;
        will-change: opacity;
      }
      .popup-overlay.closing {
        animation: ha-popup-backdrop-fade-out var(--motion-duration-short, 180ms) var(--motion-easing-standard, cubic-bezier(0.2, 0, 0, 1)) forwards;
      }

      .popup-content {
        background-color: var(--ha-card-background, var(--card-background-color, #fff));
        padding: 16px 20px 20px;
        border-radius: var(--ha-dialog-border-radius, var(--ha-card-border-radius, 24px));
        width: 100%;
        max-width: 440px;
        max-height: 90vh;
        overflow-y: auto;
        overflow-x: hidden;
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

      /* POPUP TABS NAVIGATION */
      .popup-tabs {
        display: flex;
        background: rgba(128, 128, 128, 0.12);
        padding: 4px;
        border-radius: 14px;
        gap: 4px;
        margin-bottom: 14px;
        width: 100%;
        box-sizing: border-box;
      }
      .popup-tab {
        flex: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 8px 10px;
        border-radius: 10px;
        background: transparent;
        border: none;
        color: var(--secondary-text-color);
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        user-select: none;
        box-sizing: border-box;
      }
      .popup-tab ha-icon {
        --mdc-icon-size: 16px;
      }
      .popup-tab:hover {
        color: var(--primary-text-color);
        background: rgba(128, 128, 128, 0.15);
      }
      .popup-tab.active-tab {
        background: var(--primary-color, #3b82f6);
        color: var(--text-primary-color, var(--primary-text-color, #fff));
        font-weight: 700;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
      }
      .popup-tab.active-tab ha-icon {
        color: var(--text-primary-color, var(--primary-text-color, #fff));
      }

      @media (max-width: 768px) {
        .popup-overlay {
          align-items: flex-end;
          justify-content: center;
          padding: 0;
          overscroll-behavior: contain;
          touch-action: none;
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
      <details class="system-editor-details" style="background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.12); border-radius:10px; padding:10px 12px;">
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

customElements.define("passable-hvac-card", PassableHvacCard);
customElements.define("passable-hvac-card-editor", PassableHvacCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "passable-hvac-card",
  name: "Passable HVAC Card",
  preview: true,
  documentationURL: "https://github.com/GBear09/passable-hvac-card",
  description: "Dynamic multi-system HVAC, heat pump, and comfort control card.",
});
