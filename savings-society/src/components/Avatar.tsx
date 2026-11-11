const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

/** A member's profile picture, or their initials when they haven't added one. */
export function Avatar({ name, path, size = 44, className = "" }: { name: string; path?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.34) };
  if (path) {
    // eslint-disable-next-line @next/next/no-img-element -- private file behind the session-checked /files route
    return <img src={`/files/${path}`} alt="" width={size} height={size} style={style} className={`shrink-0 rounded-full object-cover ${className}`} />;
  }
  return (
    <span style={style} className={`flex shrink-0 items-center justify-center rounded-full bg-brand font-bold text-white ${className}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
