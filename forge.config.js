const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const {
  AutoUnpackNativesPlugin,
} = require('@electron-forge/plugin-auto-unpack-natives');
const { join, dirname } = require('path');
const { copy, mkdirs } = require('fs-extra');

module.exports = {
  packagerConfig: {
    asar: {
      unpack: '**/*.{node,dll}',
    },
  },
  rebuildConfig: {
    onlyModules: ['better-sqlite3'],
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {},
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    new AutoUnpackNativesPlugin({
      moduleNames: ['better-sqlite3'],
    }),
    {
      name: '@electron-forge/plugin-vite',
      config: {
        // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
        // If you are familiar with Vite configuration, it will look really familiar.
        //
        // IMPORTANT: The @electron-forge/plugin-vite requires explicit entry declarations.
        // Glob patterns are not supported. When adding new files to src/main/, you must:
        // 1. Add a new entry object to this build array
        // 2. Specify the correct entry path, config, and target
        // 3. Ensure the file is imported/required somewhere in the main process chain
        build: [
          {
            entry: 'src/main/main.js',
            config: 'vite.main.config.mjs',
            target: 'main',
          },
          {
            entry: 'src/main/constants.js',
            config: 'vite.main.config.mjs',
            target: 'main',
          },
          {
            entry: 'src/main/database.js',
            config: 'vite.main.config.mjs',
            target: 'main',
          },
          {
            entry: 'src/main/media-scanner.js',
            config: 'vite.main.config.mjs',
            target: 'main',
          },
          {
            entry: 'src/main/local-server.js',
            config: 'vite.main.config.mjs',
            target: 'main',
          },
          {
            entry: 'src/main/database-worker.js',
            config: 'vite.main.config.mjs',
            target: 'main',
          },
          {
            entry: 'src/preload/preload.js',
            config: 'vite.preload.config.mjs',
            target: 'preload',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.mjs',
          },
        ],
      },
    },
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
  hooks: {
    packageAfterCopy: async (
      config,
      buildPath,
      electronVersion,
      platform,
      arch,
    ) => {
      console.log(
        'Running packageAfterCopy hook to copy worker dependencies...',
      );
      // IMPORTANT: This list must be kept in sync with dependencies used by database-worker.js
      // Currently, database-worker.js requires:
      // - better-sqlite3: SQLite database interface (main dependency)
      // - bindings: Native addon loader (required by better-sqlite3)
      // - file-uri-to-path: File URI utilities (required by bindings)
      //
      // If you modify database-worker.js to use additional packages, add them here.
      // To identify new dependencies, check:
      // 1. Direct requires/imports in database-worker.js
      // 2. Dependencies of those packages (check their package.json)
      const requiredWorkerPackages = [
        'better-sqlite3',
        'bindings',
        'file-uri-to-path',
      ];

      const sourceNodeModulesPath = join(process.cwd(), 'node_modules');
      const destNodeModulesPath = join(buildPath, 'node_modules');

      for (const packageName of requiredWorkerPackages) {
        const sourcePath = join(sourceNodeModulesPath, packageName);
        const destPath = join(destNodeModulesPath, packageName);

        console.log(`Copying ${sourcePath} to ${destPath}`);
        await mkdirs(dirname(destPath)); // Ensure parent dir exists
        await copy(sourcePath, destPath, {
          recursive: true,
          preserveTimestamps: true,
        });
      }
      console.log('Finished copying worker dependencies.');
    },
  },
};
