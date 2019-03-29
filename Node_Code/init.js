// Run the following three commands to install the required dependancies
// npm init
// npm install express mqtt body-parser sapcai
// node init.js
const express = require('express')
const mqtt = require('mqtt')
const bodyParser = require('body-parser');
// recast.ai dependancy is used previously
// var recastai = require('recastai').default

// After recast.ai changed into sapconversational.ai
// the following package is needed instead
var recastai = require('sapcai').default

// Obtain bot token from telegram (sequence of 32 alphanumeric values)
var connect = new recastai.connect('specify_bot_token')

const client  = mqtt.connect('mqtt://iot.eclipse.org')
const PC_MC_mqtt = '/specify_mqtt_channel/PCtoMC'
const MC_PC_mqtt = '/specify_mqtt_channel/MCtoPC'


// Converstation ID in the format
// xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
var Conversation_ID = 'specify_conversation_id';

var CurrentSensorReading;
var alreadyCritical = false;

const app = express()
app.use(bodyParser.json());

// Here, port 3000 is used. The port can be changed as long as
// it is set to the same port number when calling "ngrok http 3000"
app.listen(3000, () => console.log('Example app listening on port 3000!'))



// function to parse which information is requested by the user
// and replies accordingly.
// It publishes an MQTT message=1 when the user requests to clear
// the critical state message.
app.post('/mqtt_ping', (req, res) => {
  const memory = req.body.conversation.memory;
  Conversation_ID = req.body.conversation.id;
  debugger;
  const temperature = memory.temperature;
  const humidity = memory.humidity;
  const moisture = memory.moisture;
  const proximity = memory.proximity;
  const state = memory.state;
  const clear = memory.clear;
  const critical = memory.critical;

  var retMessage;

  if (typeof temperature != 'undefined'){
    client.publish(PC_MC_mqtt, '0');
    if (typeof CurrentSensorReading.T != 'undefined'){
      retMessage=[{
        type: 'text',
        content: "My temperature is now " + CurrentSensorReading.T.toString() + " *C ",
      }];
    }
  } else if (typeof humidity != 'undefined'){
    client.publish(PC_MC_mqtt, '0');
    if (typeof CurrentSensorReading.H != 'undefined'){
      retMessage=[{
        type: 'text',
        content: "The humidity is now " + CurrentSensorReading.H.toString() + " %\t",
      }];
    }
  } else if (typeof moisture != 'undefined'){
    client.publish(PC_MC_mqtt, '0');
    if (typeof CurrentSensorReading.M != 'undefined'){
      retMessage=[{
        type: 'text',
        content: "My moisture sensor reads " + CurrentSensorReading.M.toString(),
      }];
    }
  } else if (typeof proximity != 'undefined'){
    client.publish(PC_MC_mqtt, '0');
    if (typeof CurrentSensorReading.P != 'undefined'){
      if (CurrentSensorReading.P == 0){
        retMessage=[{
          type: 'text',
          content: "No one :( , I hope you will visit soon...",
        }];
      } else {
        retMessage=[{
          type: 'text',
          content: "Yes!! There is someone taking care of me.",
        },{
          type: 'text',
          content: "I hope it is you.",} ];
      }

    }
  } else if (typeof state != 'undefined'){
    client.publish(PC_MC_mqtt, '0');
    var finalstate = true;
    if (typeof CurrentSensorReading.S_S != 'undefined'){
      if (CurrentSensorReading.S_S == 0){
        retMessage=[{
          type: 'text',
          content: "My temperature and humidity sensor is down...",
        }];
        finalstate = false;
      } else {
        retMessage=[{
          type: 'text',
          content: "My temperature and humidity sensor is working fine...",
        }];
      }
    }
    if (typeof CurrentSensorReading.S_T != 'undefined'){
      if (CurrentSensorReading.S_T == 0){
        retMessage.push({
          type: 'text',
          content: "My temperature is too low...",
        });
        finalstate = false;
      } else if (CurrentSensorReading.S_T == 2){
        retMessage.push({
          type: 'text',
          content: "My temperature is too high...",
        });
        finalstate = false;
      } else {
        retMessage.push({
          type: 'text',
          content: "The current temperature suits me just fine...",
        });
      }
    }
    if (typeof CurrentSensorReading.S_H != 'undefined'){
      if (CurrentSensorReading.S_H == 0){
        retMessage.push({
          type: 'text',
          content: "The air is very dry and dehydrated...",
        });
        finalstate = false;
      } else if (CurrentSensorReading.S_H == 2){
        retMessage.push({
          type: 'text',
          content: "The air is very humid and moist...",
        });
        finalstate = false;
      } else {
        retMessage.push({
          type: 'text',
          content: "The humidity is just how I like it...",
        });
      }
    }
    if (typeof CurrentSensorReading.S_M != 'undefined'){
      if (CurrentSensorReading.S_M == 0){
        retMessage.push({
          type: 'text',
          content: "I need some water though...",
        });
        finalstate = false;
      } else if (CurrentSensorReading.S_M == 2){
        retMessage.push({
          type: 'text',
          content: "I have more than enough water for now...",
        });
        finalstate = false;
      } else {
        retMessage.push({
          type: 'text',
          content: "My soil is well watered...",
        });
      }
    }
    if (finalstate == false) {
      retMessage.push({
        type: 'text',
        content: "I need some more attention!!",
      });
    }else{
      retMessage.push({
        type: 'text',
        content: "I hope other plants will get someone like you!!",
      },{
        type: 'text',
        content: "You are taking good care of me.",
      });
    }

  } else if ((typeof clear != 'undefined') && (typeof critical != 'undefined')){
    client.publish(PC_MC_mqtt, '1');
    retMessage=[{
      type: 'text',
      content: "Clearing the critical state in a sec.",
    },{
      type: 'text',
      content: "That was close!! Try to check up on me more often ;)",
    }];
    alreadyCritical = false;
  } else {
    client.publish(PC_MC_mqtt, '0');
    retMessage=[{
      type: 'text',
      content: "Can you repeat that? I did not get what you meant.",
    },];
  }
  res.json({
    replies:retMessage,
  });
})

