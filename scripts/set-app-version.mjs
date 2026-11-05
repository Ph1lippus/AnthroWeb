import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`Expected a version like 1.2.3, got: ${version ?? '(nothing)'}`);
    process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const confPath = resolve(root, 'src-tauri/tauri.conf.json');
const conf = JSON.parse(readFileSync(confPath, 'utf8'));
conf.version = version;
writeFileSync(confPath, `${JSON.stringify(conf, null, 2)}\n`);

const cargoPath = resolve(root, 'src-tauri/Cargo.toml');
const cargo = readFileSync(cargoPath, 'utf8');
const bumped = cargo.replace(/^version = ".*"$/m, `version = "${version}"`);
if (bumped === cargo && !cargo.includes(`version = "${version}"`)) {
    console.error('Could not find the package version in src-tauri/Cargo.toml');
    process.exit(1);
}
writeFileSync(cargoPath, bumped);

console.log(`Set desktop app version to ${version}`);
