// Canvas rendering and post text; data loading and browser share actions stay in the app.
export function createProgressRendering({ state, elements, Image }) {
  let progressShareLogoPromise = null;

  function roundedRect(context, x, y, width, height, radius = 12) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(x + width - radius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + radius);
    context.lineTo(x + width, y + height - radius);
    context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    context.lineTo(x + radius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
    context.closePath();
  }

  function formatProgressNumber(value, signed = false) {
    const number = Number(value) || 0;
    return `${signed && number > 0 ? "+" : ""}${number.toLocaleString("ja-JP")}`;
  }

  function createProgressShareText(summary, options, mode = "daily") {
    const stats = summary?.stats || {};
    const work = summary?.work || {};
    const period = summary?.period || {};
    const isToday = period.date === state.progressSummaries?.today?.period?.date;
    const dateParts = String(period.date || "").split("-");
    const dateLabel = dateParts.length === 3
      ? `${Number(dateParts[0])}/${Number(dateParts[1])}/${Number(dateParts[2])}`
      : String(period.date || "-");
    if (mode === "annual") {
      const yearLabel = String(dateParts[0] || "-");
      const lines = [`${yearLabel}年の作品全体まとめ`];
      lines.push(`年間の執筆 ${formatProgressNumber(stats.yearCharacters, true)}文字`);
      if (options.annualWorks) (summary.annualWorkBreakdown || []).forEach((row) => lines.push(`${row.title} ${formatProgressNumber(row.characters, true)}文字`));
      if (options.notes && stats.notesUpdatedThisYear) lines.push(`年間のノート更新 ${formatProgressNumber(stats.notesUpdatedThisYear)}件`);
      if (options.concepts && stats.conceptMemosUpdatedThisYear) lines.push(`年間の構想メモ更新 ${formatProgressNumber(stats.conceptMemosUpdatedThisYear)}件`);
      lines.push("", "#もじごと");
      return lines.join("\n");
    }
    if (mode === "monthly") {
      const monthLabel = `${Number(dateParts[0])}/${Number(dateParts[1])}`;
      const lines = [`${monthLabel}の作品全体まとめ`];
      lines.push(`今月の執筆 ${formatProgressNumber(stats.monthCharacters, true)}文字`);
      if (options.works) summary.workBreakdown.forEach((row) => lines.push(`${row.title} ${formatProgressNumber(row.characters, true)}文字`));
      if (options.notes && stats.notesUpdatedThisMonth) lines.push(`ノート更新 ${formatProgressNumber(stats.notesUpdatedThisMonth)}件`);
      if (options.concepts && stats.conceptMemosUpdatedThisMonth) lines.push(`構想メモ更新 ${formatProgressNumber(stats.conceptMemosUpdatedThisMonth)}件`);
      lines.push("", "#もじごと");
      return lines.join("\n");
    }
    const lines = [`${dateLabel}の執筆進捗`];
    if (options.title && work.title) lines.push(`『${String(work.title).trim()}』`);
    if (options.today) lines.push(`${isToday ? "今日" : "当日"} ${formatProgressNumber(stats.todayCharacters, true)}文字`);
    if (options.week) lines.push(`7日間 ${formatProgressNumber(stats.last7DaysCharacters, true)}文字`);
    if (options.total) lines.push(`総文字数 ${formatProgressNumber(stats.totalCharacters)}文字`);
    if (options.notes) lines.push(`ノート更新 ${formatProgressNumber(stats.notesUpdatedToday)}件`);
    if (options.concepts) lines.push(`構想メモ更新 ${formatProgressNumber(stats.conceptMemosUpdatedToday)}件`);
    lines.push("", "#もじごと");
    return lines.join("\n");
  }

  function fitProgressTitle(context, title, maxWidth) {
    let text = String(title || "作品名未設定");
    while (text.length > 1 && context.measureText(text).width > maxWidth) text = `${text.slice(0, -2)}…`;
    return text;
  }

  function progressCanvasTextLines(context, text, maxWidth, maxLines) {
    const characters = Array.from(String(text || ""));
    const lines = [];
    let line = "";
    characters.forEach((character) => {
      const next = line + character;
      if (line && context.measureText(next).width > maxWidth) {
        lines.push(line);
        line = character;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    const limited = lines.slice(0, maxLines);
    if (lines.length > maxLines && limited.length) {
      let last = limited[limited.length - 1];
      while (last && context.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
      limited[limited.length - 1] = `${last}…`;
    }
    return limited;
  }

  function loadProgressShareLogo() {
    if (!progressShareLogoPromise) {
      progressShareLogoPromise = new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = "./logo.png";
      });
    }
    return progressShareLogoPromise;
  }

  async function drawProgressShareImage(summary, options, mode = "daily") {
    const canvas = elements.progressShareCanvas;
    canvas.width = 720;
    canvas.height = 1000;
    let context = canvas.getContext("2d");
    if (!context) throw new Error("Canvasを初期化できませんでした。");
    const padding = 34;
    const monthlyMode = mode === "monthly";
    const annualMode = mode === "annual";
    const metrics = (annualMode ? [
      ["年間の執筆", summary.stats.yearCharacters, "文字", true],
      options.notes && summary.stats.notesUpdatedThisYear > 0 && ["年間のノート更新", summary.stats.notesUpdatedThisYear, "件", false],
      options.concepts && summary.stats.conceptMemosUpdatedThisYear > 0 && ["年間の構想メモ更新", summary.stats.conceptMemosUpdatedThisYear, "件", false],
    ] : monthlyMode ? [
      ["今月の執筆", summary.stats.monthCharacters, "文字", true],
      options.notes && summary.stats.notesUpdatedThisMonth > 0 && ["ノート更新", summary.stats.notesUpdatedThisMonth, "件", false],
      options.concepts && summary.stats.conceptMemosUpdatedThisMonth > 0 && ["構想メモ更新", summary.stats.conceptMemosUpdatedThisMonth, "件", false],
    ] : [
      options.total && ["総文字数", summary.stats.totalCharacters, "文字", false],
      options.today && [summary.period.date === state.progressSummaries?.today?.period?.date ? "今日" : "当日", summary.stats.todayCharacters, "文字", true],
      options.week && ["7日間", summary.stats.last7DaysCharacters, "文字", true],
      options.notes && ["ノート更新", summary.stats.notesUpdatedToday, "件", false],
      options.concepts && ["構想メモ更新", summary.stats.conceptMemosUpdatedToday, "件", false],
    ]).filter(Boolean);
    const titleLines = (annualMode || monthlyMode || options.title) && summary.work.title
      ? (() => {
          context.font = '700 31px system-ui, -apple-system, "Segoe UI", sans-serif';
          return progressCanvasTextLines(context, summary.work.title, canvas.width - padding * 2, 2);
        })()
      : [];
    const columns = Math.min(2, Math.max(1, metrics.length));
    const metricRows = metrics.length ? Math.ceil(metrics.length / columns) : 0;
    const titleHeight = titleLines.length ? titleLines.length * 44 + 18 : 0;
    const graphBlockHeight = options.graph ? 248 : 0;
    const breakdown = annualMode && options.annualWorks
      ? (summary.annualWorkBreakdown || []).filter((row) => Number(row.characters) !== 0)
      : monthlyMode && options.works
        ? summary.workBreakdown.filter((row) => Number(row.characters) !== 0)
        : [];
    const breakdownHeight = breakdown.length ? 48 + breakdown.length * 48 : 0;
    const sectionGap = (titleHeight && graphBlockHeight ? 18 : 0)
      + ((titleHeight || graphBlockHeight) && metricRows ? 20 : 0);
    const metricsHeight = metricRows ? metricRows * 126 + (metricRows - 1) * 14 : 0;
    const contentAreaTop = 108;
    const contentHeight = titleHeight + graphBlockHeight + sectionGap + metricsHeight + (breakdownHeight ? breakdownHeight + 20 : 0);
    canvas.height = Math.max(520, Math.ceil(contentAreaTop + contentHeight + 82));
    context = canvas.getContext("2d");
    if (!context) throw new Error("Canvasを初期化できませんでした。");
    context.fillStyle = "#f7fafb";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#c9dce3";
    context.lineWidth = 2;
    context.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
  
    const logo = await loadProgressShareLogo();
    if (logo) context.drawImage(logo, padding + 11, 45, 38, 38);
    context.fillStyle = "#1a5d78";
    context.font = '800 22px system-ui, -apple-system, "Segoe UI", sans-serif';
    context.textBaseline = "middle";
    context.fillText("もじごと", padding + 78, 64);
    context.fillStyle = "#456d7b";
    context.textAlign = "right";
    context.font = '500 19px system-ui, -apple-system, "Segoe UI", sans-serif';
    const dateParts = String(summary.period.date || "").split("-");
    const dateLabel = dateParts.length === 3
      ? annualMode ? `${Number(dateParts[0])} 年間` : monthlyMode ? `${Number(dateParts[0])}/${Number(dateParts[1])} 月間` : `${Number(dateParts[0])}/${Number(dateParts[1])}/${Number(dateParts[2])}`
      : String(summary.period.date || "-");
    context.fillText(dateLabel, canvas.width - padding, 64);
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
  
    let y = contentAreaTop;
    if (titleLines.length) {
      context.fillStyle = "#123f52";
      context.font = '700 31px system-ui, -apple-system, "Segoe UI", sans-serif';
      titleLines.forEach((line, index) => context.fillText(line, padding, y + 31 + index * 44));
      y += titleHeight;
      if (options.graph) y += 18;
      else if (metricRows) y += 20;
    }
    if (options.graph) {
      context.fillStyle = "#456d7b";
      context.font = '700 17px system-ui, -apple-system, "Segoe UI", sans-serif';
      context.fillText(annualMode ? `${Number(dateParts[0])}年 1～12月の執筆` : monthlyMode ? "直近6か月の執筆" : "直近7日の執筆", padding, y + 17);
      const boxY = y + 34;
      const boxWidth = canvas.width - padding * 2;
      const boxHeight = 214;
      context.fillStyle = "#eef5f7";
      roundedRect(context, padding, boxY, boxWidth, boxHeight, 20);
      context.fill();
      const graphRows = annualMode ? summary.annual : monthlyMode ? summary.monthly : summary.daily;
      if (!Array.isArray(graphRows)) {
        throw new Error("進捗グラフを更新できませんでした。ページを再読み込みして、もう一度お試しください。");
      }
      const max = Math.max(1, ...graphRows.map((row) => Math.abs(row.characters)));
      const slotWidth = boxWidth / graphRows.length;
      graphRows.forEach((row, index) => {
        const value = Number(row.characters || 0);
        const centerX = padding + slotWidth * index + slotWidth / 2;
        const barHeight = value === 0 ? 3 : Math.max(10, (Math.abs(value) / max) * 108);
        context.textAlign = "center";
        context.fillStyle = "#456d7b";
        context.font = `500 ${annualMode ? 11 : 13}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        context.fillText(formatProgressNumber(value, true), centerX, boxY + 27);
        context.fillStyle = value < 0 ? "#8b4c58" : "#005990";
        const barWidth = annualMode ? 20 : 28;
        context.fillRect(centerX - barWidth / 2, boxY + 164 - barHeight, barWidth, barHeight);
        context.fillStyle = "#456d7b";
        context.fillText(annualMode || monthlyMode ? `${Number(row.month.slice(5))}月` : row.date.slice(5).replace("-", "/"), centerX, boxY + 194);
      });
      context.textAlign = "left";
      y += graphBlockHeight;
      if (metricRows) y += 20;
    }
    const gap = 18;
    const metricWidth = (canvas.width - padding * 2 - gap * (columns - 1)) / columns;
    const metricHeight = 126;
    metrics.forEach(([label, value, unit, signed], index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = padding + column * (metricWidth + gap);
      const cardY = y + row * (metricHeight + 14);
      context.fillStyle = "#fff";
      context.strokeStyle = "#c9dce3";
      roundedRect(context, x, cardY, metricWidth, metricHeight, 18);
      context.fill();
      context.stroke();
      context.fillStyle = "#456d7b";
      context.font = '700 16px system-ui, -apple-system, "Segoe UI", sans-serif';
      context.fillText(label, x + 20, cardY + 29);
      context.fillStyle = "#005990";
      context.font = '700 31px system-ui, -apple-system, "Segoe UI", sans-serif';
      context.fillText(formatProgressNumber(value, signed), x + 20, cardY + 70);
      context.fillStyle = "#456d7b";
      context.font = '500 15px system-ui, -apple-system, "Segoe UI", sans-serif';
      context.fillText(unit, x + 20, cardY + 99);
    });
    if (breakdown.length) {
      y += metricsHeight + (metricRows ? 20 : 0);
      context.fillStyle = "#456d7b";
      context.font = '700 17px system-ui, -apple-system, "Segoe UI", sans-serif';
      context.fillText(annualMode ? "作品ごとの年間差分" : "作品ごとの月間差分", padding, y + 18);
      breakdown.forEach((item, index) => {
        const rowY = y + 42 + index * 48;
        context.fillStyle = "#123f52";
        context.font = '600 16px system-ui, -apple-system, "Segoe UI", sans-serif';
        context.fillText(fitProgressTitle(context, item.title, canvas.width - padding * 2 - 160), padding, rowY);
        context.textAlign = "right";
        context.fillStyle = "#005990";
        context.font = '700 18px system-ui, -apple-system, "Segoe UI", sans-serif';
        context.fillText(`${formatProgressNumber(item.characters, true)}文字`, canvas.width - padding, rowY);
        context.textAlign = "left";
      });
    }
    context.textAlign = "right";
    context.fillStyle = "#1a5d78";
    context.font = '700 17px system-ui, -apple-system, "Segoe UI", sans-serif';
    context.fillText("#もじごと", canvas.width - padding, canvas.height - 30);
    context.textAlign = "left";
  }
  return { roundedRect, formatProgressNumber, createProgressShareText, fitProgressTitle, progressCanvasTextLines, loadProgressShareLogo, drawProgressShareImage };
}
