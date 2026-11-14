import { useEffect, useRef, type ReactNode, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!node.open) node.showModal();
    return () => {
      if (node.open) node.close();
    };
  }, []);

  function cancel(event: SyntheticEvent) {
    event.preventDefault();
    onClose();
  }

  return createPortal(
    <dialog
      ref={ref}
      className="sheet-dialog"
      aria-label={title}
      onCancel={cancel}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </dialog>,
    document.body,
  );
}
