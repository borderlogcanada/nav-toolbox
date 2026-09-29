export type Category = {
  id: string;
  name: string;
  icon: string;
  color: string;
  sortOrder?: number;
};
export type Command = {
  id: string;
  title: string;
  command: string;
  descriptionShort: string;
  descriptionLong: string;
  categoryId: string;
  tags: string[];
  isFavorite: boolean;
  isEnabled: boolean;
  runCount: number;
  lastUsedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
  introducedIn?: number;
};
export type Settings = {
  theme: "light" | "dark" | "system";
  shortcut: string;
  startOnLogin: boolean;
  showRun: boolean;
  closeAfterCopy: boolean;
};
export type Snapshot = {
  categories: Category[];
  commands: Command[];
  settings: Settings;
};
export const defaultSettings: Settings = {
  theme: "system",
  shortcut: "Control+Space",
  startOnLogin: false,
  showRun: false,
  closeAfterCopy: true,
};
