function getGroupsScript() {
  return `

    let openImagePreview = null;
    let isAllImagesGalleryOpen = false;

    function getGroupTitleForMove(group, index) {
      const title = String(group?.title || "").trim();
      return title || \`無題大分類 \${index + 1}\`;
    }

    function getMoveItemLabel(item, index) {
      const kind = item && item.kind === "divider" ? "divider" : "entry";

      if (kind === "divider") {
        const label = String(item?.label || "").trim() || \`無題区分 \${index + 1}\`;
        return \`区分「\${label}」の後\`;
      }

      const heading = String(item?.heading || "").trim() || \`無題項目 \${index + 1}\`;
      return \`項目「\${heading}」の後\`;
    }

    function isMovePickerOpen(groupId, itemId) {
      return (
        movePickerState.groupId === groupId &&
        movePickerState.itemId === itemId
      );
    }

    function openMovePicker(groupId, itemId) {
      movePickerState = {
        groupId,
        itemId,
        targetGroupId: groupId,
        insertIndex: "",
      };
      renderGroups();
    }

    function closeMovePicker() {
      movePickerState = {
        groupId: "",
        itemId: "",
        targetGroupId: "",
        insertIndex: "",
      };
      renderGroups();
    }

    function toggleItemMemo(groupId, itemId) {
      openGroupMoreMenuId = "";
      openItemMoreMenuId = "";
      openItemMemoId = openItemMemoId === itemId ? "" : itemId;
      renderGroups();
    }

    function openItemMemoAndScroll(groupId, itemId) {
      openGroupMoreMenuId = "";
      openItemMoreMenuId = "";

      if (openItemMemoId === itemId) {
        openItemMemoId = "";
        renderGroups();
        return;
      }

      openItemMemoId = itemId;
      renderGroups();

      requestAnimationFrame(() => {
        const panelEl = groupsRoot.querySelector(
          \`.itemMemoPanel[data-item-id="\${itemId}"]\`,
        );

        if (!panelEl) return;

        panelEl.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
    }

    function updateItemMemoMeta(itemId, updatedAt) {
      const metaEl = groupsRoot.querySelector(
        \`[data-role="itemMemoMeta"][data-item-id="\${itemId}"]\`,
      );
      if (!metaEl) return;

      metaEl.textContent = updatedAt
        ? \`更新: \${formatDateTime(updatedAt)}\`
        : "未保存";
    }

    function renderMoveTargetOptions(currentGroupId, selectedGroupId) {
      return state.groups
        .map((group, index) => {
          const label = esc(getGroupTitleForMove(group, index));
          const selected = group.id === selectedGroupId ? "selected" : "";
          return \`<option value="\${group.id}" \${selected}>\${label}</option>\`;
        })
        .join("");
    }

    function findGroupImage(groupId, imageId) {
      const group = state.groups.find((g) => g.id === groupId);
      if (!group) return null;

      const images = Array.isArray(group.images) ? group.images : [];
      const image = images.find((entry) => entry.id === imageId);
      if (!image) return null;

      return {
        group,
        image,
      };
    }

    function getGroupImageNavigation(groupId, imageId) {
      const group = state.groups.find((g) => g.id === groupId);
      if (!group) {
        return {
          images: [],
          index: -1,
          prevImage: null,
          nextImage: null,
        };
      }

      const images = Array.isArray(group.images)
        ? group.images.filter((image) => String(image?.webviewUri || "").trim())
        : [];

      const index = images.findIndex((image) => image.id === imageId);

      if (index < 0) {
        return {
          images,
          index: -1,
          prevImage: null,
          nextImage: null,
        };
      }

      return {
        images,
        index,
        prevImage: index > 0 ? images[index - 1] : null,
        nextImage: index < images.length - 1 ? images[index + 1] : null,
      };
    }

    function getAllNoteImageNavigation(groupId, imageId) {
      const rows = getAllNoteImages();

      const index = rows.findIndex((row) => {
        return (
          String(row?.groupId || "") === String(groupId || "") &&
          String(row?.image?.id || "") === String(imageId || "")
        );
      });

      if (index < 0) {
        return {
          rows,
          images: [],
          index: -1,
          prevImage: null,
          nextImage: null,
          prevGroupId: "",
          nextGroupId: "",
        };
      }

      const prevRow = index > 0 ? rows[index - 1] : null;
      const nextRow = index < rows.length - 1 ? rows[index + 1] : null;

      return {
        rows,
        images: rows.map((row) => row.image),
        index,
        prevImage: prevRow?.image || null,
        nextImage: nextRow?.image || null,
        prevGroupId: prevRow?.groupId || "",
        nextGroupId: nextRow?.groupId || "",
      };
    }

    function getCurrentImageNavigation() {
      if (!openImagePreview?.groupId || !openImagePreview?.imageId) {
        return {
          images: [],
          index: -1,
          prevImage: null,
          nextImage: null,
          prevGroupId: "",
          nextGroupId: "",
        };
      }

      if (openImagePreview.scope === "all") {
        return getAllNoteImageNavigation(
          openImagePreview.groupId,
          openImagePreview.imageId,
        );
      }

      const nav = getGroupImageNavigation(
        openImagePreview.groupId,
        openImagePreview.imageId,
      );

      return {
        ...nav,
        prevGroupId: openImagePreview.groupId,
        nextGroupId: openImagePreview.groupId,
      };
    }

    function getAllNoteImages() {
      const rows = [];

      state.groups.forEach((group, groupIndex) => {
        const groupTitle =
          String(group?.title || "").trim() || \`大分類 \${groupIndex + 1}\`;

        const images = Array.isArray(group?.images) ? group.images : [];

        images.forEach((image) => {
          if (!String(image?.webviewUri || "").trim()) return;

          rows.push({
            group,
            groupId: String(group?.id || ""),
            groupTitle,
            image,
          });
        });
      });

      return rows;
    }

    function updateAllImagesButtonLabel() {
      if (!toggleAllImagesBtn) return;

      const count = getAllNoteImages().length;
      toggleAllImagesBtn.textContent = count ? \`画像一覧 (\${count})\` : "画像一覧";
      toggleAllImagesBtn.classList.toggle("isActive", isAllImagesGalleryOpen);
    }

    function openGroupImagePreview(groupId, imageId, scope = "group") {
      if (!groupId || !imageId) return;

      const found = findGroupImage(groupId, imageId);
      if (!found) {
        setStatus("画像を開けませんでした。", true);
        return;
      }

      openGroupMoreMenuId = "";
      openItemMoreMenuId = "";

      openImagePreview = {
        groupId,
        imageId,
        scope: scope === "all" ? "all" : "group",
      };

      renderGroups();
    }

    function closeGroupImagePreview() {
      openImagePreview = null;
      renderGroups();
    }

    function moveGroupImagePreview(direction) {
      if (!openImagePreview?.groupId || !openImagePreview?.imageId) {
        return;
      }

      const nav = getCurrentImageNavigation();
      const targetImage = direction === "prev" ? nav.prevImage : nav.nextImage;
      const targetGroupId =
        direction === "prev" ? nav.prevGroupId : nav.nextGroupId;

      if (!targetImage?.id || !targetGroupId) {
        return;
      }

      openImagePreview = {
        groupId: targetGroupId,
        imageId: targetImage.id,
        scope: openImagePreview.scope === "all" ? "all" : "group",
      };

      renderGroups();
    }

    function renderGroupImagePreviewOverlay() {
      if (!openImagePreview?.groupId || !openImagePreview?.imageId) {
        return "";
      }

      const found = findGroupImage(
        openImagePreview.groupId,
        openImagePreview.imageId,
      );

      if (!found) {
        return "";
      }

      const { group, image } = found;

      const nav = getCurrentImageNavigation();
      const canPrev = Boolean(nav.prevImage);
      const canNext = Boolean(nav.nextImage);
      const imageIndexText =
        nav.index >= 0 && nav.images.length
          ? \`\${nav.index + 1} / \${nav.images.length}\`
          : "";

      const imageName = esc(image?.name || image?.fileName || "画像");
      const src = esc(image?.webviewUri || "");
      const groupTitle = esc(group?.title || "大分類");

      if (!src) return "";

      return \`
        <div class="groupImagePreviewOverlay" data-role="groupImagePreviewOverlay">
          <button
            class="groupImagePreviewBackdrop"
            type="button"
            data-action="closeGroupImagePreview"
            aria-label="画像プレビューを閉じる"
          ></button>

          <section
            class="groupImagePreviewDialog"
            role="dialog"
            aria-modal="true"
            aria-label="画像プレビュー"
          >
            <div class="groupImagePreviewHeader">
              <div class="groupImagePreviewMetaBlock">
                <div class="groupImagePreviewTitle" title="\${imageName}">
                  \${imageName}
                </div>
                <div class="groupImagePreviewMeta">
                  \${groupTitle}\${imageIndexText ? \` ・ \${imageIndexText}\` : ""}
                </div>
              </div>

              <button
                class="secondary"
                type="button"
                data-action="closeGroupImagePreview"
              >
                閉じる
                <span class="kbdHint">Esc</span>
              </button>
            </div>

            <div class="groupImagePreviewBody">
              <button
                class="groupImagePreviewNav groupImagePreviewPrev"
                type="button"
                data-action="moveGroupImagePreview"
                data-direction="prev"
                \${canPrev ? "" : "disabled"}
                aria-label="前の画像"
                title="前の画像"
              >
                ‹
              </button>

              <img
                class="groupImagePreviewImage"
                src="\${src}"
                alt="\${imageName}"
              >

              <button
                class="groupImagePreviewNav groupImagePreviewNext"
                type="button"
                data-action="moveGroupImagePreview"
                data-direction="next"
                \${canNext ? "" : "disabled"}
                aria-label="次の画像"
                title="次の画像"
              >
                ›
              </button>
            </div>
          </section>
        </div>
      \`;
    }

    function renderGroupImageGallery(group) {
      const images = Array.isArray(group?.images) ? group.images : [];

      const imageCards = images.length
        ? images
            .map((image) => {
              const imageName = esc(image?.name || image?.fileName || "画像");
              const src = esc(image?.webviewUri || "");

              if (!src) return "";

              return \`
                <figure class="groupImageCard" data-image-id="\${esc(image.id || "")}">
                  <button
                    class="groupImageOpenBtn"
                    type="button"
                    data-action="openGroupImagePreview"
                    data-group-id="\${esc(group.id || "")}"
                    data-image-id="\${esc(image.id || "")}"
                    title="画像を拡大表示"
                  >
                    <span class="groupImageThumbWrap">
                      <img class="groupImageThumb" src="\${src}" alt="\${imageName}">
                    </span>
                  </button>

                  <figcaption class="groupImageCaption">
                    <span class="groupImageName" title="\${imageName}">\${imageName}</span>

                    <span class="groupImageActions">
                      <button
                        class="groupImageRenameBtn"
                        type="button"
                        data-action="renameGroupImage"
                        data-group-id="\${esc(group.id || "")}"
                        data-image-id="\${esc(image.id || "")}"
                        data-image-name="\${imageName}"
                        title="画像名を変更"
                      >
                        名前
                      </button>

                      <button
                        class="groupImageDeleteBtn"
                        type="button"
                        data-action="deleteGroupImage"
                        data-group-id="\${esc(group.id || "")}"
                        data-image-id="\${esc(image.id || "")}"
                        title="画像を削除"
                      >
                        削除
                      </button>
                    </span>
                  </figcaption>
                </figure>
              \`;
            })
            .join("")
        : \`<div class="groupImageEmpty">画像はまだありません。</div>\`;

      return \`
        <section class="groupImagePanel">
          <div class="groupImagePanelHeader">
            <div class="groupImagePanelTitle">画像</div>

            <div class="groupImagePanelActions">
              <button
                class="secondary"
                type="button"
                data-action="uploadGroupImage"
                data-group-id="\${group.id}"
              >
                ＋画像
              </button>

              <button
                class="secondary"
                type="button"
                data-action="closeGroupImageGallery"
                data-group-id="\${group.id}"
              >
                閉じる
                <span class="kbdHint">Esc</span>
              </button>
            </div>
          </div>

          <div class="groupImageGrid">
            \${imageCards}
          </div>
        </section>
      \`;
    }

    function renderAllImagesGallery() {
      if (!isAllImagesGalleryOpen) {
        return "";
      }

      const rows = getAllNoteImages();

      const imageCards = rows.length
        ? rows
            .map((row) => {
              const { group, image, groupTitle } = row;

              const imageName = esc(image?.name || image?.fileName || "画像");
              const src = esc(image?.webviewUri || "");
              const safeGroupTitle = esc(groupTitle);

              if (!src) return "";

              return \`
                <figure class="groupImageCard allImageCard" data-image-id="\${esc(image.id || "")}">
                  <button
                    class="groupImageOpenBtn"
                    type="button"
                    data-action="openGroupImagePreview"
                    data-preview-scope="all"
                    data-group-id="\${esc(group.id || "")}"
                    data-image-id="\${esc(image.id || "")}"
                    title="画像を拡大表示"
                  >
                    <span class="groupImageThumbWrap">
                      <img class="groupImageThumb" src="\${src}" alt="\${imageName}">
                    </span>
                  </button>

                  <figcaption class="groupImageCaption allImageCaption">
                    <span class="groupImageNameBlock">
                      <span class="groupImageName" title="\${imageName}">\${imageName}</span>
                      <span class="allImageGroupName" title="\${safeGroupTitle}">\${safeGroupTitle}</span>
                    </span>

                    <span class="groupImageActions">
                      <button
                        class="groupImageRenameBtn"
                        type="button"
                        data-action="renameGroupImage"
                        data-group-id="\${esc(group.id || "")}"
                        data-image-id="\${esc(image.id || "")}"
                        data-image-name="\${imageName}"
                        title="画像名を変更"
                      >
                        名前
                      </button>

                      <button
                        class="groupImageDeleteBtn"
                        type="button"
                        data-action="deleteGroupImage"
                        data-group-id="\${esc(group.id || "")}"
                        data-image-id="\${esc(image.id || "")}"
                        title="画像を削除"
                      >
                        削除
                      </button>
                    </span>
                  </figcaption>
                </figure>
              \`;
            })
            .join("")
        : \`<div class="groupImageEmpty">このノートにはまだ画像がありません。</div>\`;

      return \`
        <div class="allImagesPopupPanel">
          <section class="groupImagePanel allImagesPanel">
            <div class="groupImagePanelHeader">
              <div class="groupImagePanelTitle">ノート全体の画像</div>

              <div class="groupImagePanelActions">
                <button
                  class="secondary"
                  type="button"
                  data-action="closeAllImagesGallery"
                >
                  閉じる
                  <span class="kbdHint">Esc</span>
                </button>
              </div>
            </div>

            <div class="groupImageGrid allImagesGrid">
              \${imageCards}
            </div>
          </section>
        </div>
      \`;
    }

    function toggleGroupImageGallery(groupId) {
      openGroupMoreMenuId = "";
      openItemMoreMenuId = "";
      isAllImagesGalleryOpen = false;

      openImageGalleryGroupId =
        openImageGalleryGroupId === groupId ? "" : groupId;

      renderGroups();
    }

    function closeGroupImageGallery() {
      openImageGalleryGroupId = "";
      renderGroups();
    }

    function toggleAllImagesGallery() {
      openGroupMoreMenuId = "";
      openItemMoreMenuId = "";
      openImageGalleryGroupId = "";

      isAllImagesGalleryOpen = !isAllImagesGalleryOpen;

      renderGroups();
    }

    function closeAllImagesGallery() {
      isAllImagesGalleryOpen = false;
      renderGroups();
    }

    function renderMovePositionOptions(sourceGroupId, itemId, targetGroupId, selectedInsertIndex) {
      if (!targetGroupId) {
        return \`<option value="">位置を選択</option>\`;
      }

      const targetGroup = state.groups.find((g) => g.id === targetGroupId);
      if (!targetGroup) {
        return \`<option value="">位置を選択</option>\`;
      }

      const targetItemsRaw = Array.isArray(targetGroup.items) ? targetGroup.items : [];
      const targetItems = targetGroupId === sourceGroupId
        ? targetItemsRaw.filter((item) => item.id !== itemId)
        : targetItemsRaw;

      const options = [];

      options.push(
        \`<option value="" \${selectedInsertIndex === "" ? "selected" : ""}>位置を選択</option>\`
      );

      options.push(
        \`<option value="0" \${String(selectedInsertIndex) === "0" ? "selected" : ""}>先頭</option>\`
      );

      targetItems.forEach((item, index) => {
        const insertIndex = index + 1;
        const label = esc(getMoveItemLabel(item, index));
        const selected = String(selectedInsertIndex) === String(insertIndex) ? "selected" : "";
        options.push(
          \`<option value="\${insertIndex}" \${selected}>\${label}</option>\`
        );
      });

      if (!targetItems.length) {
        options.push(
          \`<option value="0" \${String(selectedInsertIndex) === "0" ? "selected" : ""}>この大分類へ移動</option>\`
        );
      }

      return options.join("");
    }

    function renderGroups() {
      groupsRoot.innerHTML = "";

      const visibleGroups = getVisibleGroupsForSearch();
      updateEditorCounts(visibleGroups);

      if (!visibleGroups.length) {
        groupsRoot.innerHTML = '<div class="muted">該当する項目はありません。</div>';
        updateAllImagesButtonLabel();
        return;
      }

      visibleGroups.forEach((group, groupIndex) => {

        const isCollapsed = collapsedGroupIds.has(group.id);

        const visibleItems = getVisibleItemsForGroup(group);

        const itemsHtml = visibleItems.map((item, itemIndex) => {
          const kind = item && item.kind === "divider" ? "divider" : "entry";

          const movePickerOpen = isMovePickerOpen(group.id, item.id);
          const selectedMoveTargetGroupId = movePickerOpen
            ? (movePickerState.targetGroupId || group.id)
            : group.id;
          const selectedMoveInsertIndex = movePickerOpen
            ? movePickerState.insertIndex
            : "";
          const moveTargetOptions = renderMoveTargetOptions(group.id, selectedMoveTargetGroupId);
          const movePositionOptions = movePickerOpen
            ? renderMovePositionOptions(
                group.id,
                item.id,
                selectedMoveTargetGroupId,
                selectedMoveInsertIndex,
              )
            : "";
          const canMoveAnywhere = state.groups.length > 1 || (Array.isArray(group.items) && group.items.length > 1);

          if (kind === "divider") {
            return \`
              <section class="itemCard dividerCard" data-nav-id="item:\${item.id}">
                <div class="row">
                  <label class="label">区分 \${itemIndex + 1}</label>
                  <input type="text" class="dividerLabelInput" data-field="dividerLabel" data-group-id="\${group.id}" data-item-id="\${item.id}" value="\${esc(item.label || "")}">
                </div>
                <div class="row">
                  <label class="label">補足</label>
                  <input type="text" class="dividerValueInput" data-field="dividerValue" data-group-id="\${group.id}" data-item-id="\${item.id}" value="\${esc(item.value || "")}">
                </div>
                <div class="itemButtons">
                  <button
                    class="secondary"
                    type="button"
                    data-action="moveItemUp"
                    data-group-id="\${group.id}"
                    data-item-id="\${item.id}"
                    \${itemIndex === 0 ? "disabled" : ""}
                  >
                    ↑
                  </button>
                  <button
                    class="secondary"
                    type="button"
                    data-action="moveItemDown"
                    data-group-id="\${group.id}"
                    data-item-id="\${item.id}"
                    \${itemIndex === group.items.length - 1 ? "disabled" : ""}
                  >
                    ↓
                  </button>
                  <button
                    class="secondary"
                    type="button"
                    data-action="toggleMovePicker"
                    data-group-id="\${group.id}"
                    data-item-id="\${item.id}"
                    \${!canMoveAnywhere ? "disabled" : ""}
                  >
                    移動
                  </button>
                  <button
                    class="secondary groupJumpLink"
                    type="button"
                    data-action="jumpItemToPreview"
                    data-nav-id="item:\${item.id}"
                    title="この区分のプレビュー位置へ移動"
                  >
                    プレビュー
                  </button>
                  <button
                    class="danger"
                    type="button"
                    data-action="removeItem"
                    data-group-id="\${group.id}"
                    data-item-id="\${item.id}"
                  >
                    削除
                  </button>
                </div>
                \${
                  movePickerOpen
                    ? \`
                  <div class="movePicker">
                    <span class="movePickerLabel">移動先：大分類を選択</span>
                    <select
                      data-role="moveTargetGroup"
                      data-group-id="\${group.id}"
                      data-item-id="\${item.id}"
                    >
                      \${moveTargetOptions}
                    </select>

                    <span class="movePickerLabel">大分類内：移動先を選択</span>
                    <select
                      data-role="moveTargetPosition"
                      data-group-id="\${group.id}"
                      data-item-id="\${item.id}"
                    >
                      \${movePositionOptions}
                    </select>

                    <button
                      class="secondary"
                      type="button"
                      data-action="confirmMoveItem"
                      data-group-id="\${group.id}"
                      data-item-id="\${item.id}"
                    >
                      実行
                    </button>
                    <button
                      class="secondary"
                      type="button"
                      data-action="closeMovePicker"
                      data-group-id="\${group.id}"
                      data-item-id="\${item.id}"
                    >
                      閉じる
                    </button>
                  </div>
                \`
                    : ""
                }
              </section>
            \`;
          }

          const isItemMoreMenuOpen = openItemMoreMenuId === item.id;
          const memoUpdatedAt = String(item?.memo?.updatedAt || "").trim();
          const isItemMemoOpen = openItemMemoId === item.id;

          const itemMoreMenuHtml = \`
            <div class="itemMoreMenuWrap">
              <button
                class="secondary itemMoreMenuBtn"
                type="button"
                data-menu-action="toggleItemMoreMenu"
                data-item-id="\${item.id}"
                aria-label="項目メニュー"
                aria-expanded="\${isItemMoreMenuOpen ? "true" : "false"}"
              >
                ︙
              </button>

              \${
                isItemMoreMenuOpen
                  ? \`
                    <div class="itemMoreMenuPanel">
                      <button
                        class="menuItem"
                        type="button"
                        data-action="toggleItemMemo"
                        data-group-id="\${group.id}"
                        data-item-id="\${item.id}"
                      >
                        項目メモを開く
                      </button>

                      <button
                        class="menuItem"
                        type="button"
                        data-action="openConceptMemoForCopyToItemBody"
                        data-group-id="\${group.id}"
                        data-item-id="\${item.id}"
                        data-item-title="\${esc(item.heading || \`項目 \${itemIndex + 1}\`)}"
                      >
                        構想メモからコピー
                      </button>

                      <button
                        class="menuItem"
                        type="button"
                        data-action="insertTemplateAfterItem"
                        data-item-id="\${item.id}"
                        data-item-title="\${esc(item.heading || \`項目 \${itemIndex + 1}\`)}"
                        data-group-id="\${group.id}"
                        data-group-title="\${esc(group.title || \`大分類 \${groupIndex + 1}\`)}"
                      >
                        テンプレート：現在の項目の下へ要素のみを挿入
                      </button>

                      <button
                        class="menuItem"
                        type="button"
                        data-action="importEntriesAfterItem"
                        data-group-id="\${group.id}"
                        data-item-id="\${item.id}"
                      >
                        インポート：現在の項目の下に項目を追加して挿入
                      </button>

                      <button
                        class="menuItem"
                        type="button"
                        data-action="importTextIntoItem"
                        data-group-id="\${group.id}"
                        data-item-id="\${item.id}"
                      >
                        インポート：項目の詳細を上書き
                      </button>
                    </div>
                  \`
                  : ""
              }
            </div>
          \`;

          const hasMemo = Boolean(
            item?.memo &&
            (
              String(item.memo.body || "").trim() ||
              (Array.isArray(item.memo.tags) && item.memo.tags.length)
            )
          );

          return \`
            <section class="itemCard" data-nav-id="item:\${item.id}">
              <div class="row rowItemHeading">
                <label class="label">
                  項目 \${itemIndex + 1}
                  \${hasMemo ? \`
                    <button
                      type="button"
                      class="itemMemoIcon"
                      data-action="openItemMemoAndScroll"
                      data-group-id="\${group.id}"
                      data-item-id="\${item.id}"
                      title="メモを開く"
                    >
                      📝
                    </button>
                  \` : ""}
                </label>
                <input
                  type="text"
                  class="itemHeadingInput"
                  data-field="itemHeading"
                  data-group-id="\${group.id}"
                  data-item-id="\${item.id}"
                  value="\${esc(item.heading || "")}"
                >
              </div>
              <div class="row">
                <label class="label">詳細</label>
                <textarea class="itemBodyInput" data-field="itemBody" data-group-id="\${group.id}" data-item-id="\${item.id}">\${esc(item.body || "")}</textarea>
              </div>
              <div class="itemButtons">
                <button
                  class="secondary"
                  type="button"
                  data-action="moveItemUp"
                  data-group-id="\${group.id}"
                  data-item-id="\${item.id}"
                  \${itemIndex === 0 ? "disabled" : ""}
                >
                  ↑
                </button>
                <button
                  class="secondary"
                  type="button"
                  data-action="moveItemDown"
                  data-group-id="\${group.id}"
                  data-item-id="\${item.id}"
                  \${itemIndex === group.items.length - 1 ? "disabled" : ""}
                >
                  ↓
                </button>
                <button
                  class="secondary"
                  type="button"
                  data-action="toggleMovePicker"
                  data-group-id="\${group.id}"
                  data-item-id="\${item.id}"
                    \${!canMoveAnywhere ? "disabled" : ""}
                >
                  移動
                </button>
                <button
                  class="secondary groupJumpLink"
                  type="button"
                  data-action="jumpItemToPreview"
                  data-nav-id="item:\${item.id}"
                  title="この項目のプレビュー位置へ移動"
                >
                  プレビュー
                </button>
                <button
                  class="secondary"
                  type="button"
                  data-action="insertItemAfter"
                  data-group-id="\${group.id}"
                  data-item-id="\${item.id}"
                >
                  ＋項目
                </button>
                <button
                  class="secondary"
                  type="button"
                  data-action="insertDividerAfter"
                  data-group-id="\${group.id}"
                  data-item-id="\${item.id}"
                >
                  ＋区分
                </button>
                \${itemMoreMenuHtml}
                <button
                  class="danger"
                  type="button"
                  data-action="removeItem"
                  data-group-id="\${group.id}"
                  data-item-id="\${item.id}"
                >
                  削除
                </button>
              </div>
              \${
                isItemMemoOpen
                  ? \`
                    <div class="itemMemoPanel" data-item-id="\${item.id}">
                      <div class="itemMemoHeader">
                        <div class="itemMemoTitle">項目メモ</div>
                        <div
                          class="itemMemoMeta"
                          data-role="itemMemoMeta"
                          data-item-id="\${item.id}"
                        >
                          \${
                            String(item?.memo?.updatedAt || "").trim()
                              ? \`更新: \${esc(formatDateTime(String(item.memo.updatedAt || "")))}\`
                              : "未保存"
                          }
                        </div>
                        <button
                          type="button"
                          class="ghostButton"
                          data-action="toggleItemMemo"
                          data-group-id="\${group.id}"
                          data-item-id="\${item.id}"
                        >
                          閉じる
                        </button>
                      </div>

                      <div class="row">
                        <label class="label">本文</label>
                        <textarea
                          class="itemMemoBodyInput"
                          data-field="itemMemoBody"
                          data-group-id="\${group.id}"
                          data-item-id="\${item.id}"
                          placeholder="この項目専用のメモを書けます"
                        >\${esc(item?.memo?.body || "")}</textarea>
                      </div>
                      <div class="row">
                        <label class="label">タグ</label>
                        <input
                          type="text"
                          class="itemMemoTagsInput"
                          data-field="itemMemoTags"
                          data-group-id="\${group.id}"
                          data-item-id="\${item.id}"
                          value="\${esc((item?.memo?.tags || []).join(", "))}"
                          placeholder="例: 伏線, 要確認, 後で修正"
                        >
                      </div>
                      <div class="itemMemoActions">
                        <span class="itemMemoActionsLabel">構想メモ：</span>

                        <button
                          class="secondary"
                          type="button"
                          data-action="openLinkedConceptMemo"
                          data-group-id="\${group.id}"
                          data-item-id="\${item.id}"
                          title="出典リンク中の構想メモを開きます"
                        >
                          メモを開く
                        </button>

                        <button
                          class="secondary"
                          type="button"
                          data-action="openConceptMemoForCopyToItemMemo"
                          data-group-id="\${group.id}"
                          data-item-id="\${item.id}"
                          title="通常メモを絞り込み表示して本文をコピーします"
                        >
                          メモからコピー
                        </button>

                        <button
                          class="secondary"
                          type="button"
                          data-action="copyItemMemoToConceptMemo"
                          data-group-id="\${group.id}"
                          data-item-id="\${item.id}"
                          title="この項目メモの内容を構想メモへ作成・反映します"
                        >
                          メモへ反映
                        </button>

                        <button
                          class="secondary itemMemoClearButton"
                          type="button"
                          data-action="clearItemMemo"
                          data-group-id="\${group.id}"
                          data-item-id="\${item.id}"
                        >
                          クリア
                        </button>
                      </div>
                    </div>
                  \`
                                : ""
                            }
              \${
                movePickerOpen
                  ? \`
                  <div class="movePicker">
                    <span class="movePickerLabel">移動先：大分類を選択</span>
                    <select
                      data-role="moveTargetGroup"
                      data-group-id="\${group.id}"
                      data-item-id="\${item.id}"
                    >
                      \${moveTargetOptions}
                    </select>

                    <span class="movePickerLabel">大分類内：移動先を選択</span>
                    <select
                      data-role="moveTargetPosition"
                      data-group-id="\${group.id}"
                      data-item-id="\${item.id}"
                    >
                      \${movePositionOptions}
                    </select>

                    <button
                      class="secondary"
                      type="button"
                      data-action="confirmMoveItem"
                      data-group-id="\${group.id}"
                      data-item-id="\${item.id}"
                    >
                      実行
                    </button>
                    <button
                      class="secondary"
                      type="button"
                      data-action="closeMovePicker"
                      data-group-id="\${group.id}"
                      data-item-id="\${item.id}"
                    >
                      閉じる
                    </button>
                  </div>
              \`
                  : ""
              }
            </section>
          \`;
        }).join("");

        const itemsEmptyHtml = !itemsHtml
        ? '<div class="muted">まだ項目や区分がありません。</div>'
        : "";
        const itemsContainerStyle = isCollapsed ? 'style="display:none"' : "";

        const collapsedNoteHtml = isCollapsed
          ? \`
            <div class="groupCollapsedNote">
              内容は折りたたまれています
            </div>
          \`
          : "";

        const groupContextLabelHtml = \`
          <div class="groupContextLabel">
            大分類：\${esc(group.title || \`大分類 \${groupIndex + 1}\`)}
          </div>
        \`;

        const isGroupMoreMenuOpen = openGroupMoreMenuId === group.id;

        const groupMoreMenuHtml = \`
          <div class="groupMoreMenuWrap">
            <button
              class="secondary groupMoreMenuBtn"
              type="button"
              data-menu-action="toggleGroupMoreMenu"
              data-group-id="\${group.id}"
              aria-label="大分類メニュー"
              aria-expanded="\${isGroupMoreMenuOpen ? "true" : "false"}"
            >
              ︙
            </button>

            \${
              isGroupMoreMenuOpen
                ? \`
                  <div class="groupMoreMenuPanel">
                    <button
                      class="menuItem"
                      type="button"
                      data-action="insertTemplateAfterGroup"
                      data-group-id="\${group.id}"
                      data-group-title="\${esc(group.title || \`大分類 \${groupIndex + 1}\`)}"
                    >
                      テンプレート：現在の大分類の下へ挿入
                    </button>
                    <button
                      class="menuItem"
                      type="button"
                      data-action="insertTemplateContent"
                      data-group-id="\${group.id}"
                      data-group-title="\${esc(group.title || \`大分類 \${groupIndex + 1}\`)}"
                    >
                      テンプレート：大分類の中へ要素のみを挿入
                    </button>
                    <button
                      class="menuItem"
                      type="button"
                      data-action="saveGroupTemplate"
                      data-group-id="\${group.id}"
                      data-group-title="\${esc(group.title || \`大分類 \${groupIndex + 1}\`)}"
                    >
                      テンプレートを保存：現在の大分類のみ
                    </button>

                    <button
                      class="menuItem"
                      type="button"
                      data-action="openPartialImportFromGroup"
                      data-group-id="\${group.id}"
                      data-group-title="\${esc(group.title || \`大分類 \${groupIndex + 1}\`)}"
                    >
                      インポート：選択（挿入/項目上書き）
                    </button>
                  </div>
                \`
                : ""
            }
          </div>
        \`;

        const imageCount = Array.isArray(group?.images) ? group.images.length : 0;
        const isImageGalleryOpen = openImageGalleryGroupId === group.id;

        const groupImagePopupHtml = isImageGalleryOpen
          ? \`
            <div class="groupImagePopupPanel">
              \${renderGroupImageGallery(group)}
            </div>
          \`
          : "";

        const groupButtonsHtml = \`
          <div class="groupButtons">
            <button
              class="secondary"
              type="button"
              data-action="moveGroupUp"
              data-group-id="\${group.id}"
              \${groupIndex === 0 ? "disabled" : ""}
            >
              ↑
            </button>
            <button
              class="secondary"
              type="button"
              data-action="moveGroupDown"
              data-group-id="\${group.id}"
              \${groupIndex === state.groups.length - 1 ? "disabled" : ""}
            >
              ↓
            </button>
            <button
              class="secondary"
              type="button"
              data-action="toggleGroup"
              data-group-id="\${group.id}"
            >
              \${isCollapsed ? "開く" : "畳む"}
            </button>
            <button
              class="secondary groupJumpLink"
              type="button"
              data-action="jumpGroupToPreview"
              data-nav-id="group:\${group.id}"
              title="この大分類のプレビュー位置へ移動"
            >
              プレビュー
            </button>
            <div class="groupImagePopupWrap">
              <button
                class="secondary groupImageToggleBtn \${isImageGalleryOpen ? "isActive" : ""}"
                type="button"
                data-action="toggleGroupImages"
                data-group-id="\${group.id}"
                title="この大分類の画像一覧を開く"
              >
                画像\${imageCount ? \` (\${imageCount})\` : ""}
              </button>

              \${groupImagePopupHtml}
            </div>
            \${groupMoreMenuHtml}
            <button
              class="danger"
              type="button"
              data-action="removeGroup"
              data-group-id="\${group.id}"
            >
              削除
            </button>
          </div>
        \`;

        const groupActionsBottomHtml = \`
          <div class="groupActions groupActionsBottom">
            <button class="secondary" type="button" data-action="addItem" data-group-id="\${group.id}">＋項目</button>
            <button class="secondary" type="button" data-action="addDivider" data-group-id="\${group.id}">＋区分</button>
            <button class="secondary" type="button" data-action="addGroupAfter" data-group-id="\${group.id}">＋大分類</button>
          </div>
        \`;

        const groupHtml = \`
          <div class="groupSticky">
          <div class="row">
            <label class="label">大分類 \${groupIndex + 1}</label>
            <input type="text" data-field="groupTitle" data-group-id="\${group.id}" value="\${esc(group.title || "")}">
          </div>
          \${groupButtonsHtml}
          </div>
          
          <div class="itemsArea" \${itemsContainerStyle}>
            \${itemsHtml}
            \${itemsEmptyHtml}
          </div>

          \${collapsedNoteHtml}

          \${isCollapsed ? "" : groupActionsBottomHtml}
          \${isCollapsed ? "" : groupContextLabelHtml}
        \`;

        const wrap = document.createElement("section");
        wrap.className = "groupItem";
        wrap.innerHTML = groupHtml;
        wrap.dataset.navId = "group:" + group.id;
        groupsRoot.appendChild(wrap);
      });

      const allImagesGalleryHtml = renderAllImagesGallery();

      if (allImagesGalleryHtml) {
        const galleryHost = document.createElement("div");
        galleryHost.innerHTML = allImagesGalleryHtml.trim();
        const galleryEl = galleryHost.firstElementChild;
        if (galleryEl) {
          groupsRoot.appendChild(galleryEl);
        }
      }

      const previewOverlayHtml = renderGroupImagePreviewOverlay();

      if (previewOverlayHtml) {
        const overlayHost = document.createElement("div");
        overlayHost.innerHTML = previewOverlayHtml.trim();
        const overlayEl = overlayHost.firstElementChild;
        if (overlayEl) {
          groupsRoot.appendChild(overlayEl);
        }
      }

      updateAllImagesButtonLabel();

      groupsRoot.querySelectorAll("[data-field]").forEach((el) => {
        el.addEventListener("input", (event) => {
          const field = event.target.dataset.field;
          const groupId = event.target.dataset.groupId;
          const itemId = event.target.dataset.itemId;

          const group = state.groups.find((g) => g.id === groupId);
          if (!group) return;

          if (field === "groupTitle") {
            group.title = event.target.value;
            markDirty();
            renderPreview();
            return;
          }

          const item = (Array.isArray(group.items) ? group.items : []).find((i) => i.id === itemId);
          if (!item) return;

          if (field === "itemHeading") {
            item.heading = event.target.value;
          } else if (field === "itemBody") {
            item.body = event.target.value;
          } else if (field === "dividerLabel") {
            item.label = event.target.value;
          } else if (field === "dividerValue") {
            item.value = event.target.value;
          }

          if (field === "itemMemoBody") {
            const nextValue = event.target.value;

            if (!item.memo || typeof item.memo !== "object") {
              item.memo = {
                body: "",
                updatedAt: "",
                tags: [],
                linkedConceptMemoIds: [],
              };
            }

            const currentBody = String(item.memo.body || "");

            if (currentBody !== nextValue) {
              item.memo.body = nextValue;
              item.memo.updatedAt = new Date().toISOString();
              markDirty();
              refreshViewsAfterItemMemoChange(item.id, item.memo.updatedAt);
            }

            return;
          }

          if (field === "itemMemoTags") {
            if (!item.memo || typeof item.memo !== "object") {
              item.memo = {
                body: "",
                updatedAt: "",
                tags: [],
                linkedConceptMemoIds: [],
              };
            }

            const nextTags = String(event.target.value || "")
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean)
              .slice(0, 8);

            item.memo.tags = nextTags;
            item.memo.updatedAt = new Date().toISOString();
            markDirty();
            refreshViewsAfterItemMemoChange(item.id, item.memo.updatedAt);
            return;
          }

          markDirty();
          renderPreview();
        });
      });

      groupsRoot.querySelectorAll("[data-action='toggleGroupImages']").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          const groupId = btn.dataset.groupId || "";
          if (!groupId) return;

          toggleGroupImageGallery(groupId);
        });
      });

      groupsRoot.querySelectorAll("[data-action='closeGroupImageGallery']").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          closeGroupImageGallery();
        });
      });

      groupsRoot.querySelectorAll("[data-action='openGroupImagePreview']").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          const groupId = btn.dataset.groupId || "";
          const imageId = btn.dataset.imageId || "";
          const scope = btn.dataset.previewScope === "all" ? "all" : "group";

          if (!groupId || !imageId) return;

          openGroupImagePreview(groupId, imageId, scope);
        });
      });

      groupsRoot.querySelectorAll("[data-action='closeAllImagesGallery']").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          closeAllImagesGallery();
        });
      });

      groupsRoot.querySelectorAll("[data-action='closeGroupImagePreview']").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          closeGroupImagePreview();
        });
      });

      groupsRoot.querySelectorAll("[data-action='moveGroupImagePreview']").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          const direction = btn.dataset.direction === "prev" ? "prev" : "next";
          moveGroupImagePreview(direction);
        });
      });

      groupsRoot.querySelectorAll("[data-action='uploadGroupImage']").forEach((btn) => {
        btn.addEventListener("click", () => {
          const groupId = btn.dataset.groupId || "";

          if (!groupId) {
            setStatus("画像を追加する大分類を取得できませんでした。", true);
            return;
          }

          vscode.postMessage({
            type: "uploadGroupImage",
            payload: {
              groupId,
              note: collectPayload(),
            },
          });
        });
      });

      groupsRoot.querySelectorAll("[data-action='deleteGroupImage']").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          const groupId = btn.dataset.groupId || "";
          const imageId = btn.dataset.imageId || "";

          if (!groupId || !imageId) {
            setStatus("削除する画像を取得できませんでした。", true);
            return;
          }

          vscode.postMessage({
            type: "deleteGroupImage",
            payload: {
              groupId,
              imageId,
              note: collectPayload(),
            },
          });
        });
      });

      groupsRoot.querySelectorAll("[data-action='renameGroupImage']").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          const groupId = btn.dataset.groupId || "";
          const imageId = btn.dataset.imageId || "";
          const currentName = btn.dataset.imageName || "";

          if (!groupId || !imageId) {
            setStatus("名前を変更する画像を取得できませんでした。", true);
            return;
          }

          vscode.postMessage({
            type: "renameGroupImage",
            payload: {
              groupId,
              imageId,
              currentName,
              note: collectPayload(),
            },
          });
        });
      });

      groupsRoot.querySelectorAll("[data-action='addItem']").forEach((btn) => {
        btn.addEventListener("click", () => {
          const groupId = btn.dataset.groupId;
          const group = state.groups.find((g) => g.id === groupId);
          if (!group) return;

          group.items.push(createEntry());
          markDirty();
          renderGroups();
          renderPreview();
          setStatus("項目を追加しました。", true);
        });
      });

      groupsRoot.querySelectorAll("[data-action='addDivider']").forEach((btn) => {
        btn.addEventListener("click", () => {
          const groupId = btn.dataset.groupId;
          addDivider(groupId);
        });
      });

      groupsRoot.querySelectorAll("[data-action='removeItem']").forEach((btn) => {
        btn.addEventListener("click", () => {
          const groupId = btn.dataset.groupId;
          const itemId = btn.dataset.itemId;
          removeItem(groupId, itemId);
        });
      });

      groupsRoot.querySelectorAll("[data-action='removeGroup']").forEach((btn) => {
        btn.addEventListener("click", () => {
          const groupId = btn.dataset.groupId;
          removeGroup(groupId);
        });
      });

      groupsRoot.querySelectorAll("[data-action='moveGroupUp']").forEach((btn) => {
        btn.addEventListener("click", () => {
          const groupId = btn.dataset.groupId;
          moveGroup(groupId, "up");
        });
      });

      groupsRoot.querySelectorAll("[data-action='moveGroupDown']").forEach((btn) => {
        btn.addEventListener("click", () => {
          const groupId = btn.dataset.groupId;
          moveGroup(groupId, "down");
        });
      });

      groupsRoot.querySelectorAll("[data-action='moveItemUp']").forEach((btn) => {
        btn.addEventListener("click", () => {
          const groupId = btn.dataset.groupId;
          const itemId = btn.dataset.itemId;
          moveItem(groupId, itemId, "up");
        });
      });

      groupsRoot.querySelectorAll("[data-action='moveItemDown']").forEach((btn) => {
        btn.addEventListener("click", () => {
          const groupId = btn.dataset.groupId;
          const itemId = btn.dataset.itemId;
          moveItem(groupId, itemId, "down");
        });
      });

      groupsRoot.querySelectorAll("[data-action='addGroupAfter']").forEach((btn) => {
        btn.addEventListener("click", () => {
          const groupId = btn.dataset.groupId || "";
          addGroupAfter(groupId);
        });
      });

      groupsRoot.querySelectorAll("[data-action='insertItemAfter']").forEach((btn) => {
        btn.addEventListener("click", () => {
          const groupId = btn.dataset.groupId || "";
          const itemId = btn.dataset.itemId || "";
          insertItemAfter(groupId, itemId);
        });
      });

      groupsRoot.querySelectorAll("[data-action='insertDividerAfter']").forEach((btn) => {
        btn.addEventListener("click", () => {
          const groupId = btn.dataset.groupId || "";
          const itemId = btn.dataset.itemId || "";
          insertDividerAfter(groupId, itemId);
        });
      });

      groupsRoot.querySelectorAll("[data-action='insertTemplateAfterGroup']").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          const groupId = btn.dataset.groupId || "";
          const groupTitle = btn.dataset.groupTitle || "";

          if (!groupId) {
            setStatus("挿入先の大分類を取得できませんでした。", true);
            return;
          }

          openTemplatePanelForGroupInsert(groupId, groupTitle);
        });
      });

      groupsRoot.querySelectorAll("[data-action='insertTemplateContent']").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          const groupId = btn.dataset.groupId || "";
          const groupTitle = btn.dataset.groupTitle || "";

          if (!groupId) {
            setStatus("挿入先の大分類を取得できませんでした。", true);
            return;
          }

          openTemplatePanelForGroupContentInsert(groupId, groupTitle);
        });
      });

      groupsRoot.querySelectorAll("[data-action='saveGroupTemplate']").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          const groupId = btn.dataset.groupId || "";
          const groupTitle = btn.dataset.groupTitle || "";

          if (!groupId) {
            setStatus("保存対象の大分類を取得できませんでした。", true);
            return;
          }

          openGroupMoreMenuId = "";
          renderGroups();

          vscode.postMessage({
            type: "saveGroupTemplate",
            payload: {
              ...collectPayload(),
              groupId,
              groupTitle,
            },
          });
        });
      });

      groupsRoot.querySelectorAll("[data-action='openPartialImportFromGroup']").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          const groupId = btn.dataset.groupId || "";

          openGroupMoreMenuId = "";
          renderGroups();

          vscode.postMessage({
            type: "openPartialImport",
            payload: {
              scopeGroupId: groupId,
              initialMode: "insert_entry",
            },
          });
        });
      });

      groupsRoot.querySelectorAll("[data-action='insertTemplateAfterItem']").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          const itemId = btn.dataset.itemId || "";
          const itemTitle = btn.dataset.itemTitle || "";
          const groupId = btn.dataset.groupId || "";
          const groupTitle = btn.dataset.groupTitle || "";

          if (!itemId || !groupId) {
            setStatus("挿入先の項目を取得できませんでした。", true);
            return;
          }

          openTemplatePanelForItemContentInsert(itemId, itemTitle, groupId, groupTitle);
        });
      });

      groupsRoot.querySelectorAll("[data-action='importEntriesAfterItem']").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          const groupId = btn.dataset.groupId || "";
          const itemId = btn.dataset.itemId || "";

          openItemMoreMenuId = "";
          renderGroups();

          vscode.postMessage({
            type: "importEntriesAfterItem",
            payload: {
              groupId,
              itemId,
            },
          });
        });
      });

      groupsRoot.querySelectorAll("[data-action='importTextIntoItem']").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          const groupId = btn.dataset.groupId || "";
          const itemId = btn.dataset.itemId || "";

          openItemMoreMenuId = "";
          renderGroups();

          vscode.postMessage({
            type: "importTextIntoItem",
            payload: {
              groupId,
              itemId,
            },
          });
        });
      });

      groupsRoot.querySelectorAll("[data-action='toggleItemMemo']").forEach((btn) => {
        btn.addEventListener("click", () => {
          const groupId = btn.dataset.groupId;
          const itemId = btn.dataset.itemId;

          toggleItemMemo(groupId, itemId);
        });
      });

      groupsRoot.querySelectorAll("[data-action='openItemMemoAndScroll']").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();

          const groupId = btn.dataset.groupId || "";
          const itemId = btn.dataset.itemId || "";

          openItemMemoAndScroll(groupId, itemId);
        });
      });

      groupsRoot
        .querySelectorAll("[data-action='copyItemMemoToConceptMemo']")
        .forEach((btn) => {
          btn.addEventListener("click", () => {
            const groupId = btn.dataset.groupId || "";
            const itemId = btn.dataset.itemId || "";

            const group = state.groups.find((g) => g.id === groupId);
            if (!group) return;

            const item = (Array.isArray(group.items) ? group.items : []).find(
              (entry) => entry.id === itemId,
            );
            if (!item || item.kind !== "entry") return;

            const memoBody = String(item?.memo?.body || "").trim();
            if (!memoBody) {
              setStatus("メモ本文が空のためコピーできません。", true);
              return;
            }

            vscode.postMessage({
              type: "createConceptMemoFromNoteItem",
              payload: {
                notePath: String(state?.filePath || ""),
                noteType: String(state?.type || state?.noteType || ""),
                noteTitle: String(titleInput?.value || state?.title || ""),
                groupId,
                groupTitle: String(group?.title || ""),
                itemId,
                heading: String(item?.heading || ""),
                memoBody: String(item?.memo?.body || ""),
                memoTags: Array.isArray(item?.memo?.tags) ? item.memo.tags : [],
              },
            });
          });
        });

      groupsRoot
        .querySelectorAll("[data-action='openLinkedConceptMemo']")
        .forEach((btn) => {
          btn.addEventListener("click", () => {
            const groupId = btn.dataset.groupId || "";
            const itemId = btn.dataset.itemId || "";

            const group = state.groups.find((g) => g.id === groupId);
            if (!group) return;

            const item = (Array.isArray(group.items) ? group.items : []).find(
              (entry) => entry.id === itemId,
            );
            if (!item || item.kind !== "entry") return;

            const linkedIds = Array.isArray(item?.memo?.linkedConceptMemoIds)
              ? item.memo.linkedConceptMemoIds
                  .map((id) => String(id || "").trim())
                  .filter(Boolean)
              : [];

            vscode.postMessage({
              type: "openConceptMemoFromNoteItem",
              payload: {
                notePath: String(state?.filePath || ""),
                noteType: String(state?.type || state?.noteType || ""),
                noteTitle: String(titleInput?.value || state?.title || ""),
                groupId,
                groupTitle: String(group?.title || ""),
                itemId,
                heading: String(item?.heading || ""),
                conceptMemoIds: linkedIds,
              },
            });
          });
        });

      groupsRoot
      .querySelectorAll("[data-action='openConceptMemoForCopyToItemMemo']")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const groupId = btn.dataset.groupId || "";
          const itemId = btn.dataset.itemId || "";

          vscode.postMessage({
            type: "openConceptMemoForCopy",
            payload: {
              targetType: "noteItemMemo",
              notePath: String(state?.filePath || ""),
              groupId,
              itemId,
              source: "itemMemo"
            },
          });
        });
      });

      groupsRoot
        .querySelectorAll("[data-action='openConceptMemoForCopyToItemBody']")
        .forEach((btn) => {
          btn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();

            const groupId = btn.dataset.groupId || "";
            const itemId = btn.dataset.itemId || "";

            openItemMoreMenuId = "";
            renderGroups();

            vscode.postMessage({
              type: "openConceptMemoForCopy",
              payload: {
                targetType: "itemBody",
                notePath: String(state?.filePath || ""),
                noteType: String(state?.type || state?.noteType || ""),
                noteTitle: String(titleInput?.value || state?.title || ""),
                groupId,
                itemId,
              },
            });
          });
        });

      groupsRoot
        .querySelectorAll("[data-action='clearItemMemo']")
        .forEach((btn) => {
          btn.addEventListener("click", () => {
            const groupId = btn.dataset.groupId || "";
            const itemId = btn.dataset.itemId || "";

            const group = state.groups.find((g) => g.id === groupId);
            if (!group) return;

            const item = (Array.isArray(group.items) ? group.items : []).find(
              (entry) => entry.id === itemId,
            );
            if (!item || item.kind !== "entry") return;

            if (!item.memo || typeof item.memo !== "object") {
              return;
            }

            item.memo = {
              ...item.memo,
              body: "",
              updatedAt: "",
              tags: [],
            };

            const linkedIds = Array.isArray(item.memo.linkedConceptMemoIds)
              ? item.memo.linkedConceptMemoIds
              : [];

            if (linkedIds.length) {
              vscode.postMessage({
                type: "markConceptMemoClearedFromNoteItem",
                payload: {
                  notePath: String(state?.filePath || ""),
                  groupId,
                  itemId,
                  conceptMemoIds: linkedIds,
                },
              });
            }

            markDirty();
            updateItemMemoMeta(item.id, "");
            renderGroups();
            renderPreview();
            suppressNextNoteSavedMessage = true;
            saveCurrentNote({ silentStatus: true });
            setStatus("項目メモをクリアしました。", true);
          });
        });

      groupsRoot.querySelectorAll("[data-action='toggleMovePicker']").forEach((btn) => {
        btn.addEventListener("click", () => {
          const groupId = btn.dataset.groupId;
          const itemId = btn.dataset.itemId;

          if (isMovePickerOpen(groupId, itemId)) {
            closeMovePicker();
            return;
          }

          openMovePicker(groupId, itemId);
        });
      });

      groupsRoot.querySelectorAll("[data-role='moveTargetGroup']").forEach((selectEl) => {
        selectEl.addEventListener("change", () => {
          const groupId = selectEl.dataset.groupId || "";
          const itemId = selectEl.dataset.itemId || "";
          const targetGroupId = selectEl.value || groupId;

          movePickerState = {
            groupId,
            itemId,
            targetGroupId,
            insertIndex: "",
          };

          renderGroups();
        });
      });

      groupsRoot.querySelectorAll("[data-role='moveTargetPosition']").forEach((selectEl) => {
        selectEl.addEventListener("change", () => {
          const groupId = selectEl.dataset.groupId || "";
          const itemId = selectEl.dataset.itemId || "";

          movePickerState = {
            ...movePickerState,
            groupId,
            itemId,
            insertIndex: selectEl.value || "",
          };
        });
      });

      groupsRoot.querySelectorAll("[data-action='closeMovePicker']").forEach((btn) => {
        btn.addEventListener("click", () => {
          closeMovePicker();
        });
      });

      groupsRoot.querySelectorAll("[data-action='confirmMoveItem']").forEach((btn) => {
        btn.addEventListener("click", () => {
          const groupId = btn.dataset.groupId || "";
          const itemId = btn.dataset.itemId || "";

          const targetGroupEl = groupsRoot.querySelector(
            \`[data-role="moveTargetGroup"][data-group-id="\${groupId}"][data-item-id="\${itemId}"]\`
          );

          const targetPositionEl = groupsRoot.querySelector(
            \`[data-role="moveTargetPosition"][data-group-id="\${groupId}"][data-item-id="\${itemId}"]\`
          );

          const targetGroupId = targetGroupEl?.value || "";
          const insertIndex = targetPositionEl?.value || "";

          if (!targetGroupId) {
            setStatus("移動先の大分類を選択してください。", true);
            return;
          }

          if (insertIndex === "") {
            setStatus("移動先の位置を選択してください。", true);
            return;
          }

          moveItemToPosition(groupId, itemId, targetGroupId, insertIndex);
        });
      });

      groupsRoot.querySelectorAll("[data-action='toggleGroup']").forEach((btn) => {
        btn.addEventListener("click", () => {
          const groupId = btn.dataset.groupId;
          toggleGroupCollapse(groupId);
        });
      });

      groupsRoot.querySelectorAll("[data-action='jumpGroupToPreview']").forEach((btn) => {
        btn.addEventListener("click", () => {
          const navId = btn.dataset.navId || "";
          if (!navId) return;

          scrollToPreviewNavId(navId);
        });
      });

      groupsRoot.querySelectorAll("[data-action='jumpItemToPreview']").forEach((btn) => {
        btn.addEventListener("click", () => {
          const navId = btn.dataset.navId || "";
          if (!navId) return;

          scrollToPreviewNavId(navId);
        });
      });

      groupsRoot.querySelectorAll(".itemBodyInput").forEach((el) => {
        const updateCursor = () => {
          lastCursorTarget = {
            targetType: "noteItemBody",
            groupId: String(el.dataset.groupId || ""),
            itemId: String(el.dataset.itemId || ""),
            start: Number(el.selectionStart ?? 0),
            end: Number(el.selectionEnd ?? 0),
          };
        };

        el.addEventListener("focus", updateCursor);
        el.addEventListener("click", updateCursor);
        el.addEventListener("keyup", updateCursor);
        el.addEventListener("select", updateCursor);
      });

      groupsRoot.querySelectorAll(".itemMemoBodyInput").forEach((el) => {
        const updateCursor = () => {
          lastCursorTarget = {
            targetType: "noteItemMemo",
            groupId: String(el.dataset.groupId || ""),
            itemId: String(el.dataset.itemId || ""),
            start: Number(el.selectionStart ?? 0),
            end: Number(el.selectionEnd ?? 0),
          };
        };

        el.addEventListener("focus", updateCursor);
        el.addEventListener("click", updateCursor);
        el.addEventListener("keyup", updateCursor);
        el.addEventListener("select", updateCursor);
      });
    }

    function addDivider(groupId) {
      const group = state.groups.find((g) => g.id === groupId);
      if (!group) return;

      group.items.push(createDivider());
      markDirty();
      renderGroups();
      renderPreview();
      setStatus("区分を追加しました。", true);
    }

    function insertItemAfter(groupId, afterItemId) {
      if (!groupId || !afterItemId) return;

      const group = state.groups.find((g) => g.id === groupId);
      if (!group) return;

      const items = Array.isArray(group.items) ? group.items : [];
      const targetIndex = items.findIndex((item) => item.id === afterItemId);
      if (targetIndex < 0) return;

      const newItem = createEntry();
      items.splice(targetIndex + 1, 0, newItem);

      collapsedGroupIds.delete(groupId);

      markDirty();
      renderGroups();
      renderPreview();
      setStatus("項目を追加しました。", true);

      requestAnimationFrame(() => {
        const headingEl = groupsRoot.querySelector(
          \`[data-field="itemHeading"][data-group-id="\${groupId}"][data-item-id="$\{newItem.id}"]\`
        );
        headingEl?.focus();
        headingEl?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }

    function insertDividerAfter(groupId, afterItemId) {
      if (!groupId || !afterItemId) return;

      const group = state.groups.find((g) => g.id === groupId);
      if (!group) return;

      const items = Array.isArray(group.items) ? group.items : [];
      const targetIndex = items.findIndex((item) => item.id === afterItemId);
      if (targetIndex < 0) return;

      const newDivider = createDivider();
      items.splice(targetIndex + 1, 0, newDivider);

      collapsedGroupIds.delete(groupId);

      markDirty();
      renderGroups();
      renderPreview();
      setStatus("区分を追加しました。", true);

      requestAnimationFrame(() => {
        const labelEl = groupsRoot.querySelector(
          \`[data-field="dividerLabel"][data-group-id="\${groupId}"][data-item-id="\${newDivider.id}"]\`
        );
        labelEl?.focus();
        labelEl?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }

    function addGroupAfter(groupId) {
      if (!groupId) return;

      const groups = Array.isArray(state.groups) ? state.groups : [];
      const targetIndex = groups.findIndex((group) => group.id === groupId);
      if (targetIndex < 0) return;

      const newGroup = createGroup();
      groups.splice(targetIndex + 1, 0, newGroup);

      collapsedGroupIds.delete(groupId);
      collapsedGroupIds.delete(newGroup.id);

      markDirty();
      renderGroups();
      renderPreview();
      setStatus("大分類を追加しました。", true);

      requestAnimationFrame(() => {
        const titleEl = groupsRoot.querySelector(
          \`[data-field="groupTitle"][data-group-id="\${newGroup.id}"]\`
        );
        titleEl?.focus();
        titleEl?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }

    function moveItemToPosition(sourceGroupId, itemId, targetGroupId, insertIndex) {
      if (!sourceGroupId || !itemId || !targetGroupId) return;

      const sourceGroup = state.groups.find((g) => g.id === sourceGroupId);
      const targetGroup = state.groups.find((g) => g.id === targetGroupId);

      if (!sourceGroup || !targetGroup) return;

      const sourceItems = Array.isArray(sourceGroup.items) ? [...sourceGroup.items] : [];
      const sourceIndex = sourceItems.findIndex((item) => item.id === itemId);
      if (sourceIndex < 0) return;

      const [movingItem] = sourceItems.splice(sourceIndex, 1);
      if (!movingItem) return;

      let targetItems;
      if (sourceGroupId === targetGroupId) {
        targetItems = sourceItems;
      } else {
        targetItems = Array.isArray(targetGroup.items) ? [...targetGroup.items] : [];
      }

      let targetIndex = Number(insertIndex);
      if (!Number.isInteger(targetIndex)) {
        setStatus("移動先の位置を選択してください。", true);
        return;
      }

      targetIndex = Math.max(0, Math.min(targetIndex, targetItems.length));
      targetItems.splice(targetIndex, 0, movingItem);

      if (sourceGroupId === targetGroupId) {
        sourceGroup.items = targetItems;
      } else {
        sourceGroup.items = sourceItems;
        targetGroup.items = targetItems;
        collapsedGroupIds.delete(targetGroupId);
      }

      movePickerState = {
        groupId: "",
        itemId: "",
        targetGroupId: "",
        insertIndex: "",
      };

      markDirty();
      renderGroups();
      renderPreview();

      const targetTitle = getGroupTitleForMove(
        targetGroup,
        state.groups.findIndex((g) => g.id === targetGroupId),
      );

      setStatus(\`「\${targetTitle}」内の選択位置へ移動しました。\`, true);

      requestAnimationFrame(() => {
        const movedEl = groupsRoot.querySelector(\`[data-nav-id="item:\${itemId}"]\`);
        movedEl?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }

    function moveGroup(groupId, direction) {
      const index = state.groups.findIndex((g) => g.id === groupId);
      if (index < 0) return;

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= state.groups.length) return;

      state.groups = moveArrayItem(state.groups, index, targetIndex);

      markDirty();
      renderGroups();
      renderPreview();
    }

    function moveItem(groupId, itemId, direction) {
      const group = state.groups.find((g) => g.id === groupId);
      if (!group) return;

      const items = Array.isArray(group.items) ? group.items : [];
      const index = items.findIndex((item) => item.id === itemId);
      if (index < 0) return;

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= items.length) return;

      group.items = moveArrayItem(items, index, targetIndex);

      markDirty();
      renderGroups();
      renderPreview();
    }

    function moveArrayItem(array, fromIndex, toIndex) {
      if (!Array.isArray(array)) return array;
      if (fromIndex < 0 || toIndex < 0) return array;
      if (fromIndex >= array.length || toIndex >= array.length) return array;

      const next = [...array];
      const temp = next[fromIndex];
      next[fromIndex] = next[toIndex];
      next[toIndex] = temp;
      return next;
    }

    function removeGroup(groupId) {
      const wasLastGroup = state.groups.length <= 1;

      if (wasLastGroup) {
        state.groups = [createGroup()];
      } else {
        state.groups = state.groups.filter((g) => g.id !== groupId);
      }

      collapsedGroupIds.delete(groupId);
      saveCollapsedGroups();

      markDirty();
      renderGroups();
      renderPreview();

      setStatus(
        wasLastGroup
          ? "最後の大分類を初期状態に戻しました。"
          : "大分類を削除しました。",
        true,
      );
    }

    function removeItem(groupId, itemId) {
      const group = state.groups.find((g) => g.id === groupId);
      if (!group) return;

      const items = Array.isArray(group.items) ? group.items : [];

      const targetItem = items.find((item) => item.id === itemId);
      if (!targetItem) return;

      const isDivider = targetItem.kind === "divider";

      const linkedIds = Array.isArray(targetItem?.memo?.linkedConceptMemoIds)
        ? targetItem.memo.linkedConceptMemoIds
        : [];

      if (linkedIds.length) {
        vscode.postMessage({
          type: "markConceptMemoMissingFromNoteItem",
          payload: {
            notePath: String(state?.filePath || ""),
            groupId,
            itemId,
            conceptMemoIds: linkedIds,
          },
        });
      }

      group.items = items.filter((item) => item.id !== itemId);

      markDirty();
      renderGroups();
      renderPreview();

      setStatus(isDivider ? "区分を削除しました。" : "項目を削除しました。", true);
    }
`;
}

module.exports = {
  getGroupsScript,
};
