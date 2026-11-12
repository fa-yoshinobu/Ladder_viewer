import { commentLines } from './textLayout';
export function CommentText({
  text,
  x,
  y,
  width,
  centered = false,
}: {
  text: string;
  x: number;
  y: number;
  width: number;
  centered?: boolean;
}) {
  if (!text) return null;
  const lines = commentLines(text, Math.max(4, Math.floor(width / 5.5)));
  return (
    <g class="device-comment">
      <title>{text}</title>
      <text x={x} y={y} text-anchor={centered ? 'middle' : 'start'}>
        {lines.map((line, index) => (
          <tspan key={index} x={x} dy={index ? 11 : 0}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}
