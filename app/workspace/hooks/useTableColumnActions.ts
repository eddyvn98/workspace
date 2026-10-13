import { useCallback } from "react";
import type { CanvasBlock } from "../types/block";
import type { TableColumnOption, TableColumnType } from "../types/table";
import { createWorkspaceId } from "../utils/workspaceId";

/** Column-level settings (type/select-options/sort/filter) for TableBlock -
 *  split from useTableBlockActions.ts since these act on a whole column via
 *  TableColumnHeaderControls.tsx, not on the selected cell/row/col like
 *  everything in that hook. */
export function useTableColumnActions(
  block: CanvasBlock<"table">,
  onChange: (patch: Partial<CanvasBlock<"table">["data"]>) => void,
  cols: number
) {
  const withColumnTypes = useCallback(
    (col: number, next: TableColumnType) => {
      const types = block.data?.columnTypes ?? Array.from({ length: cols }, () => "text" as TableColumnType);
      const updated = [...types];
      updated[col] = next;
      onChange({ columnTypes: updated });
    },
    [block.data?.columnTypes, cols, onChange]
  );

  const handleAddOption = useCallback(
    (col: number, label: string, color: string) => {
      const existing = block.data?.columnSelectOptions?.[col] ?? [];
      const next: TableColumnOption = { id: createWorkspaceId(), label, color };
      onChange({ columnSelectOptions: { ...(block.data?.columnSelectOptions ?? {}), [col]: [...existing, next] } });
    },
    [block.data?.columnSelectOptions, onChange]
  );

  const handleRemoveOption = useCallback(
    (col: number, id: string) => {
      const existing = block.data?.columnSelectOptions?.[col] ?? [];
      onChange({ columnSelectOptions: { ...(block.data?.columnSelectOptions ?? {}), [col]: existing.filter((o) => o.id !== id) } });
    },
    [block.data?.columnSelectOptions, onChange]
  );

  const handleSortColumn = useCallback(
    (col: number, dir: "asc" | "desc" | null) => onChange({ sortCol: dir ? { col, dir } : null }),
    [onChange]
  );

  const handleFilterColumn = useCallback(
    (col: number, optionId: string | null) => onChange({ filterCol: optionId ? { col, optionId } : null }),
    [onChange]
  );

  return {
    handleSetColumnType: withColumnTypes,
    handleAddOption,
    handleRemoveOption,
    handleSortColumn,
    handleFilterColumn,
  };
}
