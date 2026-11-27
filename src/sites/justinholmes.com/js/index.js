import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap';
import 'spotlight.js';
import '../styles/fonts.css';
import '../styles/styles-common.css';
import '../styles/webamp-chartifacts.css';
import '../styles/site.css';
import $ from 'jquery';

$(document).ready(function () {
    // The menu, on a phone: one button, and the list behind it.
    $('.jh-menu-toggle').on('click', function () {
        const open = $(this).closest('.jh-menu').toggleClass('is-open').hasClass('is-open');
        $(this).attr('aria-expanded', open ? 'true' : 'false');
    });

    // A tape: the video is asked for when it is pressed, and not before.
    $(document).on('click', '.jh-tape-screen', function () {
        const address = $(this).data('embed');
        if (!address) {
            return;
        }
        const frame = $('<iframe>', {
            src: address + (String(address).indexOf('?') === -1 ? '?' : '&') + 'autoplay=1',
            title: $(this).attr('aria-label') || 'Video',
            allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
            referrerpolicy: 'strict-origin-when-cross-origin',
            allowfullscreen: true,
        });
        $(this).replaceWith(frame);
    });

    // load assets/slogans.json
    if (!window.skipSloganUpdate) {
        $.getJSON('/assets/slogans.json', function (data) {
            const weightedChoices = [];
            for (const [weight, strings] of Object.entries(data)) {
                for (const string of strings) {
                    for (let i = 0; i < weight; i++) {
                        weightedChoices.push(string);
                    }
                }
            }
            const randomIndex = Math.floor(Math.random() * weightedChoices.length);
            $('#slogan').text(weightedChoices[randomIndex]);

        });
    }

    var video = $('video.bg');  // Get the video element
    var height = $(window).height();  // Get the window height

    $(window).on('scroll', function () {
        var scrollTop = $(this).scrollTop();  // Get current scroll position
        var opacity = 1 - ((scrollTop * 1.5) / height);  // Calculate new opacity (fades out at the height of one screen)
        video.css('opacity', opacity);  // Set the new opacity of the video
    });

    $('.nav-link.exclusive').on('click', function () {
        let group_name = $(this).data('group');
        let group_element = $('.' + group_name);

        let group_links = $('.nav-link.exclusive[data-group=' + group_name + ']');

        group_links.removeClass('active');
        $(this).addClass('active');

        let target_name = $(this).data('show');
        let target_element = $('#' + target_name);
        window.location.hash = target_name;

        // Hide members whose class names match the group variable.
        group_element.hide(0, function () {
            target_element.show();
        });
    });

    // URL hashes
    var hash = window.location.hash;
    if (hash) {
        let section = hash.substring(1);
        let target_button = $('.nav-link.exclusive[data-show=' + section + ']');
        let group_name = target_button.data('group');
        let group_element = $('.' + group_name);
        group_element.hide();

        let group_links = $('.nav-link.exclusive[data-group=' + group_name + ']');
        group_links.removeClass('active');
        target_button.addClass('active');

        var target_element = $('#' + hash.substring(1));
        target_element.show();

    }
});
