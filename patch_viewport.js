const fs = require('fs');
let code = fs.readFileSync('src/components/Viewport.tsx', 'utf8');

// Replace the paramsArray generation with the new V2 struct size
code = code.replace(
  /const paramsArray = new Float32Array\(\[([\s\S]*?)\]\);/,
  `const paramsArray = new Float32Array([
      active ? p.exposure : 0, active ? p.contrast : 0,
      active ? p.highlights : 0, active ? p.shadows : 0,
      active ? p.whites : 0, active ? p.blacks : 0,
      active ? p.texture : 0, active ? p.clarity : 0, active ? p.dehaze : 0,
      active ? p.temp : 0, active ? p.tint : 0,
      active ? p.vibrance : 0, active ? p.saturation : 0,
      0, 0, 0 // Padding
    ]);`
);

// Update dependency array for reactivity
code = code.replace(
  /const deps = \[props\.lightState\.enabled[\s\S]*?\];/,
  `const deps = [props.lightState.enabled, props.lightState.exposure, props.lightState.contrast, props.lightState.highlights, props.lightState.shadows, props.lightState.whites, props.lightState.blacks, props.lightState.texture, props.lightState.clarity, props.lightState.dehaze, props.lightState.temp, props.lightState.tint, props.lightState.vibrance, props.lightState.saturation];`
);

fs.writeFileSync('src/components/Viewport.tsx', code);
