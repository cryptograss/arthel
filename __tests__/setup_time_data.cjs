// The suite's show times: the committed fixture, not the fetched file
// (see src/build_logic/chaindata_db.js, and scripts/make_test_time_data.mjs
// to regenerate it).
process.env.TEST_TIME_DATA = 'true';