import type { DetailViewProps } from "./registry";
import type { ComponentType } from "react";

interface DetailPageProps {
  Component: ComponentType<DetailViewProps>;
  viewProps: DetailViewProps;
}

export function DetailPage({ Component, viewProps }: DetailPageProps) {
  return (
    <div className="detail-page">
      <div className="detail-page-header">
        <button className="detail-page-back" onClick={viewProps.onClose}>
          &larr; Back to Map
        </button>
      </div>
      <div className="detail-page-body">
        <Component {...viewProps} />
      </div>
    </div>
  );
}
