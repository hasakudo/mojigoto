const { escapeHtml } = require("../core/path-utils");

function convertNoteInlineMarkupToHtml(text) {
  let value = String(text || "");
  const tokens = [];

  function keep(html) {
    const key = `\uE000MOJIGOTO_NOTE_${tokens.length}\uE001`;
    tokens.push({ key, html });
    return key;
  }

  value = value.replace(/《《(.*?)》》/g, (_, body) =>
    keep(`<span class="noteBouten">${escapeHtml(body)}</span>`),
  );

  value = value.replace(
    /(?:\||｜)([^《\n]+?)《([^》\n]+?)》/g,
    (_, base, ruby) => keep(renderRubyHtml(base, ruby)),
  );

  value = value.replace(
    /([一-龠々〆ヵヶぁ-んァ-ヴーA-Za-z0-9]+)《([^》\n]+?)》/g,
    (_, base, ruby) => keep(renderRubyHtml(base, ruby)),
  );

  value = escapeHtml(value);

  for (const token of tokens) {
    value = value.replace(token.key, token.html);
  }

  return value;
}

function renderRubyHtml(base, ruby) {
  return `<ruby>${escapeHtml(base)}<rp>（</rp><rt>${escapeHtml(ruby)}</rt><rp>）</rp></ruby>`;
}

function renderNoteEntryHeadingHtml(item) {
  const heading = String(item?.heading || "").trim();
  if (!heading) return "";

  const headingRuby = String(item?.headingRuby || "").trim();
  if (headingRuby) {
    return renderRubyHtml(heading, headingRuby);
  }

  return convertNoteInlineMarkupToHtml(heading);
}

module.exports = {
  convertNoteInlineMarkupToHtml,
  renderNoteEntryHeadingHtml,
};
