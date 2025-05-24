// @ts-check
import {createConfig, http, readContract, fetchBlockNumber, fetchEnsName, getBlock} from '@wagmi/core';
import {mainnet, optimism, optimismSepolia, arbitrum} from '@wagmi/core/chains';
import {brABI as abi} from "../abi/blueRailroadABI.js";
import {setStoneABI} from "../abi/setStoneABI.js";
import { setStoneContractAddress, blueRailroadContractAddress } from "./constants.js";
import {getVowelsoundContributions} from "./revealer_utils.js";
import Web3 from 'web3';

const web3 = new Web3();
import { config as dotenvConfig } from 'dotenv';
import {fileURLToPath} from "url";
import path from "path";
import fs from "fs";
import { getProjectDirs } from "./locations.js";

const env = process.env.NODE_ENV || 'development';
dotenvConfig({path: `.env`});

export async function fetchChainDataForShows(shows, config) {
    const { showsDir } = getProjectDirs();
    console.time("Shows, Sets, and Songs");
    // We expect shows to be the result of iterating through the show YAML files.
    // Now we'll add onchain data from those shows.

    let showsChainData = {};

    // Iterate through show IDs and parse the data.
    for (let [show_id, show] of Object.entries(shows)) {
        // Split ID by "-" into artist_id and blockheight
        const [artist_id, _blockheight] = show_id.split('-');
        const blockheight = parseInt(_blockheight);

        let singleShowChainData = {"sets": []};
        showsChainData[show_id] = singleShowChainData;

        // Read the contract using the getShowData function
        const showData = await readContract(config, {
            abi: setStoneABI,
            address: setStoneContractAddress,
            functionName: 'getShowData',
            chainId: arbitrum.id,
            args: [artist_id, blockheight],
        });

        // If number of sets and stone price are both zero, and there are no rabbits, we'll take that to mean the show doesn't exist onchain.
        if (showData[1] === 0 && showData[2] === 0n && showData[3].length === 0) {
            singleShowChainData['has_set_stones_available'] = false;
            continue;
        } else {
            singleShowChainData['has_set_stones_available'] = true;
        }

        // (bytes32 showBytes1, uint16 stonesPossible1, uint8 numberOfSets1, uint256 stonePrice1, bytes32[] memory rabbitHashes1)
        // This is the return type of the solidity getShowData function
        // unpack the showData
        const unpackedShowData = {
            showBytes: showData[0],  // This is actually just artist_id and blockheight again
            numberOfSets: showData[1],
            stonePrice: showData[2],
            rabbitHashes: showData[3],
            setShapeBySetId: showData[4],
        };

        singleShowChainData["rabbit_hashes"] = unpackedShowData.rabbitHashes;
        singleShowChainData["stone_price"] = unpackedShowData.stonePrice;


        // integrity check: the number of sets on chain is the same as the number of sets in the yaml, raise an error if not

        if (show.sets === undefined) {
            // There are no sets in this show, at least yet.
            // TODO: Check to see if this show is in the future?
            continue;
        }
        let numberOfSetsInYaml = Object.keys(show.sets).length;

        if (unpackedShowData.numberOfSets !== Object.keys(show.sets).length) {
            // throw new Error(`Number of sets on chain (${unpackedShowData.numberOfSets}) does not match the number of sets in the yaml (${show.sets.length}) for show ID ${show_id}`);
            console.log(`Error: Number of sets on chain (${unpackedShowData.numberOfSets}) does not match the number of sets in the yaml (${Object.keys(show.sets).length}) for show ID ${show_id}`);
        }

        // unpack setShapeBySetId
        for (let i = 0; i < Object.keys(show["sets"]).length; i++) {
            singleShowChainData["sets"].push({"shape": unpackedShowData.setShapeBySetId[i]});
        }

    }
    console.timeEnd("Shows, Sets, and Songs");

    return showsChainData;
}

