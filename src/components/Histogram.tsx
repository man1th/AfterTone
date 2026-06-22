import { Component, createEffect, onCleanup } from 'solid-js';

export const Histogram: Component<{ data: number[] }> = (props) => {
  let canvasRef!: HTMLCanvasElement;

  createEffect(() => {
    if (!props.data || props.data.length === 0) return;
    const ctx = canvasRef.getContext('2d');
    if (!ctx) return;
    
    const width = canvasRef.width;
    const height = canvasRef.height;
    
    ctx.clearRect(0, 0, width, height);
    
    // Find highest peak to normalize the graph height
    const maxVal = Math.max(...props.data, 1);
    const barWidth = width / 256;
    
    ctx.fillStyle = '#888';
    
    // Draw the 256 bins
    for (let i = 0; i < 256; i++) {
      // Apply a subtle log scale so small peaks remain visible
      const normalized = Math.pow(props.data[i] / maxVal, 0.5); 
      const barHeight = normalized * height;
      ctx.fillRect(i * barWidth, height - barHeight, barWidth, barHeight);
    }
  });

  return (
    <div style={{ width: '100%', height: '100%', padding: '8px 16px', display: 'flex', 'flex-direction': 'column', 'justify-content': 'flex-end' }}>
      <canvas 
        ref={canvasRef} 
        width={256} 
        height={100} 
        style={{ width: '100%', height: '80%', 'image-rendering': 'pixelated' }} 
      />
    </div>
  );
};
