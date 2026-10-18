import type { LocalRect } from './MarkLayer';

/** Contorno del elemento del borrador (focus) y de la nota enfocada (danger). */
export function Highlights({
  draft,
  focus,
}: {
  draft: LocalRect | null;
  focus: LocalRect | null;
}) {
  return (
    <>
      {draft && (
        <div
          className="pointer-events-none absolute rounded-sm outline outline-2 outline-focus"
          style={draft}
        />
      )}
      {focus && (
        <div
          className="pointer-events-none absolute rounded-sm outline outline-2 outline-danger"
          style={focus}
        />
      )}
    </>
  );
}
