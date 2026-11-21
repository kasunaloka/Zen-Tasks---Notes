// ==UserScript==
// @name           Zen Notes
// @description    Capture notes from the Zen sidebar footer.
// @include        main
// ==/UserScript==

(() => {
  "use strict";

  const PREF = "extensions.zentasksandnotes.spaces";
  const BUTTON_ID = "ztan-button";
  const PANEL_ID = "ztan-panel";
  const HTML = "http://www.w3.org/1999/xhtml";

  function element(tag, attributes = {}, label) {
    const node = document.createElementNS(HTML, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    if (label !== undefined) node.textContent = label;
    return node;
  }

  function action(label, handler) {
    const button = element("button", { type: "button" }, label);
    button.addEventListener("click", handler);
    return button;
  }

  function readSpaces() {
    const spaces = JSON.parse(Services.prefs.getStringPref(PREF, "{}"));
    if (!spaces || typeof spaces !== "object" || Array.isArray(spaces)) {
      throw new Error("Invalid Notes storage");
    }
    return spaces;
  }

  function entriesFor(spaces, spaceId) {
    if (!Object.hasOwn(spaces, spaceId)) return [];
    const entries = spaces[spaceId];
    if (!Array.isArray(entries) || entries.some(entry =>
      typeof entry?.id !== "string" || typeof entry.text !== "string" ||
      (entry.kind !== "task" && entry.kind !== "note")
    )) {
      throw new Error("Invalid Notes entries");
    }
    return entries;
  }

  function pageLink(spec, title) {
    if (typeof spec !== "string") return null;
    try {
      const url = new URL(spec);
      if (url.protocol !== "https:" && url.protocol !== "http:") return null;
      url.username = "";
      url.password = "";
      const label = typeof title === "string" ? title.trim() : "";
      return { url: url.href, title: label || url.hostname };
    } catch {
      return null;
    }
  }

  function emptyDraft() {
    return { text: "", page: null };
  }

  function init() {
    const footer = document.getElementById("zen-sidebar-foot-buttons");
    const popupSet = document.getElementById("mainPopupSet");
    if (!footer || !popupSet || typeof gZenWorkspaces === "undefined" ||
        !gZenWorkspaces || !("activeWorkspace" in gZenWorkspaces) ||
        document.getElementById(BUTTON_ID)) return;

    const { PrivateBrowsingUtils } = ChromeUtils.importESModule(
      "resource://gre/modules/PrivateBrowsingUtils.sys.mjs"
    );
    if (PrivateBrowsingUtils.isWindowPrivate(window)) return;

    let spaceId = "";
    let writing = false;
    let restoreFocus = false;
    let previewUpdatePending = false;
    let previewId = 0;
    let previews = [];
    const views = new Map();

    const button = document.createXULElement("toolbarbutton");
    button.id = BUTTON_ID;
    button.className = "toolbarbutton-1 zen-sidebar-action-button";
    button.setAttribute("label", "Notes");
    button.setAttribute("tooltiptext", "Notes");
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-controls", PANEL_ID);
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("tabindex", "0");

    const panel = document.createXULElement("panel");
    panel.id = PANEL_ID;
    panel.setAttribute("type", "arrow");
    panel.setAttribute("flip", "both");
    panel.setAttribute("noautofocus", "true");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Notes");

    const body = element("div", { class: "ztan-body" });
    const heading = element("h1", { class: "ztan-title" }, "Notes");
    const form = element("form", { class: "ztan-composer" });
    const composerHeading = element("div", { class: "ztan-composer-heading" });
    const composerLabel = element("label", { for: "ztan-note-input" });
    const shortcutHint = element("span", { class: "ztan-shortcut" }, "Ctrl/⌘ + Enter to save");
    const noteInput = element("textarea", {
      id: "ztan-note-input", rows: "3", maxlength: "8000",
    });
    const pagePreview = element("div", { class: "ztan-page-preview" });
    const pageInfo = element("div", { class: "ztan-page-info" });
    const pageCaption = element("span", { class: "ztan-page-caption" }, "Attached page");
    const pageTitle = element("span", { class: "ztan-page-title" });
    const removePage = action("Remove", toggleAttachment);
    removePage.setAttribute("aria-label", "Remove attached page");
    pageInfo.append(pageCaption, pageTitle);
    pagePreview.append(pageInfo, removePage);

    const composerActions = element("div", { class: "ztan-composer-actions" });
    const formActions = element("div", { class: "ztan-form-actions" });
    const attach = action("Attach current page", toggleAttachment);
    const cancel = action("Cancel", cancelEdit);
    const submit = element("button", {
      type: "submit", class: "ztan-primary", "aria-keyshortcuts": "Control+Enter Meta+Enter",
    });
    formActions.append(cancel, submit);
    composerActions.append(attach, formActions);
    composerHeading.append(composerLabel, shortcutHint);
    form.append(composerHeading, noteInput, pagePreview, composerActions);

    const error = element("p", { class: "ztan-error", role: "alert" });
    const listHeading = element("div", { class: "ztan-list-heading" });
    const listTitle = element("h2", {}, "Saved notes");
    const count = element("span", { class: "ztan-count" });
    const list = element("ul", { class: "ztan-list", "aria-label": "Saved notes" });
    const empty = element("p", { class: "ztan-empty" }, "No notes yet. Write one above.");
    listHeading.append(listTitle, count);
    body.append(heading, form, error, listHeading, list, empty);
    panel.append(body);

    function getView() {
      if (!views.has(spaceId)) {
        views.set(spaceId, { add: emptyDraft(), edit: null, confirmDeleteId: null, expanded: new Set() });
      }
      return views.get(spaceId);
    }

    function renderAttachment(page) {
      attach.hidden = Boolean(page);
      pagePreview.hidden = !page;
      pageTitle.textContent = page?.title || "";
      pageTitle.title = page?.url || "";
    }

    function renderView() {
      const view = getView();
      const draft = view.edit || view.add;
      composerLabel.textContent = view.edit ? "Editing note" : "New note";
      noteInput.value = draft.text;
      noteInput.placeholder = view.edit ? "Edit your note…" : "Write a note…";
      cancel.hidden = !view.edit;
      submit.textContent = view.edit ? "Save changes" : "Save note";
      renderAttachment(draft.page);
      error.textContent = "";
      renderEntries();
    }

    function renderEntries() {
      const renderedSpaceId = spaceId;
      const focused = document.activeElement;
      const focusKey = list.contains(focused) ? focused.dataset.focusKey : null;
      let entries;
      try {
        entries = entriesFor(readSpaces(), renderedSpaceId).filter(entry => entry.kind === "note");
      } catch (cause) {
        console.error("Zen Notes could not read notes", cause);
        previews = [];
        list.replaceChildren();
        list.hidden = true;
        count.hidden = true;
        empty.hidden = true;
        error.textContent = "Couldn't load saved notes.";
        if (focusKey) noteInput.focus();
        return;
      }

      const view = getView();
      const ids = new Set(entries.map(entry => entry.id));
      if (!ids.has(view.confirmDeleteId)) view.confirmDeleteId = null;
      for (const id of view.expanded) {
        if (!ids.has(id)) view.expanded.delete(id);
      }

      const scrollTop = list.scrollTop;
      previews = [];
      list.replaceChildren(...entries.map(entry => renderEntry(entry, view, renderedSpaceId)));
      list.hidden = entries.length === 0;
      list.scrollTop = scrollTop;
      count.hidden = false;
      count.textContent = String(entries.length);
      count.setAttribute("aria-label", `${entries.length} saved ${entries.length === 1 ? "note" : "notes"}`);
      empty.hidden = entries.length > 0;
      if (focusKey) focusEntryAction(focusKey);
      schedulePreviewUpdate();
    }

    function focusEntryAction(key) {
      const control = Array.from(list.querySelectorAll("[data-focus-key]"))
        .find(node => node.dataset.focusKey === key && !node.disabled);
      if (control?.classList.contains("ztan-expand")) control.hidden = false;
      (control && !control.hidden ? control : noteInput).focus();
    }

    function renderEntry(entry, view, renderedSpaceId) {
      const row = element("li", { class: "ztan-entry" });
      const content = element("div", { class: "ztan-entry-content" });
      const textId = `ztan-note-text-${++previewId}`;
      const entryText = element("p", { class: "ztan-entry-text", id: textId }, entry.text);
      const description = entry.text.replace(/\s+/g, " ").trim().slice(0, 50);
      const isCurrentRow = () => isCurrentSpace(renderedSpaceId) && row.isConnected;
      const expand = action("Show more", () => {
        if (!isCurrentRow()) return;
        setExpanded(!view.expanded.has(entry.id));
      });
      expand.hidden = true;
      expand.className = "ztan-expand";
      expand.dataset.focusKey = `${entry.id}:expand`;
      expand.setAttribute("aria-controls", textId);

      function setExpanded(expanded) {
        if (expanded) view.expanded.add(entry.id);
        else view.expanded.delete(entry.id);
        entryText.classList.toggle("ztan-expanded", expanded);
        expand.textContent = expanded ? "Show less" : "Show more";
        expand.setAttribute("aria-expanded", String(expanded));
        expand.setAttribute("aria-label", `${expanded ? "Show less of" : "Show more of"} note ${description}`);
      }

      setExpanded(view.expanded.has(entry.id));
      previews.push({ entryText, expand, setExpanded, id: entry.id });
      content.append(entryText, expand);

      const page = pageLink(entry.page?.url, entry.page?.title);
      if (page) {
        const link = element("a", { class: "ztan-link", href: page.url, title: page.url }, page.title);
        link.dataset.focusKey = `${entry.id}:link`;
        link.addEventListener("click", event => {
          event.preventDefault();
          if (!isCurrentRow()) return;
          openWebLinkIn(page.url, "tab");
          panel.hidePopup();
        });
        content.append(link);
      }

      const controls = element("div", { class: "ztan-entry-actions" });
      if (view.confirmDeleteId === entry.id) {
        const prompt = element("span", { class: "ztan-delete-prompt" }, "Delete this note?");
        const cancelDelete = action("Cancel", () => {
          if (!isCurrentRow()) return;
          view.confirmDeleteId = null;
          renderEntries();
          focusEntryAction(`${entry.id}:delete`);
        });
        cancelDelete.dataset.focusKey = `${entry.id}:cancel-delete`;
        cancelDelete.setAttribute("aria-label", `Cancel deleting note ${description}`);
        const confirmDelete = action("Delete", () => {
          if (!isCurrentRow()) return;
          if (!writeEntries(renderedSpaceId, (entries, index) => entries.splice(index, 1), entry.id)) return;
          view.confirmDeleteId = null;
          view.expanded.delete(entry.id);
          if (view.edit?.id === entry.id) {
            view.edit = null;
            renderView();
          } else {
            renderEntries();
          }
        });
        confirmDelete.className = "ztan-delete";
        confirmDelete.dataset.focusKey = `${entry.id}:confirm-delete`;
        confirmDelete.setAttribute("aria-label", `Confirm deleting note ${description}`);
        controls.append(prompt, cancelDelete, confirmDelete);
      } else {
        const edit = action("Edit", () => {
          if (!isCurrentRow()) return;
          view.edit = { id: entry.id, text: entry.text, page };
          renderView();
          noteInput.focus();
        });
        edit.disabled = Boolean(view.edit);
        edit.dataset.focusKey = `${entry.id}:edit`;
        edit.setAttribute("aria-label", `Edit note ${description}`);
        const remove = action("Delete", () => {
          if (!isCurrentRow()) return;
          view.confirmDeleteId = entry.id;
          renderEntries();
          focusEntryAction(`${entry.id}:confirm-delete`);
        });
        remove.dataset.focusKey = `${entry.id}:delete`;
        remove.setAttribute("aria-label", `Delete note ${description}`);
        controls.append(edit, remove);
      }

      row.append(content, controls);
      return row;
    }

    function schedulePreviewUpdate() {
      if (previewUpdatePending) return;
      previewUpdatePending = true;
      window.requestAnimationFrame(() => {
        previewUpdatePending = false;
        if (!panelIsOpen()) return;
        for (const preview of previews) {
          if (!preview.entryText.clientWidth) continue;
          const lineHeight = parseFloat(window.getComputedStyle(preview.entryText).lineHeight);
          if (!Number.isFinite(lineHeight)) continue;
          const overflows = preview.entryText.scrollHeight > Math.ceil(lineHeight * 4);
          if (!overflows && !preview.expand.hidden && document.activeElement === preview.expand) {
            focusEntryAction(`${preview.id}:edit`);
          }
          preview.expand.hidden = !overflows;
          if (!overflows) preview.setExpanded(false);
        }
      });
    }

    function writeEntries(expectedSpaceId, update, entryId = null) {
      if (!isCurrentSpace(expectedSpaceId)) return false;

      error.textContent = "";
      writing = true;
      try {
        if (Services.prefs.prefIsLocked(PREF)) throw new Error("Notes storage is locked");
        // Read the latest preference and write synchronously on the browser chrome thread.
        const spaces = readSpaces();
        const entries = entriesFor(spaces, expectedSpaceId);
        const index = entryId === null ? -1 : entries.findIndex(entry => entry.id === entryId && entry.kind === "note");
        if (entryId !== null && index === -1) {
          renderEntries();
          error.textContent = getView().edit?.id === entryId
            ? "This note was deleted in another window. Copy your draft before canceling."
            : "This note was deleted in another window.";
          return false;
        }
        update(entries, index);
        spaces[expectedSpaceId] = entries;
        Services.prefs.setStringPref(PREF, JSON.stringify(spaces));
        return true;
      } catch (cause) {
        console.error("Zen Notes could not save changes", cause);
        error.textContent = "Couldn't save changes. Try again.";
        return false;
      } finally {
        writing = false;
      }
    }

    function toggleAttachment() {
      if (!isCurrentSpace(spaceId)) return;
      const view = getView();
      const draft = view.edit || view.add;
      if (draft.page) {
        draft.page = null;
        error.textContent = "";
        renderAttachment(null);
        attach.focus();
      } else {
        const browser = gBrowser.selectedBrowser;
        draft.page = pageLink(browser?.currentURI?.spec, browser?.contentTitle);
        error.textContent = draft.page ? "" : "Open a web page to attach its link.";
        renderAttachment(draft.page);
        if (draft.page) removePage.focus();
      }
    }

    function cancelEdit() {
      if (!isCurrentSpace(spaceId)) return;
      const view = getView();
      if (!view.edit) return;
      const id = view.edit.id;
      view.edit = null;
      renderView();
      focusEntryAction(`${id}:edit`);
    }

    form.addEventListener("input", event => {
      if (event.target !== noteInput || !isCurrentSpace(spaceId)) return;
      const view = getView();
      const draft = view.edit || view.add;
      draft.text = event.target.value;
      error.textContent = "";
    });

    noteInput.addEventListener("keydown", event => {
      if (event.key !== "Enter" || event.isComposing || event.altKey ||
          (!event.ctrlKey && !event.metaKey)) return;
      event.preventDefault();
      form.requestSubmit();
    });

    form.addEventListener("submit", event => {
      event.preventDefault();
      const expectedSpaceId = spaceId;
      if (!isCurrentSpace(expectedSpaceId)) return;
      const view = getView();
      const draft = view.edit || view.add;
      const value = draft.text.trim();
      if (!value) {
        error.textContent = "Write a note.";
        noteInput.focus();
        return;
      }

      const fields = { text: value, page: draft.page };
      const adding = !view.edit;
      if (!writeEntries(expectedSpaceId, (entries, index) => {
        if (view.edit) {
          entries[index] = { ...entries[index], ...fields };
        } else {
          entries.unshift({ id: crypto.randomUUID(), kind: "note", ...fields });
        }
      }, view.edit?.id)) {
        noteInput.focus();
        return;
      }

      if (view.edit) view.edit = null;
      else view.add = emptyDraft();
      renderView();
      if (adding) list.scrollTop = 0;
      noteInput.focus();
    });

    function panelIsOpen() {
      return panel.state === "open" || panel.state === "showing";
    }

    function isCurrentSpace(expectedSpaceId) {
      if (spaceId !== gZenWorkspaces.activeWorkspace) refreshSpace();
      return Boolean(expectedSpaceId) && expectedSpaceId === spaceId;
    }

    function refreshSpace() {
      const nextId = gZenWorkspaces.activeWorkspace;
      button.disabled = !nextId;
      if (nextId === spaceId) return;
      if (views.has(spaceId)) views.get(spaceId).confirmDeleteId = null;
      spaceId = nextId;
      if (!spaceId) {
        if (panelIsOpen()) panel.hidePopup();
      } else if (panelIsOpen()) {
        renderView();
        noteInput.focus();
      }
    }

    button.addEventListener("command", () => {
      if (panelIsOpen()) {
        panel.hidePopup();
        return;
      }
      refreshSpace();
      if (!spaceId) return;
      renderView();
      button.focus();
      panel.openPopup(button, "before_start");
    });

    panel.addEventListener("popupshowing", () => {
      button.setAttribute("panelopen", "true");
      button.setAttribute("aria-expanded", "true");
    });
    panel.addEventListener("popupshown", () => {
      noteInput.focus();
      schedulePreviewUpdate();
    });
    panel.addEventListener("popuphidden", () => {
      if (views.has(spaceId)) views.get(spaceId).confirmDeleteId = null;
      button.removeAttribute("panelopen");
      button.setAttribute("aria-expanded", "false");
      if (restoreFocus) button.focus();
      restoreFocus = false;
    });
    panel.addEventListener("keydown", event => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      restoreFocus = true;
      panel.hidePopup();
    });

    const previewObserver = new ResizeObserver(schedulePreviewUpdate);
    previewObserver.observe(list);
    const observeEntries = () => {
      if (!writing && panelIsOpen() && isCurrentSpace(spaceId)) renderEntries();
    };
    Services.prefs.addObserver(PREF, observeEntries);
    gZenWorkspaces.addChangeListeners?.(refreshSpace);
    window.addEventListener("unload", () => {
      previewObserver.disconnect();
      Services.prefs.removeObserver(PREF, observeEntries);
      gZenWorkspaces.removeChangeListeners?.(refreshSpace);
    }, { once: true });
    window.addEventListener("ZenWorkspacesUIUpdate", refreshSpace);
    window.addEventListener("AfterWorkspacesSessionRestore", refreshSpace);

    const plus = document.getElementById("zen-create-new-button");
    footer.insertBefore(button, plus?.parentNode === footer ? plus : null);
    popupSet.append(panel);
    refreshSpace();
  }

  if (document.readyState === "complete") init();
  else window.addEventListener("load", init, { once: true });
})();
