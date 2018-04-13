import tl = require('vsts-task-lib/task');
import trm = require('vsts-task-lib/toolrunner');
import * as path from 'path';
import fs = require('fs');
import { parseString } from "xml2js";
import Influx = require("influx");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

function isNullOrWhitespace(input: any) {
    if (typeof input === 'undefined' || input === null) {
        return true;
    }
    return input.replace(/\s/g, '').length < 1;
}

async function run() {
    try {
        tl.setResourcePath(path.join(__dirname, '/../publishtestresultstoinfluxdb/task.json'));

        const testFolder = './scripts/testData/publishtestresultstoinfluxdb';

        const testResultFormat = tl.getInput('testResultFormat', true);
        const testResultsFiles: string[] = tl.getDelimitedInput('testResultsFiles', '\n', true);
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
            influxDBConnectionString = "https://"
        }

        if (influxDBUser || influxDBPassword) {
            influxDBConnectionString += influxDBUser + ":" + influxDBPassword + "@";
        }
        
        influxDBConnectionString += influxDBHost;

        let influx: Influx.InfluxDB;

        if (createInfluxDBDatabase) {
            influx = new Influx.InfluxDB(influxDBConnectionString);
            await influx.createDatabase(influxDBDatabase);

            influxDBConnectionString += "/" + influxDBDatabase;
        }
        
        influx  = new Influx.InfluxDB(influxDBConnectionString);

        if (isNullOrWhitespace(searchFolder)) {
            searchFolder = tl.getVariable('System.DefaultWorkingDirectory');
        }

        let matchingTestResultsFiles: string [];
        try {
            matchingTestResultsFiles = tl.findMatch(searchFolder, testResultsFiles);
        }
        catch(error) {
            tl.debug('Error in find matching files : ' + error);
            tl.debug('Trying without following symlinks.');
            // Will remove this once we have right api in vsts-task-lib.
            const findOptions = <tl.FindOptions>{
                followSpecifiedSymbolicLink: false,
                followSymbolicLinks: false
            };
            matchingTestResultsFiles = tl.findMatch(searchFolder, testResultsFiles, findOptions);
        }        

        const testResultsFilesCount = matchingTestResultsFiles ? matchingTestResultsFiles.length : 0;

        tl.debug(`Detected ${testResultsFilesCount} test result files`);

        let promises: any = [];
        let timeToParse = new Date().toUTCString();

        if (testResultsFilesCount === 0) {
            tl.warning('No test result files matching ' + testResultsFiles + ' were found.');
        }
        else {
            let files = fs.readdirSync(testFolder);

            for(let i=0; i <= files.length; i++) {
                let file = files[i];

                console.log(file);

                promises.push(new Promise((resolve, reject) => {
                    fs.readFile(testFolder + "/" + file, (err, data) => {
                        if (err) {
                            console.error(err);
                            reject(err);
                        }
                        else {
                            parseString(data, (err, result) => {
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
        })
    }
    catch (err) {
        tl.setResult(tl.TaskResult.Failed, err.message);
    }
}

run();