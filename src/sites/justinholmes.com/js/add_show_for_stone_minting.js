import { createConfig, http, readContract, writeContract } from '@wagmi/core';
import { optimismSepolia, arbitrum } from '@wagmi/core/chains';
import Web3 from 'web3';
import $ from 'jquery';
import { createWeb3Modal } from '@web3modal/wagmi'
import { setStoneContractAddress } from '../../../build_logic/constants.js';

export const config = createConfig({
    chains: [optimismSepolia, arbitrum],
    transports: {
        [optimismSepolia.id]: http(),
        [arbitrum.id]: http(),
    },
})

// When <select> element show-to-make-available is changed, update the show_id and blockheight fields by parsing the show_id.
$('#show-to-make-available').change(function () {
    let showId = $(this).val();

    // The artist_id is before the "-" in the show_id; the blockheight is after it.
    let artistId = showId.split('-')[0];
    let blockheight = showId.split('-')[1];

    // Populate the inputs called artist_id and blockheight with the parsed values.
    $('#artist_id').val(artistId);
    $('#blockheight').val(blockheight);
});

$('#generate-rabbit-secrets-button').click(function () {
    let numSecrets = parseInt($('#numberOfRabbitSecrets').val());
    let secrets = [];


    for (let i = 0; i < numSecrets; i++) {
        let array_to_turn_into_integer = [];
        var buf = new Uint16Array(6);
        let secret = window.crypto.getRandomValues(buf);
        // Join secret into a string and push it to the secrets array.
        secrets.push(secret.join(''));
    }
    $('#rabbitSecrets').val(secrets.join('\n'));
});


const web3 = new Web3();
const projectId = 'a685c805b45541d81547b86d86d97ff5'
import { setStoneABI as contractABI } from "../../../abi/setStoneABI.js";

function keccak256(value) {
    return web3.utils.soliditySha3({ type: "string", value: value });
}

function parseShapes() {
    let shapesInput = $('#shapes').val();
    return shapesInput.split('\n').map(Number);
}


async function makeShowAvailableForStoneMinting() {
    let artist_id = parseInt($('#artist_id').val());
    let blockheight = parseInt($('#blockheight').val());
    let shapes = parseShapes()
    let numberOfSets = parseInt($('#numberOfSets').val());
    let stonePriceEth = parseFloat($('#stonePriceEth').val());
    let stonePriceWei = web3.utils.toWei(stonePriceEth, 'ether');

    // parser the rabbit secrets
    // split them by newline
    let rabbitSecrets = $('#rabbitSecrets').val().split('\n');

    // compute keccak256 hash of each secret
    let rabbitHashes = rabbitSecrets.map(secret => keccak256(secret));

    const result = await writeContract(config, {
        address: setStoneContractAddress,
        abi: contractABI,
        functionName: "makeShowAvailableForStoneMinting",
        chainId: arbitrum.id,
        args: [artist_id, blockheight, rabbitHashes, numberOfSets, shapes, stonePriceWei],
    });
}

document.addEventListener('DOMContentLoaded', () => {

    const modal = createWeb3Modal({
        wagmiConfig: config,
        projectId,
    });

    window.makeShowAvailableForStoneMinting = makeShowAvailableForStoneMinting;

    // show the etherscan link
    // document.getElementById("contractEtherscanLink").href = `https://sepolia-optimism.etherscan.io/address/${contractAddress}#code`;
});