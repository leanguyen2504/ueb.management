'use client';

import { useEffect, useState } from 'react';
import { QuickNotes, loadNotes, newNote, type Note } from './QuickNotes';
import { Recorder } from './Recorder';
import { AudioTranscribe } from './AudioTranscribe';

const KEY = 'ueb-ghi-chu-v1';

export function NoteTools() {
  const [notes, setNotesState] = useState<Note[]>([]);
  const [ready, setReady] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<File | null>(null);

  useEffect(() => {
    const ns = loadNotes();
    setNotesState(ns);
    setOpenId(ns.sort((a, b) => b.updated - a.updated)[0]?.id ?? null);
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) try { localStorage.setItem(KEY, JSON.stringify(notes)); } catch { /* bộ nhớ trình duyệt đầy */ }
  }, [notes, ready]);
  // Mở ở thẻ khác: đồng bộ khi ghi chú thay đổi ở thẻ kia.
  useEffect(() => {
    const on = (e: StorageEvent) => { if (e.key === KEY) setNotesState(loadNotes()); };
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }, []);

  function toNote(title: string, text: string) {
    const n = newNote(title, text);
    setNotesState((ns) => [n, ...ns]);
    setOpenId(n.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="space-y-5">
      <QuickNotes notes={notes} setNotes={setNotesState} openId={openId} setOpenId={setOpenId} />
      <Recorder onTranscribe={setIncoming} />
      <AudioTranscribe incoming={incoming} onToNote={toNote} />
    </div>
  );
}
