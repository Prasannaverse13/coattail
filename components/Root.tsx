"use client";

import { AnimatePresence } from "framer-motion";
import { AppProvider, useApp } from "../lib/store";
import { Home } from "./Home";
import { Goals, Limits, NoteScreen, Stamp, TraderPick, Welcome } from "./Onboarding";
import { Toast } from "./ui";

function Router() {
  const { ready, stage, address, selected, toast, setToast } = useApp();
  if (!ready) return null;

  // Guard: deep stages need a wallet (and a trader for limits/note).
  let s = stage;
  if (!address && s !== "welcome") s = "welcome";
  if ((s === "limits" || s === "note") && !selected) s = "trader";

  return (
    <div className="stage">
      <div className="phone">
        <AnimatePresence mode="popLayout" initial={false}>
          {s === "welcome" && <Welcome key="welcome" />}
          {s === "goals" && <Goals key="goals" />}
          {s === "trader" && <TraderPick key="trader" />}
          {s === "limits" && <Limits key="limits" />}
          {s === "note" && <NoteScreen key="note" />}
          {s === "stamp" && <Stamp key="stamp" />}
          {s === "home" && <Home key="home" />}
        </AnimatePresence>
        <Toast message={toast} onDone={() => setToast(null)} />
      </div>
    </div>
  );
}

export default function Root() {
  return (
    <AppProvider>
      <Router />
    </AppProvider>
  );
}
