import { Component, createSignal, createEffect } from "solid-js";

interface SliderProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  trackBg?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export const Slider: Component<SliderProps> = (props) => {
  const min = () => props.min ?? -100;
  const max = () => props.max ?? 100;
  const [inputValue, setInputValue] = createSignal(props.value.toString());

  createEffect(() => {
    setInputValue(props.value > 0 ? `+${props.value}` : props.value.toString());
  });

  const commitInput = () => {
    let val = parseFloat(inputValue());
    if (isNaN(val)) val = props.value;
    val = Math.max(min(), Math.min(max(), val));
    props.onChange(val);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") commitInput();
  };

  return (
    <div
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
      style={{
        display: "flex",
        "align-items": "center",
        gap: "8px",
        "margin-bottom": "6px",
        opacity: props.disabled ? 0.4 : 1,
      }}
    >
      <style>{`
        input[type=range].colored-track {
          -webkit-appearance: none;
          appearance: none;
        }
        input[type=range].colored-track::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #ccc;
          cursor: pointer;
        }
        input[type=range].colored-track::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #ccc;
          cursor: pointer;
          border: none;
        }
      `}</style>
      <div
        style={{
          width: "75px",
          "font-size": "10px",
          color: "#b0b0b0",
          cursor: props.disabled ? "default" : "pointer",
          "user-select": "none",
          "text-transform": "capitalize",
        }}
        onDblClick={() => !props.disabled && props.onChange(0)}
        title="Double-click to reset"
      >
        {props.label}
      </div>
      <input
        type="range"
        class={props.trackBg ? "colored-track" : ""}
        min={min()}
        max={max()}
        value={props.value}
        disabled={props.disabled}
        onInput={(e) => props.onChange(parseFloat(e.currentTarget.value))}
        style={{
          flex: 1,
          "accent-color": "#777",
          height: "2px",
          cursor: props.disabled ? "default" : "pointer",
          background: props.trackBg || "#333",
          outline: "none",
          "border-radius": "1px",
        }}
      />
      <input
        type="text"
        value={inputValue()}
        disabled={props.disabled}
        onInput={(e) => setInputValue(e.currentTarget.value)}
        onBlur={commitInput}
        onKeyDown={handleKeyDown}
        style={{
          width: "32px",
          background: "#3a3a3a",
          border: "1px solid #222",
          color: "#e0e0e0",
          "font-size": "10px",
          "text-align": "center",
          "border-radius": "3px",
          padding: "3px 0",
          outline: "none",
        }}
      />
    </div>
  );
};
