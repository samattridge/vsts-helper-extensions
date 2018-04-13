"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const tl = require("vsts-task-lib/task");
const path = require("path");
const fs = require("fs");
const xml2js_1 = require("xml2js");
const Influx = require("influx");
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
function isNullOrWhitespace(input) {
    if (typeof input === 'undefined' || input === null) {
        return true;
    }
    return input.replace(/\s/g, '').length < 1;
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            tl.setResourcePath(path.join(__dirname, '/../publishtestresultstoinfluxdb/task.json'));
            const testFolder = './scripts/testData/publishtestresultstoinfluxdb';
            const testResultFormat = tl.getInput('testResultFormat', true);
            const testResultsFiles = tl.getDelimitedInput('testResultsFiles', '\n', true);
            const influxDBHost = tl.getInput('influxDBHost', true);
            const influxDBSSL = tl.getInput('influxDBSSL');
            const influxDBUser = tl.getInput('influxDBUser');
            const influxDBPassword = tl.getInput('influxDBPassword');
            const influxDBDatabase = tl.getInput('influxDBDatabase', true);
            const createInfluxDBDatabase = tl.getInput('createInfluxDBDatabase');
            const testIdentifier = tl.getInput('testIdentifier', true);
            let searchFolder = tl.getInput('searchFolder');
            tl.debug('testResultFormat: ' + testResultFormat);
            tl.debug('testResultsFiles: ' + testResultsFiles);
            tl.debug('influxDBHost: ' + influxDBHost);
            tl.debug('influxDBSSL: ' + influxDBSSL);
            tl.debug('influxDBUser: ' + influxDBUser);
            tl.debug('influxDBPassword: ' + influxDBPassword);
            tl.debug('influxDBDatabase: ' + influxDBDatabase);
            tl.debug('createInfluxDBDatabase: ' + createInfluxDBDatabase);
            tl.debug('testIdentifier: ' + testIdentifier);
            let influxDBConnectionString = "http://";
            if (influxDBSSL) {
                influxDBConnectionString = "https://";
            }
            if (influxDBUser || influxDBPassword) {
                influxDBConnectionString += influxDBUser + ":" + influxDBPassword + "@";
            }
            influxDBConnectionString += influxDBHost;
            let influx;
            if (createInfluxDBDatabase) {
                influx = new Influx.InfluxDB(influxDBConnectionString);
                yield influx.createDatabase(influxDBDatabase);
                influxDBConnectionString += "/" + influxDBDatabase;
            }
            influx = new Influx.InfluxDB(influxDBConnectionString);
            if (isNullOrWhitespace(searchFolder)) {
                searchFolder = tl.getVariable('System.DefaultWorkingDirectory');
            }
            let matchingTestResultsFiles;
            try {
                matchingTestResultsFiles = tl.findMatch(searchFolder, testResultsFiles);
            }
            catch (error) {
                tl.debug('Error in find matching files : ' + error);
                tl.debug('Trying without following symlinks.');
                // Will remove this once we have right api in vsts-task-lib.
                const findOptions = {
                    followSpecifiedSymbolicLink: false,
                    followSymbolicLinks: false
                };
                matchingTestResultsFiles = tl.findMatch(searchFolder, testResultsFiles, findOptions);
            }
            const testResultsFilesCount = matchingTestResultsFiles ? matchingTestResultsFiles.length : 0;
            tl.debug(`Detected ${testResultsFilesCount} test result files`);
            let promises = [];
            let timeToParse = new Date().toUTCString();
            if (testResultsFilesCount === 0) {
                tl.warning('No test result files matching ' + testResultsFiles + ' were found.');
            }
            else {
                let files = fs.readdirSync(testFolder);
                for (let i = 0; i <= files.length; i++) {
                    let file = files[i];
                    console.log(file);
                    promises.push(new Promise((resolve, reject) => {
                        fs.readFile(testFolder + "/" + file, (err, data) => {
                            if (err) {
                                console.error(err);
                                reject(err);
                            }
                            else {
                                xml2js_1.parseString(data, (err, result) => {
                                    if (err) {
                                        console.error(err);
                                        reject(err);
                                    }
                                    else {
                                        console.dir(result);
                                        let suiteName = result.testsuite.$.name;
                                        result.testsuite.testcase.forEach(testcase => {
                                            let testPassed = true;
                                            if (testcase.failure) {
                                                testPassed = false;
                                            }
                                            let caseName = testcase.$.name;
                                            let timeTaken = testcase.$.time;
                                            influx.writeMeasurement("time_taken", [
                                                {
                                                    tags: {
                                                        host: testIdentifier
                                                    },
                                                    fields: {
                                                        time: timeTaken,
                                                        test: caseName
                                                    },
                                                    timestamp: timeToParse
                                                }
                                            ]);
                                        });
                                    }
                                });
                            }
                        });
                    }));
                }
            }
            Promise.all(promises)
                .then(() => {
                tl.setResult(tl.TaskResult.Succeeded, '');
            });
        }
        catch (err) {
            tl.setResult(tl.TaskResult.Failed, err.message);
        }
    });
}
run();
//# sourceMappingURL=publishtestresultstoinfluxdb.js.map