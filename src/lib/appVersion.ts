import packageJson from "../../package.json";

export const appVersion = packageJson.version;
export const appReleaseDate = packageJson.releaseDate;
export const appReleaseLabel = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeZone: "UTC",
}).format(new Date(`${appReleaseDate}T12:00:00Z`));
export const installerName = `CutPro-Studio-Setup-${appVersion}-x64.exe`;
