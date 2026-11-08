import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {DocumentLibrary} from '../components/DocumentLibrary';
import {SourceDocument} from '../components/SourceDocument';
import {searchDocuments, segmentDocument} from '../src/ui/evidence';
import {translationFor} from '../components/translations';

test('library includes every immutable revision independently of retrieval',()=>{
  const html=renderToStaticMarkup(<DocumentLibrary onSelect={()=>{}} onInspect={()=>{}} />);
  for(const doc of searchDocuments){assert.ok(html.includes('data-document-id="'+doc.id+'"'));assert.ok(html.includes('data-revision="'+doc.revision+'"'));}
  assert.ok(html.includes('dispatch-gates'));assert.ok(html.includes('Archiviert'));assert.ok(html.includes('ledger'));
});

test('full document reader preserves source line anchors and exact passage callbacks',()=>{
  for(const doc of searchDocuments){
    const before=JSON.stringify(doc);const passages=segmentDocument(doc);const translated=translationFor(doc.content);
    if(translated)assert.equal(translated.split(/\r?\n/).length,doc.content.split(/\r?\n/).length);
    const html=renderToStaticMarkup(<SourceDocument content={doc.content} passages={passages} focusLines={[passages[0].startLine,passages[0].endLine]} onPassage={()=>{}} onReference={()=>{}} />);
    for(const passage of passages){assert.ok(html.includes('data-passage-id="'+passage.id+'"'));assert.equal(doc.content.slice(passage.start,passage.end),passage.text);}
    assert.ok(html.includes('selected-document-passage'));assert.equal(JSON.stringify(doc),before);
  }
});
