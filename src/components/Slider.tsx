import { Component } from 'solid-js';

interface SliderProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange: (val: number) => void;
}

export const Slider: Component<SliderProps> = (props) => {
  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', margin: '12px 0' }}>
      <div style={{ display: 'flex', 'justify-content': 'space-between', 'margin-bottom': '6px' }}>
        <span style={{ color: props.disabled ? '#444' : '#aaa', 'font-size': '12px', 'letter-spacing': '0.3px' }}>
          {props.label}
        </span>
        <span style={{ color: props.disabled ? '#444' : '#eee', 'font-size': '12px', 'font-variant-numeric': 'tabular-nums' }}>
          {props.value > 0 ? `+${props.value}` : props.value}
        </span>
      </div>
      <input 
        type="range" 
        min={props.min ?? -100} 
        max={props.max ?? 100} 
        value={props.value}
        disabled={props.disabled}
        onInput={(e) => props.onChange(parseFloat(e.currentTarget.value))}
        style={{
          width: '100%',
          cursor: props.disabled ? 'not-allowed' : 'pointer',
          filter: props.disabled ? 'grayscale(100%) opacity(0.3)' : 'none'
        }}
      />
    </div>
  );
};
