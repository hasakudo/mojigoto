function renderStatsSummaryCard(state, esc) {
  return `
    <div class="card dashboardSummaryCard">
      <div class="dashboardSummarySplit">
        <section class="dashboardSummaryCol">
          <div class="dashboardWorkTitleBlock">
            <div class="dashboardWorkTitleLabel">作品名</div>
            <div class="dashboardWorkTitleValue">${esc(state.currentWorkTitle || "-")}</div>
          </div>

          <div class="dashboardSubsectionLabel">今日（JST）</div>
          <table>
            <tr><th>総差分</th><td class="num">${esc(state.today?.deltaTotal ?? 0)}</td></tr>
            <tr><th>総文字数（最後の保存）</th><td class="num">${esc(state.today?.totalSaved ?? 0)}</td></tr>
          </table>
          ${
            state?.isViewLinkedStats
              ? `<div class="muted" style="margin-top:6px; font-size:11px;">
                   ※現在の作品（View連携）の執筆記録です
                 </div>`
              : ""
          }
        </section>

        <section class="dashboardSummaryCol">
          <table>
            <tr><th>目標文字数</th><td class="num">${esc(state.currentWorkGoal ?? 0)}</td></tr>
            <tr><th>現在の進捗</th><td class="num">${esc(state.currentWorkPctText ?? "-")}</td></tr>
            <tr><th>締切</th><td class="num">${esc(state.currentWorkDeadline || "-")}</td></tr>
            <tr><th>締切まで</th><td class="num">${esc(state.currentWorkDeadlineText || "-")}</td></tr>
          </table>

          <p class="statsHint">目標・締切の変更は作品ツリーの「作品設定」から行えます。</p>
        </section>
      </div>
    </div>
  `;
}

