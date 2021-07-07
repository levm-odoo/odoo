/* @odoo-module */

import { registry } from "@web/core/registry";
import { XMLParser } from "@web/core/utils/xml";
import { ControlPanel } from "@web/search/control_panel/control_panel";
import { useModel } from "@web/views/helpers/model";
import { useDebugMenu } from "../../core/debug/debug_menu";
import { FormModel } from "./form_model";
import { FormRenderer } from "./form_renderer";

// -----------------------------------------------------------------------------

class FormArchParser extends XMLParser {
    parse(arch, fields) {
        const _fields = new Set();
        _fields.add("display_name");
        const xmlDoc = this.parseXML(arch);
        this.visitXML(xmlDoc, (node) => {
            if (node.tagName === "field") {
                _fields.add(node.getAttribute("name"));
            }
        });
        return { fields: [..._fields], xmlDoc };
    }
}

// -----------------------------------------------------------------------------

class FormView extends owl.Component {
    static type = "form";
    static display_name = "Form";
    static multiRecord = false;
    static template = `web.FormView`;
    static components = { ControlPanel, FormRenderer };

    setup() {
        debugger;
        useDebugMenu("view", { component: this });
        this.archInfo = new FormArchParser().parse(this.props.arch, this.props.fields);
        this.model = useModel(FormModel, {
            resModel: this.props.resModel,
            resId: this.props.resId,
            archInfo: this.archInfo
        });
    }
}

registry.category("views").add("form", FormView);
