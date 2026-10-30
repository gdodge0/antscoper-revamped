// The canvas and HTML badges share one gesture surface. Capturing every pointer
// here keeps a pinch intact even if a badge moves or disappears under a finger.
export function bindMapInput(
  host: HTMLElement,
  onTap: (event: PointerEvent) => void,
  onNavigate: () => void,
  onStart: () => void,
) {
  const pointers = new Set<number>();
  let tap: {
    id: number;
    x: number;
    y: number;
    label: HTMLElement | null;
  } | null = null;
  const down = (event: PointerEvent) => {
    onStart();
    pointers.add(event.pointerId);
    host.setPointerCapture(event.pointerId);
    tap =
      pointers.size === 1 && event.button === 0
        ? {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            label: (event.target as Element).closest<HTMLElement>(".iso-label"),
          }
        : null;
    if (pointers.size > 1 || event.button !== 0) onNavigate();
  };
  const move = (event: PointerEvent) => {
    if (tap && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 6) {
      tap = null;
      onNavigate();
    }
  };
  const up = (event: PointerEvent) => {
    const candidate = tap;
    pointers.delete(event.pointerId);
    tap = null;
    if (
      !candidate ||
      pointers.size ||
      candidate.id !== event.pointerId ||
      Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y) > 6
    )
      return;
    if (candidate.label) candidate.label.click();
    else onTap(event);
  };
  const cancel = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    tap = null;
  };
  const click = (event: MouseEvent) => {
    // Pointer taps are handled above; keep keyboard/assistive clicks (detail 0).
    if (event.detail > 0) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const wheel = () => {
    onStart();
    onNavigate();
  };
  host.addEventListener("pointerdown", down);
  host.addEventListener("pointermove", move);
  host.addEventListener("pointerup", up);
  host.addEventListener("pointercancel", cancel);
  host.addEventListener("lostpointercapture", cancel);
  host.addEventListener("click", click, true);
  host.addEventListener("wheel", wheel, { passive: true });
  return () => {
    host.removeEventListener("pointerdown", down);
    host.removeEventListener("pointermove", move);
    host.removeEventListener("pointerup", up);
    host.removeEventListener("pointercancel", cancel);
    host.removeEventListener("lostpointercapture", cancel);
    host.removeEventListener("click", click, true);
    host.removeEventListener("wheel", wheel);
  };
}
