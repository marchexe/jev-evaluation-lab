'use client';
import React, { useState } from 'react';
import { defaultConfigurations, validateQuestionConfiguration, configurationIdentity } from '../src/question-config.js';
import { downloadJson } from '../src/ui/history';
import { parseImport, MAX_IMPORT_BYTES } from '../src/ui/import-export';

export type QuestionConfiguration = { schemaVersion: number; kind: string; version: string;
  questions: Record<string, { type: string; instructions: string; criteria: Record<string, string> | string[] }> };

export function QuestionEditor({ kind, disabled = false, onApply }: {
  kind: 'governance' | 'evidence'; disabled?: boolean; onApply: (config: QuestionConfiguration) => void;
}) {
  const base = defaultConfigurations[kind] as QuestionConfiguration;
  const [draft, setDraft] = useState<QuestionConfiguration>(() => structuredClone(base));
  const [applied, setApplied] = useState(base); const [message, setMessage] = useState('');
  function edit(name: string, field: 'instructions' | 'criteria', value: string, label?: string) {
    setDraft((old) => { const next = structuredClone(old); const question = next.questions[name];
      if (field === 'instructions') question.instructions = value;
      else if (Array.isArray(question.criteria)) question.criteria[Number(label)] = value;
      else question.criteria[label!] = value;
      return next;
    });
  }
  return <details className="type-reference question-editor"><summary>Edit {kind} questions · active {applied.version}</summary>
    <p className="view-note">Edits stay local until applied. Apply and reset make no API request. The next explicit execution records the exact configuration. Keep category identities; use a new version for edited wording.</p>
    <label>Question version<input value={draft.version} maxLength={80} disabled={disabled} onChange={(e) => setDraft({ ...draft, version: e.target.value })} /></label>
    {Object.entries(draft.questions).map(([name, question]) => <details key={name} className="rubric"><summary>{name} · {question.type}</summary>
      <label>Instructions for {name}<textarea aria-label={`Instructions for ${name}`} value={question.instructions} maxLength={2000} disabled={disabled} onChange={(e) => edit(name, 'instructions', e.target.value)} /></label>
      {Object.entries(question.criteria).map(([label, value]) => <label key={label}>{name} / {question.type === 'score' ? `level ${label}` : label}
        <textarea aria-label={`${name} / ${question.type === 'score' ? `level ${label}` : label}`} value={value} maxLength={1000} disabled={disabled} onChange={(e) => edit(name, 'criteria', e.target.value, label)} /></label>)}
    </details>)}
    <div className="review-actions"><button disabled={disabled} onClick={() => {
      try { const checked = validateQuestionConfiguration(draft, kind); setApplied(checked); onApply(checked); setMessage('Configuration applied; no inference started.'); }
      catch (e) { setMessage(e instanceof Error ? e.message : 'Invalid configuration.'); }
    }}>Apply question configuration</button>
      <button disabled={disabled} onClick={() => { const next = structuredClone(base); setDraft(next); setApplied(next); onApply(next); setMessage('Default questions restored; saved runs are unchanged.'); }}>Reset questions</button>
      <button disabled={disabled} onClick={() => { try { const config = validateQuestionConfiguration(draft, kind); downloadJson(`jev-${kind}-questions.json`, JSON.stringify(config, null, 2)); } catch (e) { setMessage((e as Error).message); } }}>Export question JSON</button>
    </div>
    <label>Import question JSON<input type="file" accept="application/json,.json" disabled={disabled} onChange={async (e) => {
      const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
      try { if (file.size > MAX_IMPORT_BYTES) throw new Error('File exceeds 2 MB.'); const next = validateQuestionConfiguration(parseImport(await file.text()), kind); setDraft(next); setMessage('Valid configuration imported as a draft; apply before execution.'); }
      catch (failure) { setMessage((failure as Error).message); }
    }} /></label>
    {configurationIdentity(draft) !== configurationIdentity(applied) && <p className="view-note">Unapplied edits; execution still uses {applied.version}.</p>}
    {message && <p role="status" className="view-note">{message}</p>}
  </details>;
}
