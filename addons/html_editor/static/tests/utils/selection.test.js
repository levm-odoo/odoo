import { DIRECTIONS } from "@html_editor/utils/position";
import { getCursorDirection } from "@html_editor/utils/selection";
import { describe, expect, test } from "@odoo/hoot";
import { manuallyDispatchProgrammaticEvent as dispatch } from "@odoo/hoot-dom";
import { setupEditor, testEditor } from "../_helpers/editor";
import { unformat } from "../_helpers/format";
import { insertText } from "../_helpers/user_actions";

function getProcessSelection(selection) {
    const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
    return [anchorNode, anchorOffset, focusNode, focusOffset];
}
/**
 * Guarantee that the focus is on element or one of its children.
 *
 * A simple call to element.focus will change the editable context
 * if one of the parents of the current activeElement is not editable,
 * and the caret position will not be preserved, even if activeElement is
 * one of the subchildren of element. This is why the (re)focus is
 * only called when the current activeElement is not one of the
 * (sub)children of element.
 *
 * @param {Element} element should have the focus or a child with the focus
 */
export function ensureFocus(element) {
    const activeElement = element.ownerDocument.activeElement;
    if (
        activeElement !== element &&
        (!element.contains(activeElement) || !activeElement.isContentEditable)
    ) {
        element.focus();
    }
}

describe("getTraversedNodes", () => {
    test("should return the anchor node of a collapsed selection", async () => {
        const { editor } = await setupEditor("<div><p>a[]bc</p><div>def</div></div>");
        expect(
            editor.shared
                .getTraversedNodes()
                .map((node) =>
                    node.nodeType === Node.TEXT_NODE ? node.textContent : node.nodeName
                )
        ).toEqual(["abc"]);
    });

    test("should return the nodes traversed in a cross-blocks selection", async () => {
        const { editor } = await setupEditor("<div><p>a[bc</p><div>d]ef</div></div>");
        expect(
            editor.shared
                .getTraversedNodes()
                .map((node) =>
                    node.nodeType === Node.TEXT_NODE ? node.textContent : node.nodeName
                )
        ).toEqual(["abc", "DIV", "def"]);
    });

    test("should return the nodes traversed in a cross-blocks selection with hybrid nesting", async () => {
        const { editor } = await setupEditor(
            "<div><section><p>a[bc</p></section><div>d]ef</div></div>"
        );
        expect(
            editor.shared
                .getTraversedNodes()
                .map((node) =>
                    node.nodeType === Node.TEXT_NODE ? node.textContent : node.nodeName
                )
        ).toEqual(["abc", "DIV", "def"]);
    });

    test("should return an image in a parent selection", async () => {
        const { editor } = await setupEditor(`<div id="parent-element-to-select"><img></div>`);
        const sel = editor.document.getSelection();
        const range = editor.document.createRange();
        const parent = editor.document.querySelector("div#parent-element-to-select");
        range.setStart(parent, 0);
        range.setEnd(parent, 1);
        sel.removeAllRanges();
        sel.addRange(range);
        expect(
            editor.shared
                .getTraversedNodes()
                .map((node) =>
                    node.nodeType === Node.TEXT_NODE ? node.textContent : node.nodeName
                )
        ).toEqual(["DIV", "IMG"]);
    });

    test("should return the text node in which the range is collapsed", async () => {
        const { el: editable, editor } = await setupEditor("<p>ab[]cd</p>");
        const abcd = editable.firstChild.firstChild;
        const result = editor.shared.getTraversedNodes();
        expect(result).toEqual([abcd]);
    });

    test("should find that a the range traverses the next paragraph as well", async () => {
        const { el: editable, editor } = await setupEditor("<p>ab[cd</p><p>ef]gh</p>");
        const abcd = editable.firstChild.firstChild;
        const p2 = editable.childNodes[1];
        const efgh = p2.firstChild;
        const result = editor.shared.getTraversedNodes();
        expect(result).toEqual([abcd, p2, efgh]);
    });

    test("should find all traversed nodes in nested range", async () => {
        const { el: editable, editor } = await setupEditor(
            '<p><span class="a">ab[</span>cd</p><div><p><span class="b"><b>e</b><i>f]g</i>h</span></p></div>'
        );
        const ab = editable.firstChild.firstChild.firstChild;
        const cd = editable.firstChild.lastChild;
        const div = editable.lastChild;
        const p2 = div.firstChild;
        const span2 = p2.firstChild;
        const b = span2.firstChild;
        const e = b.firstChild;
        const i = b.nextSibling;
        const fg = i.firstChild;
        const result = editor.shared.getTraversedNodes();
        expect(result).toEqual([ab, cd, div, p2, span2, b, e, i, fg]);
    });
});

