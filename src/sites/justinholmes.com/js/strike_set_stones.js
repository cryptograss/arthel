import { createConfig, http, writeContract, getAccount, connect } from '@wagmi/core';
import { optimismSepolia, arbitrum } from '@wagmi/core/chains';
import Web3 from 'web3';
import { createWeb3Modal } from '@web3modal/wagmi'
import tippy from 'tippy.js';
import 'tippy.js/dist/tippy.css'; // optional for styling
import jazzicon from 'jazzicon';
import { generateDiamondPattern, generateDiamondPatternFromNesPalette } from '../../../build_logic/graphics/setstone_drawing.js';
import { nesPalette } from '../../../build_logic/graphics/palettes.js';
import { setStoneContractAddress } from '../../../build_logic/constants.js';
import { watchConnections } from '@wagmi/core'
import { Toast } from 'bootstrap';
import $ from 'jquery';
import nunjucks from "nunjucks";


export const config = createConfig({
    chains: [optimismSepolia, arbitrum],
    transports: {
        [optimismSepolia.id]: http(),
        [arbitrum.id]: http(),
    },
})

const web3 = new Web3();
const projectId = '3e6e7e58a5918c44fa42816d90b735a6';
import { setStoneABI } from "../../../abi/setStoneABI.js";


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

function populateRabbitFromUrlParams() {
    const url_params = getUrlParameters();
    let rabbit = url_params.rabbit || '';

    // Fill input with id 'rabbit'
    document.getElementById('rabbit').value = rabbit;

}

function verifyRabbit() {

    const rabbit = document.getElementById('rabbit').value;
    // compute the weccak256 hash of the secretRabbit.value
    let hash = keccak256(rabbit);
    // check if the hash is in the valid_rabbit_hashes array

    console.log("hash", hash);
    document.getElementById("rabbithash").innerHTML = hash.slice(2, 12);
    $("#rabbithash").css({ color: "black" });

    // show the jazzicon
    let hexHash = hash.slice(2, 12);
    let jazzicon_seed = parseInt(hexHash, 16)
    console.log(jazzicon_seed);
    let jazz_of_hash = jazzicon(48, jazzicon_seed);
    document.getElementById("rabbitHashIcon").innerHTML = jazz_of_hash.outerHTML;
    if (valid_rabbit_hashes.includes(hash)) {
        $("#rabbithash").css({ color: "green" });
        return rabbit;
    } else {
        tippy('#verifyResult', { content: 'Invalid secret rabbit' });
        $("#rabbithash").css({ color: "red" });
        return false;
    }
}

function fillInFavoriteSongPicker() {
    // take the selected set value
    const setPicker = document.getElementById("setPicker");
    const selectedSet = setPicker.value;
    if (selectedSet == "") { // the sets are not yet committed, before the show when the show page is live but the set is yet unknown
        return;
    }

    const favoriteSongPicker = document.getElementById("favoriteSongPicker");

    // clear the favoriteSongPicker
    favoriteSongPicker.innerHTML = "";

    const option = document.createElement('option');
    option.value = 0;
    option.innerHTML = " --------- ";
    favoriteSongPicker.appendChild(option);

    setSongs[selectedSet].forEach((song, index) => {
        const option = document.createElement('option');
        option.value = index + 1;
        option.innerHTML = song;
        favoriteSongPicker.appendChild(option);
    });

}


async function mintStone() {
    const account = getAccount(config);
    const address = account?.address;
    const secretRabbit = verifyRabbit();
    if (secretRabbit === false) {
        window.alert("That rabbit is no good.")
        return;
    }
    const amount = document.getElementById("amount").value;
    // TODO: Really?  We can't do this with WAGMI?
    window.web3 = web3;

    let stonePriceEth = web3.utils.fromWei(stone_price_wei.toString(), 'ether');

    if (Number(amount) < Number(stonePriceEth)) {
        let notEnoughEthToast = new Toast(document.getElementById('not-enough-eth-toast'));
        notEnoughEthToast.show();
        return;
    }


    if (!address) {
        let connectWalletToast = new Toast(document.getElementById('connect-wallet-toast'));
        connectWalletToast.show();
        return;
    }


    const order = document.getElementById("setPicker").value;


    // color1, color2, color3 are the indices of the colors in the nesPalette
    const color1 = Object.values(nesPalette).indexOf(document.getElementById("colorDropdown1").value);
    const color2 = Object.values(nesPalette).indexOf(document.getElementById("colorDropdown2").value);
    const color3 = Object.values(nesPalette).indexOf(document.getElementById("colorDropdown3").value);

    const crystalizationMessage = document.getElementById("crystalizationMessageText").value;
    const favoriteSong = document.getElementById("favoriteSongPicker").value;

    const args = [
        address,
        artist_id,
        blockheight,
        order,
        color1,
        color2,
        color3,
        crystalizationMessage,
        favoriteSong,
        secretRabbit
    ];

    const result = await writeContract(config, {
        address: setStoneContractAddress,
        abi: setStoneABI,
        functionName: 'mintStone',
        chainId: arbitrum.id,
        args: args,
        value: web3.utils.toWei(amount, 'ether'),

    });

}

