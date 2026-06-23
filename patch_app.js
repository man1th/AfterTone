const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Imports
code = code.replace(
  /import \{ Sun, Eye, EyeClosed, RotateCcw \} from 'lucide-solid';/,
  `import { Sun, Eye, EyeClosed, RotateCcw, ChartSpline } from 'lucide-solid';\nimport { ToneCurve, CurveState } from './components/ToneCurve';`
);

// State hook
code = code.replace(
  /const \[lightExpanded, setLightExpanded\] = createSignal\(true\);/,
  `const [lightExpanded, setLightExpanded] = createSignal(true);
  const [curveExpanded, setCurveExpanded] = createSignal(true);
  
  const defaultCurves = () => ({
    master: [{x:0,y:0}, {x:1,y:1}], red: [{x:0,y:0}, {x:1,y:1}],
    green: [{x:0,y:0}, {x:1,y:1}], blue: [{x:0,y:0}, {x:1,y:1}]
  });
  const [curves, setCurves] = createSignal<CurveState>(defaultCurves());`
);

// Viewport props
code = code.replace(/<Viewport lightState=\{lightState\}/, `<Viewport lightState={lightState} curves={curves()}`);

// UI Injection
const lightGroupEnd = `</aside>`;
const curveUI = `
            {/* --- TONE CURVE GROUP --- */}
            <div style={{ height: '1px', background: '#282828', margin: '8px 0 16px 0' }}></div>
            
            <div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', 'margin-bottom': curveExpanded() ? '14px' : '0', cursor: 'pointer', 'user-select': 'none' }} onClick={() => setCurveExpanded(!curveExpanded())}>
              <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                <ChartSpline size={16} color="#e0e0e0" style={{ 'margin-right': '2px' }} />
                <span style={{ 'font-weight': '700', 'font-size': '11px', color: '#e0e0e0', 'text-transform': 'uppercase', 'letter-spacing': '1px' }}>Tone Curve</span>
              </div>
              <button onClick={(e) => { e.stopPropagation(); setCurves(defaultCurves()); }} style={{ background: 'none', border: 'none', color: '#777', cursor: 'pointer', padding: '0', display: 'flex' }} title="Reset Curves">
                <RotateCcw size={13} />
              </button>
            </div>

            {curveExpanded() && (
               <ToneCurve curves={curves()} setCurves={setCurves} disabled={!lightState.enabled} />
            )}
            
            <div style={{ height: '40px' }}></div>
          </div>
        </aside>
`;

code = code.replace(/<div style=\{\{ height: '40px' \}\}>\s*<\/div>\s*<\/div>\s*<\/aside>/, curveUI);

fs.writeFileSync('src/App.tsx', code);
