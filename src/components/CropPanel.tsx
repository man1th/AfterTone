import { Component, Show } from "solid-js";
import { Crop as CropIcon, Check } from "lucide-solid";

interface CropPanelProps {
  state: any;
  update: (field: string, val: any) => void;
}

export const CropPanel: Component<CropPanelProps> = (props) => {
  const ASPECT_RATIOS = {
    landscape: ["Free", "Original", "1x1", "2x1", "3x2", "4x3", "5x4", "7x5", "11x8.5", "16x9", "16x10"],
    portrait: ["Free", "Original", "1x1", "1x2", "2x3", "3x4", "4x5", "5x7", "8.5x11", "9x16", "10x16"],
  };

  const handleRatioChange = (e: Event) => {
    const val = (e.target as HTMLSelectElement).value;
    props.update("crop_aspect", val);
  };

  const toggleCropping = () => {
    props.update("is_cropping", !props.state.is_cropping);
  };

  return (
    <div style={{ padding: "12px 14px" }}>
      <style>{`
        .crop-select {
          background: #1c1c1c;
          border: 1px solid #333;
          color: #eee;
          font-size: 11px;
          padding: 4px 8px;
          border-radius: 4px;
          outline: none;
          flex: 1;
          cursor: pointer;
        }
        .crop-input {
          width: 45px;
          background: #1c1c1c;
          border: 1px solid #333;
          color: #eee;
          font-size: 11px;
          text-align: center;
          padding: 4px;
          border-radius: 4px;
          outline: none;
          font-family: monospace;
        }
        .crop-btn {
          background: #1c1c1c;
          border: 1px solid #333;
          color: #aaa;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .crop-btn:hover { background: #2a2a2a; color: #fff; }
        .crop-btn.active { background: #e0e0e0; color: #111; border-color: #fff; }
      `}</style>

      {/* TOP ROW: Aspect Ratio Dropdown + Tool Toggle */}
      <div style={{ display: "flex", "align-items": "center", gap: "10px", "margin-bottom": "12px" }}>
        <span style={{ "font-size": "10px", color: "#aaa", width: "75px" }}>Aspect</span>
        
        <select 
          class="crop-select" 
          value={props.state.crop_aspect} 
          onChange={handleRatioChange}
        >
          <For each={ASPECT_RATIOS[props.state.crop_orientation as "landscape" | "portrait"]}>
            {(ratio) => <option value={ratio.toLowerCase()}>{ratio}</option>}
          </For>
        </select>

        <button 
          class={`crop-btn ${props.state.is_cropping ? 'active' : ''}`} 
          onClick={toggleCropping}
          title={props.state.is_cropping ? "Confirm Crop (Enter)" : "Activate Crop Tool"}
        >
          <Show when={props.state.is_cropping} fallback={<CropIcon size={14} />}>
            <Check size={14} strokeWidth={3} />
          </Show>
        </button>
      </div>

      {/* SECOND ROW: Orientation Toggle */}
      <div style={{ display: "flex", "align-items": "center", gap: "10px", "margin-bottom": "16px" }}>
        <span style={{ "font-size": "10px", color: "#aaa", width: "75px" }}>Orientation</span>
        <div style={{ display: "flex", gap: "6px", flex: 1 }}>
          <button 
            onClick={() => props.update("crop_orientation", "landscape")}
            style={{ flex: 1, background: props.state.crop_orientation === "landscape" ? "#333" : "transparent", border: "1px solid #333", color: props.state.crop_orientation === "landscape" ? "#fff" : "#888", "font-size": "10px", padding: "4px", "border-radius": "4px", cursor: "pointer" }}
          >
            Landscape
          </button>
          <button 
            onClick={() => props.update("crop_orientation", "portrait")}
            style={{ flex: 1, background: props.state.crop_orientation === "portrait" ? "#333" : "transparent", border: "1px solid #333", color: props.state.crop_orientation === "portrait" ? "#fff" : "#888", "font-size": "10px", padding: "4px", "border-radius": "4px", cursor: "pointer" }}
          >
            Portrait
          </button>
        </div>
      </div>

      <div style={{ height: "1px", background: "#282828", "margin-bottom": "12px" }}></div>

      {/* THIRD ROW: Custom Resolution/Size Inputs */}
      <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
        <span style={{ "font-size": "10px", color: "#aaa", width: "75px" }}>Custom Size</span>
        <input 
          type="number" 
          class="crop-input" 
          value={Math.round(props.state.crop_w_px)} 
          onInput={(e) => {
            props.update("crop_w_px", parseInt(e.currentTarget.value) || 0);
            props.update("crop_aspect", "free");
          }} 
        />
        <span style={{ "font-size": "10px", color: "#666" }}>x</span>
        <input 
          type="number" 
          class="crop-input" 
          value={Math.round(props.state.crop_h_px)} 
          onInput={(e) => {
            props.update("crop_h_px", parseInt(e.currentTarget.value) || 0);
            props.update("crop_aspect", "free");
          }} 
        />
        <span style={{ "font-size": "10px", color: "#666" }}>px</span>
      </div>
    </div>
  );
};
