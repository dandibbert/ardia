import { useState } from "react";
import { exportBookmarks } from "../../../state/bookmarks/exportHtml";
import { Button } from "../../ui";
import { Row } from "../Form";
import { actionMessage, actionRunning, finishedAction, IDLE_ACTION, RUNNING_ACTION, type ActionState } from "./actionState";

export function ExportBookmarksRow({ profileId }: { profileId: string }) {
  const [exporting, setExporting] = useState<ActionState<string>>(IDLE_ACTION);
  const run = async () => {
    setExporting(RUNNING_ACTION);
    let message: string | null = null;
    try {
      const path = await exportBookmarks(profileId);
      if (path) {
        const parts = path.split(/[\\/]/);
        message = `Saved “${parts.at(-1) ?? path}” to “${parts.at(-2) ?? ""}”.`;
      }
    } catch (error) {
      message = `Couldn't export: ${(error as Error).message}`;
    } finally {
      setExporting((state) => finishedAction(state, message));
    }
  };
  return (
    <Row anchor="profiles.exportBookmarks" description={actionMessage(exporting) || undefined}>
      <Button title="Export…" disabled={actionRunning(exporting)} onPress={() => void run()} />
    </Row>
  );
}
