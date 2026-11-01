const INVALID_CHARACTERS = /["*:<>?\\/|]/;

export function normalizeManuscriptFileName(input, extension = ".txt") {
  const raw = String(input || "").trim();
  if (!raw) throw new Error("ファイル名を入力してください。");
  if (INVALID_CHARACTERS.test(raw) || /[. ]$/.test(raw)) {
    throw new Error("ファイル名に使用できない文字が含まれています。");
  }
  const withoutKnownExtension = raw.replace(/\.(txt|md)$/i, "");
  const normalizedExtension = extension === ".md" ? ".md" : ".txt";
  return `${withoutKnownExtension}${normalizedExtension}`;
}

export function normalizeManuscriptFolderName(input) {
  const name = String(input || "").trim();
  if (!name) throw new Error("フォルダ名を入力してください。");
  if (name === "." || name === ".." || INVALID_CHARACTERS.test(name) || /[. ]$/.test(name)) {
    throw new Error("フォルダ名に使用できない文字が含まれています。");
  }
  return name;
}
