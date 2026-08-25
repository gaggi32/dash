import { useId } from "react";

interface Props {
  /** Sizes the mark — it fills its box, so `h-9 w-9` is all a call site needs. */
  className?: string;
}

/**
 * The Dash brand mark: the dark tile with its two-stroke check, drawn at the
 * same proportions as the shipped app icon (`public/icon.svg` → `app-icon.png`
 * → `src-tauri/icons/`) so the in-app badge and the taskbar/tray icon read as
 * the same object.
 *
 * The tile stays dark in both themes, matching the icon rather than the
 * surrounding surface.
 */
export default function DashMark({ className }: Props) {
  // Two marks on one page would otherwise share gradient ids.
  const uid = useId();
  const tile = `dash-tile-${uid}`;
  const edge = `dash-edge-${uid}`;

  return (
    <svg viewBox="0 0 256 256" className={className} role="img" aria-label="Dash">
      <defs>
        <linearGradient id={tile} gradientUnits="userSpaceOnUse" x1="71.9" y1="-26.2" x2="184.1" y2="282.2">
          <stop offset="0" stopColor="#1c1c1f" />
          <stop offset="1" stopColor="#0e0e10" />
        </linearGradient>
        <linearGradient id={edge} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="110">
          <stop offset="0" stopColor="#fff" stopOpacity=".10" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="256" height="256" rx="58" fill={`url(#${tile})`} />
      <rect x=".5" y=".5" width="255" height="255" rx="57.5" fill="none" stroke={`url(#${edge})`} />
      <g fill="none" strokeWidth="18" strokeLinecap="round">
        <path stroke="#6a6a72" d="M92 140.6 111.8 160.4" />
        <path stroke="#f2f2f4" d="M122.2 149.2 164 95.6" />
      </g>
    </svg>
  );
}
