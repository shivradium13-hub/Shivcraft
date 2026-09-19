"use client";

import Image from "next/image";
import { useState } from "react";

type GalleryImage = { id: string; url: string; alt: string | null };

export function ProductGallery({ images, name }: { images: GalleryImage[]; name: string }) {
  const [index, setIndex] = useState(0);
  const [origin, setOrigin] = useState("50% 50%");
  const [zoomed, setZoomed] = useState(false);

  if (images.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-card border border-line bg-brand-50 text-sm text-muted">
        No image yet
      </div>
    );
  }

  const active = images[Math.min(index, images.length - 1)];

  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row">
      {images.length > 1 ? (
        <div className="gc-hide-scrollbar flex shrink-0 gap-2 overflow-x-auto sm:max-h-[520px] sm:flex-col sm:overflow-y-auto">
          {images.map((image, i) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`View image ${i + 1} of ${images.length}`}
              aria-current={i === index}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                i === index ? "border-brand-500" : "border-line hover:border-brand-300"
              }`}
            >
              <Image
                src={image.url}
                alt=""
                fill
                sizes="64px"
                unoptimized={image.url.endsWith(".svg")}
                className="object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}

      <div
        className="relative aspect-square min-w-0 flex-1 overflow-hidden rounded-card border border-line bg-brand-50"
        onMouseEnter={() => setZoomed(true)}
        onMouseLeave={() => {
          setZoomed(false);
          setOrigin("50% 50%");
        }}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - box.left) / box.width) * 100;
          const y = ((e.clientY - box.top) / box.height) * 100;
          setOrigin(`${x}% ${y}%`);
        }}
      >
        <Image
          key={active.id}
          src={active.url}
          alt={active.alt ?? name}
          fill
          priority
          sizes="(min-width: 1024px) 520px, 100vw"
          unoptimized={active.url.endsWith(".svg")}
          className="object-cover transition-transform duration-200"
          style={{ transformOrigin: origin, transform: zoomed ? "scale(1.9)" : "scale(1)" }}
        />
        <span className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-ink/70 px-2.5 py-1 text-[11px] font-medium text-white sm:block">
          Hover to zoom
        </span>
      </div>
    </div>
  );
}
