"use client";

import { AnimatePresence, motion, type HTMLMotionProps } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";

export const spring = { type: "spring", stiffness: 380, damping: 30 } as const;

/** Every screen slides in/out the same way so the flow feels like one gesture. */
export function Screen({ children, dir = 1 }: { children: ReactNode; dir?: 1 | -1 }) {
  return (
    <motion.div
      className="screen"
      initial={{ x: 40 * dir, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -40 * dir, opacity: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <motion.button className="back" onClick={onClick} whileTap={{ scale: 0.86 }} aria-label="Back">
      <svg width="12" height="20" viewBox="0 0 12 20" fill="none">
        <path d="M10 2 2 10l8 8" stroke="#202422" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </motion.button>
  );
}

export function Heading({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <motion.h1
        className="title"
        initial={{ y: 14, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.h1>
      {sub && (
        <motion.p className="sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.22 }}>
          {sub}
        </motion.p>
      )}
    </div>
  );
}

export function Button({
  children,
  busy,
  ...rest
}: HTMLMotionProps<"button"> & { busy?: boolean; children: ReactNode }) {
  return (
    <motion.button className="btn" whileTap={{ scale: 0.97 }} {...rest} disabled={rest.disabled || busy}>
      <AnimatePresence mode="wait" initial={false}>
        {busy ? (
          <motion.span key="b" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ display: "inline-flex", gap: 6 }}>
            {[0, 1, 2].map((i) => (
              <motion.i
                key={i}
                style={{ width: 8, height: 8, borderRadius: 4, background: "#fff", display: "block" }}
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.12 }}
              />
            ))}
          </motion.span>
        ) : (
          <motion.span key="t" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {children}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, i) => i.offset.y > 90 && onClose()}
          >
            <div className="grabber" />
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 3800);
    return () => clearTimeout(t);
  }, [message, onDone]);
  return (
    <AnimatePresence>
      {message && (
        <motion.div className="toast" initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -60, opacity: 0 }} transition={spring} onClick={onDone}>
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Numbers that tick up/down instead of snapping. */
export function Count({ value, decimals = 2, prefix = "" }: { value: number; decimals?: number; prefix?: string }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const from = shown;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 600);
      setShown(from + (value - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <span className="num">
      {prefix}
      {shown.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  );
}

export function Confetti({ run }: { run: boolean }) {
  const colors = ["#6a5bdc", "#35b08d", "#ee6a4d", "#f4c431", "#86c9df"];
  if (!run) return null;
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 30 }}>
      {Array.from({ length: 34 }).map((_, i) => {
        const x = (i / 34) * 100 + (Math.random() * 6 - 3);
        return (
          <motion.i
            key={i}
            style={{ position: "absolute", left: `${x}%`, top: -12, width: 8, height: 12, borderRadius: 2, background: colors[i % colors.length] }}
            initial={{ y: -20, rotate: 0, opacity: 1 }}
            animate={{ y: 820, rotate: 360 * (i % 2 ? 1 : -1) * 2, opacity: [1, 1, 0] }}
            transition={{ duration: 2 + Math.random() * 1.4, delay: Math.random() * 0.5, ease: "easeIn" }}
          />
        );
      })}
    </div>
  );
}
