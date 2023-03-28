/** @odoo-module **/
import {
    closestBlock,
    endPos,
    fillEmpty,
    getListMode,
    isBlock,
    isEmptyBlock,
    isVisibleEmpty,
    moveNodes,
    preserveCursor,
    isFontAwesome,
    getDeepRange,
    isUnbreakable,
    closestElement,
    getUrlsInfosInString,
    isVoidElement,
    isEditorTab,
    isZWS,
} from './utils.js';

const NOT_A_NUMBER = /[^\d]/g;
export function areSimilarElements(node, node2) {
    if (
        !node ||
        !node2 ||
        node.nodeType !== Node.ELEMENT_NODE ||
        node2.nodeType !== Node.ELEMENT_NODE
    ) {
        return false;
    }
    if (node.tagName !== node2.tagName) {
        return false;
    }
    for (const att of node.attributes) {
        const att2 = node2.attributes[att.name];
        if ((att2 && att2.value) !== att.value) {
            return false;
        }
    }
    for (const att of node2.attributes) {
        const att2 = node.attributes[att.name];
        if ((att2 && att2.value) !== att.value) {
            return false;
        }
    }
    function isNotNoneValue(value) {
        return value && value !== 'none';
    }
    if (
        isNotNoneValue(getComputedStyle(node, ':before').getPropertyValue('content')) ||
        isNotNoneValue(getComputedStyle(node, ':after').getPropertyValue('content')) ||
        isNotNoneValue(getComputedStyle(node2, ':before').getPropertyValue('content')) ||
        isNotNoneValue(getComputedStyle(node2, ':after').getPropertyValue('content'))
    ) {
        return false;
    }
    if (node.tagName === 'LI' && node.classList.contains('oe-nested')) {
        return (
            node.lastElementChild &&
            node2.firstElementChild &&
            getListMode(node.lastElementChild) === getListMode(node2.firstElementChild)
        );
    }
    if (['UL', 'OL'].includes(node.tagName)) {
        return !isVisibleEmpty(node) && !isVisibleEmpty(node2);
    }
    if (isBlock(node) || isVisibleEmpty(node) || isVisibleEmpty(node2)) {
        return false;
    }
    const nodeStyle = getComputedStyle(node);
    const node2Style = getComputedStyle(node2);
    return (
        !+nodeStyle.padding.replace(NOT_A_NUMBER, '') &&
        !+node2Style.padding.replace(NOT_A_NUMBER, '') &&
        !+nodeStyle.margin.replace(NOT_A_NUMBER, '') &&
        !+node2Style.margin.replace(NOT_A_NUMBER, '')
    );
}

class Sanitize {
    constructor(root) {
        this.root = root;
        const rootClosestBlock = closestBlock(root);
        if (rootClosestBlock) {
            // Remove unique ids from checklists. These will be renewed afterwards.
            for (const node of rootClosestBlock.querySelectorAll('[id^=checklist-id-]')) {
                node.removeAttribute('id');
            }
        }
        this.parse(root);
        if (rootClosestBlock) {
            // Ensure unique ids on checklists and stars.
            for (const node of rootClosestBlock.querySelectorAll('.o_checklist > li')) {
                node.setAttribute('id', `checklist-id-${Math.floor(new Date() * Math.random())}`);
            }
        }
    }

    parse(node) {
        node = closestBlock(node);
        if (node && ['UL', 'OL'].includes(node.tagName)) {
            node = node.parentElement;
        }
        this._parse(node);
    }

