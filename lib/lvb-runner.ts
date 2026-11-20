export interface AnsiSpan {
  text: string;
  color?: 'cyan' | 'green' | 'yellow' | 'red' | 'blue' | 'magenta' | 'gray' | 'white';
  bold?: boolean;
  dim?: boolean;
}

export const ALLOWED_LVB_VERBS = new Set([
  'help',
  'status',
  'ping',
  'whoami',
  'me',
  'channels',
  'actors',
  'read',
  'post',
  'reply',
  'tasks',
  'conformance',
  'setup',
]);

export function tokenizeShellArgs(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}

export type ValidateLvbResult =
  | { ok: true; verb: string; args: string[] }
  | { ok: false; reason: string };

export function validateLvbCommand(raw: string): ValidateLvbResult {
  const tokens = tokenizeShellArgs(raw.trim());
  if (tokens.length === 0) {
    return { ok: false, reason: 'Empty lvb command.' };
  }

  let start = 0;
  const first = tokens[0].toLowerCase();
  if (first === 'lvb' || first === 'local-vercel-board') {
    start = 1;
  } else if (first === 'npx' && tokens[1]?.toLowerCase() === 'local-vercel-board') {
    start = 2;
  }

  const args = tokens.slice(start);
  const verb = (args[0] || 'help').toLowerCase();

  if (verb === 'attach' || verb === 'tui' || verb === 'interactive') {
    return {
      ok: false,
      reason: 'Interactive TUI attach mode runs directly inside the Command Prompt UI.',
    };
  }

  if (verb === 'serve' || verb === 'ui' || verb === 'tail' || verb === 'wait') {
    return {
      ok: false,
      reason: `\`lvb ${verb}\` is a long-running streaming command. In the browser, use \`lvb attach\` for the interactive TUI or open the \`vb tail\` window for live SSE streaming.`,
    };
  }

  if (!ALLOWED_LVB_VERBS.has(verb)) {
    return {
      ok: false,
      reason: `Unsupported lvb subcommand "${verb}". Allowed in browser runner: ${Array.from(ALLOWED_LVB_VERBS).join(', ')}.`,
    };
  }

  // Strip any user-supplied --url / --dir / --data-dir to keep server execution sandboxed
  const sanitized: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const tok = args[i];
    if (tok === '--url' || tok === '--dir' || tok === '--data-dir') {
      i += 1;
      continue;
    }
    sanitized.push(tok);
  }

  return { ok: true, verb, args: sanitized.length > 0 ? sanitized : ['help'] };
}

const SGR_COLOR_MAP: Record<number, AnsiSpan['color']> = {
  30: 'gray',
  31: 'red',
  32: 'green',
  33: 'yellow',
  34: 'blue',
  35: 'magenta',
  36: 'cyan',
  37: 'white',
  90: 'gray',
  91: 'red',
  92: 'green',
  93: 'yellow',
  94: 'blue',
  95: 'magenta',
  96: 'cyan',
  97: 'white',
};

/**
 * Parses ANSI SGR escape sequences (emitted by @poppinss/cliui) into structured
 * line spans so the browser terminal displays crisp colored stickers and tables.
 */
export function parseAnsiToLines(raw: string): AnsiSpan[][] {
  const normalized = String(raw || '').replace(/\r\n/g, '\n').replace(/\r/g, '');
  const rawLines = normalized.split('\n');
  const ansiRegex = /\x1b\[([0-9;]*)m/g;

  let color: AnsiSpan['color'] = undefined;
  let bold = false;
  let dim = false;

  return rawLines.map((line) => {
    const spans: AnsiSpan[] = [];
    let lastIndex = 0;
    ansiRegex.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = ansiRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        spans.push({
          text: line.slice(lastIndex, match.index),
          color,
          bold,
          dim,
        });
      }
      const codes = (match[1] || '0')
        .split(';')
        .map((c) => Number(c || 0));
      for (const code of codes) {
        if (code === 0) {
          color = undefined;
          bold = false;
          dim = false;
        } else if (code === 1) {
          bold = true;
        } else if (code === 2) {
          dim = true;
        } else if (code === 22) {
          bold = false;
          dim = false;
        } else if (code === 39) {
          color = undefined;
        } else if (code in SGR_COLOR_MAP) {
          color = SGR_COLOR_MAP[code];
        }
      }
      lastIndex = ansiRegex.lastIndex;
    }

    if (lastIndex < line.length) {
      spans.push({
        text: line.slice(lastIndex),
        color,
        bold,
        dim,
      });
    }

    if (spans.length === 0) {
      spans.push({ text: '' });
    }
    return spans;
  });
}
