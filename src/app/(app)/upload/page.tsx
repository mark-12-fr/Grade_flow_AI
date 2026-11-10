'use client';

/** Step 1. Upload the SF9 class grade sheet and/or the SF10 file, watch the AI read it, then continue to the reports. */

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Reading } from '@/components/ui/Reading';
import { useUi } from '@/components/layout/Providers';
import { importSf10, importSf9, removeSf10Undoable, removeSf9Undoable, validateBeforeProcessing } from '@/lib/state/actions';
import { formatFileSize } from '@/lib/domain/format';
import { getState, setState, useAppState } from '@/lib/state/store';

export default function UploadPage() {
  const router = useRouter();
  const { toast, openModal } = useUi();
  const state = useAppState();
  const sf9Input = useRef<HTMLInputElement>(null);
  const sf10Input = useRef<HTMLInputElement>(null);
  const [sf9Busy, setSf9Busy] = useState('');
  const [sf10Busy, setSf10Busy] = useState<{ file: string; kind: 'sf10' | 'sheet' } | null>(null);
  const [error, setError] = useState('');
  const [sf10Error, setSf10Error] = useState('');
  const [lastSf9, setLastSf9] = useState<File | null>(null);
  const [lastSf10, setLastSf10] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  const hasFiles = Boolean(state.upload) || state.sf10Students.length > 0;
  const upload = state.upload;
  const busy = Boolean(sf9Busy) || Boolean(sf10Busy);

  async function runSf9(file: File) {
    setError('');
    setLastSf9(file);
    setSf9Busy(file.name);
    const result = await importSf9(file);
    setSf9Busy('');
    if (sf9Input.current) sf9Input.current.value = '';
    if (result.cancelled) { toast(result.message ?? '', 'info'); return; }
    if (!result.ok) { setError(result.error ?? ''); toast((result.error ?? result.message ?? '').split('\n')[0], result.type); return; }
    setLastSf9(null);
    toast(result.message ?? '', result.type);
  }

  function onSf9(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if ((files?.length ?? 0) > 1) { setError('Upload one complete class gradebook at a time.'); toast('Choose one class grade file.', 'error'); return; }
    if (!state.upload) { void runSf9(file); return; }
    // A new file replaces the current class, including any grades the teacher already corrected.
    openModal({
      title: 'Replace the current class?',
      body: <p>{state.upload.name} is already loaded. Reading {file.name} replaces it, and any grades you corrected will be lost.</p>,
      confirmLabel: 'Replace it', cancelLabel: 'Keep the current one', tone: 'danger',
      onConfirm: () => { void runSf9(file); }
    });
    if (sf9Input.current) sf9Input.current.value = '';
  }

  async function runSf10(file: File) {
    setSf10Error('');
    setLastSf10(file);
    setSf10Busy({ file: file.name, kind: 'sf10' });
    const result = await importSf10(file);
    setSf10Busy(null);
    if (sf10Input.current) sf10Input.current.value = '';
    if (result.cancelled) { toast(result.message ?? '', 'info'); return; }
    if (!result.ok) { setSf10Error(result.error ?? result.message ?? ''); toast(result.message ?? '', result.type); return; }
    setLastSf10(null);
    toast(result.message ?? '', result.type);
  }

  function onSf10(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if ((files?.length ?? 0) > 1) { toast('Choose one file for the SF10.', 'error'); return; }
    void runSf10(file);
  }

  function removeFile(what: 'sf9' | 'sf10') {
    const undo = what === 'sf9' ? removeSf9Undoable() : removeSf10Undoable();
    if (what === 'sf9') setError(''); else setSf10Error('');
    toast(what === 'sf9' ? 'Class gradebook removed.' : 'SF10 file removed.', 'info', { label: 'Undo', onClick: undo });
  }

  function prepare() {
    const problem = validateBeforeProcessing();
    if (problem) { setError(problem); toast(problem.split('\n')[0], 'error'); return; }
    setError('');
    setState({ processed: false, processing: false, progress: 0, generated: false, generatedAt: null });
    router.push(getState().upload ? '/report-card' : '/sf10');
  }

  return (
    <section className="page active" aria-labelledby="upload-title">
      <div className="page-heading">
        <div><h1 id="upload-title">Upload Class Details</h1></div>
        <span className="pill pill-blue">Step 1 of 3</span>
      </div>

      <div className="upload-layout">
        <div className="upload-main">
          <article className="card">
            <div className="docs-upload">
              <div className="docs-list">
                <div className="docs-item">
                  <div
                    className={`docs-row upload-inline${dragging ? ' dragover' : ''}${sf9Busy ? ' is-busy' : ''}`}
                    aria-busy={Boolean(sf9Busy)}
                    onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setDragging(false); onSf9(e.dataTransfer.files); }}
                  >
                    <div className="docs-head">
                      <span className="docs-icon" aria-hidden="true"><Icon name="file-sheet" /></span>
                      <div className="docs-title">
                        <strong className="docs-label" id="sf9-label">SF9</strong>
                        <span className="docs-sub">Learner&apos;s Report Card</span>
                      </div>
                    </div>
                    <div className="dropzone-actions">
                      <button type="button" className="btn btn-secondary btn-sm" aria-labelledby="browse-sf9 sf9-label" id="browse-sf9" disabled={Boolean(sf9Busy)} onClick={() => sf9Input.current?.click()}>
                        <Icon name="folder" /> Choose file
                      </button>
                      <input ref={sf9Input} type="file" className="input-file" id="file-upload" accept=".csv,.xlsx,.xls" onChange={(e) => onSf9(e.target.files)} />
                    </div>
                    {sf9Busy && <Reading fileName={sf9Busy} kind="sf9" />}
                  </div>
                  {error && (
                    <div className="form-error" role="alert" style={{ whiteSpace: 'pre-line' }}>
                      {error}
                      {lastSf9 && !sf9Busy && <div><button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => void runSf9(lastSf9)}><Icon name="refresh" /> Try again</button></div>}
                    </div>
                  )}
                  {upload && (
                    <div className="uploaded-file" id="file-info">
                      <span className="file-type-icon"><Icon name="file-sheet" /></span>
                      <div className="uploaded-file-text">
                        <strong id="selected-filename">{upload.name}</strong>
                        <span id="file-details">{upload.rows} learner{upload.rows === 1 ? '' : 's'} · {upload.files.length} grade file{upload.files.length === 1 ? '' : 's'}</span>
                      </div>
                      <span className="pill pill-green"><Icon name="check" /> Ready</span>
                      <button type="button" className="icon-btn" aria-label="Remove the uploaded class files" onClick={() => removeFile('sf9')}>
                        <Icon name="x" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="docs-item">
                  <div className="docs-row">
                    <div className="docs-head">
                      <span className="docs-icon" aria-hidden="true"><Icon name="file-sheet" /></span>
                      <div className="docs-title">
                        <strong className="docs-label" id="sf10-label">SF10</strong>
                        <span className="docs-sub">Learner&apos;s Permanent Record</span>
                      </div>
                    </div>
                    <div className="dropzone-actions">
                      <button type="button" className="btn btn-secondary btn-sm" aria-labelledby="browse-sf10 sf10-label" id="browse-sf10" disabled={Boolean(sf10Busy)} onClick={() => sf10Input.current?.click()}>
                        <Icon name="folder" /> Choose file
                      </button>
                      <input ref={sf10Input} type="file" className="input-file" id="class-sf10-upload" accept=".csv,.xlsx,.xls" onChange={(e) => onSf10(e.target.files)} />
                    </div>
                  </div>
                  {sf10Error && !sf10Busy && (
                    <div className="form-error" role="alert" style={{ whiteSpace: 'pre-line' }}>
                      {sf10Error}
                      {lastSf10 && <div><button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => void runSf10(lastSf10)}><Icon name="refresh" /> Try again</button></div>}
                    </div>
                  )}
                  <div className="sf10-file-list" aria-live="polite">
                    {sf10Busy && <Reading fileName={sf10Busy.file} kind={sf10Busy.kind} />}
                    {!sf10Busy && state.sf10File && (
                      <div className="sf10-file-row">
                        <span className="file-type-icon"><Icon name="file-text" /></span>
                        <span className="sf10-file-name">
                          {state.sf10File.name} · {formatFileSize(state.sf10File.size)} · {state.sf10Students.length} learner{state.sf10Students.length === 1 ? '' : 's'} read
                          {state.sf10File.warnings.length ? ` · ${state.sf10File.warnings.length} note(s)` : ''}
                        </span>
                        <span className="pill pill-green"><Icon name="check" /> Ready</span>
                        <button type="button" className="icon-btn" aria-label="Remove the SF10 file" onClick={() => removeFile('sf10')}><Icon name="x" /></button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </article>

          <div className="page-actions">
            <div className="action-end">
              <button type="button" className="btn btn-primary" disabled={!hasFiles || busy} onClick={prepare}>
                Prepare reports <Icon name="chevron-right" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
