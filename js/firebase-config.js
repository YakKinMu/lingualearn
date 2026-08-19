/* ===== Firebase project config & init =====
   Uses the "compat" Firebase SDK loaded via <script> tags (see the <head>/
   before this file in each .html page), so no bundler/build step is needed —
   it works the same way as every other plain <script> file in this project.
   Loads before js/auth.js, which uses firebase.auth() for real sign-in. */

const firebaseConfig = {
  apiKey: "AIzaSyDGyZPQ0zl3zPToB9BhpqU8FzjL9MrJCUI",
  authDomain: "lingualearn-c86fc.firebaseapp.com",
  projectId: "lingualearn-c86fc",
  storageBucket: "lingualearn-c86fc.firebasestorage.app",
  messagingSenderId: "498977659213",
  appId: "1:498977659213:web:12726d15a85835957d7f04",
  measurementId: "G-J4NJ5GS158"
};

firebase.initializeApp(firebaseConfig);
