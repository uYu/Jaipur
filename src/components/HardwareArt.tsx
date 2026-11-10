import type { Card } from "../game/types.ts";

type Part = Card | "stall";

function Fan({ x, y, size = 1 }: { x: number; y: number; size?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size})`}>
      <circle r="9" fill="#18232e" stroke="#a7b6c5" />
      {[0, 60, 120, 180, 240, 300].map((angle) => (
        <path
          key={angle}
          d="M0 0Q-4-3-2-7Q3-7 3-5Q3-2 0 0"
          fill="#768897"
          transform={`rotate(${angle})`}
        />
      ))}
      <circle r="2" fill="#c5d3df" />
    </g>
  );
}

function MemoryStick({ y }: { y: number }) {
  return (
    <g transform={`translate(4 ${y})`}>
      <path d="M0 1h47v13H0z" fill="#543474" stroke="#251739" />
      <path d="M2 2h43v4H2z" fill="#ae84d8" />
      <path
        d="M5 8h5m3 0h5m3 0h5m3 0h5m3 0h5"
        stroke="#261a39"
        strokeWidth="4"
      />
      <path d="M3 13h20m3 0h17" stroke="#efc66a" strokeDasharray="1.4 1" />
    </g>
  );
}

const hardwareShapes: Record<Part, React.ReactNode> = {
  diamond: (
    <g transform="rotate(-14 28 28)">
      <path d="M3 12h4v28H3zM11 36h23v5H11z" fill="#bbcad7" stroke="#293748" />
      <path
        d="M12 39h22"
        stroke="#e7b952"
        strokeWidth="3"
        strokeDasharray="1 1"
      />
      <path
        d="M7 15h41l6 6v13l-6 4H7z"
        fill="#a02b38"
        stroke="#3d1622"
        strokeWidth="1.4"
      />
      <path d="M9 16h39l4 5M9 35h39" stroke="#ef8790" />
      <Fan x={16} y={26} size={0.74} />
      <Fan x={30} y={26} size={0.74} />
      <Fan x={44} y={26} size={0.74} />
    </g>
  ),
  gold: (
    <>
      <rect
        x="11"
        y="11"
        width="34"
        height="34"
        rx="4"
        fill="#386b51"
        stroke="#182e28"
        strokeWidth="1.5"
      />
      <path
        d="M14 10h28m-28 36h28M10 14v28m36-28v28"
        stroke="#ad8144"
        strokeWidth="3"
        strokeDasharray="2 2"
      />
      <path
        d="M16 15h24l3 3v21l-3 3H16l-3-3V18z"
        fill="#c7cbd0"
        stroke="#526475"
        strokeWidth="1.4"
      />
      <path d="M17 18h22M16 20v15" stroke="#fff" strokeWidth="1.4" />
      <path d="M22 31h12m-9 3h6" stroke="#657686" strokeWidth="1.6" />
    </>
  ),
  silver: (
    <>
      <path
        d="M8 5h41v43l-4 3H8z"
        fill="#23538a"
        stroke="#102540"
        strokeWidth="1.5"
      />
      <path d="M11 8h6v18h-6zM13 34h23v5H13zm0 9h17v4H13z" fill="#a1c9e6" />
      <path
        d="M19 11h15v16H19z"
        fill="#819cb2"
        stroke="#101f33"
        strokeWidth="2"
      />
      <path d="M22 14h9v10h-9z" fill="#d5e2e9" />
      <path
        d="M38 10v21m4-21v21M18 29h16l6 7v10M12 30h8"
        stroke="#e1ad51"
        strokeWidth="1.3"
      />
      <path d="M45 10v22M34 43h10" stroke="#bbdaf0" strokeWidth="2" />
      <circle cx="46" cy="8" r="1.3" fill="#e9edf4" />
      <circle cx="11" cy="47" r="1.3" fill="#e9edf4" />
    </>
  ),
  cloth: (
    <g transform="rotate(-13 28 28)">
      <MemoryStick y={12} />
      <MemoryStick y={29} />
    </g>
  ),
  spice: (
    <g transform="rotate(-19 28 28)">
      <path
        d="M5 17h43v22H5z"
        fill="#29433d"
        stroke="#172b26"
        strokeWidth="1.5"
      />
      <path d="M8 20h35v16H8z" fill="#34454e" />
      <path d="M11 22h8v12h-8zM22 22h7v12h-7z" fill="#15232d" />
      <path d="M31 21h12v14H31z" fill="#d9e4df" />
      <path d="M33 24h8m-8 3h6m-6 3h8" stroke="#698578" />
      <path
        d="M48 20v16"
        stroke="#e5b85c"
        strokeWidth="4"
        strokeDasharray="1 1"
      />
      <circle cx="6" cy="28" r="2" fill="#a9bcb5" />
    </g>
  ),
  leather: (
    <>
      <path
        d="m8 17 23-8 18 7v24l-21 9-20-8z"
        fill="#35414e"
        stroke="#182029"
        strokeWidth="1.6"
      />
      <path
        d="m9 17 19 8 20-9M28 25v22"
        fill="none"
        stroke="#94a3ad"
        strokeWidth="1.2"
      />
      <path d="m12 21 12 5v12l-12-5z" fill="#1e252d" />
      <path d="m15 25 6 3m-6 0 6 3m-6 0 6 3" stroke="#d9a75c" />
      <g transform="translate(38 32) skewY(-21)">
        <Fan x={0} y={0} size={0.86} />
      </g>
    </>
  ),
  camel: (
    <>
      <rect
        x="11"
        y="8"
        width="34"
        height="42"
        rx="5"
        fill="#997250"
        stroke="#493420"
        strokeWidth="1.6"
      />
      <rect x="15" y="12" width="26" height="34" rx="2" fill="#fdf0d8" />
      <path
        d="M23 9V6q0-3 5-3t5 3v3h4v6H19V9z"
        fill="#6d8295"
        stroke="#334354"
        strokeWidth="1.5"
      />
      <path
        d="M19 21h4v4h-4zm0 8h4v4h-4zm0 8h4v4h-4zM27 23h10m-10 8h10m-10 8h10"
        fill="none"
        stroke="#97704b"
        strokeWidth="1.6"
      />
      <path d="m19 21 2 2 4-5" fill="none" stroke="#216655" strokeWidth="1.7" />
    </>
  ),
  stall: (
    <>
      <path
        d="M6 22h44v25H6z"
        fill="#305273"
        stroke="#172a40"
        strokeWidth="1.6"
      />
      <path d="M9 25h38v17H9z" fill="#e5edf4" />
      <path
        d="m6 14 7-8h30l7 8v11H6z"
        fill="#547a99"
        stroke="#172a40"
        strokeWidth="1.6"
      />
      <path d="M9 16h38m-38 4h38" stroke="#97bed6" strokeWidth="1.4" />
      <path
        d="M15 32h12v10H15zM30 28h12v14H30z"
        fill="#c39258"
        stroke="#794f35"
      />
      <path d="M20 32v4m16-8v5" stroke="#f6d9a6" strokeWidth="2" />
      <path d="M4 46h48v4H4z" fill="#1f3650" />
    </>
  ),
};

export function HardwareArt({
  name,
  className,
}: {
  name: Part;
  className: string;
}) {
  return (
    <svg className={className} viewBox="0 0 56 56" aria-hidden="true">
      {hardwareShapes[name]}
    </svg>
  );
}
