import { createConfig, http, readContract, writeContract } from '@wagmi/core';
import { optimismSepolia } from '@wagmi/core/chains';
import Web3 from 'web3';
import $ from 'jquery';
import {createWeb3Modal} from '@web3modal/wagmi'
import tippy from 'tippy.js';
import jazzicon from 'jazzicon';

export const config = createConfig({
    chains: [optimismSepolia],
    transports: {
        [optimismSepolia.id]: http(),
    },
})

const web3 = new Web3();
const contractAddress = '0xd16B72c7453133eA4406237A83014F3f8a9d581F';
const projectId = 'a685c805b45541d81547b86d86d97ff5'
import { liveSetABI as contractABI } from "../../../../abi/liveSetABI.js";

function keccak256(value) {
    return web3.utils.soliditySha3({ type: "string", value: value});
}

async function addLiveSet() {
    let artist_id = parseInt($('#artist_id').val());
    let blockheight = parseInt($('#blockheight').val());
    let shape = parseInt($('#shape').val());
    let order = parseInt($('#order').val());
    let stonePriceEth = parseInt($('#stonePriceEth').val());
    let stonePriceWei = web3.utils.toWei(stonePriceEth, 'ether');

    // parser the rabbit secrets
    // split them by newline
    let rabbitSecrets = $('#rabbitSecrets').val().split('\n');

    // compute keccak256 hash of each secret
    let rabbitHashes = rabbitSecrets.map(secret => keccak256(secret));

    const result = await writeContract(config, {
        address: contractAddress,
        abi: contractABI,
        functionName: 'addSet',
        chainId: optimismSepolia.id,
        args: [artist_id, blockheight, shape, order, rabbitHashes, stonePriceWei],
    });



}

document.addEventListener('DOMContentLoaded', () => {

    const modal = createWeb3Modal({
        wagmiConfig: config,
        projectId,
    });

    window.addLiveSet = addLiveSet;

    // show the etherscan link
    // document.getElementById("contractEtherscanLink").href = `https://sepolia-optimism.etherscan.io/address/${contractAddress}#code`;
});