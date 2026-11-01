import { NOTE_TYPES, normalizeAddressBook } from "./notes.mjs";
import { importedAddressBook } from "./generated-note-markdown.mjs";

// An unlisted Drive file may be unauthorized. Keep the imported snapshot in
// the note; never create a competing address-book.json to bypass permission.
export async function loadPreviewAddressBook(provider, work, currentNote = null) {
  const children = await provider.listChildren(work.mojigoto.id);
  const file = children.find((item) => item.file && item.name === "address-book.json");
  if (file) return { book: normalizeAddressBook(JSON.parse(await provider.readText(file))), imported: false };
  const latest = new Map();
  const consider = (note) => {
    const snapshot = importedAddressBook(note?.importedAddressBook) || (note?.addressBook?.characters?.length
      ? { workId: `legacy:${note.id}`, generatedAt: note.updatedAt || "", book: { ...normalizeAddressBook(note.addressBook) } } : null);
    if (snapshot && (!latest.has(snapshot.workId) || latest.get(snapshot.workId).generatedAt < snapshot.generatedAt)) latest.set(snapshot.workId, snapshot);
  };
  const jobs = [];
  for (const info of Object.values(NOTE_TYPES)) {
    const folder = children.find((item) => item.folder && item.name === info.folder);
    if (folder) for (const item of await provider.listChildren(folder.id)) if (item.file && /\.json$/i.test(item.name)) jobs.push(item);
  }
  // Stable ordering also makes equal-time snapshots deterministic.
  const notes = new Array(jobs.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      const i = cursor++, item = jobs[i];
      notes[i] = currentNote?.item.id === item.id ? currentNote.data : JSON.parse(await provider.readText(item));
    }
  }));
  notes.forEach(consider);
  if (currentNote) consider(currentNote.data);
  const book = { characters: [], firstPerson: {}, calls: {}, updatedAt: "" };
  for (const snapshot of latest.values()) {
    const ids = new Map(snapshot.book.characters.map((person) => [person.id, JSON.stringify([snapshot.workId, person.id])]));
    book.characters.push(...snapshot.book.characters.map((person) => ({ ...person, id: ids.get(person.id) })));
    for (const [id, text] of Object.entries(snapshot.book.firstPerson)) if (ids.has(id)) book.firstPerson[ids.get(id)] = text;
    for (const [key, text] of Object.entries(snapshot.book.calls)) {
      const [from, to] = key.split("::");
      if (ids.has(from) && ids.has(to)) book.calls[`${ids.get(from)}::${ids.get(to)}`] = text;
    }
    if (book.updatedAt < snapshot.book.updatedAt) book.updatedAt = snapshot.book.updatedAt;
  }
  return { book, imported: latest.size > 0 };
}
