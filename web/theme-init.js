(() => {
  const value = localStorage.getItem("mojigoto.web.theme");
  const themes = ["system", "light", "beige", "green", "dark", "navy", "deep-green"];
  const theme = themes.includes(value) ? value : "system";
  const darkThemes = new Set(["dark", "navy", "deep-green"]);
  const dark = darkThemes.has(theme) || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.colorScheme = dark ? "dark" : "light";
  document.documentElement.dataset.writingFont = localStorage.getItem("mojigoto.web.writingFont") === "gothic" ? "gothic" : "mincho";
})();
