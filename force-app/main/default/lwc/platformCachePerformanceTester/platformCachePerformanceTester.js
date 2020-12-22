import { LightningElement, track } from 'lwc';
import { subscribe, unsubscribe, onError, setDebugFlag, isEmpEnabled }
    from 'lightning/empApi';

import getTestConfigMetadata from '@salesforce/apex/PerformanceTestServiceController.getTestConfigMetadata';
import executeTest from '@salesforce/apex/PerformanceTestServiceController.ExecuteTest';


export default class PlatformCachePerformanceTester extends LightningElement {
    channelName = '/event/PerformanceTestEvent__e';
    subscription = null;

    @track testConfigMetadata = [];
    @track testsStarted = false;

    intervalTimeInSeconds = 30 // 30 seconds
    intervalId;

    // Initializes the component
    connectedCallback() {

        // Retrieve the Map of tests from the apex controller
        getTestConfigMetadata()
        .then(response => {
            console.log(response);
            if (response) {
                // console.log('Test Configuration Data:\n' + JSON.stringify(response));
                this.testConfigMetadata = JSON.parse(response);
                // console.log(Object.keys(this.testConfigMetadata));
                // console.log(this.testConfigMetadata[0]);
                // this.initializeTestResults();
            }
        })
        .then( () => {
            this.initCardCharts();
        });

        // Subscribe the the platform event
        this.handleEventSubscribe();
    }

    /**
     * @description Start the testing process when the Start button is clicked by setting a javascript interval timer
     * that calls an apex method every N seconds to initiate the tests
     * @param {*} e
     */
    handleClickStartButton(e) {
        console.log('Starting Interval Timer at ' + this.intervalTimeInSeconds + ' seconds');
        this.intervalId = setInterval(() => {
            this.makeApexCalls();
        }, this.intervalTimeInSeconds * 1000);
        this.testsStarted = true;
    }

    handleClickStopButton(e) {
        console.log('Stop Interval Timer');
        clearInterval(this.intervalId);
        this.testsStarted = false;
    }

    handleIntervalChange(e) {
        this.intervalTimeInSeconds = e.detail.value;
    }

    /**
     * @description Subscribe to the Platform Event
     */
    handleEventSubscribe() {

        // Register event error listener
        this.registerEventErrorListener();

        // Invoke subscribe method of empApi. Pass reference to messageCallback
        subscribe(this.channelName, -1, (response) => {
                console.log(JSON.stringify(response.data.payload));
                this.handleCompletedTest(response.data.payload);
            }).then(response => {
                // Response contains the subscription information on subscribe call
                console.log('Subscription request sent to: ', JSON.stringify(response.channel));
                this.subscription = response;
        });
    }

    /**
     * @description When the platform event completes (not currently in use)
     * @param {} event
     */
    handleCompletedTest(event) {
        console.log('Event Response: ', event.Test_Type__c);
        this.recordTestResult(event.Test_Type__c, event.Test_Mode__c, event.Duration__c);
    }

    /**
     * @description When the test completes, update the data to allow the table and chart to be updated
     * @param {*} testType
     * @param {*} testMode
     * @param {*} duration
     */
    recordTestResult(testType, testMode, duration) {
        let test = null;
        this.testConfigMetadata.forEach((t) => {
            if (t.TestType === testType) {
                test = t;
            }
        });
        let testModeData = testMode === 'A' ? test.ModeA : test.ModeB;

        testModeData.TotalDuration += duration;
        testModeData.Counter++;
        testModeData.Durations.push(duration);
        testModeData.Average = this.trimmedAverage(testModeData.Durations);
        testModeData.HighVal = (duration > testModeData.HighVal ? duration : testModeData.HighVal);
        testModeData.LowVal = (duration < testModeData.LowVal  || testModeData.LowVal === 0.0 ? duration : testModeData.LowVal);

        this.updateChart(testType, duration, testMode === 'A' ? 0 : 1);
    }

    /**
     * @description Call the ExecuteTest() method with the test type and test mode. The duration is returned in milliseconds.
     */
    makeApexCalls() {
        this.testConfigMetadata.forEach((test) => {
            executeTest({"testName": test.TestType, "mode": "A"} )
            .then(response => {
                if (response) {
                    this.recordTestResult(test.TestType, "A", response);
                }
            });

            executeTest({"testName": test.TestType, "mode": "B"} )
            .then(response => {
                if (response) {
                    this.recordTestResult(test.TestType, "B", response);
                }
            });
        });

    }

    /**
     * @description Register the PlatformEvent Error Handler - this is needed for the subscription to work
     */
    registerEventErrorListener() {
        // Invoke onError empApi method
        onError(error => {
            console.log('Received error from server: ', JSON.stringify(error));
        });
    }

    /**
     * @description Mimicking TrimmedAvg() in Excel, this does a trim by excluding the high/low values that are more than
     * 3x the overall averge time.
     * @param {*} values
     */
    trimmedAverage(values) {
        let avg = this.average(values);
        let min = Math.min(values);
        let max = Math.max(values);

        if (values.length < 10) {
            return avg;
        }
        let newValues = [];
        let maxTrimmedValue = avg * 3;
        let minTrimmedValue = avg / 3;
        values.forEach( (v) => {
            if (v < maxTrimmedValue && v > minTrimmedValue) {
                newValues.push(v);
            }
        });

        return this.average(newValues);
    }

    /**
     * @description Calculate the average over a set of values
     * @param {*} values
     */
    average(values) {
        return values.reduce((a, b) => (a + b)) / values.length;
    }

    /**
     * @description Return the collection of child Card components
     */
    get cardComponents() {
        return this.template.querySelectorAll('[data-id="test-card"]');
    }

    /**
     * @description Initialize the chart on each card component
     */
    initCardCharts() {
        const cards = this.cardComponents;
        cards.forEach( (c) => {
            c.loadChart();
        });
    }

    /**
     * @description Update the chart on the card for the specific test
     * @param {*} testType
     * @param {*} newValue
     * @param {*} series
     */
    updateChart(testType, newValue, series) {
        const card = this.template.querySelectorAll('[data-type="' + testType + '"]')[0];
        card.updateChart(newValue, series);
    }

}