client.on('connect', function () {
  client.subscribe(MC_PC_mqtt)
})

// funtion to parse the frequent MQTT messages sent by the uC
// and update the CurrentSensorReading values.
// It checks if one of the sensors is not working properly or
// one of the reading is out of normal range to send a message
// text message to the user.
client.on('message', function (MC_PC_mqtt, message) {
  console.log(message.toString())
  CurrentSensorReading = JSON.parse(message.toString());

  if ((CurrentSensorReading.S_S == 0) && (alreadyCritical==false)){
    const messages = [
      {
        type: 'text',
        content: 'Critical state: Temp./Humidity sensor is down',
      }
    ]
    connect.sendMessage(messages, Conversation_ID)
      .then(function(){
        console.log('Message successfully sent')
        alreadyCritical = true;
      })
      .catch(function() {
        console.log('An error occured while sending message')
      })
  }

  if ((CurrentSensorReading.S_M != 1) && (alreadyCritical==false)){
    const messages = [
      {
        type: 'text',
        content: 'Critical state: Soil needs some care!!',
      }
    ]
    connect.sendMessage(messages, Conversation_ID)
      .then(function(){
        console.log('Message successfully sent')
        alreadyCritical = true;
      })
      .catch(function() {
        console.log('An error occured while sending message')
      })
  }

  if ((typeof CurrentSensorReading.S_T != 'undefined') && (CurrentSensorReading.S_T != 1)  && (alreadyCritical==false)){
    const messages = [
      {
        type: 'text',
        content: 'Critical state: The temperature is no longer suitable for me!!',
      }
    ]
    connect.sendMessage(messages,Conversation_ID)
      .then(function(){
        console.log('Message successfully sent')
        alreadyCritical = true;
      })
      .catch(function() {
        console.log('An error occured while sending message')
      })
  }

  if ((typeof CurrentSensorReading.S_H != 'undefined') && (CurrentSensorReading.S_H != 1)  && (alreadyCritical==false)){
    const messages = [
      {
        type: 'text',
        content: 'Critical state: Aghh this humidity is unbearable... ',
      }
    ]
    connect.sendMessage(messages, Conversation_ID)
      .then(function(){
        console.log('Message successfully sent')
        alreadyCritical = true;
      })
      .catch(function() {
        console.log('An error occured while sending message')
      })
  }
})
