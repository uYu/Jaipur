import { LABEL } from "./data.ts";
import { hardwareText } from "./hardware-copy.ts";
import type { Card } from "./types.ts";

export type Skin = "jaipur" | "hardware";

type Translate = {
  (text: string): string;
  (parts: TemplateStringsArray, ...values: unknown[]): string;
};

export type SkinCopy = {
  labels: Readonly<Record<Card, string>>;
  t: Translate;
};

function translator(messages?: Readonly<Record<string, string>>): Translate {
  return (text: string | TemplateStringsArray, ...values: unknown[]) => {
    if (typeof text === "string") {
      return messages && Object.hasOwn(messages, text) ? messages[text] : text;
    }
    if (messages) {
      const key = text.reduce(
        (result, part, i) => (i === 0 ? part : result + `⟦${i}⟧` + part),
        "",
      );
      if (Object.hasOwn(messages, key)) {
        return messages[key].replace(/⟦(\d+)⟧/g, (_, index: string) =>
          String(values[Number(index) - 1]),
        );
      }
    }
    return text.reduce(
      (result, part, i) =>
        i === 0 ? part : result + String(values[i - 1]) + part,
      "",
    );
  };
}

export const jaipurCopy: SkinCopy = { labels: LABEL, t: translator() };

export const hardwareCopy: SkinCopy = {
  labels: {
    diamond: "GPU",
    gold: "CPU",
    silver: "主板",
    cloth: "内存",
    spice: "SSD",
    leather: "电源",
    camel: "提货单",
  },
  t: translator(hardwareText),
};

export const hardwareModels: Partial<Record<Card, string>> = {
  diamond: "GeForce RTX 5090",
  gold: "Ryzen 9 9950X3D",
  silver: "X870E",
  cloth: "DDR5",
  spice: "NVMe SSD",
  leather: "850W",
};
