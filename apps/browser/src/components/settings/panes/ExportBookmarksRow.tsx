import { useState } from "react";
import { exportBookmarks } from "../../../state/bookmarks/exportHtml";
import { profileOfWindow } from "../../../state/bookmarks/bookmarkGroups";
import { settingsBrowserWindow } from "../../../state/settings/settingsWindows";
import { Button } from "../../ui";
import { ProfilePicker, Row } from "../Form";
import { actionMessage, actionRunning, finishedAction, IDLE_ACTION, RUNNING_ACTION, type ActionState } from "./actionState";

export function ExportBookmarksRow() {
  const [profileId, setProfileId] = useState(() => profileOfWindow(settingsBrowserWindow()));
  const [exporting, setExporting] = useState<ActionState<string>>(IDLE_ACTION);
  const run = async () => {
    setExporting(RUNNING_ACTION);
    let message: string | null = null;
    try {
      const path = await exportBookmarks(profileId);
      if (path) message = `Saved “${path.split("/").pop()}” to “${path.split("/").slice(-2, -1)[0] ?? ""}”.`;
    } catch (error) {
      message = `Couldn't export: ${(error as Error).message}`;
    } finally {
      setExporting((state) => finishedAction(state, message));
    }
  };
  return (
    <Row anchor="general.exportBookmarks" description={actionMessage(exporting) || undefined}>
      <ProfilePicker value={profileId} onChange={setProfileId} />
      <Button title="Export…" disabled={actionRunning(exporting)} onPress={() => void run()} />
    </Row>
  );
}
