import { useState } from "react";
import { exportBookmarks } from "../../../state/bookmarks/exportHtml";
import { profileOfWindow } from "../../../state/bookmarks/bookmarkGroups";
import { settingsBrowserWindow } from "../../../state/settings/settingsWindows";
import { Button } from "../../ui";
import { ProfilePicker, Row, useHiddenSetting } from "../Form";
import { findSetting } from "../settingsIndex";
import { actionMessage, actionRunning, finishedAction, IDLE_ACTION, RUNNING_ACTION, type ActionState } from "./actionState";

export function ExportBookmarksRow() {
  const [profileId, setProfileId] = useState(() => profileOfWindow(settingsBrowserWindow()));
  const [exporting, setExporting] = useState<ActionState<string>>(IDLE_ACTION);
  const hidden = useHiddenSetting();
  if (hidden(findSetting("general.exportBookmarks"))) return null;
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
    <Row anchor="general.exportBookmarks" description={actionMessage(exporting) || undefined}>
      <ProfilePicker value={profileId} onChange={setProfileId} />
      <Button title="Export…" disabled={actionRunning(exporting)} onPress={() => void run()} />
    </Row>
  );
}
