# Zen Notes

A Cosine mod for Zen Browser. Open **Notes** beside the `+` button at the bottom of the sidebar to write multiline notes and optionally attach the current web page. Long notes have a **Show more** control, and deleting a note asks for confirmation.

Each Space has its own notes. Saved entries stay in the local Zen profile after a restart. Drafts stay in their original Space and window until saved or the window closes. Canceling an edit returns you to your add draft. The button appears in regular windows. Task records from earlier versions remain saved in the profile.

The panel shows the current Space under **Notes**. Use **Search notes** to filter its saved notes by text, attached page title, or URL. **Clear search** restores the full list.

## Install with Cosine

The mod targets Zen 1.23b and can run alongside **Zen Tab Group Colors**. In **Settings → Cosine Mods**, open the gear menu and turn on **Enable installing JS from unofficial sources** before installing either way.

### From GitHub

1. Once the version you want is on GitHub, paste `kasunaloka/Zen-Tasks---Notes` into the repository field in **Cosine Mods**. For a copy hosted in a subfolder, paste that folder's full GitHub URL, including `/tree/<branch>/<folder>`.
2. Choose **Install**, check that **Zen Notes** is enabled, and restart Zen.

### From local files

1. Open `about:support` in Zen. Use **Profile Directory → Open Directory** to find the profile, then quit Zen.
2. Copy `theme.json`, `README.md`, `zen-tasks-and-notes.uc.js`, and `zen-tasks-and-notes.css` into `chrome/sine-mods/zen-tasks-and-notes/` inside the profile.
3. Open `chrome/sine-mods/mods.json`. Add a top-level `"zen-tasks-and-notes"` property, or replace that property if the mod is already registered. Use the object from `theme.json` as its value, then add `"enabled": true` and `"no-updates": true` inside that object. Keep any other mod entries.
4. Start Zen. **Notes** should appear beside `+` in the sidebar footer.

## Save a page with a note

Open an HTTP or HTTPS page, open **Notes**, and choose **Attach current page** before saving. The attachment preview and saved link show the page title and its favicon from Zen’s local cache. Pages without a cached favicon show a generic site icon. Choose **Remove** to clear the attachment. Clicking a saved page title opens it in a new tab.

Use the Tab key to reach the sidebar button and panel controls, and Escape to close the panel. Enter adds a new line. Use **Save note** or Ctrl/⌘ + Enter to save.
