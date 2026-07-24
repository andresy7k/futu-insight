export function OddsPills({
  home,
  draw,
  away,
}: {
  home?: string;
  draw?: string;
  away?: string;
}) {
  const Pill = ({
    label,
    value,
    className,
  }: {
    label: string;
    value?: string;
    className: string;
  }) => (
    <div
      className={`flex-1 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-sm flex items-center justify-between gap-2 ${className}`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value ?? "—"}</span>
    </div>
  );
  return (
    <div className="flex items-center gap-2">
      <Pill
        label="1"
        value={home}
        className="bg-[#007AFF]/15 text-[#007AFF] border border-[#007AFF]/30"
      />
      <Pill
        label="X"
        value={draw}
        className="bg-[#8E8E93]/15 text-[#636366] border border-[#8E8E93]/30"
      />
      <Pill
        label="2"
        value={away}
        className="bg-[#FF3B30]/15 text-[#FF3B30] border border-[#FF3B30]/30"
      />
    </div>
  );
}