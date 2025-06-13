// What is this file for, really?  It's just a placeholder.
import '../styles/styles-common.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import * as popper from 'popper.js';
import { Dropdown } from 'bootstrap';
import * as bootstrap from 'bootstrap';
console.log("Here's some things");
console.log(popper);
console.log(Dropdown);

// index.js -> bundle.js

import QRCode from 'qrcode';

document.addEventListener('DOMContentLoaded', function () {

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