export async function appendSetStoneDataToShows(showsChainData, config) {
    console.time("Set Stones");
    // should be called after the shows data has been appended to the shows object

    let number_of_stones_in_sets = 0;

    for (let [show_id, show] of Object.entries(showsChainData)) {
        // Split ID by "-" into artist_id and blockheight
        const [artist_id, blockheight] = show_id.split('-');

        for (let [set_order, set] of Object.entries(show.sets)) {
            set.setstones = [];
            set.ticketStubs = [];
            const setStoneIds = await readContract(config, {
                abi: setStoneABI,
                address: setStoneContractAddress,
                functionName: 'getStonesBySetId',
                chainId: arbitrum.id,
                args: [artist_id, blockheight, set_order],
            });

            // TODO: Also read the ticketstubs contract.
            // For now, fake data.  TODO: Unfake this.
            let ticketStubIDs = [3n, 11n, 35n];

            for (let ticketStubID of ticketStubIDs) {
                let ticketStub = {};
                ticketStub["tokenId"] = ticketStubID;
                set.ticketStubs.push(ticketStub);
            }



            for (let setStoneId of setStoneIds) {

                // This is the model for set stones.
                // TODO: Put this in a more logical place - we need some kind of a merch models module.  TODO: Perhaps this all goes in blox-office?
                let setstone = {}
                number_of_stones_in_sets++;

                // call getStoneColor, getCrystalizationMsg, getPaidAmountWei to get the stone metadata
                setstone["tokenId"] = setStoneId;

                const stoneColor = await readContract(config, {
                    abi: setStoneABI,
                    address: setStoneContractAddress,
                    functionName: 'getStoneColor',
                    chainId: arbitrum.id,
                    args: [setStoneId],
                });

                setstone["color"] = [stoneColor.color1, stoneColor.color2, stoneColor.color3];

                const crystalizationMsg = await readContract(config, {
                    abi: setStoneABI,
                    address: setStoneContractAddress,
                    functionName: 'getCrystalizationMsg',
                    chainId: arbitrum.id,
                    args: [setStoneId],
                });

                setstone["crystalizationMsg"] = crystalizationMsg;

                const favoriteSong = await readContract(config, {
                    abi: setStoneABI,
                    address: setStoneContractAddress,
                    functionName: 'getFavoriteSong',
                    chainId: arbitrum.id,
                    args: [setStoneId],
                });
                setstone["favoriteSong"] = favoriteSong;


                const paidAmountWei = await readContract(config, {
                    abi: setStoneABI,
                    address: setStoneContractAddress,
                    functionName: 'getPaidAmountWei',
                    chainId: arbitrum.id,
                    args: [setStoneId],
                });

                setstone["paidAmountWei"] = paidAmountWei;
                setstone["paidAmountEth"] = web3.utils.fromWei(paidAmountWei, 'ether');

                let ownerOfThisToken = await readContract(config, {
                    abi: setStoneABI,
                    address: setStoneContractAddress,
                    functionName: 'ownerOf',
                    chainId: arbitrum.id,
                    args: [setStoneId],
                });

                let ensName = await fetchEnsName(config, {address: ownerOfThisToken, chainId: 1});
                if (ensName == undefined) {
                    ensName = ownerOfThisToken;
                }

                setstone["owner"] = ensName;

                let tokenURI = await readContract(config, {
                    abi: setStoneABI,
                    address: setStoneContractAddress,
                    functionName: 'tokenURI',
                    chainId: arbitrum.id,
                    args: [setStoneId],
                });

                setstone["tokenURI"] = tokenURI;

                set.setstones.push(setstone);

                console.log(`show ${show_id} set ${set_order} stone ${setStoneId}: ${setstone["owner"]}`);
            }
        }

    }

    const setStoneCountOnChain = await readContract(config,
        {
            abi: setStoneABI,
            address: setStoneContractAddress,
            functionName: 'totalSupply',
            chainId: arbitrum.id,
        })


    if (number_of_stones_in_sets != setStoneCountOnChain) {
        console.log("Error: Number of stones in sets on chain does not match the number of stones in the sets object");
        console.log("Number of stones in sets on chain: ", setStoneCountOnChain);
        console.log("Number of stones in sets object: ", number_of_stones_in_sets);
    }

    console.timeEnd("Set Stones");
    return showsChainData;
}

