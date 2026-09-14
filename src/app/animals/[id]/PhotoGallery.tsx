"use client";

import { useState } from "react";
import Image from "next/image";

export function PhotoGallery({
  photos,
  fallbackEmoji,
  alt,
}: {
  photos: { id: string; url: string }[];
  fallbackEmoji: string;
  alt: string;
}) {
  const [selected, setSelected] = useState(0);

  if (photos.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-xl bg-stone-100 text-7xl">
        {fallbackEmoji}
      </div>
    );
  }

  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-xl bg-stone-100">
        <Image src={photos[selected].url} alt={alt} fill sizes="(min-width: 640px) 50vw, 100vw" className="object-cover" priority />
      </div>
      {photos.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              onClick={() => setSelected(i)}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 ${
                i === selected ? "border-emerald-600" : "border-transparent"
              }`}
            >
              <Image src={photo.url} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
