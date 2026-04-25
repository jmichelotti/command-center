import type { ComponentType } from "react";
import type { Zone } from "../../types/config";
import type { ProjectStatus } from "../../hooks/useProjectStatus";
import { StorygraphDetail } from "./StorygraphDetail";

export interface DetailViewProps {
  zone: Zone;
  status: ProjectStatus;
  onClose: () => void;
}

export const DETAIL_VIEWS: Record<string, ComponentType<DetailViewProps>> = {
  storygraph: StorygraphDetail,
};
