import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const STORAGE_KEY = "kavia_notes_app_v1";

/**
 * @typedef {Object} Note
 * @property {string} id Stable unique id.
 * @property {string} title Note title.
 * @property {string} content Note content/body.
 * @property {string[]} tags Tags assigned to the note.
 * @property {number} createdAt Unix epoch ms.
 * @property {number} updatedAt Unix epoch ms.
 */

function nowMs() {
  return Date.now();
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function generateId() {
  // Prefer crypto.randomUUID when available; fallback to timestamp+random.
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${nowMs()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeTags(tagInput) {
  const raw = String(tagInput ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  // Lowercase for consistent filtering + dedupe
  const unique = Array.from(new Set(raw.map((t) => t.toLowerCase())));
  return unique;
}

function formatDateTime(ts) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(ts)
    );
  } catch {
    return new Date(ts).toLocaleString();
  }
}

function matchesQuery(note, q) {
  if (!q) return true;
  const haystack = `${note.title}\n${note.content}\n${(note.tags || []).join(" ")}`.toLowerCase();
  return haystack.includes(q.toLowerCase());
}

function compareByUpdatedDesc(a, b) {
  return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
}

function createEmptyDraft() {
  return { title: "", content: "", tagsText: "" };
}

/**
 * Attempt to load notes from localStorage. If storage is empty/corrupt, returns a small sample set.
 * This keeps the app usable on first launch while still being "frontend-only".
 */
function loadInitialNotes() {
  const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
  if (stored) {
    const parsed = safeJsonParse(stored, null);
    if (Array.isArray(parsed)) {
      // Basic shape normalization for robustness.
      return parsed
        .filter(Boolean)
        .map((n) => ({
          id: String(n.id ?? generateId()),
          title: String(n.title ?? ""),
          content: String(n.content ?? ""),
          tags: Array.isArray(n.tags) ? n.tags.map((t) => String(t).toLowerCase()) : [],
          createdAt: Number(n.createdAt ?? nowMs()),
          updatedAt: Number(n.updatedAt ?? Number(n.createdAt ?? nowMs())),
        }))
        .sort(compareByUpdatedDesc);
    }
  }

  const t = nowMs();
  /** @type {Note[]} */
  const seed = [
    {
      id: generateId(),
      title: "Welcome",
      content:
        "Create notes, search, filter by tags, and everything is saved locally in your browser (localStorage).",
      tags: ["getting-started", "local"],
      createdAt: t - 1000 * 60 * 60 * 24,
      updatedAt: t - 1000 * 60 * 60 * 12,
    },
    {
      id: generateId(),
      title: "Tip: Use tags",
      content: "Add tags (comma-separated) to organize your notes, then click a chip to filter.",
      tags: ["tips", "tags"],
      createdAt: t - 1000 * 60 * 45,
      updatedAt: t - 1000 * 60 * 20,
    },
  ];

  return seed.sort(compareByUpdatedDesc);
}

function persistNotes(notes) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch {
    // Swallow errors (e.g., storage quota); the app still works in-memory.
  }
}

function focusFirstFieldWithin(ref) {
  if (!ref?.current) return;
  const el = ref.current.querySelector('input, textarea, button, [tabindex]:not([tabindex="-1"])');
  if (el && typeof el.focus === "function") el.focus();
}

