/**
 * QuestionComponent — Renders a Single Quiz Question
 *
 * Displays question text and answer options using safe DOM APIs (textContent,
 * createElement) to prevent XSS. Handles selection state and fires a callback
 * when the user picks an answer.
 *
 * @class QuestionComponent
 */
export class QuestionComponent {
  /**
   * Create and render a question inside the given container.
   * @param {HTMLElement} container — DOM element to render into (will be cleared)
   * @param {Object} question — Question object with { id, text, options: [{ id, text }] }
   * @param {Function} onAnswerSelected — Callback invoked with the selected option ID
   */
  constructor(container, question, onAnswerSelected) {
    this.container = container;
    this.question = question;
    this.onAnswerSelected = onAnswerSelected;
    this.selectedOptionId = null;
    this.render();
  }

  /**
   * Build the question DOM using safe createElement/textContent APIs.
   * Replaces any existing content in the container.
   */
  render() {
    // Clear container safely
    this.container.textContent = "";

    const wrapper = document.createElement("div");
    wrapper.className = "fade-in";

    // Question heading — textContent prevents XSS
    const heading = document.createElement("h2");
    heading.className = "question-text";
    heading.textContent = this.question.text;
    wrapper.appendChild(heading);

    // Options grid
    const grid = document.createElement("div");
    grid.className = "options-grid";

    for (const opt of this.question.options) {
      const card = document.createElement("div");
      card.className = "option-card";
      card.dataset.id = opt.id;
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-selected", "false");

      const marker = document.createElement("div");
      marker.className = "option-marker";
      card.appendChild(marker);

      const label = document.createElement("span");
      label.textContent = opt.text;
      card.appendChild(label);

      // Click handler
      card.addEventListener("click", () => this.selectOption(opt.id));

      // Keyboard accessibility (Enter / Space)
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.selectOption(opt.id);
        }
      });

      grid.appendChild(card);
    }

    wrapper.appendChild(grid);
    this.container.appendChild(wrapper);
  }

  /**
   * Mark an option as selected, deselect others, and notify the parent.
   * @param {string} optionId — The ID of the selected option
   */
  selectOption(optionId) {
    this.selectedOptionId = optionId;

    const options = this.container.querySelectorAll(".option-card");
    for (const opt of options) {
      const isSelected = opt.dataset.id === optionId;
      opt.classList.toggle("selected", isSelected);
      opt.setAttribute("aria-selected", String(isSelected));
    }

    this.onAnswerSelected(optionId);
  }
}
