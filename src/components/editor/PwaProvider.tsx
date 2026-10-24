"use client";

import { useEffect } from "react";
import { create } from "zustand";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaState {
  canInstall: boolean;
  installed: boolean;
  promptInstall: () => Promise<boolean>;
}

export const usePwa = create<PwaState>((set) => ({
  canInstall: false,
  installed: false,
  promptInstall: async () => false,
}));

let deferredPrompt: BeforeInstallPromptEvent | null = null;

export default function PwaProvider() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((e) => {
        console.warn("[pwa] service worker register failed", e);
      });
    }

    const checkStandalone = () => {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      if (standalone) usePwa.setState({ installed: true });
    };
    checkStandalone();

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
      usePwa.setState({ canInstall: true });
    };
    const onInstalled = () => {
      deferredPrompt = null;
      usePwa.setState({ canInstall: false, installed: true });
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    usePwa.setState({
      promptInstall: async () => {
        if (!deferredPrompt) return false;
        try {
          await deferredPrompt.prompt();
          const choice = await deferredPrompt.userChoice;
          if (choice.outcome === "accepted") {
            deferredPrompt = null;
            usePwa.setState({ canInstall: false, installed: true });
            return true;
          }
          return false;
        } catch (error) {
          console.error("[pwa] install prompt failed", error);
          return false;
        }
      },
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return null;
}
