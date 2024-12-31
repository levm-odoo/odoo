import { _t } from "@web/core/l10n/translation";
import { Plugin } from "../plugin";
import { closestBlock, isBlock } from "../utils/blocks";
import {
    cleanTrailingBR,
    fillEmpty,
    fillShrunkPhrasingParent,
    makeContentsInline,
    removeClass,
    setTagName,
    splitTextNode,
    unwrapContents,
    wrapInlinesInBlocks,
} from "../utils/dom";
import {
    allowsParagraphRelatedElements,
    getDeepestPosition,
    isContentEditable,
    isEmptyBlock,
    isProtecting,
    isProtected,
    isSelfClosingElement,
    isShrunkBlock,
    isTangible,
    isUnprotecting,
    paragraphRelatedElements,
} from "../utils/dom_info";
import {
    childNodes,
    children,
    closestElement,
    descendants,
    firstLeaf,
    lastLeaf,
} from "../utils/dom_traversal";
import { FONT_SIZE_CLASSES, TEXT_STYLE_CLASSES } from "../utils/formatting";
import { DIRECTIONS, childNodeIndex, nodeSize, rightPos } from "../utils/position";
import { callbacksForCursorUpdate } from "@html_editor/utils/selection";
import { convertList, getListMode } from "@html_editor/utils/list";

const getConnectedParents = (nodes) => {
    const insertedNodesParents = new Set();
    for (const insertedNode of nodes) {
        if (insertedNode.isConnected && insertedNode.parentElement) {
            insertedNodesParents.add(insertedNode.parentElement);
        }
    }
    return insertedNodesParents;
};

/**
 * @typedef {Object} DomShared
 * @property { DomPlugin['insert'] } insert
 * @property { DomPlugin['copyAttributes'] } copyAttributes
 */

export class DomPlugin extends Plugin {
    static id = "dom";
    static dependencies = ["selection", "history", "split", "delete", "lineBreak"];
    static shared = ["insert", "copyAttributes", "setTag"];
    resources = {
        user_commands: [
            { id: "insertFontAwesome", run: this.insertFontAwesome.bind(this) },
            { id: "setTag", run: this.setTag.bind(this) },
            {
                id: "insertSeparator",
                title: _t("Separator"),
                description: _t("Insert a horizontal rule separator"),
                icon: "fa-minus",
                run: this.insertSeparator.bind(this),
            },
        ],
        powerbox_items: {
            categoryId: "structure",
            commandId: "insertSeparator",
        },
        /** Handlers */
        clean_handlers: this.removeEmptyClassAndStyleAttributes.bind(this),
        clean_for_save_handlers: ({ root }) => {
            this.removeEmptyClassAndStyleAttributes(root);
            for (const el of root.querySelectorAll("hr[contenteditable]")) {
                el.removeAttribute("contenteditable");
            }
        },
        normalize_handlers: this.normalize.bind(this),
    };
    contentEditableToRemove = new Set();

    // Shared

