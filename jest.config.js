export default {
    testEnvironment: 'node',
    setupFiles: [ "<rootDir>/__tests__/setup_time_data.cjs" ],
    "transform": {

        "^.+\\.[t|j]sx?$": "babel-jest"
      }
};