function renderStatsControlsBar(state, esc) {
  return `
    <div class="dashboardControlsBar statsControlsBar">
      <div class="statsControlsBody">
        <div class="statsControlsHeader">
          <span class="dashboardControlsLabel">執筆記録</span>
        </div>
        <div class="statsControlsTopRow">
          <div class="statsControlsLeft">
            <div class="statsBtnbar">
              <button id="btnExport">CSV出力</button>
              <button id="btnOpenExportLauncher">書き出しメニューを開く</button>
            </div>
            <p class="statsHint">CSV：日別執筆データが書き出せます。</p>
            <p class="statsHint">書き出し：原稿/設定/プロット/資料を（.txt/.md/.htmlなどで）書き出せます。</p>
          </div>

          <div class="statsControlsRight">
            <button
              id="btnSendMojigotoEvents"
              class="btn"
              ${!state.sheetsEnabled || state.eventsMode !== "onCommand" ? "disabled" : ""}
            >日時ログを送信</button>

            <div class="muted statsHint" style="line-height:1.4;">
              ${
                !state.sheetsEnabled
                  ? "日時ログ: 統計送信はOFFです。<br>※ Sheets Enabled をONにすると使えます。"
                  : state.eventsMode === "off"
                    ? "日時ログの送信はOFFです。<br>※ Webhook Events Mode"
                    : state.eventsMode === "onSave"
                      ? "日時ログは保存時に自動送信されます。"
                      : "未送信の日時ログを記録シートへ送れます。<br>※ 件数が多いと時間がかかる場合があります。"
              }
            </div>

            <span id="sendMojigotoEventsStatus" class="status"></span>

            ${
              state?.showEventsRemindStatus
                ? `<div class="muted" style="margin-top:10px;">
                    送信忘れ通知: ${esc(state.reminder?.eventsRemindModeLabel ?? "OFF")}
                  </div>`
                : ""
            }
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderTodayFilesCard(state, esc) {
  return `
    <div class="card">
      <div class="muted">今日更新したファイル</div>
      ${
        state.todayFiles?.length
          ? `<ul>${state.todayFiles.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>`
          : `<div class="muted" style="margin-top:8px;">まだありません</div>`
      }
    </div>
  `;
}

function renderTodayChaptersCard(state, esc) {
  return `
    <div class="card">
      <div class="muted">章別（今日の差分 / 最終総数）</div>
      <table>
        <thead>
          <tr><th>章</th><th class="num">差分</th><th class="num">総数</th></tr>
        </thead>
        <tbody>
          ${
            state.todayChapters?.length
              ? state.todayChapters
                  .map(
                    (r) =>
                      `<tr><td>${esc(r.chapter)}</td><td class="num">${esc(r.delta)}</td><td class="num">${esc(r.total)}</td></tr>`,
                  )
                  .join("")
              : `<tr><td colspan="3" class="muted">データなし</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function renderLast7Card(state, esc) {
  return `
    <div class="card">
      <div class="muted">直近7日（総差分）</div>
      <table>
        <thead>
          <tr><th>日付</th><th class="num">差分</th><th class="num">総数</th></tr>
        </thead>
        <tbody>
          ${
            state.last7?.length
              ? state.last7
                  .map(
                    (r) =>
                      `<tr><td>${esc(r.date)}</td><td class="num">${esc(r.deltaTotal)}</td><td class="num">${esc(r.totalSaved)}</td></tr>`,
                  )
                  .join("")
              : `<tr><td colspan="3" class="muted">データなし</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `;
}

function renderStatsTab(state, esc) {
  return `
    <div id="statsTabPanel" class="tab-panel">
      ${renderStatsSummaryCard(state, esc)}

      <div class="row">
        ${renderTodayFilesCard(state, esc)}
      </div>

      <div class="row">
        ${renderTodayChaptersCard(state, esc)}
        ${renderLast7Card(state, esc)}
      </div>

      ${renderStatsControlsBar(state, esc)}
    </div>
  `;
}

function renderHighlightGroups(state, esc) {
  if (Array.isArray(state.highlight?.groups) && state.highlight.groups.length) {
    return state.highlight.groups
      .map(
        (g) =>
          `<tr class="highlight-group-row" data-group="${esc(g.name)}" style="cursor:pointer;">
            <td>
              <input
                type="checkbox"
                data-group="${esc(g.name)}"
                class="highlight-toggle"
                ${g.enabled ? "checked" : ""}
              />
            </td>
            <td>${esc(g.label)}</td>
            <td class="num">${g.countable === false ? "-" : esc(g.count ?? 0)}</td>
          </tr>`,
      )
      .join("");
  }

  return `<tr><td colspan="3" class="muted">データなし</td></tr>`;
}

function renderHighlightDetailsData(state) {
  return JSON.stringify(state.highlight?.details || []).replace(
    /</g,
    "\\u003c",
  );
}

function renderHighlightTab(state, esc) {
  return `
    <div id="highlightTabPanel" class="tab-panel">
      <div class="card">
        <div class="dashboardSectionTitle">ハイライト分析</div>

        <table>
          <tr>
            <th>対象</th>
            <td>${esc(state.highlight?.currentFile || "-")}</td>
          </tr>
          <tr>
            <th>総検出</th>
            <td class="num">${esc(state.highlight?.totalCount ?? 0)}</td>
          </tr>
        </table>

        <div class="btnbar">
          <button id="btnToggleHighlights">${state.highlight?.enabled ? "ハイライトをOFF" : "ハイライトをON"}</button>
          <button id="btnToggleHighlightDecorations">
            ${state.highlight?.decorationsEnabled !== false ? "装飾をOFF" : "装飾をON"}
          </button>
          <button id="btnRefreshHighlights">ハイライトを更新</button>
          <button id="btnOpenHighlightSettings">ハイライト設定</button>
          <label style="margin-left:auto;font-size:12px;">
            <input type="checkbox" id="toggleHideZero">
            0件を隠す
          </label>
        </div>

        <table style="margin-top:12px;">
          <thead>
            <tr><th>ON</th><th>グループ</th><th class="num">件数</th></tr>
          </thead>
          <tbody>
            ${renderHighlightGroups(state, esc)}
          </tbody>
        </table>

        <div id="highlightDetailsWrap" style="margin-top:14px;">
          <div class="muted">検出結果</div>
          <div id="highlightDetailsEmpty" class="muted" style="margin-top:8px;">
            グループをクリックすると該当箇所を表示します。
          </div>
          <div id="highlightDetailsPanel"></div>
        </div>

        <script type="application/json" id="highlightDetailsData">
          ${renderHighlightDetailsData(state)}
        </script>
      </div>
    </div>
  `;
}

function renderWritingMemoTab(state, esc) {
  const scope = String(state?.writingMemoScope || "file");

  if (scope === "workIndex") {
    return renderWritingMemoWorkIndex(state, esc);
  }

  if (scope === "work") {
    return renderWritingMemoWorkTab(state, esc);
  }

  return renderWritingMemoFileTab(state, esc);
}

function renderWritingMemoFileTab(state, esc) {
  const activeItems = Array.isArray(state?.writingMemosActive)
    ? state.writingMemosActive
    : [];

  const doneItems = Array.isArray(state?.writingMemosDone)
    ? state.writingMemosDone
    : [];

  const archivedItems = Array.isArray(state?.writingMemosArchived)
    ? state.writingMemosArchived
    : [];

  const targetPath = String(state?.writingMemoTargetPath || "");
  const totalCount =
    activeItems.length + doneItems.length + archivedItems.length;

  const decorationsEnabled = state?.writingMemoDecorationsEnabled !== false;

  return `
    <div id="writingMemoTabPanel" class="tab-panel">
      <div class="card">
        <div class="writingMemoHeader">
          <div class="writingMemoHeaderMain">
            <div class="dashboardSectionTitle">
              執筆メモ${totalCount ? `（${totalCount}）` : ""}
            </div>
            ${
              targetPath
                ? `<div class="writingMemoTargetPath">${esc(targetPath)}</div>`
                : ""
            }
            ${
              state?.writingMemoLastUpdatedAt
                ? `<div class="writingMemoMeta">最終更新: ${esc(state.writingMemoLastUpdatedAt)}</div>`
                : ""
            }
          </div>

          <div class="writingMemoHeaderActions">
            ${
              state?.writingMemoReturnWorkId || state?.writingMemoCurrentWorkId
                ? `
                  <button
                    type="button"
                    id="btnShowWritingMemoCurrentWork"
                    class="button secondary"
                    title="この作品の執筆メモ一覧を表示"
                    data-work-id="${esc(state.writingMemoReturnWorkId || state.writingMemoCurrentWorkId || "")}"
                    data-work-title="${esc(state.writingMemoReturnWorkTitle || state.writingMemoCurrentWorkTitle || "")}"
                  >
                    作品の執筆メモ
                  </button>
                `
                            : `
                  <button
                    type="button"
                    id="btnShowWritingMemoWorkIndex"
                    class="button secondary"
                    title="執筆メモのある作品一覧を表示"
                  >
                    作品一覧
                  </button>
                `
            }

            <button
              type="button"
              id="btnToggleWritingMemoDecorations"
              class="button secondary"
              title="エディタ上の執筆メモ下線表示を切り替え"
            >
              ${decorationsEnabled ? "下線をOFF" : "下線をON"}
            </button>

            <button
              type="button"
              id="btnRefreshWritingMemos"
              class="button secondary"
              title="執筆メモ一覧とエディタ装飾を更新"
            >
              執筆メモを更新
            </button>
          </div>
        </div>

        ${
          activeItems.length
            ? `<ul class="writingMemoList">
                ${activeItems
                  .map((item) =>
                    renderWritingMemoItem(
                      item,
                      esc,
                      state?.editingWritingMemoId || "",
                    ),
                  )
                  .join("")}
              </ul>`
            : `<div class="muted">未処理・保留の執筆メモはありません。</div>`
        }

        ${renderWritingMemoSecondarySection(
          doneItems,
          archivedItems,
          esc,
          state?.editingWritingMemoId || "",
        )}
      </div>
    </div>
  `;
}

function renderWritingMemoWorkIndex(state, esc) {
  const works = Array.isArray(state?.writingMemoWorks)
    ? state.writingMemoWorks
    : [];

  return `
    <div id="writingMemoTabPanel" class="tab-panel">
      <div class="card">
        <div class="writingMemoHeader">
          <div class="writingMemoHeaderMain">
            <div class="dashboardSectionTitle">
              執筆メモのある作品${works.length ? `（${works.length}）` : ""}
            </div>
            <div class="writingMemoTargetPath">
              作品ごとの執筆メモを表示しています。
            </div>
          </div>

          <div class="writingMemoHeaderActions">
            ${
              state?.hasWritingMemoCurrentFile
                ? `
                  <button
                    type="button"
                    id="btnShowCurrentFileWritingMemos"
                    class="button secondary"
                    title="現在のファイルの執筆メモへ戻る"
                  >
                    現在のファイル
                  </button>
                `
                : ""
            }

            <button
              type="button"
              id="btnRefreshWritingMemos"
              class="button secondary"
              title="執筆メモ一覧を更新"
            >
              執筆メモを更新
            </button>
          </div>
        </div>

        ${
          works.length
            ? `<ul class="writingMemoList">
                ${works.map((work) => renderWritingMemoWorkCard(work, esc)).join("")}
              </ul>`
            : `<div class="muted">執筆メモのある作品はまだありません。</div>`
        }
      </div>
    </div>
  `;
}

function renderWritingMemoWorkCard(work, esc) {
  return `
    <li
      class="writingMemoItem"
      data-writing-memo-work-open="${esc(work?.workId || "")}"
      title="クリックで作品の執筆メモを表示"
    >
      <div class="writingMemoItemHeader">
        <div class="writingMemoExcerpt">
          ${esc(work?.title || "無題作品")}
        </div>

        <div class="writingMemoStatus writingMemoStatus--active">
          ${esc(work?.totalCount ?? 0)}件
        </div>
      </div>

      <div class="writingMemoBody">
        未処理 ${esc(work?.activeCount ?? 0)} ／
        完了 ${esc(work?.doneCount ?? 0)} ／
        アーカイブ ${esc(work?.archivedCount ?? 0)}
        ${
          work?.lastUpdatedAt
            ? `<div style="margin-top:4px;">更新: ${esc(work.lastUpdatedAt)}</div>`
            : ""
        }
      </div>
    </li>
  `;
}

function renderWritingMemoWorkListHeader(state, esc) {
  const title = String(state?.writingMemoSelectedWorkTitle || "無題作品");

  return `
    <div class="writingMemoHeader">
      <div class="writingMemoHeaderMain">
        <div class="dashboardSectionTitle">
          作品「${esc(title)}」の執筆メモ
          ${
            state?.writingMemoSelectedWorkIsViewLinked
              ? `<span class="writingMemoLinkedBadge">View連携中</span>`
              : ""
          }
        </div>
      </div>

      <div class="writingMemoHeaderActions">
        <button
          type="button"
          id="btnWritingMemoBackToWorks"
          class="button secondary"
          title="作品一覧へ戻る"
        >
          一覧へ戻る
        </button>

        <button
          type="button"
          id="btnShowCurrentFileWritingMemos"
          class="button secondary"
          title="現在のファイルの執筆メモへ戻る"
          data-return-work-id="${esc(state?.writingMemoSelectedWorkId || "")}"
          data-return-work-title="${esc(title)}"
        >
          現在のファイル
        </button>

        <button
          type="button"
          id="btnRefreshWritingMemos"
          class="button secondary"
          title="執筆メモ一覧を更新"
        >
          執筆メモを更新
        </button>
      </div>
    </div>
  `;
}

function renderWritingMemoWorkTab(state, esc) {
  const activeItems = Array.isArray(state?.writingMemosForSelectedWorkActive)
    ? state.writingMemosForSelectedWorkActive
    : [];

  const doneItems = Array.isArray(state?.writingMemosForSelectedWorkDone)
    ? state.writingMemosForSelectedWorkDone
    : [];

  const archivedItems = Array.isArray(
    state?.writingMemosForSelectedWorkArchived,
  )
    ? state.writingMemosForSelectedWorkArchived
    : [];

  return `
    <div id="writingMemoTabPanel" class="tab-panel">
      <div class="card">
        ${renderWritingMemoWorkListHeader(state, esc)}

        ${
          activeItems.length
            ? `<ul class="writingMemoList">
                ${activeItems
                  .map((item) =>
                    renderWritingMemoItem(
                      item,
                      esc,
                      state?.editingWritingMemoId || "",
                      {
                        showFileName: true,
                        returnWorkId: state?.writingMemoSelectedWorkId || "",
                        returnWorkTitle:
                          state?.writingMemoSelectedWorkTitle || "",
                      },
                    ),
                  )
                  .join("")}
              </ul>`
            : `<div class="muted">未処理・保留の執筆メモはありません。</div>`
        }

        ${renderWritingMemoSecondarySection(
          doneItems,
          archivedItems,
          esc,
          state?.editingWritingMemoId || "",
        )}
      </div>
    </div>
  `;
}

function renderWritingMemoItem(
  item,
  esc,
  editingWritingMemoId = "",
  options = {},
) {
  const payload = JSON.stringify({
    ...(item || {}),
    returnWorkId: String(options?.returnWorkId || ""),
    returnWorkTitle: String(options?.returnWorkTitle || ""),
  }).replace(/"/g, "&quot;");
  const isEditing =
    String(editingWritingMemoId || "") === String(item?.id || "");
  const showFileName = !!options?.showFileName;

  return `
    <li
      class="writingMemoItem ${item?.status === "done" ? "is-done" : ""}"
      data-writing-memo='${payload}'
      data-writing-memo-id="${esc(item?.id || "")}"
      title="クリックで原稿へ移動"
    >
      <div class="writingMemoItemHeader">
        <div class="writingMemoExcerptWrap">
          ${
            showFileName && item?.fileName
              ? `<div class="writingMemoFileName">${esc(item.fileName)}</div>`
              : ""
          }
          <div class="writingMemoExcerpt">
            ${esc(item?.excerpt || "（抜粋なし）")}
            ${
              item?.isExcerptMissing
                ? `<span
                    class="writingMemoExcerptChanged"
                    title="元の抜粋: ${esc(item?.originalExcerpt || "（なし）")}"
                  >現在の抜粋</span>`
                : ""
            }
          </div>
        </div>

        <div class="writingMemoActions">
          <button
            type="button"
            class="writingMemoStatus writingMemoStatus--${esc(item?.status || "active")} isClickable"
            data-writing-memo-status-id="${esc(item?.id || "")}"
            data-writing-memo-file="${esc(item?.writingMemoFilePath || "")}"
            title="ステータスを変更"
          >
            ${esc(item?.statusLabel || "未処理")}
          </button>

          <button
            type="button"
            class="writingMemoMiniAction"
            data-writing-memo-edit="${esc(item?.id || "")}"
            onclick="event.stopPropagation()"
          >
            ${isEditing ? "編集中" : "編集"}
          </button>
        </div>
      </div>

      ${
        isEditing
          ? `
            <div class="writingMemoEditBox" onclick="event.stopPropagation()">
              <textarea
                class="writingMemoEditTextarea"
                data-writing-memo-edit-body="${esc(item?.id || "")}"
              >${esc(item?.body || "")}</textarea>

              <div class="writingMemoEditActions">
                <button
                  type="button"
                  class="writingMemoMiniAction"
                  data-writing-memo-save="${esc(item?.id || "")}"
                  data-writing-memo-file="${esc(item?.writingMemoFilePath || "")}"
                >
                  保存
                  <span class="writingMemoHint">Ctrl/Cmd+S</span>
                </button>

                <button
                  type="button"
                  class="writingMemoMiniAction"
                  data-writing-memo-copy-to-concept="${esc(item?.id || "")}"
                >
                  構想メモへコピー
                </button>

                <button
                  type="button"
                  class="writingMemoMiniAction"
                  data-writing-memo-cancel="${esc(item?.id || "")}"
                >
                  キャンセル
                </button>
              </div>
            </div>
          `
          : item?.body
            ? `<div class="writingMemoBody">${esc(item.body)}</div>`
            : ""
      }
    </li>
  `;
}

function renderWritingMemoArchivedItem(item, esc) {
  const payload = JSON.stringify(item || {}).replace(/"/g, "&quot;");

  return `
    <li class="writingMemoItem is-archived" data-writing-memo='${payload}' title="クリックで原稿へ移動">
      <div class="writingMemoItemHeader">
        <div class="writingMemoExcerpt">
          ${esc(item?.excerpt || "（抜粋なし）")}
          ${
            item?.isExcerptMissing
              ? `<span
                  class="writingMemoExcerptChanged"
                  title="元の抜粋: ${esc(item?.originalExcerpt || "（なし）")}"
                >現在の抜粋</span>`
              : ""
          }
        </div>

        <div class="writingMemoArchivedActions">
          <button
            type="button"
            class="writingMemoMiniAction"
            data-writing-memo-restore="${esc(item?.id || "")}"
          >
            復元
          </button>
          <button
            type="button"
            class="writingMemoMiniAction"
            data-writing-memo-delete="${esc(item?.id || "")}"
          >
            削除
          </button>
        </div>
      </div>

      ${
        item?.body ? `<div class="writingMemoBody">${esc(item.body)}</div>` : ""
      }
    </li>
  `;
}

function renderWritingMemoSecondarySection(
  doneItems,
  archivedItems,
  esc,
  editingWritingMemoId = "",
) {
  const safeDone = Array.isArray(doneItems) ? doneItems : [];
  const safeArchived = Array.isArray(archivedItems) ? archivedItems : [];

  if (!safeDone.length && !safeArchived.length) {
    return "";
  }

  return `
    <div class="writingMemoSecondarySection">
      <div class="writingMemoSecondaryHeader">
        <div class="writingMemoSecondaryTabs">
          <button
            type="button"
            id="writingMemoDoneTabButton"
            class="writingMemoSecondaryTabButton"
            data-writing-memo-secondary-tab="done"
          >
            <span class="writingMemoSecondaryLabel">完了</span>
            <span class="writingMemoSecondaryCount">${safeDone.length}</span>
          </button>

          <button
            type="button"
            id="writingMemoArchivedTabButton"
            class="writingMemoSecondaryTabButton"
            data-writing-memo-secondary-tab="archived"
          >
            <span class="writingMemoSecondaryLabel">アーカイブ</span>
            <span class="writingMemoSecondaryCount">${safeArchived.length}</span>
          </button>
          <button
            type="button"
            id="writingMemoSecondaryToggle"
            class="writingMemoSecondaryToggle"
            title="完了 / アーカイブを開閉"
          >
            ▼
          </button>
        </div>
        <div class="writingMemoSecondaryActions">
          ${
            safeDone.length
              ? `
                <div id="writingMemoArchiveDoneAction">
                  <button
                    type="button"
                    id="writingMemoArchiveDoneButton"
                    class="writingMemoArchiveDoneButton"
                    title="完了メモをまとめてアーカイブ"
                  >
                    完了をアーカイブ
                  </button>
                </div>
              `
              : ""
          }

          ${
            safeArchived.length
              ? `
                <div
                  id="writingMemoClearArchivedAction"
                >
                  <button
                    class="writingMemoClearArchivedButton"
                    data-writing-memo-clear-archived
                  >
                    アーカイブを一括削除
                  </button>
                </div>
              `
              : ""
          }
        </div>
      </div>

      <div id="writingMemoSecondaryBody" class="writingMemoSecondaryBody">
        <div
          id="writingMemoDonePanel"
          class="writingMemoSecondaryPanel"
          data-writing-memo-secondary-panel="done"
        >
          ${
            safeDone.length
              ? `<ul class="writingMemoList">
                  ${safeDone
                    .map((item) =>
                      renderWritingMemoItem(item, esc, editingWritingMemoId),
                    )
                    .join("")}
                </ul>`
              : `<div class="muted">完了した執筆メモはありません。</div>`
          }
        </div>

        <div
          id="writingMemoArchivedPanel"
          class="writingMemoSecondaryPanel"
          data-writing-memo-secondary-panel="archived"
        >
          ${
            safeArchived.length
              ? `<ul class="writingMemoList">
                  ${safeArchived.map((item) => renderWritingMemoArchivedItem(item, esc)).join("")}
                </ul>`
              : `<div class="muted">アーカイブされた執筆メモはありません。</div>`
          }
        </div>
      </div>
    </div>
  `;
}

function renderWritingMemoStatusMenu() {
  return `
    <div id="writingMemoStatusMenuOverlay" class="writingMemoStatusMenuOverlay">
      <div id="writingMemoStatusMenu" class="writingMemoStatusMenu">
        <button type="button" class="writingMemoStatusMenuButton" data-writing-memo-next-status="active">
          未処理
        </button>
        <button type="button" class="writingMemoStatusMenuButton" data-writing-memo-next-status="hold">
          保留
        </button>
        <button type="button" class="writingMemoStatusMenuButton" data-writing-memo-next-status="done">
          完了
        </button>
        <button type="button" class="writingMemoStatusMenuButton" data-writing-memo-next-status="archive">
          アーカイブ
        </button>
      </div>
    </div>
  `;
}

module.exports = {
  renderWritingMemoStatusMenu,
  renderStatsTab,
  renderWritingMemoTab,
  renderHighlightTab,
};
