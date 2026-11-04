import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-2 py-24 text-center">
      <h1 className="text-xl font-semibold">We can&apos;t find that product</h1>
      <p className="text-muted">It may have been removed, or the link may be wrong.</p>
      <Link href="/products" className="mt-2 rounded-[10px] bg-fg px-4 py-2.5 font-semibold text-canvas">Back to Products</Link>
    </div>
  );
}
