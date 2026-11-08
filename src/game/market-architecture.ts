export interface MarketArea {
  x: number;
  y: number;
  w: number;
  h: number;
  right: number;
  bottom: number;
}
export interface MarketArchitectureLayout {
  width: number;
  height: number;
  stock: MarketArea;
  bonus: MarketArea;
  market: MarketArea;
  deck: MarketArea;
  sale: MarketArea;
}

// A single stone gallery and forecourt. No per-card or per-token slots.
export function marketArchitectureMarkup(
  layout: MarketArchitectureLayout,
): string {
  const { width: w, height: h, stock, bonus, market, deck, sale } = layout;
  const ink = "#ad7b68";
  const parts: string[] = [];
  const path = (d: string, fill: string, opacity: number) =>
    `<path d="${d}" fill="${fill}" fill-opacity="${opacity}"/>`;
  const line = (d: string, opacity = 0.22) =>
    `<path d="${d}" fill="none" stroke="${ink}" stroke-opacity="${opacity}" stroke-width=".8"/>`;
  const shelf = stock.bottom + 5;
  // Three inhabited bays, rather than a niche for every coin.
  const stone = "#b38a70";
  const opening = "#fff0d8";
  // The wall, gallery and foreground share one continuous stone foundation.
  parts.push(path(`M7 7H${w - 7}V${h - 7}H7Z`, "#c79c80", 0.4));
  parts.push(path(`M7 7H${w - 7}V22H7Z`, stone, 0.24));
  parts.push(line(`M8 22H${w - 8}`, 0.38));
  const split = stock.x + stock.w / 2;
  const bays = [
    [stock.x + 4, split - 6],
    [split + 6, stock.right - 3],
    [bonus.x + 4, bonus.right - 4],
  ];
  const arch = (x: number, right: number, top: number, bottom: number) => {
    const width = right - x,
      cx = (x + right) / 2,
      spring = top + Math.min(34, width * 0.24);
    return `M${x} ${bottom}V${spring}Q${x} ${top + 10} ${cx - width * 0.19} ${top + 7}Q${cx - width * 0.06} ${top + 6} ${cx} ${top}Q${cx + width * 0.06} ${top + 6} ${cx + width * 0.19} ${top + 7}Q${right} ${top + 10} ${right} ${spring}V${bottom}Z`;
  };
  for (const [x, right] of bays) {
    parts.push(path(arch(x, right, 25, shelf - 2), stone, 0.4));
    parts.push(path(arch(x + 3, right - 3, 29, shelf - 2), opening, 0.78));
    parts.push(line(`M${x} ${shelf - 1}H${right}`, 0.25));
  }
  for (const cx of [stock.x - 1, split, stock.right + 3, bonus.right + 2]) {
    parts.push(
      path(`M${cx - 2} 50H${cx + 2}V${shelf - 5}H${cx - 2}Z`, stone, 0.34),
    );
    parts.push(
      path(
        `M${cx - 5} ${shelf - 5}H${cx + 5}V${shelf}H${cx - 5}Z`,
        stone,
        0.34,
      ),
    );
  }
  parts.push(path(`M8 ${shelf}H${w - 8}V${shelf + 5}H8Z`, stone, 0.42));
  // A shared forecourt grows directly from the arcade's base, without a gap.
  parts.push(path(`M11 ${shelf + 5}H${w - 11}V${h - 18}H11Z`, opening, 0.65));
  parts.push(path(`M11 ${shelf + 5}H${w - 11}V${shelf + 9}H11Z`, stone, 0.12));
  const pad = Math.min(18, Math.max(5, (w - market.w - deck.w - sale.w) / 12));
  const left = market.x - pad,
    right = market.right + pad,
    bottom = market.bottom + 5;
  // The centre is a pale patch of the same paving, not a separate UI panel.
  parts.push(
    path(
      `M${left} ${shelf + 10}H${right}L${right + 7} ${bottom + 4}H${left - 7}Z`,
      opening,
      0.24,
    ),
  );
  parts.push(
    line(`M${left - 7} ${shelf + 11}L${left - 13} ${bottom + 4}`, 0.18),
  );
  parts.push(
    line(`M${right + 7} ${shelf + 11}L${right + 13} ${bottom + 4}`, 0.18),
  );
  // One front step crosses all three functions and repeats the gallery's stone.
  parts.push(
    path(`M11 ${bottom + 5}H${w - 11}V${bottom + 9}H11Z`, stone, 0.25),
  );
  parts.push(
    line(
      `M11 ${shelf + 9}V${bottom + 5}M${w - 11} ${shelf + 9}V${bottom + 5}`,
      0.25,
    ),
  );
  parts.push(
    `<rect x="5" y="5" width="${w - 10}" height="${h - 10}" rx="4" fill="none" stroke="${ink}" stroke-opacity=".18" stroke-width=".8"/>`,
  );
  return parts.join("");
}
