import React, { useCallback, useEffect, useState } from "react";
import TopMenu from "./top-menu/TopMenu.jsx";
import Banner from "./components/Banner.jsx";
import IntentTable from "./components/IntentTable.jsx";
import IntentForm from "./components/IntentForm.jsx";
import Resolver from "./components/Resolver.jsx";
import EncoderProbe from "./components/EncoderProbe.jsx";
import DiagramTab from "./components/DiagramTab.jsx";
import TalkTrack from "./components/TalkTrack.jsx";
import ShelfLink from "./components/ShelfLink.jsx";
import VerifyMark from "./components/VerifyMark.jsx";
import { workspaceId } from "./workspace";

const TABS = [
  { id: "intents", label: "Intents" },
  { id: "resolve", label: "Resolve" },
  { id: "encoder", label: "Encoder" },
  { id: "diagram", label: "Diagram" },
  { id: "facts", label: "Facts & Talk" },
];

export default function App() {
  const [tab, setTab] = useState("intents");
  const [story, setStory] = useState(null);
  const [info, setInfo] = useState(null);
  const [intents, setIntents] = useState([]);
  const [config, setConfig] = useState(null);
  const [editing, setEditing] = useState(null); // null | "new" | intent object
  const [error, setError] = useState(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [present, setPresent] = useState(false);
  const [talkOpen, setTalkOpen] = useState(false);
  const [theme, setTheme] = useState(() => (localStorage.getItem("theme") || "auto"));

  useEffect(() => {
    document.documentElement.dataset.theme = theme === "auto" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  const loadAll = useCallback(async () => {
    try {
      const [s, i, ints, cfg] = await Promise.all([
        fetch("/api/scenarios").then((r) => r.json()),
        fetch("/api/info").then((r) => r.json()),
        fetch("/api/intents").then((r) => r.json()),
        fetch("/api/app-config").then((r) => r.json()),
      ]);
      setStory(s); setInfo(i); setIntents(ints.intents ?? []); setConfig(cfg.config);
      setError(null);
    } catch (e) {
      setError(String(e.message || e));
    }
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);

  const saveConfig = async (next) => {
    const r = await fetch("/api/app-config", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
    const j = await r.json();
    if (r.ok) setConfig(j.config);
    return r.ok ? null : j;
  };

  const saveIntent = async (body, existingName) => {
    const url = existingName ? `/api/intents/${encodeURIComponent(existingName)}` : "/api/intents";
    const r = await fetch(url, { method: existingName ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (r.ok) { setEditing(null); await loadAll(); return null; }
    return j;
  };

  const deleteIntent = async (name) => {
    await fetch(`/api/intents/${encodeURIComponent(name)}`, { method: "DELETE" });
    await loadAll();
  };

  const revalidate = async () => {
    await fetch("/api/intents/revalidate", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    await loadAll();
  };

  const reset = async () => {
    await fetch("/api/reset", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    setResetSignal((n) => n + 1);
    await loadAll();
  };

  const setMode = async (source) => {
    const r = await fetch("/api/mode", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source }) });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.detail || j.error || `HTTP ${r.status}`);
      return false;
    }
    await loadAll();
    return true;
  };

  if (error && !story) return <p className="app-error">The lab could not start: {error}</p>;
  if (!story || !config) return <p className="muted">Loading…</p>;

  return (
    <div className={present ? "app app--presenter" : "app"}>
      <header className="shell-bar">
        <span className="shell-brand">
          <span className="shell-logo">AI</span>
          AI Intents Console Lab
          <span className={`shell-badge ${info?.mode === "real" ? "shell-badge--real" : ""}`} data-testid="mode-badge">{info?.mode ?? "…"}</span>
        </span>
        <nav className="shell-nav" aria-label="Tabs">
          {TABS.map((t) => (
            <a key={t.id} href={`#${t.id}`} aria-current={tab === t.id ? "page" : undefined} onClick={(e) => { e.preventDefault(); setTab(t.id); }}>{t.label}</a>
          ))}
        </nav>
        <TopMenu
          mode={{ value: info?.mode ?? "mock", onChange: setMode, realAvailable: info?.realAvailable, realHint: info?.realHint }}
          theme={{ value: theme, onChange: setTheme }}
          present={{ active: present, onToggle: () => setPresent((p) => !p) }}
          talkTrack={{ active: talkOpen, onToggle: () => setTalkOpen((t) => !t) }}
          onReset={reset}
          version={info?.version ? `v${info.version}` : undefined}
        >
          <ShelfLink />
          <VerifyMark id="intent-console-lab" />
        </TopMenu>
      </header>
      <main className="page">
        <Banner story={story} mode={info?.mode} />
        <p className="keys">Workspace {workspaceId()} · everything simulated · no tenant, no outbound network</p>
        {error && <p className="field-error" data-testid="app-error" role="alert">{error}</p>}
        {tab === "intents" && (
          <section data-testid="tab-intents">
            {editing && <IntentForm initial={editing === "new" ? null : intents.find((i) => i.ObjectMeta.Name === editing)} onSave={saveIntent} onCancel={() => setEditing(null)} />}
            {!editing && <p className="actions"><button onClick={() => setEditing("new")} data-testid="new-intent">New intent</button></p>}
            <IntentTable intents={intents} selected={config.IntentIDs ?? []} onToggle={(name) => {
              const next = (config.IntentIDs ?? []).includes(name) ? config.IntentIDs.filter((n) => n !== name) : [...(config.IntentIDs ?? []), name];
              saveConfig({ ...config, IntentIDs: next });
            }} onEdit={setEditing} onDelete={deleteIntent} revalidate={revalidate} />
          </section>
        )}
        {tab === "resolve" && (
          <section data-testid="tab-resolve"><Resolver intents={intents} config={config} onConfigChange={saveConfig} /></section>
        )}
        {tab === "encoder" && <section data-testid="tab-encoder"><EncoderProbe /></section>}
        {tab === "diagram" && <DiagramTab vertical="retail" resetSignal={resetSignal} />}
        {tab === "facts" && (
          <section data-testid="tab-facts">
            <div className="panel">
              <h2>Facts — what is measured, what is not</h2>
              <ul className="facts">
                {story.facts.map((f) => (
                  <li key={f.id}>
                    <span className={`tag ${f.status === "measured" ? "tag--ok" : f.status === "UNVERIFIED" ? "tag--warn" : ""}`}>{f.status}</span> {f.text}
                  </li>
                ))}
              </ul>
            </div>
            <div className="panel">
              <h2>Scenarios</h2>
              <ol className="facts">
                {story.scenarios.map((sc) => <li key={sc.id}><strong>{sc.title}.</strong> {sc.lesson}</li>)}
              </ol>
            </div>
            {talkOpen && <div className="panel"><h2>Talk track</h2><TalkTrack talk={story.talkTrack.map((t, i) => ({ ...t, id: i }))} /></div>}
          </section>
        )}
      </main>
    </div>
  );
}
