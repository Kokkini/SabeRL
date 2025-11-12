/**
 * Cross-platform build script for copying files
 * Works on Windows, Linux, and macOS
 */

const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const publicDir = path.join(__dirname, '..', 'public');
const srcDir = path.join(__dirname, '..', 'src');

/**
 * Recursively copy directory
 */
function copyDir(src, dest) {
  // Create destination directory if it doesn't exist
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // Read source directory
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      // Recursively copy subdirectory
      copyDir(srcPath, destPath);
    } else {
      // Skip TypeScript files - they should be compiled to .js first
      if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        continue;
      }
      // Copy file
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Main build function
 */
function build() {
  try {
    console.log('Cleaning dist directory...');
    // Remove dist directory if it exists
    if (fs.existsSync(distDir)) {
      fs.rmSync(distDir, { recursive: true, force: true });
    }

    console.log('Creating dist directory...');
    fs.mkdirSync(distDir, { recursive: true });

    console.log('Copying public files...');
    if (fs.existsSync(publicDir)) {
      copyDir(publicDir, distDir);
    } else {
      console.warn('Warning: public directory not found');
    }

    console.log('Copying src files...');
    if (fs.existsSync(srcDir)) {
      const distSrcDir = path.join(distDir, 'src');
      copyDir(srcDir, distSrcDir);
    } else {
      console.warn('Warning: src directory not found');
    }

    console.log('Build copy completed successfully!');
  } catch (error) {
    console.error('Build copy failed:', error);
    process.exit(1);
  }
}

// Run build
build();

