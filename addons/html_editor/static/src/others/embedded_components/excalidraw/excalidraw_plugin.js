import { Plugin } from "../../../plugin";
import { _t } from "@web/core/l10n/translation";
import { renderToElement } from "@web/core/utils/render";
import { ExcalidrawDialog } from "./excalidraw_dialog/excalidraw_dialog";

export class ExcalidrawPlugin extends Plugin {
    static name = "excalidraw";
    static dependencies = ["embedded_components", "dom", "selection"];
    static resources = (p) => ({
        powerboxItems: [
            {
                category: "structure",
                name: _t("Drawing Board"),
                priority: 70,
                description: _t("Insert an Excalidraw Board"),
                fontawesome: "fa-pencil-square-o",
                action: () => {
                    p.insertDrawingBoard();
                },
            },
        ],
    });

    insertDrawingBoard() {
        const selection = this.shared.getEditableSelection();
        let restoreSelection = () => {
            this.shared.setSelection(selection);
        };
        this.services.dialog.add(
            ExcalidrawDialog,
            {
                saveLink: (href) => {
                    const templateBlock = renderToElement(
                        "html_editor.EmbeddedExcalidrawBlueprint",
                        {
                            embeddedProps: JSON.stringify({ source: href }),
                        }
                    );
                    this.shared.domInsert(templateBlock);

                    this.dispatch("ADD_STEP");

                    restoreSelection = () => {};
                },
            },
            { onClose: () => restoreSelection() }
        );
    }
}
