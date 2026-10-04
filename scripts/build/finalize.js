'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
fs.copyFileSync(path.join(root, 'static/prd/index.html'), path.join(root, 'static/index.html'));
console.log('Production entry updated with content-hashed Webpack 5 assets.');
