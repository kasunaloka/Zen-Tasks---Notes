# Zen Tasks & Notes

A Cosine mod for Zen Browser. Open **Tasks & Notes** beside the `+` button at the bottom of the sidebar. Use **Tasks** to add and check off to-dos. Use **Notes** to write multiline notes and optionally attach the current web page. Both lists support editing and deletion.

Each Space has its own task and note lists. Saved entries stay in the local Zen profile after a restart. Drafts stay in their original Space and window until saved, canceled, or the window closes. The button appears in regular windows.

## Install with Cosine

The mod targets Zen 1.23b and can run alongside **Zen Tab Group Colors**. In **Settings → Cosine Mods**, open the gear menu and turn on **Enable installing JS from unofficial sources** before installing either way.

### From GitHub

1. In **Cosine Mods**, paste `kasunaloka/Zen-Tasks---Notes` into the GitHub repository field. For a copy hosted in a subfolder, paste that folder's full GitHub URL, including `/tree/<branch>/<folder>`.
2. Choose **Install**, check that **Zen Tasks & Notes** is enabled, and restart Zen.

### From local files

1. Open `about:support` in Zen. Use **Profile Directory → Open Directory** to find the profile, then quit Zen.
2. Copy `theme.json`, `README.md`, `zen-tasks-and-notes.uc.js`, and `zen-tasks-and-notes.css` into `chrome/sine-mods/zen-tasks-and-notes/` inside the profile.
3. Open `chrome/sine-mods/mods.json`. Add a top-level `"zen-tasks-and-notes"` property, or replace that property if the mod is already registered. Use the object from `theme.json` as its value, then add `"enabled": true` and `"no-updates": true` inside that object. Keep any other mod entries.
4. Start Zen. **Tasks & Notes** should appear beside `+` in the sidebar footer.

## Save a page with a note

Open an HTTP or HTTPS page, select **Notes**, and choose **Attach current page** before saving. The panel shows the page title so you can check which link will be saved. Choose **Remove page** to clear the attachment. Clicking a saved page title opens it in a new tab.

Use the Tab key to reach the sidebar button and panel controls, and Escape to close the panel. Enter submits a task. Use **Save note** to submit a note, so Enter can still add a new line.
