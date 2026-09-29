import fs from "node:fs";

const seed = JSON.parse(fs.readFileSync("src/data/seed.json", "utf8"));
const expansion = JSON.parse(
  fs.readFileSync("src/data/catalog-v2.json", "utf8"),
);
const basics = JSON.parse(fs.readFileSync("src/data/catalog-v3.json", "utf8"));
const categories = [
  ...seed.categories,
  ...expansion.categories,
  ...basics.categories,
];
const commands = [...seed.commands, ...expansion.commands, ...basics.commands];
const unique = (values, label) => {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
};
unique(
  categories.map((category) => category.id),
  "category ID",
);
unique(
  commands.map((command) => command.id),
  "command ID",
);
const categoryIds = new Set(categories.map((category) => category.id));
for (const command of commands) {
  if (!categoryIds.has(command.categoryId))
    throw new Error(`Unknown category for ${command.id}`);
  if (
    !command.title?.trim() ||
    !command.command?.trim() ||
    !command.descriptionShort?.trim()
  )
    throw new Error(`Incomplete command: ${command.id}`);
  if (command.command.length > 4096)
    throw new Error(`Command too long: ${command.id}`);
}
for (const command of [...expansion.commands, ...basics.commands]) {
  if (command.isEnabled !== false)
    throw new Error(`New catalog item must start disabled: ${command.id}`);
}
console.log(
  `${commands.length} commands across ${categories.length} categories validated`,
);
