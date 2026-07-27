const {
  buildMergedManuscriptBlocks,
  resolveMergedManuscriptHtmlOptions,
} = require("./merged-manuscript-core");

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function convertMojigotoInlineToWordHtml(text) {
  let value = String(text || "");
  const tokens = [];

  function keep(html) {
    const key = `__MOJIGOTO_WORD_INLINE_${tokens.length}__`;
    tokens.push({ key, html });
    return key;
  }

  function renderWordBoutenRuby(body) {
    const chars = [...String(body || "")];
    return chars
      .map((ch) => {
        if (ch === "\n") return "\n";
        return keep(`<ruby><rb>${escapeHtml(ch)}</rb><rt>・</rt></ruby>`);
      })
      .join("");
  }

  value = value.replace(/《《(.*?)》》/g, (_, body) => {
    return renderWordBoutenRuby(body);
  });

  value = value.replace(
    /(?:\||｜)([^《\n]+?)《([^》\n]+?)》/g,
    (_, base, ruby) => {
      return keep(
        `<ruby><rb>${escapeHtml(base)}</rb><rt>${escapeHtml(ruby)}</rt></ruby>`,
      );
    },
  );

  value = value.replace(
    /([一-龠々〆ヵヶぁ-んァ-ヴーA-Za-z0-9]+)《([^》\n]+?)》/g,
    (_, base, ruby) => {
      return keep(
        `<ruby><rb>${escapeHtml(base)}</rb><rt>${escapeHtml(ruby)}</rt></ruby>`,
      );
    },
  );

  value = escapeHtml(value);
  value = value.replace(/\n/g, "<br>");

  for (const token of tokens) {
    value = value.replaceAll(token.key, token.html);
  }

  return value;
}

function renderMergedManuscriptWordBody(blocks, options = {}) {
  const list = Array.isArray(blocks) ? blocks : [];
  let heading1Count = 0;

  return `<div class="wordBody">
${list
  .map((block) => {
    if (!block) return "";

    if (block.type === "blank") {
      return `<div class="wordBlank"></div>`;
    }

    if (block.type === "heading1") {
      heading1Count += 1;
      return `<h1 class="wordHeading1${heading1Count === 1 ? " isFirst" : ""}">${convertMojigotoInlineToWordHtml(block.text || "")}</h1>`;
    }

    if (block.type === "heading2") {
      return `<h2 class="wordHeading2">${convertMojigotoInlineToWordHtml(block.text || "")}</h2>`;
    }

    if (block.type === "heading3") {
      return `<h3 class="wordHeading3">${convertMojigotoInlineToWordHtml(block.text || "")}</h3>`;
    }

    if (block.type === "paragraph") {
      return `<p class="wordParagraph">${convertMojigotoInlineToWordHtml(block.text || "")}</p>`;
    }

    return "";
  })
  .filter(Boolean)
  .join("\n")}
</div>`;
}

function getMergedManuscriptWordHtmlStyle(options = {}) {
  const fontSizePx = Number(options.fontSizePx || 17);
  const fontFamily = String(options.fontFamily || "serif");
  const wordTextWidthEm = Number(options.wordTextWidthEm || 42);

  return `
body {
  margin: 0;
  font-family: "${fontFamily}";
  line-height: 1.9;
  color: #222;
  background: #fff;
}

.exportDocument {
  box-sizing: border-box;
  width: 100%;
  max-width: calc(${wordTextWidthEm}em + 56px);
  margin: 0 auto;
  padding: 24px 28px 32px;
}

.wordBody {
  width: 100%;
  max-width: ${wordTextWidthEm}em;
  margin: 0 auto;
}

.wordHeading1,
.wordHeading2,
.wordHeading3 {
  page-break-after: avoid;
  break-after: avoid;
  margin: 0;
  line-height: 1.5;
}

.wordParagraph {
  margin: 0;
  line-height: 1.9;
}

.wordBlank {
  height: 1em;
}
  
ruby {
  line-height: 1.5;
}

ruby rt {
  font-size: 0.35em;
  line-height: 0.5;
}

@media print {
  body {
    margin: 0;
    background: #fff;
    color: #000;
    font-size: ${fontSizePx}px;
  }

  .exportDocument {
    max-width: none;
    margin: 0;
    padding: 12mm 14mm 14mm;
  }

  .wordBody {
    max-width: ${wordTextWidthEm}em;
    margin: 0 auto;
  }

  .wordHeading1,
  .wordHeading2,
  .wordHeading3,
  .wordParagraph {
    orphans: 1;
    widows: 1;
  }

  .wordHeading1 {
    margin: 0 0 1em;
    font-size: 1.4em;
    line-height: 1.5;
  }

  .wordHeading1.isFirst {
    margin-top: 0;
  }

  .wordHeading2 {
    margin: 0.9em 0;
    font-size: 1.2em;
    line-height: 1.5;
  }

  .wordHeading3 {
    margin: 0.8em 0;
    font-size: 1.1em;
    line-height: 1.5;
  }

  ruby rt {
    font-size: 0.55em;
    line-height: 1;
  }
}
`.trim();
}

function renderMergedManuscriptWordHtml(mergedData, options = {}) {
  const title = String(mergedData?.workName || "作品");
  const htmlOptions = resolveMergedManuscriptHtmlOptions(mergedData, {
    ...options,
    htmlDirection: "horizontal",
  });
  const blocks = buildMergedManuscriptBlocks(mergedData, options);
  const bodyHtml = renderMergedManuscriptWordBody(blocks, htmlOptions);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
${getMergedManuscriptWordHtmlStyle(htmlOptions)}
</style>
</head>
<body>
<main class="exportDocument">
  ${
    htmlOptions.showTitle
      ? `<div class="exportTitle">${escapeHtml(title)}</div>`
      : ""
  }
  ${bodyHtml}
</main>
</body>
</html>`;
}

module.exports = {
  renderMergedManuscriptWordHtml,
};
