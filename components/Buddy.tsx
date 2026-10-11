"use client";

import { motion } from "framer-motion";
import type { Vibe } from "../lib/types";

/** The milo-style companions. Each vibe is a colour + silhouette; eyes blink and bodies bob. */
const SHAPES: Record<Vibe, { fill: string; d: string; eyeY: number; mouth: "smile" | "flat" | "wink" }> = {
  // two soft bumps, like a cloud / brain
  steady: {
    fill: "#6a5bdc",
    d: "M10 62 C2 40 18 16 42 22 C52 4 86 6 90 30 C108 40 104 70 80 78 L28 80 C16 80 12 72 10 62 Z",
    eyeY: 50,
    mouth: "smile",
  },
  // pointy star-ish blob
  sharp: {
    fill: "#35b08d",
    d: "M6 74 C14 56 20 40 32 34 C40 22 46 10 52 8 C60 14 64 26 74 34 C88 42 98 58 104 74 C80 82 30 82 6 74 Z",
    eyeY: 56,
    mouth: "flat",
  },
  // rounded triangle
  bold: {
    fill: "#ee6a4d",
    d: "M8 78 C10 60 30 40 40 22 C46 10 62 10 68 22 C80 42 102 60 104 78 C80 84 30 84 8 78 Z",
    eyeY: 58,
    mouth: "wink",
  },
  // castle-top square
  playful: {
    fill: "#f4c431",
    d: "M8 24 L28 24 L34 12 L50 24 L66 24 L72 12 L88 24 L104 24 L104 78 C104 82 100 84 96 84 L16 84 C12 84 8 82 8 78 Z",
    eyeY: 52,
    mouth: "smile",
  },
};

export function Buddy({ vibe, size = 96, wave = false, delay = 0 }: { vibe: Vibe; size?: number; wave?: boolean; delay?: number }) {
  const s = SHAPES[vibe];
  return (
    <motion.svg
      width={size}
      height={(size * 100) / 112}
      viewBox="0 0 112 100"
      initial={{ y: 0, scale: 0.6, opacity: 0 }}
      animate={{ y: [0, -5, 0], scale: 1, opacity: 1 }}
      transition={{
        y: { duration: 2.8 + delay, repeat: Infinity, ease: "easeInOut", delay },
        scale: { type: "spring", stiffness: 260, damping: 14, delay: delay * 0.4 },
        opacity: { duration: 0.2, delay: delay * 0.4 },
      }}
      aria-hidden
    >
      {wave && (
        <>
          <motion.path
            d="M12 52 C0 48 -2 36 6 30"
            stroke="#202422"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
            animate={{ rotate: [0, -14, 6, -14, 0] }}
            style={{ originX: "12px", originY: "52px" }}
            transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 1.2 }}
          />
          <motion.path
            d="M100 52 C112 48 114 36 106 30"
            stroke="#202422"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
            animate={{ rotate: [0, 14, -6, 14, 0] }}
            style={{ originX: "100px", originY: "52px" }}
            transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 1.2, delay: 0.2 }}
          />
        </>
      )}
      <path d={s.d} fill={s.fill} />
      {[40, 70].map((cx) => (
        <g key={cx}>
          <ellipse cx={cx} cy={s.eyeY} rx="11" ry="12" fill="#fff" />
          <motion.ellipse
            cx={cx + 1}
            cy={s.eyeY + 1}
            rx="5.5"
            ry="6.5"
            fill="#202422"
            animate={{ scaleY: [1, 1, 0.1, 1, 1], x: [0, 0, 0, 1.5, 0] }}
            transition={{ duration: 4.2, repeat: Infinity, times: [0, 0.46, 0.5, 0.54, 1], delay }}
            style={{ originY: `${s.eyeY + 1}px` }}
          />
          <circle cx={cx + 3} cy={s.eyeY - 2} r="1.6" fill="#fff" />
        </g>
      ))}
      {s.mouth === "smile" && <path d={`M46 ${s.eyeY + 20} Q55 ${s.eyeY + 28} 64 ${s.eyeY + 20}`} stroke="#202422" strokeWidth="3" strokeLinecap="round" fill="none" />}
      {s.mouth === "flat" && <path d={`M48 ${s.eyeY + 22} L62 ${s.eyeY + 22}`} stroke="#202422" strokeWidth="3" strokeLinecap="round" />}
      {s.mouth === "wink" && <path d={`M46 ${s.eyeY + 21} Q55 ${s.eyeY + 29} 64 ${s.eyeY + 19}`} stroke="#202422" strokeWidth="3" strokeLinecap="round" fill="none" />}
      <path d="M40 84 L38 98 M72 84 L74 98" stroke="#202422" strokeWidth="3" strokeLinecap="round" />
    </motion.svg>
  );
}

export const VIBE_BG: Record<Vibe, string> = {
  steady: "var(--purple-soft)",
  sharp: "var(--green-soft)",
  bold: "var(--coral-soft)",
  playful: "var(--yellow-soft)",
};
export const VIBE_LABEL: Record<Vibe, string> = { steady: "Steady", sharp: "Sharp", bold: "Bold", playful: "Playful" };
