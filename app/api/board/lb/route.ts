import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { NextRequest, NextResponse } from 'next/server';
import { parseAnsiToLines, validateLbCommand } from '@/lib/lb-runner';

export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFile);

export async function POST(req: NextRequest) {
  let command = '';
  try {
    const body = (await req.json()) as { command?: string };
    command = String(body?.command || '');
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body.' },
      { status: 400 }
    );
  }

  const check = validateLbCommand(command);
  if (!check.ok) {
    return NextResponse.json(
      {
        ok: false,
        raw: check.reason,
        lines: parseAnsiToLines(check.reason),
      },
      { status: 400 }
    );
  }

  const lbBin = path.join(
    process.cwd(),
    'packages',
    'local-board',
    'bin',
    'lb.mjs'
  );
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    FORCE_COLOR: '1',
  };
  delete env.NO_COLOR;

  // `lb conformance` runs the real 7-check Board v1 Specification suite against an ephemeral server
  if (check.verb === 'conformance') {
    const runnerCode = `
      import { startBoardServer } from './packages/local-board/src/server.mjs';
      import { execFile } from 'node:child_process';
      import { promisify } from 'node:util';
      const run = promisify(execFile);
      const started = await startBoardServer({ port: 0, persist: false });
      try {
        const childEnv = { ...process.env, FORCE_COLOR: '1' };
        delete childEnv.NO_COLOR;
        const { stdout, stderr } = await run(
          process.execPath,
          ['./packages/local-board/bin/lb.mjs', 'conformance', '--url', started.url],
          { env: childEnv, timeout: 10000 }
        );
        process.stdout.write(stdout || '');
        if (stderr) process.stderr.write(stderr);
      } finally {
        await started.close();
      }
    `;
    try {
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        ['--input-type=module', '-e', runnerCode],
        { cwd: process.cwd(), env, timeout: 12000 }
      );
      const raw = [stdout, stderr].filter(Boolean).join('\n').trimEnd();
      return NextResponse.json({
        ok: true,
        verb: check.verb,
        raw,
        lines: parseAnsiToLines(raw),
      });
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      const raw = [e.stdout, e.stderr, e.message].filter(Boolean).join('\n').trimEnd();
      return NextResponse.json({
        ok: false,
        verb: check.verb,
        raw,
        lines: parseAnsiToLines(raw),
      });
    }
  }

  // Point live commands at the running Next.js board API on localhost
  const localOrigin = `http://127.0.0.1:${process.env.PORT || 3000}`;
  const finalArgs =
    check.verb === 'help'
      ? check.args
      : [...check.args, '--url', localOrigin];

  // For `lb setup`, run in an isolated temp folder so preview runs never clutter the repo
  let execCwd = process.cwd();
  let tempDir: string | null = null;
  if (check.verb === 'setup') {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-preview-setup-'));
    execCwd = tempDir;
  }

  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [lbBin, ...finalArgs],
      { cwd: execCwd, env, timeout: 10000 }
    );
    const raw = [stdout, stderr].filter(Boolean).join('\n').trimEnd();
    return NextResponse.json({
      ok: true,
      verb: check.verb,
      raw,
      lines: parseAnsiToLines(raw),
    });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const raw = [e.stdout, e.stderr, e.message].filter(Boolean).join('\n').trimEnd();
    return NextResponse.json({
      ok: false,
      verb: check.verb,
      raw,
      lines: parseAnsiToLines(raw),
    });
  } finally {
    if (tempDir) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  }
}
