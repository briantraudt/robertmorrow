"use client";

import { useEffect, useRef } from "react";

type DialogLayer = { element: HTMLElement };
const layers: DialogLayer[] = [];
let previousOverflow = "";

function focusableElements(element: HTMLElement) {
  return Array.from(
    element.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]',
    ),
  ).filter(
    (candidate) =>
      candidate.tabIndex >= 0 &&
      !candidate.matches(":disabled") &&
      !candidate.closest('[inert], [hidden], [aria-hidden="true"]') &&
      candidate.getClientRects().length > 0 &&
      getComputedStyle(candidate).visibility !== "hidden",
  );
}

function focusFirst(element: HTMLElement) {
  (focusableElements(element)[0] ?? element).focus({ preventScroll: true });
}

/** Keeps only the top dialog active, including offers opened from a painting. */
export function useModalDialog<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const dialogRef = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const element = dialogRef.current;
    if (!element) return;

    // The cart stays mounted for its closing animation. Its hidden controls
    // must not remain in the page's keyboard sequence.
    element.inert = !open;
    if (!open) return;

    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const layer = { element };
    if (layers.length === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    layers.push(layer);
    const isTop = () => layers[layers.length - 1] === layer;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTop()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusableElements(element);
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!first) {
        event.preventDefault();
        element.focus({ preventScroll: true });
      } else if (!active || !element.contains(active) || active === element) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const handleFocus = (event: FocusEvent) => {
      if (isTop() && event.target instanceof Node && !element.contains(event.target)) {
        focusFirst(element);
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", handleFocus);
    focusFirst(element);

    return () => {
      const wasTop = isTop();
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", handleFocus);
      const index = layers.indexOf(layer);
      if (index !== -1) layers.splice(index, 1);
      const activeLayer = layers[layers.length - 1];
      if (!activeLayer) document.body.style.overflow = previousOverflow;

      if (!wasTop) return;
      if (
        previousFocus?.isConnected &&
        !previousFocus.closest('[inert], [hidden], [aria-hidden="true"]') &&
        (!activeLayer || activeLayer.element.contains(previousFocus))
      ) {
        previousFocus.focus({ preventScroll: true });
      } else if (activeLayer) {
        focusFirst(activeLayer.element);
      }
    };
  }, [open]);

  return dialogRef;
}
