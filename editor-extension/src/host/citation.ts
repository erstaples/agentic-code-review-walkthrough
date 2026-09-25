export interface CitationSelection {
  isEmpty: boolean;
  start: { line: number; character: number };
  end: { line: number; character: number };
}

interface CitationInput {
  path: string;
  side: string;
  ref?: string | null;
  selection: CitationSelection;
}

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

export function selectedLines(selection: CitationSelection | null | undefined) {
  if (!selection || selection.isEmpty) {
    fail("no_selection", "Select one or more lines to copy a citation.");
  }

  const startLine = selection.start.line + 1;
  let endLine = selection.end.line + 1;
  // VS Code represents a whole-line selection as ending at column zero on the
  // following line. That following line is not part of the selected text.
  if (
    selection.end.character === 0 &&
    selection.end.line > selection.start.line
  )
    endLine--;
  return { startLine, endLine };
}

export function shortRef(ref: string | null | undefined) {
  return ref != null && /^[0-9a-f]{8,}$/i.test(ref) ? ref.slice(0, 7) : ref;
}

export function formatCitation({ path, side, ref, selection }: CitationInput) {
  if (typeof path !== "string" || path.length === 0) {
    fail(
      "unsupported_editor",
      "The active editor is not a file in this workspace.",
    );
  }

  const normalizedPath = path.replace(/\\/g, "/");
  const { startLine, endLine } = selectedLines(selection);
  const range =
    startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;
  const revision =
    side === "base" || side === "head" ? ` [${side}@${shortRef(ref)}]` : "";
  return `${normalizedPath}:${range}${revision}`;
}
