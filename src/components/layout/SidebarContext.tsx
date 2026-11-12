"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { privateStorage } from "@/lib/private-storage";

// 화면 배치 설정(사이드바 열림·고정 항목)만 다룬다. 학습 데이터는 건드리지 않는다.
const OPEN_KEY = "unilink:sidebar-open";
const PINS_KEY = "unilink:sidebar-pins";

interface SidebarState {
  /** 데스크톱: 왼쪽 목록을 펼쳐 둘지 */
  open: boolean;
  /** 모바일: 목록을 화면 위에 띄웠는지 */
  mobileOpen: boolean;
  toggle: () => void;
  setMobileOpen: (open: boolean) => void;
  pins: string[];
  togglePin: (key: string) => void;
}

const SidebarContext = createContext<SidebarState | null>(null);

function readPins(): string[] {
  try {
    const value = JSON.parse(privateStorage.getItem(PINS_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pins, setPins] = useState<string[]>([]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        setOpen(window.localStorage.getItem(OPEN_KEY) !== "false");
      } catch {
        // 기본값(열림) 유지
      }
      setPins(readPins());
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const toggle = useCallback(() => {
    // 좁은 화면에서는 목록을 위에 띄우고, 넓은 화면에서는 접었다 폈다 한다
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setMobileOpen((value) => !value);
      return;
    }
    setOpen((value) => {
      try {
        window.localStorage.setItem(OPEN_KEY, String(!value));
      } catch {
        // 저장하지 못해도 화면 동작은 유지
      }
      return !value;
    });
  }, []);

  const togglePin = useCallback((key: string) => {
    setPins((current) => {
      const next = current.includes(key) ? current.filter((item) => item !== key) : [key, ...current];
      try {
        privateStorage.setItem(PINS_KEY, JSON.stringify(next));
      } catch {
        // 저장 실패 시 이번 화면에서만 유지
      }
      return next;
    });
  }, []);

  return (
    <SidebarContext.Provider value={{ open, mobileOpen, toggle, setMobileOpen, pins, togglePin }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) throw new Error("SidebarProvider가 필요합니다.");
  return context;
}
