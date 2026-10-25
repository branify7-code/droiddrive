"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, FileText, Trash2, X, Save } from "lucide-react";
import { usePhone } from "@/lib/phone-store";
import { formatDate } from "@/lib/format";
import type { StorageItem } from "@/lib/storage/types";
import { AppHeader } from "../shell";

const NOTES_FOLDER = "Notes";

export default function NotesApp() {
  const getProvider = usePhone((s) => s.getProvider);
  const showToast = usePhone((s) => s.showToast);

  const [notes, setNotes] = useState<(StorageItem & { text?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ item: StorageItem | null; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const provider = getProvider();
      const rootItems = await provider.list(provider.rootId);
      let folder = rootItems.find((i) => i.isFolder && i.name === NOTES_FOLDER);
      if (!folder) folder = await provider.createFolder(provider.rootId, NOTES_FOLDER);
      const items = (await provider.list(folder.id)).filter((f) => !f.isFolder);
      setNotes(items.sort((a, b) => (a.modifiedTime < b.modifiedTime ? 1 : -1)));
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load notes");
    } finally {
      setLoading(false);
    }
  }, [getProvider, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const openNote = async (item: StorageItem) => {
    try {
      const blob = await getProvider().download(item.id);
      setEditing({ item, text: await blob.text() });
    } catch {
      showToast("Could not open note");
    }
  };

  const saveNote = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const provider = getProvider();
      const rootItems = await provider.list(provider.rootId);
      const folder = rootItems.find((i) => i.isFolder && i.name === NOTES_FOLDER);
      const folderId = folder?.id ?? (await provider.createFolder(provider.rootId, NOTES_FOLDER)).id;

      const firstLine = editing.text.trim().split("\n")[0]?.slice(0, 40) || "";
      if (editing.item) {
        await provider.updateContent(editing.item.id, editing.text);
        if (firstLine && firstLine !== editing.item.name.replace(/\.txt$/i, "")) {
          await provider.rename(editing.item.id, `${firstLine}.txt`);
        }
        showToast("Note saved");
      } else {
        const name = `${firstLine || `Note ${new Date().toLocaleDateString()}`}.txt`.replace(/[\\/:*?"<>|]/g, "");
        await provider.upload(folderId, new Blob([editing.text], { type: "text/plain" }), { name });
        showToast("Note created");
      }
      setEditing(null);
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = async (item: StorageItem) => {
    try {
      await getProvider().remove(item.id);
      showToast("Note deleted");
      load();
    } catch {
      showToast("Delete failed");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <AppHeader
        title="Notes"
        onBack={() => usePhone.getState().closeApp()}
        right={
          <button
            onClick={() => setEditing({ item: null, text: "" })}
            aria-label="New note"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/90 text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-500"
          >
            <Plus className="h-4.5 w-4.5" />
          </button>
        }
      />

      {loading ? (
        <div className="space-y-2 px-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/5" />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <FileText className="mb-3 h-10 w-10 text-white/15" />
          <p className="text-sm text-white/50">No notes yet</p>
          <p className="mt-1 text-[11px] text-white/35">Tap + to write your first note</p>
        </div>
      ) : (
        <div className="flex-1 space-y-2 overflow-y-auto px-4 pb-16 phone-scroll">
          {notes.map((n) => (
            <div key={n.id} className="group relative">
              <button
                onClick={() => openNote(n)}
                className="w-full rounded-2xl bg-white/[0.06] p-3.5 text-left ring-1 ring-white/5 transition hover:bg-white/[0.1]"
              >
                <p className="truncate pr-8 text-[13px] font-semibold text-white/90">{n.name.replace(/\.txt$/i, "")}</p>
                <p className="mt-1 text-[10.5px] text-white/40">{formatDate(n.modifiedTime)}</p>
              </button>
              <button
                onClick={() => deleteNote(n)}
                aria-label={`Delete ${n.name}`}
                className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-white/30 transition hover:bg-red-500/20 hover:text-red-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="absolute inset-0 z-[58] flex flex-col bg-zinc-950">
          <div className="flex items-center gap-2 px-3 pt-10 pb-3">
            <button
              onClick={() => setEditing(null)}
              aria-label="Close"
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10"
            >
              <X className="h-4.5 w-4.5 text-white/85" />
            </button>
            <p className="flex-1 truncate text-sm font-semibold text-white">
              {editing.item ? "Edit note" : "New note"}
            </p>
            <button
              onClick={saveNote}
              disabled={saving}
              aria-label="Save note"
              className="flex h-9 items-center gap-1.5 rounded-full bg-emerald-500 px-4 text-xs font-bold text-white transition hover:bg-emerald-400 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" /> Save
            </button>
          </div>
          <textarea
            autoFocus
            value={editing.text}
            onChange={(e) => setEditing({ ...editing, text: e.target.value })}
            placeholder="Start writing... (the first line becomes the note title)"
            className="flex-1 resize-none bg-transparent px-5 pb-16 text-[13.5px] leading-relaxed text-white/90 outline-none placeholder:text-white/25"
          />
        </div>
      )}
    </div>
  );
}
