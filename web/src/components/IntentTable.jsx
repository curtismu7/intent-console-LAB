import React from "react";
import Json from "./Json.jsx";

// The intents table: name, description, exemplars, twins, Acts chip, Floor, validation status with warnings.
// The Form/JSON toggle (rule 24) is per intent through the shared JsonPane.
export default function IntentTable({ intents, selected, onToggle, onEdit, onDelete, revalidate }) {
  const [open, setOpen] = React.useState(null);
  if (!intents?.length) return <p className="muted" data-testid="no-intents">No intents defined. Create one, or Reset to restore the three seed intents.</p>;
  return (
    <div data-testid="intent-table">
      <table className="intent-table">
        <thead>
          <tr><th>In app</th><th>Name</th><th>Description</th><th>Exemplars</th><th>Twins</th><th>Acts</th><th>Floor</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {intents.map((i) => {
            const name = i.ObjectMeta.Name;
            return (
              <tr key={name} data-testid={`intent-row-${name}`}>
                <td>
                  <input type="checkbox" aria-label={`select ${name} for the app`} checked={selected.includes(name)} onChange={() => onToggle(name)} />
                </td>
                <td><strong>{name}</strong>{i.State === "Disabled" && <span className="chip">disabled</span>}</td>
                <td className="wrap">{i.Spec.Description}</td>
                <td className="wrap small">{i.Spec.Exemplars.join(" · ")}</td>
                <td>{i.Spec.Twins.join(", ") || "—"}</td>
                <td>{i.Spec.Acts ? <span className="chip chip-allow" data-testid={`acts-${name}`}>acts</span> : <span className="chip chip-deny" data-testid={`acts-${name}`}>read-only</span>}</td>
                <td>{i.Spec.Floor}</td>
                <td className="small">
                  <span className={i.Status.Warnings?.length ? "chip chip-warn" : "chip chip-ok"} data-testid={`validation-${name}`}>{i.Status.Validation}</span>
                  {i.Status.Warnings?.map((w, n) => <p key={n} className="warn-text">{w}</p>)}
                </td>
                <td className="nowrap">
                  <button className="link" onClick={() => setOpen(open === name ? null : name)}>{open === name ? "Form" : "JSON"}</button>
                  {" "}
                  <button className="link" onClick={() => onEdit(name)}>Edit</button>
                  {" "}
                  <button className="link link-danger" onClick={() => onDelete(name)}>Delete</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {open && (
        <div className="intent-json" data-testid={`intent-json-${open}`}>
          <Json value={intents.find((i) => i.ObjectMeta.Name === open)} hot={["ObjectMeta.Name", "Spec.Acts", "Spec.Floor"]} />
        </div>
      )}
      <p className="small muted">
        Shapes are the console's (imodelAIIntent, measured 2026-11-18); every value is lab-authored — the owner tenant had zero intents.
        {" "}
        <button className="link" onClick={revalidate} data-testid="revalidate">Re-validate all</button>
      </p>
    </div>
  );
}
