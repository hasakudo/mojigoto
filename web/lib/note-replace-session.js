(function(root,factory){if(typeof module === "object" && module.exports) module.exports=factory();else root.MojigotoNoteReplaceSession=factory();})(typeof globalThis !== "undefined" ? globalThis : this,function(){
function createNoteReplaceSession({ core, getNote, getRevision, onChange, now = () => new Date().toISOString() }) {
  let undo = null;
  function locate(note, field) {
    if (note.id !== field.noteId) return null;
    const groups = (note.groups || []).filter(group => group.id === field.groupId);
    if (groups.length !== 1) return null;
    if (!field.itemId) return field.field === "title" ? groups[0] : null;
    const items = (groups[0].items || []).filter(item => item.id === field.itemId);
    if (items.length !== 1) return null;
    const item = items[0];
    if (field.field === "memo.body") return item.kind !== "divider" && item.memo ? item : null;
    return (item.kind === "divider" ? ["label", "value"] : ["heading", "body"]).includes(field.field) ? item : null;
  }
  function read(target, field) { return field === "memo.body" ? target.memo.body : target[field]; }
  function write(target, field, value, timestamp) {
    if (field === "memo.body") { target.memo.body = value; target.memo.updatedAt = timestamp; }
    else target[field] = value;
  }
  function change(entries, expected, next) {
    const note = getNote(), targets = entries.map(entry => locate(note, entry));
    if (targets.some((target, index) => !target || read(target, entries[index].field) !== entries[index][expected])) return false;
    const timestamp = now();
    entries.forEach((entry, index) => write(targets[index], entry.field, entry[next], timestamp));
    return true;
  }
  return {
    get canUndo() { return Boolean(undo); },
    clearUndo() { undo = null; },
    apply(plan, ids) {
      if (!plan || plan.noteId !== getNote().id || plan.revision !== getRevision()) return { ok: false, reason: "stale_plan" };
      const result = core.previewReplaceSelection(plan, ids);
      if (!result.ok || !result.changes.length) return result;
      if (!change(result.changes, "before", "after")) return { ok: false, reason: "stale_plan" };
      undo = result.changes;
      onChange();
      return { ok: true, count: result.count };
    },
    undo() {
      if (!undo) return { ok: false, reason: "nothing_to_undo" };
      if (!change(undo, "after", "before")) return { ok: false, reason: "undo_conflict" };
      const count = undo.reduce((sum, entry) => sum + entry.count, 0);
      undo = null;
      onChange();
      return { ok: true, count };
    },
  };
}

return { createNoteReplaceSession };

});
