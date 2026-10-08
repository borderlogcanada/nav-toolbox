import Fuse from "fuse.js";
import type { Category, Command } from "../types";

export function getLauncherCommands(
  commands: Command[],
  categoryId: string,
  query: string,
  categories: Category[] = [],
): Command[] {
  let list = commands.filter((command) => command.isEnabled);
  if (categoryId === "favorites") list = list.filter((c) => c.isFavorite);
  else if (categoryId === "recent") list = list.filter((c) => c.lastUsedAt);
  else if (categoryId !== "all")
    list = list.filter((c) => c.categoryId === categoryId);

  if (query.trim()) {
    const names = new Map(categories.map((c) => [c.id, c.name]));
    return new Fuse(
      list.map((c) => ({
        ...c,
        categoryName: names.get(c.categoryId) ?? c.categoryId,
      })),
      {
        keys: [
          "title",
          "command",
          "descriptionShort",
          "descriptionLong",
          "tags",
          "categoryName",
        ],
        threshold: 0.38,
      },
    )
      .search(query.trim())
      .map((result) => result.item);
  }
  if (categoryId === "recent")
    return list.sort((a, b) =>
      (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? ""),
    );
  if (categoryId !== "all") return list;
  return list.sort((a, b) => {
    if (a.lastUsedAt || b.lastUsedAt) {
      if (!a.lastUsedAt) return 1;
      if (!b.lastUsedAt) return -1;
      return b.lastUsedAt.localeCompare(a.lastUsedAt);
    }
    return Number(b.isFavorite) - Number(a.isFavorite);
  });
}
