const SOLC_NPM_NAME = 'solc';
const INPUT_DIR = 'contracts';
const BASE_DIR = 'docgen';
const OUTPUT_DIR = `${BASE_DIR}/docs`;
const HELPERS_PATH = `${BASE_DIR}/solidity-docgen-helpers.js`;

const fs = require('fs');
const path = require('path');
const spawn = require('cross-spawn');

function runProcess (name, args) {
    console.log(`running ${name} with args ${JSON.stringify(args)}`);
    const result = spawn.sync(name, args, { stdio: ['inherit', 'inherit', 'pipe'] });
    if (result.stderr.length > 0) { throw new Error(result.stderr); }
}

function generateGitbookFiles () {
    fs.copyFileSync(path.join(BASE_DIR, 'README.md'), path.join(OUTPUT_DIR, 'README.md'));
}

const solidityDocgenArgs = [
    'solidity-docgen',
    '-i',
    INPUT_DIR,
    '-o',
    OUTPUT_DIR,
    '--solc-module',
    SOLC_NPM_NAME,
    '--solc-settings',
    JSON.stringify({ optimizer: { enabled: false } }),
    '--templates',
    BASE_DIR,
    '--helpers',
    HELPERS_PATH,
];

runProcess('npx', solidityDocgenArgs);
generateGitbookFiles();
