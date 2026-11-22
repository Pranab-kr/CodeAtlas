"use client";

import { useEffect, useState } from "react";

const LEAD_WORDS = "The shape of a codebase, drawn from the".split(" ");
const CYCLING_WORDS = [
  "source.",
  "imports.",
  "modules.",
  "routes.",
  "exports.",
  "commits.",
] as const;

const CYCLE_INTERVAL_MS = 2600;
const EXIT_DURATION_MS = 400;

/**
 * The headline lifts in word by word, then the closing highlighted term cycles
 * through what CodeAtlas statically extracts using a soft blur-fade swap.
 * Stops cleanly under prefers-reduced-motion.
 */
export function HeroHeadline() {
  const [cycle, setCycle] = useState<{
    active: number;
    exiting: number | null;
    tick: number;
  }>({
    active: 0,
    exiting: null,
    tick: 0,
  });

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) {
      return;
    }

    let clearExitTimer: ReturnType<typeof setTimeout> | null = null;
    const interval = setInterval(() => {
      if (document.hidden) {
        return;
      }
      setCycle((prev) => ({
        active: (prev.active + 1) % CYCLING_WORDS.length,
        exiting: prev.active,
        tick: prev.tick + 1,
      }));
      if (clearExitTimer) {
        clearTimeout(clearExitTimer);
      }
      clearExitTimer = setTimeout(() => {
        setCycle((prev) => ({ ...prev, exiting: null }));
      }, EXIT_DURATION_MS);
    }, CYCLE_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      if (clearExitTimer) {
        clearTimeout(clearExitTimer);
      }
    };
  }, []);

  return (
    <h1
      aria-label="The shape of a codebase, drawn from the source."
      className="max-w-[18ch] text-[clamp(2.55rem,5.2vw,4.45rem)] leading-[1.01] font-medium tracking-[-0.048em] text-balance"
    >
      {LEAD_WORDS.map((word, index) => (
        <span key={`${word}-${index}`}>
          <span
            aria-hidden="true"
            className="atlas-word"
            style={{ animationDelay: `${60 + index * 34}ms` }}
          >
            {word}
          </span>{" "}
        </span>
      ))}
      <span
        className="atlas-word"
        style={{ animationDelay: `${60 + LEAD_WORDS.length * 34}ms` }}
      >
        <span className="atlas-highlight relative inline-block align-baseline whitespace-nowrap">
          {cycle.exiting !== null && (
            <span
              key={`out-${cycle.tick}-${cycle.exiting}`}
              aria-hidden="true"
              className="atlas-blur-out pointer-events-none absolute inset-x-[0.08em] top-0 text-center select-none"
            >
              {CYCLING_WORDS[cycle.exiting]}
            </span>
          )}
          <span
            key={`in-${cycle.tick}-${cycle.active}`}
            aria-hidden="true"
            className={cycle.tick > 0 ? "atlas-blur-in" : undefined}
          >
            {CYCLING_WORDS[cycle.active]}
          </span>
        </span>
      </span>
    </h1>
  );
}

