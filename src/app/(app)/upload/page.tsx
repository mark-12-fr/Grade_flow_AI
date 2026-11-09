'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Reading } from '@/components/ui/Reading';
import { useUi } from '@/components/layout/Providers';
import { importSf10, importSf9, removeSf10, removeSf9, validateBeforeProcessing } from '@/lib/state/actions';
import { formatFileSize } from '@/lib/domain/format';
import { getState, setState, useAppState } from '@/lib/state/store';

// Preselect the sheet that most likely lists the learners: the biggest one with many columns.
const guessSheet = (sheets: { name: string; rows: number; cols: number; label?: string }[]) =>
  [...sheets].filter((x) => x.rows > 5 && x.name !== '__forms__').sort((a, b) => b.rows * b.cols - a.rows * a.cols)[0]?.name ?? sheets[0]?.name ?? '';

export default function UploadPage() {
  const router = useRouter();
  const { toast } = useUi();
  const state = useAppState();
  const sf9Input = useRef<HTMLInputElement>(null);
  const sf10Input = useRef<HTMLInputElement>(null);
  const [sf9Busy, setSf9Busy] = useState('');
  const [sf10Busy, setSf10Busy] = useState<{ file: string; kind: 'sf10' | 'sheet' } | null>(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [pick, setPick] = useState<{ file: File; sheets: { name: string; rows: number; cols: number; label?: string }[]; selected: string } | null>(null);

  const [sectionPick, setSectionPick] = useState<{ file: File; sections: { name: string; learners: number }[]; selected: string } | null>(null);

  const hasFiles = Boolean(state.upload) || state.sf10Students.length > 0;
  const upload = state.upload;

  async function onSf9(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if ((files?.length ?? 0) > 1) { setError('Upload one complete class gradebook at a time.'); toast('Choose one class grade file.', 'error'); return; }
    setError('');
    setSectionPick(null);
    setSf9Busy(file.name);
    const result = await importSf9(file);
    setSf9Busy('');
    if (sf9Input.current) sf9Input.current.value = '';
    if (!result.ok) setError(result.error ?? '');
    if (result.pick) setSectionPick({ file, sections: result.pick, selected: result.pick[0]?.name ?? '' });
    toast(result.message ?? '', result.type);
  }

  async function readPickedSection() {
    if (!sectionPick) return;
    const { file, selected } = sectionPick;
    setError('');
    setSf9Busy(`${file.name} · ${selected}`);
    const result = await importSf9(file, selected);
    setSf9Busy('');
    if (result.ok && !result.pick) setSectionPick(null);
    if (!result.ok) setError(result.error ?? '');
    toast(result.message ?? '', result.type);
  }

  async function onSf10(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if ((files?.length ?? 0) > 1) { toast('Choose one file for the SF10.', 'error'); return; }
    setPick(null);
    setSf10Busy({ file: file.name, kind: 'sf10' });
    const result = await importSf10(file);
    setSf10Busy(null);
    if (sf10Input.current) sf10Input.current.value = '';
    if (result.pick) setPick({ file, sheets: result.pick, selected: guessSheet(result.pick) });
    toast(result.message ?? '', result.type);
  }

  async function readPickedSheet() {
    if (!pick) return;
    const { file, selected } = pick;
    setSf10Busy({ file: `${file.name} · ${selected}`, kind: 'sheet' });
    const result = await importSf10(file, selected);
    setSf10Busy(null);
    if (result.ok && !result.pick) setPick(null);
    toast(result.message ?? '', result.type);
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
                    onDrop={(e) => { e.preventDefault(); setDragging(false); void onSf9(e.dataTransfer.files); }}
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
                      <input ref={sf9Input} type="file" className="input-file" id="file-upload" accept=".csv,.xlsx,.xls" onChange={(e) => void onSf9(e.target.files)} />
                    </div>
                    {sf9Busy && <Reading fileName={sf9Busy} kind="sf9" />}
                  </div>
                  {!sf9Busy && sectionPick && (
                    <div className="sf10-file-row sf10-pick">
                      <span className="file-type-icon"><Icon name="file-sheet" /></span>
                      <span className="sf10-file-name">{sectionPick.file.name}: choose the section to import</span>
                      <div className="select-wrap">
                        <select aria-label="Section to import" value={sectionPick.selected} onChange={(e) => setSectionPick({ ...sectionPick, selected: e.target.value })}>
                          {sectionPick.sections.map((x) => <option key={x.name} value={x.name}>{x.name} ({x.learners} learners)</option>)}
                        </select>
                        <Icon name="chevron-down" className="select-chevron" />
                      </div>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => void readPickedSection()}>Import section</button>
                      <button type="button" className="icon-btn" aria-label="Cancel" onClick={() => setSectionPick(null)}><Icon name="x" /></button>
                    </div>
                  )}
                  {error && <div className="form-error" role="alert" style={{ whiteSpace: 'pre-line' }}>{error}</div>}
                  {upload && (
                    <div className="uploaded-file" id="file-info">
                      <span className="file-type-icon"><Icon name="file-sheet" /></span>
                      <div className="uploaded-file-text">
                        <strong id="selected-filename">{upload.name}</strong>
                        <span id="file-details">{upload.rows} learner{upload.rows === 1 ? '' : 's'} · {upload.files.length} grade file{upload.files.length === 1 ? '' : 's'}</span>
                      </div>
                      <span className="pill pill-green"><Icon name="check" /> Ready</span>
                      <button type="button" className="icon-btn" aria-label="Remove the uploaded class files" onClick={() => { removeSf9(); setError(''); toast('Class gradebook removed.', 'info'); }}>
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
                      <input ref={sf10Input} type="file" className="input-file" id="class-sf10-upload" accept=".csv,.xlsx,.xls" onChange={(e) => void onSf10(e.target.files)} />
                    </div>
                  </div>
                  <div className="sf10-file-list" aria-live="polite">
                    {sf10Busy && <Reading fileName={sf10Busy.file} kind={sf10Busy.kind} />}
                    {!sf10Busy && pick && (
                      <div className="sf10-file-row sf10-pick">
                        <span className="file-type-icon"><Icon name="file-sheet" /></span>
                        <span className="sf10-file-name">{pick.file.name}: choose the sheet with your learners</span>
                        <div className="select-wrap">
                          <select aria-label="Sheet to read" value={pick.selected} onChange={(e) => setPick({ ...pick, selected: e.target.value })}>
                            {pick.sheets.map((x) => <option key={x.name} value={x.name}>{x.label ?? `${x.name} (${x.rows} rows)`}</option>)}
                          </select>
                          <Icon name="chevron-down" className="select-chevron" />
                        </div>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => void readPickedSheet()}>Read this sheet</button>
                        <button type="button" className="icon-btn" aria-label="Cancel" onClick={() => setPick(null)}><Icon name="x" /></button>
                      </div>
                    )}
                    {!sf10Busy && state.sf10File && (
                      <div className="sf10-file-row">
                        <span className="file-type-icon"><Icon name="file-text" /></span>
                        <span className="sf10-file-name">
                          {state.sf10File.name} · {formatFileSize(state.sf10File.size)} · {state.sf10Students.length} learner{state.sf10Students.length === 1 ? '' : 's'} read
                          {state.sf10File.warnings.length ? ` · ${state.sf10File.warnings.length} note(s)` : ''}
                        </span>
                        <span className="pill pill-green"><Icon name="check" /> Ready</span>
                        <button type="button" className="icon-btn" aria-label="Remove the SF10 file" onClick={removeSf10}><Icon name="x" /></button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </article>

          <div className="page-actions">
            <div className="action-end">
              <span className="action-note">Your original file won&apos;t be changed.</span>
              <button type="button" className="btn btn-primary" disabled={!hasFiles || Boolean(sf9Busy) || Boolean(sf10Busy)} onClick={prepare}>
                Prepare reports <Icon name="chevron-right" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
