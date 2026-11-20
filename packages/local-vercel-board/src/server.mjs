import http from 'node:http';
import {
  createBoardStore,
  parseBoardProfileHeader,
  parseDurationSeconds,
} from './store.mjs';

function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

function resolveProfile(req, url, body) {
  const headerProfile = parseBoardProfileHeader(req.headers['x-board-profile']);
  const asName =
    headerProfile?.name ||
    body?.as ||
    url.searchParams.get('as') ||
    undefined;
  return {
    as: asName,
    avatar: headerProfile?.avatar || undefined,
  };
}

function renderStandaloneHtml(port) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Local Vercel Board (lvb) — Local Inspector</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Tahoma, "MS Sans Serif", Arial, sans-serif; background: #008080; color: #000; height: 100vh; display: flex; flex-direction: column; }
    .win { background: #c0c0c0; border: 2px solid #fff; border-right-color: #0a0a0a; border-bottom-color: #0a0a0a; box-shadow: inset -1px -1px 0 #808080, inset 1px 1px 0 #dfdfdf; display: flex; flex-direction: column; }
    .title { background: linear-gradient(90deg, #000080, #1084d0); color: #fff; font-weight: bold; font-size: 12px; padding: 4px 8px; display: flex; justify-content: space-between; align-items: center; }
    .grid { flex: 1; display: grid; grid-template-columns: 280px 1fr; gap: 10px; padding: 12px; min-height: 0; }
    .sunken { background: #fff; border: 2px solid #808080; border-right-color: #fff; border-bottom-color: #fff; overflow-y: auto; padding: 8px; }
    .btn { background: #c0c0c0; border: 2px solid #fff; border-right-color: #0a0a0a; border-bottom-color: #0a0a0a; padding: 4px 10px; font-size: 12px; cursor: pointer; font-weight: bold; }
    .btn:active { border-color: #0a0a0a #fff #fff #0a0a0a; }
    .msg { margin-bottom: 8px; font-size: 13px; line-height: 1.4; }
    .agent { color: #6b21a8; font-weight: bold; }
    .human { color: #000080; font-weight: bold; }
    .task { padding: 6px; border-bottom: 1px solid #e5e5e5; font-size: 12px; display: flex; justify-content: space-between; gap: 6px; align-items: center; }
    .bar { height: 32px; background: #c0c0c0; border-top: 2px solid #fff; display: flex; align-items: center; justify-content: space-between; padding: 0 10px; font-size: 11px; }
    .row { display: flex; gap: 6px; padding: 8px; }
    input, select { font-family: inherit; font-size: 12px; padding: 4px 6px; }
  </style>
</head>
<body>
  <div class="grid">
    <section class="win">
      <div class="title"><span>Local Vercel Board (lvb)</span><span>127.0.0.1:${port}</span></div>
      <div style="padding:8px;font-size:11px;font-weight:bold;">Connected Agents &amp; Task Queue</div>
      <div id="agents" class="sunken" style="margin:0 8px 8px;max-height:170px;"></div>
      <div id="tasks" class="sunken" style="margin:0 8px 8px;flex:1;"></div>
    </section>
    <section class="win">
      <div class="title"><span>#agent-bridge — Shared Local Agent Room</span><span id="live">SSE Live</span></div>
      <div id="msgs" class="sunken" style="margin:8px;flex:1;"></div>
      <form id="composer" class="row">
        <select id="as">
          <option value="developer">developer (me)</option>
          <option value="claude-code">claude-code</option>
          <option value="grok">grok</option>
          <option value="antigravity">antigravity</option>
        </select>
        <input id="body" style="flex:1;" placeholder="Write to #agent-bridge... (try @claude-code @grok @antigravity)" />
        <button class="btn" type="submit">Send</button>
      </form>
    </section>
  </div>
  <footer class="bar">
    <strong>lvb — Local Vercel Board · MIT · By <a href="https://iolivares.com" target="_blank" rel="noreferrer" style="color:#000080">Iván Olivares</a></strong>
    <span id="clock"></span>
  </footer>
  <script>
    async function render(state) {
      document.getElementById('agents').innerHTML = state.actors.map(a =>
        '<div style="padding:3px 0;font-size:12px;"><strong>' + a.name + '</strong> ' +
        (a.via ? '<span style="color:#666">via ' + a.via + '</span> ' : '') +
        '<span style="color:#15803d">[' + a.status + ']</span></div>'
      ).join('');
      document.getElementById('tasks').innerHTML = state.tasks.map(t =>
        '<div class="task"><span>#' + t.id + ' [' + t.state + '] ' + t.title + '</span>' +
        (t.state === 'ready' ? '<button class="btn" onclick="claim(\\'' + t.id + '\\')">Claim</button>' : '') +
        (t.state === 'claimed' ? '<button class="btn" onclick="complete(\\'' + t.id + '\\')">Done</button>' : '') +
        '</div>'
      ).join('');
      const msgs = document.getElementById('msgs');
      msgs.innerHTML = state.messages.filter(m => !m.deleted).map(m =>
        '<div class="msg"><span class="' + (m.via ? 'agent' : 'human') + '">' + m.actorName + '</span>' +
        (m.via ? ' <small style="color:#666">via ' + m.via + '</small>' : '') + ': ' + m.body + '</div>'
      ).join('');
      msgs.scrollTop = msgs.scrollHeight;
    }
    async function load() { render(await (await fetch('/api/board/state')).json()); }
    async function claim(id) {
      await fetch('/api/board/tasks/' + id + '/claim', { method:'POST', headers:{'Content-Type':'application/json','x-board-profile':'claude-code'}, body:JSON.stringify({lease:300}) });
      load();
    }
    async function complete(id) {
      await fetch('/api/board/tasks/' + id + '/complete', { method:'POST', headers:{'Content-Type':'application/json','x-board-profile':'claude-code'}, body:JSON.stringify({result:'Done'}) });
      load();
    }
    document.getElementById('composer').addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = document.getElementById('body').value.trim();
      if (!text) return;
      const actor = document.getElementById('as').value;
      await fetch('/api/board/messages', { method:'POST', headers:{'Content-Type':'application/json','x-board-profile':actor}, body:JSON.stringify({channelId:'agent-bridge',text}) });
      document.getElementById('body').value = '';
      load();
    });
    const es = new EventSource('/api/board/stream');
    es.addEventListener('init', (e) => render(JSON.parse(e.data)));
    es.addEventListener('board_event', (e) => render(JSON.parse(e.data).state));
    setInterval(() => { document.getElementById('clock').textContent = new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}); }, 1000);
    load();
  </script>
</body>
</html>`;
}

/**
 * Starts the SPEC.md-aligned local board HTTP + SSE server.
 * Default port: 4100 on 127.0.0.1 mounted at /api/board (per SPEC.md `serve`).
 */
export function startBoardServer(options = {}) {
  const port = Number(options.port ?? 4100);
  const host = options.host || '127.0.0.1';
  const store = options.store || createBoardStore(options);

  const server = http.createServer(async (req, res) => {
    const actualPort = server.address()?.port || port;
    const baseUrl = `http://${host}:${actualPort}`;
    const url = new URL(req.url || '/', baseUrl);
    const pathname = url.pathname;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,x-board-profile,x-board-can,Last-Event-ID',
      });
      res.end();
      return;
    }

    // Inspector HTML UI outside /api/board
    if (req.method === 'GET' && pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderStandaloneHtml(actualPort));
      return;
    }

    // SPEC: GET /api/board (Discovery)
    if (req.method === 'GET' && (pathname === '/api/board' || pathname === '/api/board/')) {
      sendJson(res, 200, {
        version: '1',
        url: `${baseUrl}/api/board`,
        audience: `${baseUrl}/api/board`,
        mode: 'local',
        team_id: null,
        project_id: null,
        sync: [],
        spec: 'https://github.com/vercel/board/blob/main/SPEC.md',
      });
      return;
    }

    // Legacy snapshot endpoint for desktop UI
    if (req.method === 'GET' && pathname === '/api/board/state') {
      sendJson(res, 200, store.getState());
      return;
    }

    // SPEC: GET /api/board/me (+ alias /api/board/whoami)
    if (req.method === 'GET' && (pathname === '/api/board/me' || pathname === '/api/board/whoami')) {
      const profile = resolveProfile(req, url, null);
      sendJson(res, 200, store.whoami(profile.as, profile.avatar));
      return;
    }

    // SPEC: GET /api/board/channels
    if (req.method === 'GET' && pathname === '/api/board/channels') {
      sendJson(res, 200, store.listChannels());
      return;
    }

    // SPEC: POST /api/board/channels
    if (req.method === 'POST' && pathname === '/api/board/channels') {
      const body = await readJsonBody(req);
      const profile = resolveProfile(req, url, body);
      const out = store.createChannel({
        channelPath: body.path || body.name || body.channel,
        description: body.description,
        as: profile.as,
      });
      sendJson(res, out.status || (out.ok ? 201 : 400), out);
      return;
    }

    // SPEC: GET /api/board/actors
    if (req.method === 'GET' && pathname === '/api/board/actors') {
      const ids = url.searchParams.getAll('id');
      let actors = store.getState().actors;
      if (ids.length > 0) {
        actors = actors.filter((a) => ids.includes(a.id) || ids.includes(a.name));
      }
      sendJson(res, 200, { ok: true, actors });
      return;
    }

    // SPEC: GET /api/board/posts/:id (idempotent client post lookup)
    const postIdMatch = pathname.match(/^\/api\/board\/posts\/([^/]+)$/);
    if (req.method === 'GET' && postIdMatch) {
      const out = store.getPostById(decodeURIComponent(postIdMatch[1]));
      sendJson(res, out.status || (out.ok ? 200 : 404), out);
      return;
    }

    // SPEC: GET /api/board/threads
    if (req.method === 'GET' && pathname === '/api/board/threads') {
      const out = store.listThreads({
        channel: url.searchParams.get('channel') || undefined,
        by: url.searchParams.get('by') || undefined,
        mentions: url.searchParams.get('mentions') || undefined,
        label: url.searchParams.getAll('label'),
        text: url.searchParams.get('text') || undefined,
        limit: url.searchParams.get('limit') || 30,
      });
      sendJson(res, 200, out);
      return;
    }

    // SPEC: GET /api/board/messages
    if (req.method === 'GET' && pathname === '/api/board/messages') {
      const out = store.listMessages({
        channel: url.searchParams.get('channel') || undefined,
        threadId: url.searchParams.get('threadId') || undefined,
        after: url.searchParams.get('after') || undefined,
        limit: url.searchParams.get('limit') || 50,
      });
      sendJson(res, 200, out);
      return;
    }

    // SPEC: GET /api/board/messages/:id
    const msgGetMatch = pathname.match(/^\/api\/board\/messages\/([^/]+)$/);
    if (req.method === 'GET' && msgGetMatch) {
      const out = store.getThread(decodeURIComponent(msgGetMatch[1]));
      sendJson(res, out.status || (out.ok ? 200 : 404), out);
      return;
    }

    // SPEC: POST /api/board/messages
    if (req.method === 'POST' && pathname === '/api/board/messages') {
      const body = await readJsonBody(req);
      const profile = resolveProfile(req, url, body);
      const out = store.postMessage({
        ...body,
        as: profile.as,
        avatar: profile.avatar,
      });
      sendJson(res, out.status || (out.ok ? 201 : 400), out);
      return;
    }

    // SPEC: POST /api/board/messages/:id/(edit|delete|reactions|labels)
    const msgActionMatch = pathname.match(
      /^\/api\/board\/messages\/([^/]+)\/(edit|delete|reactions|labels)$/
    );
    if (req.method === 'POST' && msgActionMatch) {
      const msgId = decodeURIComponent(msgActionMatch[1]);
      const op = msgActionMatch[2];
      const body = await readJsonBody(req);
      const profile = resolveProfile(req, url, body);
      let out;
      if (op === 'edit') {
        out = store.editMessage({ id: msgId, text: body.text, body: body.body, ifRevision: body.ifRevision, as: profile.as });
      } else if (op === 'delete') {
        out = store.deleteMessage({ id: msgId, ifRevision: body.ifRevision, as: profile.as });
      } else if (op === 'reactions') {
        out = store.reactMessage({ id: msgId, emoji: body.emoji, remove: Boolean(body.remove), as: profile.as });
      } else {
        out = store.labelMessage({
          id: msgId,
          set: body.set,
          unset: body.unset,
          ifLabels: body.if,
          ifUnset: body.ifUnset,
          as: profile.as,
        });
      }
      sendJson(res, out.status || (out.ok ? 200 : 400), out);
      return;
    }

    // SPEC: GET /api/board/tasks
    if (req.method === 'GET' && pathname === '/api/board/tasks') {
      const out = store.listTasks({
        channel: url.searchParams.get('channel') || undefined,
        state: url.searchParams.get('state') || 'open',
        forActor: url.searchParams.get('for') || undefined,
        by: url.searchParams.get('by') || undefined,
        needs: url.searchParams.get('needs') || undefined,
      });
      sendJson(res, 200, out);
      return;
    }

    // SPEC: POST /api/board/tasks/claim
    if (req.method === 'POST' && pathname === '/api/board/tasks/claim') {
      const body = await readJsonBody(req);
      const profile = resolveProfile(req, url, body);
      const out = store.claimNextReady({
        channel: body.channel || body.channelId,
        as: profile.as,
        lease: body.lease,
        leaseMinutes: body.leaseMinutes,
      });
      sendJson(res, out.status || 200, out);
      return;
    }

    // SPEC: POST /api/board/tasks (create or legacy claim_ready)
    if (req.method === 'POST' && pathname === '/api/board/tasks') {
      const body = await readJsonBody(req);
      const profile = resolveProfile(req, url, body);
      const out =
        body.mode === 'claim_ready'
          ? store.claimNextReady({ ...body, as: profile.as })
          : store.createTask({ ...body, as: profile.as });
      sendJson(res, out.status || (out.ok ? 201 : 400), out);
      return;
    }

    // SPEC: POST /api/board/tasks/:id/(claim|renew|release|complete|fail|block|unblock|reopen|assign|needs|cancel|action)
    const taskRouteMatch = pathname.match(
      /^\/api\/board\/tasks\/([^/]+)\/(claim|renew|release|complete|fail|block|unblock|reopen|assign|needs|cancel|action)$/
    );
    if (req.method === 'POST' && taskRouteMatch) {
      const taskId = decodeURIComponent(taskRouteMatch[1]);
      const routeVerb = taskRouteMatch[2];
      const body = await readJsonBody(req);
      const profile = resolveProfile(req, url, body);
      const out = store.performTaskAction({
        taskId,
        action: routeVerb === 'action' ? body.action : routeVerb,
        as: profile.as,
        note: body.note,
        result: body.result,
        reason: body.reason,
        kind: body.kind,
        epoch: body.epoch,
        token: body.token,
        forActor: body.for,
        needs: body.needs,
        lease: body.lease,
        leaseMinutes: body.leaseMinutes,
      });
      sendJson(res, out.status || (out.ok ? 200 : 409), out);
      return;
    }

    // SPEC: GET /api/board/events (Unified SSE when Accept: text/event-stream, otherwise JSON long-poll)
    if (req.method === 'GET' && pathname === '/api/board/events') {
      const after = url.searchParams.get('after') || req.headers['last-event-id'] || '';
      const channel = url.searchParams.get('channel') || undefined;
      const re = url.searchParams.get('re') || undefined;
      const all = url.searchParams.get('all') === 'true' || url.searchParams.get('all') === '1';
      const accept = String(req.headers.accept || '');

      if (accept.includes('text/event-stream')) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });

        // Replay missed events if `after` or `Last-Event-ID` provided
        if (after) {
          const missed = store.listEvents({ after, channel, re, all });
          for (const ev of missed.events) {
            res.write(`id: ${ev.cursor}\nevent: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`);
          }
        } else {
          res.write(`: connected cursor=${store.getCursor()}\n\n`);
        }

        const unsub = store.subscribe(({ event }) => {
          if (!all && event.type === 'task.renewed') return;
          if (channel && event.channelId && !event.channelId.startsWith(channel.replace(/\/$/, ''))) return;
          if (re && event.threadId !== re) return;
          res.write(`id: ${event.cursor}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        });
        const heartbeat = setInterval(() => {
          res.write(': keepalive\n\n');
        }, 15_000);
        req.on('close', () => {
          clearInterval(heartbeat);
          unsub();
        });
        return;
      }

      // JSON poll or long-poll (?wait=<s>)
      const waitSec = url.searchParams.get('wait')
        ? Math.min(300, Math.max(0, parseDurationSeconds(url.searchParams.get('wait'), 0)))
        : 0;
      const initial = store.listEvents({ after: after || store.getCursor(), channel, re, all });
      if (initial.events.length > 0 || waitSec <= 0) {
        sendJson(res, 200, initial);
        return;
      }

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        unsub();
        sendJson(res, 200, { ok: true, events: [], cursor: store.getCursor() });
      }, waitSec * 1000);

      const unsub = store.subscribe(({ event }) => {
        if (settled) return;
        if (!all && event.type === 'task.renewed') return;
        if (channel && event.channelId && event.channelId !== channel && !event.channelId.startsWith(channel)) return;
        if (re && event.threadId !== re) return;
        settled = true;
        clearTimeout(timer);
        unsub();
        sendJson(res, 200, { ok: true, events: [event], cursor: event.cursor });
      });

      req.on('close', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          unsub();
        }
      });
      return;
    }

    // Legacy SSE stream + wait endpoints for Next.js UI & standalone inspector
    if (req.method === 'GET' && pathname === '/api/board/wait') {
      const target = url.searchParams.get('target') || '';
      const timeoutMs = Math.max(500, Math.min(55_000, Number(url.searchParams.get('timeoutMs') || 20_000)));
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        unsub();
        sendJson(res, 200, { ok: true, timedOut: true, cursor: store.getCursor() });
      }, timeoutMs);
      const unsub = store.subscribe(({ event }) => {
        if (settled) return;
        if (target && event.channelId !== target && event.threadId !== target) return;
        settled = true;
        clearTimeout(timer);
        unsub();
        sendJson(res, 200, { ok: true, timedOut: false, event, cursor: event.cursor });
      });
      req.on('close', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          unsub();
        }
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/board/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write(`event: init\ndata: ${JSON.stringify(store.getState())}\n\n`);
      const unsub = store.subscribe((payload) => {
        res.write(`id: ${payload.event.cursor}\nevent: board_event\ndata: ${JSON.stringify(payload)}\n\n`);
      });
      const heartbeat = setInterval(() => {
        res.write(': keepalive\n\n');
      }, 15_000);
      req.on('close', () => {
        clearInterval(heartbeat);
        unsub();
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/board/reset') {
      sendJson(res, 200, { ok: true, state: store.reset() });
      return;
    }

    sendJson(res, 404, { ok: false, error: { code: 'not_found', message: 'Route not found', reason: 'Route not found' } });
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        server,
        store,
        port: actualPort,
        url: `http://${host}:${actualPort}`,
        boardUrl: `http://${host}:${actualPort}/api/board`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}
