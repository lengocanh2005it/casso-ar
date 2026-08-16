import { useEffect, useState } from 'react';

export function useBulkSelection(ids: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const idsKey = ids.join(',');

  useEffect(() => {
    const visibleIds = idsKey ? idsKey.split(',') : [];
    const visibleIdSet = new Set(visibleIds);
    setSelected((current) => {
      const next = new Set([...current].filter((id) => visibleIdSet.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [idsKey]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    setSelected((current) =>
      current.size === ids.length ? new Set() : new Set(ids),
    );
  }

  function clear() {
    setSelected(new Set());
  }

  function drop(idsToDrop: string[]) {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of idsToDrop) next.delete(id);
      return next;
    });
  }

  return {
    selectedIds: [...selected],
    isSelected: (id: string) => selected.has(id),
    allSelected: ids.length > 0 && selected.size === ids.length,
    toggle,
    toggleAll,
    clear,
    drop,
  };
}
