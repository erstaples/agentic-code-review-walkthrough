import type { Uri } from "vscode";
import type {
  Finding,
  TourAnchor,
  TourPlan,
  SourceTexts,
} from "../shared/tour.js";
import type {
  PresentationMode,
  PresentationSnapshot,
  RemovedCodeDisplay,
} from "../shared/snapshot.js";
import type { Hunk } from "./hunks.js";

export interface PreparedTour {
  tourId: string;
  workspace: string;
  identity: string;
  plan: TourPlan;
  findings: Finding[];
  texts: Map<string, SourceTexts>;
  hunks: Map<string, Hunk[]>;
}
export interface TourState extends PreparedTour {
  stopIndex: number;
  beatIndex: number;
  mode: PresentationMode;
  selectedAnchor: number | null;
  presentation?: PresentationSnapshot;
}
export interface AnchorRecord {
  anchor: TourAnchor;
  base: Uri;
  head: Uri;
  target: Uri;
  companion?: boolean;
  removedCode?: RemovedCodeDisplay | null;
}
export function sourceText(
  state: Pick<PreparedTour, "texts">,
  path: string,
): SourceTexts {
  const text = state.texts.get(path);
  if (!text) throw new Error(`Missing captured source: ${path}`);
  return text;
}
