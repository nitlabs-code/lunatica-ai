import { useEffect, useId, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  size?: 'default' | 'wide'
}

export function Modal({ open, onClose, title, description, children, size = 'default' }: ModalProps) {
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" className="absolute inset-0 cursor-default bg-black/45 backdrop-blur-[3px]" onClick={onClose} aria-label="Fechar janela" />
      <div className={`modal-panel relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] border bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl dark:bg-ink-850 sm:max-h-[90vh] sm:rounded-2xl sm:p-6 ${size === 'wide' ? 'max-w-3xl' : 'max-w-md'}`}>
        <div className="modal-header mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">{title}</h2>
            {description && <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="icon-btn -mr-1 -mt-1" aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
