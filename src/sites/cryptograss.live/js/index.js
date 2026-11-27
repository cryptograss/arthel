// Every page of cryptograss.live loads this: its styles, the menu, and the ticket stubs' QR codes.
// (Bootstrap first, so the site's own sheets have the last word.)
import 'bootstrap/dist/css/bootstrap.min.css';
import '../styles/styles-common.css';
import '../styles/site.css';
import * as popper from 'popper.js';
import { Dropdown } from 'bootstrap';
import * as bootstrap from 'bootstrap';
console.log("Here's some things");
console.log(popper);
console.log(Dropdown);

// index.js -> bundle.js

import QRCode from 'qrcode';

document.addEventListener('DOMContentLoaded', function () {

    // The menu, on a phone: one button, and the list behind it.
    const toggle = document.querySelector('.cg-nav-toggle');
    if (toggle) {
        toggle.addEventListener('click', function () {
            const open = toggle.closest('.cg-nav').classList.toggle('is-open');
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
    }

    // QR codes for bare secrets
    document.querySelectorAll('[data-qr-token]').forEach(canvas => {
        const tokenId = canvas.dataset.qrToken;
        const secret = canvas.dataset.qrSecret;
        QRCode.toCanvas(canvas, secret, {
            color: {
                dark: '#023712',
                light: '#0000'
            }
        }, function (error) {
            if (error) console.error(error)
            console.log('QR code generated for token ' + tokenId);
        })
    });

    // QR codes for the same secrets in a URL
    document.querySelectorAll('[data-uri-qr-token]').forEach(canvas => {
        const tokenId = canvas.dataset.uriQrToken;
        const secret = canvas.dataset.uriQrSecret;
        const url = "https://cryptograss.live/blox-office/ticketstubs/claim/" + tokenId + "?secret=" + secret;
        QRCode.toCanvas(canvas, url, {
            color: {
                dark: '#370e02',
                light: '#0000' // Transparent background
            }
        }, function (error) {
            if (error) console.error(error)
            console.log('QR code generated for token ' + tokenId);
        })
    });
});