import rootPkg from "../../package.json" with { type: "json" };

export const PKG_VERSION: string = rootPkg.version;
export const GH = "https://github.com/wookat/witness";
export const SITE_URL = "https://witness.zalize.com";
export const STATS = {
  tracks: 3,
  mcpTools: 15,
  cloudKeys: 0,
  testsGreen: 37,
  license: "MIT",
} as const;
