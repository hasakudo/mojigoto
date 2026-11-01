// Keep the create button as the native form default; Escape/cancel remain separate.
export function bindCreateDialogForm({ form, dialog, isBusy = () => false }) {
  let composing = false;
  form.addEventListener("compositionstart", () => { composing = true; });
  form.addEventListener("compositionend", () => { composing = false; });
  form.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (composing || event.isComposing || event.keyCode === 229)) event.preventDefault();
  });
  form.addEventListener("submit", (event) => {
    if (composing) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  form.querySelector('button[value="cancel"]').addEventListener("click", () => {
    if (!isBusy()) dialog.close();
  });
  dialog.addEventListener("cancel", (event) => { if (isBusy()) event.preventDefault(); });
  dialog.addEventListener("close", () => { if (!dialog.open) composing = false; });
}
