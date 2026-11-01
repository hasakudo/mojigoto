const DEFAULT_CONFIG = Object.freeze({
  deploymentMode: "personal",
  microsoftClientId: "",
  googleClientId: "",
  googleApiKey: "",
  googleAppId: "",
  dropboxClientId: "",
  loginRequired: false,
  authApiBase: "",
  loginProviders: ["microsoft", "google"],
});

export function normalizeRuntimeConfig(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    deploymentMode: source.deploymentMode === "managed" ? "managed" : "personal",
    microsoftClientId: String(source.microsoftClientId || "").trim(),
    googleClientId: String(source.googleClientId || "").trim(),
    googleApiKey: String(source.googleApiKey || "").trim(),
    googleAppId: String(source.googleAppId || "").trim(),
    dropboxClientId: String(source.dropboxClientId || "").trim(),
    loginRequired: source.loginRequired === true,
    authApiBase: String(source.authApiBase || "").trim(),
    loginProviders: Array.isArray(source.loginProviders)
      ? [...new Set(source.loginProviders.filter((provider) => ["microsoft", "google", "email"].includes(provider)))]
      : ["microsoft", "google"],
  };
}

export async function loadRuntimeConfig(request = globalThis.fetch?.bind(globalThis)) {
  if (typeof request !== "function") return { ...DEFAULT_CONFIG };
  try {
    const response = await request("./config.json", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return { ...DEFAULT_CONFIG };
    return normalizeRuntimeConfig(await response.json());
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function resolveMicrosoftClientId(config, storage) {
  const managedId = String(config?.microsoftClientId || "").trim();
  if (managedId) return managedId;
  if (config?.deploymentMode === "managed") return "";
  return String(storage?.getItem?.("mojigoto.microsoft.clientId") || "").trim();
}

export function resolveGoogleClientId(config) {
  return String(config?.googleClientId || "").trim();
}

export function isManagedDeployment(config) {
  return config?.deploymentMode === "managed";
}
