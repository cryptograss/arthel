import fs from 'fs';
import path from 'path';
import { generateDiamondPatternFromNesPalette } from "./graphics/setstone_drawing.js";
import {imageMapping} from "./asset_builder.js";
import { nesPalette } from "./graphics/palettes.js";
import { renderPage } from "./utils/rendering_utils.js";
import { getProjectDirs } from "./locations.js";


0

/**
 * 
 * 
 * Generates and saves NFT metadata JSON files for each setstone in the shows.
 * @param {Object} showsWithChainData - Object containing show data with chain information.
 * @param {string} outputDir - Directory to save the generated JSON files.
 */
export function generateSetStonePages(shows, outputDir) {
    const { cryptograssUrl } = getProjectDirs();
    for (const [showId, show] of Object.entries(shows)) {


        // Ticket stubs
        if (!show.ticketStubs) {
            console.log(`No ticket stubs for show ${showId}`);
            // TODO: If show has no ticket stubs - just continue?
            continue;
        }
        show.ticketStubs.forEach((ticketStub, _counter) => {
            let outputPath = `/artifacts/ticket-stubs/${showId}-${ticketStub.tokenId}.html`;
            let context = {
                show: show,
                ticketStub: ticketStub,
            };
            renderPage({
                template_path: 'reuse/single-ticket-stub.njk',
                output_path: outputPath,
                context: context,
                site: "cryptograss.live"
            });
        });



        // We're only interested in shows that have set stones.
        if (!show.has_set_stones_available) {
            continue;
        }

        Object.entries(show.sets).forEach(([setNumber, set]) => {
            set.setstones.forEach((setstone, setstoneNumber) => {


                ////////////////
                // metadata JSON for NFT
                ////////////////
                const metadata = {
                    name: `Set Stone for show ${showId}`,

                    // TODO: Does this become the show page?
                    // TODO: The image in the metadata... that's gonna be on cryptograss.live, right?
                    external_url: `https://justinholmes.com/cryptograss/bazaar/setstones/${showId}.html`,
                    description: `Set Stone from artist with id=${show.artist_id} and show on ${show.blockheight}`,
                    // The images live on cryptograss.live, so we need to use that URL.  Also, we don't want to use the variable, because this is actual token metadata.
                    image: `https://cryptograss.live/assets/images/setstones/${set.shape}-${setstone.color[0]}-${setstone.color[1]}-${setstone.color[2]}.png`, 
                    attributes: [
                        {
                            trait_type: "Shape",
                            value: set.shape
                        },
                        {
                            trait_type: "Color 1",
                            value: setstone.color[0]
                        },
                        {
                            trait_type: "Color 2",
                            value: setstone.color[1]
                        },
                        {
                            trait_type: "Color 3",
                            value: setstone.color[2]
                        }
                    ]

                };

                const fileName = `${setstone.tokenId}`;
                const filePath = path.join(outputDir, fileName);

                fs.mkdirSync(path.dirname(filePath), {recursive: true});
                fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2));

                ////////////////////////
                /// Set Stone Profile Page
                /////////////////////////

                const NEScolorNames = Object.keys(nesPalette)
                const setstoneColornames = `${NEScolorNames[setstone.color[0]]}, ${NEScolorNames[setstone.color[1]]}, ${NEScolorNames[setstone.color[2]]}` // TODO: Modeling, WWDD
                let context = {
                    show: show,
                    set: set,
                    setstone: setstone,
                    colors: setstoneColornames,
                    imageMapping,
                };

                // TODO: Put URL generation in a shared place that's easier to find.  It's weird that such an important URL is buried on this relatively obscure line.
                const outputPath = `/artifacts/setstones/${showId}-${setstone.tokenId}.html`;
                const outputPathForPrintable = `/artifacts/setstones/${showId}-${setstone.tokenId}-print.html`;
                setstone.resource_url = outputPath;
                // Profile page for online viewing.
                renderPage({
                        template_path: 'reuse/single-set-stone.njk',
                        output_path: outputPath,
                    context: context,
                    site: "cryptograss.live"
                    }
                );

                // Printable version
                renderPage({
                    template_path: 'reuse/single-set-stone-printable.njk',
                    output_path: outputPathForPrintable,
                    context: context,
                    site: "cryptograss.live"
                });

            });


        });
    };
}


export function renderSetStoneImages(shows, outputDir) {
    // create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, {recursive: true});
    }

    for (const [showId, show] of Object.entries(shows)) {
        // We're only interested in shows that have set stones.
        if (!show.has_set_stones_available) {
            continue;
        }   

        Object.entries(show.sets).forEach(([setNumber, set]) => {
            set.setstones.forEach((setstone, setstoneNumber) => {
                const canvas = generateDiamondPatternFromNesPalette(setstone.color[0], setstone.color[1], setstone.color[2], "transparent", null, 1000);
                const buffer = canvas.toBuffer('image/png');
                // const fileName = `${set.shape}-${setstone.color[0]}-${setstone.color[1]}-${setstone.color[2]}.png`;
                const fileName = `${setstone.tokenId}.png`;
                const filePath = path.join(outputDir, fileName);
                fs.writeFileSync(filePath, buffer);
            });
        });
    };
}