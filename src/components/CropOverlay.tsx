import { Component, Show, createSignal, onCleanup, createEffect, untrack } from "solid-js";

interface CropOverlayProps {
  isActive: boolean;
  onConfirm: () => void;
  cropRect: { x: number; y: number; w: number; h: number };
  setCropRect: (r: { x: number; y: number; w: number; h: number }) => void;
  aspectRatio: string;
  orientation: "landscape" | "portrait";
  cropLocked: boolean;
  setOrientation: (o: "landscape" | "portrait") => void;
}

export const CropOverlay: Component<CropOverlayProps> = (props) => {
  let containerRef!: HTMLDivElement;
  let dragState: any = null;
  const [isDragging, setIsDragging] = createSignal(false);

  // Instantly updates the box shape visually when the dropdown changes
  createEffect((prevDeps) => {
    const currentDeps = `${props.aspectRatio}-${props.orientation}`;
    if (prevDeps === currentDeps) return currentDeps;

    untrack(() => {
      if (props.aspectRatio !== "custom" && containerRef) {
        const parts = props.aspectRatio.split("x").map(Number);
        if (parts.length === 2) {
          const rect = containerRef.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            // FIX: Removed the buggy ternary inversion. The dropdown strings are already correct!
            const targetRatio = parts[0] / parts[1];
            let { x, y, w, h } = props.cropRect;
            let newH = (w * rect.width) / targetRatio / rect.height;
            let newW = w;
            
            if (newH > 1 || y + newH > 1) {
              newH = Math.min(1, 1 - y);
              newW = (newH * rect.height * targetRatio) / rect.width;
            }
            if (newW > 1 || x + newW > 1) {
              newW = Math.min(1, 1 - x);
              newH = (newW * rect.width) / targetRatio / rect.height;
            }
            props.setCropRect({ x, y, w: newW, h: newH });
          }
        }
      }
    });
    return currentDeps;
  }, `${props.aspectRatio}-${props.orientation}`);

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

    const isLocked = props.cropLocked && props.aspectRatio === "custom";

    if (type === "body") {
      newX = Math.max(0, Math.min(1 - newW, initCrop.x + dx));
      newY = Math.max(0, Math.min(1 - newH, initCrop.y + dy));
    } 
    else {
      if (type.includes("w")) { newX = Math.max(0, Math.min(initCrop.x + initCrop.w - 0.05, initCrop.x + dx)); newW = initCrop.w + (initCrop.x - newX); }
      if (type.includes("e")) { newW = Math.max(0.05, Math.min(1 - initCrop.x, initCrop.w + dx)); }
      if (type.includes("n")) { newY = Math.max(0, Math.min(initCrop.y + initCrop.h - 0.05, initCrop.y + dy)); newH = initCrop.h + (initCrop.y - newY); }
      if (type.includes("s")) { newH = Math.max(0.05, Math.min(1 - initCrop.y, initCrop.h + dy)); }

      if (props.aspectRatio !== "custom" || isLocked) {
        let ratio = 1;
        if (isLocked) {
          ratio = (initCrop.w * containerW) / (initCrop.h * containerH);
        } else {
          const parts = props.aspectRatio.split("x").map(Number);
          if (parts.length === 2) {
            // FIX: Removed the buggy ternary inversion here as well
            ratio = parts[0] / parts[1];
          }
        }

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

  const handleStyle = { position: "absolute", width: "40px", height: "40px", background: "transparent", "z-index": 10 };
  const cornerMarkStyle = { position: "absolute", background: "#fff", "pointer-events": "none", "box-shadow": "0 0 6px rgba(0,0,0,0.8)" };
  const gridLine = { "border-right": "3px solid rgba(255,255,255,0.6)", "border-bottom": "3px solid rgba(255,255,255,0.6)" };

  return (
    <Show when={props.isActive}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0, "z-index": 100, "pointer-events": "auto" }}>
        
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", "clip-path": `polygon(0% 0%, 0% 100%, 100% 100%, 100% 0%, 0% 0%, ${props.cropRect.x * 100}% ${props.cropRect.y * 100}%, ${(props.cropRect.x + props.cropRect.w) * 100}% ${props.cropRect.y * 100}%, ${(props.cropRect.x + props.cropRect.w) * 100}% ${(props.cropRect.y + props.cropRect.h) * 100}%, ${props.cropRect.x * 100}% ${(props.cropRect.y + props.cropRect.h) * 100}%, ${props.cropRect.x * 100}% ${props.cropRect.y * 100}%)`, transition: isDragging() ? "none" : "clip-path 0.15s cubic-bezier(0.2, 0, 0, 1)" }} />

        <div
          onPointerDown={(e) => handlePointerDown(e, "body")}
          style={{ position: "absolute", left: `${props.cropRect.x * 100}%`, top: `${props.cropRect.y * 100}%`, width: `${props.cropRect.w * 100}%`, height: `${props.cropRect.h * 100}%`, border: "3px solid rgba(255,255,255,0.95)", "box-shadow": "0 0 10px rgba(0,0,0,0.6), inset 0 0 10px rgba(0,0,0,0.6)", cursor: "move", display: "grid", "grid-template-columns": "1fr 1fr 1fr", "grid-template-rows": "1fr 1fr 1fr", transition: isDragging() ? "none" : "all 0.15s cubic-bezier(0.2, 0, 0, 1)" }}
        >
          <div style={{ ...gridLine as any, opacity: isDragging() ? 1 : 0, transition: "opacity 0.2s" }}></div>
          <div style={{ ...gridLine as any, opacity: isDragging() ? 1 : 0, transition: "opacity 0.2s" }}></div>
          <div style={{ "border-bottom": "3px solid rgba(255,255,255,0.6)", opacity: isDragging() ? 1 : 0, transition: "opacity 0.2s" }}></div>
          <div style={{ ...gridLine as any, opacity: isDragging() ? 1 : 0, transition: "opacity 0.2s" }}></div>
          <div style={{ ...gridLine as any, opacity: isDragging() ? 1 : 0, transition: "opacity 0.2s" }}></div>
          <div style={{ "border-bottom": "3px solid rgba(255,255,255,0.6)", opacity: isDragging() ? 1 : 0, transition: "opacity 0.2s" }}></div>
          <div style={{ "border-right": "3px solid rgba(255,255,255,0.6)", opacity: isDragging() ? 1 : 0, transition: "opacity 0.2s" }}></div>
          <div style={{ "border-right": "3px solid rgba(255,255,255,0.6)", opacity: isDragging() ? 1 : 0, transition: "opacity 0.2s" }}></div>
          <div></div>

          <div onPointerDown={(e) => handlePointerDown(e, "nw")} style={{ ...handleStyle as any, top: "-20px", left: "-20px", cursor: "nwse-resize" }}>
            <div style={{ ...cornerMarkStyle as any, top: "17px", left: "17px", width: "32px", height: "6px" }}></div><div style={{ ...cornerMarkStyle as any, top: "17px", left: "17px", width: "6px", height: "32px" }}></div>
          </div>
          <div onPointerDown={(e) => handlePointerDown(e, "n")} style={{ ...handleStyle as any, top: "-20px", left: "50%", transform: "translateX(-50%)", width: "60%", cursor: "ns-resize" }}>
             <div style={{ ...cornerMarkStyle as any, top: "17px", left: "50%", transform: "translateX(-50%)", width: "40px", height: "6px" }}></div>
          </div>
          <div onPointerDown={(e) => handlePointerDown(e, "ne")} style={{ ...handleStyle as any, top: "-20px", right: "-20px", cursor: "nesw-resize" }}>
            <div style={{ ...cornerMarkStyle as any, top: "17px", right: "17px", width: "32px", height: "6px" }}></div><div style={{ ...cornerMarkStyle as any, top: "17px", right: "17px", width: "6px", height: "32px" }}></div>
          </div>
          <div onPointerDown={(e) => handlePointerDown(e, "e")} style={{ ...handleStyle as any, top: "50%", right: "-20px", transform: "translateY(-50%)", height: "60%", cursor: "ew-resize" }}>
            <div style={{ ...cornerMarkStyle as any, right: "17px", top: "50%", transform: "translateY(-50%)", width: "6px", height: "40px" }}></div>
          </div>
          <div onPointerDown={(e) => handlePointerDown(e, "se")} style={{ ...handleStyle as any, bottom: "-20px", right: "-20px", cursor: "nwse-resize" }}>
            <div style={{ ...cornerMarkStyle as any, bottom: "17px", right: "17px", width: "32px", height: "6px" }}></div><div style={{ ...cornerMarkStyle as any, bottom: "17px", right: "17px", width: "6px", height: "32px" }}></div>
          </div>
          <div onPointerDown={(e) => handlePointerDown(e, "s")} style={{ ...handleStyle as any, bottom: "-20px", left: "50%", transform: "translateX(-50%)", width: "60%", cursor: "ns-resize" }}>
             <div style={{ ...cornerMarkStyle as any, bottom: "17px", left: "50%", transform: "translateX(-50%)", width: "40px", height: "6px" }}></div>
          </div>
          <div onPointerDown={(e) => handlePointerDown(e, "sw")} style={{ ...handleStyle as any, bottom: "-20px", left: "-20px", cursor: "nesw-resize" }}>
            <div style={{ ...cornerMarkStyle as any, bottom: "17px", left: "17px", width: "32px", height: "6px" }}></div><div style={{ ...cornerMarkStyle as any, bottom: "17px", left: "17px", width: "6px", height: "32px" }}></div>
          </div>
          <div onPointerDown={(e) => handlePointerDown(e, "w")} style={{ ...handleStyle as any, top: "50%", left: "-20px", transform: "translateY(-50%)", height: "60%", cursor: "ew-resize" }}>
            <div style={{ ...cornerMarkStyle as any, left: "17px", top: "50%", transform: "translateY(-50%)", width: "6px", height: "40px" }}></div>
          </div>
        </div>
      </div>
    </Show>
  );
};
