/**********************************************************
*  C code for an IoT connected Plant
*   - WiFi connection
*   - Sensor readings
*   - Send messages over Qtt
**********************************************************/

#include <WiFi.h>
#include <WiFiMulti.h>
#include <PubSubClient.h>
#include <ChainableLED.h>
#include "DHT.h"

#define WiFi_SSID "enter_ssid_here"     //Update  ssid
#define WiFi_PWD  "enter_password_here" //Update  password

/*****************************
* Define pins connected to the:
*  - Humidity and Temperature sensor
*  - Moisture sensor
*  - Proximity sensor
*  - Color LED
*****************************/
#define DHT_PIN 27
#define DHT_TYPE DHT11
#define MOISTURE_PIN A2
#define PROXIMITY_PIN 33
#define NUM_LEDS  1
#define LED_CLK_PIN 4
#define LED_DATA_PIN 21

/*****************************
* Define normal range (min-max values)
* for each sensor reading
*****************************/
#define T_min 15
#define T_max 30

#define H_min 40
#define H_max 70

#define M_min 900
#define M_max 1600

/*****************************
* Define colors for the LED controller
*****************************/
#define HUE_RED 0
#define HUE_GREEN 0.3
#define HUE_BLUE 0.5
#define HUE_VIOLET 0.7

/*****************************
* Define MQTT parameter for sharing messages
* between uC and the NodeJs code
*****************************/
#define PC_MC_mqtt "/specify_mqtt_channel/PCtoMC"
#define MC_PC_mqtt "/specify_mqtt_channel/MCtoPC"
#define MQTT_PORT 1883

char PlantState=0;
int PROXIMITY_STATE = 0;
char T_FreqNan = 0;
char H_FreqNan = 0;
char CRITICAL_STATE = false;
ChainableLED leds(LED_CLK_PIN, LED_DATA_PIN, NUM_LEDS);

WiFiMulti WiFiMulti;
IPAddress server(198,41,30,241);

DHT dht(DHT_PIN, DHT_TYPE);
WiFiClient wifiClient;

void callback(char* topic, byte* payload, unsigned int length) {
  Serial.print("Message arrived [");
  Serial.print(topic);
  Serial.print("] ");
  for (int i=0;i<length;i++) {
    Serial.print((char)payload[i]);
  }
  Serial.println();
  PlayLED();

  // Once a specific message is received (clear critical state), 
  // the critical state is cleared
  // indicating that the user fixed the problem
  if (payload[0]=='1'){
    CRITICAL_STATE = false;
  }
}
PubSubClient client(server, MQTT_PORT, callback, wifiClient);



