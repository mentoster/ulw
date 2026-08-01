export class CliError extends Error {
  constructor(message, { code = "ULW_ERROR", exitCode = 1, details = [] } = {}) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}

export function formatError(error) {
  if (error instanceof CliError) {
    const lines = [`ERROR [${error.code}]: ${error.message}`];
    for (const detail of error.details) lines.push(`  - ${detail}`);
    return { text: `${lines.join("\n")}\n`, exitCode: error.exitCode };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { text: `ERROR [ULW_INTERNAL]: ${message}\n`, exitCode: 1 };
}
