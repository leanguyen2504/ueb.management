/* eslint-disable @next/next/no-img-element */
// Ảnh cá nhân; chưa có ảnh thì hiện chữ cái đầu.
const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0]!.toUpperCase()).join('');

export function Avatar({ name, url, size = 40, className = 'bg-brand-600' }: { name: string; url?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) };
  if (url) return <img src={url} alt={`Ảnh của ${name}`} style={style} className="shrink-0 rounded-full object-cover" />;
  return (
    <span style={style} className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${className}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
