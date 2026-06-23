import {
  Component,
  createEffect,
  onMount,
  createSignal,
  onCleanup,
} from "solid-js";
import { createStore } from "solid-js/store";
import { Sun, Eye, EyeClosed, RotateCcw, ChartSpline } from "lucide-solid";
import { Slider } from "./components/Slider";
import { Viewport } from "./components/Viewport";
import { Histogram } from "./components/Histogram";
import { ToneCurve, CurveState } from "./components/ToneCurve";

declare const window: any;

const App: Component = () => {
  const [lightState, setLightState] = createStore({
    exposure: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    texture: 0,
    clarity: 0,
    dehaze: 0,
    temp: 0,
    tint: 0,
    vibrance: 0,
    saturation: 0,
    enabled: true,
  });

  const [isWasmReady, setIsWasmReady] = createSignal(false);
  const [histogramData, setHistogramData] = createSignal<number[]>([]);
  const [lightExpanded, setLightExpanded] = createSignal(true);
  const [curveExpanded, setCurveExpanded] = createSignal(true);

  const defaultCurves = (): CurveState => ({
    master: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
    red: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
    green: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
    blue: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
  });
  const [curves, setCurves] = createSignal<CurveState>(defaultCurves());

  let triggerExport: () => void = () => {};

  onMount(() => {
    const initBackend = () => {
      setIsWasmReady(true);
      window.Module.ccall("init_backend", "number", [], []);
    };
    if (typeof window.Module !== "undefined" && window.Module.ccall) {
      initBackend();
    } else {
      window.addEventListener("wasm-ready", initBackend);
      onCleanup(() => window.removeEventListener("wasm-ready", initBackend));
    }
  });

  createEffect(() => {
    if (!isWasmReady()) return;
    const params = [
      lightState.exposure,
      lightState.contrast,
      lightState.highlights,
      lightState.shadows,
      lightState.whites,
      lightState.blacks,
      lightState.texture,
      lightState.clarity,
      lightState.dehaze,
      lightState.temp,
      lightState.tint,
      lightState.vibrance,
      lightState.saturation,
    ];
    window.Module.ccall(
      "update_light_params",
      "void",
      [
        "number",
        "number",
        "number",
        "number",
        "number",
        "number",
        "number",
        "number",
        "number",
        "number",
        "number",
        "number",
        "number",
      ],
      lightState.enabled ? params : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    );
  });

  const resetLightParams = () =>
    setLightState({
      exposure: 0,
      contrast: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
      texture: 0,
      clarity: 0,
      dehaze: 0,
      temp: 0,
      tint: 0,
      vibrance: 0,
      saturation: 0,
    });
  const toggleLightGroup = () => setLightState("enabled", (e) => !e);

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        height: "100vh",
        width: "100vw",
      }}
    >
      <header
        style={{
          height: "44px",
          background: "#1c1c1c",
          "border-bottom": "1px solid #282828",
          display: "flex",
          "align-items": "center",
          "justify-content": "space-between",
          padding: "0 16px",
        }}
      >
        <img
          src="/assets/brand/logo.svg"
          alt="Aftertone Logo"
          style={{ height: "20px" }}
        />
        <div style={{ display: "flex", gap: "12px", "align-items": "center" }}>
          <span
            style={{
              "font-size": "10px",
              color: isWasmReady() ? "#4ade80" : "#f87171",
              "text-transform": "uppercase",
              "letter-spacing": "1px",
            }}
          >
            {isWasmReady() ? "Core Online" : "Booting..."}
          </span>
          <button
            onClick={() => triggerExport()}
            style={{
              background: "#333",
              color: "#e0e0e0",
              border: "1px solid #444",
              padding: "4px 14px",
              "border-radius": "4px",
              cursor: "pointer",
              "font-size": "11px",
              "font-weight": "600",
            }}
          >
            Export
          </button>
        </div>
      </header>

      <div
        style={{
          display: "flex",
          flex: 1,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <main style={{ flex: 1, background: "#111" }}>
          <Viewport
            lightState={lightState}
            curves={curves()}
            onHistogramUpdate={setHistogramData}
            getExportFn={(fn) => (triggerExport = fn)}
          />
        </main>

        <aside
          style={{
            width: "310px",
            background: "#1a1a1a",
            "border-left": "1px solid #282828",
            display: "flex",
            "flex-direction": "column",
          }}
        >
          <div
            style={{
              height: "140px",
              background: "#151515",
              "border-bottom": "1px solid #282828",
            }}
          >
            <Histogram data={histogramData()} />
          </div>
          <div style={{ padding: "12px 16px", flex: 1, "overflow-y": "auto" }}>
            <div
              style={{
                display: "flex",
                "align-items": "center",
                "justify-content": "space-between",
                "margin-bottom": lightExpanded() ? "14px" : "0",
                cursor: "pointer",
              }}
              onClick={() => setLightExpanded(!lightExpanded())}
            >
              <div
                style={{ display: "flex", "align-items": "center", gap: "6px" }}
              >
                <Sun size={15} color="#e0e0e0" />
                <span
                  style={{
                    "font-weight": "700",
                    "font-size": "11px",
                    color: "#e0e0e0",
                    "text-transform": "uppercase",
                  }}
                >
                  Light
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLightGroup();
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: lightState.enabled ? "#aaa" : "#555",
                    cursor: "pointer",
                  }}
                >
                  {lightState.enabled ? (
                    <Eye size={13} />
                  ) : (
                    <EyeClosed size={13} />
                  )}
                </button>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  resetLightParams();
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#777",
                  cursor: "pointer",
                }}
              >
                <RotateCcw size={13} />
              </button>
            </div>
            {lightExpanded() && (
              <div
                style={{
                  display: "flex",
                  "flex-direction": "column",
                  gap: "2px",
                }}
              >
                <Slider
                  label="Exposure"
                  value={lightState.exposure}
                  disabled={!lightState.enabled}
                  onChange={(v) => setLightState("exposure", v)}
                />
                <Slider
                  label="Contrast"
                  value={lightState.contrast}
                  disabled={!lightState.enabled}
                  onChange={(v) => setLightState("contrast", v)}
                />
                <Slider
                  label="Highlights"
                  value={lightState.highlights}
                  disabled={!lightState.enabled}
                  onChange={(v) => setLightState("highlights", v)}
                />
                <Slider
                  label="Shadows"
                  value={lightState.shadows}
                  disabled={!lightState.enabled}
                  onChange={(v) => setLightState("shadows", v)}
                />
                <Slider
                  label="Whites"
                  value={lightState.whites}
                  disabled={!lightState.enabled}
                  onChange={(v) => setLightState("whites", v)}
                />
                <Slider
                  label="Blacks"
                  value={lightState.blacks}
                  disabled={!lightState.enabled}
                  onChange={(v) => setLightState("blacks", v)}
                />
                <div
                  style={{
                    "font-weight": "600",
                    "font-size": "10px",
                    color: "#777",
                    "text-transform": "uppercase",
                    margin: "14px 0 8px 0",
                  }}
                >
                  Presence
                </div>
                <Slider
                  label="Texture"
                  value={lightState.texture}
                  disabled={!lightState.enabled}
                  onChange={(v) => setLightState("texture", v)}
                />
                <Slider
                  label="Clarity"
                  value={lightState.clarity}
                  disabled={!lightState.enabled}
                  onChange={(v) => setLightState("clarity", v)}
                />
                <Slider
                  label="Dehaze"
                  value={lightState.dehaze}
                  disabled={!lightState.enabled}
                  onChange={(v) => setLightState("dehaze", v)}
                />
                <div
                  style={{
                    height: "1px",
                    background: "#282828",
                    margin: "12px 0",
                  }}
                ></div>
                <Slider
                  label="Temperature"
                  value={lightState.temp}
                  disabled={!lightState.enabled}
                  onChange={(v) => setLightState("temp", v)}
                />
                <Slider
                  label="Tint"
                  value={lightState.tint}
                  disabled={!lightState.enabled}
                  onChange={(v) => setLightState("tint", v)}
                />
                <Slider
                  label="Vibrance"
                  value={lightState.vibrance}
                  disabled={!lightState.enabled}
                  onChange={(v) => setLightState("vibrance", v)}
                />
                <Slider
                  label="Saturation"
                  value={lightState.saturation}
                  disabled={!lightState.enabled}
                  onChange={(v) => setLightState("saturation", v)}
                />
              </div>
            )}
            <div
              style={{ height: "1px", background: "#282828", margin: "16px 0" }}
            ></div>
            <div
              style={{
                display: "flex",
                "align-items": "center",
                "justify-content": "space-between",
                "margin-bottom": curveExpanded() ? "14px" : "0",
                cursor: "pointer",
              }}
              onClick={() => setCurveExpanded(!curveExpanded())}
            >
              <div
                style={{ display: "flex", "align-items": "center", gap: "6px" }}
              >
                <ChartSpline size={15} color="#e0e0e0" />
                <span
                  style={{
                    "font-weight": "700",
                    "font-size": "11px",
                    color: "#e0e0e0",
                    "text-transform": "uppercase",
                  }}
                >
                  Tone Curve
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setCurves(defaultCurves());
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#777",
                  cursor: "pointer",
                }}
              >
                <RotateCcw size={13} />
              </button>
            </div>
            {curveExpanded() && (
              <ToneCurve
                curves={curves()}
                setCurves={setCurves}
                disabled={!lightState.enabled}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
export default App;