///////////BACK TO TONY

export async function getBlueRailroads(config) {
    console.time("Blue Railroads (listen to that old smokestack)");
    const blueRailroadCount = await readContract(config,
        {
            abi,
            address: blueRailroadContractAddress,
            functionName: 'totalSupply',
            chainId: optimism.id,
        })

    let blueRailroads = {};

    for (let i = 0; i < blueRailroadCount; i++) {
        let tokenId = await readContract(config, {
            abi,
            address: blueRailroadContractAddress,
            functionName: 'tokenByIndex',
            chainId: optimism.id,
            args: [i],
        });

        let ownerOfThisToken = await readContract(config, {
            abi,
            address: blueRailroadContractAddress,
            functionName: 'ownerOf',
            chainId: optimism.id,
            args: [tokenId],
        });

        let uriOfVideo = await readContract(config, {
            abi,
            address: blueRailroadContractAddress,
            functionName: 'tokenURI',
            chainId: optimism.id,
            args: [tokenId],
        });

        blueRailroads[tokenId] = {
            owner: ownerOfThisToken,
            uri: uriOfVideo,
            id: tokenId
        };

    }
    console.timeEnd("Blue Railroads (listen to that old smokestack)");
    return blueRailroads;
}

export function appendChainDataToShows(shows, chainData) {
    const showsChainData = chainData["showsWithChainData"];
    for (let [show_id, show] of Object.entries(shows)) {
        let chainDataForShow = showsChainData[show_id];
        // TODO: Handle the show not being in the chain data at all - emit a warning that it's time to refresh chain data?  And an error in prod?
        if (chainDataForShow === undefined) {
            // TODO: Handle this case - why is this show not in the chain data?
        } else if (chainDataForShow['has_set_stones_available'] === false) {
            // TODO: Handle this case - probably do nothing.  But maybe we want to handle other merch even if set stones are not available?
        } else {

            show["has_set_stones_available"] = true;
            show["rabbit_hashes"] = chainDataForShow["rabbit_hashes"]
            show["stone_price"] = chainDataForShow["stone_price"]

            // integrity check: the number of sets on chain is the same as the number of sets in the yaml, raise an error if not

            // TODO: We're already checking this during fetch chain data - do we need to check it again?  If so, can it at least share the same logic?

            let numberOfSetsInYaml;

            if (show.sets === undefined) {
                // There are no sets in this show, at least yet.
                // TODO: Check to see if this show is in the future?
                numberOfSetsInYaml = 0;
            } else {
                numberOfSetsInYaml = Object.keys(show.sets).length;
            }

            if (chainDataForShow.sets.length !== numberOfSetsInYaml) {
                throw new Error(`Number of sets on chain (${chainDataForShow.sets.length}) does not match the number of sets in the yaml (${numberOfSetsInYaml}) for show ID ${show_id}`);
            }

            // unpack setShapeBySetId
            for (let i = 0; i < numberOfSetsInYaml; i++) {
                let set = show['sets'][i]
                set["shape"] = chainDataForShow['sets'][i]['shape'];
                const set_stones_for_this_Set = chainDataForShow['sets'][i]['setstones'];

                // TODO: Because we're copying the set stone data, ticket stubs are per-set.  But we don't want that - ticket stubs are per-show.
                const ticket_stubs_for_this_Set = chainDataForShow['sets'][i]['ticketStubs'];

                // TODO: Iterate through songs and note that this set stone is present.
                // TODO: Note if the song is favorited.
                set['setstones'] = set_stones_for_this_Set;
                set['ticketStubs'] = ticket_stubs_for_this_Set;
            }
        }
    }
}

