// Build configuration for production optimization
// Run with: node build.js

import * as esbuild from 'esbuild';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.argv.includes('--dev');
const watch = process.argv.includes('--watch');
const buildRev = process.env.BUILD_REV || (isDev ? 'dev' : String(Date.now()));

const config = {
  entryPoints: [
    'public/js/core/app.js',
    'public/sw.js',
    'public/js/utils/config.js',
    'public/js/loaders/image-loader.js',
    'public/js/features/pwa-install.js',
  ],
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
    try {
      await fs.copyFile(src, dest);
      console.log(`Copied: ${file}`);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(`Error copying ${file}:`, err);
      }
    }
  }

  // Copy directories
  const dirsToCopy = ['templates', 'img', 'css', 'js', 'data', 'pages'];
  for (const dir of dirsToCopy) {
    const src = path.join(publicDir, dir);
    const dest = path.join(distDir, dir);
    try {
      await fs.cp(src, dest, { recursive: true });
      console.log(`Copied directory: ${dir}`);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(`Error copying ${dir}:`, err);
      }
    }
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

  // Copy functions directory to root (not inside dist)
  const functionsDir = path.join(__dirname, 'functions');
  // Functions are already in the right place, just ensure they exist
  try {
    await fs.access(functionsDir);
    console.log('Functions directory verified');
  } catch {
    console.error('Warning: functions directory not found');
  }
}

async function updateHtmlReferences() {
  if (isDev) return; // Skip in dev mode

  const htmlPath = path.join(__dirname, 'dist', 'pages', 'index.html');
  let html = await fs.readFile(htmlPath, 'utf-8');

  // Update script reference to point to the correct bundled location
  html = html.replace(
    /<script src="app\.js" type="module"><\/script>/,
    '<script src="../js/core/app.js" type="module"></script>'
  );

  await fs.writeFile(htmlPath, html);
  const adminDir = path.join(__dirname, 'dist', 'admin');
  await fs.mkdir(adminDir, { recursive: true });
  await fs.writeFile(path.join(adminDir, 'index.html'), html);
  console.log('Updated HTML references');
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
    try {
      await fs.rm(distDir, { recursive: true, force: true });
    } catch {}

    // Copy first: source JS must not overwrite esbuild's bundled entry points.
    await copyPublicAssets();

    // Build with esbuild
    if (watch) {
      const ctx = await esbuild.context(config);
      await ctx.watch();
      console.log('Watching for changes...');
    } else {
      const result = await esbuild.build(config);

      // Update HTML references
      await updateHtmlReferences();

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
