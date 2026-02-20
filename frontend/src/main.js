/**
 * main.js
 * Application entry point.
 */

import { QuizApp } from "./components/QuizApp.js";
import { telemetry } from "./app.js";

// Initialize App
document.addEventListener("DOMContentLoaded", () => {
  const appContainer = document.getElementById("app");
  if (appContainer) {
    window.app = new QuizApp(appContainer);
  }

  // Expose telemetry for debugging
  window.telemetry = telemetry;
});
