'use client';
import { useLanguage } from './LanguageProvider';

import React, { useState } from 'react';
import { defaultConfigurations, validateQuestionConfiguration, configurationIdentity } from '../src/question-config.js';
import { downloadJson } from '../src/ui/history';
import { parseImport, MAX_IMPORT_BYTES } from '../src/ui/import-export';

export type QuestionConfiguration = { schemaVersion: number; kind: string; version: string;
  questions: Record<string, { type: string; instructions: string; criteria: Record<string, string> | string[] }> };

export function QuestionEditor({ kind, disabled = false, onApply }: {
  kind: 'governance' | 'evidence'; disabled?: boolean; onApply: (config: QuestionConfiguration) => void;
}) {
  const { t, displayLabel, translatedLabel } = useLanguage();
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
  return <details className="type-reference question-editor"><summary>{t("Fragen bearbeiten")}</summary>
    <p className="view-note">{t("Änderungen explizit übernehmen. Kein API-Aufruf. Kategorien beibehalten; neue Version für geänderte Fragen verwenden.")}</p>
    <details className="question-technical"><summary>{t("Technische Einstellungen")}</summary><label>{t("Fragenversion")}<input value={draft.version} maxLength={80} disabled={disabled} onChange={(e) => setDraft({ ...draft, version: e.target.value })} /></label></details>
    {Object.entries(draft.questions).map(([name, question]) => <details key={name} className="rubric"><summary>{displayLabel(name)} · {question.type}</summary>
      <div className="question-field"><span>{t("Anweisung für")} {displayLabel(name)}</span><textarea aria-label={`Instructions for ${name}`} value={translatedLabel(question.instructions)} maxLength={2000} disabled={disabled} onChange={(e) => edit(name, 'instructions', e.target.value)} /></div>
      {Object.entries(question.criteria).map(([label, value]) => <div className="question-field" key={label}><span>{displayLabel(name)} / {question.type === 'score' ? `${t('Stufe')} ${label}` : displayLabel(label)}</span>
        <textarea aria-label={`${name} / ${question.type === 'score' ? `level ${label}` : label}`} value={translatedLabel(value)} maxLength={1000} disabled={disabled} onChange={(e) => edit(name, 'criteria', e.target.value, label)} /></div>)}
    </details>)}
    <div className="review-actions"><button disabled={disabled} onClick={() => {
      try { const checked = validateQuestionConfiguration(draft, kind); setApplied(checked); onApply(checked); setMessage('Konfiguration übernommen.'); }
      catch (e) { setMessage(e instanceof Error ? e.message : 'Ungültige Konfiguration.'); }
    }}>{t("Übernehmen")}</button>
      <button disabled={disabled} onClick={() => { const next = structuredClone(base); setDraft(next); setApplied(next); onApply(next); setMessage('Standardfragen wiederhergestellt.'); }}>{t("Zurücksetzen")}</button>
      <button disabled={disabled} onClick={() => { try { const config = validateQuestionConfiguration(draft, kind); downloadJson(`jev-${kind}-questions.json`, JSON.stringify(config, null, 2)); } catch (e) { setMessage((e as Error).message); } }}>{t("Fragen exportieren (JSON)")}</button>
    </div>
    <label>{t("Fragen importieren (JSON)")}<input type="file" accept="application/json,.json" disabled={disabled} onChange={async (e) => {
      const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
      try { if (file.size > MAX_IMPORT_BYTES) throw new Error('Datei größer als 2 MB.'); const next = validateQuestionConfiguration(parseImport(await file.text()), kind); setDraft(next); setMessage('Entwurf importiert. Vor Ausführung übernehmen.'); }
      catch (failure) { setMessage((failure as Error).message); }
    }} /></label>
    {configurationIdentity(draft) !== configurationIdentity(applied) && <p className="view-note">{t("Nicht übernommen. Aktive Version:")} {applied.version}.</p>}
    {message && <p role="status" className="view-note">{t(message)}</p>}
  </details>;
}
