"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePhone } from "@/lib/phone-store";
import { APPS, appById } from "./apps/registry";
import {
  Wallpaper,
  StatusBar,
  NavBar,
  LockScreen,
  BootScreen,
  Shade,
  Recents,
  PhoneToast,
} from "./shell";
import { HomeScreen, AppDrawer } from "./HomeScreen";

export default function PhoneRoot() {
  const booting = usePhone((s) => s.booting);
  const finishBoot = usePhone((s) => s.finishBoot);
  const locked = usePhone((s) => s.locked);
  const activeApp = usePhone((s) => s.activeApp);
  const trySilentReconnect = usePhone((s) => s.trySilentReconnect);

  /* attempt silent Drive reconnect (if a Client ID was saved before) */
  useEffect(() => {
    trySilentReconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* keyboard: Escape acts as back */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") usePhone.getState().back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ActiveApp = activeApp ? appById(activeApp)?.component : null;
  const unlocked = !booting && !locked;

  return (
    <div className="relative h-[892px] w-[412px] select-none overflow-hidden rounded-[42px] bg-black ring-1 ring-white/10">
      <Wallpaper />

      {/* punch-hole camera */}
      <div className="absolute left-1/2 top-2.5 z-[75] h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-black ring-1 ring-white/15">
        <div className="absolute inset-[3px] rounded-full bg-zinc-900" />
      </div>

      {unlocked && (
        <>
          {/* home layer */}
          <HomeScreen />

          {/* active app overlay */}
          <AnimatePresence mode="wait">
            {ActiveApp && (
              <motion.div
                key={activeApp}
                initial={{ opacity: 0, scale: 0.94, y: 24 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 24 }}
                transition={{ type: "spring", stiffness: 340, damping: 30 }}
                className="absolute inset-0 z-[35] flex flex-col bg-[#0c1210] pb-9 pt-8"
              >
                <div className="relative flex-1 overflow-hidden">
                  <ActiveApp />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AppDrawer />
          <Recents apps={APPS} />
        </>
      )}

      {/* system chrome on top */}
      {unlocked && (
        <>
          <div className="absolute inset-x-0 top-0 z-40">
            <StatusBar />
          </div>
          <div className="absolute inset-x-0 bottom-0 z-40">
            <NavBar />
          </div>
        </>
      )}

      <Shade />

      {/* lock screen */}
      <AnimatePresence>{!booting && locked && <LockScreen key="lock" />}</AnimatePresence>

      {/* brightness dimmer */}
      <BrightnessDimmer />

      {/* boot */}
      <AnimatePresence>{booting && <BootScreen key="boot" onDone={finishBoot} />}</AnimatePresence>

      <PhoneToast />
    </div>
  );
}

function BrightnessDimmer() {
  const brightness = usePhone((s) => s.brightness);
  const opacity = ((100 - brightness) / 100) * 0.55;
  return <div className="pointer-events-none absolute inset-0 z-[72] bg-black transition-opacity" style={{ opacity }} aria-hidden />;
}
