// Work metadata dialogs. Persistence and tree filtering remain in their existing owners.
function createWorkTreeMetadataActions({ vscode, treeProvider, WORK_STATUS_OPTIONS,
  WORK_STATUS_EMPTY_FILTER, resolveSettingsTarget, readSettingsFile, writeSettingsFile,
  getWorkStatusLabel }) {
  async function filterWorksByStatus() {
    try {
      const current = treeProvider?.getWorkStatusFilter?.() || [];
      const items = WORK_STATUS_OPTIONS.map((item) => ({
        label: item.label,
        description: `状態: ${item.label}`,
        value: item.value || WORK_STATUS_EMPTY_FILTER,
        picked: current.includes(item.value || WORK_STATUS_EMPTY_FILTER),
      }));

      const picked = await vscode.window.showQuickPick(items, {
        title: "作品一覧の状態絞り込み",
        placeHolder: "表示する状態を選択（未選択ですべて表示）",
        ignoreFocusOut: true,
        canPickMany: true,
      });

      if (!picked) return;

      await treeProvider?.setWorkStatusFilter?.(picked.map((item) => item.value));
    } catch (e) {
      vscode.window.showErrorMessage(
        `もじごと: 作品一覧の絞り込みに失敗しました: ${String(e.message || e)}`,
      );
    }
  }

  async function filterWorksByGenre() {
    try {
      const current = treeProvider?.getWorkGenreFilter?.() || [];

      const genreInfo =
        typeof treeProvider?.getAvailableWorkGenres === "function"
          ? treeProvider.getAvailableWorkGenres()
          : { genres: [], hasEmpty: false };

      const items = [];

      if (genreInfo.hasEmpty) {
        items.push({
          label: "未設定",
          description: "ジャンル未設定の作品",
          value: "__empty__",
          picked: current.includes("__empty__"),
        });
      }

      for (const genre of genreInfo.genres) {
        items.push({
          label: genre,
          description: `ジャンル: ${genre}`,
          value: genre,
          picked: current.includes(genre),
        });
      }

      const picked = await vscode.window.showQuickPick(items, {
        title: "作品一覧のジャンル絞り込み",
        placeHolder: "表示するジャンルを選択（未選択ですべて表示）",
        ignoreFocusOut: true,
        canPickMany: true,
      });

      if (!picked) return;

      await treeProvider?.setWorkGenreFilter?.(picked.map((item) => item.value));
    } catch (e) {
      vscode.window.showErrorMessage(
        `もじごと: 作品一覧のジャンル絞り込みに失敗しました: ${String(e.message || e)}`,
      );
    }
  }

  async function changeWorkStatus(item) {
    try {
      const target = await resolveSettingsTarget(item);
      const current = await readSettingsFile(target.readPath, item);
      const picked = await vscode.window.showQuickPick(
        WORK_STATUS_OPTIONS.map((option) => ({
          label:
            option.value === current.status
              ? `${option.label} ✓`
              : option.label,
          description: option.value ? `状態を「${option.label}」に変更` : "状態を解除",
          value: option.value,
        })),
        {
          title: `作品の状態を変更: ${item?.workName || item?.label || "現在の作品"}`,
          placeHolder: `現在: ${getWorkStatusLabel(current.status)}`,
          ignoreFocusOut: true,
        },
      );
      if (!picked) return;

      await writeSettingsFile(target.path, {
        ...current,
        status: picked.value,
      });
      treeProvider.refresh();
      vscode.window.showInformationMessage(
        `もじごと: 作品の状態を「${getWorkStatusLabel(picked.value)}」に変更しました。`,
      );
    } catch (e) {
      vscode.window.showErrorMessage(
        `もじごと: 作品の状態変更に失敗しました: ${String(e.message || e)}`,
      );
    }
  }

  return { filterWorksByStatus, filterWorksByGenre, changeWorkStatus };
}

module.exports = { createWorkTreeMetadataActions };
