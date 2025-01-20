import { Plugin } from "@html_editor/plugin";
import { isBlock } from "@html_editor/utils/blocks";
import { isEmptyBlock, paragraphRelatedElements } from "@html_editor/utils/dom_info";
import { children, closestElement, findFurthest } from "@html_editor/utils/dom_traversal";
import { parseHTML } from "@html_editor/utils/html";
import { rightPos } from "@html_editor/utils/position";
import { withSequence } from "@html_editor/utils/resource";
import { getActiveHotkey } from "@web/core/hotkeys/hotkey_service";
import { _t } from "@web/core/l10n/translation";
import { renderToString } from "@web/core/utils/render";
import { uuid } from "@web/views/utils";

const titleSelector = "[data-embedded='toggle'] [data-embedded-editable='title']";
const contentSelector = "[data-embedded='toggle'] [data-embedded-editable='content']";

export class TogglePlugin extends Plugin {
    static id = "toggle_list";
    static dependencies = ["list", "history", "embeddedComponents", "dom", "selection"];
    resources = {
        user_commands: [
            {
                id: "insertToggleList",
                title: _t("Toggle List"),
                description: _t("Hide Text under a Toggle"),
                icon: "fa-caret-square-o-right",
                isAvailable: (node) => !closestElement(node, titleSelector),
                run: () => {
                    this.insertToggleList();
                },
            },
        ],
        powerbox_items: [
            {
                commandId: "insertToggleList",
                categoryId: "structure",
            },
        ],
        normalize_handlers: this.normalize.bind(this),
        delete_backward_overrides: this.handleDeleteBackward.bind(this),
        delete_forward_overrides: this.handleDeleteForward.bind(this),
        tab_overrides: this.handleTab.bind(this),
        shift_tab_overrides: this.handleShiftTab.bind(this),
        hints: [
            withSequence(1, {
                selector: `${titleSelector} > *`,
                text: "Toggle Title",
            }),
            withSequence(2, {
                selector: `${contentSelector} > p:only-child`,
                text: "This is empty, add some text",
            }),
        ],
        split_element_block_overrides: withSequence(1, this.handleSplitElementBlock.bind(this)),
        power_buttons_visibility_predicates: this.showPowerButtons.bind(this),
        before_paste_handlers: this.beforePaste.bind(this),
        disallowed_to_move_node_selectors: `${titleSelector} *, div.collapsed > [data-embedded-editable='content'] *`,
        mount_component_handlers: this.setupNewToggle.bind(this),
        select_all_handlers: this.selectAll.bind(this),
    };

    /**
     * Handler when the `Select All` command is called. (ctrl+a)
     */
    selectAll() {
        const selection = this.dependencies.selection.getEditableSelection();
        if (closestElement(selection.anchorNode, "[data-embedded='toggle']")) {
            const node = findFurthest(
                selection.anchorNode,
                this.editable,
                (element) => element.dataset.embedded === "toggle"
            );
            if (node) {
                this.dependencies.selection.setSelection({
                    anchorNode: node.previousSibling || node,
                    anchorOffset: 0,
                });
            }
        }
    }

    showPowerButtons(selection) {
        return selection.isCollapsed && !closestElement(selection.anchorNode, titleSelector);
    }

    setupNewToggle({ name, env }) {
        if (name === "toggle") {
            Object.assign(env, {
                editorShared: {
                    preserveSelection: this.dependencies.selection.preserveSelection,
                },
            });
        }
    }

    normalize(element) {
        const emptyToggleNodes = element.querySelectorAll(
            "[data-embedded='toggle'] [data-embedded-editable]:empty"
        );
        for (const emptyToggleNode of emptyToggleNodes) {
            const newParagraph = this.document.createElement("p");
            newParagraph.appendChild(this.document.createElement("br"));
            emptyToggleNode.replaceChildren(newParagraph);
        }
    }

