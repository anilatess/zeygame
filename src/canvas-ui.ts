/** Presentation only: CSS-sized overlays never change camera or collision coordinates. */
let palette: Record<string, string> | undefined;
export function canvasTheme() {
  if (!palette) {
    const style =
      typeof document !== 'undefined' &&
      document.documentElement &&
      typeof getComputedStyle === 'function'
        ? getComputedStyle(document.documentElement)
        : null;
    palette = Object.fromEntries(
      Object.entries({
        navy: '#10162e',
        blue: '#58b9ff',
        pink: '#ff85bb',
        yellow: '#ffe16b',
        muted: '#bdc8e4',
        border: '#3c4c75',
      }).map(([key, fallback]) => [key, style?.getPropertyValue(`--${key}`).trim() || fallback]),
    );
  }
  return palette;
}
export function overlayLayout(context: CanvasRenderingContext2D, width: number, height: number) {
  const ratio = context.canvas?.clientWidth ? width / context.canvas.clientWidth : 1;
  const hud =
    typeof document !== 'undefined' && document.documentElement
      ? document.querySelector<HTMLElement>('.play-hud')
      : null;
  const hudBottom = hud && !hud.hidden ? hud.getBoundingClientRect().bottom * ratio : 76 * ratio;
  const ui =
    typeof document !== 'undefined' && document.documentElement
      ? document.querySelector<HTMLElement>('.game-ui')
      : null;
  const safeBottom = ui ? parseFloat(getComputedStyle(ui).paddingBottom) || 0 : 0;
  return {
    ratio,
    top: hudBottom + 10 * ratio,
    bottom: height - (16 + safeBottom) * ratio,
    width,
    height,
  };
}
export function panel(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  radius = 14,
) {
  context.save();
  context.fillStyle = '#10162ee6';
  context.strokeStyle = color;
  context.lineWidth = 1.5;
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
  context.stroke();
  context.restore();
}
export function drawInstruction(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  title: string,
  detail = '',
  timer = '',
) {
  const layout = overlayLayout(context, width, height);
  const { ratio, top } = layout;
  const font = 13 * ratio;
  const available = Math.min(width - 24 * ratio, 640 * ratio);
  const wrap = (text: string) => {
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      const measured = context.measureText(next)?.width ?? next.length * font * 0.55;
      if (line && measured > available - 24 * ratio) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };
  context.save();
  context.font = `700 ${font}px 'Trebuchet MS', system-ui`;
  const rows = [...wrap(title), ...(timer ? wrap(timer) : []), ...(detail ? wrap(detail) : [])];
  const panelHeight = (rows.length * 18 + 16) * ratio;
  panel(
    context,
    (width - available) / 2,
    top,
    available,
    panelHeight,
    canvasTheme().border,
    12 * ratio,
  );
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  rows.forEach((line, index) => {
    context.fillStyle = index === 0 ? canvasTheme().yellow : '#f8fafc';
    context.fillText(line, width / 2, top + (17 + index * 18) * ratio);
  });
  context.restore();
  return { ...layout, instructionBottom: top + panelHeight };
}
export function drawSimilarity(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  values: readonly number[],
) {
  const { ratio, bottom } = overlayLayout(context, width, height);
  const panelWidth = width / 2 - 24 * ratio;
  context.save();
  values.forEach((best, index) => {
    const color = index ? canvasTheme().pink : canvasTheme().blue;
    const left = (index * width) / 2 + 12 * ratio;
    const top = bottom - 52 * ratio;
    panel(context, left, top, panelWidth, 52 * ratio, color, 12 * ratio);
    context.font = `700 ${12 * ratio}px 'Trebuchet MS', system-ui`;
    context.fillStyle = color;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(
      `Oyuncu ${index + 1}: ${Math.round(best * 100)}%`,
      left + panelWidth / 2,
      top + 15 * ratio,
    );
    context.fillStyle = canvasTheme().border;
    context.fillRect(left + 10 * ratio, top + 32 * ratio, panelWidth - 20 * ratio, 8 * ratio);
    context.fillStyle = color;
    context.fillRect(
      left + 10 * ratio,
      top + 32 * ratio,
      (panelWidth - 20 * ratio) * best,
      8 * ratio,
    );
  });
  context.restore();
}
