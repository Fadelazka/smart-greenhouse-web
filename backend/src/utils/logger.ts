const LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type Level = (typeof LEVELS)[number];

const COLORS: Record<Level, string> = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};

const activeLevel: Level = process.env.LOG_LEVEL === 'debug' ? 'debug' : 'info';

function emit(level: Level, scope: string, message: string, extra?: unknown): void {
  if (LEVELS.indexOf(level) < LEVELS.indexOf(activeLevel)) return;

  const time = new Date().toISOString().slice(11, 23);
  const color = COLORS[level];
  const reset = '\x1b[0m';
  const tag = level.toUpperCase().padEnd(5);

  let line = `${color}${time} ${tag}${reset} \x1b[1m[${scope}]${reset} ${message}`;

  if (extra !== undefined) {
    line += ` ${color}${typeof extra === 'string' ? extra : JSON.stringify(extra)}${reset}`;
  }

  console.log(line);
}

export function createLogger(scope: string) {
  return {
    debug: (m: string, e?: unknown) => emit('debug', scope, m, e),
    info: (m: string, e?: unknown) => emit('info', scope, m, e),
    warn: (m: string, e?: unknown) => emit('warn', scope, m, e),
    error: (m: string, e?: unknown) => emit('error', scope, m, e),
  };
}

export type Logger = ReturnType<typeof createLogger>;