function setAmount(amount) {
    document.getElementById("amount").value = amount;
}

function showStonePrice() {
    const stonePriceElement = document.getElementById("stonePrice");
    // convert value of the variable stone_price_wei to ETH

    const stonePriceEth = web3.utils.fromWei(stone_price_wei.toString(), 'ether');
    stonePriceElement.innerHTML = stonePriceEth + ' ETH';
}

function createColorDropdown(palette, dropdownId) {
    const dropdown = document.getElementById(dropdownId);

    for (const [colorName, colorValue] of Object.entries(palette)) {
        const option = document.createElement('option');
        option.value = colorValue;
        option.style.backgroundColor = colorValue;
        option.innerHTML = colorName;
        dropdown.appendChild(option);
    }
    dropdown.addEventListener('change', () => onColorChange(dropdownId));
}

function createColorDropdowns() {
    createColorDropdown(nesPalette, 'colorDropdown1');
    createColorDropdown(nesPalette, 'colorDropdown2');
    createColorDropdown(nesPalette, 'colorDropdown3');
    randomizeColors();
}

function onColorChange(colorDropdownId) {
    const colorDropdown = document.getElementById(colorDropdownId);
    const color = colorDropdown.value;

    // set the current selected color as the background color of the dropdown
    colorDropdown.style.backgroundColor = color;
    renderSetStone();
}

function renderSetStone() {
    const stoneRenderArea = document.getElementById("stoneRenderArea");
    // clean the stoneRenderArea
    stoneRenderArea.innerHTML = "";

    const color1 = document.getElementById('colorDropdown1').value;
    const color2 = document.getElementById('colorDropdown2').value;
    const color3 = document.getElementById('colorDropdown3').value;

    generateDiamondPattern(color1, color2, color3, "transparent", "stoneRenderArea");

}

function randomizeColors() {
    let dropdowns = [document.getElementById('colorDropdown1'), document.getElementById('colorDropdown2'), document.getElementById('colorDropdown3')]

    // randomize the selected color of each dropdown
    // select random color from the nesPalette

    dropdowns.forEach(dropdown => {
        const randomColorIndex = Math.floor(Math.random() * Object.keys(nesPalette).length);
        // select randomColorIndex-th option from the dropdown
        dropdown.selectedIndex = randomColorIndex;
        onColorChange(dropdown.id);
    });
}

// TODO: This needs to be generalized and moved alongside other trophy case rendering logic.
async function renderOwnedVowelSoundArtifacts(address) {
    // filter the vowelSoundContributions array to only include the contributions of the given address
    const filteredVowelSoundContributions = vowelSoundContributions.filter(contribution => contribution.address === address);
    console.log(filteredVowelSoundContributions);

    // get the unrendered ownedVowelSoundArtifacts from the servernunjucks
    const large_vowel_sounds_artifact_display_response = await fetch('/partials/owned_vowelsound_artifacts.njk');
    const templateText = await large_vowel_sounds_artifact_display_response.text();

    const small_trophycase_response = await fetch('/partials/small_trophycase.njk');
    const small_trophycase_template = await small_trophycase_response.text();

    // Compile the templates
    const template = nunjucks.compile(templateText);

    // TODO: Better for this to live somewhere else, where Set Stones, Blue Railroads, Ursa Minors, etc. can also be rendered
    const compiled_small_trophycase_template = nunjucks.compile(small_trophycase_template);

    // Render the template with the context
    const renderedHtml = template.render({ artifacts: filteredVowelSoundContributions });

    // Append the rendered HTML to the DOM
    document.getElementById('vowelSoundContributions').innerHTML = renderedHtml;

    // Render the small trophy case
    const rendered_small_trophycase = compiled_small_trophycase_template.render({ artifacts: filteredVowelSoundContributions });

    document.getElementById('top-fixed-area').innerHTML = rendered_small_trophycase;

}

watchConnections(config, {
    onChange(data) {

        // Check if the wallet is connected
        const account = getAccount(config);
        if (account.isConnected) {
            console.log('Wallet is connected:', account.address);
            renderOwnedVowelSoundArtifacts(account.address);
            // You can add additional logic here for when the wallet is connected
        }
    },
})


document.addEventListener('DOMContentLoaded', () => {
    if (window.this_show_has_set_stones !== true) {
        return;
    }
    console.log("This page uses set stones.  We'll proceed.");
    tippy('[data-tippy-content]');

    const modal = createWeb3Modal({
        wagmiConfig: config,
        projectId,
    });

    window.mintStone = mintStone;
    window.setAmount = setAmount;
    window.randomizeColors = randomizeColors;
    populateRabbitFromUrlParams();
    showStonePrice();
    createColorDropdowns();

    // Use jquery to bind verifyRabbit to the button
    $('#verifyRabbit').click(verifyRabbit);

    const setPicker = document.getElementById("setPicker");
    setPicker.addEventListener('change', fillInFavoriteSongPicker);
    fillInFavoriteSongPicker();
});