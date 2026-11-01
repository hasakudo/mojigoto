function getDisplayStyles(css) {
  return `${css}
    body { padding:16px; overflow:hidden; height:100vh; box-sizing:border-box; display:flex; flex-direction:column; }
    .noteDisplayHeader { flex:none; padding-bottom:12px; border-bottom:1px solid var(--vscode-panel-border); }
    .noteDisplayHeader h1 { font-size:18px; margin:8px 0; }
    #displayContent { flex:1; min-height:0; overflow:auto; padding-top:12px; }
    #displayContent.noteBoardRoot { display:flex; height:auto; }
    #displayContent .noteBoardColumn { height:100%; flex:0 0 300px; }
    #displayContent .noteBoardCard { padding:12px; }
    #displayContent h4 { margin:0 0 8px; }
    #displayContent .noteBoardCard > summary { font-weight:700; cursor:pointer; margin-bottom:8px; }
    #displayContent .noteDisplayImages { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0; }
    #displayContent .noteDisplayImages figure { display:flex; align-items:center; justify-content:center; width:128px; max-width:100%; height:96px; box-sizing:border-box; padding:4px; margin:0; border:1px solid var(--vscode-panel-border); border-radius:6px; }
    #displayContent .noteDisplayImages img { display:block; max-width:100%; max-height:100%; width:auto; height:auto; object-fit:contain; }
    .noteDisplayThumbnail { display:flex; align-items:center; justify-content:center; width:100%; height:100%; padding:0; border:0; background:transparent; cursor:zoom-in; }
    #displayImageModal { max-width:94vw; max-height:90vh; box-sizing:border-box; overflow:auto; padding:16px; border:1px solid var(--vscode-panel-border); border-radius:8px; color:var(--vscode-editor-foreground); background:var(--vscode-editor-background); }
    #displayImageModal::backdrop { background:rgba(0,0,0,.55); }
    #displayImageModal header { display:flex; align-items:center; justify-content:space-between; gap:16px; }
    #displayImageModal h2 { font-size:16px; margin:0; }
    #displayImageLarge { display:block; max-width:min(86vw,1200px); max-height:70vh; width:auto; height:auto; object-fit:contain; margin:12px auto; }
    #displayImageCaption { overflow-wrap:anywhere; margin:0; }
    .noteDisplayMemo { margin-top:10px; }
    #displayContent > .previewGroup > summary { font-weight:700; cursor:pointer; padding:10px; }
    #displayWarning { white-space:pre-wrap; color:var(--vscode-errorForeground); }
    .noteDisplayLayout { display:flex; flex:1; min-height:0; gap:12px; position:relative; }
    .noteDisplayTools { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px 12px; flex:none; }
    .noteDisplayMemoTools { display:flex; flex-wrap:wrap; gap:6px; margin:8px 0; }
    .noteDisplayList .noteDisplayLayout, .noteDisplayList .noteDisplayTools { width:100%; max-width:1040px; align-self:center; }
    .noteDisplayList .noteDisplayLayout { justify-content:center; }
    .noteDisplayList #displayContent { max-width:760px; }
    #displayContent { min-width:0; }
    #displayToc { order:2; flex:0 0 min(240px, 35vw); overflow:auto; padding:12px 0 8px 8px; border-left:1px solid var(--vscode-panel-border); }
    #displayToc[hidden] { display:none; }
    #displayToc ul { padding-left:18px; list-style:none; }
    #displayToc button { display:inline; text-align:left; white-space:normal; overflow-wrap:anywhere; border:0; background:transparent; color:var(--vscode-textLink-foreground); padding:4px; cursor:pointer; }
    #displayToc summary { cursor:pointer; }
    #displayTocToggle { flex:none; align-self:flex-start; margin:8px 0 8px auto; }
    #displayNavigationStatus { flex:none; margin:0 0 8px; }
    @media (max-width:600px) { #displayToc { position:absolute; right:0; top:0; bottom:0; width:min(240px,75%); background:var(--vscode-editor-background); z-index:2; box-sizing:border-box; } }`;
}

module.exports = { getDisplayStyles };
