'use client';
import { useLanguage, LanguageSelector } from './LanguageProvider';
import { TranslatedText } from './TranslatedText';
import { translationFor } from './translations';


import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AssistantRuntimeProvider, ComposerPrimitive, MessagePrimitive, ThreadPrimitive,
  useExternalStoreRuntime, type AppendMessage, type ThreadMessageLike,
} from '@assistant-ui/react';
import cases from '../examples/governance/cases.json';
import type { Assessment, AssessmentRecord, Feedback, FieldReview } from '../src/ui/types';
import { updateFieldReview } from '../src/ui/reviews';
import {
  HISTORY_KEY, MAX_HISTORY_RECORDS, createRecord, downloadJson, exportHistory,
  readHistory, updateFeedback, writeHistory,
} from '../src/ui/history';
import { JevAssessmentCard } from './JevAssessmentCard';
import { AssessmentTable, CompareView, EvaluationView } from './LabViews';
import { DocumentLibrary, type DocumentSelection, type EvidenceSelection } from './DocumentLibrary';
import type { Passage } from '../src/ui/evidence';
import { EvidenceExplorer } from './EvidenceExplorer';
import { QuestionEditor, type QuestionConfiguration } from './QuestionEditor';
import { defaultConfigurations, configurationIdentity } from '../src/question-config.js';
import { importAssessmentHistory, parseImport, MAX_IMPORT_BYTES } from '../src/ui/import-export';

const RecordContext = createContext<{
  records: AssessmentRecord[]; rate: (id: string, feedback: Feedback) => void;
  review: (id: string, field: string, review: FieldReview | null) => void;
}>({ records: [], rate: () => {}, review: () => {} });

function ResultMessage() {

  const { records, rate, review } = useContext(RecordContext);
  return <MessagePrimitive.Root className="assistant-message">
    <MessagePrimitive.Parts>{({ part }) => {
      if (part.type !== 'data' || part.name !== 'jev-assessment') return null;
      const record = records.find((entry) => entry.id === part.data.assessmentId);
      return record ? <JevAssessmentCard assessment={record.assessment} assessmentId={record.id}
        feedback={record.feedback} onFeedback={(feedback) => rate(record.id, feedback)}
        fieldReviews={record.fieldReviews} onFieldReview={(field, value) => review(record.id, field, value)} /> : null;
    }}</MessagePrimitive.Parts>
  </MessagePrimitive.Root>;
}

function UserMessage() {
  const { t } = useLanguage();
  return <MessagePrimitive.Root className="user-message"><details><summary>{t("Beschreibung")}</summary><MessagePrimitive.Parts>{({ part }) => part.type === 'text' ? <TranslatedText text={part.text} /> : null}</MessagePrimitive.Parts></details></MessagePrimitive.Root>;
}

function messagesFor(record: AssessmentRecord): ThreadMessageLike[] {
  return [
    { id: `${record.id}-user`, role: 'user', content: [{ type: 'text', text: record.description }] },
    { id: `${record.id}-result`, role: 'assistant', content: [{ type: 'data', name: 'jev-assessment', data: { assessmentId: record.id } }],
      status: { type: 'complete', reason: 'stop' } },
  ];
}

