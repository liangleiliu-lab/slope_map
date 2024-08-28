const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({origin: "https://slopemap-13158.web.app"});

/**
 * Initializes Firebase with the API key directly in the configuration.
 */
async function initializeFirebase() {
  const firebaseConfig = {
    apiKey: "AIzaSyDcOnGmcEz5koeWwgYPeuaPR2tkBUGnDCc",
    authDomain: "slopemap-13158.firebaseapp.com",
    databaseURL: "https://slopemap-13158-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "slopemap-13158",
    storageBucket: "slopemap-13158.appspot.com",
    messagingSenderId: "835161535646",
    appId: "1:835161535646:web:423853494ed82fed6c778f",
    measurementId: "G-GN9GD6XMJF",
  };

  // Initialize Firebase
  admin.initializeApp(firebaseConfig);
}

// Call the function to initialize Firebase
initializeFirebase();

/**
 * Cloud Function to get route data from Firestore by document ID.
 */
exports.getRouteData = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const docId = req.query.docId;
    if (!docId) {
      return res.status(400).send("Bad Request: No document ID provided");
    }

    try {
      const docRef = admin.firestore().collection("data").doc(docId);
      const docSnap = await docRef.get();

      if (docSnap.exists) {
        const data = docSnap.data().dataArray;
        const formattedData = data.map((point) => ({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [point.lng, point.lat],
          },
          properties: {
            speed: point.speed,
          },
        }));
        res.status(200).json(formattedData);
      } else {
        res.status(404).send("Document not found");
      }
    } catch (error) {
      console.error("Error getting document:", error);
      res.status(500).send("Internal Server Error");
    }
  });
});

/**
 * Cloud Function to upload data to Firestore.
 */
exports.uploadData = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const data = req.body.data;
    if (!data) {
      return res.status(400).send("Bad Request: No data provided");
    }

    try {
      const lines = data.split("\n");
      const dataArray = [];

      lines.forEach((line, index) => {
        console.log(`Processing line ${index + 1}: ${line.trim()}`);

        // Try to parse each line into a JSON object
        try {
          const data = JSON.parse(line.trim());

          // Delete unneeded fields and rename fields
          const transformedData = {
            lat: data.latitude,
            lng: data.longitude,
            speed: Math.abs(data.pitch),
          };

          dataArray.push(transformedData);
        } catch (jsonError) {
          console.error(`Failed to parse JSON at line ${index + 1}:`, line, jsonError);
        }
      });

      console.log("Processed data array:", dataArray);

      // Check if the data array is empty
      if (dataArray.length === 0) {
        console.error("No valid data to upload.");
        return res.status(400).send("No valid data to upload.");
      }

      // Naming documents using the current timestamp
      const timestamp = new Date().toISOString();
      const docRef = admin.firestore().collection("data").doc(timestamp);
      await docRef.set({dataArray: dataArray});

      console.log("Data uploaded to Firebase successfully!");
      res.status(200).send("Data uploaded successfully");
    } catch (error) {
      console.error("Error processing and uploading data:", error);
      res.status(500).send("Internal Server Error");
    }
  });
});

/**
 * Cloud Function to get all document IDs from the data collection.
 */
exports.getAllDocumentIds = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const snapshot = await admin.firestore().collection("data").get();
      const documentIds = snapshot.docs.map((doc) => doc.id);

      res.status(200).json(documentIds);
    } catch (error) {
      console.error("Error getting document IDs:", error);
      res.status(500).send("Internal Server Error");
    }
  });
});
// Add a new line at the end of the file
