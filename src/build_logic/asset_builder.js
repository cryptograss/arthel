import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {globSync} from 'glob';
import yaml from "js-yaml";
import sharp from 'sharp';
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

    // Process each image file
    const imageFiles = globSync(imageDirPattern);
    imageFiles.forEach(file => {
        const relativePath = path.relative(imagesSourceDir, file);
        const fileExt = path.extname(file);
        const fileName = path.basename(file);

        // Skip non-image files and already processed thumbnails
        if (!fileName.match(/\.(png|jpg|jpeg|gif|avif|webp)$/i)) {
            return;
        }

        const originalPath = path.join('/assets/images', relativePath);  // TODO: use basePath here ?
        const outputPath = path.join(imageOutputDir, relativePath);
        const thumbPath = path.join(imageOutputDir, `${path.basename(file, fileExt)}-thumb${fileExt}`);

        // Ensure output directory exists
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });

        // Copy original file
        fs.copyFileSync(file, outputPath);

        // Generate thumbnail for images (not videos)
        if (!file.endsWith('.mp4')) {
            sharp(file)
                .resize(300, 300, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .toFile(thumbPath)
                .catch(err => console.error(`Error creating thumbnail for ${file}:`, err));
        }

        // Store mappings for both original and thumbnail
        // TODO: basepath?  Instead of rewriting later?
        imageMapping[relativePath] = {
            original: originalPath,
            thumbnail: path.join('/assets/images', `${path.basename(file, fileExt)}-thumb${fileExt}`)
        };

        unusedImages.add(originalPath);
    });

    console.log(`Total of ${unusedImages.size} found.`); // At this time, all the images have been added to unusedImages.

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

function get_image_from_asset_mapping(filename, imageType = 'original') {
    const mapping = imageMapping[filename];
    if (!mapping) {
        console.log(`Not finding ${filename} - this is going to result in a broken image.`)
        return false
    }
    unusedImages.delete(mapping.original);
    return mapping ? mapping[imageType] : '';
}

export {gatherAssets, imageMapping, unusedImages, getImageMapping, get_image_from_asset_mapping};