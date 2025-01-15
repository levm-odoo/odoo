import { Component } from "@odoo/owl";
import { useDraggable } from "@web/core/utils/draggable";
import { useService } from "@web/core/utils/hooks";
import { AddSnippetDialog } from "./add_snippet_dialog/add_snippet_dialog";

// TODO move it in web (copy from web_studio)
function copyElementOnDrag() {
    let element;
    let copy;

    function clone(_element) {
        element = _element;
        copy = element.cloneNode(true);
    }

    function insert() {
        if (element) {
            element.insertAdjacentElement("beforebegin", copy);
        }
    }

    function clean() {
        if (copy) {
            copy.remove();
        }
        copy = null;
        element = null;
    }

    return { clone, insert, clean };
}

export class BlockTab extends Component {
    static template = "html_builder.BlockTab";
    static props = {
        snippetModel: { type: Object },
        installSnippetModule: { type: Function },
    };

    setup() {
        this.dialog = useService("dialog");
        this.orm = useService("orm");
        this.company = useService("company");

        const copyOnDrag = copyElementOnDrag();
        useDraggable({
            ref: this.env.builderRef,
            elements: ".o-website-builder_sidebar .o_draggable",
            enable: () => this.env.editor?.isReady,
            iframeWindow: this.env.editor?.editable.ownerDocument.defaultView,
            onWillStartDrag: ({ element }) => {
                copyOnDrag.clone(element);
            },
            onDragStart: ({ element }) => {
                copyOnDrag.insert();
                const { category, id } = element.dataset;
                const snippet = this.props.snippetModel.getSnippet(category, id);
                this.dropzonePlugin.displayDropZone(snippet);
            },
            onDrag: ({ element }) => {
                this.dropzonePlugin.dragElement(element);
            },
            onDrop: ({ element }) => {
                const { x, y, height, width } = element.getClientRects()[0];
                const position = { x, y, height, width };
                const { category, id } = element.dataset;
                const snippet = this.props.snippetModel.getSnippet(category, id);
                if (category === "snippet_groups") {
                    this.openSnippetDialog(snippet, position);
                    return;
                }
                const addElement = this.dropzonePlugin.getAddElement(position);
                addElement(snippet.content.cloneNode(true));
            },
            onDragEnd: () => {
                copyOnDrag.clean();
            },
        });
    }

    get dropzonePlugin() {
        return this.env.editor.shared.dropzone;
    }

    openSnippetDialog(snippet, position) {
        if (snippet.moduleId) {
            return;
        }
        if (!position) {
            this.dropzonePlugin.displayDropZone(snippet);
        }
        const addElement = this.dropzonePlugin.getAddElement(position);
        this.dialog.add(
            AddSnippetDialog,
            {
                selectedSnippet: snippet,
                snippetModel: this.props.snippetModel,
                selectSnippet: (snippet) => {
                    addElement(snippet.content.cloneNode(true));
                },
                installModule: this.props.installSnippetModule,
            },
            {
                onClose: () => this.dropzonePlugin.clearDropZone(),
            }
        );
    }

    renameCustomInnerContent(ev, snippet) {
        const newName = ev.currentTarget.parentElement.querySelector("input")?.value;
        this.props.snippetModel.renameCustomSnippet(snippet, newName);
    }
}
