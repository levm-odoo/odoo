import { closestBlock } from "@html_editor/utils/blocks";
import { endPos } from "@html_editor/utils/position";
import { findInSelection } from "@html_editor/utils/selection";
import { click, manuallyDispatchProgrammaticEvent, press, waitFor } from "@odoo/hoot-dom";
import { tick } from "@odoo/hoot-mock";
import { setSelection } from "./selection";

/** @typedef {import("@html_editor/plugin").Editor} Editor */

/**
 * @param {Editor} editor
 * @param {string} text
 */
export async function insertText(editor, text) {
    const insertChar = (char) => {
        // Create and dispatch events to mock text insertion. Unfortunatly, the
        // events will be flagged `isTrusted: false` by the browser, requiring
        // the editor to detect them since they would not trigger the default
        // browser behavior otherwise.
        const range = editor.document.getSelection().getRangeAt(0);
        let offset = range.startOffset;
        let node = range.startContainer;

        if (node.nodeType !== Node.TEXT_NODE) {
            node = document.createTextNode(char);
            offset = 1;
            range.startContainer.appendChild(node);
            range.insertNode(node);
            setSelection({ anchorNode: node, anchorOffset: offset });
        } else {
            node.textContent =
                node.textContent.slice(0, offset) + char + node.textContent.slice(offset);
            offset++;
            setSelection({
                anchorNode: node,
                anchorOffset: offset,
            });
        }
    };
    for (const char of text) {
        // KeyDownEvent is required to trigger deleteRange.
        await manuallyDispatchProgrammaticEvent(editor.editable, "keydown", { key: char });
        // InputEvent is required to simulate the insert text.
        await manuallyDispatchProgrammaticEvent(editor.editable, "beforeinput", {
            inputType: "insertText",
            data: char,
        });
        insertChar(char);
        await manuallyDispatchProgrammaticEvent(editor.editable, "input", {
            inputType: "insertText",
            data: char,
        });
        // KeyUpEvent is not required but is triggered like the browser would.
        await manuallyDispatchProgrammaticEvent(editor.editable, "keyup", { key: char });
    }
}

/** @param {Editor} editor */
export function deleteForward(editor) {
    editor.shared.execCommand("deleteForward");
}

/**
 * @param {Editor} editor
 * @param {boolean} [isMobileTest=false]
 */
export function deleteBackward(editor, isMobileTest = false) {
    // TODO phoenix: find a strategy for test mobile and desktop. (check legacy code)

    editor.shared.execCommand("deleteBackward");
}

// history
/** @param {Editor} editor */
export function addStep(editor) {
    editor.shared.addStep();
}
/** @param {Editor} editor */
export function undo(editor) {
    editor.shared.execCommand("historyUndo");
}
/** @param {Editor} editor */
export function redo(editor) {
    editor.shared.execCommand("historyRedo");
}

// list
export function toggleOrderedList(editor) {
    editor.shared.execCommand("toggleListOL");
}
/** @param {Editor} editor */
export function toggleUnorderedList(editor) {
    editor.shared.execCommand("toggleListUL");
}
/** @param {Editor} editor */
export function toggleCheckList(editor) {
    editor.shared.execCommand("toggleListCL");
}

/**
 * Clicks on the checkbox of a checklist item.
 *
 * @param {HTMLLIElement} li
 * @throws {Error} If the provided element is not a LI element within a checklist.
 */
export async function clickCheckbox(li) {
    if (li.tagName !== "LI" || !li.parentNode.classList.contains("o_checklist")) {
        throw new Error("Expected a LI element in a checklist");
    }
    await click(li, {
        position: { x: -10, y: 10 },
        relative: true,
    });
}

/** @param {Editor} editor */
export function insertLineBreak(editor) {
    editor.shared.insertLineBreak();
}

// Format commands

/** @param {Editor} editor */
export function bold(editor) {
    editor.shared.execCommand("formatBold");
}
/** @param {Editor} editor */
export function italic(editor) {
    editor.shared.execCommand("formatItalic");
}
/** @param {Editor} editor */
export function underline(editor) {
    editor.shared.execCommand("formatUnderline");
}
/** @param {Editor} editor */
export function strikeThrough(editor) {
    editor.shared.execCommand("formatStrikethrough");
}
export function setFontSize(size) {
    return (editor) => editor.shared.execCommand("formatFontSize", { size });
}
/** @param {Editor} editor */
export function switchDirection(editor) {
    return editor.shared.execCommand("switchDirection");
}
/** @param {Editor} editor */
export function splitBlock(editor) {
    editor.shared.splitBlock();
    editor.shared.addStep();
}

