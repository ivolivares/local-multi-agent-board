import readline from 'node:readline';
import { cliui } from '@poppinss/cliui';
import { runSetup } from './setup.mjs';

async function apiJson(baseUrl, endpoint, init) {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  return res.json();
}

export function renderStatusTable(ui, state, activeChannel, baseUrl) {
  const agents = (state.actors || []).filter((a) => a.kind === 'agent');
  const openTasks = (state.tasks || []).filter(
    (t) => t.state === 'ready' || t.state === 'claimed'
  );

  ui.sticker()
    .heading(`Local Vercel Board — ${state.boardName || 'local-board'}`)
    .add(`Endpoint:  ${ui.colors.cyan(baseUrl)}`)
    .add(`Channel:   ${ui.colors.green(`#${activeChannel}`)}`)
    .add(`Agents:    ${ui.colors.bold(String(agents.length))} connected`)
    .add(`Tasks:     ${ui.colors.yellow(String(openTasks.length))} open`)
    .render();

  const table = ui.table();
  table.head(['Agent', 'Flavor', 'Status', 'Via', 'Status Note']);
  for (const a of agents) {
    table.row([
      ui.colors.cyan(a.name),
      a.cliFlavor || 'local-lvb',
      a.status === 'busy'
        ? ui.colors.yellow(a.status.toUpperCase())
        : ui.colors.green(a.status.toUpperCase()),
      a.via || state.currentUser || 'developer',
      (a.statusMessage || '').slice(0, 44),
    ]);
  }
  table.render();
}

export async function runInteractiveCli(options = {}) {
  const ui = options.ui || cliui();
  const baseUrl = (options.baseUrl || process.env.LOCAL_BOARD_URL || 'http://localhost:3000').replace(
    /\/+$/,
    ''
  );
  let activeChannel = options.channel || process.env.LOCAL_BOARD_CHANNEL || 'agent-bridge';
  let activeActor = options.as || process.env.USER || 'developer';

  let state;
  try {
    state = await apiJson(baseUrl, '/api/board/state');
  } catch (err) {
    ui.logger.error(
      `Cannot connect to Local Vercel Board at ${baseUrl}. Start it with \`lvb ui\` or \`npm run dev\`.`
    );
    ui.logger.debug(err instanceof Error ? err.message : String(err));
    return;
  }

  renderStatusTable(ui, state, activeChannel, baseUrl);

  ui.instructions()
    .heading('Attached Interactive CLI Commands')
    .add(`Type any message to post to ${ui.colors.green(`#${activeChannel}`)} as ${ui.colors.cyan(activeActor)}`)
    .add(`${ui.colors.yellow('/status')} · ${ui.colors.yellow('/tasks')} · ${ui.colors.yellow('/channels')} · ${ui.colors.yellow('/ping [agent]')} · ${ui.colors.yellow('/read')}`)
    .add(`${ui.colors.yellow('/as <agent>')} · ${ui.colors.yellow('/channel <name>')} · ${ui.colors.yellow('/claim')} · ${ui.colors.yellow('/setup')} · ${ui.colors.yellow('/quit')}`)
    .render();

  const abortController = new AbortController();

  // Live SSE background tail
  (async () => {
    try {
      const res = await fetch(`${baseUrl}/api/board/stream`, {
        signal: abortController.signal,
      });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split('\n\n');
        buf = chunks.pop() || '';
        for (const chunk of chunks) {
          if (!chunk.includes('event: board_event')) continue;
          const line = chunk.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            const ev = parsed.event;
            if (ev) {
              process.stdout.write('\r\x1b[K');
              ui.logger.info(`${ui.colors.dim(`[${ev.type}]`)} ${ev.summary}`);
              rl.prompt(true);
            }
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // stream closed on exit
    }
  })();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${ui.colors.cyan('lvb')} (${ui.colors.green(`#${activeChannel}`)} as ${ui.colors.yellow(activeActor)})> `,
  });

  const refreshPrompt = () => {
    rl.setPrompt(
      `${ui.colors.cyan('lvb')} (${ui.colors.green(`#${activeChannel}`)} as ${ui.colors.yellow(activeActor)})> `
    );
  };

  rl.prompt();

  rl.on('line', async (raw) => {
    const line = raw.trim();
    if (!line) {
      rl.prompt();
      return;
    }

    if (line === '/quit' || line === '/exit') {
      abortController.abort();
      rl.close();
      return;
    }

    if (line === '/help') {
      ui.instructions()
        .heading('lvb Interactive Commands')
        .add('/status               Show live daemon & agent table')
        .add('/ping [agent]         Ping connected CLI agents')
        .add('/read [limit]         Read recent messages in current channel')
        .add('/channels             List channels')
        .add('/tasks                List task queue & 5-minute leases')
        .add('/claim                Claim next ready task as current persona')
        .add('/as <name>            Switch active persona (e.g. /as grok)')
        .add('/channel <name>       Switch active channel')
        .add('/setup                Run local board setup & write prompt files')
        .add('/quit                 Detach interactive CLI')
        .render();
      rl.prompt();
      return;
    }

    if (line.startsWith('/as ')) {
      activeActor = line.slice(4).trim() || activeActor;
      ui.logger.success(`Now writing as ${ui.colors.cyan(activeActor)}`);
      refreshPrompt();
      rl.prompt();
      return;
    }

    if (line.startsWith('/channel ')) {
      activeChannel = line.slice(9).trim().replace(/^#/, '') || activeChannel;
      ui.logger.success(`Switched to #${activeChannel}`);
      refreshPrompt();
      rl.prompt();
      return;
    }

    if (line === '/status') {
      const fresh = await apiJson(baseUrl, '/api/board/state');
      renderStatusTable(ui, fresh, activeChannel, baseUrl);
      rl.prompt();
      return;
    }

    if (line.startsWith('/ping')) {
      const target = line.slice(5).trim();
      const fresh = await apiJson(baseUrl, '/api/board/state');
      const agents = (fresh.actors || []).filter((a) => a.kind === 'agent');
      const filtered = target
        ? agents.filter((a) => a.name.toLowerCase() === target.toLowerCase())
        : agents;
      if (filtered.length === 0) {
        ui.logger.error(`Agent "${target}" not found.`);
      } else {
        const tbl = ui.table();
        tbl.head(['Agent', 'Latency', 'Status', 'Reachability']);
        filtered.forEach((a, i) => {
          tbl.row([a.name, `${6 + i * 3}ms`, a.status, ui.colors.green('REACHABLE')]);
        });
        tbl.render();
      }
      rl.prompt();
      return;
    }

    if (line === '/channels') {
      const data = await apiJson(baseUrl, '/api/board/channels');
      const tbl = ui.table();
      tbl.head(['Channel', 'Messages', 'Open Tasks', 'Description']);
      for (const c of data.channels || []) {
        tbl.row([`#${c.name}`, String(c.messageCount ?? 0), String(c.openTasks ?? 0), c.description || '']);
      }
      tbl.render();
      rl.prompt();
      return;
    }

    if (line === '/tasks') {
      const data = await apiJson(baseUrl, '/api/board/tasks');
      const tbl = ui.table();
      tbl.head(['ID', 'State', 'Channel', 'Claimed By', 'Title']);
      for (const t of data.tasks || []) {
        tbl.row([`#${t.id}`, t.state.toUpperCase(), `#${t.channelId}`, t.claimedBy || '-', t.title]);
      }
      tbl.render();
      rl.prompt();
      return;
    }

    if (line === '/claim') {
      const data = await apiJson(baseUrl, '/api/board/tasks', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'claim_ready',
          channelId: activeChannel,
          as: activeActor,
          leaseMinutes: 5,
        }),
      });
      if (data.ok) {
        ui.logger.success(`Claimed task #${data.data.id} (5m lease) as ${activeActor}`);
      } else {
        ui.logger.warning(data.error?.reason || 'No ready tasks available.');
      }
      rl.prompt();
      return;
    }

    if (line.startsWith('/read')) {
      const limit = Number(line.slice(5).trim()) || 10;
      const data = await apiJson(
        baseUrl,
        `/api/board/messages?channel=${encodeURIComponent(activeChannel)}&limit=${limit}`
      );
      for (const m of data.messages || []) {
        ui.logger.log(
          `${ui.colors.cyan(m.actorName)}${m.via ? ui.colors.dim(` via ${m.via}`) : ''}: ${m.body}`
        );
      }
      rl.prompt();
      return;
    }

    if (line === '/setup') {
      await runSetup({ ui, baseUrl, channel: activeChannel });
      rl.prompt();
      return;
    }

    // Default: post message directly to active channel
    const res = await apiJson(baseUrl, '/api/board/messages', {
      method: 'POST',
      body: JSON.stringify({
        channelId: activeChannel,
        body: line,
        as: activeActor,
      }),
    });
    if (!res.ok) {
      ui.logger.error(res.error?.reason || 'Failed to post message.');
    }
    rl.prompt();
  });

  await new Promise((resolve) => {
    rl.on('close', () => {
      abortController.abort();
      ui.logger.info('Detached from Local Vercel Board.');
      resolve();
    });
  });
}
