"use client";

import { AnimatePresence, motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../lib/store";
import { defaultPolicy } from "../lib/engine";
import type { Goal, Trader, Vibe } from "../lib/types";
import { Buddy, VIBE_BG, VIBE_LABEL } from "./Buddy";
import { BackButton, Button, Confetti, Heading, Screen, Sheet } from "./ui";

/* ====================================================================== 1 · Welcome */

const NOTES = [
  { t: "More walks.\nLess charts.", c: "#fff1b8", x: -18, y: 54, r: -6, w: 150 },
  { t: "Copied\nthat trade.", c: "#f6f6f3", x: 262, y: 118, r: 5, w: 140 },
  { t: "tiny bet,\nbig calm", c: "#e3dcff", x: -14, y: 372, r: -5, w: 130 },
  { t: "slow day,\nstill steady", c: "#fbe2d8", x: 286, y: 404, r: 7, w: 130 },
];

export function Welcome() {
  const { go, signInExisting, createAccount, busy } = useApp();
  const [sheet, setSheet] = useState(false);

  return (
    <Screen>
      <div className="glow" />
      {NOTES.map((n, i) => (
        <motion.div
          key={i}
          className="sticky"
          style={{ left: n.x, top: n.y, width: n.w, background: n.c, whiteSpace: "pre-line" }}
          initial={{ opacity: 0, scale: 0.6, rotate: n.r - 12, y: 30 }}
          animate={{ opacity: 1, scale: 1, rotate: [n.r, n.r + 2.5, n.r], y: [0, -7, 0] }}
          transition={{
            opacity: { delay: 0.2 + i * 0.12 },
            scale: { type: "spring", stiffness: 220, damping: 14, delay: 0.2 + i * 0.12 },
            rotate: { duration: 5 + i, repeat: Infinity, ease: "easeInOut" },
            y: { duration: 4 + i * 0.7, repeat: Infinity, ease: "easeInOut", delay: i * 0.3 },
          }}
        >
          {n.t}
        </motion.div>
      ))}

      <div style={{ textAlign: "center", fontWeight: 800, fontSize: 21, letterSpacing: "-0.03em", zIndex: 1 }}>coattail</div>

      <div style={{ flex: 1, display: "grid", alignContent: "center", justifyItems: "center", gap: 6, zIndex: 1 }}>
        <motion.h1
          className="title"
          style={{ fontSize: 31, lineHeight: 1.12 }}
          initial={{ y: 22, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          Trade like the best.
          <br />
          Without being
          <br />
          glued to charts.
        </motion.h1>
        <svg width="150" height="130" viewBox="0 0 150 130" style={{ marginTop: 26 }}>
          <motion.path
            d="M40 8 C 10 20, 30 52, 62 44 C 90 36, 84 6, 66 22 C 54 34, 72 60, 108 54"
            stroke="#8b8f8c"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 1.0, duration: 1.4, ease: "easeInOut" }}
          />
          <motion.path
            d="M96 78 C 100 96, 104 108, 106 118 M92 108 L106 120 L118 106"
            stroke="#8b8f8c"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 2.1, duration: 0.8 }}
          />
        </svg>
      </div>

      <div style={{ zIndex: 1 }}>
        <Button onClick={() => setSheet(true)}>Get started</Button>
        <p className="fine">
          Already have an account?{" "}
          <button onClick={() => void signInExisting()} disabled={busy === "connect"}>
            {busy === "connect" ? "Opening Face ID…" : "Sign in"}
          </button>
        </p>
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)}>
        <div style={{ display: "grid", gap: 14 }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", textAlign: "center" }}>Connect your wallet</h2>
          <p className="sub" style={{ marginTop: -4 }}>
            No seed phrase. No extension. Your Face ID <em>is</em> the wallet.
          </p>
          <div className="card" style={{ padding: 16, display: "grid", gap: 10, fontSize: 14.5, fontWeight: 500, color: "var(--ink-2)" }}>
            {["One tap creates a passkey wallet on Monad", "It lives in iCloud Keychain, so any of your devices can open it", "We never see or store a key"].map((l, i) => (
              <motion.div key={l} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.08 }} style={{ display: "flex", gap: 10 }}>
                <span style={{ color: "var(--green)", fontWeight: 800 }}>✓</span>
                {l}
              </motion.div>
            ))}
          </div>
          <Button
            busy={busy === "connect"}
            onClick={async () => {
              const ok = await createAccount();
              if (ok) {
                setSheet(false);
                go("goals");
              }
            }}
          >
            Continue with Face ID
          </Button>
        </div>
      </Sheet>
    </Screen>
  );
}

