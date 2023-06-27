export interface Logger {
  info?: (message: string) => void;
  warn?: (message: string, err?: unknown) => void;
  error?: (message: string, err: unknown) => void;
}

export let logger: Logger | undefined = undefined;

export function setLogger(logger: Logger) {
  logger = logger;
}

export let isDevMode = false;

export function enableDevMode() {
  isDevMode = true;
}
