import { useState } from "react";
import { Icon } from "../Icon";
import { defaultMapSettings, type MapSettings } from "./mapSettings";

export function MapSettingsPanel({
  settings,
  onChange,
  disabled,
}: {
  settings: MapSettings;
  onChange: (settings: MapSettings) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="icon-button"
        aria-label="Map settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        popoverTarget="campus-map-settings"
        disabled={disabled}
      >
        <Icon name="settings" />
      </button>
      <div
        id="campus-map-settings"
        className="map-settings-panel"
        popover="auto"
        role="dialog"
        aria-labelledby="map-settings-title"
        onToggle={(e) => setOpen(e.newState === "open")}
      >
        <div className="map-settings-header">
          <h2 id="map-settings-title">Map settings</h2>
          <button
            className="icon-button"
            aria-label="Close map settings"
            popoverTarget="campus-map-settings"
            popoverTargetAction="hide"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <label className="map-setting-toggle">
          <span>
            Heightmap<small>Show campus elevation</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={settings.heightmap}
            onChange={(e) =>
              onChange({ ...settings, heightmap: e.target.checked })
            }
          />
        </label>
        <div className="map-setting-relief">
          <div>
            <label htmlFor="map-relief">Relief scale</label>
            <output htmlFor="map-relief">{settings.relief.toFixed(1)}×</output>
          </div>
          <input
            id="map-relief"
            type="range"
            min="0.5"
            max="3"
            step="0.1"
            value={settings.relief}
            disabled={!settings.heightmap}
            aria-valuetext={`${settings.relief.toFixed(1)} times`}
            onChange={(e) =>
              onChange({ ...settings, relief: Number(e.target.value) })
            }
          />
          <div className="map-relief-limits">
            <span>0.5×</span>
            <span>3.0×</span>
          </div>
          <p>
            {settings.heightmap
              ? "1× shows the measured elevations."
              : "Enable the heightmap to adjust relief."}
          </p>
        </div>
        <div className="map-setting-shadows" role="group" aria-label="Shadows">
          <label className="map-setting-toggle">
            <span>
              Terrain shadows<small>Shading on hills and slopes</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={settings.terrainShadows}
              onChange={(e) =>
                onChange({ ...settings, terrainShadows: e.target.checked })
              }
            />
          </label>
          <label className="map-setting-toggle">
            <span>
              Building shadows<small>Shadows from campus structures</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={settings.buildingShadows}
              onChange={(e) =>
                onChange({ ...settings, buildingShadows: e.target.checked })
              }
            />
          </label>
        </div>
        <button
          type="button"
          className="map-settings-reset"
          onClick={() => onChange({ ...defaultMapSettings })}
        >
          Reset to default
        </button>
      </div>
    </>
  );
}