/* ====================================================================== 2 · Goals */

const GOALS: { id: Goal; label: string; vibe: Vibe }[] = [
  { id: "steady", label: "Steady growth", vibe: "steady" },
  { id: "bigmoves", label: "Catch big moves", vibe: "bold" },
  { id: "learn", label: "Learn from the pros", vibe: "sharp" },
  { id: "small", label: "Start really small", vibe: "playful" },
];

export function Goals() {
  const { goals, setGoals, go, restoreSpace, busy } = useApp();
  const [picked, setPicked] = useState<Goal[]>(goals);
  const toggle = (g: Goal) => setPicked((p) => (p.includes(g) ? p.filter((x) => x !== g) : p.length >= 3 ? p : [...p, g]));

  return (
    <Screen>
      <BackButton onClick={() => go("welcome")} />
      <div style={{ marginTop: 18 }}>
        <Heading>What do you want from your money?</Heading>
      </div>
      <div style={{ display: "grid", gap: 12, marginTop: 34 }}>
        {GOALS.map((g, i) => {
          const on = picked.includes(g.id);
          return (
            <motion.button
              key={g.id}
              className="row"
              onClick={() => toggle(g.id)}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0, background: on ? VIBE_BG[g.vibe] : "#f4f4f5" }}
              transition={{ delay: 0.12 + i * 0.07, type: "spring", stiffness: 300, damping: 24 }}
              whileTap={{ scale: 0.97 }}
              style={{ overflow: "hidden", position: "relative" }}
            >
              <span>{g.label}</span>
              <span style={{ marginRight: -6, marginTop: 14 }}>
                <Buddy vibe={g.vibe} size={64} delay={i * 0.25} />
              </span>
              <AnimatePresence>
                {on && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    style={{ position: "absolute", right: 12, top: 8, width: 22, height: 22, borderRadius: 11, background: "var(--ink)", color: "#fff", display: "grid", placeItems: "center", fontSize: 12 }}
                  >
                    ✓
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>
      <div style={{ flex: 1 }} />
      <Button
        disabled={picked.length === 0}
        onClick={() => {
          setGoals(picked);
          go("trader");
        }}
      >
        Continue
      </Button>
      <p className="fine">
        Choose up to three. Change these anytime.
        <br />
        <button onClick={() => void restoreSpace()} disabled={busy === "vault"}>
          {busy === "vault" ? "Unlocking…" : "Been here before? Restore my space"}
        </button>
      </p>
    </Screen>
  );
}

/* ====================================================================== 3 · Pick a trader */

const GOAL_VIBE: Record<Goal, Vibe[]> = {
  steady: ["steady"],
  bigmoves: ["bold", "sharp"],
  learn: ["sharp", "steady"],
  small: ["steady", "playful"],
};

export function rank(traders: Trader[], goals: Goal[]) {
  const want = goals.flatMap((g) => GOAL_VIBE[g]);
  const score = (t: Trader) => (want.includes(t.vibe) ? 2 : 0) + t.stats.profitFactor * 0.3 - t.stats.maxDrawdown;
  return [...traders].sort((a, b) => score(b) - score(a));
}

export function TraderStats({ t }: { t: Trader }) {
  const cells: [string, string][] = [
    ["Win rate", `${Math.round(t.stats.winRate * 100)}%`],
    ["Worst dip", `-${Math.round(t.stats.maxDrawdown * 100)}%`],
    ["Typical", `${t.stats.avgLeverage}x`],
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
      {cells.map(([k, v]) => (
        <div key={k} style={{ background: "rgba(255,255,255,.7)", borderRadius: 14, padding: "8px 4px", textAlign: "center" }}>
          <div className="num" style={{ fontWeight: 800, fontSize: 17 }}>
            {v}
          </div>
          <div className="eyebrow" style={{ fontSize: 9.5 }}>
            {k}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AiRead({ t }: { t: Trader }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setText(null);
    fetch("/api/explain", {
      method: "POST",
      body: JSON.stringify({ kind: "trader", trader: { name: t.name, ...t.stats } }),
    })
      .then((r) => r.json())
      .then((j) => alive && setText(j.text))
      .catch(() => alive && setText(null));
    return () => {
      alive = false;
    };
  }, [t]);
  return text ? (
    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ fontSize: 13, color: "var(--ink-2)", fontWeight: 500, lineHeight: 1.35, textAlign: "center" }}>
      {text}
    </motion.p>
  ) : (
    <div className="skeleton" style={{ height: 34 }} />
  );
}

export function TraderPick() {
  const { traders, goals, select, go, tradersLive, selected } = useApp();
  const list = useMemo(() => rank(traders, goals), [traders, goals]);
  const [idx, setIdx] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const t = list[idx] ?? list[0];

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => setIdx(Math.round(el.scrollLeft / (el.clientWidth * 0.8 + 12)));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <Screen>
      <BackButton onClick={() => go("goals")} />
      <div style={{ marginTop: 10 }}>
        <Heading>Who matches your vibe?</Heading>
      </div>

      <div
        ref={scroller}
        style={{ display: "flex", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory", margin: "22px -22px 0", padding: "0 10%", scrollbarWidth: "none" }}
      >
        {list.map((c, i) => (
          <motion.div
            key={c.address}
            animate={{ scale: i === idx ? 1 : 0.92, opacity: i === idx ? 1 : 0.55 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            style={{ flex: "0 0 80%", scrollSnapAlign: "center", background: VIBE_BG[c.vibe], borderRadius: 32, padding: "18px 16px 16px", display: "grid", gap: 12, justifyItems: "center" }}
          >
            <Buddy vibe={c.vibe} size={118} wave delay={i * 0.2} />
            <span className="chip">{VIBE_LABEL[c.vibe]}</span>
            <p style={{ textAlign: "center", fontWeight: 600, fontSize: 18, lineHeight: 1.25, letterSpacing: "-0.015em", minHeight: 68 }}>{c.quote}</p>
            <TraderStats t={c} />
          </motion.div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {t && (
          <motion.div key={t.address} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} style={{ textAlign: "center", marginTop: 14, display: "grid", gap: 4 }}>
            <div style={{ fontWeight: 800, fontSize: 24, letterSpacing: "-0.03em", display: "flex", gap: 8, justifyContent: "center", alignItems: "center" }}>
              {t.name}
              {t.stats.smartMoney && <span className="chip" style={{ background: "var(--ink)", color: "#fff" }}>Smart money</span>}
              {t.source === "demo" && <span className="chip" style={{ background: "var(--card)", color: "var(--ink-3)" }}>Demo</span>}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-3)", fontWeight: 500 }}>{t.tagline}</div>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ display: "flex", gap: 7, justifyContent: "center", margin: "12px 0 8px" }}>
        {list.map((_, i) => (
          <motion.i key={i} animate={{ width: i === idx ? 22 : 6, background: i === idx ? "#ee6a4d" : "#d4d6d5" }} style={{ height: 6, borderRadius: 3, display: "block" }} />
        ))}
      </div>

      <div style={{ flex: 1 }}>{t && <AiRead t={t} />}</div>

      <Button
        onClick={() => {
          if (!t) return;
          select(t);
          go("limits");
        }}
      >
        {t ? `Copy ${t.name}` : "Pick a trader"}
      </Button>
      <p className="fine">
        {tradersLive ? "Live from Perpl, indexed by Envio." : "Demo traders until the live index is connected."} {selected ? "" : "Switch anytime."}
      </p>
    </Screen>
  );
}

/* ====================================================================== 4 · Limits dial */

export function Dial({ value, onChange, min = 5, max = 100, step = 5 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const frac = (value - min) / (max - min);
  const prog = useMotionValue(frac);
  useEffect(() => {
    const c = animate(prog, frac, { type: "spring", stiffness: 260, damping: 26 });
    return () => c.stop();
  }, [frac, prog]);
  const R = 82;
  const C = 2 * Math.PI * R;
  const dash = useTransform(prog, (p) => `${p * C} ${C}`);
  const ang = useTransform(prog, (p) => p * 360 - 90);
  const kx = useTransform(ang, (a) => 120 + R * Math.cos((a * Math.PI) / 180));
  const ky = useTransform(ang, (a) => 120 + R * Math.sin((a * Math.PI) / 180));

  const set = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const a = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) + Math.PI / 2;
    const f = ((a + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI);
    const v = Math.round((min + f * (max - min)) / step) * step;
    onChange(Math.min(max, Math.max(min, v)));
  };

  return (
    <svg
      ref={ref}
      width="240"
      height="240"
      viewBox="0 0 240 240"
      style={{ touchAction: "none", display: "block", margin: "0 auto" }}
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        set(e);
      }}
      onPointerMove={(e) => e.buttons === 1 && set(e)}
    >
      {Array.from({ length: 60 }).map((_, i) => {
        const a = (i / 60) * 2 * Math.PI;
        const big = i % 5 === 0;
        const r1 = 112, r2 = big ? 102 : 107;
        return <line key={i} x1={120 + r1 * Math.sin(a)} y1={120 - r1 * Math.cos(a)} x2={120 + r2 * Math.sin(a)} y2={120 - r2 * Math.cos(a)} stroke={big ? "#202422" : "#cfd2d0"} strokeWidth={big ? 2.4 : 1.2} strokeLinecap="round" />;
      })}
      <circle cx="120" cy="120" r={R} fill="none" stroke="#eceeed" strokeWidth="30" />
      <motion.circle cx="120" cy="120" r={R} fill="none" stroke="#86c9df" strokeWidth="30" strokeDasharray={dash} transform="rotate(-90 120 120)" />
      <motion.circle cx={kx} cy={ky} r="11" fill="#202422" stroke="#fff" strokeWidth="3" />
      <circle cx="120" cy="120" r="56" fill="#fff" />
      <text x="120" y="130" textAnchor="middle" style={{ font: "800 46px var(--font)", letterSpacing: "-0.04em" }} fill="#202422">
        ${value}
      </text>
      <text x="120" y="152" textAnchor="middle" style={{ font: "800 9.5px var(--font)", letterSpacing: ".12em" }} fill="#9a9f9c">
        MAX / TRADE
      </text>
    </svg>
  );
}

function Chips<T extends string | number>({ options, value, onChange, fmt }: { options: T[]; value: T; onChange: (v: T) => void; fmt: (v: T) => string }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {options.map((o) => (
        <motion.button
          key={String(o)}
          onClick={() => onChange(o)}
          whileTap={{ scale: 0.93 }}
          animate={{ background: o === value ? "#202422" : "#f4f4f5", color: o === value ? "#fff" : "#202422" }}
          style={{ flex: 1, height: 40, borderRadius: 20, fontWeight: 700, fontSize: 14 }}
        >
          {fmt(o)}
        </motion.button>
      ))}
    </div>
  );
}

export function PolicyForm({ draft, setDraft }: { draft: ReturnType<typeof defaultPolicy>; setDraft: (p: ReturnType<typeof defaultPolicy>) => void }) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Dial value={draft.maxPerTradeUsd} onChange={(v) => setDraft({ ...draft, maxPerTradeUsd: v })} />
      <div className="card" style={{ padding: "12px 14px", display: "grid", gap: 8 }}>
        <div className="eyebrow">Never more than</div>
        <Chips options={[1, 2, 3, 5, 10]} value={draft.maxLeverage} onChange={(v) => setDraft({ ...draft, maxLeverage: v })} fmt={(v) => `${v}x`} />
      </div>
      <div className="card" style={{ padding: "12px 14px", display: "grid", gap: 8 }}>
        <div className="eyebrow">Pause if I&apos;m down</div>
        <Chips options={[5, 10, 20]} value={draft.stopLossPct} onChange={(v) => setDraft({ ...draft, stopLossPct: v })} fmt={(v) => `${v}%`} />
      </div>
      <div className="card" style={{ padding: "12px 14px", display: "grid", gap: 8 }}>
        <div className="eyebrow">Autopilot window</div>
        <Chips options={[15, 30, 60, 120]} value={draft.sessionMinutes} onChange={(v) => setDraft({ ...draft, sessionMinutes: v })} fmt={(v) => (v < 60 ? `${v}m` : `${v / 60}h`)} />
      </div>
    </div>
  );
}

export function Limits() {
  const { selected, policy, setPolicy, go } = useApp();
  const [draft, setDraft] = useState(() => policy ?? defaultPolicy(selected!.address));
  return (
    <Screen>
      <BackButton onClick={() => go("trader")} />
      <div style={{ marginTop: 6 }}>
        <Heading sub="Coattail never goes past these. After the window ends, it asks for Face ID again.">
          Small Stakes
          <br />
          Big Calm
        </Heading>
      </div>
      <div className="scroll" style={{ marginTop: 14, paddingBottom: 6 }}>
        <PolicyForm draft={draft} setDraft={setDraft} />
      </div>
      <div style={{ paddingTop: 12 }}>
        <Button
          onClick={() => {
            setPolicy({ ...draft, traderAddress: selected!.address });
            go("note");
          }}
        >
          Set my limits
        </Button>
        <p className="fine">
          <button onClick={() => { setPolicy({ ...draft, traderAddress: selected!.address }); go("note"); }}>Use the defaults</button>
        </p>
      </div>
    </Screen>
  );
}

/* ====================================================================== 5 · A private thought (PRF vault) */

export function NoteScreen() {
  const { selected, saveNote, busy, go } = useApp();
  const [text, setText] = useState("");
  return (
    <Screen>
      <BackButton onClick={() => go("limits")} />
      <div style={{ marginTop: 6 }}>
        <Heading sub="There's no right place to start.">
          Let&apos;s Start
          <br />
          With You
        </Heading>
      </div>
      <div style={{ flex: 1, marginTop: 18, background: "var(--card)", borderRadius: 34, padding: "18px 14px 14px", display: "grid", alignContent: "start", justifyItems: "center", gap: 8, position: "relative" }}>
        <button className="chip" style={{ position: "absolute", right: 14, top: 14, background: "var(--purple-soft)", color: "var(--purple)" }} onClick={() => go("stamp")}>
          Skip
        </button>
        <div style={{ background: "#fff", borderRadius: "50%", width: 150, height: 150, display: "grid", placeItems: "center" }}>
          <Buddy vibe="steady" size={110} wave />
        </div>
        <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em", marginTop: 4 }}>Why {selected?.name ?? "this trader"}?</div>
        <div style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500, textAlign: "center" }}>A note to future you. Locked with your passkey. Only you can read it.</div>
        <div style={{ background: "#fff", borderRadius: 22, padding: "12px 16px", width: "100%", marginTop: 6 }}>
          <div className="eyebrow" style={{ fontSize: 9.5 }}>Your thought</div>
          <textarea className="field" placeholder="Write a thought…" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="num" style={{ textAlign: "right", fontSize: 11, color: "var(--ink-3)", fontWeight: 600 }}>
            {text.length} / 500
          </div>
        </div>
      </div>
      <div style={{ paddingTop: 14 }}>
        <Button
          disabled={!text.trim()}
          busy={busy === "vault"}
          onClick={async () => {
            if (await saveNote(text)) go("stamp");
          }}
        >
          Save my thought
        </Button>
        <p className="fine">Encrypted on this device before it goes anywhere.</p>
      </div>
    </Screen>
  );
}

/* ====================================================================== 6 · First stamp */

export function Stamp({ id = "first-pick", label = "FIRST WORD", n = "001" }: { id?: string; label?: string; n?: string }) {
  const { go, selected } = useApp();
  const [boom, setBoom] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setBoom(true), 700);
    return () => clearTimeout(t);
  }, []);
  void id;
  return (
    <Screen>
      <Confetti run={boom} />
      <div style={{ height: 28 }} />
      <Heading sub={`You picked ${selected?.name ?? "a trader"} and set your limits.`}>A Good Start</Heading>
      <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
        <motion.div
          initial={{ scale: 2.4, rotate: -24, opacity: 0, y: -40 }}
          animate={{ scale: 1, rotate: -3, opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 160, damping: 11, delay: 0.25 }}
          whileHover={{ rotate: 2 }}
        >
          <StampArt label={label} n={n} />
        </motion.div>
      </div>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: "-0.02em" }}>Your first stamp</div>
        <div className="sub" style={{ marginTop: 6 }}>
          Little moments, worth keeping.
          <br />
          Your collection grows as you do.
        </div>
      </div>
      <Button onClick={() => go("home")}>Open my space</Button>
      <p className="fine">A small start counts.</p>
    </Screen>
  );
}

