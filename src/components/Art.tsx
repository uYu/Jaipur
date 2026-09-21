import type { Card } from "../game/types.ts";
export function GoodsArt({ good }: { good: Card }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
      className="goods-art"
    >
      <circle cx="60" cy="60" r="44" fill="currentColor" opacity=".08" />
      {good === "diamond" ? (
        <g stroke="currentColor" strokeWidth="2.3" strokeLinejoin="round">
          <path
            d="M24 45 41 27h38l17 18-36 49z"
            fill="currentColor"
            fillOpacity=".18"
          />
          <path d="m24 45 72 0M41 27l-3 18 22 49 22-49-3-18M38 45l22-18 22 18" />
          <path d="M20 22v10m-5-5h10m72 48v10m-5-5h10" />
        </g>
      ) : good === "gold" ? (
        <g stroke="currentColor" strokeWidth="2.3" strokeLinejoin="round">
          <path
            d="m18 84 8-23h30l9 23zm38 0 8-23h30l9 23zM36 54l8-23h30l9 23z"
            fill="currentColor"
            fillOpacity=".25"
          />
          <path d="m26 61 7 8h16l7-8m8 0 7 8h16l7-8M44 31l7 8h16l7-8M18 84h47m-29-30h47" />
          <path d="m87 24 3-7 3 7 7 3-7 3-3 7-3-7-7-3z" fill="currentColor" />
        </g>
      ) : good === "silver" ? (
        <g stroke="currentColor" strokeWidth="2.3">
          <ellipse
            cx="60"
            cy="81"
            rx="31"
            ry="11"
            fill="currentColor"
            fillOpacity=".2"
          />
          <path d="M29 72v9m62-9v9" />
          <ellipse
            cx="60"
            cy="71"
            rx="31"
            ry="11"
            fill="currentColor"
            fillOpacity=".14"
          />
          <path d="M29 61v10m62-10v10" />
          <ellipse cx="60" cy="60" rx="31" ry="11" />
          <path d="M29 50v10m62-10v10" />
          <ellipse
            cx="60"
            cy="49"
            rx="31"
            ry="11"
            fill="currentColor"
            fillOpacity=".22"
          />
          <path d="m60 40 6 9-6 9-6-9zM24 29v10m-5-5h10m69-5v10m-5-5h10" />
        </g>
      ) : good === "cloth" ? (
        <g stroke="currentColor" strokeWidth="2.3" strokeLinejoin="round">
          <path
            d="M29 31h49c17 0 17 22 0 22H43v36H26V43c0-7 2-12 11-12"
            fill="currentColor"
            fillOpacity=".18"
          />
          <path d="M43 53V42c0-14-18-14-18 0m53-11c-15 0-15 22 0 22m-8 0v38l-9-5-9 5-9-5M33 37v43m18-18h12m-12 7h12m-12 7h12" />
          <path d="m88 70 4 8-4 8-4-8z" fill="currentColor" />
        </g>
      ) : good === "spice" ? (
        <g stroke="currentColor" strokeWidth="2.3" strokeLinejoin="round">
          <path
            d="M22 65h76c-3 22-19 29-38 29S25 87 22 65Z"
            fill="currentColor"
            fillOpacity=".2"
          />
          <path d="M28 65c9-16 18-19 32-33 11 15 24 17 33 33M30 76h60M42 94h36" />
          <path d="m50 52 5-3m7 7 5 3m-1-15 4 3M45 31c-7-7 7-10 0-18m17 8c-7-7 7-10 0-18m15 30c-7-7 7-10 0-18" />
        </g>
      ) : good === "leather" ? (
        <g stroke="currentColor" strokeWidth="2.3" strokeLinejoin="round">
          <path
            d="m34 24 17 7h18l17-7 10 18-10 10v20l10 11-10 15-18-7H52l-18 7-10-15 10-11V52L24 42Z"
            fill="currentColor"
            fillOpacity=".2"
          />
          <path
            d="m40 34 11 5h18l11-5m0 7v36l6 8-17-3H51l-15 3 6-8V43"
            strokeDasharray="3 4"
          />
          <path d="m53 55 15 15m0-15L53 70" />
        </g>
      ) : (
        <g
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            d="M20 62c3-10 10-16 17-8 4-21 16-22 23-5 8-7 14-6 20 0l8-25 16 1 3 9-12 4-5 37H34l-6 20h-8l5-30-10 5"
            fill="currentColor"
            fillOpacity=".18"
          />
          <path d="m40 75-4 20h8l7-20m24 0 5 20h8l-2-20M43 54h24v16H43zM47 58l8 8 8-8" />
          <circle cx="99" cy="29" r="1.5" fill="currentColor" />
        </g>
      )}
    </svg>
  );
}
export function Palace() {
  return (
    <svg
      className="palace"
      viewBox="0 0 600 520"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="300" cy="235" r="205" fill="#e5bb80" opacity=".2" />
      <circle cx="420" cy="125" r="47" fill="#d99c55" opacity=".65" />
      <path d="M35 446c110-30 150 0 247-9s191-30 282 5v37H35Z" fill="#dfb5a0" />
      <g fill="#d49079" stroke="#985d51" strokeWidth="1.5">
        <path d="M113 427V219h71v208m232 0V219h71v208M176 427V259h248v168" />
        <path d="M230 427V180h140v247M217 180h166l-18-22H235Z" />
        <path d="M246 158c-2-37 31-36 54-76 23 40 56 39 54 76Z" />
        <path d="M102 219h93l-11-13h-71Zm303 0h93l-11-13h-71Z" />
        <path d="M119 206c0-28 18-29 29-52 12 23 31 24 31 52Zm302 0c0-28 18-29 30-52 12 23 30 24 30 52Z" />
      </g>
      <g fill="#f5d4b3" stroke="#ac6b59" strokeWidth="1.5">
        {[140, 444].map((x) => (
          <g key={x}>
            {[240, 299, 358].map((y) => (
              <path
                key={y}
                d={`M${x - 11} ${y + 35}v-22q0-13 12-20 12 7 12 20v22z`}
              />
            ))}
          </g>
        ))}
        {[266, 320].map((x) => (
          <g key={x}>
            {[203, 271].map((y) => (
              <path
                key={y}
                d={`M${x - 11} ${y + 40}v-24q0-14 16-24 16 10 16 24v24z`}
              />
            ))}
          </g>
        ))}
        <path
          d="M270 427v-56c0-24 15-29 30-45 15 16 30 21 30 45v56z"
          fill="#714c48"
        />
        <path d="M176 276h54m140 0h54M230 255h140m-140 66h140M111 291h73m-73 61h73m232-61h71m-71 61h71" />
      </g>
      <path d="M96 428h408M73 439h452" stroke="#985d51" strokeWidth="3" />
      <path
        d="m300 82 0-22m-152 94v-15m303 15v-15"
        stroke="#985d51"
        strokeWidth="2"
      />
      <g stroke="#66756b" strokeWidth="4" strokeLinecap="round">
        <path d="M65 428V309m0 17c-30-32-43-22-43-22m43 22c24-37 43-24 43-24m-43 24c-10-49-27-49-27-49m27 49c10-50 26-50 26-50M541 427v-81m0 8c-20-27-34-23-34-23m34 23c20-30 31-24 31-24" />
      </g>
      <g fill="#ac6b59">
        <path d="m70 172 8-5 8 5-8-2zm404-91 8-5 8 5-8-2zm-60-23 6-4 6 4-6-1z" />
      </g>
    </svg>
  );
}
