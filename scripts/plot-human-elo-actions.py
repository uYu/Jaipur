"""Render a numeric Elo/action summary that stays readable without estimating bars."""
import argparse
import json
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle


BANDS = ("1600+", "1550–1599", "1500–1549", "<1500")
SOURCE_BANDS = ("1600+", "1550-1599", "1500-1549", "<1500")
COLUMNS = (
    ("take_goods", "Take goods", "#356da3"),
    ("take_camels", "Take camels", "#318b73"),
    ("trade", "Exchange", "#c56852"),
    ("sell_actions", "Sales", "#8060a5"),
    ("goods_sold", "Cards sold", "#ba862c"),
    ("goods_per_sale", "Cards / sale", "#9a6d24"),
    ("total", "All actions", "#3e5068"),
    ("camel_bonus", "Camel bonus", "#30897e"),
    ("score", "Round score", "#304666"),
)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--summary", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    data = json.loads(args.summary.read_text())
    fig, ax = plt.subplots(figsize=(20.5, 6.7), dpi=180)
    fig.patch.set_facecolor("#ffffff")
    ax.set_xlim(0, 10.55)
    ax.set_ylim(0, 6.35)
    ax.axis("off")
    ax.text(0.14, 6.09, "Jaipur · actions and score by Elo", fontsize=22, weight="bold", color="#182638")
    ax.text(0.14, 5.73, "One player in one scored round record · train split · mean shown in large type", fontsize=11.5, color="#526275")

    x0, label_w, cell_w = 0.14, 1.44, 0.99
    x_cells = x0 + label_w
    header_y = 4.98
    for index, (_, title, color) in enumerate(COLUMNS):
        left = x_cells + index * cell_w
        ax.add_patch(Rectangle((left + 0.045, header_y - 0.08), cell_w - 0.09, 0.055, facecolor=color, edgecolor="none"))
        ax.text(left + cell_w / 2, header_y + 0.16, title, ha="center", va="bottom", fontsize=10.4, weight="bold", color="#24344b")
    ax.text(x0 + 0.04, header_y + 0.16, "Elo band", va="bottom", fontsize=10.4, weight="bold", color="#24344b")

    for row_index, (label, key) in enumerate(zip(BANDS, SOURCE_BANDS)):
        stats = data["exclusive"][key]
        top = 4.75 - row_index * 0.91
        ax.add_patch(Rectangle((x0, top - 0.73), label_w + len(COLUMNS) * cell_w, 0.80,
                               facecolor="#f5f8fb" if row_index % 2 == 0 else "#ffffff", edgecolor="none"))
        ax.text(x0 + 0.04, top - 0.19, label, fontsize=14, weight="bold", va="center", color="#1d2d42")
        ax.text(x0 + 0.04, top - 0.50, f'{stats["players"]} players · {stats["player_rounds"]:,} rounds',
                fontsize=9.3, va="center", color="#667789")
        for col_index, (field, _, color) in enumerate(COLUMNS):
            middle = x_cells + (col_index + 0.5) * cell_w
            value = stats["goods_per_sale"] if field == "goods_per_sale" else stats["per_player_round_mean"][field]
            ax.text(middle, top - 0.19, f"{value:.2f}", ha="center", va="center",
                    fontsize=17.5, weight="bold", color=color)
            if field in ("total", "score"):
                q1 = stats["per_player_round_p25"][field]
                q3 = stats["per_player_round_p75"][field]
                subtitle = f"IQR {q1:.0f}–{q3:.0f}"
            elif field == "goods_sold":
                subtitle = "cards / round"
            elif field == "goods_per_sale":
                subtitle = "all sale actions"
            elif field == "camel_bonus":
                subtitle = f"{value / 5:.1%} majority"
            else:
                subtitle = f'{stats["action_share"][field]:.1%} of actions'
            ax.text(middle, top - 0.51, subtitle, ha="center", va="center", fontsize=9.1, color="#667789")

    for boundary in (4, 6, 7, 8):
        ax.plot([x_cells + boundary * cell_w, x_cells + boundary * cell_w], [1.21, 5.29], color="#cbd4df", lw=1.2)
    ax.text(x0 + 0.02, 0.68, "IQR = middle 50% of player-rounds. Bands are disjoint; Elo is estimated from training games.",
            fontsize=10.4, color="#526275")
    ax.text(x0 + 0.02, 0.35, "Cards / sale = total cards sold ÷ sale actions. Round score includes the 5-point camel bonus (0 on ties).",
            fontsize=10.4, color="#526275")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(args.output, bbox_inches="tight", facecolor="white")
    plt.close(fig)


if __name__ == "__main__":
    main()