export function StampArt({ label, n, size = 218 }: { label: string; n: string; size?: number }) {
  return (
    <svg width={size} height={size * 1.12} viewBox="0 0 218 244" style={{ filter: "drop-shadow(0 10px 18px rgba(0,0,0,.12))" }}>
      <defs>
        <mask id={`perf-${n}`}>
          <rect width="218" height="244" fill="#fff" />
          {Array.from({ length: 12 }).map((_, i) => (
            <g key={i}>
              <circle cx={9 + i * 18.3} cy="0" r="5.5" fill="#000" />
              <circle cx={9 + i * 18.3} cy="244" r="5.5" fill="#000" />
            </g>
          ))}
          {Array.from({ length: 13 }).map((_, i) => (
            <g key={i}>
              <circle cx="0" cy={9 + i * 18.4} r="5.5" fill="#000" />
              <circle cx="218" cy={9 + i * 18.4} r="5.5" fill="#000" />
            </g>
          ))}
        </mask>
      </defs>
      <rect width="218" height="244" fill="#fbdccf" mask={`url(#perf-${n})`} />
      <rect x="18" y="18" width="182" height="190" fill="#e8613a" />
      <text x="30" y="38" style={{ font: "800 8px var(--font)", letterSpacing: ".1em" }} fill="#fff" opacity=".9">
        COATTAIL / FIRST EDITION
      </text>
      <motion.path
        d="M72 150 C46 130 56 86 94 84 C128 82 142 114 124 138 C112 154 92 148 96 130 C98 118 112 116 116 124"
        stroke="#fbe3a6"
        strokeWidth="17"
        fill="none"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.7, duration: 1.2, ease: "easeInOut" }}
      />
      <text x="28" y="224" style={{ font: "700 12px var(--font)", letterSpacing: ".04em" }} fill="#202422">
        {label}
      </text>
      <text x="190" y="224" textAnchor="end" style={{ font: "700 11px var(--font)" }} fill="#202422">
        {n}
      </text>
    </svg>
  );
}
