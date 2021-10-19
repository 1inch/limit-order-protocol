const SOLC_NPM_NAME = 'solc';
const INPUT_DIR = 'contracts';
const BASE_DIR = 'docgen';
const OUTPUT_DIR = `${BASE_DIR}/docs`;
const HELPERS_PATH = `${BASE_DIR}/solidity-docgen-helpers.js`;

const fs = require('fs');
const path = require('path');
const spawn = require('cross-spawn');

function getFileNameWithoutExtension(fileName) {
    return fileName.substr(0, fileName.lastIndexOf("."));
}

function runProcess(name, args) {
    console.log(`running ${name} with args ${JSON.stringify(args)}`);
    const result = spawn.sync(name, args, {stdio: ['inherit', 'inherit', 'pipe']});
    if (result.stderr.length > 0) {
        throw new Error(result.stderr);
    }
}

function getReadmes(targetPath) {
    let result = [];
    const readmePath = path.join(targetPath, 'README.md');
    if (!fs.existsSync(readmePath)) {
        const content = `# ${path.basename(targetPath)}\n`;
        result.push({path: readmePath, content});
    }
    const childDirs = fs.readdirSync(targetPath, {withFileTypes: true}).filter(item => item.isDirectory());
    for (let dir of childDirs) {
        result = result.concat(getReadmes(path.join(targetPath, dir.name)));
    }
    return result;
}

function generateReadmes(readmes) {
    for (let readme of readmes) {
        fs.writeFileSync(readme.path, readme.content);
    }
}

function getSummary(targetPath) {
    function getSummaryRoot(summaryTargetPath, indentation) {
        function specialCaseRoot(item) {
            if (item.indentation >= 0) {
                return item;
            }
            return ({
                name: "Main Readme",
                path: item.path,
                indentation: 0
            });
        }

        const items = fs.readdirSync(summaryTargetPath, {withFileTypes: true});
        let result = [specialCaseRoot({
            name: path.basename(summaryTargetPath),
            path: path.relative(targetPath, path.join(summaryTargetPath, 'README.md')).replaceAll('\\', '/'),
            indentation: indentation - 1
        })];
        for (let dir of items.filter(item => item.isDirectory())) {
            result = result.concat(getSummaryRoot(path.join(summaryTargetPath, dir.name), indentation + 1));
        }
        result = result
            .concat(items
                .filter(item => !item.isDirectory()
                    && !item.name.endsWith('README.md')
                    && !item.name.endsWith('SUMMARY.md'))
                .map(file => ({
                    name: getFileNameWithoutExtension(file.name),
                    path: path.relative(targetPath, path.join(summaryTargetPath, file.name)).replaceAll('\\', '/'),
                    indentation
                })));
        return result;
    }

    function generateContent(summaryTree) {
        const lines = summaryTree.map(x => `${' '.repeat(x.indentation)}* [${x.name}](${x.path})`).join('\n');
        return `# Table of contents\n\n${lines}`;
    }

    return generateContent(getSummaryRoot(targetPath, 0));
}

function generateSummary(targetPath, summary) {
    fs.writeFileSync(path.join(targetPath, "SUMMARY.md"), summary);
}

function generateGitbookFiles() {
    fs.copyFileSync(path.join(BASE_DIR, 'README.md'), path.join(OUTPUT_DIR, 'README.md'));
    const readmesToGenerate = getReadmes(OUTPUT_DIR);
    const summary = getSummary(OUTPUT_DIR);

    generateReadmes(readmesToGenerate);
    generateSummary(OUTPUT_DIR, summary);
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
    JSON.stringify({optimizer: {enabled: false}}),
    '--templates',
    BASE_DIR,
    '--helpers',
    HELPERS_PATH,
];

fs.rmSync(OUTPUT_DIR, {force: true, recursive: true});
runProcess('npx', solidityDocgenArgs);
generateGitbookFiles();
