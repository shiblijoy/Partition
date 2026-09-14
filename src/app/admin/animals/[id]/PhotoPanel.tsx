"use client";

import { useActionState, useRef } from "react";
import Image from "next/image";
import type { FormState } from "./actions";
import { DeleteButton } from "./DeleteButton";

const initialState: FormState = {};

type Photo = { id: string; url: string };

export function PhotoPanel({
  photos,
  addAction,
  deleteAction,
}: {
  photos: Photo[];
  addAction: (prev: FormState, formData: FormData) => Promise<FormState>;
  deleteAction: (photoId: string) => Promise<void>;
}) {
  const [state, formAction, pending] = useActionState(addAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-stone-700">Photos</h2>
      <p className="mt-1 text-xs text-stone-500">
        The first photo is used as the cover image on the public listing.
      </p>

      {photos.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((photo, i) => (
            <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-md border border-stone-200">
              <Image src={photo.url} alt="" fill sizes="150px" className="object-cover" />
              {i === 0 && (
                <span className="absolute left-1 top-1 rounded bg-emerald-700/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  Cover
                </span>
              )}
              <DeleteButton
                action={deleteAction.bind(null, photo.id)}
                confirmText="Remove this photo?"
                className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-xs text-white opacity-0 group-hover:opacity-100"
              >
                ✕
              </DeleteButton>
            </div>
          ))}
        </div>
      )}

      <form
        ref={formRef}
        action={async (formData) => {
          await formAction(formData);
          formRef.current?.reset();
        }}
        className="mt-4 space-y-2"
      >
        <input
          type="file"
          name="photos"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          required
          className="block w-full text-sm text-stone-600 file:mr-3 file:rounded-md file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-stone-700 hover:file:bg-stone-200"
        />
        {state.error && <p className="text-sm text-red-700">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
        >
          {pending ? "Uploading…" : "Upload photo(s)"}
        </button>
      </form>
    </section>
  );
}