describe("ensureFocus", () => {
    // TODO @phoenix: unskipped when ensureFocus is add in the code base
    test("should preserve the focus on the child of this.editable when executing a powerbox command even if it is enclosed in a contenteditable=false", async () => {
        await testEditor({
            contentBefore: unformat(`
                <div contenteditable="false"><div contenteditable="true">
                    <p>[]<br></p>
                </div></div>
                <p><br></p>`),
            stepFunction: async (editor) => {
                const sel = document.getSelection();
                const element = sel.anchorNode;
                await dispatch(editor.editable, "keydown", { key: "/" });
                insertText(editor, "/");
                await dispatch(editor.editable, "keyup", { key: "/" });
                insertText(editor, "h2");
                await dispatch(element, "keyup", { key: "2" });
                await dispatch(editor.editable, "keydown", { key: "Enter" });
                const activeElement = document.activeElement;
                editor.shared.setCursorStart(activeElement.lastElementChild);
                // TODO @phoenix still need it ?
                // await nextTickFrame();
            },
            contentAfter: unformat(`
                <div contenteditable="false"><div contenteditable="true">
                    <h2>[]<br></h2>
                </div></div>
                <p><br></p>`),
        });
    });

    test("should preserve the focus on the child of this.editable even if it is enclosed in a contenteditable=false", async () => {
        await testEditor({
            contentBefore: unformat(`
                <div contenteditable="false"><div contenteditable="true">
                    <p>[]<br></p>
                </div></div>
                <p><br></p>`),
            stepFunction: async (editor) => {
                ensureFocus(editor.editable);
                let activeElement = document.activeElement;
                editor.shared.setCursorStart(activeElement.lastElementChild);
                insertText(editor, "focusWasConserved");
                // Proof that a simple call to Element.focus would change
                // the focus in this case.
                editor.editable.focus();
                activeElement = document.activeElement;
                editor.shared.setCursorStart(activeElement.lastElementChild);
            },
            contentAfter: unformat(`
                <div contenteditable="false"><div contenteditable="true">
                    <p>focusWasConserved</p>
                </div></div>
                <p>[]<br></p>`),
        });
    });

    test("should update the focus when the active element is not the focus target", async () => {
        await testEditor({
            contentBefore: unformat(`
                <div contenteditable="false"><div contenteditable="true">
                    <p>[]<br></p>
                </div></div>
                <div contenteditable="false"><div id="target" contenteditable="true">
                    <p><br></p>
                </div></div>`),
            stepFunction: async (editor) => {
                const element = editor.editable.querySelector("#target");
                ensureFocus(element);
                // TODO @phoenix still need it ?
                // await nextTickFrame();
                const activeElement = document.activeElement;
                editor.shared.setCursorStart(activeElement.lastElementChild);
                // TODO @phoenix still need it ?
                // await nextTickFrame();
            },
            contentAfter: unformat(`
                <div contenteditable="false"><div contenteditable="true">
                    <p><br></p>
                </div></div>
                <div contenteditable="false"><div id="target" contenteditable="true">
                    <p>[]<br></p>
                </div></div>`),
        });
    });
});

