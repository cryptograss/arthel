import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {globSync} from 'glob';
import yaml from "js-yaml";
import { getProjectDirs } from "./locations.js";

console.time('asset-builder')



let imageMapping = {};
let unusedImages = new Set();

let _assets_gathered = false;

function gatherAssets() {
    const { imagesSourceDir, outputPrimaryRootDir, srcDir, basePath } = getProjectDirs();
    const imageDirPattern = `${imagesSourceDir}/**/*.{png,jpg,jpeg,gif,avif,svg,webp,mp4}`

    const assetsOutputDir = path.join(outputPrimaryRootDir, 'assets');
    const imageOutputDir = path.join(assetsOutputDir, 'images');
    const mappingFilePath = path.join(outputPrimaryRootDir, 'imageMapping.json');

    const fetchedAssetsDir = path.join(srcDir, 'fetched_assets');

    console.time('asset-gathering');

    // Ensure output directories exist
    if (!fs.existsSync(imageOutputDir)) {
        fs.mkdirSync(imageOutputDir, {recursive: true});
    }
    if (!fs.existsSync(assetsOutputDir)) {
        fs.mkdirSync(assetsOutputDir, { recursive: true });
    }

    if (_assets_gathered) {
        throw new Error("Assets have already been gathered.")
    }

    // Process regular images
    let imageFiles = globSync(imageDirPattern);

    imageFiles.forEach(file => {
        // copy the vowelsound artifacts under their original name
        // TODO: make this more general
        if (file.includes('vowelsound-artifacts')) {
            const vowelSoundArtifactsDir = path.join(imagesSourceDir, 'vowelsound-artifacts');
            const originalPath = path.relative(vowelSoundArtifactsDir, file).replace(/\\/g, '/');

            const dest_dir = path.join(imageOutputDir, 'vowelsound-artifacts');
            if (!fs.existsSync(dest_dir)) {
                fs.mkdirSync(dest_dir, {recursive: true});
            }

            fs.copyFileSync(file, path.join(dest_dir, originalPath));
            return;
        }

        const buffer = fs.readFileSync(file);
        const hash = crypto.createHash('sha256').update(buffer).digest('hex');
        const ext = path.extname(file);
        const hashedFilename = `${hash}${ext}`;
        const outputPath = path.join(imageOutputDir, hashedFilename);

        // Optional: Process images with sharp here if needed

        fs.writeFileSync(outputPath, buffer);

        // Create mapping
        const originalPath = path.relative(imagesSourceDir, file).replace(/\\/g, '/');
        if (basePath) {
            imageMapping[originalPath] = `${basePath}/assets/images/${hashedFilename}`;
        } else {
            imageMapping[originalPath] = `/assets/images/${hashedFilename}`;
        }
        unusedImages.add(originalPath); // we add all files to unusedImages, then we remove them from the mapping when they are used
    });

    // Simply copy the fetched assets directory
    if (fs.existsSync(fetchedAssetsDir)) {
        const fetchedOutputDir = path.join(assetsOutputDir, 'fetched');
        fs.mkdirSync(fetchedOutputDir, { recursive: true });

        const fetchedFiles = globSync(`${fetchedAssetsDir}/**/*`, { nodir: true });
        fetchedFiles.forEach(file => {
            const relativePath = path.relative(fetchedAssetsDir, file);
            const outputPath = path.join(fetchedOutputDir, relativePath);

            // TODO: Make hashes Issue #184
            // Ensure the output directory exists
            fs.mkdirSync(path.dirname(outputPath), { recursive: true });

            // Copy the file
            fs.copyFileSync(file, outputPath);
        });
    }

    // Write the image mapping to a JSON file
    fs.writeFileSync(mappingFilePath, JSON.stringify(imageMapping, null, 2), {encoding: 'utf8'});
    console.timeEnd('asset-gathering');

    let auxDataFile = fs.readFileSync("src/data/aux_data.yaml");
    let auxData = yaml.load(auxDataFile);
    let slogans = auxData["slogans"];

    // Write slogans to a JSON file for use in the frontend
    fs.writeFileSync(path.join(assetsOutputDir, "slogans.json"), JSON.stringify(slogans));

}


function getImageMapping() {
    if (!_assets_gathered) {
        throw new Error("Need to gather assets before using image mapping.")
    }
    const mappingFilePath = path.join(outputPrimaryRootDir, 'imageMapping.json');
    const jsonData = fs.readFileSync(mappingFilePath, {encoding: 'utf8'});
    return JSON.parse(jsonData);
}

function get_image_from_asset_mapping(filename) {
    // remove this filename from unusedImages
    unusedImages.delete(filename);
    return imageMapping[filename];  // Return empty string if not found
}

export {gatherAssets, imageMapping, unusedImages, getImageMapping, get_image_from_asset_mapping};