    _parse(node) {
        while (node) {
            // Merge identical elements together
            while (
                areSimilarElements(node, node.previousSibling) &&
                !isUnbreakable(node)
            ) {
                getDeepRange(this.root, { select: true });
                const restoreCursor = node.isConnected &&
                    preserveCursor(this.root.ownerDocument);
                const nodeP = node.previousSibling;
                moveNodes(...endPos(node.previousSibling), node);
                if (restoreCursor) {
                    restoreCursor();
                }
                node = nodeP;
            }

            const sel = this.root.ownerDocument.getSelection();
            const anchor = sel && this.root.ownerDocument.getSelection().anchorNode;
            const anchorEl = anchor && closestElement(anchor);
            // Remove zero-width spaces added by `fillEmpty` when there is
            // content and the selection is not next to it.
            if (
                node.nodeType === Node.TEXT_NODE &&
                node.textContent.includes('\u200B') &&
                node.parentElement.hasAttribute('oe-zws-empty-inline') &&
                (
                    node.textContent.length > 1 ||
                    // There can be multiple ajacent text nodes, in which case
                    // the zero-width space is not needed either, despite being
                    // alone (length === 1) in its own text node.
                    Array.from(node.parentNode.childNodes).find(
                        sibling =>
                            sibling !== node &&
                            sibling.nodeType === Node.TEXT_NODE &&
                            sibling.length > 0
                    )
                ) &&
                !isBlock(node.parentElement) &&
                anchor !== node
            ) {
                const restoreCursor = node.isConnected &&
                    preserveCursor(this.root.ownerDocument);
                node.textContent = node.textContent.replace('\u200B', '');
                node.parentElement.removeAttribute("oe-zws-empty-inline");
                if (restoreCursor) {
                    restoreCursor();
                }
            }

            // Remove empty blocks in <li>
            if (
                node.nodeName === 'P' &&
                node.parentElement.tagName === 'LI' &&
                isEmptyBlock(node)
            ) {
                const parent = node.parentElement;
                const restoreCursor = node.isConnected &&
                    preserveCursor(this.root.ownerDocument);
                node.remove();
                fillEmpty(parent);
                if (restoreCursor) {
                    restoreCursor(new Map([[node, parent]]));
                }
            }

            // Transform <li> into <p> if they are not in a <ul> / <ol>
            if (node.nodeName === 'LI' && !node.closest('ul, ol')) {
                const paragraph = document.createElement("p");
                paragraph.replaceChildren(...node.childNodes);
                node.replaceWith(paragraph);
                node = paragraph;
            }

            // Ensure a zero width space is present inside the FA element.
            if (isFontAwesome(node) && node.textContent !== '\u200B') {
                node.textContent = '\u200B';
            }

            // Ensure the editor tabs align on a 40px grid.
            if (isEditorTab(node)) {
                let tabPreviousSibling = node.previousSibling;
                while (isZWS(tabPreviousSibling)) {
                    tabPreviousSibling = tabPreviousSibling.previousSibling;
                }
                if (isEditorTab(tabPreviousSibling)) {
                    node.style.width = '40px';
                } else {
                    const editable = closestElement(node, '.odoo-editor-editable');
                    if (editable && editable.firstElementChild) {
                        const nodeRect = node.getBoundingClientRect();
                        const referenceRect = editable.firstElementChild.getBoundingClientRect();
                        // Values from getBoundingClientRect() are all zeros
                        // during Editor startup or saving. We cannot
                        // recalculate the tabs width in thoses cases.
                        if (nodeRect.width && referenceRect.width) {
                            const width = (nodeRect.left - referenceRect.left) % 40;
                            node.style.width = (40 - width) + 'px';
                        }
                    }
                }
            }

            // Ensure elements which should not contain any content are tagged
            // contenteditable=false to avoid any hiccup.
            if (
                isVoidElement(node) &&
                node.getAttribute('contenteditable') !== 'false'
            ) {
                node.setAttribute('contenteditable', 'false');
            }

            if (node.firstChild) {
                this._parse(node.firstChild);
            }

            // Update link URL if label is a new valid link.
            if (node.nodeName === 'A' && anchorEl === node) {
                const linkLabel = node.innerText;
                const urlInfo = getUrlsInfosInString(linkLabel);
                if (urlInfo.length && urlInfo[0].label === linkLabel && !node.href.startsWith('mailto:')) {
                    node.setAttribute('href', urlInfo[0].url);
                }
            }
            node = node.nextSibling;
        }

    }
}

export function sanitize(root) {
    new Sanitize(root);
    return root;
}