    /**
     * This method blocks the insertion of html inside a toggle title when pasting content.
     * @param {Selection} selection
     * @param {Event} ev
     */
    beforePaste(selection, ev) {
        const { anchorNode } = selection;
        const closestToggleTitle = closestElement(anchorNode, titleSelector);
        if (!closestToggleTitle) {
            return;
        }
        const htmlData = ev.clipboardData.getData("text/html");
        if (!htmlData) {
            // We only have some plain/text so we let the other plugin handle it.
            return;
        }
        const fragmentToCheck = parseHTML(this.document, htmlData);
        if (fragmentToCheck.childNodes.length === 1) {
            if (fragmentToCheck.childNodes[0].nodeType === Node.TEXT_NODE) {
                return;
            }
            const nodes = Array.from([
                ...fragmentToCheck.children[0].querySelectorAll("*"),
                fragmentToCheck.children[0],
            ]);
            if (nodes.every((node) => paragraphRelatedElements.includes(node.tagName))) {
                return;
            }
        }
        // new paragraph after toggle
        const newParagraph = this.document.createElement("p");
        newParagraph.appendChild(this.document.createElement("br"));
        closestToggleTitle.closest("[data-embedded]").after(newParagraph);
        this.dependencies.history.addStep();
        this.dependencies.selection.setCursorStart(newParagraph);
    }

    getUniqueIdentifier() {
        return uuid();
    }

    insertToggleList() {
        const block = this.renderToggleList();
        const target = block.querySelector("[data-embedded-editable='title'] > p");
        this.dependencies.dom.insert(block);
        this.addDomListener(block, "keydown", (ev) => {
            if (["arrowup", "arrowdown"].includes(getActiveHotkey(ev))) {
                this.handleKeyDown(ev);
            }
        });
        this.dependencies.selection.setCursorStart(target);
        this.dependencies.history.addStep();
    }

    /**
     * Handles the deleteForward done inside a toggle title. We explode the following toggle and
     * insert the title inside the current toggle title.
     *
     * @param {Range} range
     */
    handleDeleteForward(range) {
        const { startContainer, startOffset, endContainer, endOffset } = range;
        const closestToggleTitle = closestElement(startContainer, titleSelector);
        if (!closestToggleTitle) {
            return;
        }
        const isCursorAtStartofTitle =
            (startContainer === endContainer && startOffset === endOffset) ||
            closestElement(startContainer, titleSelector) !== closestToggleTitle;
        if (!isCursorAtStartofTitle) {
            return;
        }
        const container = closestToggleTitle.closest("[data-embedded]");
        // We are inside a toggle title
        const nextSibling = container.nextElementSibling;
        if (nextSibling.matches("[data-embedded='toggle']")) {
            const { restore: restoreSelection } = this.dependencies.selection.preserveSelection();
            const nextTitle = nextSibling.querySelector("[data-embedded-editable='title']");
            const nextContent = nextSibling.querySelector("[data-embedded-editable='content']");
            const [rightNode, rightOffset] = rightPos(nextSibling);
            this.dependencies.selection.setSelection({
                anchorNode: rightNode,
                anchorOffset: rightOffset,
                focusNode: rightNode,
                focusOffset: rightOffset,
            });
            const fragment = this.document.createDocumentFragment();
            let childrenToInsert = children(nextContent);
            if (childrenToInsert.length === 1 && isEmptyBlock(childrenToInsert[0])) {
                childrenToInsert = [];
            }
            fragment.replaceChildren(...childrenToInsert);
            if (fragment.children.length !== 0) {
                this.dependencies.dom.insert(fragment);
            }
            closestToggleTitle
                .querySelector("p")
                .insertBefore(
                    this.document.createTextNode(nextTitle.textContent),
                    closestToggleTitle.querySelector("p").lastChild
                );
            nextSibling.remove();
            restoreSelection();
        }
        return true;
    }

