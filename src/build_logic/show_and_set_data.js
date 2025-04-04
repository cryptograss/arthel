import { createCanvas } from 'canvas';
import { Chart, registerables } from 'chart.js';
import { fileURLToPath } from "url";
import yaml from 'js-yaml';
import path from "path";
import fs from "fs";
import { slugify } from "./utils/text_utils.js";
import { deserializeTimeData } from "./chaindata_db.js";

import { DateTime } from 'luxon';
import { getProjectDirs } from "./locations.js";



let songAndSetData = null;

export function processShowAndSetData() {

    const { dataDir, imagesSourceDir, showsDir } = getProjectDirs();

    // Log the time.
    console.time("Show and Song Data");

    Chart.register(...registerables);
    Chart.defaults.color = '#fff';


    // Make a 'graphs' directory in the images directory.
    const graphsDir = path.join(imagesSourceDir, 'graphs');
    if (!fs.existsSync(graphsDir)) {
        fs.mkdirSync(graphsDir, { recursive: true });
    }

    const liveShowYAMLs = fs.readdirSync(showsDir);

    let shows = {};
    let songs = {};
    let songAlternateNames = {};
    let songShorthands = {};
    let allSongPlays = [];
    let tours = {};
    let pickers = {};


    /// FIRST LOOP: SONG AND TUNE YAML FILES ///

    let songYAMLFiles = fs.readdirSync(path.resolve(dataDir, 'songs_and_tunes'));

    // Find only files that have the .yaml extension.
    songYAMLFiles = songYAMLFiles.filter(file => file.endsWith('.yaml'));

    const time_data = deserializeTimeData();

    for (let i = 0; i < songYAMLFiles.length; i++) {
        let songYAML = songYAMLFiles[i];

        let songYAMLFile = fs.readFileSync(path.resolve(dataDir, 'songs_and_tunes', songYAML));
        let song = yaml.load(songYAMLFile);
        song.plays = [];

        let songSlug;

        // If the song has a primary display name, use that as the title and slug.
        if (song.hasOwnProperty('primary_display_name')) {
            song.title = song['primary_display_name'];
            songSlug = slugify(song['primary_display_name']);

            // And add the filename slug as a shorthand.
            // TODO: Is this still relevant?
            songShorthands[songSlug] = slugify(song['primary_display_name']);
        } else {
            songSlug = songYAML.split('.')[0];
        }
        songs[songSlug] = song;
        song.slug = songSlug;
        song.resource_url = `/songs/${songSlug}`;
        // Also slugify any alternate names and add them.
        if (song.hasOwnProperty('alternate_names')) {
            for (let alt_name of song['alternate_names']) {
                songAlternateNames[slugify(alt_name)] = songSlug;
            }
        }
    } // First song loop.


    ////////////// YAMLs of Full Shows //////////////
    // Sort liveShowYAMLs in reverse (so that most recent shows are first)..

    let liveShowIDs = [];
    for (let i = 0; i < liveShowYAMLs.length; i++) {
        let showYAML = liveShowYAMLs[i];
        let showID = showYAML.split('.')[0];
        let artistID = showID.split('-')[0];
        let blockheight = parseInt(showID.split('-')[1]);

        // TOOD: Every chain data fetch needs to store as a top level object the various block heights.  Let's use that to specifically mark that a show is in the future so that we can style future shows differently.


        let showYAMLFile = fs.readFileSync(path.resolve(showsDir, showYAML));
        let showYAMLData = yaml.load(showYAMLFile);
        showYAMLData['show_id'] = showID; // TODO: Better modeling somehow.  WWDD?
        if (time_data.hasOwnProperty(showID)) {
            const show_epoch_time = parseInt(time_data[showID]);
            const show_timezone = showYAMLData['timezone'];

            const local_dt = DateTime.fromSeconds(show_epoch_time, { zone: show_timezone });
            const utc_dt = DateTime.fromSeconds(show_epoch_time, { zone: "UTC" });
            showYAMLData['local_datetime_full'] = local_dt.toLocaleString(DateTime.DATETIME_FULL)
            showYAMLData['utc_datetime_full'] = utc_dt.toLocaleString(DateTime.DATETIME_FULL)

            // Also save strings as dates only.
            showYAMLData['local_date'] = local_dt.toLocaleString(DateTime.DATE_FULL)

            showYAMLData["epoch_time"] = show_epoch_time;
        } else {
            throw new Error("No time data for show " + showID + ".  Probably need to get time data.");
        }

        // If show is part of a tour, add it to that tour.
        if (showYAMLData.hasOwnProperty('tour')) {
            let tour = showYAMLData['tour'];

            if (!tours.hasOwnProperty(tour)) {
                tours[tour] = [];
            }

            tours[tour].push(showID);
        }

        // Get the pickers from the ensemble object.
        if (showYAMLData.hasOwnProperty('ensemble')) {
            for (let [picker, instruments] of Object.entries(showYAMLData['ensemble'])) {
                if (!pickers.hasOwnProperty(picker)) {
                    const picker_slug = slugify(picker)
                    pickers[picker] = {
                        resource_url: `/pickers/${picker_slug}`,
                        shows: {}
                    };
                }
                pickers[picker]["shows"][showID] = instruments
            }
        }

        shows[showID] = showYAMLData;
        shows[showID]['resource_url'] = `/shows/${showID}`; // TODO Where does this logic really belong?
        // Arguably redundant, but we'll add the artist ID and blockheight to the showYAMLData.
        showYAMLData["artist_id"] = artistID;
        showYAMLData["blockheight"] = blockheight;

        if (showYAMLData['setlist-lost']) {  // There are some shows which we want to reflect, but whose setlist has been lost to time.
            showYAMLData['sets'] = {};
            continue;
        }

        let sets_in_this_show = {}

        // Iterate through sets, only if there are any.
        if (!showYAMLData.hasOwnProperty('sets')) {
            continue;
        }

        for (let [set_number, set] of Object.entries(showYAMLData['sets'])) {

            let this_set = {
                "songplays": [],
                "_show": showYAMLData,
                "set_number": set_number
            } // TODO: Better modeling somehow.  WWDD?


            // Now we'll iterate through the songs in this set.
            // Some of them will just be strings, while others will be objects, with songPlay details.
            for (let s = 0; s < set["songplays"].length; s++) {

                let songPlay = {
                    artistID: artistID,
                    showID: showID,
                    _set: this_set,
                }

                let songEntry = set["songplays"][s];

                let songName;
                if (typeof songEntry === 'string') {
                    songName = songEntry;
                } else {
                    songName = Object.keys(songEntry)[0]
                }

                let songSlug = slugify(songName);

                // Check to see if this song is being referenced by an alternate name.
                if (songAlternateNames.hasOwnProperty(songSlug)) {
                    songPlay['as_title'] = songName;
                    songSlug = songAlternateNames[songSlug];
                }
                // Check to see if the song is being referenced by a shorthand.
                if (songShorthands.hasOwnProperty(songSlug)) {
                    songSlug = songShorthands[songSlug];
                }

                let song;
                // Two possibilities: either we know about the song from its YAML, or we don't.
                if (songs.hasOwnProperty(songSlug)) {
                    // We read about this song when we read the YAMLs.
                    song = songs[songSlug];
                    song.slug = songSlug; // TODO: WWDD?  Just slugify it in a method.
                } else {
                    // We don't know about this song.
                    song = {
                        "plays": [],
                        "title": songName,
                        "slug": songSlug,
                        "undocumented": true,
                    };
                    songs[songSlug] = song; // It wasn't in the YAML files, so we'll add it to our songs list here.
                }

                // If the song doesn't have a primary display name, we'll use the songName as the title.
                // Note: This presents an odd situation where, if we list a song with titles that both slugify to the filename (ie, with different punctuation), we'll use the first one.
                if (!song.hasOwnProperty('title')) {
                    song.title = songName;
                }

                // Deal with the possible songplay-level properties that might be in the set YAML.
                if (typeof songEntry != 'string') {

                    for (let key in songEntry) {
                        if (key === songName) {
                            continue;
                        } else if (key === "performance_modification") {
                            // TODO: This is such a discrete piece of song logic; feels weird to handle it in a parsing loop.
                            if (songEntry[key] === "can") {
                                // TODO: Track this?
                                songPlay["detail"] = "(around the can)";
                            } else {
                                throw new Error("Unknown performance modification: " + songEntry[key]);
                            }
                        } else if (key === "ensemble-modifications") {
                            // TODO: Same - does this belong in a parsing loop?

                            const modifications = songEntry[key]

                            for (let [modification, detail] of Object.entries(modifications)) {
                                // TODO: Track this?
                                if (modification === "solo") {
                                    const soloist = detail;
                                    songPlay["detail"] = `(${soloist} Solo)`;
                                } else if (modification === "lead-vocal") {
                                    const vocalist = detail;
                                    songPlay["detail"] = `(${vocalist} Lead Vocal)`;
                                } else if (modification === "featuring") {
                                    // TODO: What if this piece has multiple modifications?

                                    songPlay["detail"] = "(feat. ";
                                    for (let featured_artist of detail) {

                                        const picker_slug = slugify(featured_artist)

                                        if (pickers.hasOwnProperty(picker_slug)) {
                                            pickers[featured_artist]["shows"][showID] = "featured"; // TODO: Show instrument(s) here.
                                        } else {

                                            pickers[featured_artist] = {
                                                resource_url: `/pickers/${picker_slug}.html`,
                                                shows: { [showID]: "featured" } // TODO: Show instrument(s) here.
                                            }
                                        }

                                        songPlay["detail"] += featured_artist;
                                    }
                                    songPlay["detail"] += ")";
                                } else {
                                    throw new Error("Unknown performance modification: " + songEntry[key]);
                                }
                            }
                        } else if (key === "mode") {
                            songPlay['mode'] = songEntry[key];
                        } else if (key === "scratch_reason") {
                            if (songEntry["mode"] === "scratch") {
                                songPlay.scratch_reason = songEntry['scratch_reason'];
                            } else {
                                raise
                                new Error("Can't have a scratch_reason if song isn't scratched.");
                            }
                        } else {
                            throw new Error("Unknown song property: " + key);
                        }
                    }
                }

                // Teases and reprises are just for the setlist; don't count them in the list of plays for a song.
                if (songPlay.mode !== "tease" && songPlay.mode !== "reprise" && songPlay.mode !== "scratch") {
                    song.plays.push(songPlay);
                }

                // If there are Set Stones for this set, note that on the song.
                // TODO: Genericize this for other merch.
                if (songPlay._set._show.hasOwnProperty("has_set_stones_available")) {
                    console.log("llamas");
                }
                // TODO: What's going on here?
                // if (set.hasOwnProperty('setstones')) {
                //     songPlay['set_stones'] = set['set_stones'];
                // }

                songPlay._song = song;
                songPlay['songSlug'] = songSlug; // TODO: WWDD?  This can be a method.

                // Add it back into the set.
                this_set.songplays.push(songPlay);

                // And push this songPlay to all songPlays.
                allSongPlays.push(songPlay); // TODO: Why?  Do we use this for something?

                sets_in_this_show[set_number] = this_set;
            } // Songs loop (turns songs into objects)

            showYAMLData['sets'] = sets_in_this_show;
            showYAMLData['number_of_sets'] = Object.keys(sets_in_this_show).length

        } // Sets loop

    } // Shows loop

    // Now that we've dealt with songPLays, we'll loop through songs again, adding details to our other objects.

    let songsByProvenance = {
        'original': [],
        'traditional': [],
        'cover': [],
        'video_game': [],
        'film': [],
        'one-off': []
    };
    let songsByArtist = {}; // #TODO: Implement this.
    let songsByVideoGame = {};

    // Iterate through allSongs.
    // We're going to add details to the songs.
    Object.entries(songs).forEach(([songSlug, songObject]) => {

        // Note traditionals.
        if (songObject.hasOwnProperty('traditional')) {
            // TODO: Sometimes, we display songs as traditional, but influenced by a particular artist.
            // For example, we call 'circle' a "Carter Family Traditional".
            // Is this a function of the song?  Of the songplay (ie, only when we play it like they did)?
            // how do we reflect it?
            songsByProvenance['traditional'].push(songObject);
        }

        // Video game tunes.
        if (songObject.hasOwnProperty('video_game')) {
            songsByProvenance['video_game'].push(songObject);
            if (!songsByVideoGame.hasOwnProperty(songObject['video_game'])) {
                songsByVideoGame[songObject['video_game']] = [];
            }
            songsByVideoGame[songObject['video_game']].push(songObject);
        }

    }); // Second songs loop.


    // Iterate through songPlays and add the song details.
    for (const songPlay of allSongPlays) {

        let song = songPlay._song;

        // Sanity check: If the song has a by_artist_id, it should not have a by_artist.
        if (song.hasOwnProperty('by_artist_id') && song.hasOwnProperty('by_artist')) {
            throw new Error("Song has both by_artist_id and by_artist.  This is not allowed.");
        }

        // Determine the provenances: original, traditional, cover, or video game tune.

        // Songs with explicit artist ID (ie, an artist already in our data ecosystem).
        if (song.hasOwnProperty('by_artist_id')) {
            if (song['by_artist_id'] === parseInt(songPlay.artistID)) {
                // The artist ID of the song is the same of the artist ID of the show.
                // Thus, this is an original.
                songPlay['provenance'] = 'original';
                songsByProvenance['original'].push(song);
            } else {
                // This is a cover of another cryptograss artist!  Awesome.
                // TODO: Someday we'll handle this.  But for now, we'll throw an error.
                throw new Error("Need to add support for covers of other cryptograss artists."); // TODO
            }
        }

        // Songs with explicit artist name (ie, an artist not in our data ecosystem).
        if (song.hasOwnProperty('by_artist')) {

            // If the artist is in the ensemble, we'll add a detail that it's "via" that artist.

            // Sanity check.
            if (songPlay._set._show.ensemble == undefined) {
                throw new Error("Show ensemble for this show is undefined, so we can't check whether this song is an original or cover.");
            }


            if (songPlay._set._show.ensemble.hasOwnProperty(song['by_artist'])) {
                songPlay['provenance'] = 'cover';
                songPlay['detail'] = `(via ${song['by_artist']})`;
                songsByProvenance['cover'].push(song); // TODO: Again, this needs to be forward-compatible with other artists using the service.  The matter of whether it's a cover depends on who is playing it.
            } else {
                songPlay['provenance'] = 'cover';
                songsByProvenance['cover'].push(song); // TODO: Again, this needs to be forward-compatible with other artists using the service.  The matter of whether it's a cover depends on who is playing it.
            }
        }


        // Now, traditionals.
        if (song.hasOwnProperty('traditional')) {
            songPlay['provenance'] = 'traditional';
        }

        // Video game tunes.
        if (song.hasOwnProperty('video_game')) {
            // TODO: Is it possible for a video game tune to be an original?
            songPlay['provenance'] = 'video_game';
        }
        // Film tunes.
        if (song.hasOwnProperty('film')) {
            // TODO: Is it possible for a film tune to be an original?
            songPlay['provenance'] = 'film';
        }
        // For now, songs that are undocumented will be considered one-offs.
        if (song.hasOwnProperty('undocumented')) {
            songsByProvenance['one-off'].push(song);
            songPlay['provenance'] = 'one-off';
        }

        // Sanity check: did we set a provenance?
        if (!songPlay.hasOwnProperty('provenance')) {
            throw new Error("SongPlay does not have provenance; seems like an impossible state.");
        }


    } // songPlays loop

    // Now, we'll go through each set again and make a graph for song provenance.
    for (let [showID, show] of Object.entries(shows)) {
        if (show.title == 'Allo DAO Summoning') {
            console.log("here's the busted one")
        }
        let show_provenances = {
            'original': 0,
            'traditional': 0,
            'cover': 0,
            'video_game': 0,
            'film': 0,
            'one-off': 0
        };

        // If the show has no sets, we'll continue iteration.
        if (!show.hasOwnProperty('sets')) {
            continue; // TODO: But wait - it makes a graph anyway for a future show.  Why?  With Laura in Boulder.
        }

        for (let [set_number, set] of Object.entries(show['sets'])) {
            let set_provenances = {
                'original': 0,
                'traditional': 0,
                'cover': 0,
                'video_game': 0,
                'film': 0,
                'one-off': 0
            };
            for (let songPlay of Object.values(set['songplays'])) {
                if (songPlay.hasOwnProperty('provenance')) {
                    set_provenances[songPlay['provenance']] += 1;
                    show_provenances[songPlay['provenance']] += 1;
                } else {
                    throw new Error("SongPlay does not have provenance; seems like an impossible state.");
                }
            }
            ////////// GRAPH TIME //////////
            // TODO: Move to graphics directory?
            // Set up the canvas using the canvas library
            const width = 800;
            const height = 600;
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');

            const data = {
                labels: ['Originals', 'Traditionals', 'Covers', 'Video Game Tunes'],
                datasets: [
                    {
                        label: 'Song Breakdown',
                        data: [set_provenances['original'],
                        set_provenances['traditional'],
                        set_provenances['cover'],
                        set_provenances['video_game']],
                        backgroundColor: [
                            '#2F50D7',
                            'rgb(62,98,32)',
                            'rgb(206,159,6)',
                            'rgb(192, 4, 4)',
                        ],
                        borderColor: [
                            'rgba(255, 99, 132, 1)',
                            'rgba(54, 162, 235, 1)',
                            'rgba(255, 206, 86, 1)',
                            'rgba(75, 192, 192, 1)',
                            'rgba(153, 102, 255, 1)',
                            'rgba(255, 159, 64, 1)',
                        ],
                        borderWidth: 1,
                    },
                ],
            };

            const config = {
                type: 'doughnut',
                data: data,
                options: {
                    responsive: false, // Since we're rendering server-side, disable responsiveness
                    plugins: {
                        legend: {
                            maxWidth: 100,
                            position: 'bottom',
                            labels: {
                                font: {
                                    size: 38,
                                },
                                padding: 15,
                                textAlign: 'left',
                                boxWidth: 40,
                            },
                        },
                    },
                },
            };
            // Render the graph using Chart.js
            new Chart(ctx, config);


            // Save the graph as an image
            const buffer = canvas.toBuffer('image/png');
            let output_file_name = `${graphsDir}/${showID}-set-${set_number}-provenance.png`;

            fs.writeFileSync(output_file_name, buffer);
        } // Set loop

        // Now the graph for the full show.
        // TODO: Dehydrate this into one process, instead of one for sets and one for the whole show.
        // Set up the canvas using the canvas library
        const width = 800;
        const height = 600;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        const data = {
            labels: ['Originals', 'Traditionals', 'Covers', 'Video Game Tunes'],
            datasets: [
                {
                    label: 'Song Breakdown',
                    data: [show_provenances['original'],
                    show_provenances['traditional'],
                    show_provenances['cover'],
                    show_provenances['video_game']],
                    backgroundColor: [
                        '#2F50D7',
                        'rgb(62,98,32)',
                        'rgb(206,159,6)',
                        'rgb(192, 4, 4)',
                    ],
                    borderColor: [
                        'rgba(255, 99, 132, 1)',
                        'rgba(54, 162, 235, 1)',
                        'rgba(255, 206, 86, 1)',
                        'rgba(75, 192, 192, 1)',
                        'rgba(153, 102, 255, 1)',
                        'rgba(255, 159, 64, 1)',
                    ],
                    borderWidth: 1,
                },
            ],
        };

        const config = {
            type: 'doughnut',
            data: data,
            options: {
                responsive: false, // Since we're rendering server-side, disable responsiveness
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            font: {
                                size: 38,
                            },
                            textAlign: 'left',
                            boxWidth: 40, // Increase the box width for legend items
                        },
                    },
                },
            },
        };
        // Render the graph using Chart.js
        const provenance_graph_for_show = new Chart(ctx, config);

        // Save the graph as an image
        const buffer = canvas.toBuffer('image/png');
        let output_file_name = `${graphsDir}/${showID}-full-show-provenance.png`;

        fs.writeFileSync(output_file_name, buffer);
    }

    console.timeEnd("Show and Song Data");

    // sort shows by key, with largest numbers first
    shows = Object.fromEntries(Object.entries(shows).sort(function (a, b) {
        return parseInt(b[0].split('-')[1]) - parseInt(a[0].split('-')[1]);
    }));

    return { shows, songs, pickers, songsByVideoGame, songsByProvenance };

}

export function getShowAndSetData() {
    if (songAndSetData === null) {
        songAndSetData = processShowAndSetData();
    }
    return songAndSetData;
}

