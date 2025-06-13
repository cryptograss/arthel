import nunjucks from "nunjucks";
import { get_image_from_asset_mapping, imageMapping, unusedImages } from "../asset_builder.js";
import { getProjectDirs } from "../locations.js";
import {slugify} from "./text_utils.js";
import { getShowAndSetData } from "../show_and_set_data.js";
import { AVERAGE_BLOCK_TIME } from "../constants.js";
import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';

const REFERENCE_BLOCK = 20612385; // Example block number
const REFERENCE_TIMESTAMP = 1724670731; // Unix timestamp in seconds

let _helpers_are_registered = [];

export function registerHelpers(site) {
    const { templateDir } = getProjectDirs();

    let env = nunjucks.configure([templateDir, path.join(templateDir, site)], { autoescape: false })
    if (_helpers_are_registered.includes(site)) {
        console.warn('Helpers are already registered');
        return;
    }

    // Add the 'get_image' filter that looks up images in the imageMapping object
    env.addGlobal('get_image', function (filename, imageType) {
        return get_image_from_asset_mapping(filename, imageType);  // Return empty string if not found
    });

    env.addGlobal('get_record_metadata', function (record_name) {
        // Open and parse the yaml file.
        const { dataDir } = getProjectDirs();
        const recordSlug = slugify(record_name);
        let recordYAMLfile = fs.readFileSync(`${dataDir}/records/${recordSlug}.yaml`, 'utf8');
        let recordMetadata = yaml.load(recordYAMLfile);
        return recordMetadata;
    });

    env.addFilter('showInstrumentalist', function (song_play, instrument_to_show) {
        const ensemble = song_play._set._show.ensemble
        const { pickers } = getShowAndSetData();

        // We have the ensemble object; iterate through artists and their instruments.
        for (let [picker_name, instruments] of Object.entries(ensemble)) {
            for (let instrument_played of instruments) {
                if (instrument_played === instrument_to_show) {
                    const picker = pickers[picker_name];
                    const link_string = `<a href="${picker.resource_url}">${picker_name}</a>`
                    return link_string; // TODO: We're returning the first one we find - what if there are multiple?
                }
            }
        }
        // If we got this far, then nobody played the insrument in question on this play.
        return `No ${instrument_to_show}`;
    });

    env.addFilter('slugify', function (string_to_slugify) {
        return slugify(string_to_slugify);
    });

    // TODO: We removed 'resolveImage', so we now show every image as unused.  No good.

    env.addFilter('resolveGraph', function (artist_ids, blockheight, setId) {



        //////////////////////
        // TODO: We need to handle multiple artists here.
        // Again, we'll just use the first artist_id and presume the setlist is for the first artist.
        const artist_id = artist_ids[0];
    // #268
    /////////////////


        // Sanity check.
        if (artist_id === undefined || blockheight === undefined || setId === undefined) {
            throw new Error("resolveGraph requires artist_id, blockheight, and setId");
        }

        let foundImage;
        let originalPath;
        if (setId === "full-show") {
            originalPath = `graphs/${artist_id}-${blockheight}-full-show-provenance.png`;
        } else {
            originalPath = `graphs/${artist_id}-${blockheight}-set-${setId}-provenance.png`;
        }

        // TODO: We need to check to see if the show is in the future.
        // #269
        // Then we can uncomment these two failfast checks.

        try {
            foundImage = imageMapping[originalPath];
            if (foundImage) {
                unusedImages.delete(foundImage.original);  // Mark image as used (same as get_image_from_asset_mapping does)
            }
        } catch (e) {
            console.log(`Exception accessing imageMapping for ${originalPath}:`, e);
            // throw new Error(`Image not found: ${originalPath}`);
        }

        if (!foundImage) {
            console.log(`Image not found in mapping: ${originalPath}`);
            console.log(`Available keys containing 'graphs':`, Object.keys(imageMapping).filter(k => k.includes('graphs')).slice(0, 5));
            // throw new Error(`Image not found: ${originalPath}`);
            return null; // Return null instead of debug text that gets used as image src
        }

        return foundImage['original'] // TODO: Do we always want original here?  What if we want thumbnail?  Is that even a thing for graphs?  Are there other types?
    });

    env.addGlobal('getCryptograssUrl', () => {
        return getProjectDirs().cryptograssUrl;
    });

    _helpers_are_registered.push(site);
}
