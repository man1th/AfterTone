import { Component, Show } from "solid-js";
import { Crop as CropIcon, Check, Lock, LockOpen, ChevronDown, RectangleVertical, RectangleHorizontal } from "lucide-solid";
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
          transition: all 0.15s;
        }
        .crop-select:hover:not(:disabled) { background: #222; }
        .crop-select:disabled { opacity: 0.4; cursor: not-allowed; }
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
        .crop-btn:hover:not(:disabled) { background: #2a2a2a; color: #fff; }
        .crop-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .crop-btn.active { background: #e0e0e0; color: #111; border-color: #fff; }
        .icon-radio {
          background: transparent;
          border: 1px solid transparent;
          color: #666;
          padding: 4px 6px;
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }
        .icon-radio:hover { color: #aaa; }
        .icon-radio.selected { color: #fff; background: #222; border-color: #444; }
      `}</style>

      {/* Control Row: Orientation Radios -> Aspect Dropdown -> Lock -> Tool Toggle */}
      <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
        
        {/* Orientation Radio Buttons */}
        <div style={{ display: "flex", gap: "2px", background: "#111", padding: "2px", "border-radius": "6px", border: "1px solid #222" }}>
           <button 
             class={`icon-radio ${props.state.crop_orientation === 'portrait' ? 'selected' : ''}`}
             onClick={() => props.update("crop_orientation", "portrait")}
             title="Portrait Orientation"
           >
             <RectangleVertical size={16} />
           </button>
           <button 
             class={`icon-radio ${props.state.crop_orientation === 'landscape' ? 'selected' : ''}`}
             onClick={() => props.update("crop_orientation", "landscape")}
             title="Landscape Orientation"
           >
             <RectangleHorizontal size={16} />
           </button>
        </div>
        
        {/* FIX: Label widened to "Aspect Ratio" */}
        <span style={{ "font-size": "10px", color: "#aaa", width: "80px", "text-align": "right", "margin-right": "4px" }}>Aspect Ratio</span>

        {/* Aspect Ratio Dropdown */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger class="crop-select" disabled={!props.state.is_cropping} title={!props.state.is_cropping ? "Activate Crop Tool to change Aspect Ratio" : "Aspect Ratio"}>
            <span style={{ "text-transform": "capitalize", "font-weight": "500" }}>{props.state.crop_aspect}</span>
            <ChevronDown size={14} color="#666" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content style={{ background: "#1c1c1c", border: "1px solid #333", "border-radius": "6px", color: "#eee", "font-size": "11px", padding: "4px", "z-index": 9999, "box-shadow": "0 8px 24px rgba(0,0,0,0.8)", "min-width": "120px", "max-height": "300px", "overflow-y": "auto" }}>
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

        {/* Lock Button (Only visible if Custom is selected) */}
        <Show when={props.state.crop_aspect === "custom"}>
          <button 
            class={`crop-btn ${props.state.crop_locked ? 'active' : ''}`} 
            onClick={() => props.update("crop_locked", !props.state.crop_locked)}
            title={props.state.crop_locked ? "Unlock Aspect Ratio" : "Lock Aspect Ratio"}
            style={{ padding: "6px" }}
            disabled={!props.state.is_cropping}
          >
            <Show when={props.state.crop_locked} fallback={<LockOpen size={14} />}>
              <Lock size={14} />
            </Show>
          </button>
        </Show>

        {/* Crop Mode Toggle Button */}
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

    </div>
  );
};
