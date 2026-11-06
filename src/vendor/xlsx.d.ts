declare module '*/xlsx.cjs' {
  const XLSX: {
    read(data: unknown, opts?: Record<string, unknown>): { SheetNames: string[]; Sheets: Record<string, unknown> };
    utils: { sheet_to_json(ws: unknown, opts?: Record<string, unknown>): unknown[][] };
  };
  export default XLSX;
}
