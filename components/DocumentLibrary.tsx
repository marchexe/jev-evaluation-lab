'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from './LanguageProvider';
import { SourceDocument } from './SourceDocument';
import { buildEvidenceGraph } from '../src/ui/evidence-graph';
import { searchDocuments, segmentDocument, type Passage } from '../src/ui/evidence';

export type DocumentSelection = { documentId: string; revision: string; section?: string; passageId?: string; controlId?: string };
export type EvidenceSelection = { passageId: string; controlId?: string };
const key = (id: string, revision: string) => `${id}@${revision}`;

export function DocumentLibrary({ selection, onSelect, onInspect }: {
  selection?: DocumentSelection; onSelect: (value: DocumentSelection) => void;
  onInspect: (passage: Passage, controlId?: string) => void;
}) {
  const { t, translatedLabel } = useLanguage();
  const [query, setQuery] = useState('');
  const [system, setSystem] = useState('');
  const [status, setStatus] = useState('all');
  const [notice, setNotice] = useState('');
  const reader = useRef<HTMLDivElement>(null);
  const graph = useMemo(() => buildEvidenceGraph(), []);
  const entries = searchDocuments.map(document => {
    const revision = graph.nodes.find(node => node.kind === 'revision' && node.document.id === document.id && node.document.revision === document.revision);
    return { document, status: revision?.kind !== 'revision' || revision.current === null ? 'unresolved' : revision.current ? 'current' : 'archived' };
  });
  const filtered = entries.filter(({document, status: current}) => (!system || document.systemId === system) && (status === 'all' || current === status)
    && `${translatedLabel(document.title)} ${document.title} ${document.id}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const selected = filtered.find(entry => entry.document.id === selection?.documentId && entry.document.revision === selection.revision) ?? filtered[0];
  const document = selected?.document;
  const passages = document ? segmentDocument(document) : [];
  const focus = passages.find(passage => passage.id === selection?.passageId) ?? passages.find(passage => passage.section === selection?.section);
  const sections = [...new Set(passages.map(passage => passage.section))];
  const labels: Record<string,string> = {current:t('Aktuell'), archived:t('Ältere Version'), unresolved:t('Aktuelle Version nicht angegeben')};

  useEffect(() => {
    const pane = reader.current;
    if (!pane) return;
    if (focus) {
      const paragraph = pane.querySelector<HTMLElement>(`[data-source-line="${focus.startLine}"]`);
      paragraph?.focus({preventScroll:true}); paragraph?.scrollIntoView({block:'nearest'});
    } else pane.scrollTop = 0;
  }, [document?.id, document?.revision, focus?.id]);

  function referenceNode(target: string) {
    const edge = graph.edges.find(edge => edge.kind === 'references' && edge.provenance.kind === 'source'
      && edge.provenance.passage.documentId === document?.id && edge.provenance.passage.revision === document.revision
      && edge.provenance.quote.includes(`(${target})`));
    return edge && graph.nodes.find(node => node.id === edge.to);
  }
  function openReference(target: string) {
    const node = referenceNode(target);
    if (!node || node.kind !== 'section') { setNotice('Verknüpfte Quelle nicht verfügbar.'); return; }
    setQuery('');setSystem('');setStatus('all');setNotice('');
    onSelect({documentId:node.documentId,revision:node.revision,section:node.section,controlId:selection?.controlId});
  }
  const references = document ? [...document.content.matchAll(/\[([^\]]+)\]\((evidence:[^)]+)\)/g)].map(match => ({label:match[1],target:match[2]})) : [];
  const translatedReferences = document ? new Map([...translatedLabel(document.content).matchAll(/\[([^\]]+)\]\((evidence:[^)]+)\)/g)].map(match=>[match[2],match[1]])) : new Map<string,string>();

  return <section className="lab-view document-library" aria-label={t('Dokumentbibliothek')}>
    <div className="view-heading"><h2>{t('Alle Dokumente')}</h2><p className="view-note">{new Set(searchDocuments.map(document=>document.id)).size} {t('Dokumente')}</p></div>
    <p className="view-note">{t('Vollständiger synthetischer Suchkorpus, unabhängig von Suchtreffern. Keine Unternehmensdaten.')}</p>
    <div className="library-filters"><label>{t('Dokument suchen')}<input type="search" value={query} onChange={event=>setQuery(event.target.value)} /></label>
      <label>{t('System')}<select aria-label={t('System')} value={system} onChange={event=>setSystem(event.target.value)}><option value="">{t('Alle Systeme')}</option>{[...new Set(searchDocuments.map(document=>document.systemId))].map(id=><option key={id}>{id}</option>)}</select></label>
</div>
    <details className="library-version-details"><summary>{t('Weitere Filter')}</summary><p className="view-note">{searchDocuments.length} {t('Versionen')}</p>      <label>{t('Versionen')}<select aria-label={t('Versionen')} value={status} onChange={event=>setStatus(event.target.value)}><option value="all">{t('Alle Versionen')}</option><option value="current">{t('Aktuell')}</option><option value="archived">{t('Archiviert')}</option>{entries.some(entry => entry.status === 'unresolved') && <option value="unresolved">{t('Aktuelle Version nicht angegeben')}</option>}</select></label></details>
    <div className="library-workbench"><nav className="library-list" aria-label={t('Alle Dokumentrevisionen')}>
      <p className="library-count">{filtered.length} {t('Einträge')}</p>
      {filtered.map(entry=><button key={key(entry.document.id,entry.document.revision)} aria-pressed={document?.id===entry.document.id && document.revision===entry.document.revision}
        data-document-id={entry.document.id} data-revision={entry.document.revision}
        onClick={()=>{setNotice('');onSelect({documentId:entry.document.id,revision:entry.document.revision,controlId:selection?.controlId});}}>
        <strong>{translatedLabel(entry.document.title)}</strong><span>{entry.document.systemId}{searchDocuments.filter(doc => doc.id === entry.document.id).length > 1 && <> · {t('Version')} {entry.document.revision} · {labels[entry.status]}</>}</span>
      </button>)}
      {!filtered.length && <p className="search-empty">{t('Keine Dokumente für diese Filter.')}</p>}
    </nav><div className="library-reader" ref={reader}>
      {document ? <article aria-label={t('Vollständiges Dokument')}>
        <header><h2>{translatedLabel(document.title)}</h2><p className="source-caption">{document.systemId}{searchDocuments.filter(doc => doc.id === document.id).length > 1 && <> · {t('Version')} {document.revision} · {labels[selected.status]}</>}</p><details className="document-metadata"><summary>{t('Technische Angaben')}</summary><code>{key(document.id,document.revision)}</code><p>{t('Version')} {document.revision} · {labels[selected.status]}</p></details></header>
        <nav className="document-sections" aria-label={t('Abschnitte im Dokument')}>{sections.map(section=><button key={section} onClick={()=>onSelect({documentId:document.id,revision:document.revision,section,controlId:selection?.controlId})}>{translatedLabel(section.split(' / ').at(-1) ?? section)}</button>)}</nav>
        {notice && <p role="status" className="notice">{t(notice)}</p>}
        <SourceDocument content={document.content} passages={passages} focusLines={focus ? [focus.startLine,focus.endLine] : undefined}
          onReference={openReference} onPassage={passage=>onInspect(passage,selection?.controlId)} />
        <section className="document-references" aria-label={t('Dokumentverweise')}><h3>{t('Dokumentverweise')} <span className="count">{references.length}</span></h3>
          {!references.length && <p className="view-note">{t('Keine expliziten Dokumentverweise.')}</p>}
          {references.map((reference,index)=>{const node=referenceNode(reference.target);return <div key={index}>
            <button onClick={()=>openReference(reference.target)}>{translatedReferences.get(reference.target) ?? reference.label}</button>
            <span>{node?.kind==='section' ? `${node.documentId}@${node.revision} · ${translatedLabel(node.section)}` : t('Quelle nicht verfügbar')}</span>
          </div>;})}
        </section>
      </article> : <p className="empty-results">{t('Keine Dokumente für diese Filter.')}</p>}
    </div></div>
  </section>;
}
