'use client';

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
  return <MessagePrimitive.Root className="user-message"><details><summary>Submitted description</summary><MessagePrimitive.Parts /></details></MessagePrimitive.Root>;
}

function messagesFor(record: AssessmentRecord): ThreadMessageLike[] {
  return [
    { id: `${record.id}-user`, role: 'user', content: [{ type: 'text', text: record.description }] },
    { id: `${record.id}-result`, role: 'assistant', content: [{ type: 'data', name: 'jev-assessment', data: { assessmentId: record.id } }],
      status: { type: 'complete', reason: 'stop' } },
  ];
}

export default function AssessmentWorkspace({ liveEnabled = false }: { liveEnabled?: boolean }) {
  const [tab, setTab] = useState<'Assess' | 'Compare' | 'Evaluate' | 'History'>('Assess');
  const [records, setRecords] = useState<AssessmentRecord[]>([]);
  const recordsRef = useRef<AssessmentRecord[]>([]);
  const [messages, setMessages] = useState<ThreadMessageLike[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [selectedExample, setSelectedExample] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const saved = readHistory(localStorage);
      recordsRef.current = saved;
      setRecords(saved);
    } catch { setStorageError('Browser history could not be read. Export stored data or clear history before analyzing.'); }
    setReady(true);
    return () => controllerRef.current?.abort();
  }, []);

  function commit(next: AssessmentRecord[]) {
    recordsRef.current = next;
    setRecords(next);
    try { writeHistory(localStorage, next); setStorageError(''); }
    catch { setStorageError('History could not be saved in this browser. Your results are still available here; export them before leaving.'); }
  }

  const onNew = async (message: AppendMessage) => {
    if (controllerRef.current || !ready || storageError || !liveEnabled) return;
    const description = message.content.filter((part) => part.type === 'text').map((part) => part.text).join('\n').trim();
    if (!description || description.length > 12_000) { setError('Enter a description of 1–12,000 characters.'); return; }
    if (recordsRef.current.length >= MAX_HISTORY_RECORDS) { setError('History is full. Export and clear it before analyzing again.'); return; }
    const controller = new AbortController();
    controllerRef.current = controller;
    const id = crypto.randomUUID();
    setMessages((previous) => [...previous, { id: `${id}-user`, role: 'user', content: [{ type: 'text', text: description }] }]);
    setActiveId(null);
    setError(''); setNotice(''); setIsRunning(true);
    try {
      const response = await fetch('/api/assess', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, live: true }), signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Assessment failed.');
      if (controller.signal.aborted) return;
      const record = createRecord(result as Assessment, id);
      commit([record, ...recordsRef.current]);
      setActiveId(id);
      setMessages((previous) => [...previous, messagesFor(record)[1]]);
    } catch (failure) {
      if (controller.signal.aborted) setNotice('Request cancelled. Jev may already have processed it; no retry was made.');
      else setError(failure instanceof Error ? failure.message : 'Assessment failed. No retry was made.');
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

  const context = useMemo(() => ({
    records,
    rate: (id: string, feedback: Feedback) => commit(updateFeedback(recordsRef.current, id, feedback)),
    review: (id: string, field: string, review: FieldReview | null) => commit(updateFieldReview(recordsRef.current, id, field, review)),
  }), [records]);

  function openRecord(record: AssessmentRecord) {
    if (controllerRef.current) return;
    setTab('Assess');
    setMessages(messagesFor(record)); setActiveId(record.id); setError(''); setNotice('');
    runtime.thread.composer.setText('');
  }

  function newAssessment() {
    if (controllerRef.current) return;
    setTab('Assess');
    setMessages([]); setActiveId(null); setError(''); setNotice('');
    setSelectedExample('');
    runtime.thread.composer.setText('');
  }

  function clearHistory() {
    if (controllerRef.current || !window.confirm('Delete all assessments and feedback saved in this browser? Export anything you want to keep first.')) return;
    try {
      localStorage.removeItem(HISTORY_KEY);
      recordsRef.current = []; setRecords([]); setMessages([]); setActiveId(null); setStorageError('');
    } catch { setStorageError('Browser storage is unavailable.'); }
  }

  return <AssistantRuntimeProvider runtime={runtime}><RecordContext.Provider value={context}>
    <div className="workspace">
      <aside className="sidebar">
        <a href="/" className="brand">Jev <span>Evaluation Lab</span></a>
        <button className="new-assessment" onClick={newAssessment} disabled={isRunning}>New assessment</button>
        <div className="history-heading"><h2>Assessment history</h2><span>{records.length}</span></div>
        <nav className="history-list" aria-label="Assessment history">
          {records.length === 0 && <p className="empty-history">No assessments</p>}
          {records.map((record) => <button key={record.id} disabled={isRunning} onClick={() => openRecord(record)}
            className={`history-item ${activeId === record.id ? 'active' : ''}`}>
            <span className="history-title">{record.description}</span>
            <span className="history-date">{new Date(record.timestamp).toLocaleDateString()}<span>{record.feedback.rating === 'positive' ? 'Correct' : record.feedback.rating === 'negative' ? 'Incorrect' : 'Not rated'}</span></span>
          </button>)}
        </nav>
        <div className="sidebar-actions"><button disabled={!records.length} onClick={() => downloadJson('jev-history.json', exportHistory(records))}>Export history</button>
          <button disabled={isRunning || (!records.length && !storageError)} onClick={clearHistory}>Clear history</button></div>
        <div className="sidebar-footer">Browser storage</div>
      </aside>

      <main className="main-panel">
        <header className="topbar"><h1>Jev assessment <span className="muted">/ Evaluation Lab</span></h1><span className="profile-badge">profile: governance</span></header>
        <nav className="lab-tabs" aria-label="Evaluation workspace">{(['Assess', 'Compare', 'Evaluate', 'History'] as const).map((name) =>
          <button key={name} disabled={isRunning} aria-current={tab === name ? 'page' : undefined} onClick={() => setTab(name)}>{name}</button>)}</nav>
        <ThreadPrimitive.Root className="assessment-thread">
          {tab === 'Assess' && <>
          <div className="composer-wrap"><ComposerPrimitive.Root className="composer">
            <div className="input-toolbar">
              <label htmlFor="description" className="composer-label">AI system description</label>
              <div className="example-picker"><label htmlFor="example">Synthetic example</label>
                <select id="example" disabled={isRunning} value={selectedExample} onChange={(event) => {
                  setSelectedExample(event.target.value);
                  const entry = cases.find((item) => item.id === event.target.value);
                  if (entry) runtime.thread.composer.setText(entry.description);
                }}><option value="">Select example…</option>
                  {['hr', 'finance', 'education', 'customer_support', 'ambiguous'].map((domain) => <optgroup key={domain} label={domain.replaceAll('_', ' ')}>
                    {cases.filter((entry) => entry.domain === domain).map((entry) => <option key={entry.id} value={entry.id}>{entry.id}</option>)}
                  </optgroup>)}
                </select>
              </div>
            </div>
            <ComposerPrimitive.Input id="description" placeholder="Describe purpose, data inputs, outputs, and human oversight."
              rows={3} maxRows={8} maxLength={12_000} disabled={!ready || !!storageError || isRunning || !liveEnabled} submitMode="none" addAttachmentOnPaste={false} />
            <div className="composer-bottom"><span>12,000 character limit · independent assessment</span>
              {isRunning ? <ComposerPrimitive.Cancel className="analyze-button cancel">Cancel request</ComposerPrimitive.Cancel>
                : <ComposerPrimitive.Send className="analyze-button" disabled={!ready || !!storageError || !liveEnabled}>Analyze with Jev</ComposerPrimitive.Send>}</div>
          </ComposerPrimitive.Root><p className="composer-note">Analyze sends the description to TypeSafe and incurs API usage. No legal determination.</p></div>
          <ThreadPrimitive.Viewport className="thread-viewport">
            <div className="thread-content">
              {!liveEnabled && <p className="notice" role="status">Live inference is disabled on this server. Saved assessments, comparison, evaluation, and reviews remain available.</p>}
              <details className="type-reference"><summary>Question types and uncertainty</summary><p><strong>Choice</strong> selects a category and returns every option probability. Confidence summarizes concentration, not verified correctness. <strong>Noul</strong> is the probability of a statement, with no automatic yes/no verdict. <strong>Score</strong> is a fractional position on the recorded rubric, with a probability for every level. Missing, unclear, and conflicting evidence remain separate states.</p></details>
              {!messages.length && <p className="empty-results">No assessment selected.</p>}
              <ThreadPrimitive.Messages>{({ message }) => message.role === 'user' ? <UserMessage /> : <ResultMessage />}</ThreadPrimitive.Messages>
              {isRunning && <div className="loading-state" role="status"><span className="spinner" /> Assessing with Jev… <span>One request · no automatic retries</span></div>}
              {error && <div className="notice error" role="alert">{error}</div>}
              {notice && <div className="notice" role="status">{notice}</div>}
              {storageError && <div className="notice error" role="alert">{storageError}</div>}
            </div>
          </ThreadPrimitive.Viewport>
          </>}
          {tab !== 'Assess' && <div className="lab-panel">
            {tab === 'Compare' && <CompareView records={records} />}
            {tab === 'Evaluate' && <EvaluationView records={records} onOpen={openRecord} />}
            {tab === 'History' && <section className="lab-view" aria-label="Saved assessment history"><div className="view-heading"><h2>History</h2><button disabled={!records.length} onClick={() => downloadJson('jev-history.json', exportHistory(records))}>Export assessments + reviews</button></div>
              <p className="view-note">Local to this browser. Opening a saved assessment never runs inference. Overall feedback is preserved.</p><AssessmentTable records={records} onOpen={openRecord} /></section>}
          </div>}
        </ThreadPrimitive.Root>
      </main>
    </div>
  </RecordContext.Provider></AssistantRuntimeProvider>;
}