// PUBLIC_INTERFACE
function App() {
  const [notes, setNotes] = useState(() => loadInitialNotes());
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [selectedId, setSelectedId] = useState(() => (loadInitialNotes()[0]?.id ? "" : ""));
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState(/** @type {"create"|"edit"} */ ("create"));
  const [draft, setDraft] = useState(createEmptyDraft());
  const [deleteConfirmId, setDeleteConfirmId] = useState(/** @type {string|null} */ (null));

  const editorDialogRef = useRef(null);

  // Keep selection stable (e.g., on initial render, choose first note if none selected).
  useEffect(() => {
    if (!selectedId && notes.length > 0) setSelectedId(notes[0].id);
    if (notes.length === 0) setSelectedId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes.length]);

  // Persist any changes.
  useEffect(() => {
    persistNotes(notes);
  }, [notes]);

  // Autofocus in modal.
  useEffect(() => {
    if (!isEditorOpen) return;
    // Delay a tick so the dialog content is mounted.
    const t = setTimeout(() => focusFirstFieldWithin(editorDialogRef), 0);
    return () => clearTimeout(t);
  }, [isEditorOpen]);

  const selectedNote = useMemo(() => notes.find((n) => n.id === selectedId) ?? null, [notes, selectedId]);

  const availableTags = useMemo(() => {
    const tagSet = new Set();
    for (const n of notes) for (const t of n.tags || []) tagSet.add(String(t).toLowerCase());
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }, [notes]);

  const filteredNotes = useMemo(() => {
    return notes
      .filter((n) => matchesQuery(n, query))
      .filter((n) => (activeTag ? (n.tags || []).includes(activeTag) : true))
      .sort(compareByUpdatedDesc);
  }, [notes, query, activeTag]);

  // PUBLIC_INTERFACE
  const openCreate = () => {
    setEditorMode("create");
    setDraft(createEmptyDraft());
    setIsEditorOpen(true);
  };

  // PUBLIC_INTERFACE
  const openEdit = () => {
    if (!selectedNote) return;
    setEditorMode("edit");
    setDraft({
      title: selectedNote.title,
      content: selectedNote.content,
      tagsText: (selectedNote.tags || []).join(", "),
    });
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setDraft(createEmptyDraft());
  };

  // PUBLIC_INTERFACE
  const saveDraft = () => {
    const title = draft.title.trim();
    const content = draft.content.trim();
    const tags = normalizeTags(draft.tagsText);

    if (!title && !content) return; // no-op: avoid creating empty notes

    if (editorMode === "create") {
      const t = nowMs();
      /** @type {Note} */
      const newNote = {
        id: generateId(),
        title: title || "Untitled",
        content,
        tags,
        createdAt: t,
        updatedAt: t,
      };
      setNotes((prev) => [newNote, ...prev].sort(compareByUpdatedDesc));
      setSelectedId(newNote.id);
      closeEditor();
      return;
    }

    // edit mode
    if (!selectedNote) return;
    setNotes((prev) =>
      prev
        .map((n) =>
          n.id === selectedNote.id
            ? {
                ...n,
                title: title || "Untitled",
                content,
                tags,
                updatedAt: nowMs(),
              }
            : n
        )
        .sort(compareByUpdatedDesc)
    );
    closeEditor();
  };

  // PUBLIC_INTERFACE
  const requestDelete = (noteId) => {
    setDeleteConfirmId(noteId);
  };

  // PUBLIC_INTERFACE
  const confirmDelete = () => {
    if (!deleteConfirmId) return;
    setNotes((prev) => prev.filter((n) => n.id !== deleteConfirmId));
    if (selectedId === deleteConfirmId) setSelectedId("");
    setDeleteConfirmId(null);
  };

  const cancelDelete = () => setDeleteConfirmId(null);

  const clearFilters = () => {
    setQuery("");
    setActiveTag("");
  };

  const onSelectTag = (tag) => {
    setActiveTag((prev) => (prev === tag ? "" : tag));
  };

  const onKeyDownGlobal = (e) => {
    // Simple keyboard affordances:
    // - Ctrl/Cmd+K: focus search
    // - Esc: close dialogs
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      const el = document.getElementById("notes-search");
      if (el) el.focus();
    }
    if (e.key === "Escape") {
      if (isEditorOpen) closeEditor();
      if (deleteConfirmId) cancelDelete();
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", onKeyDownGlobal);
    return () => window.removeEventListener("keydown", onKeyDownGlobal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditorOpen, deleteConfirmId]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__brand">
          <div className="logoMark" aria-hidden="true" />
          <div>
            <div className="brandTitle">Notes</div>
            <div className="brandSubtitle">Local, fast, and searchable</div>
          </div>
        </div>

        <div className="topbar__actions">
          <button className="btn btn--primary" onClick={openCreate}>
            New note
          </button>
        </div>
      </header>

      <main className="layout">
        <aside className="sidebar" aria-label="Notes sidebar">
          <div className="panel">
            <label className="fieldLabel" htmlFor="notes-search">
              Search
              <span className="kbdHint" title="Keyboard shortcut">
                Ctrl/⌘ K
              </span>
            </label>
            <div className="searchRow">
              <input
                id="notes-search"
                className="input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Title, content, or tag…"
                aria-label="Search notes"
              />
              <button
                className="btn btn--ghost"
                onClick={clearFilters}
                disabled={!query && !activeTag}
                title="Clear search and tag filter"
              >
                Clear
              </button>
            </div>

            <div className="chips" aria-label="Tag filters">
              <button
                type="button"
                className={`chip ${activeTag === "" ? "chip--active" : ""}`}
                onClick={() => setActiveTag("")}
                title="Show all notes"
              >
                All
              </button>
              {availableTags.length === 0 ? (
                <div className="chips__empty">No tags yet</div>
              ) : (
                availableTags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`chip ${activeTag === t ? "chip--active" : ""}`}
                    onClick={() => onSelectTag(t)}
                    title={`Filter by #${t}`}
                  >
                    #{t}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="panel panel--list" aria-label="Notes list">
            <div className="listHeader">
              <div className="listHeader__title">
                Notes <span className="muted">({filteredNotes.length})</span>
              </div>
            </div>

            {filteredNotes.length === 0 ? (
              <div className="emptyState">
                <div className="emptyState__title">No matching notes</div>
                <div className="emptyState__desc">Try a different search or clear filters.</div>
                <button className="btn btn--primary" onClick={openCreate}>
                  Create a note
                </button>
              </div>
            ) : (
              <ul className="noteList" role="list">
                {filteredNotes.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={`noteCard ${selectedId === n.id ? "noteCard--active" : ""}`}
                      onClick={() => setSelectedId(n.id)}
                      aria-current={selectedId === n.id ? "true" : "false"}
                    >
                      <div className="noteCard__top">
                        <div className="noteCard__title">{n.title || "Untitled"}</div>
                        <div className="noteCard__time" title={`Updated ${formatDateTime(n.updatedAt)}`}>
                          {formatDateTime(n.updatedAt)}
                        </div>
                      </div>
                      <div className="noteCard__preview">
                        {(n.content || "").slice(0, 120) || <span className="muted">No content</span>}
                      </div>
                      <div className="noteCard__tags" aria-label="Note tags">
                        {(n.tags || []).slice(0, 4).map((t) => (
                          <span key={t} className="tagPill">
                            #{t}
                          </span>
                        ))}
                        {(n.tags || []).length > 4 ? <span className="tagPill">…</span> : null}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <section className="content" aria-label="Note details">
          {!selectedNote ? (
            <div className="contentEmpty">
              <div className="contentEmpty__title">Select a note</div>
              <div className="contentEmpty__desc">
                Choose a note from the list or create a new one.
              </div>
              <button className="btn btn--primary" onClick={openCreate}>
                New note
              </button>
            </div>
          ) : (
            <div className="noteDetail">
              <div className="noteDetail__header">
                <div className="noteDetail__meta">
                  <h1 className="noteDetail__title">{selectedNote.title || "Untitled"}</h1>
                  <div className="noteDetail__sub">
                    <span title={`Created ${formatDateTime(selectedNote.createdAt)}`}>
                      Created {formatDateTime(selectedNote.createdAt)}
                    </span>
                    <span className="dot" aria-hidden="true">
                      •
                    </span>
                    <span title={`Updated ${formatDateTime(selectedNote.updatedAt)}`}>
                      Updated {formatDateTime(selectedNote.updatedAt)}
                    </span>
                  </div>
                </div>

                <div className="noteDetail__actions">
                  <button className="btn btn--secondary" onClick={openEdit}>
                    Edit
                  </button>
                  <button
                    className="btn btn--danger"
                    onClick={() => requestDelete(selectedNote.id)}
                    title="Delete this note"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="noteDetail__tags">
                {(selectedNote.tags || []).length === 0 ? (
                  <span className="muted">No tags</span>
                ) : (
                  (selectedNote.tags || []).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`tagChip ${activeTag === t ? "tagChip--active" : ""}`}
                      onClick={() => onSelectTag(t)}
                      title={`Filter by #${t}`}
                    >
                      #{t}
                    </button>
                  ))
                )}
              </div>

              <article className="noteDetail__body">
                {selectedNote.content ? (
                  selectedNote.content.split("\n").map((line, idx) => (
                    <p key={idx} className="noteParagraph">
                      {line || "\u00A0"}
                    </p>
                  ))
                ) : (
                  <div className="muted">No content</div>
                )}
              </article>
            </div>
          )}
        </section>

        <button className="fab" onClick={openCreate} aria-label="Create new note">
          +
        </button>
      </main>

      {isEditorOpen ? (
        <div className="modalOverlay" role="presentation" onMouseDown={closeEditor}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={editorMode === "create" ? "Create note" : "Edit note"}
            onMouseDown={(e) => e.stopPropagation()}
            ref={editorDialogRef}
          >
            <div className="modal__header">
              <div className="modal__title">{editorMode === "create" ? "New note" : "Edit note"}</div>
              <button className="iconBtn" onClick={closeEditor} aria-label="Close editor">
                ✕
              </button>
            </div>

            <div className="modal__body">
              <div className="field">
                <label className="fieldLabel" htmlFor="note-title">
                  Title
                </label>
                <input
                  id="note-title"
                  className="input"
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  placeholder="Untitled"
                />
              </div>

              <div className="field">
                <label className="fieldLabel" htmlFor="note-tags">
                  Tags <span className="muted">(comma-separated)</span>
                </label>
                <input
                  id="note-tags"
                  className="input"
                  value={draft.tagsText}
                  onChange={(e) => setDraft((d) => ({ ...d, tagsText: e.target.value }))}
                  placeholder="e.g. work, ideas, todo"
                />
              </div>

              <div className="field">
                <label className="fieldLabel" htmlFor="note-content">
                  Content
                </label>
                <textarea
                  id="note-content"
                  className="textarea"
                  value={draft.content}
                  onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
                  placeholder="Write something…"
                  rows={10}
                />
              </div>
            </div>

            <div className="modal__footer">
              <button className="btn btn--ghost" onClick={closeEditor}>
                Cancel
              </button>
              <button className="btn btn--primary" onClick={saveDraft} title="Save note">
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteConfirmId ? (
        <div className="modalOverlay" role="presentation" onMouseDown={cancelDelete}>
          <div
            className="modal modal--confirm"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm delete"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal__header">
              <div className="modal__title">Delete note?</div>
              <button className="iconBtn" onClick={cancelDelete} aria-label="Close delete confirmation">
                ✕
              </button>
            </div>
            <div className="modal__body">
              <p className="confirmText">This action can’t be undone.</p>
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost" onClick={cancelDelete}>
                Cancel
              </button>
              <button className="btn btn--danger" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
