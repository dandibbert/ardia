import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { cn } from "@/lib/utils";

type TextElement = "p" | "span" | "h1" | "h2" | "h3";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const TICK = 30;
const STAGGER = 1.4;

const glyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]!;

type Cell = { char: string; locked: boolean };

const settled = (text: string): Cell[] => text.split("").map((char) => ({ char, locked: true }));

export default function ScrambleText({
  children: text,
  as: Tag = "span",
  className,
  playOnMount = false,
}: {
  children: string;
  as?: TextElement;
  className?: string;
  playOnMount?: boolean;
}) {
  const running = useRef<ReturnType<typeof setInterval> | null>(null);
  const [cells, setCells] = useState<Cell[]>(() => settled(text));

  const play = useCallback(
    (fromLeft: boolean) => {
      if (running.current !== null || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      let tick = 0;
      const len = text.length;
      const timer = setInterval(() => {
        tick++;
        setCells(
          text.split("").map((c, i) => {
            if (c === " ") return { char: " ", locked: true };
            const order = fromLeft ? i : len - 1 - i;
            return tick >= Math.floor(order * STAGGER) + 2 ? { char: c, locked: true } : { char: glyph(), locked: false };
          }),
        );
        if (tick >= Math.floor((len - 1) * STAGGER) + 5) {
          clearInterval(timer);
          running.current = null;
          setCells(settled(text));
        }
      }, TICK);
      running.current = timer;
    },
    [text],
  );

  useEffect(() => {
    setCells(settled(text));
    if (playOnMount) play(true);
    return () => {
      if (running.current !== null) clearInterval(running.current);
      running.current = null;
    };
  }, [text, playOnMount, play]);

  return (
    <Tag
      aria-label={text}
      className={cn("relative cursor-default", className)}
      onMouseEnter={(e: MouseEvent<HTMLElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        play(e.clientX - rect.left < rect.width / 2);
      }}
    >
      {cells.map((cell, i) => (
        <motion.span
          key={i}
          aria-hidden
          animate={{ y: cell.locked ? 0 : 4, scaleY: cell.locked ? 1 : 0.85, opacity: cell.locked ? 1 : 0.35 }}
          transition={{
            y: { type: "spring", stiffness: 500, damping: 20 },
            scaleY: { type: "spring", stiffness: 600, damping: 24 },
            opacity: { type: "spring", stiffness: 400, damping: 28 },
          }}
          className="inline-block"
          style={{ transformOrigin: "center bottom" }}
        >
          {cell.char === " " ? " " : cell.char}
        </motion.span>
      ))}
    </Tag>
  );
}
