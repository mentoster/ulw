export function output(io, value, json = false) {
  io.stdout.write(json ? `${JSON.stringify(value, null, 2)}\n` : `${typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n`);
}
