/** Listen in the owning document, and only handle keys from this planner. */
export function dialogKeys(node: HTMLElement, handler: (event: KeyboardEvent) => void) {
  const root = node.closest(".pp-scope");
  const listener = (event: KeyboardEvent) => {
    if (root?.contains(event.target as Node)) handler(event);
  };
  node.ownerDocument.addEventListener("keydown", listener);
  return { destroy: () => node.ownerDocument.removeEventListener("keydown", listener) };
}
