import type { Card } from "../game/types.ts";

// Accepted artwork: caravan silhouettes, with the expanded silk roll (option 7).
export function GoodsGlyph({
  good,
  cardFace = false,
}: {
  good: Card;
  cardFace?: boolean;
}) {
  const cut = "var(--card-bg)";
  let shape;
  switch (good) {
    case "diamond":
      shape = (
        <>
          <path d="m30 31 44-10 25 34-31 48-43-39Z" />
          <path
            d="m30 31 28 21 16-31M25 64l33-12 41 3M58 52l10 51m-10-51 24 28"
            stroke={cut}
            strokeWidth="4"
            fill="none"
          />
        </>
      );
      break;
    case "gold":
      shape = (
        <>
          <path d="m20 52 19-24h49l13 24-11 38H29Z" />
          <path
            d="m20 52 18 13h46l17-13M38 65l-9 25m55-25 6 25M39 28l-1 37m50-37-4 37"
            stroke={cut}
            strokeWidth="3"
            fill="none"
          />
          <circle cx="62" cy="46" r="9" fill={cut} />
          <path
            d="m62 32 3 7 7-3-3 7 7 3-7 3 3 7-7-3-3 7-3-7-7 3 3-7-7-3 7-3-3-7 7 3Z"
            fill={cut}
          />
        </>
      );
      break;
    case "silver":
      shape = (
        <>
          <circle cx="44" cy="69" r="28" />
          <circle cx="78" cy="69" r="28" stroke={cut} strokeWidth="4" />
          <circle cx="60" cy="42" r="28" stroke={cut} strokeWidth="4" />
          <circle
            cx="60"
            cy="42"
            r="19"
            stroke={cut}
            strokeWidth="2"
            fill="none"
          />
          <path d="m60 28 4 10 10 4-10 4-4 10-4-10-10-4 10-4Z" fill={cut} />
          <path d="M28 76h17m30 0h17" stroke={cut} strokeWidth="3" />
        </>
      );
      break;
    case "cloth":
      shape = (
        <>
          <path d="m44 24 46-7c19-1 24 24 5 29l-46 7c-19 1-24-25-5-29Z" />
          <path d="M36 39c21 3 42-4 61-9 0 20 0 36 10 53-28-4-47 20-74 11-10-4-18-3-25 0 10-18 20-35 28-55Z" />
          <path
            d="M49 30c16 2 28-7 40-5m6-4c-8 7-6 17 2 20M46 48c-7 14-13 25-22 35m61-38c-1 13 0 23 6 30M15 87c17-6 25 9 44 1 14-7 24-12 42-9"
            stroke={cut}
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M62 56c-1 7-12 10-12 17 0 10 16 9 16 0 0-5-7-6-9-2 9-1 4-9 5-15Z"
            fill={cut}
          />
        </>
      );
      break;
    case "spice":
      shape = (
        <>
          <path d="m41 19 19 8 19-8-9 23c18 14 30 27 28 41-3 22-73 22-76 0-2-14 10-27 28-41Z" />
          <path d="M43 43h34M44 49h32" stroke={cut} strokeWidth="4" />
          <path d="M38 69c0-9 44-9 44 0v12c0 14-44 14-44 0Z" fill={cut} />
          <path d="m44 77 11-9 8 6 7-4 7 9Z" />
          <circle cx="52" cy="81" r="2" />
          <circle cx="67" cy="83" r="2" />
        </>
      );
      break;
    case "leather":
      shape = (
        <>
          <path d="m28 19 20 13 24-2 19-14 11 15-17 22 1 24 18 16-16 12-21-13-21 4-17 9-15-15 20-19 1-20-18-19Z" />
          <path
            d="m33 35 13 9 25-2 15-9M43 48l-2 30 12 7 17-2 11-8-3-28"
            stroke={cut}
            strokeWidth="3"
            strokeDasharray="4 4"
            fill="none"
          />
          <path d="m50 58 18 14m-1-17L51 74" stroke={cut} strokeWidth="4" />
        </>
      );
      break;
    case "camel":
      shape = (
        <>
          <path d="m15 63 6-9 15 2c2-16 11-27 21-22 6-15 20-13 24 3l7 3 4-24 11-3 6 10-8 10-4 38-10 5 9 26H85L71 78H48l-8 24H29l6-28-9-2-7 24H9l7-29Z" />
          <path d="M42 45h34v27H42Z" fill={cut} />
          <path d="m46 48 13 10 13-10v17H46Z" />
          <path
            d="M41 69v9m8-9v9m9-9v9m9-9v9m9-9v9"
            stroke={cut}
            strokeWidth="3"
          />
          <circle cx="100" cy="21" r="2" fill={cut} />
        </>
      );
      break;
  }

  return (
    <svg
      className="goods-art"
      viewBox={cardFace ? "8 8 104 104" : "0 0 120 120"}
      fill="currentColor"
      aria-hidden="true"
    >
      {shape}
    </svg>
  );
}
