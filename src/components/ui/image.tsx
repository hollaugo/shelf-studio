import NextImage from "next/image";

/** Storage images in a sized box. Marketplace-quality files are large, so the browser gets an optimised copy. */
export function Img({ src, alt, className = "", contain, sizes = "400px", priority }: { src: string; alt: string; className?: string; contain?: boolean; sizes?: string; priority?: boolean }) {
  return (
    <span className={`${className.includes("absolute") ? "" : "relative"} block overflow-hidden ${className}`}>
      <NextImage src={src} alt={alt} fill sizes={sizes} priority={priority} className={contain ? "object-contain" : "object-cover"} />
    </span>
  );
}
