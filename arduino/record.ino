#include <SPI.h>
#include <SD.h>
#include <SoftwareSerial.h>
#include <REG.h>
#include <wit_c_sdk.h>
#include <Wire.h>
#include <DFRobot_GNSS.h>

#define ANGLE_UPDATE  0x04

static volatile char s_cDataUpdate = 0; 
static void AutoScanSensor(void);
static void SensorUartSend(uint8_t *p_data, uint32_t uiSize);
static void SensorDataUpdata(uint32_t uiReg, uint32_t uiRegNum);
static void Delayms(uint16_t ucMs);

const int chipSelect = 8; // SD card module CS pin
const uint32_t c_uiBaud[8] = {0, 4800, 9600, 19200, 38400, 57600, 115200, 230400};

SoftwareSerial mySerial(A4, A5); // RX, TX for GNSS
DFRobot_GNSS_UART gnss(&mySerial, 9600);
File dataFile;

unsigned long lastSaveTime = 0;
bool isRecording = false;

const int recordButtonPin = 7; // Button for start/stop recording

void setup() {
  Serial.begin(115200);
  
  // Initialize SD card
  Serial.println("Initializing SD card...");
  if (!SD.begin(chipSelect)) {
    Serial.println("Initialization failed!");
    return;
  }
  Serial.println("Initialization done.");

  // Initialize GNSS
  mySerial.begin(9600);
  Serial.println("Initializing GNSS...");
  while (!gnss.begin()) {
    Serial.println("NO Devices !");
    delay(1000);
  }
  Serial.println("GNSS initialized.");

  gnss.enablePower();
  gnss.setGnss(eGPS_BeiDou_GLONASS);
  gnss.setRgbOn();
  
  // Initialize WIT sensor
  Serial.println("Initializing WIT sensor...");
  WitInit(WIT_PROTOCOL_NORMAL, 0x50);
  WitSerialWriteRegister(SensorUartSend);
  WitRegisterCallBack(SensorDataUpdata);
  WitDelayMsRegister(Delayms);
  Serial.print("\r\n********************** wit-motion normal example  ************************\r\n");
  AutoScanSensor();

  // Set button pin as input with internal pull-up resistor
  pinMode(recordButtonPin, INPUT_PULLUP);
}

int i;
float fAngle[3];

void loop() {
  handleButton();  // Handle button events

  if (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    command.trim(); // Remove extra whitespace

    if (command.startsWith("READ:")) {
      // Read the specified file
      String filename = command.substring(5);
      readFile(filename);
    } else if (command == "LIST") {
      // List all files on SD card
      listFiles();
    }
  }

  // If recording data, save every 1 seconds
  if (isRecording) {
    if (millis() - lastSaveTime >= 1000) {
      lastSaveTime = millis();
      saveData();
    }
    if (s_cDataUpdate) {
      // Update angle sensor data
      for (int i = 0; i < 3; i++) {
        fAngle[i] = sReg[Roll + i] / 32768.0f * 180.0f;
      }
      s_cDataUpdate = 0;
    }
  }
}

// Save sensor data to SD card
void saveData() {
  char jsonData[256];  
  char latitudeStr[20], longitudeStr[20], pitchStr[20];

  sLonLat_t lat = gnss.getLat();
  sLonLat_t lon = gnss.getLon();
  double latitude = lat.latitudeDegree;
  double longitude = lon.lonitudeDegree;
  double pitch = fAngle[1];

  // Convert float to string
  dtostrf(latitude, 9, 6, latitudeStr);
  dtostrf(longitude, 9, 6, longitudeStr);
  dtostrf(pitch, 7, 3, pitchStr);

  // Format as JSON
  strcpy(jsonData, "{\"lat\":");
  strcat(jsonData, latitudeStr);
  strcat(jsonData, ",\"lng\":");
  strcat(jsonData, longitudeStr);
  strcat(jsonData, ",\"pitch\":");
  strcat(jsonData, pitchStr);
  strcat(jsonData, "}");

  // Write to SD card
  dataFile = SD.open("datalog.txt", FILE_WRITE);
  if (dataFile) {
    dataFile.println(jsonData);
    dataFile.close();
  } else {
    Serial.println("Error opening datalog.txt");
  }
}

// Read a file from the SD card and send it over Serial
void readFile(String filename) {
  File file = SD.open(filename);
  if (file) {
    while (file.available()) {
      Serial.write(file.read());
    }
    file.close();
    Serial.println(); // Add newline after file content
    Serial.println("END_OF_FILE"); // Mark the end of the file transmission
  } else {
    Serial.println("Error opening file");
  }
}

// List all files on the SD card
void listFiles() {
  File root = SD.open("/");
  if (root) {
    Serial.println("File list:");
    printDirectory(root, 0);
    root.close();
  } else {
    Serial.println("Failed to open directory.");
  }
}

// Helper function to recursively list files in directories
void printDirectory(File dir, int numTabs) {
  while (true) {
    File entry = dir.openNextFile();
    if (!entry) {
      // No more files
      break;
    }
    for (uint8_t i = 0; i < numTabs; i++) {
      Serial.print('\t');
    }
    Serial.print(entry.name());
    if (entry.isDirectory()) {
      Serial.println("/");
      printDirectory(entry, numTabs + 1);
    } else {
      // Display file size
      Serial.print("\t\t");
      Serial.println(entry.size(), DEC);
    }
    entry.close();
  }
}

// Handle button presses to toggle recording
void handleButton() {
  static bool lastButtonState = HIGH;
  
  bool buttonState = digitalRead(recordButtonPin);

  if (buttonState == LOW && lastButtonState == HIGH) {
    toggleRecording();
  }

  lastButtonState = buttonState;
}

// Toggle recording on/off
void toggleRecording() {
  if (isRecording) {
    isRecording = false;
    Serial.println("Stopped recording. Waiting for serial command to send data.");
  } else {
    isRecording = true;
    Serial.println("Started recording data.");
  }
}

// UART communication with WIT sensor
static void SensorUartSend(uint8_t *p_data, uint32_t uiSize) {
  Serial1.write(p_data, uiSize);
  Serial1.flush();
}

static void Delayms(uint16_t ucMs) {
  delay(ucMs);
}

static void SensorDataUpdata(uint32_t uiReg, uint32_t uiRegNum) {
  int i;
  for(i = 0; i < uiRegNum; i++) {
    switch(uiReg) {
      case Yaw: s_cDataUpdate |= ANGLE_UPDATE; break;
      default: break;
    }
    uiReg++;
  }
}

// Auto scan for WIT sensor on different baud rates
static void AutoScanSensor(void) {
  int i, iRetry;
  
  for(i = 0; i < sizeof(c_uiBaud)/sizeof(c_uiBaud[0]); i++) {
    Serial1.begin(c_uiBaud[i]);
    Serial1.flush();
    iRetry = 2;
    s_cDataUpdate = 0;
    do {
      WitReadReg(AX, 3);
      delay(200);
      while (Serial1.available()) {
        WitSerialDataIn(Serial1.read());
      }
      if(s_cDataUpdate != 0) {
        Serial.print(c_uiBaud[i]);
        Serial.print(" baud find sensor\r\n\r\n");
        return;
      }
      iRetry--;
    } while(iRetry);    
  }
  Serial.print("can not find sensor\r\n");
  Serial.print("please check your connection\r\n");
}