export async function fetch_chaindata(shows) {

    console.time("Block Heights");

    // API key things
    const apiKey = process.env.ALCHEMY_API_KEY;

    if (apiKey === undefined || apiKey === "") {
        throw new Error("Not seeing API keys in .env - ask Justin or somebody for the secrets file.");
    }

    const config = createConfig({
        chains: [mainnet, optimism, optimismSepolia, arbitrum],
        transports: {
            [mainnet.id]: http(`https://eth-mainnet.g.alchemy.com/v2/${apiKey}`),
            [optimism.id]: http(`https://opt-mainnet.g.alchemy.com/v2/${apiKey}`),
            [optimismSepolia.id]: http(`https://opt-sepolia.g.alchemy.com/v2/${apiKey}`),
            [arbitrum.id]: http(`https://arb-mainnet.g.alchemy.com/v2/${apiKey}`),
        },
        ssr: true,
    })


    const mainnetBlockNumber = await fetchBlockNumber(config, {chainId: mainnet.id});
    const optimismBlockNumber = await fetchBlockNumber(config, {chainId: optimism.id});
    const optimismSepoliaBlockNumber = await fetchBlockNumber(config, {chainId: optimismSepolia.id});
    console.timeEnd("Block Heights");

    const blueRailroads = await getBlueRailroads(config);
    let showsWithChainData = await fetchChainDataForShows(shows, config);
    let showsWithSetStoneData = await appendSetStoneDataToShows(showsWithChainData, config);
    const vowelSoundContributions = await getVowelsoundContributions(config);


    const chainData = {
        blueRailroads: blueRailroads,
        mainnetBlockNumber: mainnetBlockNumber,
        optimismBlockNumber: optimismBlockNumber,
        optimismSepoliaBlockNumber: optimismSepoliaBlockNumber,
        showsWithChainData: showsWithSetStoneData,
        vowelSoundContributions: vowelSoundContributions,
    }
    return chainData;
}

export async function get_times_for_shows() {
    const { showsDir } = getProjectDirs();
    const apiKey = process.env.ALCHEMY_API_KEY;

    if (apiKey === undefined || apiKey === "") {
        throw new Error("need an apiKey to get show times. ask another cryptograsser for the secrets file")
    }


    const config = createConfig({
        chains: [mainnet, optimism, optimismSepolia, arbitrum],
        transports: {
            [mainnet.id]: http(`https://eth-mainnet.g.alchemy.com/v2/${apiKey}`),
            [optimism.id]: http(`https://opt-mainnet.g.alchemy.com/v2/${apiKey}`),
            [optimismSepolia.id]: http(`https://opt-sepolia.g.alchemy.com/v2/${apiKey}`),
            [arbitrum.id]: http(`https://arb-mainnet.g.alchemy.com/v2/${apiKey}`),
        },
        ssr: true,
    })

    const mainnetBlockHeight = await fetchBlockNumber(config, { chainId: mainnet.id });
    const mostRecentBlock = await getBlock(config, { chainId: mainnet.id, blockNumber: mainnetBlockHeight });
    const timestampOfMostRecentBlock = mostRecentBlock.timestamp;


    const liveShowYAMLs = fs.readdirSync(showsDir);

    let times_for_shows = {};
    for (let i = 0; i < liveShowYAMLs.length; i++) {
        let showYAML = liveShowYAMLs[i];
        let showID = showYAML.split('.')[0];
        const block_number = showID.split('-')[1];

        if (block_number < mainnetBlockHeight) {
            console.log(`${showID} is in the past.`)
            const block = await getBlock(config,
                { chainId: mainnet.id, blockNumber: block_number });
            times_for_shows[showID] = block.timestamp;
        } else {
            console.log(`${showID} is in the future.`)
            // Convert to BigInt for subtraction
            const blocksUntilShow = BigInt(block_number) - BigInt(mainnetBlockHeight);
            // Convert back to Number for multiplication if needed
            const secondsUntilShow = Number(blocksUntilShow) * 12;
            const timestampOfShow = BigInt(timestampOfMostRecentBlock) + BigInt(secondsUntilShow);
            times_for_shows[showID] = timestampOfShow;
            console.log(`${showID} is ${secondsUntilShow} seconds away.`)
        }

    }
    return times_for_shows;
}