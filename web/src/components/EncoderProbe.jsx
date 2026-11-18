import React from "react";

// The encoder probe: the KServe v2 model_info shape, a live infer against the lab's own sidecar route,
// and the honest stand-in note. Bounded like the server: 4 texts, 2000 chars each.
export default function EncoderProbe() {
  const [info, setInfo] = React.useState(null);
  const [texts, setTexts] = React.useState("move 200 dollars from checking to savings\nbook a flight to Chicago");
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/encoder/info").then((r) => r.json()).then(setInfo).catch(() => {});
  }, []);

  const run = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const data = texts.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 4);
      const r = await fetch("/api/encoder/infer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ inputs: [{ name: "TEXT", data }] }) });
      const j = await r.json();
      if (!r.ok) setError(j.detail || j.error || `HTTP ${r.status}`);
      else setResult(j);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="encoder-probe">
      <div className="card">
        <h3>The encoder sidecar (KServe v2 wire)</h3>
        {info && (
          <table className="score-table" data-testid="encoder-info">
            <tbody>
              <tr><th>Model</th><td>{info.name} v{info.versions?.[0]}</td></tr>
              <tr><th>Input</th><td>{info.inputs?.[0]?.name} ({info.inputs?.[0]?.datatype})</td></tr>
              <tr><th>Output</th><td>{info.outputs?.[0]?.name} ({info.outputs?.[0]?.datatype}) shape {info.outputs?.[0]?.shape?.join("×")}</td></tr>
            </tbody>
          </table>
        )}
        <p className="small muted">The real product sends action text to an encoder endpoint and reads back a vector (we measured the console probing KServe v2 paths). This lab's model is a stand-in: a deterministic hashed character-trigram vector — same wire shape, no GPU, no download. What the product does with the vector is UNVERIFIED.</p>
      </div>
      <form className="card" onSubmit={run}>
        <h3>Try the wire</h3>
        <label>Texts to embed — one per line, up to 4
          <textarea value={texts} onChange={(e) => setTexts(e.target.value)} rows={3} data-testid="encoder-texts" />
        </label>
        <p className="actions"><button type="submit" disabled={busy} data-testid="encoder-run">Infer</button></p>
      </form>
      {error && <p className="error" data-testid="encoder-error">{error}</p>}
      {result && (
        <div className="card" data-testid="encoder-result">
          <p>Embedding: {result.outputs?.[0]?.data?.length} FP32 values (first 12 shown)</p>
          <p className="small mono">{result.outputs?.[0]?.data?.slice(0, 12).map((v) => v.toFixed(4)).join(", ")}…</p>
          <details>
            <summary>Raw response (JSON)</summary>
            <pre className="mono small">{`{ model_name: "${result.model_name}", outputs: [{ name: "${result.outputs?.[0]?.name}", shape: [${result.outputs?.[0]?.shape}] }] }`}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
