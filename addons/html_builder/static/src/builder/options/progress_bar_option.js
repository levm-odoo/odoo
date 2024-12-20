import { registry } from "@web/core/registry";
import { Plugin } from "@html_editor/plugin";
import { clamp } from "@web/core/utils/numbers";
class ProgressBarOptionPlugin extends Plugin {
    static id = "ProgressBarOption";
    selector = ".s_progress_bar";
    resources = {
        builder_options: {
            template: "html_builder.ProgressBarOption",
            selector: this.selector,
        },
        builder_actions: this.getActions(),
        clean_for_save_handlers_options: this.cleanForSave,
    };

    cleanForSave(editingEl) {
        const progressBar = editingEl.querySelector(".progress-bar");
        const progressLabel = editingEl.querySelector(".s_progress_bar_text");

        if (!progressBar.classList.contains("progress-bar-striped")) {
            progressBar.classList.remove("progress-bar-animated");
        }

        if (progressLabel && progressLabel.classList.contains("d-none")) {
            progressLabel.remove();
        }
    }
    getActions() {
        return {
            display: {
                apply: ({ editingElement, param }) => {
                    // retro-compatibility
                    if (editingElement.classList.contains("progress")) {
                        editingElement.classList.remove("progress");
                        const progressBarEl = editingElement.querySelector(".progress-bar");
                        if (progressBarEl) {
                            const wrapperEl = document.createElement("div");
                            wrapperEl.classList.add("progress");
                            progressBarEl.parentNode.insertBefore(wrapperEl, progressBarEl);
                            wrapperEl.appendChild(progressBarEl);
                            editingElement
                                .querySelector(".progress-bar span")
                                .classList.add("s_progress_bar_text");
                        }
                    }

                    const progress = editingElement.querySelector(".progress");
                    const progressValue = progress.getAttribute("aria-valuenow");
                    let progressLabel = editingElement.querySelector(".s_progress_bar_text");

                    if (!progressLabel && param !== "none") {
                        progressLabel = document.createElement("span");
                        progressLabel.classList.add("s_progress_bar_text", "small");
                        progressLabel.textContent = progressValue + "%";
                    }

                    if (param === "inline") {
                        editingElement.querySelector(".progress-bar").appendChild(progressLabel);
                    } else if (["below", "after"].includes(param)) {
                        progress.insertAdjacentElement("afterend", progressLabel);
                    }

                    // Temporary hide the label. It's effectively removed in cleanForSave
                    // if the option is confirmed
                    progressLabel.classList.toggle("d-none", param === "none");
                },
            },
            progressBarValue: {
                apply: ({ editingElement, value }) => {
                    value = clamp(value, 0, 100);
                    const progressBarEl = editingElement.querySelector(".progress-bar");
                    const progressBarTextEl = editingElement.querySelector(".s_progress_bar_text");
                    const progressMainEl = editingElement.querySelector(".progress");
                    // Target precisely the XX% not only XX to not replace wrong element
                    // eg 'Since 1978 we have completed 45%' <- don't replace 1978
                    progressBarTextEl.innerText = progressBarTextEl.innerText.replace(
                        /[0-9]+%/,
                        value + "%"
                    );
                    progressMainEl.setAttribute("aria-valuenow", value);
                    progressBarEl.style.width = value + "%";
                },
                getValue: ({ editingElement }) =>
                    editingElement.querySelector(".progress").getAttribute("aria-valuenow"),
            },
        };
    }
}
registry.category("website-plugins").add(ProgressBarOptionPlugin.id, ProgressBarOptionPlugin);
