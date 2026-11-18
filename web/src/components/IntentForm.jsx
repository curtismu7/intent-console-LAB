import React from "react";

// The intent editor form: Description, Exemplars, Twins, Patterns, Acts, Floor — one field per console
// Spec entry. create or edit. Errors come back from the server and are shown under the form.
export default function IntentForm({ initial, onSave, onCancel }) {
  const editing = Boolean(initial?.ObjectMeta?.Name);
  const [name, setName] = React.useState(initial?.ObjectMeta?.Name ?? "");
  const [description, setDescription] = React.useState(initial?.Spec?.Description ?? "");
  const [exemplars, setExemplars] = React.useState((initial?.Spec?.Exemplars ?? []).join("\n"));
  const [twins, setTwins] = React.useState((initial?.Spec?.Twins ?? []).join(", "));
  const [patterns, setPatterns] = React.useState((initial?.Spec?.Patterns ?? []).join("\n"));
  const [acts, setActs] = React.useState(initial?.Spec?.Acts ?? true);
  const [floor, setFloor] = React.useState(initial?.Spec?.Floor ?? 0.72);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const lines = (text) => text.split("\n").map((s) => s.trim()).filter(Boolean);
  const commas = (text) => text.split(",").map((s) => s.trim()).filter(Boolean);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = { Spec: { Description: description, Exemplars: lines(exemplars), Twins: commas(twins), Patterns: lines(patterns), Acts: acts, Floor: Number(floor) } };
    if (!editing) body.name = name.trim();
    const r = await onSave(body, editing ? initial.ObjectMeta.Name : null);
    setBusy(false);
    if (r?.error) setError(r.detail || r.error);
  };

  return (
    <form className="intent-form card" onSubmit={submit} data-testid="intent-form">
      <h3>{editing ? `Edit intent: ${initial.ObjectMeta.Name}` : "New intent"}</h3>
      <label>Name
        <input value={name} onChange={(e) => setName(e.target.value)} disabled={editing} placeholder="lowercase-with-dashes" data-testid="intent-name" required />
      </label>
      <label>Description
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500} data-testid="intent-description" required />
      </label>
      <label>Exemplars — one example phrase per line (at least one; an intent with no exemplar cannot match anything)
        <textarea value={exemplars} onChange={(e) => setExemplars(e.target.value)} rows={3} data-testid="intent-exemplars" required />
      </label>
      <label>Twins — comma-separated intent names this one must be told apart from
        <input value={twins} onChange={(e) => setTwins(e.target.value)} placeholder="e.g. transfer-funds" data-testid="intent-twins" />
      </label>
      <label>Patterns — optional extra phrases (not scored, shown to the reviewer)
        <textarea value={patterns} onChange={(e) => setPatterns(e.target.value)} rows={2} data-testid="intent-patterns" />
      </label>
      <label className="check"><input type="checkbox" checked={acts} onChange={(e) => setActs(e.target.checked)} data-testid="intent-acts" />
        Acts — this intent authorizes an action (off = it only describes; the lab denies actions matched only by it)</label>
      <label>Floor — minimum similarity (0 to 1) for an action to match this intent
        <input type="number" min="0" max="1" step="0.01" value={floor} onChange={(e) => setFloor(e.target.value)} data-testid="intent-floor" />
      </label>
      {error && <p className="error" data-testid="intent-form-error">{error}</p>}
      <p className="actions">
        <button type="submit" disabled={busy} data-testid="intent-save">{editing ? "Save" : "Create"}</button>
        {" "}
        <button type="button" className="secondary" onClick={onCancel} data-testid="intent-cancel">Cancel</button>
      </p>
    </form>
  );
}
