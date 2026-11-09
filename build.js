// Build configuration for production optimization
// Run with: node build.js

import * as esbuild from 'esbuild';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { prepareBuildOutput } from './scripts/build-output.js';
import { collectPrecacheAssets } from './scripts/precache-assets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.argv.includes('--dev');
const watch = process.argv.includes('--watch');
const buildRev = process.env.BUILD_REV || (isDev ? 'dev' : String(Date.now()));

const config = {
  entryPoints: ['public/js/core/app.js'],
  bundle: true,
  format: 'esm',
  target: ['es2020', 'chrome90', 'firefox88', 'safari14'],
  outdir: 'dist',
  outbase: 'public',
  minify: !isDev,
  sourcemap: isDev ? 'inline' : false,
  splitting: true, // Enable code splitting
  chunkNames: 'chunks/[name]-[hash]',
  metafile: true,
  treeShaking: true,
  pure: ['console.log', 'console.debug'], // Remove in production
  define: {
    'process.env.NODE_ENV': isDev ? '"development"' : '"production"',
    __BUILD_REV__: JSON.stringify(buildRev),
  },
  loader: {
    '.js': 'js',
  },
  logLevel: 'info',
  plugins: [
    {
      name: 'service-worker-precache',
      setup(build) {
        // The worker is compiled after the app so it can embed the app's chunks.
        // Keep changes to its source in the watch graph too.
        build.onLoad({ filter: /[\\/]core[\\/]app\.js$/ }, async (args) => ({
          contents: await fs.readFile(args.path, 'utf8'),
          loader: 'js',
          resolveDir: path.dirname(args.path),
          watchFiles: [path.join(__dirname, 'public', 'sw.js')],
        }));
        build.onEnd(async (result) => {
          if (result.errors.length) return;
          const assets = await collectPrecacheAssets(
            result.metafile,
            path.join(__dirname, 'dist'),
            path.join(__dirname, 'public')
          );
          const worker = await esbuild.build({
            entryPoints: ['public/sw.js'],
            bundle: true,
            outfile: 'dist/sw.js',
            format: 'esm',
            target: config.target,
            minify: config.minify,
            sourcemap: config.sourcemap,
            metafile: true,
            define: { ...config.define, __PRECACHE_ASSETS__: JSON.stringify(assets) },
          });
          Object.assign(result.metafile.inputs, worker.metafile.inputs);
          Object.assign(result.metafile.outputs, worker.metafile.outputs);
        });
      },
    },
  ],
};

async function processCss() {
  const publicDir = path.join(__dirname, 'public');
  const distDir = path.join(__dirname, 'dist');

  console.log('Processing CSS with PostCSS...');

  // Read the consolidated main.css
  const cssPath = path.join(publicDir, 'css', 'main.css');
  const cssContent = await fs.readFile(cssPath, 'utf-8');

  // In production, minify with PostCSS
  if (!isDev) {
    const postcss = (await import('postcss')).default;
    const autoprefixer = (await import('autoprefixer')).default;
    const cssnano = (await import('cssnano')).default;

    const result = await postcss([autoprefixer, cssnano({ preset: 'default' })]).process(
      cssContent,
      { from: cssPath, to: path.join(distDir, 'css', 'main.css') }
    );

    await fs.mkdir(path.join(distDir, 'css'), { recursive: true });
    await fs.writeFile(path.join(distDir, 'css', 'main.css'), result.css);
    console.log('CSS minified and optimized');
  } else {
    // In dev mode, just copy
    await fs.mkdir(path.join(distDir, 'css'), { recursive: true });
    await fs.copyFile(cssPath, path.join(distDir, 'css', 'main.css'));
    console.log('CSS copied (dev mode)');
  }
}

async function copyPublicAssets() {
  const publicDir = path.join(__dirname, 'public');
  const distDir = path.join(__dirname, 'dist');

  // Ensure dist directory exists
  await fs.mkdir(distDir, { recursive: true });

  // Files to copy (non-JS and non-CSS files)
  const filesToCopy = [
    '_headers',
    '_redirects',
    '_routes.json',
    'manifest.json',
    '404.html',
    'openapi.json',
  ];

  // Copy files
  for (const file of filesToCopy) {
    const src = path.join(publicDir, file);
    const dest = path.join(distDir, file);
    await fs.copyFile(src, dest);
    console.log(`Copied: ${file}`);
  }

  // Copy directories
  const dirsToCopy = ['templates', 'img', 'css', 'js', 'data', 'pages'];
  for (const dir of dirsToCopy) {
    const src = path.join(publicDir, dir);
    const dest = path.join(distDir, dir);
    await fs.cp(src, dest, { recursive: true });
    console.log(`Copied directory: ${dir}`);
  }

  // Process after copying so the optimized stylesheet is not overwritten.
  await processCss();

  // Serve Swagger UI locally under the existing same-origin content policy.
  const swaggerDir = path.join(distDir, 'swagger');
  await fs.mkdir(swaggerDir, { recursive: true });
  for (const file of ['swagger-ui-bundle.js', 'swagger-ui.css', 'LICENSE', 'NOTICE']) {
    await fs.copyFile(
      path.join(__dirname, 'node_modules', 'swagger-ui-dist', file),
      path.join(swaggerDir, file)
    );
  }
  await fs.copyFile(
    path.join(publicDir, 'pages', 'swagger.html'),
    path.join(swaggerDir, 'index.html')
  );

  // Functions remain beside dist; a missing backend is a build error.
  await fs.access(path.join(__dirname, 'functions'));
  await copyAdminPage();
}

async function copyAdminPage() {
  const distDir = path.join(__dirname, 'dist');
  const adminDir = path.join(distDir, 'admin');
  await fs.mkdir(adminDir, { recursive: true });
  await fs.copyFile(path.join(distDir, 'pages', 'index.html'), path.join(adminDir, 'index.html'));
}

async function generateMetaReport(result) {
  if (!result.metafile) return;

  const metaPath = path.join(__dirname, 'dist', 'meta.json');
  await fs.writeFile(metaPath, JSON.stringify(result.metafile, null, 2));
  console.log('\nBuild analysis saved to dist/meta.json');

  // Print bundle sizes
  console.log('\nBundle sizes:');
  for (const [file, info] of Object.entries(result.metafile.outputs)) {
    const size = (info.bytes / 1024).toFixed(2);
    console.log(`  ${file.replace('dist/', '')}: ${size} KB`);
  }
}

async function build() {
  try {
    console.log(`Building in ${isDev ? 'development' : 'production'} mode...`);

    // Clean dist directory
    const distDir = path.join(__dirname, 'dist');
    await prepareBuildOutput(distDir, { keepChunks: process.argv.includes('--keep-chunks') });

    // Copy first: source JS must not overwrite esbuild's bundled entry points.
    await copyPublicAssets();

    // Build with esbuild
    if (watch) {
      const ctx = await esbuild.context(config);
      await ctx.watch();
      console.log('Watching for changes...');
    } else {
      const result = await esbuild.build(config);

      // Generate meta report
      await generateMetaReport(result);

      console.log('\nBuild completed successfully!');
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
