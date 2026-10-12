import { useCallback, useEffect, useState } from 'react';

type Group = {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
  scrolls: number;
  liveOnly: boolean;
  lastScrapedAt: string | null;
  livestreamCount?: number;
};
type Stream = { id: string; url: string; isLive: boolean; firstSeenAt: string; groupId: string; groupName: string };
type Progress = { running: boolean; currentGroup: string | null; queued: number; log: string[] };
type Run = { id: string; groupName: string; status: string; foundCount: number; newCount: number; error: string | null; startedAt: string };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export default function App() {
  const [tab, setTab] = useState<'streams' | 'groups'>('streams');
  const [groups, setGroups] = useState<Group[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [filterGroup, setFilterGroup] = useState('');
  const [liveOnly, setLiveOnly] = useState(false);
  const [error, setError] = useState('');

  const loadGroups = useCallback(async () => setGroups(await api('/groups')), []);
  const loadRuns = useCallback(async () => setRuns(await api('/scrape/runs')), []);
  const loadStreams = useCallback(async () => {
    const q = new URLSearchParams();
    if (filterGroup) q.set('groupId', filterGroup);
    if (liveOnly) q.set('liveOnly', 'true');
    setStreams(await api(`/livestreams?${q}`));
  }, [filterGroup, liveOnly]);

  const guard = (fn: () => Promise<unknown>) => async () => {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => void guard(() => Promise.all([loadGroups(), loadRuns(), api<Progress>('/scrape/status').then(setProgress)]))(), []);
  useEffect(() => void guard(loadStreams)(), [loadStreams]);

  // While a scrape is running, poll progress; refresh data when it finishes
  useEffect(() => {
    if (!progress?.running) return;
    const t = setInterval(async () => {
      const p = await api<Progress>('/scrape/status').catch(() => null);
      if (!p) return;
      setProgress(p);
      if (!p.running) await Promise.all([loadGroups(), loadRuns(), loadStreams()]);
    }, 2000);
    return () => clearInterval(t);
  }, [progress?.running, loadGroups, loadRuns, loadStreams]);

  const scrape = (groupIds?: string[]) =>
    guard(async () => {
      await api('/scrape', { method: 'POST', body: JSON.stringify({ groupIds }) });
      setProgress(await api<Progress>('/scrape/status'));
    })();

  return (
    <main>
      <header>
        <h1>Group Livestreams</h1>
        <button onClick={() => scrape()} disabled={progress?.running}>
          {progress?.running ? `Scraping ${progress.currentGroup ?? ''}… (${progress.queued} left)` : 'Scrape all active groups'}
        </button>
      </header>
      <nav>
        <button className={tab === 'streams' ? 'tab on' : 'tab'} onClick={() => setTab('streams')}>
          Livestreams
        </button>
        <button className={tab === 'groups' ? 'tab on' : 'tab'} onClick={() => setTab('groups')}>
          Groups ({groups.length})
        </button>
      </nav>
      {error && <p className="error">{error}</p>}
      {progress?.running && progress.log.length > 0 && <pre>{progress.log.join('\n')}</pre>}

      {tab === 'streams' ? (
        <>
          <div className="controls">
            <select value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}>
              <option value="">All groups</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <label>
              <input type="checkbox" checked={liveOnly} onChange={(e) => setLiveOnly(e.target.checked)} /> Live only
            </label>
            <span>{streams.length} URLs</span>
          </div>
          <ul>
            {streams.map((s) => (
              <li key={s.id}>
                {s.isLive && <span className="live">LIVE</span>}
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.url}
                </a>
                <small>
                  {s.groupName} · {new Date(s.firstSeenAt).toLocaleString()}
                </small>
              </li>
            ))}
          </ul>
          <h3>Recent runs</h3>
          <ul>
            {runs.map((r) => (
              <li key={r.id}>
                <span className={`pill ${r.status}`}>{r.status}</span> {r.groupName} — {r.foundCount} found, {r.newCount} new
                {r.error && <small className="error"> {r.error}</small>}
                <small>{new Date(r.startedAt).toLocaleString()}</small>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <GroupsTab groups={groups} reload={loadGroups} scrape={scrape} busy={!!progress?.running} onError={setError} />
      )}
    </main>
  );
}

function GroupsTab(props: {
  groups: Group[];
  reload: () => Promise<void>;
  scrape: (ids: string[]) => void;
  busy: boolean;
  onError: (m: string) => void;
}) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [scrolls, setScrolls] = useState(30);

  const run = async (fn: () => Promise<unknown>) => {
    props.onError('');
    try {
      await fn();
      await props.reload();
    } catch (e) {
      props.onError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <form
        className="controls"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await api('/groups', { method: 'POST', body: JSON.stringify({ name, url, scrolls }) });
            setName('');
            setUrl('');
          });
        }}
      >
        <input required placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input
          required
          className="grow"
          placeholder="https://www.facebook.com/groups/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <label>
          Scrolls <input type="number" min={1} max={500} value={scrolls} onChange={(e) => setScrolls(Number(e.target.value))} />
        </label>
        <button type="submit">Add group</button>
      </form>
      <ul>
        {props.groups.map((g) => (
          <li key={g.id} className="row">
            <div className="grow">
              <strong>{g.name}</strong> <small>{g.livestreamCount ?? 0} URLs</small>
              <br />
              <small>
                {g.url} · {g.scrolls} scrolls · last scraped {g.lastScrapedAt ? new Date(g.lastScrapedAt).toLocaleString() : 'never'}
              </small>
            </div>
            <label>
              <input
                type="checkbox"
                checked={g.isActive}
                onChange={(e) => run(() => api(`/groups/${g.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: e.target.checked }) }))}
              />{' '}
              Active
            </label>
            <label>
              <input
                type="checkbox"
                checked={g.liveOnly}
                onChange={(e) => run(() => api(`/groups/${g.id}`, { method: 'PATCH', body: JSON.stringify({ liveOnly: e.target.checked }) }))}
              />{' '}
              Live only
            </label>
            <button disabled={props.busy} onClick={() => props.scrape([g.id])}>
              Scrape
            </button>
            <button
              onClick={() => confirm(`Delete "${g.name}" and its saved URLs?`) && run(() => api(`/groups/${g.id}`, { method: 'DELETE' }))}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