    /**
     * @param {string | DocumentFragment | Element | null} content
     */
    insert(content) {
        if (!content) {
            return;
        }
        let selection = this.dependencies.selection.getEditableSelection();
        let startNode;
        let insertBefore = false;
        if (!selection.isCollapsed) {
            this.dependencies.delete.deleteSelection();
            selection = this.dependencies.selection.getEditableSelection();
        }
        if (selection.startContainer.nodeType === Node.TEXT_NODE) {
            insertBefore = !selection.startOffset;
            splitTextNode(selection.startContainer, selection.startOffset, DIRECTIONS.LEFT);
            startNode = selection.startContainer;
        }

        const container = this.document.createElement("fake-element");
        const containerFirstChild = this.document.createElement("fake-element-fc");
        const containerLastChild = this.document.createElement("fake-element-lc");

        if (typeof content === "string") {
            container.textContent = content;
        } else {
            if (content.nodeType === Node.ELEMENT_NODE) {
                this.dispatchTo("normalize_handlers", content);
            } else {
                for (const child of children(content)) {
                    this.dispatchTo("normalize_handlers", child);
                }
            }
            container.replaceChildren(content);
        }
        const allInsertedNodes = [];

        // In case the html inserted starts with a list and will be inserted within
        // a list, unwrap the list elements from the list.
        const isList = (node) => ["UL", "OL"].includes(node.nodeName);
        const hasSingleChild = container.childNodes.length === 1;
        if (closestElement(selection.anchorNode, "UL, OL") && isList(container.firstChild)) {
            unwrapContents(container.firstChild);
        }
        // Similarly if the html inserted ends with a list.
        if (
            closestElement(selection.focusNode, "UL, OL") &&
            isList(container.lastChild) &&
            !hasSingleChild
        ) {
            unwrapContents(container.lastChild);
        }

        startNode = startNode || this.dependencies.selection.getEditableSelection().anchorNode;
        const block = closestBlock(selection.anchorNode);

        const shouldUnwrap = (node) =>
            [...paragraphRelatedElements, "LI"].includes(node.nodeName) &&
            !isEmptyBlock(block) &&
            !isEmptyBlock(node) &&
            (isContentEditable(node) ||
                (!node.isConnected && !closestElement(node, "[contenteditable]"))) &&
            !this.dependencies.split.isUnsplittable(node) &&
            [node.nodeName, "DIV"].includes(block.nodeName) &&
            // If the selection anchorNode is the editable itself, the content
            // should not be unwrapped.
            !this.isEditionBoundary(selection.anchorNode);

        // Empty block must contain a br element to allow cursor placement.
        if (
            container.lastElementChild &&
            isBlock(container.lastElementChild) &&
            !container.lastElementChild.hasChildNodes()
        ) {
            fillEmpty(container.lastElementChild);
        }

        // In case the html inserted is all contained in a single root <p> or <li>
        // tag, we take the all content of the <p> or <li> and avoid inserting the
        // <p> or <li>.
        if (container.childElementCount === 1 && shouldUnwrap(container.firstChild)) {
            const p = container.firstElementChild;
            container.replaceChildren(...childNodes(p));
        } else if (container.childElementCount > 1) {
            const isSelectionAtStart =
                firstLeaf(block) === selection.anchorNode && selection.anchorOffset === 0;
            const isSelectionAtEnd =
                lastLeaf(block) === selection.focusNode &&
                selection.focusOffset === nodeSize(selection.focusNode);
            // Grab the content of the first child block and isolate it.
            if (shouldUnwrap(container.firstChild) && !isSelectionAtStart) {
                // Unwrap the deepest nested first <li> element in the
                // container to extract and paste the text content of the list.
                if (container.firstChild.nodeName === "LI") {
                    const deepestBlock = closestBlock(firstLeaf(container.firstChild));
                    this.dependencies.split.splitAroundUntil(deepestBlock, container.firstChild);
                    container.firstElementChild.replaceChildren(...childNodes(deepestBlock));
                }
                containerFirstChild.replaceChildren(...childNodes(container.firstElementChild));
                container.firstElementChild.remove();
            }
            // Grab the content of the last child block and isolate it.
            if (shouldUnwrap(container.lastChild) && !isSelectionAtEnd) {
                // Unwrap the deepest nested last <li> element in the container
                // to extract and paste the text content of the list.
                if (container.lastChild.nodeName === "LI") {
                    const deepestBlock = closestBlock(lastLeaf(container.lastChild));
                    this.dependencies.split.splitAroundUntil(deepestBlock, container.lastChild);
                    container.lastElementChild.replaceChildren(...childNodes(deepestBlock));
                }
                containerLastChild.replaceChildren(...childNodes(container.lastElementChild));
                container.lastElementChild.remove();
            }
        }

        if (startNode.nodeType === Node.ELEMENT_NODE) {
            if (selection.anchorOffset === 0) {
                const textNode = this.document.createTextNode("");
                if (isSelfClosingElement(startNode)) {
                    startNode.parentNode.insertBefore(textNode, startNode);
                } else {
                    startNode.prepend(textNode);
                }
                startNode = textNode;
                allInsertedNodes.push(textNode);
            } else {
                startNode = childNodes(startNode).at(selection.anchorOffset - 1);
            }
        }

        // If we have isolated block content, first we split the current focus
        // element if it's a block then we insert the content in the right places.
        let currentNode = startNode;
        const currentList = currentNode && closestElement(currentNode, "UL, OL");
        const mode = currentList && getListMode(currentList);

        const _insertAt = (reference, nodes, insertBefore) => {
            for (const child of insertBefore ? nodes.reverse() : nodes) {
                reference[insertBefore ? "before" : "after"](child);
                reference = child;
            }
        };
        const lastInsertedNodes = childNodes(containerLastChild);
        if (containerLastChild.hasChildNodes()) {
            const toInsert = childNodes(containerLastChild); // Prevent mutation
            _insertAt(currentNode, [...toInsert], insertBefore);
            currentNode = insertBefore ? toInsert[0] : currentNode;
            toInsert[toInsert.length - 1];
        }
        const firstInsertedNodes = childNodes(containerFirstChild);
        if (containerFirstChild.hasChildNodes()) {
            const toInsert = childNodes(containerFirstChild); // Prevent mutation
            _insertAt(currentNode, [...toInsert], insertBefore);
            currentNode = toInsert[toInsert.length - 1];
            insertBefore = false;
        }
        allInsertedNodes.push(...firstInsertedNodes);

        // If all the Html have been isolated, We force a split of the parent element
        // to have the need new line in the final result
        if (!container.hasChildNodes()) {
            if (this.dependencies.split.isUnsplittable(closestBlock(currentNode.nextSibling))) {
                this.dependencies.lineBreak.insertLineBreakNode({
                    targetNode: currentNode.nextSibling,
                    targetOffset: 0,
                });
            } else {
                // If we arrive here, the o_enter index should always be 0.
                const parent = currentNode.nextSibling.parentElement;
                const index = childNodes(parent).indexOf(currentNode.nextSibling);
                this.dependencies.split.splitBlockNode({
                    targetNode: parent,
                    targetOffset: index,
                });
            }
        }

        let nodeToInsert;
        let doesCurrentNodeAllowsP = allowsParagraphRelatedElements(currentNode);
        const insertedNodes = childNodes(container);
        while ((nodeToInsert = container.firstChild)) {
            if (isBlock(nodeToInsert) && !doesCurrentNodeAllowsP) {
                // Split blocks at the edges if inserting new blocks (preventing
                // <p><p>text</p></p> or <li><li>text</li></li> scenarios).
                while (
                    !this.isEditionBoundary(currentNode.parentElement) &&
                    (!allowsParagraphRelatedElements(currentNode.parentElement) ||
                        (currentNode.parentElement.nodeName === "LI" &&
                            !this.dependencies.split.isUnsplittable(nodeToInsert)))
                ) {
                    if (this.dependencies.split.isUnsplittable(currentNode.parentElement)) {
                        // If we have to insert an unsplittable element, we cannot afford to
                        // unwrap it we need to search for a more suitable spot to put it
                        if (this.dependencies.split.isUnsplittable(nodeToInsert)) {
                            currentNode = currentNode.parentElement;
                            doesCurrentNodeAllowsP = allowsParagraphRelatedElements(currentNode);
                            continue;
                        } else {
                            makeContentsInline(container);
                            nodeToInsert = container.firstChild;
                            break;
                        }
                    }
                    let offset = childNodeIndex(currentNode);
                    if (!insertBefore) {
                        offset += 1;
                    }
                    if (offset) {
                        const [left, right] = this.dependencies.split.splitElement(
                            currentNode.parentElement,
                            offset
                        );
                        currentNode = insertBefore ? right : left;
                        const otherNode = insertBefore ? left : right;
                        if (
                            this.dependencies.split.isUnsplittable(nodeToInsert) &&
                            nodeSize(container) === 1
                        ) {
                            fillShrunkPhrasingParent(otherNode);
                        } else if (isEmptyBlock(otherNode)) {
                            otherNode.remove();
                        }
                    } else {
                        if (isBlock(currentNode)) {
                            fillShrunkPhrasingParent(currentNode);
                        }
                        currentNode = currentNode.parentElement;
                    }
                    doesCurrentNodeAllowsP = allowsParagraphRelatedElements(currentNode);
                }
                if (
                    currentNode.parentElement.nodeName === "LI" &&
                    isBlock(nodeToInsert) &&
                    this.dependencies.split.isUnsplittable(nodeToInsert)
                ) {
                    const br = document.createElement("br");
                    currentNode[
                        isEmptyBlock(currentNode) || !isTangible(currentNode) ? "before" : "after"
                    ](br);
                }
            }
            // Ensure that all adjacent paragraph elements are converted to
            // <li> when inserting in a list.
            if (
                block.nodeName === "LI" &&
                paragraphRelatedElements.includes(nodeToInsert.nodeName)
            ) {
                // TODO baseContainer: this change may be related to the fix for isConnected on cleanTrailingBR
                nodeToInsert = setTagName(nodeToInsert, "LI");
            }
            if (
                currentList &&
                ((nodeToInsert.nodeName === "LI" && nodeToInsert.classList.contains("oe-nested")) ||
                    isList(nodeToInsert))
            ) {
                nodeToInsert = convertList(nodeToInsert, mode);
            }
            if (insertBefore) {
                currentNode.before(nodeToInsert);
                insertBefore = false;
            } else {
                currentNode.after(nodeToInsert);
            }
            allInsertedNodes.push(nodeToInsert);
            if (currentNode.tagName !== "BR" && isShrunkBlock(currentNode)) {
                currentNode.remove();
            }
            currentNode = nodeToInsert;
        }
        allInsertedNodes.push(...lastInsertedNodes);
        let insertedNodesParents = getConnectedParents(allInsertedNodes);
        for (const parent of insertedNodesParents) {
            if (
                !this.config.allowInlineAtRoot &&
                this.isEditionBoundary(parent) &&
                allowsParagraphRelatedElements(parent)
            ) {
                // Ensure that edition boundaries do not have inline content.
                wrapInlinesInBlocks(parent);
            }
        }
        insertedNodesParents = getConnectedParents(allInsertedNodes);
        for (const parent of insertedNodesParents) {
            if (
                !isProtecting(parent) &&
                !(isProtected(parent) && !isUnprotecting(parent)) &&
                parent.isContentEditable
            ) {
                cleanTrailingBR(parent, [
                    (node) => {
                        // Don't remove the last BR in cases where the
                        // previous sibling is an unsplittable block
                        // (i.e. a table, a non-editable div, ...)
                        // to allow placing the cursor after that unsplittable
                        // element. This can be removed when the cursor
                        // is properly handled around these elements.
                        const previousSibling = node.previousSibling;
                        return (
                            previousSibling &&
                            isBlock(previousSibling) &&
                            this.dependencies.split.isUnsplittable(previousSibling)
                        );
                    },
                ]);
            }
        }
        for (const insertedNode of allInsertedNodes.reverse()) {
            if (insertedNode.isConnected) {
                currentNode = insertedNode;
                break;
            }
        }
        let lastPosition = [...paragraphRelatedElements, "LI", "OL", "UL"].includes(
            currentNode.nodeName
        )
            ? rightPos(lastLeaf(currentNode))
            : rightPos(currentNode);

        if (!this.config.allowInlineAtRoot && this.isEditionBoundary(lastPosition[0])) {
            // Correct the position if it happens to be in the editable root.
            lastPosition = getDeepestPosition(...lastPosition);
        }
        this.dependencies.selection.setSelection(
            { anchorNode: lastPosition[0], anchorOffset: lastPosition[1] },
            { normalize: false }
        );
        return firstInsertedNodes.concat(insertedNodes).concat(lastInsertedNodes);
    }

