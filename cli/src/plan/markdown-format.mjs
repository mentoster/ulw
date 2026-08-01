export function list(items, fallback = "- None") {
  if (!Array.isArray(items) || items.length === 0) return fallback;
  return items.map((item) => `- ${typeof item === "string" ? item : item.text ?? JSON.stringify(item)}`).join("\n");
}

export function table(headers, rows) {
  const head = `| ${headers.join(" | ")} |`;
  const divider = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map((value) => String(value ?? "").replaceAll("|", "\\|")).join(" | ")} |`);
  return [head, divider, ...body].join("\n");
}

export function text(value, fallback = "Not provided") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
