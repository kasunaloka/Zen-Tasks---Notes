// ==UserScript==
// @name           Zen Tasks & Notes
// @description    Add tasks and notes from the Zen sidebar footer.
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

  function action(label, handler, className = "") {
    const button = element("button", { type: "button", class: className }, label);
    button.addEventListener("click", handler);
    return button;
  }

  function readSpaces() {
    const spaces = JSON.parse(Services.prefs.getStringPref(PREF, "{}"));
    if (!spaces || typeof spaces !== "object" || Array.isArray(spaces)) {
      throw new Error("Invalid Tasks & Notes storage");
    }
    return spaces;
  }

  function entriesFor(spaces, spaceId) {
    if (!Object.hasOwn(spaces, spaceId)) return [];
    const entries = spaces[spaceId];
    if (!Array.isArray(entries)) throw new Error("Invalid Tasks & Notes entries");
    return entries;
  }

  function pageLink(spec, title) {
    try {
      const url = new URL(spec);
      if (url.protocol !== "https:" && url.protocol !== "http:") return null;
      url.username = "";
      url.password = "";
      return { url: url.href, title: title?.trim() || url.hostname };
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
    let kind = "task";
    let writing = false;
    let restoreFocus = false;
    const views = new Map();

    const button = document.createXULElement("toolbarbutton");
    button.id = BUTTON_ID;
    button.className = "toolbarbutton-1 zen-sidebar-action-button";
    button.setAttribute("label", "Tasks & Notes");
    button.setAttribute("tooltiptext", "Tasks & Notes");
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
    panel.setAttribute("aria-label", "Tasks & Notes");

    const body = element("div", { class: "ztan-body" });
    const modes = element("div", {
      class: "ztan-modes", role: "group", "aria-label": "Entry type",
    });
    const tasks = action("Tasks", () => showKind("task"));
    const notes = action("Notes", () => showKind("note"));
    modes.append(tasks, notes);

    const form = element("form", { class: "ztan-composer" });
    const taskInput = element("input", { type: "text", maxlength: "240", "aria-label": "Task" });
    const noteInput = element("textarea", { rows: "3", maxlength: "8000", "aria-label": "Note" });
    const pagePreview = element("span", { class: "ztan-page-preview" });
    const composerActions = element("div", { class: "ztan-composer-actions" });
    const attach = action("Attach current page", toggleAttachment);
    const cancel = action("Cancel", cancelEdit);
    const submit = element("button", { type: "submit", class: "ztan-primary" });
    const error = element("p", { class: "ztan-error", role: "alert" });
    const list = element("ul", { class: "ztan-list", "aria-label": "Saved entries" });
    const empty = element("p", { class: "ztan-empty" });

    composerActions.append(attach, cancel, submit);
    form.append(taskInput, noteInput, pagePreview, composerActions);
    body.append(modes, form, error, list, empty);
    panel.append(body);

    function getView() {
      const key = `${spaceId}:${kind}`;
      if (!views.has(key)) views.set(key, { add: emptyDraft(), edit: null });
      return views.get(key);
    }

    function activeInput() {
      return kind === "task" ? taskInput : noteInput;
    }

    function showKind(nextKind) {
      if (kind === nextKind) return;
      kind = nextKind;
      renderView();
    }

    function renderAttachment(page) {
      attach.textContent = page ? "Remove page" : "Attach current page";
      pagePreview.hidden = kind !== "note" || !page;
      pagePreview.textContent = page ? `Attached: ${page.title}` : "";
      pagePreview.title = page?.url || "";
    }

    function renderView() {
      const view = getView();
      const draft = view.edit || view.add;
      const isTask = kind === "task";
      tasks.setAttribute("aria-pressed", String(isTask));
      notes.setAttribute("aria-pressed", String(!isTask));
      taskInput.hidden = !isTask;
      noteInput.hidden = isTask;
      activeInput().value = draft.text;
      activeInput().placeholder = view.edit ? `Edit ${kind}` : `New ${kind}`;
      attach.hidden = isTask;
      cancel.hidden = !view.edit;
      submit.textContent = view.edit ? "Save changes" : isTask ? "Add task" : "Save note";
      renderAttachment(draft.page);
      error.textContent = "";
      renderEntries();
    }

    function renderEntries() {
      const focused = document.activeElement;
      const focusKey = list.contains(focused) ? focused.dataset.focusKey : null;
      let entries;
      try {
        entries = entriesFor(readSpaces(), spaceId).filter(entry => entry.kind === kind);
      } catch (cause) {
        console.error("Zen Tasks & Notes could not read entries", cause);
        list.replaceChildren();
        empty.hidden = true;
        error.textContent = "Couldn't load saved entries.";
        return;
      }

      const view = getView();
      list.replaceChildren(...entries.map(entry => renderEntry(entry, view)));
      empty.hidden = entries.length > 0;
      empty.textContent = kind === "task" ? "No tasks yet." : "No notes yet.";
      if (focusKey) focusEntryAction(focusKey);
    }

    function focusEntryAction(key) {
      const control = Array.from(list.querySelectorAll("[data-focus-key]"))
        .find(node => node.dataset.focusKey === key && !node.disabled);
      (control || activeInput()).focus();
    }

    function renderEntry(entry, view) {
      const row = element("li", { class: "ztan-entry" });
      const content = element("div", { class: "ztan-entry-content" });
      const entryText = element("span", { class: "ztan-entry-text" }, entry.text);

      if (entry.kind === "task") {
        const label = element("label", { class: "ztan-task" });
        const checkbox = element("input", { type: "checkbox" });
        checkbox.checked = entry.done;
        checkbox.dataset.focusKey = `${entry.id}:done`;
        checkbox.addEventListener("change", () => {
          const done = checkbox.checked;
          if (!writeEntries(entries => {
            const index = findEntry(entries, entry.id);
            entries[index] = { ...entries[index], done };
          })) {
            checkbox.checked = entry.done;
            return;
          }
          renderEntries();
        });
        label.append(checkbox, entryText);
        content.append(label);
      } else {
        content.append(entryText);
        const page = pageLink(entry.page?.url, entry.page?.title);
        if (page) {
          const link = element("a", { class: "ztan-link", href: page.url, title: page.url }, page.title);
          link.dataset.focusKey = `${entry.id}:link`;
          link.addEventListener("click", event => {
            event.preventDefault();
            openUILinkIn(page.url, "tab", {
              triggeringPrincipal: Services.scriptSecurityManager.createNullPrincipal({}),
            });
            panel.hidePopup();
          });
          content.append(link);
        }
      }

      const controls = element("div", { class: "ztan-entry-actions" });
      const edit = action("Edit", () => {
        view.edit = { id: entry.id, text: entry.text, page: entry.page || null };
        renderView();
        activeInput().focus();
      });
      edit.disabled = Boolean(view.edit);
      edit.dataset.focusKey = `${entry.id}:edit`;
      const remove = action("Delete", () => {
        if (!writeEntries(entries => entries.splice(findEntry(entries, entry.id), 1))) return;
        if (view.edit?.id === entry.id) {
          view.edit = null;
          renderView();
        } else {
          renderEntries();
        }
      });
      remove.dataset.focusKey = `${entry.id}:delete`;

      controls.append(edit, remove);
      row.append(content, controls);
      return row;
    }

    function findEntry(entries, id) {
      const index = entries.findIndex(entry => entry.id === id);
      if (index === -1) throw new Error("Entry was removed in another window");
      return index;
    }

    function writeEntries(update) {
      if (!spaceId || spaceId !== gZenWorkspaces.activeWorkspace) {
        refreshSpace();
        return false;
      }

      error.textContent = "";
      writing = true;
      try {
        // Read the latest preference and write synchronously on the browser chrome thread.
        const spaces = readSpaces();
        const entries = entriesFor(spaces, spaceId);
        update(entries);
        spaces[spaceId] = entries;
        Services.prefs.setStringPref(PREF, JSON.stringify(spaces));
        return true;
      } catch (cause) {
        console.error("Zen Tasks & Notes could not save changes", cause);
        error.textContent = "Couldn't save changes. Try again or reopen the entry.";
        return false;
      } finally {
        writing = false;
      }
    }

    function toggleAttachment() {
      const view = getView();
      const draft = view.edit || view.add;
      if (draft.page) {
        draft.page = null;
        error.textContent = "";
      } else {
        const browser = gBrowser.selectedBrowser;
        draft.page = pageLink(browser?.currentURI?.spec, browser?.contentTitle);
        error.textContent = draft.page ? "" : "Open a web page to attach its link.";
      }
      renderAttachment(draft.page);
    }

    function cancelEdit() {
      const view = getView();
      const id = view.edit.id;
      view.edit = null;
      renderView();
      focusEntryAction(`${id}:edit`);
    }

    form.addEventListener("input", event => {
      if (event.target !== activeInput()) return;
      const view = getView();
      const draft = view.edit || view.add;
      draft.text = event.target.value;
      error.textContent = "";
    });

    form.addEventListener("submit", event => {
      event.preventDefault();
      const view = getView();
      const draft = view.edit || view.add;
      const value = draft.text.trim();
      if (!value) {
        error.textContent = kind === "task" ? "Enter a task." : "Write a note.";
        activeInput().focus();
        return;
      }

      const fields = kind === "task" ? { text: value } : { text: value, page: draft.page };
      if (!writeEntries(entries => {
        if (view.edit) {
          const index = findEntry(entries, draft.id);
          entries[index] = { ...entries[index], ...fields };
        } else {
          const entry = { id: crypto.randomUUID(), kind, ...fields };
          if (kind === "task") entry.done = false;
          entries.unshift(entry);
        }
      })) {
        activeInput().focus();
        return;
      }

      if (view.edit) view.edit = null;
      else view.add = emptyDraft();
      renderView();
      activeInput().focus();
    });

    function panelIsOpen() {
      return panel.state === "open" || panel.state === "showing";
    }

    function refreshSpace() {
      const nextId = gZenWorkspaces.activeWorkspace;
      button.disabled = !nextId;
      if (nextId === spaceId) return;
      spaceId = nextId;
      if (!spaceId) {
        if (panelIsOpen()) panel.hidePopup();
      } else if (panelIsOpen()) {
        renderView();
        activeInput().focus();
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
      panel.openPopup(button, "before_start");
    });

    panel.addEventListener("popupshowing", () => {
      button.setAttribute("panelopen", "true");
      button.setAttribute("aria-expanded", "true");
    });
    panel.addEventListener("popupshown", () => activeInput().focus());
    panel.addEventListener("popuphidden", () => {
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

    const observeEntries = () => {
      if (!writing && spaceId && panelIsOpen()) renderEntries();
    };
    Services.prefs.addObserver(PREF, observeEntries);
    window.addEventListener("unload", () => Services.prefs.removeObserver(PREF, observeEntries), {
      once: true,
    });
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
