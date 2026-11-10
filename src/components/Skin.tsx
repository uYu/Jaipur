import { createContext, useContext, useLayoutEffect, useState } from "react";
import type { ReactNode } from "react";
import { Repeat2 } from "lucide-react";
import { hardwareCopy, jaipurCopy } from "../game/skin-copy.ts";
import type { Skin, SkinCopy } from "../game/skin-copy.ts";

const storageKey = "jaipur.skin.v1";
const titles: Record<Skin, string> = {
  jaipur: "斋普尔",
  hardware: hardwareCopy.t("斋普尔"),
};
const SkinContext = createContext<
  SkinCopy & {
    skin: Skin;
    toggleSkin: () => void;
  }
>({ ...jaipurCopy, skin: "jaipur", toggleSkin: () => {} });

export function SkinProvider({ children }: { children: ReactNode }) {
  const [skin, setSkin] = useState<Skin>(() => {
    try {
      return localStorage.getItem(storageKey) === "hardware"
        ? "hardware"
        : "jaipur";
    } catch {
      return "jaipur";
    }
  });
  const copy = skin === "hardware" ? hardwareCopy : jaipurCopy;
  useLayoutEffect(() => {
    document.documentElement.dataset.skin = skin;
    document.title = titles[skin];
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", skin === "hardware" ? "#182c42" : "#f7f4ed");
    try {
      localStorage.setItem(storageKey, skin);
    } catch {
      // The selected theme still applies for this session.
    }
  }, [skin]);
  return (
    <SkinContext.Provider
      value={{
        ...copy,
        skin,
        toggleSkin: () =>
          setSkin((previous) =>
            previous === "jaipur" ? "hardware" : "jaipur",
          ),
      }}
    >
      {children}
    </SkinContext.Provider>
  );
}

export function useSkin() {
  return useContext(SkinContext);
}

export function SkinSwitch() {
  const { skin, toggleSkin } = useSkin();
  const target = titles[skin === "hardware" ? "jaipur" : "hardware"];
  const label = `切换到${target}主题`;
  return (
    <button
      type="button"
      className="skin-switch"
      title={label}
      aria-label={label}
      onClick={toggleSkin}
    >
      <Repeat2 size={14} aria-hidden="true" />
      <span>换主题</span>
    </button>
  );
}
