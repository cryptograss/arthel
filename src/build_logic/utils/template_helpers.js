import nunjucks from "nunjucks";
import { get_image_from_asset_mapping, imageMapping, unusedImages } from "../asset_builder.js";
import { getProjectDirs } from "../locations.js";
import {slugify} from "./text_utils.js";
import { getShowAndSetData } from "../show_and_set_data.js";
import path from 'path';

const REFERENCE_BLOCK = 20612385; // Example block number
const REFERENCE_TIMESTAMP = 1724670731; // Unix timestamp in seconds
const AVERAGE_BLOCK_TIME = 12.12; // Average block time in seconds

let _helpers_are_registered = [];

export function registerHelpers(site) {
    const { templateDir } = getProjectDirs();

    let env = nunjucks.configure([templateDir, path.join(templateDir, site)], { autoescape: false })
    if (_helpers_are_registered.includes(site)) {
        console.warn('Helpers are already registered');
        return;
    }

    // Add the 'get_image' filter that looks up images in the imageMapping object
    env.addGlobal('get_image', function (filename, imageMapping) {
        return get_image_from_asset_mapping(filename);  // Return empty string if not found
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

    env.addFilter('resolveGraph', function (artist_id, blockheight, setId) {

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
        try {
            foundImage = imageMapping[originalPath];
        } catch (e) {
            throw new Error(`Image not found: ${originalPath}`);
        }

        if (!foundImage) {
            // Raise an error if the image is not found
            throw new Error(`Image not found: ${originalPath}`);
        } else {
            unusedImages.delete(originalPath);
        }
        return foundImage
    });

    env.addGlobal('getCryptograssUrl', () => {
        return getProjectDirs().cryptograssUrl;
    });

    _helpers_are_registered.push(site);
}
