import { useId } from 'react';
import { cn } from '../lib/utils';
import type { GarmentKind } from './types';

/**
 * Vector stand-ins for product cut-out photos (the reference uses photographed cut-outs; we can't reuse them).
 * shortcut: demo art only — real stores render uploaded images instead.
 */

const PUFFER_BODY =
  'M132 108C160 98 240 98 268 108L312 124C346 138 356 176 358 214L366 318C367 334 356 342 342 342L322 342C310 342 302 334 302 322L298 232L300 352C268 364 132 364 100 352L102 232L98 322C98 334 90 342 78 342L58 342C44 342 33 334 34 318L42 214C44 176 54 138 88 124Z';
const PUFFER_HOOD = 'M138 112C128 52 160 26 200 24C240 26 272 52 262 112C242 104 222 100 200 100C178 100 158 104 138 112Z';
const HOODIE_BODY =
  'M138 104C170 112 230 112 262 104L318 126C346 140 352 170 354 200L366 322C367 334 360 340 348 341L330 342C318 343 312 336 311 325L300 214L302 360L98 360L100 214L89 325C88 336 82 343 70 342L52 341C40 340 33 334 34 322L46 200C48 170 54 140 82 126Z';
const HOODIE_HOOD = 'M142 108C134 46 166 22 200 20C234 22 266 46 258 108C238 118 220 122 200 122C180 122 162 118 142 108Z';
const TEE_BODY =
  'M132 58C152 70 176 76 200 76C224 76 248 70 268 58L340 96C352 102 356 112 352 122L330 172C326 182 316 184 308 180L292 172L292 356C230 366 170 366 108 356L108 172L92 180C84 184 74 182 70 172L48 122C44 112 48 102 60 96Z';

function isLight(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

export function GarmentArt({
  kind,
  tone,
  view = 'front',
  className,
  title,
}: {
  kind: GarmentKind;
  tone: string;
  view?: 'front' | 'back';
  className?: string;
  title?: string;
}) {
  const id = useId();
  const light = isLight(tone);
  const seam = `color-mix(in oklab, ${tone} ${light ? 72 : 55}%, black)`;
  const sheen = `color-mix(in oklab, ${tone} 70%, white)`;
  const front = view === 'front';

  const bodies =
    kind === 'puffer' ? [PUFFER_BODY, PUFFER_HOOD] : kind === 'tee' ? [TEE_BODY] : [HOODIE_BODY, HOODIE_HOOD];

  return (
    <svg
      viewBox="0 0 400 400"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      className={cn('h-auto w-full', className)}
    >
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={`${id}-x`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity={light ? 0.1 : 0.16} />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity={light ? 0.18 : 0.32} />
        </linearGradient>
        <linearGradient id={`${id}-y`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.22" />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          {bodies.map((d) => (
            <path key={d} d={d} />
          ))}
        </clipPath>
      </defs>

      {bodies.map((d) => (
        <g key={d}>
          <path d={d} fill={tone} />
          <path d={d} fill={`url(#${id}-x)`} />
          <path d={d} fill={`url(#${id}-y)`} />
        </g>
      ))}

      <g fill="none" strokeLinecap="round" strokeWidth={2.2} clipPath={`url(#${id}-clip)`}>
        {kind === 'puffer' && (
          <>
            {[150, 190, 230, 270, 310].map((y) => (
              <g key={y}>
                <path d={`M104 ${y}C150 ${y + 9} 250 ${y + 9} 296 ${y}`} stroke={seam} />
                <path d={`M108 ${y - 6}C150 ${y + 1} 250 ${y + 1} 292 ${y - 6}`} stroke={sheen} strokeOpacity={0.35} />
              </g>
            ))}
            {[180, 220, 260, 300].map((y) => (
              <g key={y} stroke={seam}>
                <path d={`M44 ${y}C60 ${y + 5} 86 ${y + 5} 100 ${y - 2}`} />
                <path d={`M300 ${y - 2}C314 ${y + 5} 340 ${y + 5} 356 ${y}`} />
              </g>
            ))}
            {front ? (
              <>
                <ellipse cx="200" cy="74" rx="38" ry="34" fill={seam} stroke="none" />
                <path d="M200 106V356" stroke={seam} strokeWidth={3} />
                <path d="M150 108C170 122 230 122 250 108" stroke={seam} />
              </>
            ) : (
              <path d="M146 96C170 86 230 86 254 96" stroke={seam} />
            )}
          </>
        )}

        {(kind === 'hoodie' || kind === 'fleece') && (
          <>
            <path d="M50 318L88 321M312 321L350 318M100 344H300" stroke={seam} />
            {front ? (
              <>
                <ellipse cx="200" cy="72" rx="34" ry="36" fill={seam} stroke="none" />
                <path d="M186 118L183 180M214 118L217 180" stroke={sheen} strokeWidth={2.6} />
                {kind === 'hoodie' ? (
                  <path d="M148 278H252L266 334H134Z" stroke={seam} />
                ) : (
                  <path d="M200 122V358M150 180H180" stroke={seam} strokeWidth={2.6} />
                )}
              </>
            ) : (
              <path d="M200 30V108" stroke={seam} />
            )}
          </>
        )}

        {kind === 'tee' && (
          <>
            <path d="M70 168L96 156M330 168L304 156M110 346C170 354 230 354 290 346" stroke={seam} />
            {front ? (
              <>
                <path d="M152 64C168 92 232 92 248 64" stroke={seam} strokeWidth={3} />
                <path
                  d="M200 128L208 150L230 158L208 166L200 188L192 166L170 158L192 150Z"
                  fill={light ? '#111' : '#f2f2f2'}
                  stroke="none"
                />
              </>
            ) : (
              <path d="M152 64C170 74 230 74 248 64" stroke={seam} strokeWidth={3} />
            )}
          </>
        )}
      </g>
    </svg>
  );
}