    /**
     * Handles all the behaviors linked to the use of deleteBackward in the editor.
     * We need to handle some specific behaviors:
     *  1. When we aren't in a toggle title but the previous element is a toggle. (opened and closed)
     *  2. When we are at the start of the title and we have nothing above the current embedded toggle.
     * @param {Range} range
     */
    handleDeleteBackward(range) {
        // startContainer should be the editable to indicate the start of the block.
        const { startContainer, startOffset, endOffset } = range;
        // endContainer represents the block where the cursor is.
        const endContainer = closestElement(range.endContainer, isBlock);
        const closestToggleTitle = closestElement(startContainer, titleSelector);
        // We are at the start if either we have the same end and start container and the same offset (in title).
        // Or if the startContainer is the editable with an endOffset of 0 (in the editable).
        const isCursorAtStart =
            (closestElement(startContainer) === closestElement(endContainer) &&
                startOffset === endOffset) ||
            (startContainer === closestElement(endContainer, "[contenteditable='true']") &&
                endOffset === 0);
        if (isCursorAtStart && endContainer.previousElementSibling?.dataset.embedded === "toggle") {
            // If we are inside the editor after an embedded toggle. We set the cursor to the end
            // of either the title or the last paragraph of the content.
            this.dependencies.selection.setCursorEnd(
                endContainer.previousElementSibling.querySelector(
                    ".btn:has(.fa-caret-right) + div > [data-embedded-editable='title'] > *, [data-embedded-editable='content'] > p:last-of-type"
                )
            );
            if (!endContainer.textContent) {
                // If the paragraph we are leaving is empty we remove it to follow the classic
                // deleteBackwards behavior.
                endContainer.remove();
            } else {
                const { anchorNode } = this.dependencies.selection.getEditableSelection();
                const { restore: restoreSelection } =
                    this.dependencies.selection.preserveSelection();
                if (closestElement(anchorNode, contentSelector)) {
                    this.dependencies.dom.insert(endContainer);
                } else {
                    const titleContainer = closestElement(anchorNode, titleSelector);
                    titleContainer.firstChild.after(range.endContainer);
                }
                restoreSelection();
            }
            return true;
        }
        if (!closestToggleTitle) {
            return;
        }
        const isCursorAtStartofTitle =
            isCursorAtStart || closestElement(startContainer, titleSelector) !== closestToggleTitle;
        if (!isCursorAtStartofTitle) {
            return;
        }
        const container = closestToggleTitle.closest("[data-embedded]");
        const newParagraph = this.document.createElement("p");
        newParagraph.textContent = closestToggleTitle.textContent || "";
        if (!newParagraph.textContent) {
            newParagraph.appendChild(this.document.createElement("br"));
        }
        const contentToInsert = container.querySelectorAll(`${contentSelector} > *`);
        if (contentToInsert.length > 1 || !isEmptyBlock(contentToInsert[0])) {
            const [rightNode, rightOffset] = rightPos(container);
            this.dependencies.selection.setSelection({
                anchorNode: rightNode,
                anchorOffset: rightOffset,
                focusNode: rightNode,
                focusOffset: rightOffset,
            });
            const fragment = this.document.createDocumentFragment();
            fragment.replaceChildren(...contentToInsert);
            this.dependencies.dom.insert(fragment);
        }
        container.replaceWith(newParagraph);
        this.dependencies.history.addStep();
        this.dependencies.selection.setCursorStart(newParagraph);
        return true;
    }

    /**
     * Handles the tab behavior. This means that when we are inside a toggle title and we have a toggle
     * as previous sibling of the embedded component, the current toggle is indented inside the content of
     * the previous one.
     */
    handleTab() {
        const container = this.getToggleContainer();
        if (container) {
            // If selection is in a title.
            const previousSibling = container.previousElementSibling;
            if (previousSibling?.matches("[data-embedded='toggle']")) {
                // If the previous element of the embedded component is also a toggle, we need to handle
                // it.
                const { restore: restoreSelection } =
                    this.dependencies.selection.preserveSelection();
                this.dependencies.selection.setCursorEnd(
                    previousSibling.querySelector("[data-embedded-editable='content']")
                );
                previousSibling.firstChild.querySelector("i.fa-caret-right")?.click(); // open the toggle if needed
                const fragment = this.document.createDocumentFragment();
                fragment.replaceChildren(container);
                const canReplace = previousSibling.querySelector(
                    "[data-embedded-editable='content'] > *:only-child"
                );
                // If the 1st block of the previous content is empty we replace it with our toggle.
                // Else we add it to the content.
                if (isEmptyBlock(canReplace)) {
                    canReplace.replaceWith(fragment);
                } else {
                    this.dependencies.dom.insert(fragment);
                }
                this.dependencies.history.addStep();
                window.setTimeout(restoreSelection, "animationFrame"); // Used to handle caret displaying issues
            }
            return true;
        }
    }

