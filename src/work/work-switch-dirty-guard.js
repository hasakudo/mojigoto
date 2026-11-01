const path = require("path");

// Resolve unsaved manuscripts before changing the active work reference.
function createWorkSwitchDirtyGuard({ vscode, fs, ensureDir }) {
  function _normPath(p) {
    return path.resolve(String(p || "")).replace(/[\\\/]+$/, "") + path.sep;
  }
  
  function _isUnderDir(filePath, dirPath) {
    const f = path.resolve(String(filePath || ""));
    const d = _normPath(dirPath);
    const fn = process.platform === "win32" ? f.toLowerCase() : f;
    const dn = process.platform === "win32" ? d.toLowerCase() : d;
    return fn.startsWith(dn);
  }
  
  /**
   * Switch Work safety:
   * - If there are dirty (unsaved) documents under manuscriptRoot, ask the user to Save / Discard / Cancel.
   * - "リンク元に保存" writes to the current junction target (realpath) explicitly and then reverts/closes the editor
   *   so it won't be accidentally saved into the *new* work after the junction switch.
   */
  async function guardDirtyDocsBeforeSwitch(manuscriptRoot) {
    try {
  
      if (!manuscriptRoot) return true;
  
      const rootNorm = _normPath(manuscriptRoot);
  
      const dirtyDocs = vscode.workspace.textDocuments.filter((d) => {
        if (!d || !d.isDirty) return false;
        if (!d.uri || d.uri.scheme !== "file") return false;
        const fp = String(d.uri.fsPath || "");
        if (!fp) return false;
        return _isUnderDir(fp, rootNorm);
      });
  
      if (!dirtyDocs.length) return true;
  
      // --- helpers ---
      async function revertAndCloseDoc(doc) {
        try {
          await vscode.window.showTextDocument(doc, {
            preview: false,
            preserveFocus: false,
          });
          // revert (discard) then close to avoid later accidental save
          await vscode.commands.executeCommand(
            "workbench.action.revertAndCloseActiveEditor",
          );
        } catch (_) {
          // ignore
        }
      }
  
      async function writeToRealRoot(doc, realRoot) {
        const rel = path.relative(manuscriptRoot, doc.uri.fsPath);
        const target = path.join(realRoot, rel);
        await ensureDir(path.dirname(target));
        await fs.promises.writeFile(target, doc.getText(), "utf8");
      }
  
      // Per-file action selection (QuickPick loop)
      // action: "save" | "discard"
      const actionByPath = new Map();
      for (const d of dirtyDocs) actionByPath.set(d.uri.fsPath, "save");
  
      const relOf = (doc) => {
        try {
          const rel = path.relative(manuscriptRoot, doc.uri.fsPath);
          return rel && rel !== doc.uri.fsPath
            ? rel
            : path.basename(doc.uri.fsPath);
        } catch {
          return path.basename(doc.uri.fsPath);
        }
      };
  
      function iconFor(a) {
        if (a === "save") return "💾";
        if (a === "discard") return "🗑️";
      }
  
      function labelFor(doc) {
        const a = actionByPath.get(doc.uri.fsPath) || "save";
        return `${iconFor(a)} ${path.basename(doc.uri.fsPath)}【${a === "save" ? "保存" : "破棄"}】`;
      }
  
      function detailFor(doc) {
        const a = actionByPath.get(doc.uri.fsPath) || "save";
        if (a === "save") return "選択中：保存（切替前の作品側）／押すと「破棄」に変更";
        if (a === "discard") return "選択中：破棄／押すと「保存」に変更";
      }
  
      function countActions() {
        let s = 0,
          d = 0;
        for (const v of actionByPath.values()) {
          if (v === "save") s++;
          else d++;
        }
        return { s, d };
      }
  
      async function pickPerFileActions() {
        while (true) {
          const cnt = countActions();
          const items = [];
  
          items.push({ label: "ファイルごとの処理設定（選択して変更）", kind: vscode.QuickPickItemKind.Separator });
  
          for (const d of dirtyDocs) {
            items.push({
              label: labelFor(d),
              description: relOf(d),
              detail: detailFor(d),
              __doc: d,
            });
          }
  
          // Bulk actions execute immediately (no need to press "完了")
          items.push({
            label: "✅ この内容で切替（実行）",
            description: "上のファイルに設定した保存・破棄を実行します",
          });
          items.push({
            label: "💾 すべて保存して切替",
            description: "一括で保存→切替",
          });
          items.push({
            label: "🗑️ すべて破棄して切替",
            description: "一括で破棄→切替",
          });
          items.push({ label: "↩ キャンセル", description: "作品切替を中止" });
          const picked = await vscode.window.showQuickPick(items, {
            title: `もじごと: 未保存ファイルの処理（${dirtyDocs.length}件 / 💾保存 ${cnt.s} / 🗑️破棄 ${cnt.d}）`,
            placeHolder:
              "各ファイルは押すと保存／破棄が切り替わります。設定後、一覧の直後にある「この内容で切替（実行）」で確定。",
            matchOnDescription: true,
            ignoreFocusOut: true,
          });
  
          if (!picked) return { ok: false, cancel: true };
  
          if (picked.label === "↩ キャンセル") return { ok: false, cancel: true };
  
          if (picked.label === "💾 すべて保存して切替") {
            for (const d of dirtyDocs) actionByPath.set(d.uri.fsPath, "save");
            return { ok: true, cancel: false };
          }
          if (picked.label === "🗑️ すべて破棄して切替") {
            for (const d of dirtyDocs) actionByPath.set(d.uri.fsPath, "discard");
            return { ok: true, cancel: false };
          }
  
          if (picked.label === "✅ この内容で切替（実行）")
            return { ok: true, cancel: false };
  
          // file item: cycle action
          const doc = picked.__doc;
          if (doc && doc.uri && doc.uri.fsPath) {
            const cur = actionByPath.get(doc.uri.fsPath) || "save";
            const next = cur === "save" ? "discard" : "save";
            actionByPath.set(doc.uri.fsPath, next);
            continue;
          }
        }
      }
  
      const sel = await pickPerFileActions();
      if (!sel.ok) return false;
  
      // NOTE: スキップは廃止（誤保存事故が増えるため）
  
      // If there are any "save", ask which save method to use.
      const hasSave = Array.from(actionByPath.values()).some((a) => a === "save");
      let saveMethod = "normal"; // "normal" | "real"
      let realRoot = null;
  
      if (hasSave) {
        const pickedSave = await vscode.window.showQuickPick(
          [
            {
              label: "通常保存（VS Codeの保存）",
              description: "切替前の作品側へ保存して閉じる",
            },
            {
              label: "リンク元に保存（安全）",
              description: "junctionの実体（realpath）へ直接書き込み→閉じる",
            },
          ],
          {
            title: "もじごと: 保存方法を選択",
            placeHolder: "どちらの方法で保存しますか？",
            ignoreFocusOut: true,
          },
        );
        if (!pickedSave) return false;
  
        if (pickedSave.label.startsWith("リンク元に保存")) {
          saveMethod = "real";
          try {
            realRoot = await fs.promises.realpath(manuscriptRoot);
          } catch (_) {
            realRoot = null;
          }
          if (!realRoot) {
            vscode.window.showErrorMessage(
              "もじごと: リンク元の解決に失敗しました（realpath）",
            );
            return false;
          }
        }
      }
  
      // Execute actions
      for (const d of dirtyDocs) {
        const a = actionByPath.get(d.uri.fsPath) || "save";
  
        if (a === "discard") {
          await revertAndCloseDoc(d);
          continue;
        }
  
        if (a === "save") {
          try {
            if (saveMethod === "real") {
              await writeToRealRoot(d, realRoot);
              await revertAndCloseDoc(d);
            } else {
              const saved = await d.save();
              if (!saved || d.isDirty) {
                vscode.window.showErrorMessage(
                  `もじごと: 保存が完了していないため作品切替を中止しました: ${path.basename(d.uri.fsPath)}`,
                );
                return false;
              }
              // close to avoid later accident
              if (!d.isDirty) await revertAndCloseDoc(d);
            }
          } catch (e) {
            vscode.window.showErrorMessage(
              `もじごと: 保存に失敗: ${path.basename(d.uri.fsPath)} / ${String(e)}`,
            );
            return false;
          }
          continue;
        }
  
        // no-op
      }
  
      return true;
    } catch (e) {
      vscode.window.showErrorMessage(
        `もじごと: dirty guard failed: ${String(e)}`,
      );
      return false;
    }
  }
  
  
  return { _normPath, _isUnderDir, guardDirtyDocsBeforeSwitch };
}

module.exports = { createWorkSwitchDirtyGuard };
