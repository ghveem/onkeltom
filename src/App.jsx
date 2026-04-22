import { useEffect, useMemo, useRef, useState } from 'react';
import createAuth0Client from '@auth0/auth0-spa-js';
import { Hero, OneColumn } from '@ndla/ui';

const config = window.NDLA_UPLOADER_CONFIG;
const STORAGE_KEY = 'ndla-uploader-env';

const defaultGlobal = {
  language: 'nb',
  alttext: '',
  caption: '',
  copyrightOrigin: '',
  creators: '',
  rightsholders: '',
  tags: '',
  license: config.licenseOptions?.[0]?.value ?? 'CC-BY-4.0',
  licenseDescription: config.licenseOptions?.[0]?.description ?? '',
  bearbeidet: false,
  modelRelease: 'not-set',
};

const defaultSeries = {
  createSeries: false,
  title: '',
  description: '',
};

const defaultBatch = {
  alttext: '',
  caption: '',
  tags: '',
  appendTags: true,
  bearbeidet: false,
  setBearbeidet: false,
};

function sanitizeTitle(filename) {
  return filename.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
}

function autoTagsFromFilename(filename) {
  return [...new Set(
    filename
      .replace(/\.[^/.]+$/, '')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 2 && !/^\d+$/.test(tag))
  )];
}

function parseLines(value) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ name: line }));
}

