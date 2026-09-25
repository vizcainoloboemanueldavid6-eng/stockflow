import '@tanstack/react-table';

declare module '@tanstack/react-table' {
  // Per-column presentation used by src/components/tables/data-table.tsx.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Classes for both the header and the body cells (e.g. 'hidden md:table-cell'). */
    className?: string;
    /** Right-align numbers. */
    numeric?: boolean;
    /** Accessible name for a header that shows no text (e.g. the actions column). */
    label?: string;
    /**
     * The cell keeps its own state (menus, dialogs), so it is not re-created when the row
     * data changes. Other cells are (see DataTable).
     */
    stateful?: boolean;
  }
}
