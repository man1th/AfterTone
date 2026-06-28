import { Component, Show } from "solid-js";
import { Crop as CropIcon, Check, Lock, LockOpen, ChevronDown } from "lucide-solid";
import { DropdownMenu } from "@kobalte/core";

interface CropPanelProps {
  state: any;
  update: (field: string, val: any) => void;
}

export const CropPanel: Component<CropPanelProps> = (props) => {
  const ASPECT_RATIOS = {
    landscape: ["Custom", "1x1", "2x1", "3x2", "4x3", "5x4", "7x5", "11x8.5", "16x9", "16x10"],
    portrait: ["Custom", "1x1", "1x2", "2x3", "3x4", "4x5", "5x7", "8.5x11", "9x16", "10x16"],
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
          padding: 6px 10px;
          border-radius: 4px;
          outline: none;
          flex: 1;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: background 0.15s;
        }
        .crop-select:hover { background: #222; }
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
          padding: 6px 10px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.15s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .crop-btn:hover { background: #2a2a2a; color: #fff; }
        .crop-btn.active { background: #e0e0e0; color: #111; border-color: #fff; }
      `}</style>

      {/* TOP ROW: Aspect Ratio Dropdown + Lock + Tool Toggle */}
      <div style={{ display: "flex", "align-items": "center", gap: "8px", "margin-bottom": "12px" }}>
        <span style={{ "font-size": "10px", color: "#aaa", width: "70px" }}>Aspect</span>
        
        <DropdownMenu.Root>
          <DropdownMenu.Trigger class="crop-select">
            <span style={{ "text-transform": "capitalize", "font-weight": "500" }}>{props.state.crop_aspect}</span>
            <ChevronDown size={14} color="#666" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content style={{ background: "#1c1c1c", border: "1px solid #333", "border-radius": "6px", color: "#eee", "font-size": "11px", padding: "4px", "z-index": 9999, "box-shadow": "0 8px 24px rgba(0,0,0,0.8)", "min-width": "140px", "max-height": "300px", "overflow-y": "auto" }}>
              {ASPECT_RATIOS[props.state.crop_orientation as "landscape" | "portrait"].map((ratio) => (
                <DropdownMenu.Item
                  onSelect={() => props.update("crop_aspect", ratio.toLowerCase())}
                  style={{ padding: "8px 12px", cursor: "pointer", "border-radius": "4px", transition: "background 0.1s", outline: "none" }}
                  onMouseEnter={(e: any) => e.currentTarget.style.background = "#2a2a2a"}
                  onMouseLeave={(e: any) => e.currentTarget.style.background = "transparent"}
                >
                  {ratio}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <Show when={props.state.crop_aspect === "custom"}>
          <button 
            class={`crop-btn ${props.state.crop_locked ? 'active' : ''}`} 
            onClick={() => props.update("crop_locked", !props.state.crop_locked)}
            title={props.state.crop_locked ? "Unlock Aspect Ratio" : "Lock Aspect Ratio"}
            style={{ padding: "6px" }}
          >
            <Show when={props.state.crop_locked} fallback={<LockOpen size={14} />}>
              <Lock size={14} />
            </Show>
          </button>
        </Show>

        <button 
          class={`crop-btn ${props.state.is_cropping ? 'active' : ''}`} 
          onClick={toggleCropping}
          title={props.state.is_cropping ? "Confirm Crop (Enter)" : "Activate Crop Tool"}
          style={{ padding: "6px" }}
        >
          <Show when={props.state.is_cropping} fallback={<CropIcon size={14} />}>
            <Check size={14} strokeWidth={3} />
          </Show>
        </button>
      </div>

      {/* SECOND ROW: Orientation Toggle */}
      <div style={{ display: "flex", "align-items": "center", gap: "8px", "margin-bottom": "16px" }}>
        <span style={{ "font-size": "10px", color: "#aaa", width: "70px" }}>Orientation</span>
        <div style={{ display: "flex", gap: "6px", flex: 1 }}>
          <button 
            onClick={() => props.update("crop_orientation", "landscape")}
            style={{ flex: 1, background: props.state.crop_orientation === "landscape" ? "#333" : "transparent", border: "1px solid #333", color: props.state.crop_orientation === "landscape" ? "#fff" : "#888", "font-size": "10px", padding: "6px", "border-radius": "4px", cursor: "pointer", transition: "all 0.15s" }}
          >
            Landscape
          </button>
          <button 
            onClick={() => props.update("crop_orientation", "portrait")}
            style={{ flex: 1, background: props.state.crop_orientation === "portrait" ? "#333" : "transparent", border: "1px solid #333", color: props.state.crop_orientation === "portrait" ? "#fff" : "#888", "font-size": "10px", padding: "6px", "border-radius": "4px", cursor: "pointer", transition: "all 0.15s" }}
          >
            Portrait
          </button>
        </div>
      </div>

      <div style={{ height: "1px", background: "#282828", "margin-bottom": "12px" }}></div>

      {/* THIRD ROW: Custom Resolution/Size Inputs */}
      <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
        <span style={{ "font-size": "10px", color: "#aaa", width: "70px" }}>Size</span>
        <input 
          type="number" 
          class="crop-input" 
          value={Math.round(props.state.crop_w_px)} 
          onInput={(e) => {
            props.update("crop_w_px", parseInt(e.currentTarget.value) || 0);
            props.update("crop_aspect", "custom");
          }} 
        />
        <span style={{ "font-size": "10px", color: "#666" }}>x</span>
        <input 
          type="number" 
          class="crop-input" 
          value={Math.round(props.state.crop_h_px)} 
          onInput={(e) => {
            props.update("crop_h_px", parseInt(e.currentTarget.value) || 0);
            props.update("crop_aspect", "custom");
          }} 
        />
        <span style={{ "font-size": "10px", color: "#666" }}>px</span>
      </div>
    </div>
  );
};
