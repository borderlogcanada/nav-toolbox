import { describe, expect, it } from "vitest";
import { getLauncherCommands } from "./launcher";
import type { Command } from "../types";

const command = (id: string, overrides: Partial<Command> = {}): Command => ({
  id,
  title: id,
  command: `echo ${id}`,
  descriptionShort: "",
  descriptionLong: "",
  categoryId: "git",
  tags: [],
  isFavorite: false,
  isEnabled: true,
  runCount: 0,
  lastUsedAt: null,
  ...overrides,
});

describe("launcher results", () => {
  it("exposes all enabled commands even after the seventh row", () => {
    const items = Array.from({ length: 339 }, (_, i) =>
      command(`command-${i}`),
    );
    expect(getLauncherCommands(items, "all", "")).toHaveLength(339);
    expect(getLauncherCommands(items, "git", "")).toHaveLength(339);
  });
  it("keeps hidden commands out of All, category and search results", () => {
    const items = [command("visible"), command("hidden", { isEnabled: false })];
    expect(getLauncherCommands(items, "all", "").map((c) => c.id)).toEqual([
      "visible",
    ]);
    expect(getLauncherCommands(items, "git", "hidden")).toHaveLength(0);
  });
  it("ranks recents then favorites once, without mutating the source", () => {
    const items = [
      command("normal"),
      command("favorite", { isFavorite: true }),
      command("older", { lastUsedAt: "2026-09-29T01:00:00Z" }),
      command("newer", {
        lastUsedAt: "2026-09-30T01:00:00Z",
        isFavorite: true,
      }),
    ];
    expect(getLauncherCommands(items, "all", "").map((c) => c.id)).toEqual([
      "newer",
      "older",
      "favorite",
      "normal",
    ]);
    expect(items.map((c) => c.id)).toEqual([
      "normal",
      "favorite",
      "older",
      "newer",
    ]);
    expect(getLauncherCommands(items, "recent", "").map((c) => c.id)).toEqual([
      "newer",
      "older",
    ]);
    expect(
      getLauncherCommands(items, "favorites", "").map((c) => c.id),
    ).toEqual(["favorite", "newer"]);
  });
  it("filters categories and searches command, description, tags and category names", () => {
    const items = [
      command("logs", {
        command: "journalctl -xe",
        categoryId: "systemd",
        descriptionShort: "Inspect logs",
        tags: ["diagnostic"],
      }),
      command("status"),
    ];
    for (const query of ["journalctl", "Inspect", "diagnostic", "Services"])
      expect(
        getLauncherCommands(items, "all", query, [
          { id: "systemd", name: "Services", icon: "server", color: "blue" },
        ]).map((c) => c.id),
      ).toContain("logs");
    expect(getLauncherCommands(items, "git", "").map((c) => c.id)).toEqual([
      "status",
    ]);
  });
});
