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
type Stream = { id: string; videoId: string; url: string; isLive: boolean; firstSeenAt: string; groupId: string; groupName: string };
type Progress = { running: boolean; currentGroup: string | null; queued: number; log: string[] };
type Run = { id: string; groupName: string; status: string; foundCount: number; newCount: number; error: string | null; startedAt: string };

type StreamTab = 'live' | 'reels' | 'all';
const isReel = (s: Stream) => s.url.includes('/reel/');

// The same video can be posted in several groups; keep one entry per video and merge the group names.
function dedupe(list: Stream[]): Stream[] {
  const byVideo = new Map<string, Stream>();
  for (const s of list) {
    const seen = byVideo.get(s.videoId);
    if (!seen) {
      byVideo.set(s.videoId, { ...s });
      continue;
    }
    if (!seen.groupName.split(', ').includes(s.groupName)) seen.groupName += `, ${s.groupName}`;
    seen.isLive = seen.isLive || s.isLive;
    if (s.firstSeenAt < seen.firstSeenAt) seen.firstSeenAt = s.firstSeenAt;
  }
  return [...byVideo.values()];
}

function timeAgo(iso: string): string {
  const sec = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return 'just now';
  const units: [number, string][] = [[86400, 'd'], [3600, 'h'], [60, 'm']];
  for (const [size, label] of units) if (sec >= size) return `${Math.floor(sec / size)}${label} ago`;
  return '';
}

const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?facebook\.com/, '');

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
  const [tab, setTab] = useState<StreamTab | 'groups'>('live');
  const [groups, setGroups] = useState<Group[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [filterGroup, setFilterGroup] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedId, setCopiedId] = useState('');
  const [query, setQuery] = useState('');

  const loadGroups = useCallback(async () => setGroups(await api('/groups')), []);
  const loadRuns = useCallback(async () => setRuns(await api('/scrape/runs')), []);
  const loadStreams = useCallback(async () => {
    const q = new URLSearchParams();
    if (filterGroup) q.set('groupId', filterGroup);
    setStreams(await api(`/livestreams?${q}`));
  }, [filterGroup]);

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

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(shown.map((s) => s.url).join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy to clipboard');
    }
  };

  const unique = dedupe(streams);
  const needle = query.trim().toLowerCase();
  const shown = unique
    .filter((s) => (tab === 'live' ? s.isLive : tab === 'reels' ? isReel(s) : true))
    .filter((s) => !needle || s.url.toLowerCase().includes(needle) || s.groupName.toLowerCase().includes(needle));

  const copyOne = async (s: Stream) => {
    try {
      await navigator.clipboard.writeText(s.url);
      setCopiedId(s.id);
      setTimeout(() => setCopiedId(''), 1200);
    } catch {
      setError('Could not copy to clipboard');
    }
  };

  return (
    <main>
      <header>
        <div>
          <h1>LiveScout</h1>
          <p className="sub">Videos, reels and lives collected from your Facebook groups</p>
        </div>
        <button className="primary" onClick={() => scrape()} disabled={progress?.running}>
          {progress?.running ? `Scraping ${progress.currentGroup ?? ''}… (${progress.queued} left)` : 'Scrape all active groups'}
        </button>
      </header>
      <nav>
        <button className={tab === 'live' ? 'tab on' : 'tab'} onClick={() => setTab('live')}>
          Live ({unique.filter((s) => s.isLive).length})
        </button>
        <button className={tab === 'reels' ? 'tab on' : 'tab'} onClick={() => setTab('reels')}>
          Reels ({unique.filter(isReel).length})
        </button>
        <button className={tab === 'all' ? 'tab on' : 'tab'} onClick={() => setTab('all')}>
          All ({unique.length})
        </button>
        <button className={tab === 'groups' ? 'tab on' : 'tab'} onClick={() => setTab('groups')}>
          Groups ({groups.length})
        </button>
      </nav>
      {error && <p className="error">{error}</p>}
      {tab !== 'groups' ? (
        <>
          <section className="activity">
            <div className="activity-head">
              <strong>Activity</strong>
              {progress?.running ? (
                <span className="running">
                  <span className="dot" /> Scraping {progress.currentGroup ?? '…'} · {progress.queued} queued
                </span>
              ) : (
                <span className="count">{runs[0] ? `Last run ${timeAgo(runs[0].startedAt)}` : 'Idle'}</span>
              )}
            </div>
            {progress?.running && progress.log.length > 0 && <pre>{progress.log.slice(-6).join('\n')}</pre>}
            {runs.length === 0 ? (
              <small>No scrapes yet.</small>
            ) : (
              <ul>
                {runs.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    <span className={`pill ${r.status}`}>{r.status}</span>
                    <span className="grow">
                      {r.groupName} — {r.foundCount} found, <strong>{r.newCount} new</strong>
                      {r.error && <small className="error"> {r.error}</small>}
                    </span>
                    <small title={new Date(r.startedAt).toLocaleString()}>{timeAgo(r.startedAt)}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <div className="controls">
            <select value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}>
              <option value="">All groups</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <input
              type="search"
              className="grow"
              placeholder="Search URL or group…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="count">{shown.length} URLs</span>
            <button className="primary" onClick={copyAll} disabled={!shown.length}>
              {copied ? 'Copied!' : 'Copy all'}
            </button>
          </div>
          {shown.length === 0 ? (
            <div className="empty">
              <strong>Nothing here yet</strong>
              <p>
                {streams.length === 0
                  ? 'Add a group in the Groups tab, then press "Scrape all active groups".'
                  : 'No results match this tab or search.'}
              </p>
            </div>
          ) : (
            <ul className="cards">
              {shown.map((s) => (
                <li key={s.id}>
                  {s.isLive ? <span className="badge live">LIVE</span> : <span className="badge">{isReel(s) ? 'REEL' : 'VIDEO'}</span>}
                  <div className="grow">
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {shortUrl(s.url)}
                    </a>
                    <small>
                      {s.groupName} · <span title={new Date(s.firstSeenAt).toLocaleString()}>{timeAgo(s.firstSeenAt)}</span>
                    </small>
                  </div>
                  <button onClick={() => copyOne(s)}>{copiedId === s.id ? 'Copied!' : 'Copy'}</button>
                </li>
              ))}
            </ul>
          )}
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