export default function AssessmentWorkspace({ liveEnabled = false }: { liveEnabled?: boolean }) {
  const { t, language, displayLabel } = useLanguage();
  const [tab, setTab] = useState<'Assess' | 'Vergleich' | 'Evaluate' | 'Verlauf' | 'Evidence' | 'Documents'>('Assess');
  const [documentSelection, setDocumentSelection] = useState<DocumentSelection>();
  const [evidenceSelection, setEvidenceSelection] = useState<EvidenceSelection>();
  const [evaluationScope, setEvaluationScope] = useState<'systems' | 'evidence'>('systems');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [records, setRecords] = useState<AssessmentRecord[]>([]);
  const recordsRef = useRef<AssessmentRecord[]>([]);
  const [messages, setMessages] = useState<ThreadMessageLike[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [evidenceRunning, setEvidenceRunning] = useState(false);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [selectedExample, setSelectedExample] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [questionConfiguration, setQuestionConfiguration] = useState<QuestionConfiguration>(defaultConfigurations.governance);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let preferred: 'light' | 'dark' = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    try {
      const saved = localStorage.getItem('jev.ui.theme');
      if (saved === 'light' || saved === 'dark') preferred = saved;
    } catch { /* Theme selection remains available when browser storage is blocked. */ }
    setTheme(preferred);
    document.documentElement.dataset.theme = preferred;
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('jev.ui.theme', next); } catch { /* Keep the session preference. */ }
  }

  useEffect(() => {
    try {
      const saved = readHistory(localStorage);
      recordsRef.current = saved;
      setRecords(saved);
    } catch { setStorageError('Verlauf nicht lesbar. Bitte exportieren oder leeren.'); }
    setReady(true);
    return () => controllerRef.current?.abort();
  }, []);

  function commit(next: AssessmentRecord[]) {
    recordsRef.current = next;
    setRecords(next);
    try { writeHistory(localStorage, next); setStorageError(''); }
    catch { setStorageError('Speichern fehlgeschlagen. Ergebnisse vor dem Verlassen exportieren.'); }
  }

  function focusResults() {
    requestAnimationFrame(() => {
      const results = document.getElementById('analysis-results');
      results?.focus({ preventScroll: true });
    });
  }

  const onNew = async (message: AppendMessage) => {
    if (controllerRef.current || !ready || storageError || !liveEnabled) return;
    const draftDescription = message.content.filter((part) => part.type === 'text').map((part) => part.text).join('\n').trim();
    const example = cases.find(entry => entry.id === selectedExample);
    const description = example && draftDescription === translationFor(example.description) ? example.description : draftDescription;
    if (!description || description.length > 12_000) { setError('Bitte 1–12.000 Zeichen eingeben.'); return; }
    if (recordsRef.current.length >= MAX_HISTORY_RECORDS) { setError('Verlauf voll. Bitte exportieren und leeren.'); return; }
    const controller = new AbortController();
    controllerRef.current = controller;
    const id = crypto.randomUUID();
    setMessages([{ id: `${id}-user`, role: 'user', content: [{ type: 'text', text: description }] }]);
    setActiveId(null);
    setError(''); setNotice(''); setIsRunning(true);
    try {
      const response = await fetch('/api/assess', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, live: true,
          ...(configurationIdentity(questionConfiguration) === configurationIdentity(defaultConfigurations.governance) ? {} : { questionConfiguration }) }), signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Analyse fehlgeschlagen.');
      if (controller.signal.aborted) return;
      const record = createRecord(result as Assessment, id);
      commit([record, ...recordsRef.current]);
      setActiveId(id);
      setMessages((previous) => [...previous, messagesFor(record)[1]]);
      setNotice('Analyse gespeichert.');
      focusResults();
    } catch (failure) {
      if (controller.signal.aborted) setNotice('Abgebrochen. Kosten können bereits entstanden sein.');
      else setError(failure instanceof Error ? failure.message : 'Analyse fehlgeschlagen. Keine Wiederholung.');
    } finally {
      controllerRef.current = null;
      setIsRunning(false);
    }
  };

  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages, convertMessage: (message) => message, isRunning, onNew,
    isSendDisabled: !ready || !!storageError || isRunning || !liveEnabled,
    onCancel: async () => { controllerRef.current?.abort(); },
  });

  useEffect(() => {
    const example = cases.find(entry => entry.id === selectedExample);
    if (!example) return;
    const current = runtime.thread.composer.getState().text;
    const german = translationFor(example.description) ?? example.description;
    if (current === german || current === example.description) {
      runtime.thread.composer.setText(language === 'de' ? german : example.description);
    }
  }, [language, selectedExample, runtime]);

  const context = useMemo(() => ({
    records,
    rate: (id: string, feedback: Feedback) => commit(updateFeedback(recordsRef.current, id, feedback)),
    review: (id: string, field: string, review: FieldReview | null) => commit(updateFieldReview(recordsRef.current, id, field, review)),
  }), [records]);

  function openRecord(record: AssessmentRecord) {
    if (controllerRef.current || evidenceRunning) return;
    setTab('Assess');
    setMessages(messagesFor(record)); setActiveId(record.id); setError(''); setNotice('');
    runtime.thread.composer.setText('');
    focusResults();
  }

  function newAssessment() {
    if (controllerRef.current || evidenceRunning) return;
    setTab('Assess');
    setMessages([]); setActiveId(null); setError(''); setNotice('');
    setSelectedExample('');
    runtime.thread.composer.setText('');
  }

  function clearHistory() {
    if (controllerRef.current || evidenceRunning || !window.confirm('Alle lokalen Analysen und Bewertungen löschen? Vorher exportieren.')) return;
    try {
      localStorage.removeItem(HISTORY_KEY);
      recordsRef.current = []; setRecords([]); setMessages([]); setActiveId(null); setStorageError('');
    } catch { setStorageError('Browserspeicher nicht verfügbar.'); }
  }

  const workflow = tab === 'Documents' ? 'documents' : tab === 'Evidence' ? 'evidence' : tab === 'Evaluate' ? 'evaluate' : 'analyze';
  function openDocument(passage: Passage, controlId: string) {
    if (isRunning || evidenceRunning) return;
    setDocumentSelection({documentId:passage.documentId,revision:passage.revision,passageId:passage.id,section:passage.section,controlId});setTab('Documents');
  }
  function openEvidence(passage: Passage, controlId?: string) {
    if (isRunning || evidenceRunning) return;
    setEvidenceSelection({passageId:passage.id,controlId});setTab('Evidence');
  }
  function chooseExample(id: string) {
    const entry = cases.find((item) => item.id === id);
    if (!entry) return;
    setSelectedExample(id); runtime.thread.composer.setText(language === 'de' ? translationFor(entry.description) ?? entry.description : entry.description);
    document.getElementById('description')?.focus();
  }

  return <AssistantRuntimeProvider runtime={runtime}><RecordContext.Provider value={context}>
    <a className="skip-link" href="#workspace-content">{t("Zum Arbeitsbereich")}</a>
    <div className="workspace">
      <aside className="sidebar">
        <div className="brand-row">
          <a href="/" className="brand">Jev <span>Evaluation Lab</span></a>
          <button className="theme-toggle" aria-label={t("Dunkles Design")} aria-pressed={theme === 'dark'}
            title={theme === 'dark' ? t("Helles Design") : t("Dunkles Design")} onClick={toggleTheme}>
            <span aria-hidden="true">{theme === 'dark' ? "☀" : "◐"}</span>
          </button>
        </div>
        <nav className="workflow-nav" aria-label={t("Arbeitsbereiche")}>
          {([['analyze', 'Analyse'], ['evidence', 'Belege'], ['documents', 'Dokumente'], ['evaluate', 'Auswertung']] as const).map(([id, title]) =>
            <button key={id} aria-label={t(title)} disabled={isRunning || evidenceRunning} aria-current={workflow === id ? 'page' : undefined} onClick={() => setTab(id === 'analyze' ? 'Assess' : id === 'evidence' ? "Evidence" : id === 'documents' ? "Documents" : "Evaluate")}>
              <span>{t(title)}</span>
            </button>)}
        </nav>
        <div className="history-heading"><h2>{t("Letzte Analysen")}</h2><span>{records.length}</span></div>
        <nav className="history-list" aria-label={t("Assessment history")}>
          {records.length === 0 && <p className="empty-history">{t("Noch keine Analysen.")}</p>}
          {records.slice(0, 5).map((record) => <button key={record.id} disabled={isRunning || evidenceRunning} onClick={() => openRecord(record)}
            className={`history-item ${activeId === record.id ? "active" : ''}`}>
            <span className="history-title">{language === 'de' ? translationFor(record.description) ?? t('Originalbeschreibung') : record.description}</span>
            <span className="history-date">{new Date(record.timestamp).toLocaleDateString()}<span>{record.feedback.rating === 'positive' ? t("Richtig") : record.feedback.rating === 'negative' ? t("Falsch") : t("Nicht bewertet")}</span></span>
          </button>)}
        </nav>
        <div className="sidebar-footer"><span className={`connection-dot ${liveEnabled ? "enabled" : ''}`} />{liveEnabled ? t("Jev verfügbar") : t("Offline")}<small>{t("Lokal gespeichert")}</small></div>
      </aside>

      <main className="main-panel" id="workspace-content" tabIndex={-1}>
        <header className="topbar"><h1>{tab === 'Verlauf' ? t("Verlauf") : tab === 'Vergleich' ? t("Vergleich") : workflow === 'analyze' ? t("Analyse") : workflow === 'evidence' ? t("Belege") : workflow === 'documents' ? t("Dokumente") : t("Auswertung")}</h1><div className="header-tools"><LanguageSelector /><button aria-label={t("Verlauf")} disabled={isRunning || evidenceRunning} onClick={() => setTab('Verlauf')}>{t("Verlauf")} <span className="count">{records.length}</span></button></div></header>
        {workflow === 'analyze' && <nav className="workspace-actions" aria-label={t("Analysis tools")}><button onClick={newAssessment} disabled={isRunning || evidenceRunning}>{t("Neue Analyse")}</button>
          <button disabled={isRunning || evidenceRunning} aria-current={tab === 'Vergleich' ? 'page' : undefined} onClick={() => setTab('Vergleich')}>{t("Vergleich")}</button></nav>}
        {tab === 'Evaluate' && <nav className="workspace-actions" aria-label={t("Evaluation scope")}><button aria-current={evaluationScope === 'systems' ? 'page' : undefined} onClick={() => setEvaluationScope('systems')}>{t("Systemanalysen")}</button><button aria-current={evaluationScope === 'evidence' ? 'page' : undefined} onClick={() => setEvaluationScope('evidence')}>{t("Belegexperimente")}</button></nav>}
        <ThreadPrimitive.Root className="assessment-thread">
          {tab === 'Assess' && <div className={`analysis-layout ${activeId ? "has-result" : ''} ${messages.length || error || storageError || isRunning ? 'has-activity' : ''}`}>
          <div className="analysis-input"><div className="composer-wrap"><ComposerPrimitive.Root className="composer">
            <div className="input-toolbar">
              <label htmlFor="description" className="composer-label">{t("Systembeschreibung")}</label>
              <div className="example-picker"><label htmlFor="example">{t("Beispiel")}</label>
                <select id="example" disabled={isRunning || evidenceRunning} value={selectedExample} onChange={(event) => {
                  setSelectedExample(event.target.value);
                  const entry = cases.find((item) => item.id === event.target.value);
                  if (entry) chooseExample(entry.id);
                }}><option value="">{t("Beispiel wählen…")}</option>
                  {['hr', 'finance', 'education', 'customer_support', 'ambiguous'].map((domain) => <optgroup key={domain} label={displayLabel(domain)}>
                    {cases.filter((entry) => entry.domain === domain).map((entry) => <option key={entry.id} value={entry.id}>{displayLabel(entry.id)}</option>)}
                  </optgroup>)}
                </select>
              </div>
            </div>
            <ComposerPrimitive.Input id="description" placeholder={t("Zweck, Daten, Ausgaben und menschliche Aufsicht beschreiben.")}
              rows={7} maxRows={12} maxLength={12_000} disabled={!ready || !!storageError || isRunning} submitMode="none" addAttachmentOnPaste={false} />
            <div className="composer-bottom"><span>{t("Max. 12.000 Zeichen")}</span>
              {isRunning ? <ComposerPrimitive.Cancel className="analyze-button cancel">{t("Abbrechen")}</ComposerPrimitive.Cancel>
                : <ComposerPrimitive.Send className="analyze-button" disabled={!ready || !!storageError || !liveEnabled}>{t("Mit Jev analysieren")}</ComposerPrimitive.Send>}</div>
          </ComposerPrimitive.Root><p className="composer-note">{t("Ein kostenpflichtiger Aufruf. Keine automatischen Wiederholungen.")}</p>
          {!liveEnabled && <p className="notice" role="status">{t("Jev-Aufrufe deaktiviert. Gespeicherte Daten bleiben verfügbar.")}</p>}
          </div>
          <div className="question-editor-wrap"><QuestionEditor kind="governance" disabled={isRunning} onApply={setQuestionConfiguration} /></div></div>
          <ThreadPrimitive.Viewport className="thread-viewport" id="analysis-results" tabIndex={-1} aria-label={t("Analysis results")}>
            <div className="thread-content">

              {!messages.length && <section className="analysis-empty"><h2>{t("Ergebnis")}</h2><p>{t("Beschreibung eingeben oder Beispiel wählen.")}</p></section>}
              <ThreadPrimitive.Messages>{({ message }) => message.role === 'user' ? <UserMessage /> : <ResultMessage />}</ThreadPrimitive.Messages>
              {isRunning && <div className="loading-state" role="status"><span className="spinner" /> {t("Jev analysiert…")} <span>{t("Ein Aufruf · keine Wiederholung")}</span></div>}
              {error && <div className="notice error" role="alert">{t(error)}</div>}
              {notice && <div className="notice" role="status">{t(notice)}</div>}
              {storageError && <div className="notice error" role="alert">{t(storageError)}</div>}
            </div>
          </ThreadPrimitive.Viewport>
          </div>}
          {tab !== 'Assess' && <div className="lab-panel">
            {tab === 'Documents' && <DocumentLibrary selection={documentSelection} onSelect={setDocumentSelection} onInspect={openEvidence} />}
            {tab === 'Vergleich' && <CompareView records={records} />}

            {tab === 'Evaluate' && evaluationScope === 'systems' && <EvaluationView records={records} onOpen={openRecord} />}
            {(tab === 'Evidence' || (tab === 'Evaluate' && evaluationScope === 'evidence')) && <EvidenceExplorer initialPassage={tab === 'Evidence' ? evidenceSelection : undefined} onOpenDocument={openDocument} onBrowseDocuments={() => {setDocumentSelection(undefined);setTab('Documents');}} summaryOnly={tab === 'Evaluate'} liveEnabled={liveEnabled} isJudging={evidenceRunning} onRunningChange={setEvidenceRunning} />}
            {tab === 'Verlauf' && <section className="lab-view" aria-label={t("Gespeicherte Analysen")}><div className="view-heading"><h2>{t("Verlauf")}</h2></div>
              <div className="history-tools"><button disabled={!records.length} onClick={() => downloadJson('jev-history.json', exportHistory(records))}>{t("Verlauf exportieren")}</button><button disabled={isRunning || evidenceRunning || (!records.length && !storageError)} onClick={clearHistory}>{t("Verlauf leeren")}</button></div>
              <label>{t("Verlauf importieren (JSON)")}<input type="file" accept="application/json,.json" disabled={!ready || !!storageError || isRunning} onChange={async (event) => {
                const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
                try { if (file.size > MAX_IMPORT_BYTES) throw new Error('Datei größer als 2 MB.');
                  const next = importAssessmentHistory(parseImport(await file.text()), recordsRef.current); commit(next); setNotice('Verlauf importiert.');
                } catch (failure) { setNotice(failure instanceof Error ? failure.message : 'Import fehlgeschlagen. Verlauf unverändert.'); }
              }} /></label>
              {notice && <p role="status" className="view-note">{notice}</p>}{storageError && <p role="alert">{storageError}</p>}
              <AssessmentTable records={records} onOpen={openRecord} /></section>}
          </div>}
        </ThreadPrimitive.Root>
      </main>
    </div>
  </RecordContext.Provider></AssistantRuntimeProvider>;
}
