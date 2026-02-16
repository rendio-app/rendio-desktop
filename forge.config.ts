import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { VitePlugin } from "@electron-forge/plugin-vite";
import type { ForgeConfig } from "@electron-forge/shared-types";

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: "./icon",
    appBundleId: "pro.rendio.rendio",
    extraResource: [
      "./src/assets/iconTemplate.png",
      "./src/assets/iconTemplate@2x.png",
    ],
    extendInfo: {
      NSAppleEventsUsageDescription:
        "This app needs to control System Events to capture selected text.",
      LSUIElement: true,
    },
  },
  hooks: {
    postPackage: async (_config, options) => {
      if (options.platform !== "darwin") return;
      const outDir = options.outputPaths[0];
      const appBundle = readdirSync(outDir).find((f) => f.endsWith(".app"));
      if (!appBundle) return;
      const appPath = `${outDir}/${appBundle}`;
      console.log(`Signing ${appPath} ...`);
      execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath]);
      console.log("Ad-hoc signing complete.");
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ["darwin"]),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: "src/main.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.mts",
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
