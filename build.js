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

const config = {
  entryPoints: [
    'public/app.js',
    'public/sw.js',
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
  },
  loader: {
    '.js': 'js',
  },
  logLevel: 'info',
};

async function copyPublicAssets() {
  const publicDir = path.join(__dirname, 'public');
  const distDir = path.join(__dirname, 'dist');
  
  // Ensure dist directory exists
  await fs.mkdir(distDir, { recursive: true });
  
  // Files to copy (non-JS files)
  const filesToCopy = [
    'index.html',
    'styles.css',
    '_headers',
    'codes.json',
    'set-art.json',
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
  const dirsToCopy = ['templates', 'img'];
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
  
  // Copy functions directory
  const functionsDir = path.join(__dirname, 'functions');
  const distFunctionsDir = path.join(distDir, '..', 'functions');
  try {
    await fs.cp(functionsDir, distFunctionsDir, { recursive: true });
    console.log('Copied functions directory');
  } catch (err) {
    console.error('Error copying functions:', err);
  }
}

async function updateHtmlReferences() {
  if (isDev) return; // Skip in dev mode
  
  const htmlPath = path.join(__dirname, 'dist', 'index.html');
  let html = await fs.readFile(htmlPath, 'utf-8');
  
  // Update script reference to point to bundled version
  html = html.replace(
    /<script src="app\.js" type="module"><\/script>/,
    '<script src="app.js" type="module"></script>'
  );
  
  await fs.writeFile(htmlPath, html);
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
    
    // Build with esbuild
    if (watch) {
      const ctx = await esbuild.context(config);
      await ctx.watch();
      console.log('Watching for changes...');
      
      // Copy assets once
      await copyPublicAssets();
    } else {
      const result = await esbuild.build(config);
      
      // Copy non-JS assets
      await copyPublicAssets();
      
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
