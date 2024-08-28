// // Import the functions you need from the SDKs you need
// import { initializeApp } from "firebase/app";
// import { getAnalytics } from "firebase/analytics";
// import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

// const client = new SecretManagerServiceClient();

// async function getSecret(name) {
//   const [version] = await client.accessSecretVersion({ name });
//   const payload = version.payload.data.toString('utf8');
//   return payload;
// }

// async function initializeFirebase() {
//   const apiKey = await getSecret('projects/835161535646/secrets/API_KEY/versions/latest');

//   const firebaseConfig = {
//     apiKey,
//     authDomain: "",
//     databaseURL: "",
//     projectId: "",
//     storageBucket: "",
//     messagingSenderId: "835161535646",
//     appId: "1:835161535646:web:423853494ed82fed6c778f",
//     measurementId: "G-GN9GD6XMJF"
//   };

//   // Initialize Firebase
//   const app = initializeApp(firebaseConfig);
//   const analytics = getAnalytics(app);
// }

// initializeFirebase();