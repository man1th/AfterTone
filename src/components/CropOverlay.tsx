import { Component, Show, createSignal, onCleanup } from "solid-js";

interface CropOverlayProps {
  isActive: boolean;
  onConfirm: () => void;
  cropRect: { x: number; y: number; w: number; h: number };
  setCropRect: (r: { x: number; y: number; w: number; h: number }) => void;
  aspectRatio: string;
  orientation: "landscape" | "portrait";
  setOrientation: (o: "landscape" | "portrait") => void;
}

export const CropOverlay: Component<CropOverlayProps> = (props) => {
  let containerRef!: HTMLDivElement;
  let dragState: any = null;
  const [isDragging, setIsDragging] = createSignal(false);

  const handlePointerDown = (e: PointerEvent, type: string) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = containerRef.getBoundingClientRect();
    dragState = {
      type,
      startX: e.clientX,
      startY: e.clientY,
      initCrop: { ...props.cropRect },
      containerW: rect.width,
      containerH: rect.height,
    };
    setIsDragging(true);
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!dragState) return;
    const { type, startX, startY, initCrop, containerW, containerH } = dragState;
    const dx = (e.clientX - startX) / containerW;
    const dy = (e.clientY - startY) / containerH;

    let newX = initCrop.x;
    let newY = initCrop.y;
    let newW = initCrop.w;
    let newH = initCrop.h;

    // 1. Handle Translation (Moving the whole box)
    if (type === "body") {
      newX = Math.max(0, Math.min(1 - newW, initCrop.x + dx));
      newY = Math.max(0, Math.min(1 - newH, initCrop.y + dy));
    } 
    // 2. Handle Edge/Corner Scaling
    else {
      if (type.includes("w")) { newX = Math.max(0, Math.min(initCrop.x + initCrop.w - 0.05, initCrop.x + dx)); newW = initCrop.w + (initCrop.x - newX); }
      if (type.includes("e")) { newW = Math.max(0.05, Math.min(1 - initCrop.x, initCrop.w + dx)); }
      if (type.includes("n")) { newY = Math.max(0, Math.min(initCrop.y + initCrop.h - 0.05, initCrop.y + dy)); newH = initCrop.h + (initCrop.y - newY); }
      if (type.includes("s")) { newH = Math.max(0.05, Math.min(1 - initCrop.y, initCrop.h + dy)); }

      // 3. Apply Aspect Ratio Constraints
      if (props.aspectRatio !== "free" && props.aspectRatio !== "original") {
        let ratio = 1;
        const parts = props.aspectRatio.split("x").map(Number);
        if (parts.length === 2) {
          ratio = props.orientation === "landscape" ? parts[0] / parts[1] : parts[1] / parts[0];
        }

        const currentRatio = (newW * containerW) / (newH * containerH);
        
        // Auto-flip orientation if pulled aggressively
        if (props.orientation === "landscape" && currentRatio < 0.8) {
             props.setOrientation("portrait");
             ratio = parts[1] / parts[0];
        } else if (props.orientation === "portrait" && currentRatio > 1.25) {
             props.setOrientation("landscape");
             ratio = parts[0] / parts[1];
        }

        // Lock geometry based on which handle is pulled
        if (type.includes("e") || type.includes("w")) {
          newH = (newW * containerW) / ratio / containerH;
          if (newY + newH > 1) { newH = 1 - newY; newW = (newH * containerH * ratio) / containerW; }
        } else if (type.includes("s") || type.includes("n")) {
          newW = (newH * containerH * ratio) / containerW;
          if (newX + newW > 1) { newW = 1 - newX; newH = (newW * containerW) / ratio / containerH; }
        }
      }
    }

    props.setCropRect({ x: newX, y: newY, w: newW, h: newH });
  };

  const handlePointerUp = () => {
    dragState = null;
    setIsDragging(false);
    document.removeEventListener("pointermove", handlePointerMove);
    document.removeEventListener("pointerup", handlePointerUp);
  };

  onCleanup(() => {
    document.removeEventListener("pointermove", handlePointerMove);
    document.removeEventListener("pointerup", handlePointerUp);
  });

  const handleStyle = { position: "absolute", width: "16px", height: "16px", background: "transparent", "z-index": 10 };
  const cornerMarkStyle = { position: "absolute", background: "#fff", "pointer-events": "none" };

  return (
    <Show when={props.isActive}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0, "z-index": 100, "pointer-events": "auto" }}>
        
        {/* The Dark Overlay with a Hole Cut Out */}
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", "clip-path": `polygon(0% 0%, 0% 100%, 100% 100%, 100% 0%, 0% 0%, ${props.cropRect.x * 100}% ${props.cropRect.y * 100}%, ${(props.cropRect.x + props.cropRect.w) * 100}% ${props.cropRect.y * 100}%, ${(props.cropRect.x + props.cropRect.w) * 100}% ${(props.cropRect.y + props.cropRect.h) * 100}%, ${props.cropRect.x * 100}% ${(props.cropRect.y + props.cropRect.h) * 100}%, ${props.cropRect.x * 100}% ${props.cropRect.y * 100}%)`, transition: isDragging() ? "none" : "clip-path 0.1s ease-out" }} />

        {/* The Active Crop Box */}
        <div
          onPointerDown={(e) => handlePointerDown(e, "body")}
          style={{ position: "absolute", left: `${props.cropRect.x * 100}%`, top: `${props.cropRect.y * 100}%`, width: `${props.cropRect.w * 100}%`, height: `${props.cropRect.h * 100}%`, border: "1px solid rgba(255,255,255,0.8)", cursor: "move", display: "grid", "grid-template-columns": "1fr 1fr 1fr", "grid-template-rows": "1fr 1fr 1fr", transition: isDragging() ? "none" : "all 0.1s ease-out" }}
        >
          {/* 3x3 Composition Grid (Only visible while dragging) */}
          <div style={{ "border-right": "1px solid rgba(255,255,255,0.3)", "border-bottom": "1px solid rgba(255,255,255,0.3)", opacity: isDragging() ? 1 : 0, transition: "opacity 0.2s" }}></div>
          <div style={{ "border-right": "1px solid rgba(255,255,255,0.3)", "border-bottom": "1px solid rgba(255,255,255,0.3)", opacity: isDragging() ? 1 : 0, transition: "opacity 0.2s" }}></div>
          <div style={{ "border-bottom": "1px solid rgba(255,255,255,0.3)", opacity: isDragging() ? 1 : 0, transition: "opacity 0.2s" }}></div>
          <div style={{ "border-right": "1px solid rgba(255,255,255,0.3)", "border-bottom": "1px solid rgba(255,255,255,0.3)", opacity: isDragging() ? 1 : 0, transition: "opacity 0.2s" }}></div>
          <div style={{ "border-right": "1px solid rgba(255,255,255,0.3)", "border-bottom": "1px solid rgba(255,255,255,0.3)", opacity: isDragging() ? 1 : 0, transition: "opacity 0.2s" }}></div>
          <div style={{ "border-bottom": "1px solid rgba(255,255,255,0.3)", opacity: isDragging() ? 1 : 0, transition: "opacity 0.2s" }}></div>
          <div style={{ "border-right": "1px solid rgba(255,255,255,0.3)", opacity: isDragging() ? 1 : 0, transition: "opacity 0.2s" }}></div>
          <div style={{ "border-right": "1px solid rgba(255,255,255,0.3)", opacity: isDragging() ? 1 : 0, transition: "opacity 0.2s" }}></div>
          <div></div>

          {/* Invisible Interaction Handles & Visual Corner Marks */}
          <div onPointerDown={(e) => handlePointerDown(e, "nw")} style={{ ...handleStyle as any, top: "-8px", left: "-8px", cursor: "nwse-resize" }}>
            <div style={{ ...cornerMarkStyle as any, top: "8px", left: "8px", width: "12px", height: "3px" }}></div><div style={{ ...cornerMarkStyle as any, top: "8px", left: "8px", width: "3px", height: "12px" }}></div>
          </div>
          <div onPointerDown={(e) => handlePointerDown(e, "n")} style={{ ...handleStyle as any, top: "-8px", left: "50%", transform: "translateX(-50%)", width: "50%", cursor: "ns-resize" }}>
             <div style={{ ...cornerMarkStyle as any, top: "8px", left: "50%", transform: "translateX(-50%)", width: "16px", height: "3px" }}></div>
          </div>
          <div onPointerDown={(e) => handlePointerDown(e, "ne")} style={{ ...handleStyle as any, top: "-8px", right: "-8px", cursor: "nesw-resize" }}>
            <div style={{ ...cornerMarkStyle as any, top: "8px", right: "8px", width: "12px", height: "3px" }}></div><div style={{ ...cornerMarkStyle as any, top: "8px", right: "8px", width: "3px", height: "12px" }}></div>
          </div>
          <div onPointerDown={(e) => handlePointerDown(e, "e")} style={{ ...handleStyle as any, top: "50%", right: "-8px", transform: "translateY(-50%)", height: "50%", cursor: "ew-resize" }}>
            <div style={{ ...cornerMarkStyle as any, right: "8px", top: "50%", transform: "translateY(-50%)", width: "3px", height: "16px" }}></div>
          </div>
          <div onPointerDown={(e) => handlePointerDown(e, "se")} style={{ ...handleStyle as any, bottom: "-8px", right: "-8px", cursor: "nwse-resize" }}>
            <div style={{ ...cornerMarkStyle as any, bottom: "8px", right: "8px", width: "12px", height: "3px" }}></div><div style={{ ...cornerMarkStyle as any, bottom: "8px", right: "8px", width: "3px", height: "12px" }}></div>
          </div>
          <div onPointerDown={(e) => handlePointerDown(e, "s")} style={{ ...handleStyle as any, bottom: "-8px", left: "50%", transform: "translateX(-50%)", width: "50%", cursor: "ns-resize" }}>
             <div style={{ ...cornerMarkStyle as any, bottom: "8px", left: "50%", transform: "translateX(-50%)", width: "16px", height: "3px" }}></div>
          </div>
          <div onPointerDown={(e) => handlePointerDown(e, "sw")} style={{ ...handleStyle as any, bottom: "-8px", left: "-8px", cursor: "nesw-resize" }}>
            <div style={{ ...cornerMarkStyle as any, bottom: "8px", left: "8px", width: "12px", height: "3px" }}></div><div style={{ ...cornerMarkStyle as any, bottom: "8px", left: "8px", width: "3px", height: "12px" }}></div>
          </div>
          <div onPointerDown={(e) => handlePointerDown(e, "w")} style={{ ...handleStyle as any, top: "50%", left: "-8px", transform: "translateY(-50%)", height: "50%", cursor: "ew-resize" }}>
            <div style={{ ...cornerMarkStyle as any, left: "8px", top: "50%", transform: "translateY(-50%)", width: "3px", height: "16px" }}></div>
          </div>
        </div>
      </div>
    </Show>
  );
};
