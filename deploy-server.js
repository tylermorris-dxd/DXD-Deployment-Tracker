'use strict';
const { spawn } = require('child_process');
const path = require('path');
const bin = path.join(__dirname, 'dxd-tracker');
const child = spawn(bin, [], { stdio: 'inherit', env: process.env });
child.on('close', (code) => process.exit(code ?? 1));
