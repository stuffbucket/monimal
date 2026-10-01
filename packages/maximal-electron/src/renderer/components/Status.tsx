import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

export interface StatusProps {
  id: string;
  children: ReactNode;
  dismissible?: boolean;
  order?: number;
}

interface StatusEntry extends Required<Pick<StatusProps, 'id' | 'dismissible' | 'order'>> {
  children: ReactNode;
  dismissed: boolean;
  sequence: number;
}

interface StatusContextValue {
  statuses: StatusEntry[];
  upsert: (status: StatusProps) => void;
  remove: (id: string) => void;
  dismiss: (id: string) => void;
}

const StatusContext = createContext<StatusContextValue | null>(null);

function useStatusContext(): StatusContextValue {
  const context = useContext(StatusContext);
  if (context === null) {
    throw new Error('Status components require a StatusProvider');
  }
  return context;
}

/** Owns an ordered registry of status entries for one application surface. */
export function StatusProvider({ children }: { children: ReactNode }): ReactElement {
  const [entries, setEntries] = useState<Map<string, StatusEntry>>(() => new Map());
  const nextSequence = useRef(0);

  const upsert = useCallback((status: StatusProps): void => {
    setEntries((current) => {
      const existing = current.get(status.id);
      const next = new Map(current);
      next.set(status.id, {
        id: status.id,
        children: status.children,
        dismissible: status.dismissible ?? true,
        order: status.order ?? 0,
        dismissed: existing?.dismissed ?? false,
        sequence: existing?.sequence ?? nextSequence.current++,
      });
      return next;
    });
  }, []);

  const remove = useCallback((id: string): void => {
    setEntries((current) => {
      if (!current.has(id)) return current;
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }, []);

  const dismiss = useCallback((id: string): void => {
    setEntries((current) => {
      const entry = current.get(id);
      if (entry === undefined || !entry.dismissible || entry.dismissed) return current;
      const next = new Map(current);
      next.set(id, { ...entry, dismissed: true });
      return next;
    });
  }, []);

  const statuses = useMemo(
    () => [...entries.values()]
      .filter(({ dismissed }) => !dismissed)
      .sort((left, right) => left.order - right.order || left.sequence - right.sequence),
    [entries],
  );
  const value = useMemo(
    () => ({ statuses, upsert, remove, dismiss }),
    [dismiss, remove, statuses, upsert],
  );

  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
}

/** Registers one keyed status without imposing where its host is rendered. */
export function Status({
  id,
  children,
  dismissible = true,
  order = 0,
}: StatusProps): null {
  const { upsert, remove } = useStatusContext();

  useLayoutEffect(() => {
    upsert({ id, children, dismissible, order });
    return () => remove(id);
  }, [id, remove, upsert]);

  useLayoutEffect(() => {
    upsert({ id, children, dismissible, order });
  }, [children, dismissible, id, order, upsert]);

  return null;
}

/** Pages through the statuses registered in the nearest provider. */
export function StatusViewport(): ReactElement | null {
  const { statuses, dismiss } = useStatusContext();
  const [currentId, setCurrentId] = useState<string>();
  const currentIndex = Math.max(0, statuses.findIndex(({ id }) => id === currentId));
  const current = statuses[currentIndex];

  useEffect(() => {
    if (current === undefined) {
      setCurrentId(undefined);
    } else if (current.id !== currentId) {
      setCurrentId(current.id);
    }
  }, [current, currentId]);

  if (current === undefined) return null;
  const selectOffset = (offset: number): void => {
    const index = (currentIndex + offset + statuses.length) % statuses.length;
    setCurrentId(statuses[index]?.id);
  };

  return (
    <div className="status-viewport">
      <div className="status-viewport__content">{current.children}</div>
      <div className="status-viewport__controls">
        {statuses.length > 1 ? (
          <>
            <button
              type="button"
              className="status-viewport__action"
              aria-label="Previous status"
              onClick={() => selectOffset(-1)}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <span className="status-viewport__position" aria-label={`Status ${String(currentIndex + 1)} of ${String(statuses.length)}`}>
              {currentIndex + 1} / {statuses.length}
            </span>
            <button
              type="button"
              className="status-viewport__action"
              aria-label="Next status"
              onClick={() => selectOffset(1)}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </>
        ) : null}
        {current.dismissible ? (
          <button
            type="button"
            className="status-viewport__action"
            aria-label="Dismiss status"
            onClick={() => dismiss(current.id)}
          >
            <X aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function useStatuses(): readonly StatusEntry[] {
  return useStatusContext().statuses;
}