int ReadAllSensor(){
  float readingFloat=0;
  int readingInt=0;
  char readingString[16];
  char response[80];


  /*****************************
  * Constructing the reading message
  * that is transmitted to the Node Js code 
  * with the following format:
  * { "T":XXX.XX, "S_T":X, "H":XXX.XX, "S_H":X, "S_S":X, "M":XX, "S_M":X, "P":X }
  * T, H, M, P hold the current reading values
  * S_T, S_H, S_S (state sensor), S_M, hold the state of each sensor
  * The state value can take 0: less than min, 1: normal, 2: more than maximum
  *****************************/
  //Getting temperature reading
  readingFloat = dht.readTemperature();
  Serial.print("Temperature: ");
  Serial.print(readingFloat);
  Serial.print(" *C ");
  strcpy (response,  "{ \"T\":");
  sprintf(readingString, "%5.2f", readingFloat);
  if (readingString[4] !='n'){
    strcat(response,readingString);
    T_FreqNan = 0;
    if (readingFloat > T_max){
      strcat(response,", \"S_T\":2");
      Serial.println("Temp. out of range");
      CRITICAL_STATE = true;
    } else if (readingFloat < T_min){
      strcat(response,", \"S_T\":0");
      Serial.println("Temp. out of range");
      CRITICAL_STATE = true;
    } else {
      strcat(response,", \"S_T\":1");
    }
  } else {
    strcat(response,"\"nan\"");
    T_FreqNan += 1;
  }


  //Getting humidity reading
  readingFloat = dht.readHumidity();
  Serial.print("Humidity: ");
  Serial.print(readingFloat);
  Serial.print(" %\t");
  strcat(response,  ", \"H\":");
  sprintf(readingString, "%5.2f", readingFloat);
  if (readingString[4]!='n'){
    H_FreqNan = 0;
    strcat(response,readingString);
    if (readingFloat > H_max){
      strcat(response,", \"S_H\":2");
      Serial.println("Humidity out of range");
      CRITICAL_STATE = true;
    } else if (readingFloat < H_min){
      strcat(response,", \"S_H\":0");
      Serial.println("Humidity out of range");
      CRITICAL_STATE = true;
    } else {
      strcat(response,", \"S_H\":1");
    }
  } else {
    strcat(response,"\"nan\"");
    H_FreqNan += 1;
  }
  
  // Checking the state of the DHT sensor
  if ((T_FreqNan > 5) or (H_FreqNan > 5)){
    strcat(response,", \"S_S\":0");
    CRITICAL_STATE = true;
  } else {
    strcat(response,", \"S_S\":1");
  }
  

  //Getting moisture reading
  readingInt = analogRead(MOISTURE_PIN);
  Serial.print("Moisture: ");
  Serial.println(readingInt);
  
  strcat(response,  ", \"M\":");
  sprintf(readingString, "%i", readingInt);
  strcat(response,readingString);
  if (readingInt > M_max){
    strcat(response,", \"S_M\":2");
    Serial.println("Moisture out of range");
    CRITICAL_STATE = true;
  } else if (readingInt < M_min){
    strcat(response,", \"S_M\":0");
    Serial.println("Moisture out of range");
    CRITICAL_STATE = true;
  } else {
    strcat(response,", \"S_M\":1");
  }
  
  PROXIMITY_STATE = digitalRead(PROXIMITY_PIN);
  if (PROXIMITY_STATE == true){
    strcat(response,", \"P\":1");
  } else {
    strcat(response,", \"P\":0");
  }
  
  strcat(response,"}");
  client.publish(MC_PC_mqtt,response);
  
  if ((PROXIMITY_STATE == true) && (CRITICAL_STATE == false)){
    leds.setColorHSB(0, HUE_GREEN, 1.0, 0.5);
  } else if ((PROXIMITY_STATE == false) && (CRITICAL_STATE == false)){
    leds.setColorHSB(0, HUE_VIOLET, 1.0, 0.5);
  } else if (CRITICAL_STATE == true){
    leds.setColorHSB(0, HUE_RED, 1.0, 0.5);
  }
  
}

// A colorful LED response is triggered 
// when a text message is received
int PlayLED(){
  float hue = 0.0;
  boolean up = true;
  
  for (byte i=0; i<100; i++){
    leds.setColorHSB(0, hue, 1.0, 0.5);
    delay(50);

    if (up)
      hue+= 0.025;
    else
      hue-= 0.025;
      
    if (hue>=1.0 && up)
      up = false;
    else if (hue<=0.0 && !up)
      up = true;
  }
}


void setup()
{
  // Setting up serial UART for debugging
  Serial.begin(115200);
  delay(10);

  // Connecting to WiFi
  WiFiMulti.addAP(WiFi_SSID, WiFi_PWD);

  Serial.println();
  Serial.print("Connecting to WiFi... ");

  while(WiFiMulti.run() != WL_CONNECTED) {
    Serial.print(".");
      delay(500);
  }

  Serial.println("");
  Serial.println("WiFi connected");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());


  // Connecting to MQtt
  if (client.connect("arduinoPublisher")) {
    client.subscribe(PC_MC_mqtt);
  }
  
  // Setting up the GPIO connected to sensors
  dht.begin();
  leds.init();
  pinMode(PROXIMITY_PIN, INPUT);
}


void loop()
{
  // Check MQTT connection
  if (!client.loop()) {
    Serial.print("Client disconnected...");
    if (client.connect("arduinoPublisher")) {
      client.subscribe(PC_MC_mqtt);
      Serial.println("reconnected.");
    } else {
      Serial.println("failed.");
    }
  }
  
  // Collect new sensor readings each 5s
  ReadAllSensor();
  delay(5000);
}
