import type { Zone } from "../types/config";
import type { ProjectStatus } from "../hooks/useProjectStatus";
import { StatusPanel } from "./StatusPanel";
import { DETAIL_VIEWS } from "./details/registry";
import { DetailModal } from "./details/DetailModal";
import { DetailPage } from "./details/DetailPage";

interface DetailViewContainerProps {
  zone: Zone;
  status: ProjectStatus;
  onClose: () => void;
}

export function DetailViewContainer({ zone, status, onClose }: DetailViewContainerProps) {
  const config = zone.detailView;
  const Component = config ? DETAIL_VIEWS[config.component] : undefined;

  if (!config || !Component) {
    return (
      <StatusPanel zoneName={zone.name} status={status} onClose={onClose} />
    );
  }

  const viewProps = { zone, status, onClose };

  switch (config.type) {
    case "modal":
      return <DetailModal Component={Component} viewProps={viewProps} />;
    case "page":
      return <DetailPage Component={Component} viewProps={viewProps} />;
    case "panel":
      return <StatusPanel zoneName={zone.name} status={status} onClose={onClose} />;
  }
}
