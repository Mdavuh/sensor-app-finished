const express = require('express');
const router = express.Router();
const timestamp = require('time-stamp');
var splunkBunyan = require("splunk-bunyan-logger");
var bunyan = require("bunyan");
const SplunkLogger = require("splunk-logging").Logger;

var fs = require('fs');
var data = fs.readFileSync('./data/gyroscope_db.json');
var gyroscopeData = [];

var FlakeIdGen = require('flake-idgen'),
    intformat = require('biguint-format'),
    generator = new FlakeIdGen()

gyroscopeData = JSON.parse(data);



router.get('/', (req, res, next) => {
    res.status(200).json({
        data: gyroscopeData
    })
});

router.get('/:gyroscope_id', (req, res, next) => {
    var id = req.params.gyroscope_id;
    var data = {};
    var df = false;

    if (id.toString() === 'all'){
        res.status(200).json({
            gyroscopeData
        });
        
        batchPayLoad();
        return;
    }

    for (let i = 0; i < gyroscopeData.length; i++) {
        data = gyroscopeData[i];
        if (data.gyroscope_id === parseInt(id)) {
            df = true;
            res.status(200).json({
                data: data
            });
            break;
        }
        console.log(data);
    }

    if (!df) {
        res.status(401).json({
            message: "data not found for gyroscope id: " + id
        });
    }
});

router.post('/', (req, res, next) => {

    var id = generator.next()
    var gid = intformat(id, 'dec');
    var time = timestamp.utc('YYYY-DD-MM HH:mm:ss.ms');
    var trip_id = req.body.trip_id;
    var x_value = req.body.x_value;
    var y_value = req.body.y_value;
    var z_value = req.body.z_value;

    console.log(trip_id);

    if ((!trip_id) ||
        (!x_value) ||
        (!y_value) ||
        (!z_value)) {
        res.status(401).json({
            message: 'Badly format JSON String. Required: trip_id, x_value, y_value, z_value',
        })
        return;
    }

    const data = {
        "gyroscope_id": gid,
        "trip_id": req.body.trip_id,
        "x_value": req.body.x_value,
        "y_value": req.body.y_value,
        "z_value": req.body.z_value,
        "timestamp": time.toString()
    }

    gyroscopeData.push(data);

    fs.writeFile('./data/gyroscope_db.json', JSON.stringify(gyroscopeData, null, 2), (err) => {
        if (err) console.log(err);
        console.log("Successfully Written to File");
    });

    //singlePayLoad(data);
    bunyanLogger(data);

    res.status(201).json({
        data: data
    });
});

function batchPayLoad() {

    var config = {
        token: "a4cfa836-2189-4144-a637-90a79814f486",
        url: "https://localhost:8088",
        maxBatchCount: 0
    }

    var Logger = new SplunkLogger(config);

    Logger.error = function (err, context) {
        console.log("error", err, "context", context);
    }

    var payload = {}
    var data = {};

    for (let i = 0; i < gyroscopeData.length; i++) {
        data = gyroscopeData[i];
        payload = {
            message: data,
            metadata: {
                source: "gyroscope sensor",
                index: "sensors_http_idx"
            },
            severity: "info"
        } 
        Logger.send(payload);
    }   

    Logger.flush(function (err, resp, body) {
        // If successful, body will be { text: 'Success', code: 0 }
        console.log("Response from Splunk", body);
    });
}

function bunyanLogger(data) {  

    var config = {
        token: "a4cfa836-2189-4144-a637-90a79814f486",
        url: "https://localhost:8088"
    }
    
    var splunkStream = splunkBunyan.createStream(config);
    
    // Note: splunkStream must be set to an element in the streams array
    var Logger = bunyan.createLogger({
        name: "Gyroscope Sensor Logger",
        streams: [
            splunkStream
        ]
    });
    
    var payload = data;
    
    console.log("Sending payload", payload);
    Logger.info(payload, "Gyroscope Sensor Metrics");   
}    

module.exports = router;
