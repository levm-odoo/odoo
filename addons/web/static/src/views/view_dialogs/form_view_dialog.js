/** @odoo-module **/

import { Dialog } from "@web/core/dialog/dialog";
import { useChildRef } from "@web/core/utils/hooks";
import { View } from "@web/views/view";

const { Component, onMounted } = owl;

export class FormViewDialog extends Component {
    setup() {
        super.setup();

        this.modalRef = useChildRef();

        const buttonTemplate = this.props.isToMany
            ? "web.FormViewDialog.ToMany.buttons"
            : "web.FormViewDialog.ToOne.buttons";

        this.viewProps = {
            type: "form",
            buttonTemplate,

            context: this.props.context || {},
            display: {
                controlPanel: { "bottom-right": false }, // TODO? remove completely the control panel?
            },
            mode: this.props.mode || "edit",
            resId: this.props.resId || false,
            resModel: this.props.resModel,
            viewId: this.props.viewId || false,
            preventCreate: this.props.preventCreate,
            preventEdit: this.props.preventEdit,
            discardRecord: () => {
                this.props.close();
            },
            saveRecord: async (record, { saveAndNew }) => {
                const saved = await record.save({ stayInEdition: true, noReload: true });
                if (saved) {
                    await this.props.onRecordSaved(record);
                    if (saveAndNew) {
                        const context = Object.assign({}, this.props.context);
                        Object.keys(context).forEach((k) => {
                            if (k.startsWith("default_")) {
                                delete context[k];
                            }
                        });
                        await record.model.load({ resId: null, context });
                    } else {
                        this.props.close();
                    }
                }
            },
        };

        onMounted(() => {
            if (this.modalRef.el.querySelector(".modal-footer").childElementCount > 1) {
                const defaultButton = this.modalRef.el.querySelector(
                    ".modal-footer button.o-default-button"
                );
                if (defaultButton) {
                    defaultButton.classList.add("d-none");
                }
            }
        });
    }
}

FormViewDialog.components = { Dialog, View };
FormViewDialog.props = {
    close: Function,
    resModel: String,

    context: { type: Object, optional: true },
    mode: {
        optional: true,
        validate: (m) => ["edit", "readonly"].includes(m),
    },
    onRecordSaved: { type: Function, optional: true },
    resId: { type: [Number, Boolean], optional: true },
    title: { type: String, optional: true },
    viewId: { type: [Number, Boolean], optional: true },
    preventCreate: { type: Boolean, optional: true },
    preventEdit: { type: Boolean, optional: true },
    isToMany: { type: Boolean, optional: true },
};
FormViewDialog.defaultProps = {
    onRecordSaved: () => {},
    preventCreate: false,
    preventEdit: false,
    isToMany: false,
};
FormViewDialog.template = "web.FormViewDialog";
