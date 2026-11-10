import { HardwareArt } from "./HardwareArt.tsx";
import { useSkin } from "./Skin.tsx";
import type { Card } from "../game/types.ts";

const sprites = {
  camel: (
    <>
      <path
        fill="#4a281e"
        d="M25 4h4v2h2v4h-4v3h-2v6h-2v4h1v5h2v3h-5v-5h-2v-5h-4v6h1v4h-5v-8H9v4H7v4H3v-4h2v-6H3v5H1v-7h2v-2h3v-4h3v-2h5V9h5v2h3V7h3Z"
      />
      <path
        fill="#98603b"
        d="M26 6h3v2h-4v4h-2v6h-3v3H9v-4H7v-3h4v-2h5v-2h2v3h5v-2h2V8h1Z"
      />
      <path fill="#e4a56c" d="M27 7h2v1h-2zM9 13h11v2h-2v4H9Z" />
      <path
        fill="#663823"
        d="M11 15h7v2h-7zM24 11h3v2h-3zM13 22h2v5h-2zM21 21h2v4h-2z"
      />
    </>
  ),
  diamond: (
    <>
      <path
        fill="#a70828"
        d="M8 4h16v3h4v4h2v8h-2v4h-4v4h-4v3h-8v-3H8v-4H4v-4H2v-8h2V7h4Z"
      />
      <path
        fill="#e01944"
        d="M9 5h14v3h4v4h2v5h-2v4h-4v4h-4v3h-6v-3H9v-4H5v-4H3v-5h2V8h4Z"
      />
      <path
        d="m8 7 8 9 7-10M3 19l13-3 13 2M16 16l4 12m-4-12-5 11"
        fill="none"
        stroke="#fff4df"
        strokeWidth="1.35"
      />
    </>
  ),
  gold: (
    <>
      <path fill="#6c3209" d="M5 5h22v3h2v5h2v14h-3v2H4v-2H1V13h2V8h2Z" />
      <path fill="#fbb539" d="M7 7h18v3h2v4h2v11h-2v2H5v-2H3V14h2v-4h2Z" />
      <path fill="#a9540a" d="M4 17h24v8H4zM7 9h18v6H7z" />
      <path
        fill="#ffe091"
        d="M6 8h2v9h16V8h2v9h3v2h-3v8h-2v-8H8v8H6v-8H3v-2h3zM15 10h3v2h2v2h-2v2h-3v-2h-2v-2h2Z"
      />
    </>
  ),
  silver: (
    <>
      <path fill="#183f60" d="M6 14h5V8h3V5h10v3h3v7h3v10h-3v3H5v-3H2v-8h4Z" />
      <path
        fill="#6fa5c3"
        d="M6 16h9v3h2v5h-2v2H6v-2H4v-6h2Zm14 0h6v3h2v5h-2v2h-8v-7h2ZM14 9h3V7h6v2h2v5h-3v2h-7v-3h-2Z"
      />
      <path fill="#d1edf6" d="M16 9h6v2h-6zM7 18h6v2H7zM21 18h4v2h-4z" />
    </>
  ),
  cloth: (
    <>
      <path
        fill="#59296b"
        d="M3 7h17V5h6v2h3v3h2v7h-3v7h-3v3h-9v2H2v-5h2V13H2V9h1Z"
      />
      <path
        fill="#ac72c4"
        d="M4 9h17V7h5v2h2v3h1v3h-4v8h-2v2h-9v2H4v-2h2V13H4Z"
      />
      <path
        fill="#e0b6eb"
        d="M6 9h15v2h5v3h-7v-2H6zM8 16h2v8H8zM15 16h2v7h-2z"
      />
    </>
  ),
  spice: (
    <>
      <path
        fill="#144d33"
        d="M7 3h4v2h10V3h4v4h-2v4h-2v2h4v3h3v4h2v6h-3v3h-5v2H10v-2H5v-3H2v-6h2v-4h3v-3h4v-2H9V7H7Z"
      />
      <path
        fill="#3b925f"
        d="M9 6h4v1h7V6h3v2h-3v3h-8V8H9Zm1 8h12v3h4v4h2v4h-3v2h-5v2h-8v-2H7v-2H4v-4h2v-4h4Z"
      />
      <path fill="#c9e5ad" d="M10 19h12v2h3v4h-4v2H11v-2H7v-4h3Z" />
      <path fill="#205f43" d="M15 20h3v2h3v2h-4v2h-3v-2h-3v-2h4Z" />
    </>
  ),
  leather: (
    <>
      <path
        fill="#693016"
        d="M5 4h4v2h4v3h6V6h4V4h4v2h3v5h-3v4h-3v5h3v3h3v5h-3v2h-5v-2h-4v-2h-4v2h-4v2H5v-2H2v-5h3v-3h3v-5H5v-4H2V6h3Z"
      />
      <path
        fill="#a85c31"
        d="M5 7h3v2h4v3h8V9h4V7h3v3h-3v4h-3v7h3v4h3v2h-4v-2h-4v-2h-6v2H9v2H5v-2h3v-4h3v-7H8v-4H5Z"
      />
      <path
        fill="#e7ae72"
        d="M11 12h2v2h-2zM19 12h2v2h-2zM13 15h2v2h-2zM17 15h2v2h-2zM15 17h2v2h-2zM13 20h2v2h-2zM17 20h2v2h-2z"
      />
    </>
  ),
  stall: (
    <>
      <path
        fill="#4d2519"
        d="M6 2h20v3h2v4h2v4h2v5h-3v9h2v5H1v-5h2v-9H0v-5h2V9h2V5h2Z"
      />
      <path fill="#a35c2e" d="M5 15h22v13H5zM2 28h28v3H2z" />
      <path fill="#f2b960" d="M6 17h2v11H6zM24 17h2v11h-2zM3 28h26v1H3z" />
      <path fill="#653721" d="M9 17h14v10H9z" />
      <path fill="#f5b665" d="M10 24h4v-3h3v2h5v3H10Z" />
      <path fill="#f6dab0" d="M7 4h18v3h2v4h2v5H3v-5h2V7h2Z" />
      <path
        fill="#d44c34"
        d="M7 4h5v6h-2v6H3v-5h2V7h2ZM15 4h4v12h-5v-6h1Zm7 0h3v3h2v4h2v5h-6v-6h-1Z"
      />
      <path fill="#fff1d2" d="M7 4h18v2H7Z" opacity=".6" />
    </>
  ),
};

export function PixelArt({ name }: { name: Card | "stall" }) {
  const { skin } = useSkin();
  if (skin === "hardware") return <HardwareArt name={name} className="bazaar-pixel-art" />;
  return (
    <svg className="bazaar-pixel-art" viewBox="0 0 32 32" aria-hidden="true">
      {sprites[name]}
    </svg>
  );
}