    isEditionBoundary(node) {
        if (node?.nodeType !== Node.ELEMENT_NODE) {
            return false;
        }
        if (node === this.editable) {
            return true;
        }
        return node.hasAttribute("contenteditable");
    }

    /**
     * @param {HTMLElement} source
     * @param {HTMLElement} target
     */
    copyAttributes(source, target) {
        this.dispatchTo("clean_handlers", source);
        for (const attr of source.attributes) {
            if (attr.name === "class") {
                target.classList.add(...source.classList);
            } else {
                target.setAttribute(attr.name, attr.value);
            }
        }
    }

    // --------------------------------------------------------------------------
    // commands
    // --------------------------------------------------------------------------

    insertFontAwesome({ faClass = "fa fa-star" } = {}) {
        const fontAwesomeNode = document.createElement("i");
        fontAwesomeNode.className = faClass;
        this.insert(fontAwesomeNode);
        this.dependencies.history.addStep();
        const [anchorNode, anchorOffset] = rightPos(fontAwesomeNode);
        this.dependencies.selection.setSelection({ anchorNode, anchorOffset });
    }

    /**
     * @param {Object} param0
     * @param {string} param0.tagName
     * @param {string} [param0.extraClass]
     */
    setTag({ tagName, extraClass = "" }) {
        tagName = tagName.toUpperCase();
        const cursors = this.dependencies.selection.preserveSelection();
        const selectedBlocks = [...this.dependencies.selection.getTraversedBlocks()];
        const deepestSelectedBlocks = selectedBlocks.filter(
            (block) =>
                !descendants(block).some((descendant) => selectedBlocks.includes(descendant)) &&
                block.isContentEditable
        );
        for (const block of deepestSelectedBlocks) {
            if (
                ["P", "PRE", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE"].includes(
                    block.nodeName
                )
            ) {
                if (tagName === "P") {
                    if (block.nodeName === "LI") {
                        continue;
                    } else if (block.parentNode.nodeName === "LI") {
                        cursors.update(callbacksForCursorUpdate.unwrap(block));
                        unwrapContents(block);
                        continue;
                    }
                }

                const newEl = setTagName(block, tagName);
                cursors.remapNode(block, newEl);
                // We want to be able to edit the case `<h2 class="h3">`
                // but in that case, we want to display "Header 2" and
                // not "Header 3" as it is more important to display
                // the semantic tag being used (especially for h1 ones).
                // This is why those are not in `TEXT_STYLE_CLASSES`.
                const headingClasses = ["h1", "h2", "h3", "h4", "h5", "h6"];
                removeClass(newEl, ...FONT_SIZE_CLASSES, ...TEXT_STYLE_CLASSES, ...headingClasses);
                delete newEl.style.fontSize;
                if (extraClass) {
                    newEl.classList.add(extraClass);
                }
            } else {
                // eg do not change a <div> into a h1: insert the h1
                // into it instead.
                const newBlock = this.document.createElement(tagName);
                newBlock.append(...childNodes(block));
                block.append(newBlock);
                cursors.remapNode(block, newBlock);
            }
        }
        cursors.restore();
        this.dependencies.history.addStep();
    }

    insertSeparator() {
        const selection = this.dependencies.selection.getEditableSelection();
        const sep = this.document.createElement("hr");
        const block = closestBlock(selection.startContainer);
        const element =
            closestElement(selection.startContainer, (el) =>
                paragraphRelatedElements.includes(el.tagName)
            ) || (block && block.nodeName !== "LI" ? block : null);

        if (element && element !== this.editable) {
            element.before(sep);
        }
        this.dependencies.history.addStep();
    }

    removeEmptyClassAndStyleAttributes(root) {
        for (const node of [root, ...descendants(root)]) {
            if (node.classList && !node.classList.length) {
                node.removeAttribute("class");
            }
            if (node.style && !node.style.length) {
                node.removeAttribute("style");
            }
        }
    }

    normalize(el) {
        if (el.tagName === "HR") {
            el.setAttribute(
                "contenteditable",
                el.hasAttribute("contenteditable") ? el.getAttribute("contenteditable") : "false"
            );
        } else {
            for (const separator of el.querySelectorAll("hr")) {
                separator.setAttribute(
                    "contenteditable",
                    separator.hasAttribute("contenteditable")
                        ? separator.getAttribute("contenteditable")
                        : "false"
                );
            }
        }
    }
}
