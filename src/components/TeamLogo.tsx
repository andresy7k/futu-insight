import { useState } from "react";
import { cn } from "@/lib/utils";

export function TeamLogo({
  src,
  name,
  size = 48,
}: {
  src?: string | null;
  name: string;
  size?: 48 | 72;
}) {
  const [failed, setFailed] = useState(!src);
  const dim = size;
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  if (failed || !src) {
    return (
      <div
        style={{ width: dim, height: dim }}
        className={cn(
          "flex items-center justify-center rounded-full bg-white/60 backdrop-blur-xl border border-white/70 text-[#007AFF] font-semibold",
          size === 72 ? "text-lg" : "text-sm",
        )}
      >
        {initials || "?"}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      width={dim}
      height={dim}
      onError={() => setFailed(true)}
      className="object-contain rounded-full bg-white/40 p-1"
      style={{ width: dim, height: dim }}
    />
  );
}