import { useEffect, useCallback, useRef } from "react";
import type { DetailViewProps } from "./registry";
import type { ComponentType } from "react";

interface DetailModalProps {
  Component: ComponentType<DetailViewProps>;
  viewProps: DetailViewProps;
}

export function DetailModal({ Component, viewProps }: DetailModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    viewProps.onClose();
  }, [viewProps]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) handleClose();
    },
    [handleClose],
  );

  return (
    <div
      className="detail-modal-backdrop"
      ref={backdropRef}
      onClick={handleBackdropClick}
    >
      <div className="detail-modal-content">
        <Component {...viewProps} />
      </div>
    </div>
  );
}
