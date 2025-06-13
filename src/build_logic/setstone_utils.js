import fs from 'fs';
import path from 'path';
import { generateDiamondPatternFromNesPalette } from "./graphics/setstone_drawing.js";
import {imageMapping} from "./asset_builder.js";
import { nesPalette } from "./graphics/palettes.js";
import { renderPage } from "./utils/rendering_utils.js";
import { getProjectDirs } from "./locations.js";
import { randomBytes } from 'crypto';
import { JsonRpcVersionUnsupportedError, keccak256 } from 'viem';
import {ticketStubClaimerABI} from "../abi/ticketStubClaimerABI.js";
import { ticketStubClaimerContractAddress } from "./constants.js";

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
        if (!show.ticketStubs || show.ticketStubs.length === 0) {
            // For testing purposes, create fake ticket stubs for some shows
            // TODO: Remove this when real contract integration is complete
            let fakeTicketStubCount = 0;
            if (showId === '0-22447747') { // ETHDam 2025
                fakeTicketStubCount = 3;
            } else if (showId === '0-20570887') { // Web3 Summit 2024
                fakeTicketStubCount = 2;
            }
            
            if (fakeTicketStubCount > 0) {
                console.log(`Creating ${fakeTicketStubCount} fake ticket stubs for show ${showId} (for testing)`);
                show.ticketStubs = [];
                show.ticketStubCount = fakeTicketStubCount; // Update count for consistency
                for (let i = 0; i < fakeTicketStubCount; i++) {
                    show.ticketStubs.push({
                        tokenId: i + 1, // Start token IDs at 1
                        claimed: false,
                        owner: null,
                        rabbitHash: '',
                        rabbitHashFull: '',
                        secret: ''
                    });
                }
            } else {
                console.log(`No ticket stubs for show ${showId} (count: ${show.ticketStubCount || 0})`);
                // Create empty array for consistency
                show.ticketStubs = [];
                continue;
            }
        }

        // Page to print all ticket stubs
        // TODO: We need to use a secret here, and hash it.
        // The hash can... live in the codebase and also onchain?
        let printableTicketStubFrontsPath = `/artifacts/all-ticket-stub-fronts-for-show-printable/${showId}.html`;
        let printableTicketStubBacksPath = `/artifacts/all-ticket-stub-backs-for-show-printable/${showId}.html`;

        //////////////////////////
        // TODO: We're about to print the paper ticket stubs, so obviously we have the rabbit at this time.  But where do we want to actually get it?  #273


        for (let i = 0; i < show.ticketStubCount; i++) {
            // Generate a random fake rabbit for each ticket stub.
            let fakeRabbit = randomBytes(32).toString('hex');
            let fakeRabbitHash = keccak256(fakeRabbit);
            let fakeRabbitHashTruncated = fakeRabbitHash.slice(0, 12);
            show.ticketStubs[i].rabbitHash = fakeRabbitHashTruncated;
            show.ticketStubs[i].rabbitHashFull = fakeRabbitHash;
            // SECRET HERE!  HAZMAT!  DO NOT LOG!
            show.ticketStubs[i].secret = fakeRabbit;
        }

        //////////////////////////
        // Make a JSON object with the secrets and hashes for each ticket stub
        // TODO: This is a little weird, but it's a good way to get the data to the blockchain.


        const ticketStubDataPath = `/artifacts/ticket-stub-data/${showId}.html`;
        const secrets_and_hashes = show.ticketStubs.map(ticketStub => ({
            tokenId: ticketStub.tokenId,
            secret: ticketStub.secret,
            rabbitHash: ticketStub.rabbitHashFull,
        }));
        const only_hashes = show.ticketStubs.map(ticketStub => ({
            tokenId: ticketStub.tokenId,
            rabbitHash: ticketStub.rabbitHashFull,
        }));
        const json_string_of_only_hashes = JSON.stringify(only_hashes);
        const json_string_of_secrets_and_hashes = JSON.stringify(secrets_and_hashes);
        renderPage({
            template_path: 'reuse/ticket-stub-data.njk',
            output_path: ticketStubDataPath,
            context: {
                json_string_of_secrets_and_hashes: json_string_of_secrets_and_hashes,
                only_hashes: json_string_of_only_hashes,
            },
            site: "cryptograss.live"
        });


        //////////////////////////

        renderPage({
            template_path: 'reuse/all-ticket-stubs-for-show-printable.njk',
            output_path: printableTicketStubFrontsPath,
            context: {
                show: show,
                side: "front",
            },
            site: "cryptograss.live"
        });

        renderPage({
            template_path: 'reuse/all-ticket-stubs-for-show-printable.njk',
            output_path: printableTicketStubBacksPath,
            context: {
                show: show,
                side: "back",
            },
            site: "cryptograss.live"
        });

        // Individual ticket stub pages
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

            // Generate claim page for each ticket stub
            let claimOutputPath = `/blox-office/ticketstubs/claim/${ticketStub.tokenId}.html`;
            let claimContext = {
                tokenId: ticketStub.tokenId,
                contractAddress: ticketStubClaimerContractAddress,
                contractABI: JSON.stringify(ticketStubClaimerABI),
                alchemyApiKey: process.env.ALCHEMY_API_KEY,
                show: show,
                ticketStub: ticketStub,
            };
            renderPage({
                template_path: 'pages/claim-ticket-stub.njk',
                output_path: claimOutputPath,
                context: claimContext,
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

    for (let [showId, show] of Object.entries(shows)) {
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