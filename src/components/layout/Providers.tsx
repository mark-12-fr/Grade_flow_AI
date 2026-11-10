'use client';

/** App-wide helpers: toast messages (with an optional Undo button), the confirm dialog, and loading the saved data at start-up. */

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { hydrate } from '@/lib/state/store';

type ToastType = 'success' | 'error' | 'info';
interface ModalOptions {
  title?: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  hideCancel?: boolean;
  tone?: 'danger' | 'primary';
  /** Return false to keep the dialog open. */
  onConfirm?: () => boolean | void;
}

/** A button inside a toast, e.g. Undo. The toast stays longer so there is time to press it. */
export interface ToastAction { label: string; onClick: () => void }

interface Ui {
  toast: (message: string, type?: ToastType, action?: ToastAction) => void;
  openModal: (options: ModalOptions) => void;
}

const UiContext = createContext<Ui | null>(null);

export function useUi(): Ui {
  const ui = useContext(UiContext);
  if (!ui) throw new Error('useUi must be used inside <Providers>');
  return ui;
}

export function Providers({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; type: ToastType; show: boolean; action?: ToastAction }>({ message: '', type: 'success', show: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [modal, setModal] = useState<ModalOptions | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const showToast = useCallback((message: string, type: ToastType = 'success', action?: ToastAction) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, type, show: true, action });
    timer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), action ? 9000 : 4200);
  }, []);

  const openModal = useCallback((options: ModalOptions) => setModal(options), []);

  useEffect(() => { void hydrate(); }, []);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (modal && !el.open) el.showModal();
    if (!modal && el.open) el.close();
  }, [modal]);

  const close = () => setModal(null);
  const icon = toast.type === 'error' ? 'alert-circle' : toast.type === 'info' ? 'info' : 'check-circle';

  return (
    <UiContext.Provider value={{ toast: showToast, openModal }}>
      {children}
      <div className={`toast ${toast.type}${toast.show ? ' show' : ''}`} role="status" aria-live="polite">
        <span className="toast-icon"><Icon name={icon} /></span>
        <span>{toast.message}</span>
        {toast.action && (
          <button type="button" className="toast-action" onClick={() => { toast.action?.onClick(); setToast((t) => ({ ...t, show: false })); }}>{toast.action.label}</button>
        )}
        <button type="button" className="icon-btn toast-close" aria-label="Dismiss notification" onClick={() => setToast((t) => ({ ...t, show: false }))}>
          <Icon name="x" />
        </button>
      </div>
      <dialog
        ref={dialog}
        className="modal"
        aria-labelledby="modal-title"
        onClose={() => setModal(null)}
        onClick={(event) => { if (event.target === dialog.current) close(); }}
      >
        <div className="modal-content">
          <button type="button" className="modal-close" aria-label="Close dialog" onClick={close}><Icon name="x" /></button>
          <h2 id="modal-title">{modal?.title ?? 'Confirmation'}</h2>
          <div className="modal-body">{modal?.body}</div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" hidden={Boolean(modal?.hideCancel)} onClick={close}>{modal?.cancelLabel ?? 'Cancel'}</button>
            <button
              type="button"
              className={`btn ${modal?.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
              onClick={() => { if (modal?.onConfirm?.() === false) return; close(); }}
            >{modal?.confirmLabel ?? 'Close'}</button>
          </div>
        </div>
      </dialog>
    </UiContext.Provider>
  );
}
