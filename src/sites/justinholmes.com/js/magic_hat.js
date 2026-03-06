import { createConfig, http, readContract, writeContract } from '@wagmi/core';
import { optimismSepolia } from '@wagmi/core/chains';
import Web3 from 'web3';
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
// const contractAddress = '0xD3564C0E5C3A78d507B2E039A8F519B195aBAF55';
// const contractAddress = '0xbce8A782aE58123D03747f8bf60FD2b1cCCD506a';
const contractAddress = '0xBcf07C8a9Fc60B6C173c113Fa7CFDC97C846Dcad';
const projectId = 'a685c805b45541d81547b86d86d97ff5'
import { mhABI as contractABI } from "../../../abi/magichatABI.js";


function keccak256(value) {
    return web3.utils.soliditySha3(value);
}

function getUrlParameters() {
    const params = new URLSearchParams(window.location.search);
    let paramObj = {};
    for (const [key, value] of params.entries()) {
        paramObj[key] = value;
    }
    return paramObj;
}


function verifyRabbit() {
    const secretRabbit = document.getElementById("secretRabbit");
    const url_params = getUrlParameters();
    secretRabbit.value = url_params.rabbit;

    // compute the keccak256 hash of the secretRabbit.value
    const hash = keccak256(secretRabbit.value);
    // check if the hash is in the valid_rabbit_hashes array
    if (valid_rabbit_hashes.includes(hash)) {
        // document.getElementById("verifyResult").innerHTML = "Valid rabbit";
        console.log("Valid rabbit");
    } else {
        // document.getElementById("verifyResult").innerHTML = "Invalid rabbit";
        tippy('verifyResult', { content: 'Invalid secret rabbit' });
        document.getElementById("donationModal").style.display = "none";
        document.getElementById("invalidRabbitErrorMessage").style.display = "block";
    }
}

async function makePayment() {
    const secretRabbit = document.getElementById("secretRabbit").value;
    const amount = document.getElementById("amount").value;

    window.web3 = web3
    console.log(web3.utils.toWei(amount, 'ether'))

    const result = await writeContract(config, {
        address: contractAddress,
        abi: contractABI,
        functionName: 'makePayment',
        chainId: optimismSepolia.id,
        args: [secretRabbit],
        value: web3.utils.toWei(amount, 'ether'),

    });

}

function showHash() {
    const secretRabbit = document.getElementById("secretRabbit");
    const url_params = getUrlParameters();
    secretRabbit.value = url_params.rabbit;

    // compute the keccak256 hash of the secretRabbit.value
    const hash = keccak256(secretRabbit.value);
    document.getElementById("rabbithash").innerHTML = hash;

    // show the jazzicon
    var el = jazzicon(48, hash);
    document.getElementById("rabbitHashIcon").appendChild(el);
}

function setAmount(amount) {
    document.getElementById("amount").value = amount;
}


document.addEventListener('DOMContentLoaded', () => {

    const modal = createWeb3Modal({
        wagmiConfig: config,
        projectId,
    });
    console.log("Modal created");

    window.makePayment = makePayment;
    window.setAmount = setAmount;
    verifyRabbit();
    showHash();
});

console.log("magic hat loaded");