describe("setSelection", () => {
    describe("collapsed", () => {
        test("should collapse the cursor at the beginning of an element", async () => {
            const { editor, el } = await setupEditor("<p>abc</p>");
            const p = el.firstChild;
            const result = getProcessSelection(
                editor.shared.setSelection({
                    anchorNode: p.firstChild,
                    anchorOffset: 0,
                })
            );
            expect(result).toEqual([p.firstChild, 0, p.firstChild, 0]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([
                p.firstChild,
                0,
                p.firstChild,
                0,
            ]);
        });

        test("should collapse the cursor within an element", async () => {
            const { editor, el } = await setupEditor("<p>abcd</p>");
            const p = el.firstChild;
            const result = getProcessSelection(
                editor.shared.setSelection({
                    anchorNode: p.firstChild,
                    anchorOffset: 2,
                })
            );
            expect(result).toEqual([p.firstChild, 2, p.firstChild, 2]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([
                p.firstChild,
                2,
                p.firstChild,
                2,
            ]);
        });

        test("should collapse the cursor at the end of an element", async () => {
            const { editor, el } = await setupEditor("<p>abc</p>");
            const p = el.firstChild;
            const result = getProcessSelection(
                editor.shared.setSelection({
                    anchorNode: p.firstChild,
                    anchorOffset: 3,
                })
            );
            expect(result).toEqual([p.firstChild, 3, p.firstChild, 3]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([
                p.firstChild,
                3,
                p.firstChild,
                3,
            ]);
        });

        test("should collapse the cursor before a nested inline element", async () => {
            const { editor, el } = await setupEditor("<p>ab<span>cd<b>ef</b>gh</span>ij</p>");
            const p = el.firstChild;
            const cd = p.childNodes[1].firstChild;
            const result = getProcessSelection(
                editor.shared.setSelection({
                    anchorNode: cd,
                    anchorOffset: 2,
                })
            );
            expect(result).toEqual([cd, 2, cd, 2]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([cd, 2, cd, 2]);
        });

        test("should collapse the cursor at the beginning of a nested inline element", async () => {
            const { editor, el } = await setupEditor("<p>ab<span>cd<b>ef</b>gh</span>ij</p>");
            const p = el.firstChild;
            const ef = p.childNodes[1].childNodes[1].firstChild;
            const result = getProcessSelection(
                editor.shared.setSelection({
                    anchorNode: ef,
                    anchorOffset: 0,
                })
            );
            expect(result).toEqual([ef, 0, ef, 0]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([ef, 0, ef, 0]);
        });

        test("should collapse the cursor within a nested inline element", async () => {
            const { editor, el } = await setupEditor("<p>ab<span>cd<b>efgh</b>ij</span>kl</p>");
            const p = el.firstChild;
            const efgh = p.childNodes[1].childNodes[1].firstChild;
            const result = getProcessSelection(
                editor.shared.setSelection({
                    anchorNode: efgh,
                    anchorOffset: 2,
                })
            );
            expect(result).toEqual([efgh, 2, efgh, 2]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([efgh, 2, efgh, 2]);
        });

        test("should collapse the cursor at the end of a nested inline element", async () => {
            const { editor, el } = await setupEditor("<p>ab<span>cd<b>ef</b>gh</span>ij</p>");
            const p = el.firstChild;
            const ef = p.childNodes[1].childNodes[1].firstChild;
            const result = getProcessSelection(
                editor.shared.setSelection({
                    anchorNode: ef,
                    anchorOffset: 2,
                })
            );
            expect(result).toEqual([ef, 2, ef, 2]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([ef, 2, ef, 2]);
        });

        test("should collapse the cursor after a nested inline element", async () => {
            const { editor, el } = await setupEditor("<p>ab<span>cd<b>ef</b>gh</span>ij</p>");
            const p = el.firstChild;
            const ef = p.childNodes[1].childNodes[1].firstChild;
            const gh = p.childNodes[1].lastChild;
            const result = getProcessSelection(
                editor.shared.setSelection({
                    anchorNode: gh,
                    anchorOffset: 0,
                })
            );
            expect(result).toEqual([ef, 2, ef, 2]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([ef, 2, ef, 2]);

            const nonNormalizedResult = getProcessSelection(
                editor.shared.setSelection(
                    { anchorNode: gh, anchorOffset: 0 },
                    { normalize: false }
                )
            );
            expect(nonNormalizedResult).toEqual([gh, 0, gh, 0]);
            const sel = document.getSelection();
            expect([sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset]).toEqual([
                gh,
                0,
                gh,
                0,
            ]);
        });
    });

    describe("forward", () => {
        test("should select the contents of an element", async () => {
            const { editor, el } = await setupEditor("<p>abc</p>");
            const p = el.firstChild;
            const result = getProcessSelection(
                editor.shared.setSelection({
                    anchorNode: p.firstChild,
                    anchorOffset: 0,
                    focusNode: p.firstChild,
                    focusOffset: 3,
                })
            );
            expect(result).toEqual([p.firstChild, 0, p.firstChild, 3]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([
                p.firstChild,
                0,
                p.firstChild,
                3,
            ]);
        });

        test("should make a complex selection", async () => {
            const { el, editor } = await setupEditor(
                "<p>ab<span>cd<b>ef</b>gh</span>ij</p><p>kl<span>mn<b>op</b>qr</span>st</p>"
            );
            const [p1, p2] = el.childNodes;
            const ef = p1.childNodes[1].childNodes[1].firstChild;
            const qr = p2.childNodes[1].childNodes[2];
            const st = p2.childNodes[2];
            const result = getProcessSelection(
                editor.shared.setSelection({
                    anchorNode: ef,
                    anchorOffset: 1,
                    focusNode: st,
                    focusOffset: 0,
                })
            );
            expect(result).toEqual([ef, 1, qr, 2]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([ef, 1, qr, 2]);

            const nonNormalizedResult = getProcessSelection(
                editor.shared.setSelection(
                    {
                        anchorNode: ef,
                        anchorOffset: 1,
                        focusNode: st,
                        focusOffset: 0,
                    },
                    { normalize: false }
                )
            );
            expect(nonNormalizedResult).toEqual([ef, 1, st, 0]);
            const sel = document.getSelection();
            expect([sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset]).toEqual([
                ef,
                1,
                st,
                0,
            ]);
        });
    });

    describe("backward", () => {
        test("should select the contents of an element", async () => {
            const { editor, el } = await setupEditor("<p>abc</p>");
            const p = el.firstChild;
            const result = getProcessSelection(
                editor.shared.setSelection({
                    anchorNode: p.firstChild,
                    anchorOffset: 3,
                    focusNode: p.firstChild,
                    focusOffset: 0,
                })
            );
            expect(result).toEqual([p.firstChild, 3, p.firstChild, 0]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([
                p.firstChild,
                3,
                p.firstChild,
                0,
            ]);
        });

        test("should make a complex selection", async () => {
            const { el, editor } = await setupEditor(
                "<p>ab<span>cd<b>ef</b>gh</span>ij</p><p>kl<span>mn<b>op</b>qr</span>st</p>"
            );
            const [p1, p2] = el.childNodes;
            const ef = p1.childNodes[1].childNodes[1].firstChild;
            const qr = p2.childNodes[1].childNodes[2];
            const st = p2.childNodes[2];
            const result = getProcessSelection(
                editor.shared.setSelection({
                    anchorNode: st,
                    anchorOffset: 0,
                    focusNode: ef,
                    focusOffset: 1,
                })
            );
            expect(result).toEqual([qr, 2, ef, 1]);
            const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
            expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([qr, 2, ef, 1]);

            const nonNormalizedResult = getProcessSelection(
                editor.shared.setSelection(
                    {
                        anchorNode: st,
                        anchorOffset: 0,
                        focusNode: ef,
                        focusOffset: 1,
                    },
                    { normalize: false }
                )
            );
            expect(nonNormalizedResult).toEqual([st, 0, ef, 1]);
            const sel = document.getSelection();
            expect([sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset]).toEqual([
                st,
                0,
                ef,
                1,
            ]);
        });
    });
});

describe("setCursorStart", () => {
    test("should collapse the cursor at the beginning of an element", async () => {
        const { editor, el } = await setupEditor("<p>abc</p>");
        const p = el.firstChild;
        const result = getProcessSelection(editor.shared.setCursorStart(p));
        expect(result).toEqual([p.firstChild, 0, p.firstChild, 0]);
        const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
        expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([
            p.firstChild,
            0,
            p.firstChild,
            0,
        ]);
    });

    test("should collapse the cursor at the beginning of a nested inline element", async () => {
        const { editor, el } = await setupEditor("<p>ab<span>cd<b>ef</b>gh</span>ij</p>");
        const p = el.firstChild;
        const b = p.childNodes[1].childNodes[1];
        const ef = b.firstChild;
        const result = getProcessSelection(editor.shared.setCursorStart(b));
        expect(result).toEqual([ef, 0, ef, 0]);
        const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
        expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([ef, 0, ef, 0]);
    });

    test("should collapse the cursor after a nested inline element", async () => {
        const { editor, el } = await setupEditor("<p>ab<span>cd<b>ef</b>gh</span>ij</p>");
        const p = el.firstChild;
        const ef = p.childNodes[1].childNodes[1].firstChild;
        const gh = p.childNodes[1].lastChild;
        const result = getProcessSelection(editor.shared.setCursorStart(gh));
        expect(result).toEqual([ef, 2, ef, 2]);
        const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
        expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([ef, 2, ef, 2]);

        // @todo @phoenix normalize false is never use
        // const nonNormalizedResult = getProcessSelection(editor.shared.setCursorStart(gh, false));
        // expect(nonNormalizedResult).toEqual([gh, 0, gh, 0]);
        // const sel = document.getSelection();
        // expect([sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset]).toEqual([
        //     gh,
        //     0,
        //     gh,
        //     0,
        // ]);
    });
});

describe("setCursorEnd", () => {
    test("should collapse the cursor at the end of an element", async () => {
        const { editor, el } = await setupEditor("<p>abc</p>");
        const p = el.firstChild;
        const result = getProcessSelection(editor.shared.setCursorEnd(p));
        expect(result).toEqual([p.firstChild, 3, p.firstChild, 3]);
        const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
        expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([
            p.firstChild,
            3,
            p.firstChild,
            3,
        ]);
    });

    test("should collapse the cursor before a nested inline element", async () => {
        const { editor, el } = await setupEditor("<p>ab<span>cd<b>ef</b>gh</span>ij</p>");
        const p = el.firstChild;
        const cd = p.childNodes[1].firstChild;
        const result = getProcessSelection(editor.shared.setCursorEnd(cd));
        expect(result).toEqual([cd, 2, cd, 2]);
        const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
        expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([cd, 2, cd, 2]);
    });

    test("should collapse the cursor at the end of a nested inline element", async () => {
        const { editor, el } = await setupEditor("<p>ab<span>cd<b>ef</b>gh</span>ij</p>");
        const p = el.firstChild;
        const b = p.childNodes[1].childNodes[1];
        const ef = b.firstChild;
        const result = getProcessSelection(editor.shared.setCursorEnd(b));
        expect(result).toEqual([ef, 2, ef, 2]);
        const { anchorNode, anchorOffset, focusNode, focusOffset } = document.getSelection();
        expect([anchorNode, anchorOffset, focusNode, focusOffset]).toEqual([ef, 2, ef, 2]);
    });
});

describe("getCursorDirection", () => {
    test("should identify a forward selection", async () => {
        await testEditor({
            contentBefore: "<p>a[bc]d</p>",
            stepFunction: (editor) => {
                const { anchorNode, anchorOffset, focusNode, focusOffset } =
                    editor.document.getSelection();
                expect(getCursorDirection(anchorNode, anchorOffset, focusNode, focusOffset)).toBe(
                    DIRECTIONS.RIGHT
                );
            },
        });
    });

    test("should identify a backward selection", async () => {
        await testEditor({
            contentBefore: "<p>a]bc[d</p>",
            stepFunction: (editor) => {
                const { anchorNode, anchorOffset, focusNode, focusOffset } =
                    editor.document.getSelection();
                expect(getCursorDirection(anchorNode, anchorOffset, focusNode, focusOffset)).toBe(
                    DIRECTIONS.LEFT
                );
            },
        });
    });

    test("should identify a collapsed selection", async () => {
        await testEditor({
            contentBefore: "<p>ab[]cd</p>",
            stepFunction: (editor) => {
                const { anchorNode, anchorOffset, focusNode, focusOffset } =
                    editor.document.getSelection();
                expect(getCursorDirection(anchorNode, anchorOffset, focusNode, focusOffset)).toBe(
                    false
                );
            },
        });
    });
});

describe("getSelectedNodes", () => {
    test("should return nothing if the range is collapsed", async () => {
        await testEditor({
            contentBefore: "<p>ab[]cd</p>",
            stepFunction: (editor) => {
                const result = editor.shared.getSelectedNodes();
                expect(result).toEqual([]);
            },
            contentAfter: "<p>ab[]cd</p>",
        });
    });

    test("should find that no node is fully selected", async () => {
        await testEditor({
            contentBefore: "<p>ab[c]d</p>",
            stepFunction: (editor) => {
                const result = editor.shared.getSelectedNodes();
                expect(result).toEqual([]);
            },
        });
    });

    test("should find that no node is fully selected, across blocks", async () => {
        await testEditor({
            contentBefore: "<p>ab[cd</p><p>ef]gh</p>",
            stepFunction: (editor) => {
                const result = editor.shared.getSelectedNodes();
                expect(result).toEqual([]);
            },
        });
    });

    test("should find that a text node is fully selected", async () => {
        await testEditor({
            contentBefore: '<p><span class="a">ab</span>[cd]</p>',
            stepFunction: (editor) => {
                const editable = editor.editable;
                const result = editor.shared.getSelectedNodes();
                const cd = editable.firstChild.lastChild;
                expect(result).toEqual([cd]);
            },
        });
    });

    test("should find that a block is fully selected", async () => {
        await testEditor({
            contentBefore: "<p>[ab</p><p>cd</p><p>ef]gh</p>",
            stepFunction: (editor) => {
                const editable = editor.editable;
                const result = editor.shared.getSelectedNodes();
                const ab = editable.firstChild.firstChild;
                const p2 = editable.childNodes[1];
                const cd = p2.firstChild;
                expect(result).toEqual([ab, p2, cd]);
            },
        });
    });

    test("should find all selected nodes in nested range", async () => {
        await testEditor({
            contentBefore:
                '<p><span class="a">ab[</span>cd</p><div><p><span class="b"><b>e</b><i>f]g</i>h</span></p></div>',
            stepFunction: (editor) => {
                const editable = editor.editable;
                const cd = editable.firstChild.lastChild;
                const b = editable.lastChild.firstChild.firstChild.firstChild;
                const e = b.firstChild;
                const result = editor.shared.getSelectedNodes();
                expect(result).toEqual([cd, b, e]);
            },
        });
    });
});