    /**
     * Handles the shift-tab behavior. This means that we need to outdent the toggle from each other.
     * @returns
     */
    handleShiftTab() {
        const container = this.getToggleContainer();
        if (container) {
            if (container.parentElement.closest("[data-embedded='toggle']")) {
                // If we are inside an indented toggle we need to outdent the current toggle.
                const [nextPositionNode, nextPositionOffset] = rightPos(
                    container.parentElement.closest("[data-embedded='toggle']")
                );
                const { restore: restoreSelection } =
                    this.dependencies.selection.preserveSelection();
                this.dependencies.selection.setSelection({
                    anchorNode: nextPositionNode,
                    anchorOffset: nextPositionOffset,
                    focusNode: nextPositionNode,
                    focusOffset: nextPositionOffset,
                });
                this.dependencies.dom.insert(container);
                restoreSelection();
                this.dependencies.history.addStep();
            }
            return true;
        }
    }

    /**
     * This method handles the behavior when the user presses the Enter key.
     * In the editor, when the user presses the Enter key, this splits the focused text block into 2
     * separate ones. When the text block is split then it calls to all handlers so that they can trigger
     * a specific behavior with the split block.
     *
     * This handler handles multiple cases:
     *      1. The toggle title is currently empty (remove toggle)
     *      2. The toggle is open (move inside content)
     *          a. and we have a text block to move
     *          b. and we don't have any text block to move
     *      3. The toggle is closed (create new toggle w or w/o text)
     * @param {Object} param
     * @param {HTMLElement} param.targetNode
     * @returns true if indeed handled by the method
     */
    handleSplitElementBlock({ targetNode }) {
        if (targetNode.closest(titleSelector)) {
            const selection = this.dependencies.selection.getEditableSelection();
            if (isEmptyBlock(selection.anchorNode)) {
                // If no text is in title, we remove the toggle.
                const newParagraph = this.document.createElement("p");
                newParagraph.appendChild(this.document.createElement("br"));
                targetNode.closest("[data-embedded='toggle']").replaceWith(newParagraph);
                this.dependencies.selection.setCursorStart(newParagraph);
                return true;
            }
            let insertBefore;
            const container = targetNode.closest("[data-embedded='toggle']");
            const insertInside = container.firstChild.querySelector(".fa-caret-down");
            const anchorNode = selection.anchorNode.previousSibling ?? selection.anchorNode;
            if (selection.isCollapsed && selection.endOffset === 0) {
                insertBefore = selection.anchorNode.previousSibling !== null;
            }
            if (insertInside) {
                // Toggle is open
                const target = container.querySelector(contentSelector).firstElementChild;
                const { restore: restoreSelection } =
                    this.dependencies.selection.preserveSelection();
                const newParagraph = this.document.createElement("p");
                newParagraph.appendChild(this.document.createElement("br"));
                if (insertBefore) {
                    // There is some text to move
                    newParagraph.prepend(selection.anchorNode);
                }
                target.before(newParagraph);
                if (insertBefore) {
                    // restore selection in original anchorNode
                    restoreSelection();
                } else {
                    // set selection in inserted paragraph
                    this.dependencies.selection.setCursorStart(newParagraph);
                }
                this.dependencies.history.addStep();
                return true;
            }
            const block = this.renderToggleList();
            const target = block.querySelector("[data-embedded-editable='title'] > p");
            container[insertBefore ? "before" : "after"](block);
            if (selection.anchorNode.previousSibling) {
                target.replaceChildren(anchorNode, this.document.createElement("br"));
            }
            this.dependencies.history.addStep();
            if (!insertBefore) {
                this.dependencies.selection.setCursorStart(target);
            }
            return true;
        }
    }

    // HELPERS
    getToggleContainer() {
        const selection = this.dependencies.selection.getEditableSelection();
        const closestToggleTitle = closestElement(selection.anchorNode, titleSelector);
        if (closestToggleTitle) {
            // If selection is in a title.
            return closestToggleTitle.closest("[data-embedded]");
        }
    }

    renderToggleList() {
        // Done to ensure the block is rendered with the classes of the current document's realm
        return parseHTML(
            this.document,
            renderToString("html_editor.ToggleBlueprint", {
                embeddedProps: JSON.stringify({ toggleId: this.getUniqueIdentifier() }),
            })
        );
    }
}
