// pnpm configuration file
// Allow build scripts for packages with native dependencies

function readPackage(pkg) {
  // Whitelist packages that need build scripts
  const allowedBuilds = [
    '@parcel/watcher',
    'bufferutil',
    'canvas',
    'core-js',
    'keccak',
    'sharp',
    'utf-8-validate'
  ];

  if (allowedBuilds.includes(pkg.name)) {
    pkg.scripts = pkg.scripts || {};
  }

  return pkg;
}

module.exports = {
  hooks: {
    readPackage
  }
};
