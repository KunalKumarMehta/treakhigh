/**
 * QuizService.js
 * Handles fetching quiz bundles and managing quiz state.
 * Currently uses mock data for development.
 */

const MOCK_BUNDLES = {
  "demo-bundle-01": {
    bundleId: "demo-bundle-01",
    title: "General Knowledge Quiz",
    description: "Test your knowledge on various topics.",
    timeLimit: 300, // 5 minutes in seconds
    questions: [
      {
        id: "q1",
        type: "single-select",
        text: "What is the capital of France?",
        options: [
          { id: "opt1", text: "Berlin" },
          { id: "opt2", text: "Madrid" },
          { id: "opt3", text: "Paris" },
          { id: "opt4", text: "Rome" },
        ],
        correctAnswer: "opt3",
      },
      {
        id: "q2",
        type: "single-select",
        text: "Which planet is known as the Red Planet?",
        options: [
          { id: "opt1", text: "Earth" },
          { id: "opt2", text: "Mars" },
          { id: "opt3", text: "Jupiter" },
          { id: "opt4", text: "Venus" },
        ],
        correctAnswer: "opt2",
      },
      {
        id: "q3",
        type: "single-select",
        text: "What is the largest ocean on Earth?",
        options: [
          { id: "opt1", text: "Atlantic Ocean" },
          { id: "opt2", text: "Indian Ocean" },
          { id: "opt3", text: "Arctic Ocean" },
          { id: "opt4", text: "Pacific Ocean" },
        ],
        correctAnswer: "opt4",
      },
    ],
  },
};

export class QuizService {
  /**
   * Simulates fetching a quiz bundle by ID.
   * @param {string} bundleId
   * @returns {Promise<Object>}
   */
  static async fetchBundle(bundleId) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const bundle = MOCK_BUNDLES[bundleId];
        if (bundle) {
          resolve(bundle);
        } else {
          reject(new Error(`Bundle not found: ${bundleId}`));
        }
      }, 500); // Simulate network latency
    });
  }

  /**
   * Access to available bundles for demo purposes.
   */
  static getAvailableBundles() {
    return Object.values(MOCK_BUNDLES).map((b) => ({
      id: b.bundleId,
      title: b.title,
      description: b.description,
    }));
  }
}