function mergeTags(existing, incoming, append = true) {
  const current = existing.split(',').map((t) => t.trim()).filter(Boolean);
  const next = incoming.split(',').map((t) => t.trim()).filter(Boolean);
  const merged = append ? [...current, ...next] : next;
  return [...new Set(merged)].join(', ');
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPerFile(file, global) {
  return {
    id: crypto.randomUUID(),
    file,
    title: sanitizeTitle(file.name),
    alttext: global.alttext,
    caption: global.caption,
    tags: [...new Set([...autoTagsFromFilename(file.name), ...global.tags.split(',').map((t) => t.trim()).filter(Boolean)])].join(', '),
    bearbeidet: global.bearbeidet,
    status: 'klar',
    error: '',
    responseId: '',
    previewUrl: URL.createObjectURL(file),
    selected: true,
  };
}

function buildMetadata(item, global, seriesId) {
  return {
    title: { title: item.title, language: global.language },
    alttext: { alttext: item.alttext, language: global.language },
    caption: { caption: item.caption, language: global.language },
    tags: { tags: item.tags.split(',').map((t) => t.trim()).filter(Boolean), language: global.language },
    copyright: {
      license: {
        license: global.license,
        description: global.licenseDescription,
      },
      origin: global.copyrightOrigin,
      creators: parseLines(global.creators).map((entry) => ({ type: 'creator', name: entry.name })),
      rightsholders: parseLines(global.rightsholders).map((entry) => ({ type: 'rightsholder', name: entry.name })),
      processors: [],
      processed: item.bearbeidet,
    },
    modelRelease: global.modelRelease,
    ...(seriesId ? { imageSeriesId: seriesId } : {}),
  };
}

export default function App() {
  const [envKey, setEnvKey] = useState(localStorage.getItem(STORAGE_KEY) || config.defaultEnvironment || 'test');
  const env = config.envs[envKey];
  const [auth0, setAuth0] = useState(null);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState('');
  const [globalMeta, setGlobalMeta] = useState(defaultGlobal);
  const [seriesMeta, setSeriesMeta] = useState(defaultSeries);
  const [batchEdit, setBatchEdit] = useState(defaultBatch);
  const [items, setItems] = useState([]);
  const [dragIndex, setDragIndex] = useState(null);
  const [logs, setLogs] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState({ total: 0, completed: 0, success: 0, failed: 0, phase: 'idle', currentFile: '' });
  const fileInputRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, envKey);
  }, [envKey]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const client = await createAuth0Client({
        domain: env.auth0Domain,
        clientId: env.clientId,
        authorizationParams: {
          audience: env.audience,
          redirect_uri: window.location.origin + window.location.pathname,
          scope: env.scopes,
          connection: env.connection,
          prompt: 'login',
        },
        cacheLocation: 'localstorage',
      });

      if (window.location.search.includes('code=')) {
        await client.handleRedirectCallback();
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      const authenticated = await client.isAuthenticated();
      if (cancelled) return;
      setAuth0(client);

      if (authenticated) {
        const profile = await client.getUser();
        const accessToken = await client.getTokenSilently({
          authorizationParams: {
            audience: env.audience,
            scope: env.scopes,
          },
        });
        if (cancelled) return;
        setUser(profile);
        setToken(accessToken);
      } else {
        setUser(null);
        setToken('');
      }
    }
    init().catch((error) => {
      setLogs((prev) => [{ type: 'error', message: `Auth-feil: ${error.message}` }, ...prev]);
    });
    return () => {
      cancelled = true;
    };
  }, [env]);

  const selectedCount = useMemo(() => items.filter((item) => item.selected).length, [items]);
  const failedItems = useMemo(() => items.filter((item) => item.status === 'feilet'), [items]);

  function addLog(type, message) {
    setLogs((prev) => [{ type, message, at: new Date().toLocaleTimeString('nb-NO') }, ...prev].slice(0, 40));
  }

  async function handleLogin() {
    if (!auth0) return;
    await auth0.loginWithRedirect({
      authorizationParams: {
        audience: env.audience,
        scope: env.scopes,
        connection: env.connection,
      },
    });
  }

  async function handleLogout() {
    if (!auth0) return;
    await auth0.logout({ logoutParams: { returnTo: window.location.origin + window.location.pathname } });
  }

  function handleFiles(fileList) {
    const next = Array.from(fileList)
      .filter((file) => file.type.startsWith('image/'))
      .map((file) => buildPerFile(file, globalMeta));
    setItems((prev) => [...prev, ...next]);
    addLog('info', `${next.length} filer lagt til.`);
  }

  function updateItem(id, patch) {
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function applyBatchEdit() {
    setItems((prev) => prev.map((item) => {
      if (!item.selected) return item;
      return {
        ...item,
        alttext: batchEdit.alttext || item.alttext,
        caption: batchEdit.caption || item.caption,
        tags: batchEdit.tags ? mergeTags(item.tags, batchEdit.tags, batchEdit.appendTags) : item.tags,
        bearbeidet: batchEdit.setBearbeidet ? batchEdit.bearbeidet : item.bearbeidet,
      };
    }));
    addLog('info', `Batch-redigering brukt på ${selectedCount} bilder.`);
  }

  async function ensureSeries(accessToken) {
    if (!seriesMeta.createSeries || !seriesMeta.title.trim()) return null;
    setProgress((prev) => ({ ...prev, phase: 'Oppretter serie' }));
    const response = await fetch(`${env.apiBase}${config.endpoints.createSeriesPath}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: seriesMeta.title,
        description: seriesMeta.description,
      }),
    });
    if (!response.ok) {
      throw new Error(`Serie kunne ikke opprettes (${response.status})`);
    }
    const data = await response.json();
    addLog('success', `Serie opprettet: ${seriesMeta.title}`);
    return data.id ?? data.seriesId ?? null;
  }

  async function uploadSingle(item, accessToken, seriesId) {
    const metadata = buildMetadata(item, globalMeta, seriesId);
    const formData = new FormData();
    formData.append('file', item.file);
    formData.append('metadata', JSON.stringify(metadata));

    const response = await fetch(`${env.apiBase}${config.endpoints.uploadPath}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Upload feilet (${response.status})`);
    }

    return response.json();
  }

  async function runQueue(uploadItems, accessToken, seriesId) {
    const queue = [...uploadItems];
    const concurrency = config.upload.maxConcurrent;
    const delayMs = config.upload.delayMs;

    async function worker() {
      while (queue.length) {
        const current = queue.shift();
        setProgress((prev) => ({ ...prev, currentFile: current.file.name, phase: 'Laster opp bilder' }));
        updateItem(current.id, { status: 'laster-opp', error: '' });
        try {
          let result = null;
          let lastError = null;
          for (let attempt = 0; attempt <= config.upload.retryAttempts; attempt += 1) {
            try {
              result = await uploadSingle(current, accessToken, seriesId);
              lastError = null;
              break;
            } catch (error) {
              lastError = error;
              if (attempt < config.upload.retryAttempts) {
                await wait(delayMs * (attempt + 1));
              }
            }
          }
          if (lastError) throw lastError;
          updateItem(current.id, { status: 'ok', responseId: String(result?.id ?? '') });
          setProgress((prev) => ({ ...prev, completed: prev.completed + 1, success: prev.success + 1 }));
          addLog('success', `${current.file.name} lastet opp.`);
        } catch (error) {
          updateItem(current.id, { status: 'feilet', error: error.message });
          setProgress((prev) => ({ ...prev, completed: prev.completed + 1, failed: prev.failed + 1 }));
          addLog('error', `${current.file.name}: ${error.message}`);
        }
        await wait(delayMs);
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length || 1) }, worker));
  }

  async function startUpload(retryOnly = false) {
    if (!token) {
      addLog('error', 'Du må logge inn før opplasting.');
      return;
    }

    const uploadItems = items.filter((item) => retryOnly ? item.status === 'feilet' : item.selected);
    if (!uploadItems.length) {
      addLog('info', 'Ingen bilder valgt for opplasting.');
      return;
    }

    setIsUploading(true);
    setProgress({ total: uploadItems.length, completed: 0, success: 0, failed: 0, phase: 'Forbereder', currentFile: '' });

    try {
      let seriesId = null;
      try {
        seriesId = await ensureSeries(token);
      } catch (error) {
        addLog('error', `${error.message}. Fortsetter uten serie-ID hvis du prøver igjen etter justering.`);
        throw error;
      }

      await runQueue(uploadItems, token, seriesId);
      setProgress((prev) => ({ ...prev, phase: 'Ferdig', currentFile: '' }));
    } finally {
      setIsUploading(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }

  function moveItem(targetIndex) {
    if (dragIndex === null || dragIndex === targetIndex) return;
    setItems((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(dragIndex, 1);
      copy.splice(targetIndex, 0, moved);
      return copy;
    });
    setDragIndex(null);
  }

  function licenseChange(value) {
    const option = config.licenseOptions.find((item) => item.value === value);
    setGlobalMeta((prev) => ({ ...prev, license: value, licenseDescription: option?.description ?? prev.licenseDescription }));
  }

  const progressPercent = progress.total ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="page-shell">
      <Hero>
        <OneColumn>
          <div className="hero-card">
            <p className="eyebrow">NDLA bildeopplaster</p>
            <h1>Batch-opplasting til image-api</h1>
            <p>React/Vite-versjon med test og staging, Google-innlogging, serieopprettelse, thumbnails, batch-redigering og gjenopptak ved feil.</p>
          </div>
        </OneColumn>
      </Hero>

      <main className="container">
        <section className="panel panel-grid two-up">
          <div>
            <h2>Miljø og innlogging</h2>
            <label>Miljø</label>
            <select value={envKey} onChange={(e) => setEnvKey(e.target.value)} disabled={isUploading}>
              {Object.entries(config.envs).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
            </select>
            <p className="meta">API-base: <code>{env.apiBase}</code></p>
            {user ? (
              <div className="auth-row">
                <div>
                  <strong>{user.name || user.email}</strong>
                  <div className="meta">Innlogget</div>
                </div>
                <button className="primary" onClick={handleLogout}>Logg ut</button>
              </div>
            ) : (
              <button className="primary" onClick={handleLogin}>Logg inn med Google</button>
            )}
          </div>
          <div>
            <h2>Fremdrift</h2>
            <div className="progress-wrap">
              <div className="progress-top">
                <span>{progress.phase}</span>
                <span>{progress.completed}/{progress.total}</span>
              </div>
              <progress value={progressPercent} max="100" />
              <div className="meta">{progressPercent}% · OK: {progress.success} · Feil: {progress.failed}</div>
              <div className="meta">Nå: {progress.currentFile || '—'}</div>
            </div>
            <div className="button-row wrap">
              <button className="primary" onClick={() => startUpload(false)} disabled={isUploading || !items.length}>Start opplasting</button>
              <button onClick={() => startUpload(true)} disabled={isUploading || !failedItems.length}>Prøv feilede på nytt</button>
              <button onClick={() => { items.forEach((item) => URL.revokeObjectURL(item.previewUrl)); setItems([]); }} disabled={isUploading}>Tøm liste</button>
            </div>
          </div>
        </section>

        <section className="panel">
          <h2>Felles metadata</h2>
          <div className="form-grid">
            <div>
              <label>Språk</label>
              <input value={globalMeta.language} onChange={(e) => setGlobalMeta((p) => ({ ...p, language: e.target.value }))} />
            </div>
            <div>
              <label>Lisens</label>
              <select value={globalMeta.license} onChange={(e) => licenseChange(e.target.value)}>
                {config.licenseOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="full-width">
              <label>Lisensbeskrivelse</label>
              <input value={globalMeta.licenseDescription} onChange={(e) => setGlobalMeta((p) => ({ ...p, licenseDescription: e.target.value }))} />
            </div>
            <div className="full-width">
              <label>Alt-tekst (brukes som standard)</label>
              <textarea value={globalMeta.alttext} onChange={(e) => setGlobalMeta((p) => ({ ...p, alttext: e.target.value }))} rows="2" />
            </div>
            <div className="full-width">
              <label>Bildetekst (brukes som standard)</label>
              <textarea value={globalMeta.caption} onChange={(e) => setGlobalMeta((p) => ({ ...p, caption: e.target.value }))} rows="2" />
            </div>
            <div className="full-width">
              <label>Felles emneord (kommaseparert)</label>
              <input value={globalMeta.tags} onChange={(e) => setGlobalMeta((p) => ({ ...p, tags: e.target.value }))} />
            </div>
            <div>
              <label>Opphav / kilde</label>
              <input value={globalMeta.copyrightOrigin} onChange={(e) => setGlobalMeta((p) => ({ ...p, copyrightOrigin: e.target.value }))} />
            </div>
            <div>
              <label>Model release</label>
              <input value={globalMeta.modelRelease} onChange={(e) => setGlobalMeta((p) => ({ ...p, modelRelease: e.target.value }))} />
            </div>
            <div className="full-width">
              <label>Opphavspersoner (én per linje)</label>
              <textarea value={globalMeta.creators} onChange={(e) => setGlobalMeta((p) => ({ ...p, creators: e.target.value }))} rows="3" />
            </div>
            <div className="full-width">
              <label>Rettighetshavere (én per linje)</label>
              <textarea value={globalMeta.rightsholders} onChange={(e) => setGlobalMeta((p) => ({ ...p, rightsholders: e.target.value }))} rows="3" />
            </div>
            <label className="checkbox full-width">
              <input type="checkbox" checked={globalMeta.bearbeidet} onChange={(e) => setGlobalMeta((p) => ({ ...p, bearbeidet: e.target.checked }))} />
              Bearbeidet som standard på nye filer
            </label>
          </div>
        </section>

        <section className="panel panel-grid two-up">
          <div>
            <h2>Serie</h2>
            <label className="checkbox">
              <input type="checkbox" checked={seriesMeta.createSeries} onChange={(e) => setSeriesMeta((p) => ({ ...p, createSeries: e.target.checked }))} />
              Opprett serie automatisk før opplasting
            </label>
            <label>Serietittel</label>
            <input value={seriesMeta.title} onChange={(e) => setSeriesMeta((p) => ({ ...p, title: e.target.value }))} />
            <label>Seriebeskrivelse</label>
            <textarea rows="3" value={seriesMeta.description} onChange={(e) => setSeriesMeta((p) => ({ ...p, description: e.target.value }))} />
          </div>
          <div>
            <h2>Batch-redigering av valgte bilder</h2>
            <div className="meta">{selectedCount} valgt</div>
            <label>Alt-tekst</label>
            <input value={batchEdit.alttext} onChange={(e) => setBatchEdit((p) => ({ ...p, alttext: e.target.value }))} />
            <label>Bildetekst</label>
            <input value={batchEdit.caption} onChange={(e) => setBatchEdit((p) => ({ ...p, caption: e.target.value }))} />
            <label>Emneord (kommaseparert)</label>
            <input value={batchEdit.tags} onChange={(e) => setBatchEdit((p) => ({ ...p, tags: e.target.value }))} />
            <label className="checkbox">
              <input type="checkbox" checked={batchEdit.appendTags} onChange={(e) => setBatchEdit((p) => ({ ...p, appendTags: e.target.checked }))} />
              Legg til i eksisterende emneord i stedet for å erstatte
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={batchEdit.setBearbeidet} onChange={(e) => setBatchEdit((p) => ({ ...p, setBearbeidet: e.target.checked }))} />
              Sett bearbeidet på valgte bilder
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={batchEdit.bearbeidet} onChange={(e) => setBatchEdit((p) => ({ ...p, bearbeidet: e.target.checked }))} />
              Bearbeidet
            </label>
            <button onClick={applyBatchEdit}>Bruk på valgte</button>
          </div>
        </section>

        <section className="panel">
          <div className="toolbar">
            <div>
              <h2>Bilder</h2>
              <p className="meta">Tittel hentes fra filnavn som standard, men kan overstyres per bilde.</p>
            </div>
            <div className="button-row wrap">
              <button onClick={() => fileInputRef.current?.click()}>Velg filer</button>
              <button onClick={() => setItems((prev) => prev.map((item) => ({ ...item, selected: true })))}>Velg alle</button>
              <button onClick={() => setItems((prev) => prev.map((item) => ({ ...item, selected: false })))}>Fjern valg</button>
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
          <div className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
            Dra og slipp bilder her, eller bruk knappen over.
          </div>

          <div className="image-grid">
            {items.map((item, index) => (
              <article
                key={item.id}
                className="thumb-card"
                draggable
                onDragStart={() => setDragIndex(index)}
                onDrop={() => moveItem(index)}
                onDragOver={(e) => e.preventDefault()}
              >
                <img src={item.previewUrl} alt="Forhåndsvisning" />
                <div className="thumb-body">
                  <label className="checkbox compact">
                    <input type="checkbox" checked={item.selected} onChange={(e) => updateItem(item.id, { selected: e.target.checked })} />
                    Velg
                  </label>
                  <label>Tittel</label>
                  <input value={item.title} onChange={(e) => updateItem(item.id, { title: e.target.value })} />
                  <label>Alt-tekst</label>
                  <textarea rows="2" value={item.alttext} onChange={(e) => updateItem(item.id, { alttext: e.target.value })} />
                  <label>Bildetekst</label>
                  <textarea rows="2" value={item.caption} onChange={(e) => updateItem(item.id, { caption: e.target.value })} />
                  <label>Emneord</label>
                  <input value={item.tags} onChange={(e) => updateItem(item.id, { tags: e.target.value })} />
                  <label className="checkbox compact">
                    <input type="checkbox" checked={item.bearbeidet} onChange={(e) => updateItem(item.id, { bearbeidet: e.target.checked })} />
                    Bearbeidet
                  </label>
                  <div className={`status ${item.status}`}>{({ 'klar': 'klar', 'laster-opp': 'laster opp', 'ok': 'ok', 'feilet': 'feilet' })[item.status] || item.status}{item.responseId ? ` · id ${item.responseId}` : ''}</div>
                  {item.error ? <div className="error-box">{item.error}</div> : null}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel panel-grid two-up">
          <div>
            <h2>Metadata-preview</h2>
            <div className="preview-list">
              {items.slice(0, 5).map((item) => (
                <pre key={item.id}>{JSON.stringify(buildMetadata(item, globalMeta, seriesMeta.createSeries ? 'SERIES_ID' : null), null, 2)}</pre>
              ))}
              {!items.length ? <p className="meta">Legg til bilder for å se preview.</p> : null}
            </div>
          </div>
          <div>
            <h2>Hendelseslogg</h2>
            <div className="log-list">
              {logs.map((log, idx) => <div key={`${log.at}-${idx}`} className={`log-item ${log.type}`}>[{log.at}] {log.message}</div>)}
              {!logs.length ? <p className="meta">Ingen hendelser enda.</p> : null}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
