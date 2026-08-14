import type { RouteOption } from "@travel-guide/shared";

/** 展示用短标签：优先 theme，并去掉「北京·」等城市前缀 */
export function routeOptionLabel(
  opt: RouteOption,
  destination: string,
): string {
  if (opt.theme?.trim()) return opt.theme.trim();
  return stripDestinationPrefix(opt.title, destination);
}

function stripDestinationPrefix(title: string, destination: string): string {
  let label = (title || "").trim();
  const dest = (destination || "").trim();
  if (!label || !dest) return label;

  const bare = dest.replace(/市$/, "");
  const prefixes = [
    `${dest}·`,
    `${dest}・`,
    `${dest}-`,
    `${dest}—`,
    `${dest} `,
    `${bare}·`,
    `${bare}・`,
    `${bare}-`,
    `${bare} `,
    dest,
    bare,
    `${dest}市`,
    `${bare}市`,
  ].sort((a, b) => b.length - a.length);

  for (const prefix of prefixes) {
    if (label.startsWith(prefix)) {
      label = label.slice(prefix.length).trim();
      break;
    }
  }

  return label.replace(/^[·・\s\-—]+/, "").trim() || title.trim();
}
