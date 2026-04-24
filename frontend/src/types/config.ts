export interface Config {
  botTypes: Record<string, BotType>;
  dataSources: Record<string, DataSource>;
  spaces: Space[];
}

export interface BotType {
  label: string;
  sprite: string | null;
  placeholder: {
    shape: "circle";
    size: number; // percentage of image width
  };
  colors: {
    active: string;
    idle: string;
    error: string;
  };
}

export interface DataSource {
  type: string;
  path?: string;
  endpoint?: string;
  pollInterval: number;
}

export interface Space {
  id: string;
  name: string;
  image: string;
  nativeWidth: number;
  nativeHeight: number;
  zones: Zone[];
}

export interface Zone {
  id: string;
  name: string;
  polygon: [number, number][];
  bot: string;
  dataSource: string;
}

export type BotState = "active" | "idle" | "error";
