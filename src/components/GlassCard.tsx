import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function GlassCard({
  children,
  className,
  highlight = true,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode; highlight?: boolean }) {
  return (
    <div
      {...rest}
      className={cn(
        "relative bg-white/50 backdrop-blur-2xl border border-white/70 rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden",
        className,
      )}
    >
      {highlight && (
        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
      )}
      {children}
    </div>
  );
}