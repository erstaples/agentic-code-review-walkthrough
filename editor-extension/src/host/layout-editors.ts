import type { Tab } from "vscode";
import type { LayoutApi } from "./native.js";
import type { AnchorOpener } from "./anchor-opener.js";
import type { AnchorRecord } from "./state.js";
import type { ShapeName, EditorLayout } from "../shared/layout.js";
import type { LayoutSlot } from "./layout-placement.js";
import { SHAPES } from "./layout-model.js";

export function createLayoutEditors(vscode: LayoutApi, opener: AnchorOpener) {
  // VS Code may retain creation order after a split.
  const groups = () =>
    [...vscode.window.tabGroups.all].sort(
      (left, right) => left.viewColumn - right.viewColumn,
    );
  const tabState = () =>
    groups().flatMap((group) =>
      group.tabs.map((tab) => ({
        tab,
        group,
        column: group.viewColumn,
        active: group.activeTab === tab,
      })),
    );
  const readLayout = () =>
    vscode.commands.executeCommand<EditorLayout>("vscode.getEditorLayout");
  async function setShape(name: ShapeName) {
    await opener.reshape(() =>
      vscode.commands.executeCommand(
        "vscode.setEditorLayout",
        structuredClone(SHAPES[name].layout),
      ),
    );
  }
  async function openInSlot(
    record: AnchorRecord,
    slot: LayoutSlot | undefined,
    focus: boolean,
  ) {
    const prior = slot?.group.activeTab;
    const entry = await opener.open(record, slot?.column, { focus });
    if (!entry) return null;
    // Reusing a hidden tab must still retire the preview it replaces.
    if (
      prior &&
      prior !== entry.tab &&
      entry.column === slot?.column &&
      opener.disposable(prior)
    )
      await vscode.window.tabGroups.close(prior, true);
    return entry;
  }
  function closeReplacedPreview(
    prior: Tab | undefined,
    placed: Tab | undefined,
  ) {
    if (prior && prior !== placed && opener.disposable(prior)) {
      return vscode.window.tabGroups.close(prior, true);
    }
  }
  async function peek(record: AnchorRecord) {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
      throw Object.assign(new Error("Focus an editor before peeking."), {
        code: "bad_request",
      });
    await vscode.commands.executeCommand(
      "editor.action.goToLocations",
      editor.document.uri,
      editor.selection.active,
      [
        new vscode.Location(
          record.target,
          new vscode.Range(
            record.anchor.context.startLine - 1,
            0,
            record.anchor.context.endLine - 1,
            0,
          ),
        ),
      ],
      "peek",
      undefined,
      true,
    );
  }
  return {
    groups,
    tabState,
    readLayout,
    peek,
    setShape,
    openInSlot,
    closeReplacedPreview,
  };
}
