/**
 * QuizApp — Main Application Controller
 *
 * Manages quiz lifecycle: bundle selection → question flow → results → telemetry.
 * Uses safe DOM APIs (createElement, textContent) instead of innerHTML to prevent XSS.
 *
 * @class QuizApp
 */

import { QuizService } from "../services/QuizService.js";
import { QuestionComponent } from "./Question.js";
import { Timer } from "./Timer.js";
import { telemetry } from "../app.js";

export class QuizApp {
  /**
   * @param {HTMLElement} rootElement — The DOM container to mount the quiz into
   */
  constructor(rootElement) {
    this.root = rootElement;
    this.state = {
      currentBundle: null,
      currentQuestionIndex: 0,
      answers: {},
      startTime: null,
      score: 0,
    };

    this.timer = null;
    this.renderIntro();
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  /**
   * Create a DOM element with optional attributes and children.
   * @param {string} tag — HTML tag name
   * @param {Object} [attrs] — Key-value attribute map (also supports style as object)
   * @param  {...(HTMLElement|string)} children — Child elements or text strings
   * @returns {HTMLElement}
   */
  _el(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, val] of Object.entries(attrs)) {
      if (key === "style" && typeof val === "object") {
        Object.assign(el.style, val);
      } else if (key === "className") {
        el.className = val;
      } else if (key.startsWith("on") && typeof val === "function") {
        el.addEventListener(key.slice(2).toLowerCase(), val);
      } else {
        el.setAttribute(key, val);
      }
    }
    for (const child of children) {
      if (typeof child === "string") {
        el.appendChild(document.createTextNode(child));
      } else if (child instanceof Node) {
        el.appendChild(child);
      }
    }
    return el;
  }

  /** Remove all children from root and replace with new content. */
  _mount(...nodes) {
    this.root.textContent = "";
    for (const node of nodes) this.root.appendChild(node);
  }

  // ── Intro Screen ────────────────────────────────────────────────────

  /** Render the bundle selection screen. */
  renderIntro() {
    const bundles = QuizService.getAvailableBundles();

    const quizList = this._el("div", { className: "quiz-list" });
    for (const b of bundles) {
      const btn = this._el(
        "button",
        {
          className: "btn btn-primary",
          onClick: () => this.startQuiz(b.id),
        },
        `Start ${b.title}`,
      );

      const desc = this._el(
        "p",
        { style: { marginTop: "0.5rem", fontSize: "0.9rem", color: "#666" } },
        b.description,
      );

      quizList.appendChild(
        this._el(
          "div",
          { className: "quiz-item", style: { marginBottom: "1rem" } },
          btn,
          desc,
        ),
      );
    }

    const card = this._el(
      "div",
      { className: "card fade-in" },
      this._el(
        "header",
        {},
        this._el(
          "div",
          {},
          this._el("h1", {}, "Welcome to TreakHigh"),
          this._el(
            "p",
            { className: "subtitle" },
            "Select a quiz to begin testing your knowledge.",
          ),
        ),
      ),
      quizList,
    );

    this._mount(card);
  }

  // ── Quiz Flow ───────────────────────────────────────────────────────

  /**
   * Load a bundle and begin the quiz.
   * @param {string} bundleId — Identifier for the question bundle
   */
  async startQuiz(bundleId) {
    try {
      this.state.currentBundle = await QuizService.fetchBundle(bundleId);
      this.state.currentQuestionIndex = 0;
      this.state.answers = {};
      this.state.startTime = Date.now();

      this.renderQuizUI();
      this.showQuestion(0);

      const timerElement = document.getElementById("timer");
      this.timer = new Timer(timerElement);
      this.timer.start();
    } catch (error) {
      console.error("Failed to load quiz:", error);
      alert("Failed to load quiz. Please try again.");
    }
  }

  /** Build the quiz chrome (header, progress bar, question slot, nav button). */
  renderQuizUI() {
    const totalQ = this.state.currentBundle.questions.length;

    // Header
    const qTitle = this._el(
      "h1",
      { id: "quiz-title" },
      this.state.currentBundle.title,
    );
    const qCounter = this._el("span", { id: "q-current" }, "1");
    const subtitle = this._el(
      "p",
      { className: "subtitle" },
      "Question ",
      qCounter,
      ` of ${totalQ}`,
    );
    const timerDiv = this._el(
      "div",
      { id: "timer", className: "subtitle" },
      "Time: 00:00",
    );

    // Progress bar
    const progressBar = this._el("div", {
      className: "progress-bar",
      id: "progress-bar",
      style: { width: "0%" },
    });
    const progressContainer = this._el(
      "div",
      { className: "progress-container" },
      progressBar,
    );

    // Question slot
    const questionContainer = this._el("div", { id: "question-container" });

    // Navigation button
    const btnNext = this._el(
      "button",
      {
        className: "btn btn-secondary",
        id: "btn-next",
        disabled: "true",
        onClick: () => this.nextQuestion(),
      },
      "Next Question",
    );
    const navRow = this._el(
      "div",
      {
        style: {
          display: "flex",
          justifyContent: "space-between",
          marginTop: "2rem",
        },
      },
      btnNext,
    );

    const card = this._el(
      "div",
      { className: "card fade-in", id: "quiz-card" },
      this._el("header", {}, this._el("div", {}, qTitle, subtitle), timerDiv),
      progressContainer,
      questionContainer,
      navRow,
    );

    this._mount(card);
  }

  /**
   * Render a specific question by index.
   * @param {number} index — Zero-based question index
   */
  showQuestion(index) {
    const question = this.state.currentBundle.questions[index];
    const container = document.getElementById("question-container");

    // Update progress
    const progress = (index / this.state.currentBundle.questions.length) * 100;
    document.getElementById("progress-bar").style.width = `${progress}%`;
    document.getElementById("q-current").textContent = index + 1;

    // Render question component (safe DOM internally)
    new QuestionComponent(container, question, (selectedOptionId) => {
      this.state.answers[question.id] = selectedOptionId;
      document.getElementById("btn-next").disabled = false;
    });

    // Update button text for last question
    const btn = document.getElementById("btn-next");
    btn.textContent =
      index === this.state.currentBundle.questions.length - 1
        ? "Finish Quiz"
        : "Next Question";
  }

  /** Advance to the next question or finish the quiz. */
  nextQuestion() {
    if (
      this.state.currentQuestionIndex <
      this.state.currentBundle.questions.length - 1
    ) {
      this.state.currentQuestionIndex++;
      this.showQuestion(this.state.currentQuestionIndex);
      document.getElementById("btn-next").disabled = true;
    } else {
      this.finishQuiz();
    }
  }

  // ── Scoring & Results ───────────────────────────────────────────────

  /**
   * Calculate the number of correct answers.
   * @returns {number}
   */
  calculateScore() {
    let score = 0;
    for (const q of this.state.currentBundle.questions) {
      if (this.state.answers[q.id] === q.correctAnswer) score++;
    }
    return score;
  }

  /** Stop the timer, calculate score, render results, and send telemetry. */
  async finishQuiz() {
    if (this.timer) this.timer.stop();

    const score = this.calculateScore();
    const maxScore = this.state.currentBundle.questions.length;
    const durationSec = this.timer
      ? this.timer.getElapsedSeconds()
      : Math.floor((Date.now() - this.state.startTime) / 1000);

    this.renderResults(score, maxScore);

    try {
      await telemetry.send({
        studentId: "student-demo",
        studentEmail: "student@example.com",
        bundleId: this.state.currentBundle.bundleId,
        bundleName: this.state.currentBundle.title,
        courseId: "course-demo-101",
        sessionId: crypto.randomUUID(),
        rawScore: score,
        maxScore,
        durationSec,
        hintsUsed: 0,
        answerChanges: 0,
      });
      console.log("[TreakHigh] Telemetry sent successfully.");
    } catch (err) {
      console.warn(
        "[TreakHigh] Telemetry failed (expected in demo mode):",
        err,
      );
    }
  }

  /**
   * Render the results card with score and accuracy.
   * @param {number} score — Correct answers
   * @param {number} maxScore — Total questions
   */
  renderResults(score, maxScore) {
    const percentage = Math.round((score / maxScore) * 100);
    let message = "Good job!";
    if (percentage === 100) message = "Perfect!";
    if (percentage < 50) message = "Keep practicing!";

    const statScore = this._el(
      "div",
      { className: "stat-box" },
      this._el("span", { className: "stat-value" }, `${score}/${maxScore}`),
      this._el("span", { className: "stat-label" }, "Score"),
    );

    const statAccuracy = this._el(
      "div",
      { className: "stat-box" },
      this._el("span", { className: "stat-value" }, `${percentage}%`),
      this._el("span", { className: "stat-label" }, "Accuracy"),
    );

    const retryBtn = this._el(
      "button",
      {
        className: "btn btn-primary",
        style: { marginTop: "2rem" },
        onClick: () => location.reload(),
      },
      "Take Another Quiz",
    );

    const card = this._el(
      "div",
      { className: "card fade-in", style: { textAlign: "center" } },
      this._el("h1", { style: { marginBottom: "1rem" } }, "Quiz Completed!"),
      this._el(
        "p",
        { className: "subtitle", style: { marginBottom: "2rem" } },
        message,
      ),
      this._el("div", { className: "stats-grid" }, statScore, statAccuracy),
      retryBtn,
    );

    this._mount(card);
  }
}
