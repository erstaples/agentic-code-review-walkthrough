import type * as Code from "vscode";

type Window = typeof Code.window;
type Workspace = typeof Code.workspace;
type Api = typeof Code;

export interface Commands {
  commands: Pick<typeof Code.commands, "executeCommand">;
}
export interface PresenterApi extends Pick<
  Api,
  "ThemeColor" | "Range" | "OverviewRulerLane"
> {
  window: Pick<Window, "createTextEditorDecorationType">;
}
export interface OpenerApi extends Commands {
  Uri: Pick<typeof Code.Uri, "file" | "from">;
  window: Pick<Window, "showTextDocument"> & {
    tabGroups: Pick<
      Window["tabGroups"],
      "all" | "close" | "onDidChangeTabs" | "onDidChangeTabGroups"
    >;
  };
  workspace: Pick<
    Workspace,
    "registerTextDocumentContentProvider" | "textDocuments" | "openTextDocument"
  >;
}
export interface LayoutApi extends Commands, Pick<Api, "Location" | "Range"> {
  window: Pick<Window, "activeTextEditor" | "visibleTextEditors"> & {
    tabGroups: Pick<Window["tabGroups"], "all" | "close">;
  };
  workspace: Pick<Workspace, "getConfiguration">;
}
export interface HostApi extends Pick<
  Api,
  | "ThemeColor"
  | "Range"
  | "OverviewRulerLane"
  | "Location"
  | "Position"
  | "MarkdownString"
  | "EventEmitter"
  | "TextEditorRevealType"
  | "TextEditorSelectionChangeKind"
> {
  Uri: OpenerApi["Uri"];
  commands: Pick<typeof Code.commands, "executeCommand" | "registerCommand">;
  window: PresenterApi["window"] &
    OpenerApi["window"] &
    LayoutApi["window"] &
    Pick<
      Window,
      | "registerFileDecorationProvider"
      | "onDidChangeVisibleTextEditors"
      | "onDidChangeTextEditorVisibleRanges"
      | "onDidChangeTextEditorSelection"
    >;
  workspace: OpenerApi["workspace"] &
    LayoutApi["workspace"] &
    Pick<
      Workspace,
      | "workspaceFolders"
      | "onDidChangeTextDocument"
      | "onDidChangeConfiguration"
    >;
}
export interface QuickPickApi extends Commands {
  window: Pick<
    Window,
    | "createQuickPick"
    | "showQuickPick"
    | "activeTextEditor"
    | "showWarningMessage"
  >;
}
export interface ViewApi extends Commands {
  Uri: Pick<typeof Code.Uri, "joinPath">;
}

// VS Code owns tab inputs; inspect the supported variants before reading URIs.
export function tabInput(
  tab: Pick<Code.Tab, "input"> | undefined,
): Partial<Code.TabInputText & Code.TabInputTextDiff> {
  const input: unknown = tab?.input;
  if (isTextInput(input)) return input;
  if (isDiffInput(input)) return input;
  return {};
}
function isTextInput(input: unknown): input is Code.TabInputText {
  return typeof input === "object" && input !== null && "uri" in input;
}
function isDiffInput(input: unknown): input is Code.TabInputTextDiff {
  return (
    typeof input === "object" &&
    input !== null &&
    "original" in input &&
    "modified" in input
  );
}