export async function simulateArrowKeyPress(editor, keys) {
    await press(keys);
    const keysArray = Array.isArray(keys) ? keys : [keys];
    const alter = keysArray.includes("Shift") ? "extend" : "move";
    const direction =
        keysArray.includes("ArrowLeft") || keysArray.includes("ArrowUp") ? "left" : "right";
    const granularity =
        keysArray.includes("ArrowUp") || keysArray.includes("ArrowDown") ? "line" : "character";
    const selection = editor.document.getSelection();
    selection.modify(alter, direction, granularity);
}

export function unlinkByCommand(editor) {
    editor.shared.execCommand("removeLinkFromSelection");
}

export async function unlinkFromToolbar() {
    await waitFor(".o-we-toolbar");
    await click(".btn[name='unlink']");
}

export async function unlinkFromPopover() {
    await waitFor(".o-we-linkpopover");
    await click(".o_we_remove_link");
}

/** @param {Editor} editor */
export async function keydownTab(editor) {
    await manuallyDispatchProgrammaticEvent(editor.editable, "keydown", { key: "Tab" });
}
/** @param {Editor} editor */
export async function keydownShiftTab(editor) {
    await manuallyDispatchProgrammaticEvent(editor.editable, "keydown", {
        key: "Tab",
        shiftKey: true,
    });
}
/** @param {Editor} editor */
export function resetSize(editor) {
    const selection = editor.shared.getEditableSelection();
    editor.shared.resetTableSize(findInSelection(selection, "table"));
}
/** @param {Editor} editor */
export function justifyLeft(editor) {
    editor.shared.execCommand("justifyLeft");
}
/** @param {Editor} editor */
export function justifyCenter(editor) {
    editor.shared.execCommand("justifyCenter");
}
/** @param {Editor} editor */
export function justifyRight(editor) {
    editor.shared.execCommand("justifyRight");
}
/** @param {Editor} editor */
export function justifyFull(editor) {
    editor.shared.execCommand("justifyFull");
}

/**
 * @param {string} color
 * @param {string} mode
 */
export function setColor(color, mode) {
    /** @param {Editor} editor */
    return (editor) => {
        editor.shared.execCommand("applyColor", { color, mode });
    };
}

// Mock an paste event and send it to the editor.

/**
 * @param {Editor} editor
 * @param {string} text
 * @param {string} type
 */
function pasteData(editor, text, type) {
    const clipboardData = new DataTransfer();
    clipboardData.setData(type, text);
    const pasteEvent = new ClipboardEvent("paste", { clipboardData, bubbles: true });
    editor.editable.dispatchEvent(pasteEvent);
}
/**
 * @param {Editor} editor
 * @param {string} text
 */
export function pasteText(editor, text) {
    return pasteData(editor, text, "text/plain");
}
/**
 * @param {Editor} editor
 * @param {string} html
 */
export function pasteHtml(editor, html) {
    return pasteData(editor, html, "text/html");
}
/**
 * @param {Editor} editor
 * @param {string} html
 */
export function pasteOdooEditorHtml(editor, html) {
    return pasteData(editor, html, "application/vnd.odoo.odoo-editor");
}
/**
 * @param {Node} node
 */
export async function tripleClick(node) {
    const anchorNode = node;
    node = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode;
    await manuallyDispatchProgrammaticEvent(node, "mousedown", { detail: 3 });
    let focusNode = closestBlock(anchorNode).nextSibling;
    let focusOffset = 0;
    if (!focusNode) {
        [focusNode, focusOffset] = endPos(anchorNode);
    }
    setSelection({
        anchorNode,
        anchorOffset: 0,
        focusNode,
        focusOffset,
    });
    await manuallyDispatchProgrammaticEvent(node, "mouseup", { detail: 3 });
    await manuallyDispatchProgrammaticEvent(node, "click", { detail: 3 });

    await tick();
}
